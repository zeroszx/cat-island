/* =========================================================
   Cat Island – proses utama Electron
   Jendela transparan (notch/pil/panel), tray, shortcut, bridge media,
   penyimpanan tugas & pengaturan, sembunyi saat layar penuh.
   ========================================================= */
const {
  app, BrowserWindow, ipcMain, screen, Tray, Menu, globalShortcut, Notification, session, desktopCapturer, shell,
} = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const youtube = require('./main/youtube');
const { getAutostart, setAutostart, migrateAutostart, trayIcon } = require('./main/system');

const DEBUG = !!(process.env.CAT_DEBUG || process.env.CAT_DEMO);
const log = (...a) => { if (DEBUG) console.log(...a); };

const WIDTH = 600;                                  // lebar jendela (piksel logis)
const SIZES = { hidden: [240, 46], open: [WIDTH, 84], recs: [WIDTH, 470], tasks: [WIDTH, 560] };
const SHORTCUT = 'Control+Alt+Space';               // buka / tutup pil
const HIDE_SHORTCUT = 'Control+Alt+H';              // sembunyikan widget sepenuhnya
const MEDIA_CMDS = ['toggle', 'pause', 'next', 'prev'];

// Data selalu di %APPDATA%\cat-island, baik dari folder proyek maupun versi terinstal
// (tanpa ini versi terinstal memakai %APPDATA%\Cat Island dan tugas lama tidak terbaca).
app.setPath('userData', path.join(app.getPath('appData'), 'cat-island'));
if (!app.requestSingleInstanceLock()) app.quit();

// Embed YouTube harus bisa autoplay, dan Cat Island TIDAK boleh muncul sebagai sesi
// media Windows (kalau muncul, bridge akan membaca widget ini sendiri).
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling,MediaSessionService');

let win, tray, media;

/* ---------------- penyimpanan (%APPDATA%\cat-island) ---------------- */
const dataDir = app.getPath('userData');
const tasksFile = path.join(dataDir, 'tasks.json');
const settingsFile = path.join(dataDir, 'settings.json');
const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } };
function writeJson(file, data) { fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(file, JSON.stringify(data, null, 2)); }

let settings = { alwaysOnTop: true, autoHide: true, winX: null, winY: null, ...readJson(settingsFile, {}) };
if ((settings.v || 0) < 3) settings = { ...settings, v: 3, alwaysOnTop: true, winX: null, winY: null }; // lebar berubah -> reset posisi
const saveSettings = () => writeJson(settingsFile, settings);

/* ---------------- ukuran & posisi jendela ----------------
   Jendela transparan digambar ulang SELURUHNYA tiap frame animasi, jadi ukurannya
   mengikuti bagian yang terlihat. Posisi disimpan sebagai sisi kiri versi lebar penuh. */
let mode = 'hidden';
const centerX = () => Math.round((screen.getPrimaryDisplay().workAreaSize.width - WIDTH) / 2);
const baseX = () => settings.winX ?? centerX();
const baseY = () => settings.winY ?? 0;
function boundsFor(m, left = baseX(), top = baseY()) {
  const [w, h] = SIZES[m];
  return { x: Math.round(left + (WIDTH - w) / 2), y: top, width: w, height: h };
}
const applyMode = () => win.setBounds(boundsFor(mode));

function keepOnTop() {
  // Windows mencabut status "topmost" saat jendela di-hide, sementara Electron mengira
  // masih aktif sehingga set ulang biasa diabaikan -> matikan dulu lalu nyalakan lagi.
  win.setAlwaysOnTop(false);
  win.setAlwaysOnTop(true, 'floating');
  win.moveTop();
}

