/* Membuat build/icon.ico (256/64/48/32/16 px) — dua mata kucing bulan sabit emas
   di atas lingkaran gelap, sama seperti di widget. Digambar di canvas (Electron):
     .\node_modules\electron\dist\electron.exe build\make-icon.js */
const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

const DRAW = (size) => `(() => {
  const c = document.createElement('canvas'); c.width = c.height = ${size};
  const g = c.getContext('2d'), s = ${size} / 256;
  g.scale(s, s);
  // lingkaran gelap dengan sedikit gradasi + bingkai emas tipis
  const bg = g.createRadialGradient(110, 90, 20, 128, 128, 128);
  bg.addColorStop(0, '#2a2723'); bg.addColorStop(1, '#0c0c0d');
  g.fillStyle = bg; g.beginPath(); g.arc(128, 128, 122, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(242,207,127,.35)'; g.lineWidth = 5; g.stroke();
  // mata: busur bulan sabit, celah di kanan bawah
  g.strokeStyle = '#f2cf7f'; g.lineCap = 'round'; g.lineWidth = ${size <= 32 ? 22 : 17};
  g.shadowColor = 'rgba(242,207,127,.45)'; g.shadowBlur = ${size <= 32 ? 0 : 10};
  for (const [x, y] of [[86, 138], [170, 122]]) {
    g.beginPath(); g.arc(x, y, 30, Math.PI * 0.42, Math.PI * 2.1); g.stroke();
  }
  return c.toDataURL('image/png');
})()`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false });
  await win.loadURL('data:text/html,<body></body>');
  const sizes = [256, 64, 48, 32, 16];
  const pngs = [];
  for (const s of sizes) pngs.push(nativeImage.createFromDataURL(await win.webContents.executeJavaScript(DRAW(s))).toPNG());

  // format ICO: header 6 byte + entri 16 byte per gambar + data PNG
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
  let offset = 6 + 16 * sizes.length;
  const entries = sizes.map((s, i) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(s >= 256 ? 0 : s, 0); e.writeUInt8(s >= 256 ? 0 : s, 1);
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
    e.writeUInt32LE(pngs[i].length, 8); e.writeUInt32LE(offset, 12);
    offset += pngs[i].length;
    return e;
  });
  fs.writeFileSync(path.join(__dirname, 'icon.ico'), Buffer.concat([header, ...entries, ...pngs]));
  fs.writeFileSync(path.join(__dirname, 'icon-256.png'), pngs[0]);
  fs.writeFileSync(path.join(__dirname, 'icon-32.png'), pngs[3]);
  console.log('icon.ico dibuat');
  app.quit();
});
