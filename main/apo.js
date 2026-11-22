/* =========================================================
   Cat Island – integrasi Equalizer APO (equalizer untuk SEMUA suara Windows)
   Equalizer APO dipasang sendiri oleh pengguna (butuh admin). Cat Island hanya
   menulis config\cat-island.txt, yang di-Include dari config.txt; APO memuat
   ulang file itu otomatis setiap berubah.
   Penyiapan satu kali (tombol "Hubungkan", lewat UAC): buat cat-island.txt,
   beri grup Users izin ubah HANYA pada file itu, tambahkan baris Include.
   ========================================================= */
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { BANDS } = require('./eq');

const FILE = 'cat-island.txt';
const INCLUDE_RX = /^\s*Include:\s*cat-island\.txt\s*$/im;

function run(cmd, args) {
  return new Promise((ok) => execFile(cmd, args, { windowsHide: true }, (err, out) => ok(err ? '' : String(out))));
}

// Folder instalasi: CAT_APO_DIR (khusus uji) → registry → lokasi bawaan
async function findDir() {
  const cands = [];
  if (process.env.CAT_APO_DIR) cands.push(process.env.CAT_APO_DIR);
  const reg = await run('reg.exe', ['query', 'HKLM\\SOFTWARE\\EqualizerAPO', '/v', 'InstallPath']);
  const m = reg.match(/InstallPath\s+REG_SZ\s+(.+)/i);
  if (m) cands.push(m[1].trim());
  cands.push(path.join(process.env.ProgramFiles || 'C:\\Program Files', 'EqualizerAPO'));
  return cands.find((d) => fs.existsSync(path.join(d, 'config', 'config.txt'))) || null;
}

async function status() {
  const dir = await findDir();
  if (!dir) return { installed: false };
  const cfgDir = path.join(dir, 'config');
  let linked = false, writable = false;
  try { linked = INCLUDE_RX.test(fs.readFileSync(path.join(cfgDir, 'config.txt'), 'utf8')); } catch {}
  try { fs.accessSync(path.join(cfgDir, FILE), fs.constants.W_OK); writable = true; } catch {}
  return { installed: true, dir, linked, writable, ready: linked && writable };
}

function render(gains) {
  const pre = -Math.max(0, ...gains) * 0.5;
  const lines = [
    '# Dibuat otomatis oleh Cat Island - ubah lewat Pengaturan > Equalizer suara',
    `Preamp: ${pre.toFixed(1)} dB`,
    ...BANDS.map((f, i) => {
      const g = gains[i].toFixed(1);
      if (i === 0) return `Filter ${i + 1}: ON LSC Fc ${f} Hz Gain ${g} dB`;
      if (i === BANDS.length - 1) return `Filter ${i + 1}: ON HSC Fc ${f} Hz Gain ${g} dB`;
      return `Filter ${i + 1}: ON PK Fc ${f} Hz Gain ${g} dB Q 1.05`;
    }),
  ];
  return lines.join('\r\n') + '\r\n';
}

async function apply(gains) {
  const st = await status();
  if (!st.ready) return st.installed ? 'notlinked' : 'notinstalled';
  try { fs.writeFileSync(path.join(st.dir, 'config', FILE), render(gains), 'utf8'); return 'ok'; }
  catch (e) { return 'err:' + e.code; }
}

function setupScript(cfgDir) {
  const q = (s) => "'" + s.replace(/'/g, "''") + "'";
  return [
    `$f = ${q(path.join(cfgDir, FILE))}; $cfg = ${q(path.join(cfgDir, 'config.txt'))}`,
    "if (!(Test-Path $f)) { Set-Content -Path $f -Value '# Cat Island equalizer' -Encoding ASCII }",
    "icacls $f /grant '*S-1-5-32-545:M' | Out-Null",
    "if (!(Select-String -Path $cfg -Pattern '^\\s*Include:\\s*cat-island\\.txt' -Quiet)) { Add-Content -Path $cfg -Value \"`r`nInclude: cat-island.txt\" -Encoding ASCII }",
  ].join('\n');
}

// Penyiapan satu kali dengan hak admin (Windows menampilkan dialog UAC)
async function setup() {
  const st = await status();
  if (!st.installed) return st;
  const enc = Buffer.from(setupScript(path.join(st.dir, 'config')), 'utf16le').toString('base64');
  await run('powershell.exe', ['-NoProfile', '-Command',
    `Start-Process powershell.exe -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList '-NoProfile','-EncodedCommand','${enc}'`]);
  return status();
}

function register(ipcMain) {
  ipcMain.handle('apo-status', () => status());
  ipcMain.handle('apo-setup', () => setup());
  ipcMain.handle('apo-apply', (_e, gains) => apply(BANDS.map((_, i) => {
    const g = Number(gains?.[i]);
    return Number.isFinite(g) ? Math.max(-12, Math.min(12, g)) : 0;
  })));
}

module.exports = { register, render, status, apply, setupScript };
