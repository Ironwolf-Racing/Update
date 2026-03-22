/* ============================================================
   ESP8266 OTA Admin Panel — app.js
   Storage: GitHub Contents API (file di repo)
   ============================================================ */

/* ── CONFIG ─────────────────────────────────────────────────── */
const ADMIN_PASS   = "esp8266admin";          // Ganti password admin
const GH_TOKEN     = "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";      // Token dengan scope: repo (bukan gist)
const GH_OWNER     = "Ironwolf-Racing";        // Username GitHub kamu
const GH_REPO      = "Update";        // Nama repo GitHub Pages kamu
const GH_BRANCH    = "main";                   // Branch repo (main atau master)
const DB_FILE      = "firmware-db.json";       // Nama file database di repo

/* ── STATE ──────────────────────────────────────────────────── */
let firmwareDB   = [];
let selectedFile = null;
let isSaving     = false;
let dbFileSHA    = null;   // SHA file diperlukan GitHub API untuk update

/* ── DOM ────────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);

/* ── INIT ───────────────────────────────────────────────────── */
function init() {
  $("login-btn").addEventListener("click", doLogin);
  $("logout-btn").addEventListener("click", doLogout);
  $("upload-btn").addEventListener("click", uploadFirmware);
  $("file-input").addEventListener("change", () => onFileSelect($("file-input")));
  $("password-input").addEventListener("keydown", e => { if (e.key === "Enter") doLogin(); });

  const zone = $("upload-zone");
  zone.addEventListener("dragover",  e => { e.preventDefault(); zone.classList.add("dragover"); });
  zone.addEventListener("dragleave", ()  => zone.classList.remove("dragover"));
  zone.addEventListener("drop", e => {
    e.preventDefault();
    zone.classList.remove("dragover");
    const f = e.dataTransfer.files;
    if (f.length > 0) { $("file-input").files = f; onFileSelect($("file-input")); }
  });

  if (sessionStorage.getItem("ota_auth") === "1") showAdmin();
}

/* ── GITHUB CONTENTS API ────────────────────────────────────── */
const GH_API = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents`;

function ghHeaders() {
  return {
    "Authorization": `token ${GH_TOKEN}`,
    "Accept": "application/vnd.github.v3+json",
    "Content-Type": "application/json"
  };
}

/* Load firmware-db.json dari repo */
async function loadDB() {
  try {
    showLoadingState(true);
    const res = await fetch(`${GH_API}/${DB_FILE}?ref=${GH_BRANCH}&t=${Date.now()}`, {
      headers: ghHeaders()
    });

    if (res.status === 404) {
      // File belum ada di repo → mulai kosong, akan dibuat saat pertama save
      firmwareDB = [];
      dbFileSHA  = null;
      return;
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`HTTP ${res.status}: ${err.message || "unknown"}`);
    }

    const data    = await res.json();
    dbFileSHA     = data.sha;
    const decoded = atob(data.content.replace(/\n/g, ""));
    firmwareDB    = JSON.parse(decoded);

  } catch (err) {
    console.error("loadDB:", err);
    showToast("⚠ Gagal load: " + err.message, true);
    firmwareDB = [];
  } finally {
    showLoadingState(false);
  }
}

/* Simpan firmware-db.json ke repo (create atau update) */
async function saveDB() {
  if (isSaving) return;
  isSaving = true;

  try {
    // Buat salinan tanpa field `data` (base64 binary) biar file JSON tidak terlalu besar
    const dbToSave = firmwareDB.map(f => {
      const { data, ...rest } = f;
      return rest;
    });

    const content = btoa(unescape(encodeURIComponent(JSON.stringify(dbToSave, null, 2))));

    const body = {
      message: `OTA: update firmware-db.json`,
      content: content,
      branch:  GH_BRANCH
    };
    if (dbFileSHA) body.sha = dbFileSHA;  // wajib ada untuk update

    const res = await fetch(`${GH_API}/${DB_FILE}`, {
      method:  "PUT",
      headers: ghHeaders(),
      body:    JSON.stringify(body)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`HTTP ${res.status}: ${err.message || "unknown"}`);
    }

    const result = await res.json();
    dbFileSHA = result.content.sha;  // update SHA untuk request berikutnya

  } catch (err) {
    console.error("saveDB:", err);
    showToast("⚠ Gagal simpan: " + err.message, true);
  } finally {
    isSaving = false;
  }
}

/* Upload file .bin ke folder firmware/ di repo */
async function uploadBinToRepo(filename, base64DataUrl) {
  // base64DataUrl format: "data:application/octet-stream;base64,XXXX"
  const base64 = base64DataUrl.split(",")[1];
  const path   = `firmware/${filename}`;

  // Cek apakah file sudah ada (butuh SHA untuk overwrite)
  let existingSHA = null;
  try {
    const check = await fetch(`${GH_API}/${path}?ref=${GH_BRANCH}`, { headers: ghHeaders() });
    if (check.ok) {
      const d = await check.json();
      existingSHA = d.sha;
    }
  } catch (_) {}

  const body = {
    message: `OTA: upload firmware ${filename}`,
    content: base64,
    branch:  GH_BRANCH
  };
  if (existingSHA) body.sha = existingSHA;

  const res = await fetch(`${GH_API}/${path}`, {
    method:  "PUT",
    headers: ghHeaders(),
    body:    JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Upload .bin gagal HTTP ${res.status}: ${err.message || ""}`);
  }

  // Return raw URL yang bisa diakses ESP8266
  return `https://raw.githubusercontent.com/${GH_OWNER}/${GH_REPO}/${GH_BRANCH}/${path}`;
}

