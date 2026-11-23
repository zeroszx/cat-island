/* =========================================================
   Noctark – tombol Mode Panggung di pil + pengiriman status ke panggung
   Panggung (stage.html) menerima: video YouTube yang sedang diputar, posisi,
   status putar, cover, judul. Dikirim tiap detik selama panggung terbuka.
   ========================================================= */
let stageTimer = 0, stageArtSent = null;

function stageData(full) {
  let t = 0, playing = false;
  if (inner.on) {
    t = inner.info.currentTime || 0;
    playing = inner.info.playerState === PS.PLAYING || inner.info.playerState === PS.BUFFERING;
  } else if (media.active) {
    playing = media.status === 'Playing';
    t = (media.position || 0) + (playing ? (performance.now() - posAt) / 1000 : 0);
  }
  // Player internal: video panggung baru dimuat SETELAH player bersuara benar-benar berputar;
  // player YouTube baru tidak mau mulai bila sudah ada player YouTube lain yang aktif.
  const innerReady = !inner.on || (inner.info.playerState === PS.PLAYING && (inner.info.currentTime || 0) > 1);
  const pomoInfo = { mode: pomo.mode, running: pomo.running, endAt: pomo.endAt, remaining: pomo.remaining, full: pomo.full,
    label: POMO_LABEL[pomo.mode], color: POMO_COLOR[pomo.mode] };
  const d = { pomo: pomoInfo, rgb: !!settings.vizRgb, vid: innerReady ? curVid() || null : null, t, playing, title: $('title').textContent, artist: $('artist').textContent };
  // cover dikirim setiap gambarnya berubah (cover yang datang belakangan / versi HD), bukan tiap detik:
  // data URL bisa ratusan KB
  const img = art.hd || art.smtc || null;
  if (full || img !== stageArtSent) { stageArtSent = img; d.art = img; }
  return d;
}

let tapAt = 0;
function startTap() {
  Viz.setTap((lv) => {
    const now = performance.now();
    if (now - tapAt < 32) return;
    tapAt = now;
    api.stageLevels(Array.from(lv, (v) => Math.round(v * 1000) / 1000));
  });
}

function openStage() {
  clearInterval(stageTimer);
  startTap();
  api.stageOpen({
    ...stageData(true),
    style: Viz.style, fps: settings.vizFps,
    accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
  });
  stageTimer = setInterval(() => api.stageSync(stageData(false)), 1000);
}

api.onStageClosed(() => { clearInterval(stageTimer); Viz.setTap(null); });
api.onStageCmd((cmd) => {
  if (cmd === 'rgb') { setVizRgb(!settings.vizRgb); api.stageSync(stageData(false)); return; }
  if (inner.on) innerCmd(cmd); else api.mediaCmd(cmd);
});
$('stageBtn').addEventListener('click', openStage);
