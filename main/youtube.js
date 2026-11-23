/* =========================================================
   Noctark – YouTube Data API (proses utama)
   Kuota harian gratis 10.000 unit:
     yt-lookup : search.list        = 100 unit / judul (di-cache ke disk: yt-cache.json)
     yt-recs   : playlistItems (Mix)  =   1 unit / video (di-cache)
     yt-thumb  : gambar i.ytimg.com   =   0 unit
   Gambar dikirim ke renderer sebagai data URL karena CSP widget hanya mengizinkan data:.
   ========================================================= */
const fs = require('fs');
const { nativeImage } = require('electron');
const VIDEO_ID = /^[\w-]{6,20}$/;
const API = 'https://www.googleapis.com/youtube/v3';

async function fetchDataUrl(url) {
  const r = await fetch(url);
  if (!r.ok) return null;
  const buf = Buffer.from(await r.arrayBuffer());
  return `data:${r.headers.get('content-type') || 'image/jpeg'};base64,${buf.toString('base64')}`;
}

// thumbnail terbaik yang tersedia: maxres (1280x720) tidak selalu ada -> sd -> hq
const thumbCache = new Map();
async function hdThumb(id) {
  if (!VIDEO_ID.test(id)) return null;
  if (thumbCache.has(id)) return thumbCache.get(id);
  let img = null;
  for (const q of ['maxresdefault', 'sddefault', 'hqdefault']) {
    img = await fetchDataUrl(`https://i.ytimg.com/vi/${id}/${q}.jpg`).catch(() => null);
    if (img) break;
  }
  thumbCache.set(id, img);
  return img;
}

/* Hasil pencarian (judul -> id video) disimpan ke disk: pencarian adalah bagian termahal
   (100 unit, kuota "Search Queries" harian), jadi video yang sama tidak dicari ulang
   setiap kali widget dibuka/di-restart. Maksimal 500 entri terbaru. */
function persistentMap(file, max = 500) {
  let data = {};
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  let timer = null;
  const flush = () => {
    const keys = Object.keys(data);
    if (keys.length > max) keys.slice(0, keys.length - max).forEach((k) => delete data[k]);
    try { fs.writeFileSync(file, JSON.stringify(data)); } catch {}
  };
  return {
    get: (k) => data[k],
    set: (k, v) => { delete data[k]; data[k] = v; clearTimeout(timer); timer = setTimeout(flush, 2000); },
  };
}

/* ---- mencocokkan video yang SEBENARNYA diputar di browser ----
   Judul dari Windows (mis. "NIKI - Tsunami") cocok dengan banyak video (MV, lirik, karaoke).
   Hasil pencarian dipilih dengan: durasi dari Windows (±2 dtk) + kemiripan thumbnail Windows
   dengan thumbnail tiap kandidat. Tidak ada yang cocok -> null (lebih baik cover saja daripada video lain). */
const isoDur = (s) => { const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(s || ''); return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0; };