/* ── AUTH ───────────────────────────────────────────────────── */
function doLogin() {
  const input = $("password-input");
  if (input.value === ADMIN_PASS) {
    sessionStorage.setItem("ota_auth", "1");
    showAdmin();
  } else {
    $("login-error").classList.add("show");
    input.value = "";
    setTimeout(() => $("login-error").classList.remove("show"), 3000);
  }
}

function doLogout() {
  sessionStorage.removeItem("ota_auth");
  $("admin-panel").style.display  = "none";
  $("login-screen").style.display = "block";
  $("password-input").value = "";
}

async function showAdmin() {
  $("login-screen").style.display = "none";
  $("admin-panel").style.display  = "block";
  await loadDB();
  renderFirmwareList();
  updateAPIUrls();
}

/* ── LOADING STATE ──────────────────────────────────────────── */
function showLoadingState(on) {
  if (on) {
    $("firmware-list").innerHTML = `
      <div class="empty-state" style="color:#00aa55;letter-spacing:2px;">
        ⟳ &nbsp;Memuat dari GitHub...
      </div>`;
  }
}

/* ── FILE SELECT ────────────────────────────────────────────── */
function onFileSelect(input) {
  if (!input.files || !input.files[0]) return;
  selectedFile = input.files[0];
  $("upload-zone").classList.add("has-file");
  $("upload-icon").textContent  = "✅";
  $("upload-title").textContent = selectedFile.name;
  $("upload-sub").textContent   = `${(selectedFile.size / 1024).toFixed(1)} KB — ready to upload`;
}

/* ── UPLOAD ─────────────────────────────────────────────────── */
function uploadFirmware() {
  if (!selectedFile) { showToast("⚠ Pilih file firmware dulu!", true); return; }

  const version = $("version-input").value.trim() || autoVersion();
  const notes   = $("notes-input").value.trim()   || "—";

  const reader = new FileReader();
  reader.onload = async function (e) {
    const bar  = $("progress-bar");
    const fill = $("progress-fill");
    bar.style.display = "block";

    // Progress animasi
    let p = 0;
    const iv = setInterval(() => {
      p += Math.random() * 12;
      fill.style.width = Math.min(p, 70) + "%";
    }, 150);

    try {
      // 1. Upload file .bin ke repo
      showToast("⬆ Uploading .bin ke GitHub...");
      const downloadUrl = await uploadBinToRepo(selectedFile.name, e.target.result);

      fill.style.width = "85%";

      // 2. Simpan metadata ke firmware-db.json
      const entry = {
        id:          Date.now().toString(),
        name:        selectedFile.name,
        version:     version,
        notes:       notes,
        size:        selectedFile.size,
        uploadedAt:  new Date().toISOString(),
        downloadUrl: downloadUrl,   // URL raw GitHub — langsung bisa diakses ESP8266
        active:      false
      };

      firmwareDB.push(entry);
      if (firmwareDB.length === 1) firmwareDB[0].active = true;

      await saveDB();

      clearInterval(iv);
      fill.style.width = "100%";
      renderFirmwareList();

      setTimeout(() => { bar.style.display = "none"; fill.style.width = "0%"; }, 600);
      resetUploadForm();
      showToast(`✓ ${entry.name} ${version} berhasil diupload!`);

    } catch (err) {
      clearInterval(iv);
      bar.style.display = "none";
      fill.style.width  = "0%";
      showToast("⚠ Upload gagal: " + err.message, true);
    }
  };
  reader.readAsDataURL(selectedFile);
}

