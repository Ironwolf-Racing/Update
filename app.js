/* ============================================================
   ESP8266 OTA Admin Panel — app.js
   Storage: GitHub Gist (sync antar device)
   ============================================================ */

/* ── CONFIG — WAJIB DIISI ───────────────────────────────────── */
const ADMIN_PASS    = "esp8266admin";   // Ganti password admin
const GITHUB_TOKEN  = "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";
const GIST_ID       = "03f6296a0551750111e6a2b8ceef4ab9";

/* ── STATE ──────────────────────────────────────────────────── */
let firmwareDB   = [];
let selectedFile = null;
let isSaving     = false;

/* ── DOM REFS ───────────────────────────────────────────────── */
const $ = id => document.getElementById(id);

/* ── INIT ───────────────────────────────────────────────────── */
function init() {
  $("login-btn").addEventListener("click", doLogin);
  $("logout-btn").addEventListener("click", doLogout);
  $("upload-btn").addEventListener("click", uploadFirmware);
  $("file-input").addEventListener("change", () => onFileSelect($("file-input")));
  $("password-input").addEventListener("keydown", e => { if (e.key === "Enter") doLogin(); });

  // Drag & drop
  const zone = $("upload-zone");
  zone.addEventListener("dragover",  e => { e.preventDefault(); zone.classList.add("dragover"); });
  zone.addEventListener("dragleave", ()  => zone.classList.remove("dragover"));
  zone.addEventListener("drop", e => {
    e.preventDefault();
    zone.classList.remove("dragover");
    const f = e.dataTransfer.files;
    if (f.length > 0) { $("file-input").files = f; onFileSelect($("file-input")); }
  });

  if (!GITHUB_TOKEN || !GIST_ID) showConfigWarning();

  if (sessionStorage.getItem("ota_auth") === "1") showAdmin();
}

/* ── CONFIG WARNING ─────────────────────────────────────────── */
function showConfigWarning() {
  const warn = document.createElement("div");
  warn.innerHTML = `
    <div id="config-bar" style="
      position:fixed; top:0; left:0; right:0; z-index:9999;
      background:#1a0a00; border-bottom:2px solid #ffaa00;
      color:#ffaa00; font-family:'Share Tech Mono',monospace;
      font-size:11px; letter-spacing:1px; padding:10px 20px; text-align:center;
    ">
      ⚠ GITHUB_TOKEN dan GIST_ID belum diisi di app.js — data hanya tersimpan lokal.
      <a href="javascript:void(0)" onclick="toggleGuide()" style="color:#ffaa00;margin-left:8px;text-decoration:underline;">Lihat cara setup ▼</a>
    </div>
    <div id="setup-guide" style="display:none; position:fixed; top:41px; left:0; right:0; z-index:9998;
      background:#0f1417; border-bottom:1px solid #1a2a1a; color:#c8e6c8;
      font-family:'Share Tech Mono',monospace; font-size:11px; padding:16px 24px; line-height:2.2;
    ">
      <b style="color:#00ff88">Cara Setup GitHub Gist (cloud storage):</b><br>
      1. Buka <a href="https://gist.github.com" target="_blank" style="color:#00ff88">gist.github.com</a>
         → Buat gist baru → nama file: <code>firmware-db.json</code> → isi: <code>[]</code> → <b>Create secret gist</b><br>
      2. Copy ID dari URL: gist.github.com/username/<b style="color:#ffaa00">INI_GIST_ID</b><br>
      3. Buka <a href="https://github.com/settings/tokens" target="_blank" style="color:#00ff88">github.com/settings/tokens</a>
         → Generate new token (classic) → centang scope <b>gist</b> → Copy token<br>
      4. Buka <b>app.js</b>, isi <code>GITHUB_TOKEN</code> dan <code>GIST_ID</code> di baris paling atas<br>
      5. Commit & push ke GitHub → selesai ✓
    </div>
  `;
  document.body.prepend(warn);
  document.body.style.paddingTop = "41px";
}