/* ---------------- sembunyi penuh: manual atau saat aplikasi layar penuh ---------------- */
let fullscreenApp = false, manualHidden = false;
function applyVisibility() {
  if (!win) return;
  const show = !manualHidden && !(settings.autoFs !== false && fullscreenApp);
  if (show === win.isVisible()) return;
  log('[visibility]', show ? 'tampil' : 'sembunyi', { fullscreenApp, manualHidden });
  if (show) {
    win.showInactive();                     // jangan curi fokus dari video/game
    if (settings.alwaysOnTop) keepOnTop();
  } else win.hide();
  win.webContents.send('win-hidden', !show); // renderer menghentikan animasi & video latar
}
function unhide() { if (manualHidden) { manualHidden = false; applyVisibility(); buildTrayMenu(); } }
function toggleManualHide() { manualHidden = !manualHidden; applyVisibility(); buildTrayMenu(); }
function toggleOpen() { unhide(); win.webContents.send('toggle-open'); }

/* ---------------- jendela ---------------- */
function createWindow() {
  win = new BrowserWindow({
    ...boundsFor('hidden'),
    frame: false, transparent: true, backgroundColor: '#00000000',
    resizable: false, maximizable: false, minimizable: false,
    skipTaskbar: true, hasShadow: false,
    alwaysOnTop: settings.alwaysOnTop,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), backgroundThrottling: false },
  });
  if (settings.alwaysOnTop) win.setAlwaysOnTop(true, 'floating');
  win.setIgnoreMouseEvents(true, { forward: true });   // area kosong tembus klik
  win.loadFile('index.html');
  win.on('blur', () => win.webContents.send('blur'));

  if (DEBUG) win.webContents.on('console-message', (_e, _lvl, msg) => console.log('[renderer]', msg));
  if (process.env.CAT_DEMO) {
    win.webContents.once('did-finish-load', () => setTimeout(() => win.webContents.send('demo', process.env.CAT_DEMO), 1200));
  }
}

/* ---------------- bridge media (bridge/media.ps1) ---------------- */
function startMedia() {
  media = spawn('powershell.exe',
    // di versi terinstal, skrip ada di app.asar.unpacked (PowerShell tak bisa membaca isi arsip asar)
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'bridge', 'media.ps1').replace('app.asar', 'app.asar.unpacked')],
    { windowsHide: true });
  let buf = '';
  media.stdout.on('data', (chunk) => {
    buf += chunk.toString('utf8');
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      if (msg.type === 'fullscreen') { fullscreenApp = !!msg.on; applyVisibility(); }
      else win?.webContents.send('media', msg);
    }
  });
  media.on('exit', () => { if (!app.isQuitting) setTimeout(startMedia, 2000); });   // hidupkan lagi bila mati
}

/* ---------------- IPC ---------------- */
ipcMain.on('media-cmd', (_e, cmd) => {
  log('[media-cmd]', cmd);
  if (MEDIA_CMDS.includes(cmd)) media?.stdin.write(cmd + '\n');
});
// Hanya halaman Google Cloud (panduan API key) yang boleh dibuka di browser
ipcMain.on('open-external', (_e, url) => {
  try {
    const u = new URL(url);
    if (u.protocol === 'https:' && u.hostname === 'console.cloud.google.com') shell.openExternal(u.href);
  } catch {}
});
ipcMain.handle('tasks-load', () => readJson(tasksFile, []));
ipcMain.on('tasks-save', (_e, tasks) => writeJson(tasksFile, tasks));
ipcMain.handle('settings-get', () => settings);
ipcMain.on('settings-set', (_e, patch) => { settings = { ...settings, ...patch }; saveSettings(); applyVisibility(); buildTrayMenu(); });
ipcMain.on('notify', (_e, title, body) => { if (Notification.isSupported()) new Notification({ title, body, silent: true }).show(); });
ipcMain.on('set-ignore', (_e, ignore) => win.setIgnoreMouseEvents(ignore, { forward: true }));
ipcMain.on('focus', () => win.focus());
ipcMain.on('set-mode', (_e, m) => { if (SIZES[m] && m !== mode) { mode = m; applyMode(); } });
youtube.register(ipcMain, () => settings.ytKey, path.join(dataDir, 'yt-cache.json'));

