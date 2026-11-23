/* =========================================================
   Noctark – timer Pomodoro
   Fokus → istirahat pendek (×3) → istirahat panjang. Status disimpan
   di localStorage sehingga tetap jalan setelah widget dimuat ulang.
   ========================================================= */
const POMO_DEF = { focus: 25, short: 5, long: 15 };          // menit (bawaan)
const POMO_LABEL = { focus: 'Fokus', short: 'Istirahat', long: 'Istirahat panjang' };
const POMO_COLOR = { focus: '#ff7a59', short: '#6fd6a8', long: '#7cb8ff' };
const POMO_NEXT = { focus: 'short', short: 'long', long: 'focus' };   // urutan saat label diklik

const pomoDur = (m) => (Number(settings.pomo?.[m]) || POMO_DEF[m]) * 60000;

let pomo = { mode: 'focus', running: false, endAt: 0, full: POMO_DEF.focus * 60000, remaining: POMO_DEF.focus * 60000, count: 0 };
try { pomo = { ...pomo, ...JSON.parse(localStorage.getItem('pomo') || '{}') }; } catch {}
const savePomo = () => { try { localStorage.setItem('pomo', JSON.stringify(pomo)); } catch {} };

function pomoSetMode(m) {
  pomo.mode = m; pomo.running = false; pomo.full = pomo.remaining = pomoDur(m);
  savePomo(); pomoRender();
}

function chime() {
  try {
    const ac = new AudioContext();
    [[880, 0], [1320, 0.18], [1760, 0.36]].forEach(([f, t]) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, ac.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.18, ac.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + t + 0.5);
      o.connect(g).connect(ac.destination); o.start(ac.currentTime + t); o.stop(ac.currentTime + t + 0.55);
    });
  } catch {}
}

function pomoComplete() {
  chime();
  if (pomo.mode === 'focus') {
    pomo.count++;
    const long = pomo.count % 4 === 0;
    api.notify('Sesi fokus selesai 🍅', long ? 'Kerja bagus! Ambil istirahat panjang.' : 'Waktunya istirahat sebentar.');
    pomoSetMode(long ? 'long' : 'short');
  } else {
    api.notify('Istirahat selesai', 'Ayo lanjut fokus lagi!');
    pomoSetMode('focus');
  }
  if (state === 'hidden') setState('open');
}

function pomoRender() {
  const rem = pomo.running ? pomo.endAt - Date.now() : pomo.remaining;
  if (pomo.running && rem <= 0) { pomoComplete(); return; }
  $('pomo').className = `pomo ${pomo.mode}${pomo.running ? ' running' : ''}`;
  $('pomoTime').textContent = fmt(rem);
  const dots = pomo.mode === 'focus' ? ' ' + '●'.repeat(pomo.count % 4) + '○'.repeat(4 - (pomo.count % 4)) : '';
  $('pomoMode').textContent = POMO_LABEL[pomo.mode] + dots;
  $('pomoRing').style.strokeDashoffset = 94.25 * (1 - rem / pomo.full);
  // sisa waktu juga tampil di notch selama timer aktif
  const active = pomo.running || rem < pomo.full;
  const mini = $('miniPomo');
  mini.textContent = active ? fmt(rem) : '';
  mini.classList.toggle('on', active);
  mini.style.setProperty('--pomo', POMO_COLOR[pomo.mode]);
}

$('pomoBtn').addEventListener('click', () => {
  if (pomo.running) { pomo.remaining = pomo.endAt - Date.now(); pomo.running = false; }
  else { pomo.endAt = Date.now() + pomo.remaining; pomo.running = true; }
  savePomo(); pomoRender();
});
$('pomoReset').addEventListener('click', () => pomoSetMode(pomo.mode));
$('pomoMode').addEventListener('click', () => pomoSetMode(POMO_NEXT[pomo.mode]));
setInterval(pomoRender, 1000); // 1×/detik cukup untuk mm:ss dan hemat render