function toggleGuide() {
  const g = $("setup-guide");
  const bar = $("config-bar");
  if (!g) return;
  const isOpen = g.style.display !== "none";
  g.style.display = isOpen ? "none" : "block";
  document.body.style.paddingTop = isOpen ? "41px" : (41 + g.offsetHeight) + "px";
}

/* ── GIST DB ────────────────────────────────────────────────── */
async function loadDB() {
  if (!GITHUB_TOKEN || !GIST_ID) {
    const raw = localStorage.getItem("esp8266_firmware_db");
    firmwareDB = raw ? JSON.parse(raw) : [];
    return;
  }
  try {
    showLoadingState(true);
    const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      headers: {
        "Authorization": `token ${GITHUB_TOKEN}`,
        "Accept": "application/vnd.github.v3+json",
        "Cache-Control": "no-cache"
      }
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(`HTTP ${res.status} — ${errBody.message || "unknown"}`);
    }
    const gist = await res.json();

    // Ambil file pertama yang ada (tidak hardcode nama file)
    const files = Object.values(gist.files);
    if (files.length === 0) throw new Error("Gist kosong, tidak ada file");
    const content = files[0].content || "[]";

    // Simpan nama file yang ditemukan untuk saveDB
    window._gistFileName = files[0].filename;

    try {
      firmwareDB = JSON.parse(content);
    } catch {
      // Kalau isi file bukan JSON valid, mulai dari array kosong
      firmwareDB = [];
    }
  } catch (err) {
    console.error("loadDB:", err);
    showToast("⚠ Gagal load Gist: " + err.message, true);
    firmwareDB = [];
  } finally {
    showLoadingState(false);
  }
}

async function saveDB() {
  if (isSaving) return;
  if (!GITHUB_TOKEN || !GIST_ID) {
    localStorage.setItem("esp8266_firmware_db", JSON.stringify(firmwareDB));
    return;
  }
  isSaving = true;
  try {
    const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      method: "PATCH",
      headers: {
        "Authorization": `token ${GITHUB_TOKEN}`,
        "Accept": "application/vnd.github.v3+json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        files: {
          [window._gistFileName || "firmware-db.json"]: {
            content: JSON.stringify(firmwareDB, null, 2)
          }
        }
      })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    console.error("saveDB:", err);
    showToast("⚠ Gagal simpan ke Gist: " + err.message, true);
  } finally {
    isSaving = false;
  }
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
        ⟳ &nbsp;Memuat dari GitHub Gist...
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
    const entry = {
      id:         Date.now().toString(),
      name:       selectedFile.name,
      version:    version,
      notes:      notes,
      size:       selectedFile.size,
      uploadedAt: new Date().toISOString(),
      data:       e.target.result,
      active:     false
    };

    const bar  = $("progress-bar");
    const fill = $("progress-fill");
    bar.style.display = "block";
    let p = 0;
    const iv = setInterval(() => {
      p += Math.random() * 18;
      fill.style.width = Math.min(p, 80) + "%";
    }, 100);

    firmwareDB.push(entry);
    if (firmwareDB.length === 1) firmwareDB[0].active = true;

    await saveDB();

    clearInterval(iv);
    fill.style.width = "100%";
    renderFirmwareList();

    setTimeout(() => {
      bar.style.display = "none";
      fill.style.width  = "0%";
    }, 500);

    resetUploadForm();
    showToast(`✓ ${entry.name} ${version} uploaded & synced!`);
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
  showToast("✓ Firmware aktif diubah & synced");
}

/* ── DELETE ─────────────────────────────────────────────────── */
async function deleteFirmware(id) {
  const fw = firmwareDB.find(f => f.id === id);
  if (fw && fw.active) { showToast("⚠ Tidak bisa hapus firmware aktif!", true); return; }
  firmwareDB = firmwareDB.filter(f => f.id !== id);
  await saveDB();
  renderFirmwareList();
  showToast("✓ Firmware dihapus & synced");
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
  const base = window.location.origin +
    window.location.pathname.replace(/index\.html$/, "").replace(/([^/])$/, "$1/");
  $("api-check-url").textContent = base + "ota-check.html";
  $("api-dl-url").textContent    = base + "ota-download.html?id={firmware_id}";
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