// seret cover untuk memindahkan widget
let dragFrom = null;
ipcMain.on('drag-start', () => { dragFrom = [baseX(), baseY()]; });
ipcMain.on('drag-move', (_e, dx, dy) => {
  if (dragFrom) win.setBounds(boundsFor(mode, dragFrom[0] + Math.round(dx), dragFrom[1] + Math.round(dy)));
});
ipcMain.on('drag-end', (_e, dx, dy) => {
  if (!dragFrom) return;
  settings.winX = dragFrom[0] + Math.round(dx || 0);
  settings.winY = dragFrom[1] + Math.round(dy || 0);
  dragFrom = null; saveSettings(); applyMode();
});

/* ---------------- tray ---------------- */
const keys = (s) => s.replace(/\+/g, ' + ');
function setAndSync(key, value) { settings[key] = value; saveSettings(); win.webContents.send('settings', settings); }

function buildTrayMenu() {
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Cat Island', enabled: false },
    { type: 'separator' },
    { label: `Buka / tutup  (${keys(SHORTCUT)})`, click: toggleOpen },
    { label: `Sembunyikan widget  (${keys(HIDE_SHORTCUT)})`, type: 'checkbox', checked: manualHidden, click: toggleManualHide },
    { label: 'Sembunyi saat layar penuh', type: 'checkbox', checked: settings.autoFs !== false,
      click: (item) => { setAndSync('autoFs', item.checked); applyVisibility(); } },
    { label: 'Sembunyikan otomatis', type: 'checkbox', checked: settings.autoHide,
      click: (item) => setAndSync('autoHide', item.checked) },
    { label: 'Selalu di atas jendela lain', type: 'checkbox', checked: settings.alwaysOnTop,
      click: (item) => { setAndSync('alwaysOnTop', item.checked); win.setAlwaysOnTop(item.checked, 'floating'); } },
    { label: 'Jalankan saat Windows mulai', type: 'checkbox', checked: getAutostart(),
      click: (item) => { setAutostart(item.checked); buildTrayMenu(); } },
    { label: 'Kembalikan ke tengah atas', click: () => { settings.winX = settings.winY = null; saveSettings(); applyMode(); } },
    { label: 'Muat ulang', click: () => win.reload() },
    { type: 'separator' },
    { label: 'Keluar', click: () => app.quit() },
  ]));
}

/* ---------------- start ---------------- */
app.whenReady().then(() => {
  // Halaman file:// tidak punya Referer, padahal player embed YouTube mewajibkannya (error 153).
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['*://*.youtube-nocookie.com/*', '*://*.youtube.com/*', '*://*.googlevideo.com/*'] },
    (details, cb) => {
      if (!details.requestHeaders.Referer) details.requestHeaders.Referer = 'https://cat-island.app/';
      cb({ requestHeaders: details.requestHeaders });
    });
  // Visualizer: audio sistem (loopback) untuk getDisplayMedia tanpa dialog. Video layar wajib
  // diminta tapi langsung dihentikan di renderer; audio hanya dianalisis lokal.
  session.defaultSession.setDisplayMediaRequestHandler((_req, cb) => {
    desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } })
      .then((src) => cb({ video: src[0], audio: 'loopback' }))
      .catch(() => cb({}));
  });

  migrateAutostart();
  createWindow();
  startMedia();
  tray = new Tray(trayIcon());
  tray.setToolTip('Cat Island');
  tray.on('click', () => (manualHidden ? unhide() : win.webContents.send('toggle-open')));
  buildTrayMenu();
  globalShortcut.register(SHORTCUT, () => { toggleOpen(); win.focus(); });
  globalShortcut.register(HIDE_SHORTCUT, toggleManualHide);
});

app.on('second-instance', () => win?.webContents.send('toggle-open'));
app.on('before-quit', () => { app.isQuitting = true; media?.kill(); });
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
