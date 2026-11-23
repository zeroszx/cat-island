/* =========================================================
   Noctark – equalizer untuk player internal
   Player internal adalah iframe youtube-nocookie (lintas origin), jadi renderer
   tidak bisa menyentuh <video>-nya. Proses utama menyuntikkan rantai filter
   Web Audio langsung ke frame itu: video → 8 BiquadFilter → preamp → speaker.
   Video latar (mute=1) tidak disentuh; hanya frame dengan mute=0.
   ========================================================= */
const BANDS = [60, 150, 400, 1000, 2400, 6000, 12000, 16000];   // Hz
const LIMIT = 12;                                                  // ±dB

// Dijalankan DI DALAM frame YouTube. Memasang filter sekali per elemen video,
// lalu hanya mengubah gain. Mengembalikan 'ok' | 'novideo' | 'skip'.
const frameScript = (gains, bands) => `(() => {
  const G = ${JSON.stringify(gains)}, F = ${JSON.stringify(bands)};
  const v = document.querySelector('video');
  if (!v) return 'novideo';
  let eq = v.__catEq;
  if (!eq) {
    if (G.every((g) => g === 0)) return 'skip';          // datar: tidak perlu memproses audio
    const ctx = new AudioContext({ latencyHint: 'playback' });
    let node = ctx.createMediaElementSource(v);
    const filters = F.map((f, i) => {
      const b = ctx.createBiquadFilter();
      b.type = i === 0 ? 'lowshelf' : i === F.length - 1 ? 'highshelf' : 'peaking';
      b.frequency.value = f; b.Q.value = 1.05;
      node.connect(b); node = b; return b;
    });
    const pre = ctx.createGain();
    node.connect(pre); pre.connect(ctx.destination);
    eq = v.__catEq = { ctx, filters, pre };
  }
  const t = eq.ctx.currentTime;
  eq.filters.forEach((b, i) => b.gain.setTargetAtTime(G[i], t, 0.04));
  // turunkan volume sedikit saat ada band yang dinaikkan, supaya tidak pecah (clipping)
  eq.pre.gain.setTargetAtTime(Math.pow(10, -Math.max(0, ...G) * 0.5 / 20), t, 0.04);
  if (eq.ctx.state !== 'running') eq.ctx.resume();
  return 'ok';
})()`;

function clean(gains) {
  return BANDS.map((_, i) => {
    const g = Math.round(Number(gains?.[i]) * 2) / 2;
    return Number.isFinite(g) ? Math.max(-LIMIT, Math.min(LIMIT, g)) : 0;
  });
}

function register(ipcMain, getWin) {
  ipcMain.handle('eq-apply', async (_e, gains) => {
    const win = getWin();
    if (!win) return 'nowin';
    const frames = win.webContents.mainFrame.framesInSubtree.filter((f) =>
      /youtube-nocookie\.com\/embed\//.test(f.url) && /[?&]mute=0/.test(f.url));
    if (!frames.length) return 'noplayer';
    const code = frameScript(clean(gains), BANDS);
    const res = await Promise.all(frames.map((f) => f.executeJavaScript(code).catch((e) => 'err:' + e.message)));
    return res.find((r) => r === 'ok') || res[0];
  });
}

module.exports = { register, BANDS };
