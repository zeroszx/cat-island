/* =========================================================
   Noctark – halaman Mode Panggung (stage.html)
   Video ditampilkan TANPA suara dan diselaraskan dengan posisi lagu yang
   sedang diputar (browser/Spotify/player Noctark) -> suara tetap dari sumbernya.
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
  console.log('[stage] embed', id, 't=', Math.round(t || 0));
  if (!id) return;
  const f = document.createElement('iframe');
  f.allow = 'autoplay; encrypted-media';
  f.tabIndex = -1;
  // Sengaja www.youtube.com, BUKAN youtube-nocookie: YouTube hanya membiarkan satu player aktif
  // per origin. Player bersuara Noctark memakai youtube-nocookie; bila panggung memakai origin
  // yang sama, player bersuara dijeda/macet (lagu dari ⏭/← tidak terputar).
  f.src = `https://www.youtube.com/embed/${id}?controls=0&disablekb=1&fs=0&iv_load_policy=3`
    + `&modestbranding=1&playsinline=1&rel=0&enablejsapi=1&autoplay=1&mute=1&start=${Math.max(0, Math.floor(t || 0))}`;
  box.appendChild(f);
  frame = f;
  fitVideo(id);
  f.onload = () => {
    cmd = (func, args = []) => f.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
    f.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 3 }), '*');
    cmd('mute');
  };
}

addEventListener('message', (e) => {
  if (!frame || e.source !== frame.contentWindow) return;
  let d; try { d = JSON.parse(e.data); } catch { return; }
  if (d.event === 'onStateChange') { info.playerState = d.info; console.log('[stage] state', d.info); }
  else if (d.event === 'infoDelivery' && d.info) {
    if (!info.ready) { info.ready = true; noCaptions(); }
    Object.assign(info, d.info);
    if (d.info.muted === false) cmd('mute');                      // jangan sampai suaranya dobel
  } else if (d.event === 'onError') { console.log('[stage] error', d.info); $('vid').classList.remove('on'); }   // video dilarang di-embed -> cover saja
});

const noCaptions = () => {
  cmd('setOption', ['captions', 'track', {}]);   // matikan subtitle/lirik CC
  cmd('unloadModule', ['captions']); cmd('unloadModule', ['cc']);
};

/* ---------------- ukuran video di lingkaran ----------------
   1) iframe dibuat dengan rasio bingkai asli video (API) -> player tidak menambah bar.
   2) Black bar yang tertanam di file video (mis. film 2.39:1 dalam bingkai 16:9) dideteksi
      dari cuplikan frame asli (hq1-3.jpg), lalu video diperbesar secukupnya sampai bar keluar dari lingkaran.
   Selalu "cover": lingkaran penuh terisi video, titik tengah video = titik tengah lingkaran. */
function contentAspect(src) {
  return new Promise((ok) => {
    const img = new Image();
    img.onload = () => {
      const W = 160, Hh = Math.max(1, Math.round((img.height / img.width) * W));
      const c = document.createElement('canvas'); c.width = W; c.height = Hh;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0, W, Hh);
      const px = g.getImageData(0, 0, W, Hh).data;
      const dark = (x, y) => { const i = (y * W + x) * 4; return px[i] + px[i + 1] + px[i + 2] < 54; };
      const rowDark = (y) => { let n = 0; for (let x = 0; x < W; x++) n += dark(x, y); return n / W > 0.97; };
      const colDark = (x) => { let n = 0; for (let y = 0; y < Hh; y++) n += dark(x, y); return n / Hh > 0.97; };
      let t = 0, b = 0, l = 0, r = 0;
      while (t < Hh / 2 && rowDark(t)) t++;
      while (b < Hh / 2 && rowDark(Hh - 1 - b)) b++;
      while (l < W / 2 && colDark(l)) l++;
      while (r < W / 2 && colDark(W - 1 - r)) r++;
      // bar asli selalu simetris; adegan gelap di satu sisi bukan bar
      const sym = (a, z, size) => (Math.min(a, z) >= size * 0.03 && Math.abs(a - z) <= size * 0.03 ? Math.min(a, z) : 0);
      const tb = sym(t, b, Hh), lr = sym(l, r, W);
      ok((W - 2 * lr) / (Hh - 2 * tb));
    };
    img.onerror = () => ok(null);
    img.src = src;
  });
}

