/* ============================================================
   ESP8266 OTA Admin Panel — JavaScript
   File: app.js
   ============================================================ */

/* ── CONFIG ─────────────────────────────────────────────────── */
const ADMIN_PASS  = "esp8266admin";       // ← GANTI PASSWORD INI
const STORAGE_KEY = "esp8266_firmware_db";

/* ── STATE ──────────────────────────────────────────────────── */
let firmwareDB   = [];
let selectedFile = null;

/* ── DOM REFS ───────────────────────────────────────────────── */
const $ = id => document.getElementById(id);

const loginScreen  = $("login-screen");
const adminPanel   = $("admin-panel");
const passwordInput = $("password-input");
const loginError   = $("login-error");
const uploadZone   = $("upload-zone");
const fileInput    = $("file-input");
const progressBar  = $("progress-bar");
const progressFill = $("progress-fill");
const firmwareList = $("firmware-list");
const toast        = $("toast");

/* ── INIT ───────────────────────────────────────────────────── */
function init() {
  loadDB();
  renderFirmwareList();
  updateAPIUrls();

  // Restore session
  if (sessionStorage.getItem("ota_auth") === "1") showAdmin();

  // Bind events
  $("login-btn").addEventListener("click", doLogin);
  $("logout-btn").addEventListener("click", doLogout);
  $("upload-btn").addEventListener("click", uploadFirmware);
  fileInput.addEventListener("change", () => onFileSelect(fileInput));
  passwordInput.addEventListener("keydown", e => { if (e.key === "Enter") doLogin(); });

  // Drag & drop
  uploadZone.addEventListener("dragover",  e => { e.preventDefault(); uploadZone.classList.add("dragover"); });
  uploadZone.addEventListener("dragleave", ()  => uploadZone.classList.remove("dragover"));
  uploadZone.addEventListener("drop", e => {
    e.preventDefault();
    uploadZone.classList.remove("dragover");
    if (e.dataTransfer.files.length > 0) {
      // Assign dropped files to input then trigger handler
      fileInput.files = e.dataTransfer.files;
      onFileSelect(fileInput);
    }
  });
}

/* ── DATABASE ───────────────────────────────────────────────── */
function loadDB() {
  const raw = localStorage.getItem(STORAGE_KEY);
  firmwareDB = raw ? JSON.parse(raw) : [];
}

function saveDB() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(firmwareDB));
}

/* ── AUTH ───────────────────────────────────────────────────── */
function doLogin() {
  if (passwordInput.value === ADMIN_PASS) {
    sessionStorage.setItem("ota_auth", "1");
    showAdmin();
  } else {
    loginError.classList.add("show");
    passwordInput.value = "";
    setTimeout(() => loginError.classList.remove("show"), 3000);
  }
}

function doLogout() {
  sessionStorage.removeItem("ota_auth");
  adminPanel.style.display   = "none";
  loginScreen.style.display  = "block";
  passwordInput.value        = "";
}

function showAdmin() {
  loginScreen.style.display = "none";
  adminPanel.style.display  = "block";
}

/* ── FILE SELECT ────────────────────────────────────────────── */
function onFileSelect(input) {
  if (!input.files || !input.files[0]) return;
  selectedFile = input.files[0];

  uploadZone.classList.add("has-file");
  $("upload-icon").textContent  = "✅";
  $("upload-title").textContent = selectedFile.name;
  $("upload-sub").textContent   = `${(selectedFile.size / 1024).toFixed(1)} KB — ready to upload`;
}

/* ── UPLOAD ─────────────────────────────────────────────────── */
function uploadFirmware() {
  if (!selectedFile) {
    showToast("⚠ Pilih file firmware dulu!", true);
    return;
  }

  const version = $("version-input").value.trim() || autoVersion();
  const notes   = $("notes-input").value.trim()   || "—";

  const reader = new FileReader();
  reader.onload = function (e) {
    const entry = {
      id:         Date.now().toString(),
      name:       selectedFile.name,
      version:    version,
      notes:      notes,
      size:       selectedFile.size,
      uploadedAt: new Date().toISOString(),
      data:       e.target.result,   // base64 data URL
      active:     false
    };

    // Animate progress bar
    progressBar.style.display = "block";
    let p  = 0;
    const iv = setInterval(() => {
      p += Math.random() * 25;
      progressFill.style.width = Math.min(p, 95) + "%";
    }, 120);

    setTimeout(() => {
      clearInterval(iv);
      progressFill.style.width = "100%";

      firmwareDB.push(entry);
      if (firmwareDB.length === 1) firmwareDB[0].active = true; // auto-activate first upload
      saveDB();
      renderFirmwareList();

      setTimeout(() => {
        progressBar.style.display = "none";
        progressFill.style.width  = "0%";
      }, 500);

      resetUploadForm();
      showToast(`✓ ${entry.name} ${version} uploaded!`);
    }, 1200);
  };

  reader.readAsDataURL(selectedFile);
}

function resetUploadForm() {
  selectedFile = null;
  fileInput.value = "";
  uploadZone.classList.remove("has-file");
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
function activateFirmware(id) {
  firmwareDB.forEach(f => f.active = (f.id === id));
  saveDB();
  renderFirmwareList();
  showToast("✓ Firmware aktif diubah");
}

/* ── DELETE ─────────────────────────────────────────────────── */
function deleteFirmware(id) {
  const fw = firmwareDB.find(f => f.id === id);
  if (fw && fw.active) {
    showToast("⚠ Tidak bisa hapus firmware aktif!", true);
    return;
  }
  firmwareDB = firmwareDB.filter(f => f.id !== id);
  saveDB();
  renderFirmwareList();
  showToast("✓ Firmware dihapus");
}

/* ── RENDER LIST ────────────────────────────────────────────── */
function renderFirmwareList() {
  if (firmwareDB.length === 0) {
    firmwareList.innerHTML = `
      <div class="empty-state">
        NO FIRMWARE UPLOADED YET<br>
        <span style="opacity:.5">Upload .bin file di atas</span>
      </div>`;
    return;
  }

  firmwareList.innerHTML = [...firmwareDB].reverse().map(f => `
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
        ${!f.active ? `<button class="btn-small btn-delete"   onclick="deleteFirmware('${f.id}')">DEL</button>` : ""}
      </div>
    </div>
  `).join("");
}

/* ── API URLS ───────────────────────────────────────────────── */
function updateAPIUrls() {
  const base = window.location.origin +
               window.location.pathname.replace(/index\.html$/, "").replace(/\/$/, "") + "/";
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
  toast.textContent = msg;
  toast.className   = "toast show" + (isError ? " error" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.className = "toast" + (isError ? " error" : "");
  }, 3000);
}

/* ── BOOT ───────────────────────────────────────────────────── */
init();
