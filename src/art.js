/* =========================================================
   Cat Island – cover, warna aksen, latar pil
   - art.smtc : thumbnail dari Windows (bridge)
   - art.hd   : thumbnail HD hasil YouTube Data API (bila ada API key)
   - video latar: 6 detik pertama video YouTube, tanpa suara, diblur, diulang
   ========================================================= */
let art = { key: '', smtc: null, hd: null, vid: null };
let lookedUp = '';                 // key media (+thumbnail/durasi) yang sudah dicari di YouTube API
let lookWait = { key: '', until: 0 };

function resetArt(key) {
  if (key === art.key) return;
  art = { key, smtc: null, hd: null, vid: null };
  syncVideo();
}
function clearArt() {
  art = { key: '', smtc: null, hd: null, vid: null };
  lookedUp = '';
  applyArt();
}

// warna dominan yang paling "hidup" dari cover -> --accent
function accentFrom(img) {
  try {
    const c = document.createElement('canvas'); c.width = c.height = 24;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0, 24, 24);
    const d = g.getImageData(0, 0, 24, 24).data;
    let r = 0, gg = 0, b = 0, w = 0;
    for (let i = 0; i < d.length; i += 4) {
      const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
      const wt = ((mx - mn) / 255) ** 2 * (mx > 40 ? 1 : 0.1) + 0.002;
      r += d[i] * wt; gg += d[i + 1] * wt; b += d[i + 2] * wt; w += wt;
    }
    r /= w * 255; gg /= w * 255; b /= w * 255;
    const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), l = (mx + mn) / 2;
    let h = 0, s = 0;
    if (mx !== mn) {
      const dd = mx - mn; s = l > 0.5 ? dd / (2 - mx - mn) : dd / (mx + mn);
      h = mx === r ? (gg - b) / dd + (gg < b ? 6 : 0) : mx === gg ? (b - r) / dd + 2 : (r - gg) / dd + 4;
      h *= 60;
    }
    if (s < 0.12) return null; // cover hampir abu-abu -> pakai emas
    return `hsl(${Math.round(h)} ${Math.round(Math.max(s, 0.55) * 100)}% ${Math.round(Math.min(Math.max(l, 0.6), 0.72) * 100)}%)`;
  } catch { return null; }
}

function applyArt() {
  const src = art.hd || art.smtc;
  const has = !!src;
  for (const [wrap, img] of [['cover', 'art'], ['miniCover', 'miniArt']]) {
    $(wrap).classList.toggle('has-art', has);
    if (has && $(img).src !== src) $(img).src = src;
  }
  const bg = $('bgArt');
  if (has) bg.style.backgroundImage = `url("${src}")`;
  bg.classList.toggle('on', has);
  $('pill').classList.toggle('has-bg', has || !!bgVid.id);
  if (!has) { root.style.removeProperty('--accent'); return; }
  $('art').onload = () => {
    const a = accentFrom($('art'));
    if (a) root.style.setProperty('--accent', a); else root.style.removeProperty('--accent');
  };
}

/* ---- YouTube: cari video dari judul -> thumbnail HD + id video ---- */
// Judul saja tidak cukup (MV, lyric video, karaoke judulnya mirip) -> proses utama mencocokkan
// durasi & thumbnail dari Windows dengan kandidat pencarian. Dicoba lagi saat thumbnail/durasi tiba
// (gratis: kandidat sudah di-cache).
async function ytLookup(msg) {
  if (!settings.ytKey || !BROWSER.test(msg.source || '')) return;
  if (!art.smtc) {   // beri waktu thumbnail Windows datang (maks 1,5 dtk)
    if (lookWait.key !== msg.key) {
      lookWait = { key: msg.key, until: Date.now() + 1500 };
      setTimeout(() => { if (media.key === msg.key) ytLookup(media); }, 1600);
    }
    if (Date.now() < lookWait.until) return;
  }
  const dur = msg.duration > 0 ? Math.round(msg.duration) : 0;
  const sig = `${msg.key}|${art.smtc ? art.smtc.length : 0}|${dur}`;
  if (lookedUp === sig) return;
  lookedUp = sig;
  // tanda seperti '-' atau '|' adalah operator pencarian YouTube ('-speed' = KECUALIKAN 'speed')
  const q = `${msg.title} ${msg.artist || ''}`.replace(/[-|"#~*()[\]{}:!?.,+]/g, ' ').replace(/\s+/g, ' ').trim();
  const res = await api.ytLookup(q, { dur, smtc: art.smtc });
  if (!res || res.error || art.key !== msg.key) return;
  console.log('[art] video cocok:', res.id || '(tidak ada)');
  art.vid = res.id || null;
  art.hd = res.id ? res.img || null : null;   // tak ada yang cocok -> cover asli dari Windows
  applyArt(); syncVideo();
}

/* ---- video latar: loop 6 detik pertama, hanya saat pil terlihat & video diputar ---- */
const LOOP_SEC = 6;
let bgVid = { id: null, el: null, loop: null, cmd: null, lastInfo: 0 };

const ytCmd = (frame) => (func, args = []) =>
  frame.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*');

function ytEmbed(id, params) {
  const f = document.createElement('iframe');
  f.allow = 'autoplay; encrypted-media';
  f.tabIndex = -1;
  f.src = `https://www.youtube-nocookie.com/embed/${id}?controls=0&disablekb=1&fs=0&iv_load_policy=3`
    + `&modestbranding=1&playsinline=1&rel=0&enablejsapi=1&autoplay=1&${params}`;
  return f;
}

function syncVideo() {
  const want = !winHidden && !inner.on && settings.bgVideo !== false && art.vid && state !== 'hidden'
    && media.active && media.status === 'Playing' ? art.vid : null;
  if (want === bgVid.id) return;
  const box = $('bgVideo');
  clearInterval(bgVid.loop);
  box.classList.remove('on');
  const old = bgVid.el;
  bgVid = { id: want, el: null, loop: null, cmd: null, lastInfo: 0 };
  if (old) setTimeout(() => old.remove(), 1300);   // biarkan fade-out selesai
  $('pill').classList.toggle('has-bg', !!want || $('bgArt').classList.contains('on'));
  if (!want) return;

  const f = ytEmbed(want, `mute=1&start=0&end=${LOOP_SEC}&loop=1&playlist=${want}`);
  box.appendChild(f);
  bgVid.el = f;
  f.onload = () => {
    bgVid.cmd = ytCmd(f);
    setTimeout(() => { if (bgVid.el === f) box.classList.add('on'); }, 1800); // lewati layar hitam awal
    f.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 1 }), '*');
    // cadangan bila player tidak mengirim posisi
    bgVid.loop = setInterval(() => {
      if (Date.now() - bgVid.lastInfo > 3000) { bgVid.cmd('seekTo', [0, true]); bgVid.cmd('playVideo'); }
    }, LOOP_SEC * 1000);
  };
}

// player mengirim posisinya -> putar balik ke 0 begitu lewat LOOP_SEC
window.addEventListener('message', (e) => {
  if (!bgVid.el || e.source !== bgVid.el.contentWindow) return;
  let d; try { d = JSON.parse(e.data); } catch { return; }
  const t = d?.info?.currentTime;
  if (typeof t !== 'number') return;
  bgVid.lastInfo = Date.now();
  if (t > LOOP_SEC) bgVid.cmd('seekTo', [0, true]);
});
