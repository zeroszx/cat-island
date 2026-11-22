/* =========================================================
   Cat Island – inti
   Helper bersama, state jendela (notch → pil → panel),
   click-through, notch tarik/klik, dan seret untuk memindahkan.
   Semua file di src/ adalah skrip biasa yang berbagi scope global;
   urutan muat diatur di index.html.
   ========================================================= */
const $ = (id) => document.getElementById(id);
const api = window.island;
const stage = $('stage');
const root = document.documentElement;

const ICON = {
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  chev: '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
  eyes: '<svg class="eyes" viewBox="0 0 44 44"><path d="M9 20a6 6 0 1 0 9 4"/><path d="M26 20a6 6 0 1 0 9 4"/></svg>',
};
const BROWSER = /brave|chrome|msedge|edge|firefox|opera|vivaldi|youtube/i;
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const dataUrl = (b64) => `data:image/${b64.startsWith('iVBOR') ? 'png' : 'jpeg'};base64,${b64}`;

let settings = { autoHide: true };
let winHidden = false;   // jendela disembunyikan penuh (layar penuh / Ctrl+Alt+H)
let devMode = false;     // mode uji (CAT_DEMO), lihat dev.js

/* ---------------- state jendela ---------------- */
let state = 'hidden';                     // hidden (notch) | open (pil) | tasks (pil + panel)
let overHit = false, hideTimer = null, modeTimer = null;
const RANK = { hidden: 0, open: 1, tasks: 2 };

// ukuran jendela yang diminta ke proses utama (dropdown rekomendasi butuh jendela lebih tinggi)
function winMode() { return state === 'open' && recsOpen ? 'recs' : state; }

function setState(s) {
  const grow = RANK[s] > RANK[state];
  state = s;
  clearTimeout(modeTimer);
  if (s !== 'open') showRecs(false, true);
  if (grow) {
    api.setMode(winMode());                                       // perbesar jendela dulu…
    modeTimer = setTimeout(() => { stage.className = 's-' + s; }, 40); // …baru animasi masuk
  } else {
    stage.className = 's-' + s;                                    // animasi keluar dulu…
    modeTimer = setTimeout(() => api.setMode(winMode()), 520);    // …baru perkecil jendela
  }
  syncVideo();
  Viz.wake();
  clearTimeout(hideTimer);
  if (s === 'tasks') { api.focus(); setTimeout(() => $('newTask').focus({ preventScroll: true }), 120); }
  if (s === 'open' && !overHit) scheduleHide();
}

function scheduleHide() {
  clearTimeout(hideTimer);
  if (!settings.autoHide || state !== 'open') return;
  hideTimer = setTimeout(() => { if (!overHit && state === 'open') setState('hidden'); }, 3500);
}

/* ---- click-through: jendela hanya menangkap mouse di atas elemen .hit ---- */
let ignoring = true;
function setOver(v) {
  if (v === overHit) return;
  overHit = v;
  if (ignoring === v) { ignoring = !v; api.setIgnore(!v); }
  if (v) clearTimeout(hideTimer); else scheduleHide();
}
document.addEventListener('mousemove', (e) => setOver(!!e.target.closest('.hit')));
document.addEventListener('mouseleave', () => setOver(false));

/* ---- notch: klik atau tarik ke bawah untuk membuka ---- */
const notch = $('notch');
let pull = null;
notch.addEventListener('pointerdown', (e) => { pull = e.clientY; notch.setPointerCapture(e.pointerId); });
notch.addEventListener('pointermove', (e) => { if (pull !== null && e.clientY - pull > 8) { pull = null; setState('open'); } });
notch.addEventListener('pointerup', () => { if (pull !== null) { pull = null; setState('open'); } });

$('hideBtn').addEventListener('click', () => setState('hidden'));
$('toggle').addEventListener('click', () => setState(state === 'tasks' ? 'open' : 'tasks'));
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || e.target.isContentEditable) return;
  setState(state === 'tasks' ? 'open' : 'hidden');
});

/* ---- seret cover untuk memindahkan widget ---- */
const dragHandle = $('cover');
let drag = null;
dragHandle.addEventListener('pointerdown', (e) => {
  drag = { x: e.screenX, y: e.screenY };
  dragHandle.setPointerCapture(e.pointerId);
  api.dragStart();
});
dragHandle.addEventListener('pointermove', (e) => { if (drag) api.dragMove(e.screenX - drag.x, e.screenY - drag.y); });
dragHandle.addEventListener('pointerup', (e) => { if (drag) api.dragEnd(e.screenX - drag.x, e.screenY - drag.y); drag = null; });
