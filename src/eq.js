/* =========================================================
   Cat Island – equalizer suara (player internal)
   8 band, preset + slider di Pengaturan. Perubahan langsung terdengar dan
   langsung disimpan (settings.eq = { preset, gains }). Penerapan ke frame
   YouTube dilakukan proses utama (main/eq.js).
   ========================================================= */
const EQ_BANDS = ['60', '150', '400', '1k', '2.4k', '6k', '12k', '16k'];
const EQ_PRESETS = {
  flat:     { name: 'Datar',      g: [0, 0, 0, 0, 0, 0, 0, 0] },
  bass:     { name: 'Bass Boost', g: [7, 5, 2, 0, 0, 0, 0, 0] },
  vocal:    { name: 'Vokal',      g: [-2, -1, 1, 4, 4, 2, 0, -1] },
  lofi:     { name: 'Lofi',       g: [3, 2, 0, -1, -2, -4, -6, -8] },
  treble:   { name: 'Treble',     g: [0, 0, 0, 0, 1, 3, 5, 6] },
  acoustic: { name: 'Akustik',    g: [3, 2, 1, 1, 2, 2, 3, 2] },
  dance:    { name: 'Dance',      g: [6, 4, 0, -2, 0, 2, 4, 3] },
};

const eqState = () => {
  const e = settings.eq || {};
  const g = Array.isArray(e.gains) && e.gains.length === 8 ? e.gains.map(Number) : EQ_PRESETS.flat.g;
  return { preset: e.preset || 'flat', gains: g };
};

const FLAT = EQ_PRESETS.flat.g;
const eqTarget = () => (settings.eqTarget === 'apo' ? 'apo' : 'inner');

// Player internal: dapat gain hanya bila target = Cat Island (agar tidak dobel dengan APO).
// Elemen <video> baru ada beberapa saat setelah iframe dimuat -> coba ulang sebentar.
let eqTry = 0;
async function eqApply(retry = false) {
  if (!inner.on) return;
  if (!retry) eqTry = 0;
  const res = await api.eqApply(eqTarget() === 'inner' ? eqState().gains : FLAT);
  if (res === 'novideo' && ++eqTry < 10) setTimeout(() => eqApply(true), 700);
}

// Equalizer APO: file konfigurasi ditulis (ditunda sedikit saat slider digeser)
let apoT = 0, apoReady = false;
function apoApply() {
  clearTimeout(apoT);
  apoT = setTimeout(() => { if (apoReady) api.apoApply(eqTarget() === 'apo' ? eqState().gains : FLAT); }, 120);
}

let eqSaveT = 0;
function eqSave(patch) {
  Object.assign(settings, patch);
  clearTimeout(eqSaveT);
  eqSaveT = setTimeout(() => api.setSettings({ eq: settings.eq, eqTarget: eqTarget() }), 300);  // tanpa menunggu "Simpan"
}

function eqSet(preset, gains) {
  eqSave({ eq: { preset, gains } });
  eqRender(); eqApply(); apoApply();
}

async function apoRefresh() {
  const st = await api.apoStatus();
  apoReady = !!st.ready;
  const msg = $('apoMsg');
  $('apoSteps').hidden = st.installed;
  $('apoSetup').hidden = !st.installed || st.ready;
  if (st.ready) { msg.textContent = 'Terhubung ✓ Equalizer berlaku untuk semua suara: Brave, Spotify, game, dll.'; msg.className = 'ok'; }
  else if (st.installed) { msg.textContent = 'Equalizer APO terpasang, tinggal dihubungkan ke Cat Island.'; msg.className = ''; }
  else { msg.textContent = 'Equalizer APO belum terpasang. Ikuti langkah berikut:'; msg.className = ''; }
  apoApply();
}

function eqRender() {
  $('eqTarget').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.t === eqTarget()));
  $('apoBox').hidden = eqTarget() !== 'apo';
  const { preset, gains } = eqState();
  $('eqPresets').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.p === preset));
  $('eqBands').querySelectorAll('input').forEach((s, i) => {
    s.value = gains[i];
    s.parentElement.querySelector('.eq-db').textContent = (gains[i] > 0 ? '+' : '') + gains[i];
  });
}

(function eqBuild() {
  $('eqPresets').innerHTML = Object.entries(EQ_PRESETS)
    .map(([k, p]) => `<button type="button" data-p="${k}">${p.name}</button>`).join('')
    + '<button type="button" data-p="custom" disabled>Kustom</button>';
  $('eqBands').innerHTML = EQ_BANDS.map((hz, i) =>
    `<label class="eq-band"><span class="eq-db">0</span>
       <input type="range" min="-12" max="12" step="0.5" value="0" data-i="${i}" aria-label="${hz} Hz">
       <span class="eq-hz">${hz}</span></label>`).join('');

  $('eqPresets').addEventListener('click', (e) => {
    const p = e.target.closest('button')?.dataset.p;
    if (p && EQ_PRESETS[p]) eqSet(p, [...EQ_PRESETS[p].g]);
  });
  $('eqBands').addEventListener('input', (e) => {
    const gains = [...eqState().gains];
    gains[+e.target.dataset.i] = Number(e.target.value);
    eqSet('custom', gains);
  });
  $('eqTarget').addEventListener('click', (e) => {
    const t = e.target.closest('button')?.dataset.t;
    if (!t || t === eqTarget()) return;
    eqSave({ eqTarget: t });
    eqRender(); eqApply();                     // pindahkan efek: yang lama jadi datar
    if (t === 'apo') apoRefresh(); else apoApply();
  });
  $('apoSetup').addEventListener('click', async () => {
    $('apoMsg').textContent = 'Menunggu izin admin (dialog Windows)…'; $('apoMsg').className = '';
    await api.apoSetup();
    await apoRefresh();
    if (!apoReady) { $('apoMsg').textContent = 'Belum terhubung. Izin admin ditolak? Coba klik Hubungkan lagi.'; $('apoMsg').className = 'err'; }
  });
  $('eqBands').addEventListener('dblclick', (e) => {        // klik ganda = kembalikan band ke 0
    if (e.target.type !== 'range') return;
    const gains = [...eqState().gains];
    gains[+e.target.dataset.i] = 0;
    eqSet('custom', gains);
  });
})();
