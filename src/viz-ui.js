/* =========================================================
   Cat Island – penempatan visualizer & pemilih gaya
   Gaya garis tampil di samping judul / di notch; gaya melingkar
   membungkus cover. Mesinnya ada di visualizer.js.
   ========================================================= */
const VIZ_STYLES = [
  ['bars', 'Batang'], ['mirror', 'Cermin'], ['wave', 'Gelombang'], ['radial', 'Melingkar'], ['ring', 'Pita terpilin'],
];
const isCircular = () => Viz.CIRCULAR.has(Viz.style);

Viz.add({ canvas: $('vizLine'), kind: 'line', visible: () => state !== 'hidden' && !isCircular() });
Viz.add({ canvas: $('vizRing'), kind: 'circ', inner: 16.5, visible: () => state !== 'hidden' && isCircular() });
Viz.add({ canvas: $('vizMini'), kind: 'line', visible: () => state === 'hidden' && !isCircular() });
Viz.add({ canvas: $('vizMiniRing'), kind: 'circ', inner: 7, visible: () => state === 'hidden' && isCircular() });

// getDisplayMedia bisa menolak bila belum ada interaksi -> coba lagi pada klik pertama di widget
async function setupVizAudio() {
  if (await Viz.initAudio()) return;
  document.addEventListener('pointerdown', () => Viz.initAudio(), { once: true, capture: true });
}

function markVizPick() {
  document.querySelectorAll('.viz-card').forEach((x) => x.classList.toggle('on', x.dataset.s === Viz.style));
}

(function buildVizPicker() {
  const box = $('vizPick');
  for (const [id, label] of VIZ_STYLES) {
    const b = document.createElement('button');
    b.className = 'viz-card'; b.dataset.s = id; b.type = 'button';
    b.innerHTML = `<canvas></canvas><span>${label}</span>`;
    b.onclick = () => { Viz.setStyle(id); settings.vizStyle = id; api.setSettings({ vizStyle: id }); markVizPick(); };
    box.appendChild(b);
    // pratinjau hanya digambar saat lembar Pengaturan terbuka
    Viz.add({ canvas: b.querySelector('canvas'), kind: 'preview', style: id, visible: () => $('sheet').classList.contains('on') });
  }
})();
