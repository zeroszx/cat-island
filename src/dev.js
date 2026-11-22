/* =========================================================
   Cat Island – mode uji (khusus pengembangan)
   Hanya aktif bila widget dijalankan dengan variabel lingkungan
   CAT_DEMO=<mode>, mis. dari PowerShell:
     $env:CAT_DEMO='tasks'; .\node_modules\electron\dist\electron.exe .
   Mode: open | tasks | settings | eq | apo | stage | recs | shuffle | play | playsound | viz:<gaya>
   ========================================================= */
const waitFor = (cond, ms) => new Promise((ok) => {
  const t0 = Date.now();
  const iv = setInterval(() => { if (cond() || Date.now() - t0 > ms) { clearInterval(iv); ok(); } }, 250);
});

api.onDemo(async (mode) => {
  devMode = true;                                    // panel tidak ditutup saat jendela kehilangan fokus
  if (mode.startsWith('viz:')) { Viz.setStyle(mode.slice(4)); setState('open'); return; }
  switch (mode) {
    case 'eq':                                       // uji equalizer: putar video, pilih preset Bass Boost
      setState('open');
      innerPlay({ id: 'Jom0uWnQEJk', title: 'Drunk Text', channel: 'Henry Moodie' });
      await new Promise((r) => setTimeout(r, 9000));
      setState('tasks'); setTimeout(() => openSettings(true), 300);
      eqSet('bass', [...EQ_PRESETS.bass.g]);
      console.log('[dev] eq bass ->', await api.eqApply(EQ_PRESETS.bass.g));
      break;
    case 'stage':                                    // buka Mode Panggung
      setState('open'); setTimeout(openStage, 2500); break;
    case 'apo':                                      // lembar Pengaturan, gulir ke Equalizer, target APO
      setState('tasks');
      setTimeout(() => { openSettings(true); $('eqTarget').querySelector('[data-t="apo"]').click(); }, 300);
      setTimeout(() => $('eqTarget').scrollIntoView({ block: 'start' }), 1500);
      break;
    case 'settings':
      setState('tasks'); setTimeout(() => { openSettings(true); $('keyGuide').open = true; }, 300); break;
    case 'recs':
    case 'shuffle':
      setState('open');
      await waitFor(isYouTube, 20000);               // tunggu pencarian video YouTube selesai
      console.log('[dev] rekomendasi untuk video', curVid());
      await showRecs(true);
      if (mode === 'shuffle') setTimeout(shuffleRecs, 1500);
      break;
    case 'play':                                     // putar rekomendasi pertama tanpa suara
    case 'playsound':
      inner.forceMute = mode === 'play';
      setState('open');
      await waitFor(isYouTube, 20000);
      const first = (await loadRecs())[0];
      console.log('[dev] putar di Cat Island:', first?.title, '| sumber luar:', media.status);
      playRec(first);
      break;
    default:
      setState(mode);
  }
});