let fitFor = null;
async function fitVideo(id) {
  fitFor = id;
  const box = $('vid');
  box.style.cssText = '';                       // bawaan CSS (16:9) sambil menunggu
  const [fa0, frames] = await Promise.all([api.ytAspect(id).catch(() => null), api.ytFrames(id).catch(() => [])]);
  if (fitFor !== id) return;
  const fa = fa0 || 16 / 9;                     // rasio bingkai video
  // ukuran iframe (relatif terhadap sisi lingkaran = 1) yang menutupi lingkaran
  const w = fa >= 1 ? fa : 1, h = fa >= 1 ? 1 : 1 / fa;
  // isi gambar sebenarnya di dalam bingkai (tanpa black bar tertanam)
  // nilai tengah dari cuplikan: satu frame gelap/terang yang menyimpang tidak menentukan hasil
  const found = (await Promise.all((frames || []).map(contentAspect))).filter((x) => x && x >= 0.3 && x <= 4).sort((a, b) => a - b);
  let ca = found.length ? found[Math.floor((found.length - 1) / 2)] : null;
  console.log('[stage] cuplikan', found.map((x) => x.toFixed(2)).join(' '));
  if (!ca || ca < 0.3 || ca > 4) ca = fa;
  const cw = ca >= fa ? w : h * ca, ch = ca >= fa ? w / ca : h;
  const s = Math.min(1.8, Math.max(1, 1 / cw, 1 / ch));   // batasi agar tidak terlalu terpotong
  if (fitFor !== id) return;
  box.style.width = w * 100 + '%';
  box.style.height = h * 100 + '%';
  box.style.transform = `translate(-50%, -50%) scale(${(s * 1.02).toFixed(3)})`;
  console.log('[stage] fit', id, 'bingkai', fa.toFixed(3), 'isi', ca.toFixed(3), 'skala', s.toFixed(3));
}

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
  if ('artist' in s) $('artist').textContent = (s.artist || '').replace(/\s*·\s*Noctark$/, '');
  Viz.setPlaying(!!s.playing);
  if ('rgb' in s) Viz.setRgb(s.rgb);
  if (s.pomo) applyPomo(s.pomo);
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
  // sengaja TIDAK memanggil Viz.initAudio(): level datang dari widget (lihat onStageLevels)
});

api.onStageLevels((lv) => Viz.setFeed(lv));

/* ---------------- timer Pomodoro (hitung mundur) ----------------
   Sama dengan timer di widget: widget mengirim mode, endAt/remaining, dan status jalan
   tiap detik; panggung menghitung sisa waktunya sendiri dengan jam yang sama (Date.now). */
let pomo = null;
function tickPomo() {
  if (!pomo) return;
  const rem = Math.max(0, pomo.running ? pomo.endAt - Date.now() : pomo.remaining);
  const s = Math.ceil(rem / 1000), pad = (x) => String(x).padStart(2, '0');
  $('restTime').textContent = `${Math.floor(s / 60)}:${pad(s % 60)}`;
  $('restBar').style.transform = `scaleX(${pomo.full ? Math.min(1, 1 - rem / pomo.full) : 0})`;
}
function applyPomo(p) {
  pomo = p;
  const box = $('rest');
  box.className = (p.mode === 'focus' ? 'focus' : 'break') + (p.running ? '' : ' paused');
  box.style.setProperty('--pc', p.color || '#6fd6a8');
  $('restLabel').textContent = p.label || 'Istirahat';
  tickPomo();
}
setInterval(tickPomo, 250);

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
  else if (e.key === 'r' || e.key === 'R') api.stageCmd('rgb');
});
document.addEventListener('click', (e) => {
  if (e.target.id === 'shield') api.stageCmd('toggle');
  else if (!e.target.closest('#disc')) close();
});
