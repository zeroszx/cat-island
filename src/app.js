/* =========================================================
   Cat Island – penghubung & start-up
   Dimuat paling akhir: semua modul lain sudah terdefinisi.
   ========================================================= */
api.getSettings().then((s) => {
  settings = s;
  Viz.setStyle(s.vizStyle || 'bars');
  Viz.setFps(s.vizFps);
  setupVizAudio();
  // durasi Pomodoro bisa berubah di Pengaturan -> sesuaikan timer yang belum berjalan
  if (!pomo.running && pomo.remaining === pomo.full && pomo.full !== pomoDur(pomo.mode)) pomoSetMode(pomo.mode);
});
api.onSettings((s) => { settings = s; });

// disembunyikan penuh (layar penuh / Ctrl+Alt+H): hentikan animasi & video latar
api.onWinHidden((h) => { winHidden = h; Viz.setHidden(h); syncVideo(); });

api.onToggle(() => setState(state === 'hidden' ? 'open' : 'hidden'));
api.onBlur(() => { if (state === 'tasks' && !devMode) setState('open'); });

// tanggal di panel tugas
function tickDate() {
  $('date').textContent = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });
}
tickDate(); setInterval(tickDate, 60000);

loadTasks();
pomoRender();