// gambar -> sidik kecil 32x18 RGB setelah membuang black bar (pinggir gelap simetris)
function signature(img) {
  try {
    if (!img || img.isEmpty()) return null;
    let { width: W, height: H } = img.getSize();
    const s = img.resize({ width: 64, height: Math.max(1, Math.round((H / W) * 64)) });
    ({ width: W, height: H } = s.getSize());
    const px = s.toBitmap();   // BGRA
    const dark = (x, y) => { const i = (y * W + x) * 4; return px[i] + px[i + 1] + px[i + 2] < 60; };
    const rowDark = (y) => { let n = 0; for (let x = 0; x < W; x++) n += dark(x, y); return n / W > 0.95; };
    const colDark = (x) => { let n = 0; for (let y = 0; y < H; y++) n += dark(x, y); return n / H > 0.95; };
    let t = 0, b = 0, l = 0, r = 0;
    while (t < H / 3 && rowDark(t)) t++;
    while (b < H / 3 && rowDark(H - 1 - b)) b++;
    while (l < W / 3 && colDark(l)) l++;
    while (r < W / 3 && colDark(W - 1 - r)) r++;
    let cw = W - l - r, ch = H - t - b;
    // potong tengah ke 16:9 agar thumbnail 4:3 / 1:1 sebanding
    if (cw / ch > 16 / 9) { const nw = Math.round(ch * 16 / 9); l += Math.floor((cw - nw) / 2); cw = nw; }
    else { const nh = Math.round(cw * 9 / 16); t += Math.floor((ch - nh) / 2); ch = nh; }
    const fs = img.getSize(), k = fs.width / W;
    const c = img.crop({ x: Math.round(l * k), y: Math.round(t * k), width: Math.max(1, Math.round(cw * k)), height: Math.max(1, Math.round(ch * k)) })
      .resize({ width: 32, height: 18, quality: 'good' }).toBitmap();
    const out = new Float32Array(32 * 18 * 3);
    for (let i = 0, j = 0; i < c.length; i += 4) { out[j++] = c[i]; out[j++] = c[i + 1]; out[j++] = c[i + 2]; }
    // normalisasi kecerahan/kontras -> tahan terhadap kompresi & penyesuaian warna
    let m = 0; for (const v of out) m += v; m /= out.length;
    let sd = 0; for (const v of out) sd += (v - m) ** 2; sd = Math.sqrt(sd / out.length) || 1;
    for (let i = 0; i < out.length; i++) out[i] = (out[i] - m) / sd;
    return out;
  } catch { return null; }
}
const sigDiff = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]); return d / a.length; };
const unescapeHtml = (x) => x.replace(/&(amp|lt|gt|quot|#39|#x27);/g, (_, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", '#x27': "'" })[e]);
const norm = (x) => (x || '').toLowerCase().normalize('NFKC').replace(/[s​]+/g, ' ').trim();
const SAME_THUMB = 0.45;   // rata-rata selisih (dalam satuan simpangan baku) untuk "gambar sama"

async function urlSig(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return signature(nativeImage.createFromBuffer(Buffer.from(await r.arrayBuffer())));
  } catch { return null; }
}

function register(ipcMain, getKey, cacheFile) {
  // judul + artis -> kandidat video [{id, dur}] (pencarian 100 unit + durasi 1 unit, di-cache)
  const lookupCache = persistentMap(cacheFile);
  const sigCache = new Map();
  const thumbSig = async (id) => {
    if (!sigCache.has(id)) { sigCache.set(id, await urlSig(`https://i.ytimg.com/vi/${id}/mqdefault.jpg`)); if (sigCache.size > 200) sigCache.delete(sigCache.keys().next().value); }
    return sigCache.get(id);
  };
  const durations = async (ids, key) => {
    const j = await (await fetch(`${API}/videos?part=contentDetails&id=${ids.join(',')}&key=${encodeURIComponent(key)}`)).json();
    const m = {}; for (const it of j.items || []) m[it.id] = isoDur(it.contentDetails?.duration);
    return ids.map((id) => ({ id, dur: m[id] || 0 }));
  };
  const search = async (query, key) => {
    const j = await (await fetch(`${API}/search?part=snippet&type=video&maxResults=10&q=${encodeURIComponent(query)}&key=${encodeURIComponent(key)}`)).json();
    if (j.error) throw new Error(j.error.message);
    const items = (j.items || []).filter((x) => x.id?.videoId);
    if (!items.length) return [];
    const list = await durations(items.map((x) => x.id.videoId), key);
    list.forEach((c, i) => { c.title = unescapeHtml(items[i].snippet?.title || ''); c.ch = unescapeHtml(items[i].snippet?.channelTitle || ''); });
    return list;
  };
  /* Pilih kandidat yang SAMA dengan yang diputar browser. Urutan bukti:
     1) thumbnail Windows == thumbnail kandidat (paling pasti)
     2) judul tab YouTube persis sama dengan judul video (+ durasi bila ada)
     3) satu-satunya kandidat dengan durasi yang sama (±1,5 dtk)
     Tidak ada bukti -> null: lebih baik cover saja daripada versi lain (lirik/karaoke). */
  const pick = async (cands, want, smtcSig) => {
    const dur = want.dur, durOk = (c) => dur > 0 && c.dur > 0 && Math.abs(c.dur - dur) <= 1.5;
    if (smtcSig) {
      let best = null, bd = Infinity;
      for (const c of cands) { const s = await thumbSig(c.id); if (!s) continue; const d = sigDiff(s, smtcSig); if (d < bd) { bd = d; best = c; } }
      console.log('[yt] thumbnail: terbaik', best?.id, bd.toFixed(3), 'dari', cands.length);
      if (best && bd < SAME_THUMB) return best.id;
    }
    const t = norm(want.title);
    const same = t ? cands.filter((c) => norm(c.title) === t) : [];
    const sameDur = same.filter(durOk);
    if (sameDur.length) return sameDur[0].id;
    if (same.length && !(dur > 0 && same.every((c) => c.dur > 0))) return same[0].id;
    const d = cands.filter(durOk);
    if (d.length === 1) return d[0].id;
    if (!smtcSig && !t && !(dur > 0)) return cands[0]?.id || null;
    return null;
  };

  ipcMain.handle('yt-lookup', async (_e, query, want = {}) => {
    const key = getKey();
    if (!key || !query) return null;
    const w = { dur: Number(want.dur) || 0, title: String(want.title || '') };
    const smtcSig = want.smtc ? signature(nativeImage.createFromDataURL(want.smtc)) : null;
    try {
      let cands = lookupCache.get(query);
      // cache versi lama (1 id / tanpa judul) tidak cukup untuk memilih versi yang benar -> cari ulang sekali
      if (!Array.isArray(cands) || cands.length < 2 || cands.some((c) => typeof c.title !== 'string')) {
        cands = await search(query, key);
        if (cands.length) lookupCache.set(query, cands);
      }
      const id = await pick(cands, w, smtcSig);
      if (!id) return { id: null };
      return { id, img: await hdThumb(id) };
    } catch (err) { return { error: String(err.message || err) }; }
  });

  // rekomendasi = isi YouTube Mix (playlist "RD" + id video)
  const recCache = new Map();
  ipcMain.handle('yt-recs', async (_e, id) => {
    const key = getKey();
    if (!key || !VIDEO_ID.test(id || '')) return { items: [] };
    if (recCache.has(id)) return recCache.get(id);
    try {
      const j = await (await fetch(`${API}/playlistItems?part=snippet&maxResults=26&playlistId=RD${id}&key=${encodeURIComponent(key)}`)).json();
      if (j.error) return { error: j.error.message, items: [] };
      const items = (j.items || [])
        .map((it) => ({
          id: it.snippet?.resourceId?.videoId,
          title: it.snippet?.title,
          channel: (it.snippet?.videoOwnerChannelTitle || '').replace(/ - Topic$/, ''),
        }))
        .filter((x) => x.id && x.id !== id && x.title && x.title !== 'Private video' && x.title !== 'Deleted video')
        .slice(0, 24);
      // thumbnail kecil (320x180) diambil paralel
      await Promise.all(items.map(async (x) => { x.thumb = await fetchDataUrl(`https://i.ytimg.com/vi/${x.id}/mqdefault.jpg`).catch(() => null); }));
      const res = { items };
      recCache.set(id, res);
      return res;
    } catch (err) { return { error: String(err.message || err), items: [] }; }
  });

  ipcMain.handle('yt-thumb', (_e, id) => hdThumb(id));

  // 3 cuplikan frame asli (dibuat otomatis YouTube di ±25/50/75% video, bukan thumbnail kustom)
  // -> untuk mendeteksi black bar yang tertanam di file video. Gratis (tanpa kuota).
  const frameCache = new Map();
  ipcMain.handle('yt-frames', async (_e, id) => {
    if (!VIDEO_ID.test(id || '')) return [];
    if (frameCache.has(id)) return frameCache.get(id);
    const imgs = (await Promise.all([1, 2, 3].map((n) =>
      fetchDataUrl(`https://i.ytimg.com/vi/${id}/hq${n}.jpg`).catch(() => null)))).filter(Boolean);
    frameCache.set(id, imgs);
    if (frameCache.size > 30) frameCache.delete(frameCache.keys().next().value);
    return imgs;
  });

  // rasio asli video (lebar/tinggi). Dipakai Mode Panggung agar iframe punya rasio yang sama
  // dengan videonya -> player YouTube tidak menambah black bar atas/bawah atau kiri/kanan.
  // videos.list part=player + maxWidth mengembalikan embedWidth/embedHeight sesuai rasio (1 unit kuota).
  const aspectCache = persistentMap(cacheFile.replace(/yt-cache\.json$/, 'yt-aspect.json'), 1000);
  ipcMain.handle('yt-aspect', async (_e, id) => {
    if (!VIDEO_ID.test(id || '')) return null;
    const cached = aspectCache.get(id);
    if (cached) return cached;
    const key = getKey();
    if (!key) return null;
    try {
      const j = await (await fetch(`${API}/videos?part=player&maxWidth=1280&id=${id}&key=${encodeURIComponent(key)}`)).json();
      const p = j.items?.[0]?.player;
      const ar = Number(p?.embedWidth) / Number(p?.embedHeight);
      if (!Number.isFinite(ar) || ar <= 0) return null;
      const r = Math.round(ar * 1000) / 1000;
      aspectCache.set(id, r);
      return r;
    } catch { return null; }
  });
}

module.exports = { register };
