/* =========================================================
   Cat Island – tombol Mode Panggung di pil + pengiriman status ke panggung
   Panggung (stage.html) menerima: video YouTube yang sedang diputar, posisi,
   status putar, cover, judul. Dikirim tiap detik selama panggung terbuka.
   ========================================================= */
let stageTimer = 0, stageArtKey = null;

function stageData(full) {
  let t = 0, playing = false;
  if (inner.on) {
    t = inner.info.currentTime || 0;
    playing = inner.info.playerState === PS.PLAYING || inner.info.playerState === PS.BUFFERING;
  } else if (media.active) {
    playing = media.status === 'Playing';
    t = (media.position || 0) + (playing ? (performance.now() - posAt) / 1000 : 0);
  }
  const d = { vid: curVid() || null, t, playing, title: $('title').textContent, artist: $('artist').textContent };
  // cover hanya dikirim bila berubah (data URL bisa ratusan KB)
  if (full || art.key !== stageArtKey) { stageArtKey = art.key; d.art = art.hd || art.smtc || null; }
  return d;
}

function openStage() {
  clearInterval(stageTimer);
  api.stageOpen({
    ...stageData(true),
    style: Viz.style, fps: settings.vizFps,
    accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
  });
  stageTimer = setInterval(() => api.stageSync(stageData(false)), 1000);
}

api.onStageClosed(() => clearInterval(stageTimer));
api.onStageCmd((cmd) => (inner.on ? innerCmd(cmd) : api.mediaCmd(cmd)));
$('stageBtn').addEventListener('click', openStage);
