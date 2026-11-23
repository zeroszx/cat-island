/* =========================================================
   Noctark – dropdown rekomendasi (hover judul)
   Isi dari YouTube Mix (playlist RD<id>) — 1 unit kuota per video.
   Pool s.d. 24 video, 8 ditampilkan; tombol ⤨ mengacak pool & antrean.
   ========================================================= */
let recsOpen = false, recsTimer = null, recsFor = null, recsData = null;
const metaEl = document.querySelector('.meta');

const curVid = () => (inner.on ? inner.id : art.vid);
const isYouTube = () => !!settings.ytKey && (inner.on || (media.active && BROWSER.test(media.source || '') && !!art.vid));
// tanda ▾ di judul: rekomendasi tersedia
const updateRecsHint = () => metaEl.classList.toggle('has-recs', isYouTube());

async function loadRecs() {
  const id = curVid();
  if (!id) return [];
  if (recsFor === id && recsData) return recsData;
  recsFor = id; recsData = null;
  const res = await api.ytRecs(id);
  if (recsFor !== id) return [];
  recsData = res.items || [];
  recsData.error = res.error;
  return recsData;
}

function renderRecs(items, loading) {
  const ul = $('recList');
  if (loading) {
    ul.innerHTML = Array.from({ length: 4 }, () =>
      '<li class="rec sk"><div class="rec-thumb"></div><div class="rec-txt"><span class="rec-title">Memuat judul video</span><span class="rec-ch">kanal</span></div></li>').join('');
    return;
  }
  if (!items.length) {
    ul.innerHTML = `<li class="recs-msg">${items.error ? 'Gagal memuat: ' + esc(items.error).slice(0, 80) : 'Tidak ada rekomendasi untuk video ini'}</li>`;
    return;
  }
  const shown = items.slice(0, 8);
  ul.innerHTML = shown.map((x, i) => `
    <li class="rec" data-i="${i}" title="${esc(x.title)}">
      <div class="rec-thumb" style="background-image:url('${x.thumb || ''}')"></div>
      <div class="rec-txt"><span class="rec-title">${esc(x.title)}</span><span class="rec-ch">${esc(x.channel)}</span></div>
    </li>`).join('');
  ul.querySelectorAll('.rec').forEach((li) => li.addEventListener('click', () => playRec(shown[+li.dataset.i])));
}

function shuffleRecs() {
  if (!recsData?.length) return;
  for (let i = recsData.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [recsData[i], recsData[j]] = [recsData[j], recsData[i]];
  }
  if (inner.on && recsFor === inner.id) {           // antrean player internal ikut teracak
    const seen = new Set([...inner.history.map((x) => x.id), inner.id]);
    inner.queue = recsData.filter((x) => !seen.has(x.id));
  }
  const ul = $('recList'), btn = $('shuffleRecs');
  btn.classList.remove('spin'); void btn.offsetWidth; btn.classList.add('spin');
  ul.classList.add('swap');
  setTimeout(() => { renderRecs(recsData); ul.scrollTop = 0; ul.classList.remove('swap'); }, 160);
}
$('shuffleRecs').addEventListener('click', shuffleRecs);

async function showRecs(on, instant) {
  clearTimeout(recsTimer);
  if (on === recsOpen) return;
  recsOpen = on;
  if (on) {
    api.setMode(winMode());
    setTimeout(() => $('recs').classList.add('on'), 40);
    if (!(recsFor === curVid() && recsData)) renderRecs([], true);
    renderRecs(await loadRecs());
  } else {
    $('recs').classList.remove('on');
    if (instant) return; // setState() yang mengatur ukuran jendela
    setTimeout(() => { if (!recsOpen) api.setMode(winMode()); }, 380);
  }
}

function playRec(x) {
  if (!x) return;
  showRecs(false);
  recsFor = null; recsData = null;   // rekomendasi berikutnya diambil dari video baru
  innerPlay(x);                      // diputar di Noctark, bukan di browser
}

// hover judul -> buka; keluar dari judul & dropdown -> tutup
metaEl.addEventListener('mouseenter', () => {
  if (!isYouTube()) return;
  clearTimeout(recsTimer);
  recsTimer = setTimeout(() => { if (state === 'tasks') setState('open'); if (state === 'open') showRecs(true); }, 350);
});
for (const el of [metaEl, $('recs')]) {
  el.addEventListener('mouseleave', () => { clearTimeout(recsTimer); recsTimer = setTimeout(() => showRecs(false), 300); });
  el.addEventListener('mouseenter', () => { if (recsOpen) clearTimeout(recsTimer); });
}
