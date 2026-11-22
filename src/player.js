/* =========================================================
   Cat Island – player internal
   Video YouTube diputar DI Cat Island (dengan suara) saat rekomendasi
   diklik atau ⏭ ditekan pada video YouTube tunggal. Iframe-nya sekaligus
   menjadi latar pil yang diblur. Antrean diisi dari YouTube Mix.
   ========================================================= */
let extArt = null;   // cover terakhir dari sumber luar, untuk dipulihkan saat player berhenti
const inner = {
  on: false, el: null, id: null, cur: null, info: {}, queue: [], history: [],
  since: 0, audioOk: false, forceMute: false, cmd: () => {},
};
const PS = { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3 };   // playerState YouTube

function setPlayingUI(playing) {
  Viz.setPlaying(playing);
  root.classList.toggle('is-playing', playing);
  $('playBtn').classList.toggle('is-playing', playing);
  $('cover').classList.toggle('playing', playing);
}

function innerRender() {
  const st = inner.info.playerState;
  setPlayingUI(st === PS.PLAYING || st === PS.BUFFERING);
  $('controls').classList.remove('disabled');
  $('title').textContent = inner.cur?.title || inner.info.videoData?.title || 'Memuat…';
  $('artist').textContent = (inner.cur?.channel || inner.info.videoData?.author || '') + ' · Cat Island';
  updateRecsHint();
}

async function innerPlay(item, fromHistory = false) {
  if (!item?.id) return;
  if (!inner.on && media.active && media.status === 'Playing') api.mediaCmd('pause'); // jeda browser/Spotify
  if (inner.on && inner.cur && !fromHistory) inner.history.push(inner.cur);
  Object.assign(inner, { on: true, since: Date.now(), cur: item, id: item.id, info: {}, audioOk: false });
  inner.queue = inner.queue.filter((x) => x.id !== item.id);
  syncVideo(); // loop latar 6 detik digantikan player ini

  // tampilan: thumbnail kecil dulu, lalu HD
  art = { key: 'inner:' + item.id, smtc: item.thumb || null, hd: null, vid: item.id };
  applyArt();
  api.ytThumb(item.id).then((img) => { if (img && inner.id === item.id) { art.hd = img; applyArt(); } });
  innerRender();

  const box = $('innerPlayer');
  box.classList.remove('on');
  inner.el?.remove();
  const f = ytEmbed(item.id, 'mute=0');
  box.appendChild(f);
  inner.el = f;
  f.onload = () => {
    inner.cmd = ytCmd(f);
    f.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 2 }), '*');
    inner.cmd('addEventListener', ['onStateChange']);
    inner.cmd('addEventListener', ['onError']);
    inner.cmd('playVideo');
    setTimeout(() => { if (inner.el === f) box.classList.add('on'); }, 1500);
  };

  // antrean dari Mix video ini (untuk ⏭ dan lanjut otomatis)
  const res = await api.ytRecs(item.id);
  if (inner.id === item.id) {
    const seen = new Set([...inner.history.map((x) => x.id), item.id]);
    inner.queue = (res.items || []).filter((x) => !seen.has(x.id));
  }
}

function innerNext() {
  const nx = inner.queue.shift();
  if (nx) innerPlay(nx);
}

function innerCmd(cmd) {
  const st = inner.info.playerState;
  if (cmd === 'toggle') inner.cmd(st === PS.PLAYING || st === PS.BUFFERING ? 'pauseVideo' : 'playVideo');
  else if (cmd === 'next') innerNext();
  else if (cmd === 'prev') {
    // seperti player musik: ulang lagu, kecuali ditekan di 3 detik pertama -> lagu sebelumnya
    if ((inner.info.currentTime || 0) > 3 || !inner.history.length) inner.cmd('seekTo', [0, true]);
    else innerPlay(inner.history.pop(), true);
  }
}

function innerStop() {
  inner.cmd('pauseVideo');
  inner.el?.remove();
  $('innerPlayer').classList.remove('on');
  Object.assign(inner, { on: false, el: null, id: null, cur: null, info: {}, queue: [], history: [], cmd: () => {} });
  // kembalikan tampilan sumber luar
  clearArt();
  if (extArt?.data) { art.key = extArt.key; art.smtc = dataUrl(extArt.data); applyArt(); }
}

window.addEventListener('message', (e) => {
  if (!inner.el || e.source !== inner.el.contentWindow) return;
  let d; try { d = JSON.parse(e.data); } catch { return; }
  if (d.event === 'onError') { innerNext(); return; }       // video melarang embed -> lewati
  if (d.event === 'onStateChange') inner.info.playerState = d.info;
  else if (d.event === 'infoDelivery' || d.event === 'initialDelivery') {
    // perintah baru diterima setelah player siap, dan status bisu bisa terbawa dari
    // video latar -> paksa bersuara saat laporan volume pertama tiba / saat dilaporkan bisu
    if (d.info && (d.info.muted === true || (!inner.audioOk && 'volume' in d.info))) {
      if (inner.forceMute) inner.cmd('mute');
      else { inner.cmd('unMute'); inner.cmd('setVolume', [100]); }
      inner.audioOk = true;
    }
    Object.assign(inner.info, d.info || {});
  } else return;

  // selesai -> lagu berikutnya (cek posisi: player kadang mengirim 0 sesaat di awal)
  const { playerState: ps, currentTime: ct = 0, duration: du = 0 } = inner.info;
  if (ps === PS.ENDED && du > 0 && ct >= du - 1.5) { inner.info.playerState = -1; innerNext(); return; }
  innerRender();
});
