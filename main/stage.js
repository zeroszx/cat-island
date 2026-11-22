/* =========================================================
   Cat Island – Mode Panggung
   Jendela selayar penuh: video (dipotong pas di tengah) dalam bingkai lingkaran,
   visualizer melingkar di sekelilingnya, dan sisa layar diblur.
   Latar blur = tangkapan layar yang diambil tepat sebelum panggung muncul
   (jendela transparan tidak bisa memblur desktop secara langsung).
   Jendela dibuat saat dibuka dan dihancurkan saat ditutup -> 0 biaya saat tidak dipakai.
   ========================================================= */
const path = require('path');
const { BrowserWindow, screen, desktopCapturer } = require('electron');

const STAGE_CMDS = ['toggle', 'next', 'prev'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function register(ipcMain, getWin, root) {
  let stage = null, opening = false;

  async function snapshot(display) {
    const sf = display.scaleFactor || 1;
    const size = { width: Math.round(display.size.width * sf), height: Math.round(display.size.height * sf) };
    try {
      const src = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size });
      const s = src.find((x) => x.display_id === String(display.id)) || src[0];
      return s ? 'data:image/jpeg;base64,' + s.thumbnail.toJPEG(80).toString('base64') : null;
    } catch { return null; }
  }

  async function open(data) {
    const win = getWin();
    if (stage) { stage.focus(); return; }
    if (opening || !win) return;
    opening = true;
    const display = screen.getDisplayMatching(win.getBounds());
    win.setOpacity(0);                      // pil tidak ikut terfoto & tidak menimpa panggung
    await sleep(120);
    const shot = await snapshot(display);

    stage = new BrowserWindow({
      ...display.bounds,
      frame: false, transparent: true, backgroundColor: '#00000000',
      resizable: false, movable: false, minimizable: false, maximizable: false, fullscreen: true,
      skipTaskbar: true, hasShadow: false, show: false, alwaysOnTop: true,
      webPreferences: { preload: path.join(root, 'preload.js'), backgroundThrottling: false },
    });
    stage.setAlwaysOnTop(true, 'screen-saver');
    stage.loadFile(path.join(root, 'stage.html'));
    stage.webContents.once('did-finish-load', () => {
      stage.webContents.send('stage', { type: 'init', shot, ...data });
      stage.show(); stage.focus();
      opening = false;
    });
    stage.on('closed', () => {
      stage = null; opening = false;
      const w = getWin();
      if (w && !w.isDestroyed()) { w.setOpacity(1); w.webContents.send('stage-closed'); }
    });
  }

  ipcMain.on('stage-open', (_e, data) => open(data || {}));
  ipcMain.on('stage-sync', (_e, data) => { if (stage && !stage.isDestroyed()) stage.webContents.send('stage', { type: 'sync', ...data }); });
  ipcMain.on('stage-cmd', (_e, cmd) => { if (STAGE_CMDS.includes(cmd)) getWin()?.webContents.send('stage-cmd', cmd); });
  ipcMain.on('stage-close', () => stage?.close());
}

module.exports = { register };
