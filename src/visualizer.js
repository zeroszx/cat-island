/* =========================================================
   Cat Island – mesin visualizer audio
   5 gaya: bars (klasik), mirror (cermin), wave (gelombang halus),
           radial (batang melingkar), ring (pita terpilin)
   Data: audio sistem (loopback) -> AnalyserNode, dengan auto-gain.
   Bila penangkapan audio gagal, memakai simulasi halus.
   Loop berhenti sendiri saat diam / tersembunyi -> CPU 0.
   ========================================================= */
const Viz = (() => {
  const N = 64;                          // jumlah pita frekuensi
  const lv = new Float32Array(N);        // level halus 0..1
  const CIRCULAR = new Set(['radial', 'ring']);
  const targets = [];                    // { canvas, kind: line|circ|preview, inner?, style?, visible() }
  let analyser = null, fbuf = null, peak = 0.3;
  let playing = false, hidden = false, style = 'bars';
  let running = false, last = 0, frameMs = 1000 / 30;
  let accent = '#f2cf7f', accentAt = 0;
  const t0 = performance.now();

  /* ---------------- data audio ---------------- */
  // Aliran loopback bisa mati diam-diam (perangkat audio berganti, Windows memutusnya, dll.):
  // analyser lalu hanya berisi nol dan visualizer diam selamanya. Maka sambungkan ulang
  // bila track berakhir atau senyap total terlalu lama saat musik diputar.
  let audioTrack = null, audioCtx = null, initing = false, retryAt = 0;
  let zeroSince = 0, silentResets = 0, everAudio = false;
  function resetAudio(why) {
    console.log('[viz] sambung ulang audio sistem:', why);
    try { audioTrack?.stop(); } catch {}
    try { audioCtx?.close(); } catch {}
    analyser = null; audioTrack = null; audioCtx = null; zeroSince = 0;
    retryAt = performance.now() + 1000;
  }
  function ensureAudio(now) {
    if (analyser || initing || now < retryAt) return;
    initing = true; retryAt = now + 5000;
    initAudio().finally(() => { initing = false; });
  }

  async function initAudio() {
    if (analyser) return true;
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: { width: 1, height: 1, frameRate: 1 } });
      stream.getVideoTracks().forEach((t) => t.stop());          // hanya butuh audio
      if (!stream.getAudioTracks().length) return false;
      audioTrack = stream.getAudioTracks()[0];
      audioTrack.addEventListener('ended', () => resetAudio('aliran berakhir'));
      const ac = audioCtx = new AudioContext();
      analyser = ac.createAnalyser();
      analyser.fftSize = 512;                                      // 256 bin
      analyser.smoothingTimeConstant = 0.6;
      analyser.minDecibels = -85; analyser.maxDecibels = -20;
      ac.createMediaStreamSource(stream).connect(analyser);       // tidak diteruskan ke speaker
      fbuf = new Uint8Array(analyser.frequencyBinCount);
      everAudio = true;
      return true;
    } catch (e) {
      console.log('[viz] audio sistem tidak tersedia, pakai simulasi:', e.message);
      return false;
    }
  }

  // bin dipetakan logaritmik (resolusi lebih banyak di bass/mid, seperti telinga)
  const BINS = Array.from({ length: N }, (_, i) => {
    const a = Math.floor(2 * Math.pow(85, i / N)), b = Math.floor(2 * Math.pow(85, (i + 1) / N));
    return [a, Math.max(a + 1, b)];
  });
  const noise = (x) => Math.sin(x) * 0.5 + Math.sin(x * 2.3 + 1.7) * 0.3 + Math.sin(x * 5.1 + 0.4) * 0.2;

  function targetLevels(t, simulate) {
    if (analyser && playing && !simulate) {
      analyser.getByteFrequencyData(fbuf);
      const raw = new Float32Array(N); let mx = 0;
      for (let i = 0; i < N; i++) {
        const [a, b] = BINS[i]; let m = 0;
        for (let k = a; k < b; k++) m = Math.max(m, fbuf[k]);
        raw[i] = (m / 255) * (0.7 + (i / N) * 1.1);                 // angkat treble yang alami lemah
        if (raw[i] > mx) mx = raw[i];
      }
      if (mx === 0) {
        // senyap total: tunggu (jeda antarlagu wajar), lalu sambung ulang dengan jeda makin lama
        if (!zeroSince) zeroSince = t;
        else if (t - zeroSince > Math.min(60, 4 * 2 ** silentResets)) { silentResets++; resetAudio('senyap total'); }
        if (zeroSince && t - zeroSince > 1.5) return targetLevels(t, true);   // sementara: gerak simulasi
      } else { zeroSince = 0; silentResets = 0; }
      // auto-gain: normalisasi terhadap puncak beberapa detik terakhir
      peak = Math.max(peak * 0.996, mx, 0.08);
      return (i) => Math.pow(raw[i] / peak, 1.25) * 0.95;
    }
    if (playing || simulate) {
      const beat = Math.pow(Math.max(0, Math.sin(t * 7.5)), 6);    // ~72 bpm
      return (i) => {
        const env = Math.exp(-Math.pow((i - N * 0.3) / (N * 0.35), 2));
        return Math.max(0, (0.35 + 0.3 * noise(t * 3 + i * 0.37)) * env + beat * 0.35 * env);
      };
    }
    return () => 0;
  }

  function sample(t, simulate) {
    const target = targetLevels(t, simulate);
    for (let i = 0; i < N; i++) {
      const v = Math.min(1, target(i));
      lv[i] += (v - lv[i]) * (v > lv[i] ? 0.55 : 0.18);           // naik cepat, turun pelan
    }
  }
  const energy = () => { let s = 0; for (let i = 0; i < N; i++) s += lv[i]; return s / N; };
  // nilai pada posisi 0..1 dengan interpolasi
  const at = (p) => { const x = Math.min(N - 1.001, Math.max(0, p * (N - 1))), i = x | 0, f = x - i; return lv[i] * (1 - f) + lv[i + 1] * f; };

  /* ---------------- gambar ---------------- */
  function prep(c) {
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return null;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    return { g, w, h };
  }
  function rr(g, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); g.beginPath(); g.roundRect(x, y, w, h, r); }
  const CREAM = '#f4ecdc';

  const DRAW = {
    bars({ g, w, h }) {
      const n = Math.max(4, Math.round(w / 4.5)), bw = (w / n) * 0.62;
      g.fillStyle = accent;
      for (let i = 0; i < n; i++) {
        const v = 0.1 + 0.9 * at(0.04 + (i / (n - 1)) * 0.55);
        const bh = Math.max(2, v * h), x = i * (w / n) + (w / n - bw) / 2;
        rr(g, x, h - bh, bw, bh, bw / 2); g.fill();
      }
    },
    mirror({ g, w, h }) {                                  // atas krem, pantulan transparan
      const n = Math.max(6, Math.round(w / 3.4)), bw = Math.max(1.4, (w / n) * 0.55), mid = h * 0.6;
      for (let i = 0; i < n; i++) {
        const p = i / (n - 1), v = at(0.05 + Math.abs(p - 0.5) * 1.1) * (1 - Math.abs(p - 0.5) * 0.6);
        const up = Math.max(1.2, v * mid * 0.98), dn = up * 0.62, x = i * (w / n) + (w / n - bw) / 2;
        g.fillStyle = CREAM; rr(g, x, mid - up, bw, up, bw / 2); g.fill();
        g.fillStyle = 'rgba(244,236,220,.38)'; rr(g, x, mid + 1, bw, dn, bw / 2); g.fill();
      }
    },
    wave({ g, w, h }) {                                    // garis tipis rapat, simetris
      const mid = h / 2, step = 1.6, n = Math.floor(w / step);
      g.strokeStyle = 'rgba(244,236,220,.25)'; g.lineWidth = 0.6;
      g.setLineDash([0.6, 1.8]); g.beginPath(); g.moveTo(0, mid); g.lineTo(w, mid); g.stroke(); g.setLineDash([]);
      g.lineWidth = 0.9; g.strokeStyle = CREAM; g.shadowColor = accent; g.shadowBlur = 3;
      g.beginPath();
      for (let i = 0; i < n; i++) {
        const p = i / (n - 1), env = Math.exp(-Math.pow((p - 0.5) / 0.3, 2));
        const v = at(0.04 + (0.5 - Math.abs(p - 0.5)) * 1.2) * (0.35 + 0.65 * env);
        const a = Math.max(0.4, v * mid * 0.98), x = i * step + 0.5;
        g.moveTo(x, mid - a); g.lineTo(x, mid + a);
      }
      g.stroke(); g.shadowBlur = 0;
    },
    radial({ g, w, h }, inner) {                           // batang di sekeliling cover
      const cx = w / 2, cy = h / 2, r0 = inner + 1.5, maxL = Math.min(w, h) / 2 - r0 - 0.5;
      const n = Math.max(72, Math.round((2 * Math.PI * r0) / 8));        // lingkaran besar (Mode Panggung) tetap rapat
      g.strokeStyle = CREAM; g.lineWidth = Math.max(0.8, ((2 * Math.PI * r0) / n) * 0.45); g.lineCap = 'round';
      g.beginPath();
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2, p = i / n;
        const L = 0.6 + at(0.03 + (p < 0.5 ? p : 1 - p) * 1.3) * maxL;   // simetris kiri-kanan
        g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        g.lineTo(cx + Math.cos(a) * (r0 + L), cy + Math.sin(a) * (r0 + L));
      }
      g.stroke();
    },
    ring({ g, w, h }, inner, t) {                          // helai terpilin yang berputar
      const cx = w / 2, cy = h / 2, room = Math.min(w, h) / 2 - inner, R = inner + room * 0.5;
      const amp = room * (0.28 + energy() * 0.75), K = 7, TWISTS = 3, STEPS = 120;
      g.lineWidth = Math.max(0.9, inner / 90); g.strokeStyle = 'rgba(244,236,220,.9)'; g.shadowColor = accent; g.shadowBlur = Math.max(2.5, inner / 40);
      for (let k = 0; k < K; k++) {
        const ph = (k / K) * Math.PI * 2;
        g.beginPath();
        for (let s = 0; s <= STEPS; s++) {
          const a = (s / STEPS) * Math.PI * 2, q = s / STEPS;
          const bump = at((q < 0.5 ? q : 1 - q) * 1.4) * 0.6;
          const r = R + Math.sin(TWISTS * a + ph + t * 1.6) * amp * (0.7 + bump);
          const x = cx + Math.cos(a + t * 0.35) * r, y = cy + Math.sin(a + t * 0.35) * r;
          s ? g.lineTo(x, y) : g.moveTo(x, y);
        }
        g.globalAlpha = 0.45 + 0.55 * Math.abs(Math.sin(ph + t));
        g.stroke();
      }
      g.globalAlpha = 1; g.shadowBlur = 0;
    },
  };

  function drawTarget(tg, t) {
    const c = prep(tg.canvas); if (!c) return;
    if (tg.kind === 'preview') DRAW[tg.style](c, Math.min(c.w, c.h) * 0.28, t);
    else DRAW[style](c, tg.inner || 0, t);
  }

  /* ---------------- loop ---------------- */
  function loop(now) {
    if (!running) return;
    if (hidden) { running = false; return; }                     // widget disembunyikan penuh
    requestAnimationFrame(loop);
    if (now - last < frameMs - 2) return;
    last = now;
    if (now - accentAt > 1000) { accentAt = now; accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || accent; }
    const t = (now - t0) / 1000;
    if (playing && everAudio && !analyser) ensureAudio(now);          // pulihkan audio yang terputus
    const visible = targets.filter((x) => x.visible());
    const preview = visible.some((x) => x.kind === 'preview');
    sample(t, preview && !playing);                               // pratinjau tetap bergerak walau tak ada musik
    visible.forEach((tg) => drawTarget(tg, t));
    // berhenti sendiri bila tidak ada yang perlu digerakkan
    if (!playing && !preview && (energy() < 0.004 || !visible.length)) running = false;
  }
  function wake() { if (!running && !hidden) { running = true; last = 0; requestAnimationFrame(loop); } }

  return {
    CIRCULAR,
    initAudio,
    wake,
    add(tg) { targets.push(tg); wake(); },
    setPlaying(p) { if (p !== playing) { playing = p; wake(); } },
    setHidden(h) { hidden = h; if (!h) wake(); },
    setStyle(s) { style = DRAW[s] ? s : 'bars'; document.documentElement.dataset.viz = style; wake(); },
    setFps(f) { frameMs = 1000 / (f === 60 ? 60 : 30); },
    get style() { return style; },
  };
})();
