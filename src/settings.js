/* =========================================================
   Cat Island – lembar Pengaturan (ikon ⚙ di panel tugas)
   Pengaturan disimpan proses utama di %APPDATA%\cat-island\settings.json
   ========================================================= */
function openSettings(on) {
  $('sheet').classList.toggle('on', on);
  if (!on) return;
  markVizPick(); Viz.wake(); eqRender();
  if (eqTarget() === 'apo') apoRefresh();
  $('ytKey').value = settings.ytKey || '';
  $('autoFsOn').checked = settings.autoFs !== false;
  $('viz60').checked = settings.vizFps === 60;
  $('bgVideoOn').checked = settings.bgVideo !== false;
  $('durFocus').value = settings.pomo?.focus || POMO_DEF.focus;
  $('durShort').value = settings.pomo?.short || POMO_DEF.short;
  $('durLong').value = settings.pomo?.long || POMO_DEF.long;
  setSettingsMsg('', '');
}

function setSettingsMsg(text, cls) { const m = $('settingsMsg'); m.textContent = text; m.className = cls; }

async function saveSettingsForm() {
  const clamp = (v, d, max) => Math.min(max, Math.max(1, Math.round(Number(v) || d)));
  const patch = {
    ytKey: $('ytKey').value.trim(),
    autoFs: $('autoFsOn').checked,
    vizFps: $('viz60').checked ? 60 : 30,
    bgVideo: $('bgVideoOn').checked,
    pomo: {
      focus: clamp($('durFocus').value, POMO_DEF.focus, 120),
      short: clamp($('durShort').value, POMO_DEF.short, 60),
      long: clamp($('durLong').value, POMO_DEF.long, 60),
    },
  };
  const keyChanged = patch.ytKey !== settings.ytKey;
  settings = { ...settings, ...patch };
  api.setSettings(patch);
  if (!pomo.running) pomoSetMode(pomo.mode);
  Viz.setFps(patch.vizFps);
  syncVideo();

  if (!keyChanged || !patch.ytKey) { setSettingsMsg('Tersimpan ✓', 'ok'); return; }
  setSettingsMsg('Menguji API key…', '');
  const res = await api.ytLookup('lofi hip hop radio');
  if (res?.error) { setSettingsMsg('Key ditolak: ' + res.error.slice(0, 60), 'err'); return; }
  setSettingsMsg('Tersimpan · API key berfungsi ✓', 'ok');
  lookedUp = '';
  if (media.active) ytLookup(media);
}

// Tombol panduan (API key, Equalizer APO) membuka halaman di browser bawaan
$('sheet').addEventListener('click', (e) => {
  const url = e.target.closest('[data-open]')?.dataset.open;
  if (url) { e.preventDefault(); api.openExternal(url); }
});

$('openSettings').addEventListener('click', () => openSettings(true));
$('closeSettings').addEventListener('click', () => openSettings(false));
$('saveSettings').addEventListener('click', saveSettingsForm);
