/* =========================================================
   Cat Island – integrasi Windows (proses utama)
   - autostart lewat HKCU\...\Run
       versi terinstal  -> "Cat Island.exe"
       dari folder kode -> launcher .vbs (tanpa jendela konsol)
   - ikon tray dibuat dari bitmap, tanpa file gambar
   ========================================================= */
const { app, nativeImage } = require('electron');
const path = require('path');
const { execFileSync } = require('child_process');

const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const RUN_NAME = 'CatIsland';
const startCommand = () => (app.isPackaged
  ? `"${process.execPath}"`
  : `wscript.exe "${path.join(__dirname, '..', 'Jalankan Cat Island.vbs')}"`);

function readRun() {
  try {
    const out = execFileSync('reg', ['query', RUN_KEY, '/v', RUN_NAME], { stdio: 'pipe' }).toString();
    return out.split(/REG_SZ\s+/)[1]?.trim() || null;
  } catch { return null; }
}

const getAutostart = () => readRun() === startCommand();

function setAutostart(on) {
  try {
    if (on) execFileSync('reg', ['add', RUN_KEY, '/v', RUN_NAME, '/t', 'REG_SZ', '/d', startCommand(), '/f'], { stdio: 'pipe' });
    else execFileSync('reg', ['delete', RUN_KEY, '/v', RUN_NAME, '/f'], { stdio: 'pipe' });
  } catch {}
}

// Versi terinstal: bila autostart sudah aktif tapi masih menunjuk launcher lama (.vbs),
// alihkan ke .exe ini agar Windows menjalankan versi terinstal.
function migrateAutostart() {
  const cur = readRun();
  if (app.isPackaged && cur && cur !== startCommand()) setAutostart(true);
}

// dua "mata kucing" emas di atas lingkaran gelap (BGRA), dipakai untuk tray & ikon aplikasi
function catIcon(s = 32) {
  const buf = Buffer.alloc(s * s * 4), k = s / 32;
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const i = (y * s + x) * 4, px = (x + 0.5) / k - 0.5, py = (y + 0.5) / k - 0.5;
    const d = Math.hypot(px - 15.5, py - 15.5);
    let r = 18, g = 18, b = 18;
    const a = d < 15 ? 255 : d < 16 ? Math.round(255 * (16 - d)) : 0;
    for (const cx of [10, 21.5]) {
      if (Math.abs(Math.hypot(px - cx, py - 15) - 4.5) < 1.4 && py > 13) { r = 0xf2; g = 0xcf; b = 0x7f; }
    }
    buf[i] = b; buf[i + 1] = g; buf[i + 2] = r; buf[i + 3] = a;
  }
  return nativeImage.createFromBitmap(buf, { width: s, height: s });
}
const trayIcon = () => catIcon(32).resize({ width: 16, height: 16 });

module.exports = { getAutostart, setAutostart, migrateAutostart, trayIcon, catIcon };
