# Noctark 🌙🐈‍⬛

Widget desktop Windows berbentuk "pulau" di tepi atas layar: pelacak tugas, timer Pomodoro,
dan kontrol musik (Spotify / YouTube di browser) dengan equalizer yang mengikuti suara.

## Menjalankan

- Klik dua kali **`Jalankan Noctark.vbs`** (tanpa jendela konsol).
- Autostart: klik kanan ikon tray → **Jalankan saat Windows mulai**.

Pertama kali / setelah folder dipindah (`node_modules` tidak ikut tersalin):

```powershell
npm install
```

npm versi baru memblokir skrip install Electron. Bila `node_modules\electron\dist\electron.exe`
tidak ada, ekstrak binary-nya manual dari cache Electron:

```powershell
$z = Get-ChildItem "$env:LOCALAPPDATA\electron\Cache" -Recurse -Filter 'electron-v33.2.1-win32-x64.zip' | Select -First 1
Expand-Archive $z.FullName -DestinationPath node_modules\electron\dist -Force
Set-Content -NoNewline -Encoding ascii node_modules\electron\path.txt 'electron.exe'
```

## Cara pakai

| Aksi | Cara |
|---|---|
| Buka pil dari notch | klik / tarik notch ke bawah, atau **Ctrl + Alt + Space** |
| Sembunyikan sepenuhnya | **Ctrl + Alt + H**, atau tray → *Sembunyikan widget* |
| Pindahkan widget | seret cover di kiri pil |
| Panel tugas | klik tombol tugas di kanan pil |
| Rekomendasi YouTube | arahkan kursor ke judul video (tanda ▾) |
| Pengaturan | ikon ⚙ di pojok kanan bawah panel tugas |

Otomatis: menyusut ke notch 3,5 dtk setelah kursor pergi; hilang total saat ada aplikasi layar penuh.

## Struktur

```
main.js            proses utama: jendela, tray, shortcut, IPC, sembunyi saat layar penuh
main/youtube.js    YouTube Data API (pencarian, Mix, thumbnail) + cache
main/system.js     autostart (registry HKCU\…\Run) & ikon tray
preload.js         API aman untuk halaman (window.island)
bridge/media.ps1   bridge media Windows (SMTC) + deteksi layar penuh, via stdin/stdout JSON
index.html         markup widget
src/               tampilan — skrip biasa berbagi scope global, urutan muat di index.html:
  visualizer.js      mesin equalizer (5 gaya, audio sistem + auto-gain)
  core.js            helper, state notch→pil→panel, click-through, seret
  art.js             cover, warna aksen, latar pil, video latar 6 dtk, pencarian YouTube
  player.js          player YouTube internal (dengan suara) + antrean Mix
  media.js           pesan dari bridge, progress bar, tombol kontrol
  recs.js            dropdown rekomendasi + acak
  pomodoro.js        timer Pomodoro
  tasks.js           tugas & langkah kecil
  settings.js        lembar Pengaturan
  viz-ui.js          penempatan visualizer & pemilih gaya
  dev.js             mode uji (CAT_DEMO)
  app.js             start-up (dimuat terakhir)
  style.css          gaya tampilan
```

## Data

Tersimpan di `%APPDATA%\noctark\` (tidak ikut bila folder proyek dibagikan):

- `tasks.json` — tugas
- `settings.json` — pengaturan, termasuk YouTube API key
- `yt-cache.json` — hasil pencarian judul → id video (menghemat kuota)

## YouTube API

Opsional (⚙ Pengaturan). Tanpa key, widget tetap jalan; yang tidak aktif hanya thumbnail HD,
video latar, rekomendasi, dan player internal.

Kuota gratis harian: **Search Queries** terbatas (pencarian = 100 unit) — karena itu hasil
pencarian di-cache ke disk. Rekomendasi (Mix) hanya 1 unit per video. Kuota reset tengah malam
waktu Pasifik (≈ 15.00 WIB).

> ⚠️ Video latar yang diblur dan player internal yang tetap bersuara saat widget tersembunyi tidak
> sesuai Ketentuan YouTube API (player harus terlihat ≥ 200×200 px). Aman untuk pemakaian pribadi;
> matikan fitur-fitur itu bila widget dibagikan.

## Pengembangan

```powershell
$env:CAT_DEBUG='1'                 # log proses utama & console halaman ke terminal
$env:CAT_DEMO='tasks'              # mode uji: open | tasks | settings | recs | shuffle | play | playsound | viz:<gaya>
.\node_modules\electron\dist\electron.exe .
```

Performa terukur (laptop 4 core, skala 150%): notch ±3% CPU; pil terbuka + equalizer 30 fps ±9–10%;
video latar menambah ±8% CPU & ±300 MB RAM.