function resetUploadForm() {
  selectedFile = null;
  $("file-input").value         = "";
  $("upload-zone").classList.remove("has-file");
  $("upload-icon").textContent  = "📦";
  $("upload-title").textContent = "DROP FIRMWARE FILE HERE";
  $("upload-sub").textContent   = "Accepts .bin files — ESP8266 compiled firmware";
  $("version-input").value      = "";
  $("notes-input").value        = "";
}

function autoVersion() {
  const versions = firmwareDB.map(f => f.version).filter(v => v.startsWith("v"));
  if (versions.length === 0) return "v1.0.0";
  const parts = versions[versions.length - 1].replace("v", "").split(".");
  parts[2] = parseInt(parts[2] || 0) + 1;
  return "v" + parts.join(".");
}

/* ── ACTIVATE ───────────────────────────────────────────────── */
async function activateFirmware(id) {
  firmwareDB.forEach(f => f.active = (f.id === id));
  await saveDB();
  renderFirmwareList();
  showToast("✓ Firmware aktif diubah");
}

/* ── DELETE ─────────────────────────────────────────────────── */
async function deleteFirmware(id) {
  const fw = firmwareDB.find(f => f.id === id);
  if (fw && fw.active) { showToast("⚠ Tidak bisa hapus firmware aktif!", true); return; }
  firmwareDB = firmwareDB.filter(f => f.id !== id);
  await saveDB();
  renderFirmwareList();
  showToast("✓ Firmware dihapus");
}

/* ── RENDER LIST ────────────────────────────────────────────── */
function renderFirmwareList() {
  const list = $("firmware-list");
  if (firmwareDB.length === 0) {
    list.innerHTML = `<div class="empty-state">
      NO FIRMWARE UPLOADED YET<br>
      <span style="opacity:.5">Upload .bin file di atas</span>
    </div>`;
    return;
  }
  list.innerHTML = [...firmwareDB].reverse().map(f => `
    <div class="firmware-item ${f.active ? "active" : ""}">
      <div class="fw-info">
        <div class="fw-name">📄 ${f.name} <span>${f.version}</span></div>
        <div class="fw-meta">${formatDate(f.uploadedAt)} · ${(f.size / 1024).toFixed(1)} KB · ${f.notes}</div>
      </div>
      <span class="fw-badge ${f.active ? "badge-active" : "badge-inactive"}">
        ${f.active ? "● ACTIVE" : "INACTIVE"}
      </span>
      <div class="fw-actions">
        ${!f.active ? `<button class="btn-small btn-activate" onclick="activateFirmware('${f.id}')">ACTIVATE</button>` : ""}
        ${!f.active ? `<button class="btn-small btn-delete" onclick="deleteFirmware('${f.id}')">DEL</button>` : ""}
      </div>
    </div>
  `).join("");
}

/* ── API URLS ───────────────────────────────────────────────── */
function updateAPIUrls() {
  // ota-check.html baca langsung dari raw GitHub (bukan GitHub Pages)
  // supaya ESP8266 dapat data terbaru tanpa cache
  const rawBase = `https://raw.githubusercontent.com/${GH_OWNER}/${GH_REPO}/${GH_BRANCH}`;
  $("api-check-url").textContent = rawBase + "/ota-check.json";
  $("api-dl-url").textContent    = rawBase + "/firmware/{nama-file.bin}";
}

/* ── UTILS ──────────────────────────────────────────────────── */
function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("id-ID") + " " +
         d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

let toastTimer = null;
function showToast(msg, isError = false) {
  const t = $("toast");
  t.textContent = msg;
  t.className   = "toast show" + (isError ? " error" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = "toast" + (isError ? " error" : ""); }, 3500);
}

/* ── BOOT ───────────────────────────────────────────────────── */
init();
