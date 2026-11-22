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

// Terapkan ke player internal. Elemen <video> baru ada beberapa saat setelah
// iframe dimuat, jadi coba ulang sebentar bila belum ada.
let eqTry = 0;
async function eqApply(retry = false) {
  if (!inner.on) return;
  if (!retry) eqTry = 0;
  const res = await api.eqApply(eqState().gains);
  if (res === 'novideo' && ++eqTry < 10) setTimeout(() => eqApply(true), 700);
}

let eqSaveT = 0;
function eqSet(preset, gains) {
  settings.eq = { preset, gains };
  eqRender();
  eqApply();
  clearTimeout(eqSaveT);
  eqSaveT = setTimeout(() => api.setSettings({ eq: settings.eq }), 300);  // simpan tanpa menunggu "Simpan"
}

function eqRender() {
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
  $('eqBands').addEventListener('dblclick', (e) => {        // klik ganda = kembalikan band ke 0
    if (e.target.type !== 'range') return;
    const gains = [...eqState().gains];
    gains[+e.target.dataset.i] = 0;
    eqSet('custom', gains);
  });
})();
