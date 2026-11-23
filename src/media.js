/* =========================================================
   Noctark – media dari Windows (Spotify, browser, dll.)
   Menerima pesan bridge/media.ps1:
     art       -> cover dari Windows
     state     -> judul, artis, status, posisi
     need-next -> ⏭ ditekan pada video YouTube tunggal (tanpa "next" bawaan)
   ========================================================= */
let media = { active: false };
let posAt = 0;   // performance.now() saat posisi terakhir diterima

function onArt(msg) {
  extArt = { key: msg.key, data: msg.data };
  if (inner.on) return;
  resetArt(msg.key);
  art.smtc = msg.data ? dataUrl(msg.data) : null;
  applyArt();
  if (media.active && media.key === msg.key && art.smtc) ytLookup(media);   // cocokkan ulang dengan thumbnail ini
}

function onState(msg) {
  media = msg; posAt = performance.now();
  if (inner.on) {
    // pengguna memutar lagi dari browser/Spotify -> player internal menyerahkan kendali
    if (msg.active && msg.status === 'Playing' && Date.now() - inner.since > 5000) innerStop();
    else return;
  }
  if (msg.active) { resetArt(msg.key); ytLookup(msg); }
  syncVideo();
  setPlayingUI(msg.active && msg.status === 'Playing');
  $('controls').classList.toggle('disabled', !msg.active);
  if (msg.active && msg.title) {
    $('title').textContent = msg.title;
    $('artist').textContent = msg.artist || msg.album || '';
  } else {
    $('title').textContent = 'Spotify belum diputar';
    $('artist').textContent = 'Buka Spotify dan putar lagu';
    clearArt();
    $('fill').style.width = '0';
  }
  updateRecsHint();
}

async function onNeedNext() {
  if (!isYouTube()) return;
  playRec((await loadRecs())[0]);
}

api.onMedia((msg) => {
  if (msg.type === 'art') onArt(msg);
  else if (msg.type === 'state') onState(msg);
  else if (msg.type === 'need-next') onNeedNext();
});

// progress bar: 1×/detik, posisi diperkirakan di antara laporan bridge
setInterval(() => {
  let t, d;
  if (inner.on) ({ currentTime: t, duration: d } = inner.info);
  else if (media.active) {
    t = media.position + (media.status === 'Playing' ? (performance.now() - posAt) / 1000 : 0);
    d = media.duration;
  }
  if (d) $('fill').style.width = Math.min(100, (t / d) * 100) + '%';
}, 1000);

document.querySelectorAll('.controls button[data-cmd]').forEach((b) =>
  b.addEventListener('click', () => (inner.on ? innerCmd(b.dataset.cmd) : api.mediaCmd(b.dataset.cmd))));
