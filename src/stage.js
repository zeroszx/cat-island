/* =========================================================
   Cat Island – halaman Mode Panggung (stage.html)
   Video ditampilkan TANPA suara dan diselaraskan dengan posisi lagu yang
   sedang diputar (browser/Spotify/player Cat Island) -> suara tetap dari sumbernya.
   Data datang dari widget setiap detik (lihat stage-link.js).
   ========================================================= */
const api = window.island;
const $ = (id) => document.getElementById(id);

const ring = { canvas: $('ring'), kind: 'circ', inner: 200, visible: () => true };
Viz.add(ring);
const layout = () => { ring.inner = $('disc').clientWidth / 2 + 6; };
addEventListener('resize', layout);

/* ---------------- video YouTube (bisu, dipotong tengah oleh CSS) ---------------- */
let vid = null, frame = null, info = {}, cmd = () => {}, playingSince = 0;
function embed(id, t) {
  const box = $('vid');
  box.classList.remove('on');
  box.innerHTML = '';
  frame = null; info = {}; cmd = () => {}; playingSince = 0;
  if (!id) return;
  const f = document.createElement('iframe');
  f.allow = 'autoplay; encrypted-media';
  f.tabIndex = -1;
  f.src = `https://www.youtube-nocookie.com/embed/${id}?controls=0&disablekb=1&fs=0&iv_load_policy=3`
    + `&modestbranding=1&playsinline=1&rel=0&enablejsapi=1&autoplay=1&mute=1&start=${Math.max(0, Math.floor(t || 0))}`;
  box.appendChild(f);
  frame = f;
  f.onload = () => {
    cmd = (func, args = []) => f.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
    f.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 3 }), '*');
    cmd('mute');
  };
}

addEventListener('message', (e) => {
  if (!frame || e.source !== frame.contentWindow) return;
  let d; try { d = JSON.parse(e.data); } catch { return; }
  if (d.event === 'onStateChange') info.playerState = d.info;
  else if (d.event === 'infoDelivery' && d.info) {
    if (!info.ready) { info.ready = true; noCaptions(); }
    Object.assign(info, d.info);
    if (d.info.muted === false) cmd('mute');                      // jangan sampai suaranya dobel
  } else if (d.event === 'onError') { $('vid').classList.remove('on'); }   // video dilarang di-embed -> cover saja
});

const noCaptions = () => { cmd('unloadModule', ['captions']); cmd('unloadModule', ['cc']); };

// Video baru ditampilkan setelah berputar ±2,5 dtk (judul/overlay awal YouTube sudah hilang)
// dan disembunyikan saat jeda (YouTube menampilkan "More videos") -> cover yang terlihat.
setInterval(() => {
  const ps = info.playerState, now = Date.now();
  if (ps === 1) { if (!playingSince) { playingSince = now; noCaptions(); } }
  else if (ps !== 3) playingSince = 0;
  $('vid').classList.toggle('on', !!frame && !!playingSince && now - playingSince > 2500);
}, 250);

/* ---------------- penerapan status dari widget ---------------- */
function apply(s) {
  if (s.art) $('art').src = s.art;
  if ('title' in s) $('title').textContent = s.title || '';
  if ('artist' in s) $('artist').textContent = (s.artist || '').replace(/\s*·\s*Cat Island$/, '');
  Viz.setPlaying(!!s.playing);
  document.body.classList.toggle('paused', !s.playing);

  if ((s.vid || null) !== vid) { vid = s.vid || null; embed(vid, s.t); return; }
  if (!frame) return;
  // selaraskan: lompat bila selisih > 2,5 dtk, ikuti putar/jeda sumber
  const ct = info.currentTime;
  if (typeof ct === 'number' && typeof s.t === 'number' && Math.abs(ct - s.t) > 2.5) cmd('seekTo', [s.t, true]);
  const ps = info.playerState;
  if (s.playing && ps !== 1 && ps !== 3) cmd('playVideo');
  else if (!s.playing && ps === 1) cmd('pauseVideo');
}

api.onStage((m) => {
  if (m.type !== 'init') { apply(m); return; }
  if (m.shot) $('bg').style.backgroundImage = `url("${m.shot}")`;
  if (m.accent) document.documentElement.style.setProperty('--accent', m.accent);
  Viz.setStyle(Viz.CIRCULAR.has(m.style) ? m.style : 'radial');
  Viz.setFps(m.fps === 60 ? 60 : 30);
  layout();
  apply(m);
  requestAnimationFrame(() => document.body.classList.add('on'));
  Viz.initAudio();
});

/* ---------------- kontrol ---------------- */
let closing = false;
function close() {
  if (closing) return;
  closing = true;
  document.body.classList.remove('on');
  setTimeout(() => api.stageClose(), 420);
}
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') close();
  else if (e.key === ' ') { e.preventDefault(); api.stageCmd('toggle'); }
  else if (e.key === 'ArrowRight') api.stageCmd('next');
  else if (e.key === 'ArrowLeft') api.stageCmd('prev');
});
document.addEventListener('click', (e) => {
  if (e.target.id === 'shield') api.stageCmd('toggle');
  else if (!e.target.closest('#disc')) close();
});
