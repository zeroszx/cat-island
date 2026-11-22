/* =========================================================
   Cat Island – YouTube Data API (proses utama)
   Kuota harian gratis 10.000 unit:
     yt-lookup : search.list        = 100 unit / judul (di-cache ke disk: yt-cache.json)
     yt-recs   : playlistItems (Mix)  =   1 unit / video (di-cache)
     yt-thumb  : gambar i.ytimg.com   =   0 unit
   Gambar dikirim ke renderer sebagai data URL karena CSP widget hanya mengizinkan data:.
   ========================================================= */
const fs = require('fs');
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

function register(ipcMain, getKey, cacheFile) {
  // judul + artis -> video pertama hasil pencarian
  const lookupCache = persistentMap(cacheFile);
  ipcMain.handle('yt-lookup', async (_e, query) => {
    const key = getKey();
    if (!key || !query) return null;
    const cached = lookupCache.get(query);
    if (cached) return { id: cached, img: await hdThumb(cached) };   // gambar gratis, tanpa kuota
    try {
      const j = await (await fetch(`${API}/search?part=snippet&type=video&maxResults=1&q=${encodeURIComponent(query)}&key=${encodeURIComponent(key)}`)).json();
      if (j.error) return { error: j.error.message };
      const id = j.items?.[0]?.id?.videoId;
      if (!id) return null;
      lookupCache.set(query, id);
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
}

module.exports = { register };
