# =========================================================
# Cat Island - bridge media Windows (SMTC)
# Membaca & mengontrol pemutar yang aktif (Spotify diutamakan, lalu browser, dll.)
# dan mendeteksi aplikasi layar penuh.
#
# Output (stdout, satu baris JSON per pesan):
#   state      judul, artis, status, posisi, durasi, sumber
#   art        cover (base64) - dikirim saat lagu berganti
#   fullscreen on = ada aplikasi layar penuh di depan
#   need-next  "next" diminta tapi sumber tidak punya (video YouTube tunggal)
# Input (stdin, satu perintah per baris): toggle | pause | next | prev
# =========================================================
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]
function Await-Op($op, [Type]$t) {
    $task = $asTaskGeneric.MakeGenericMethod($t).Invoke($null, @($op))
    $null = $task.Wait(3000)
    return $task.Result
}

$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.IInputStream, Windows.Storage.Streams, ContentType = WindowsRuntime]
$asStreamForRead = [System.IO.WindowsRuntimeStreamExtensions].GetMethod('AsStreamForRead', [type[]]@([Windows.Storage.Streams.IInputStream]))

$mgr = Await-Op ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) `
    ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])

function Get-SpotifySession {
    foreach ($s in $mgr.GetSessions()) {
        if ($s.SourceAppUserModelId -like '*Spotify*') { return $s }
    }
    # Spotify tidak terbuka -> pakai sesi media lain yang aktif (mis. YouTube di browser)
    return $mgr.GetCurrentSession()
}

function Emit($obj) {
    [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress -Depth 3))
    [Console]::Out.Flush()
}

# Browser (Brave/Chrome/Edge) mengirim IKON APLIKASINYA sebagai "cover" saat video belum punya
# gambar (mis. sesaat setelah resolusi YouTube diganti). Ikon = PNG persegi dengan transparansi;
# thumbnail YouTube = 16:9 tanpa transparansi.
function Test-AppIcon([byte[]]$b) {
    if ($b.Length -lt 26 -or $b[0] -ne 0x89 -or $b[1] -ne 0x50) { return $false }   # bukan PNG
    $w = ([int]$b[16] -shl 24) -bor ([int]$b[17] -shl 16) -bor ([int]$b[18] -shl 8) -bor $b[19]
    $h = ([int]$b[20] -shl 24) -bor ([int]$b[21] -shl 16) -bor ([int]$b[22] -shl 8) -bor $b[23]
    $alpha = $b[25] -eq 6 -or $b[25] -eq 4
    return ($w -eq $h -and $alpha)
}
$BROWSER_RX = 'brave|chrome|msedge|edge|firefox|opera|vivaldi'

function Get-ArtBase64($props, [bool]$isBrowser = $false) {
    try {
        if (-not $props.Thumbnail) { return $null }
        $ras = Await-Op ($props.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
        if (-not $ras) { return $null }
        # $ras datang sebagai __ComObject mentah; panggil lewat reflection agar dicast ke IInputStream
        $net = $script:asStreamForRead.Invoke($null, @($ras))
        $ms = New-Object System.IO.MemoryStream
        $net.CopyTo($ms)
        $bytes = $ms.ToArray()
        $ms.Dispose(); $net.Dispose()
        if ($bytes.Length -lt 100) { return $null }
        if ($isBrowser -and (Test-AppIcon $bytes)) { return 'ICON' }
        return [Convert]::ToBase64String($bytes)
    } catch { return $null }
}

# --- deteksi aplikasi layar penuh (video, film, game, presentasi) ---
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices; using System.Text;
public static class CatFS {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] public struct MONITORINFO { public int cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags; }
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr h, uint flags);
  [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr m, ref MONITORINFO mi);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  public static bool IsFullscreen() {
    IntPtr h = GetForegroundWindow();
    if (h == IntPtr.Zero) return false;
    var sb = new StringBuilder(256); GetClassName(h, sb, 256);
    string c = sb.ToString();
    // desktop & taskbar juga seukuran layar -> bukan "layar penuh"
    if (c == "Progman" || c == "WorkerW" || c == "Shell_TrayWnd" || c == "Shell_SecondaryTrayWnd") return false;
    RECT r; if (!GetWindowRect(h, out r)) return false;
    var mi = new MONITORINFO(); mi.cbSize = Marshal.SizeOf(typeof(MONITORINFO));
    if (!GetMonitorInfo(MonitorFromWindow(h, 2), ref mi)) return false;
    // jendela maksimal biasa tidak menutupi taskbar; layar penuh menutupi seluruh monitor
    return r.L <= mi.rcMonitor.L && r.T <= mi.rcMonitor.T && r.R >= mi.rcMonitor.R && r.B >= mi.rcMonitor.B;
  }
}
"@
$lastFs = $null

$stdin = New-Object System.IO.StreamReader([Console]::OpenStandardInput())
$pending = $stdin.ReadLineAsync()
$lastKey = ''

while ($true) {
    # --- perintah dari Electron ---
    if ($pending.IsCompleted) {
        $cmd = $pending.Result
        if ($null -eq $cmd) { exit }
        $s = Get-SpotifySession
        if ($s) {
            $ctl = $s.GetPlaybackInfo().Controls
            switch ($cmd.Trim()) {
                'toggle' { $null = Await-Op ($s.TryTogglePlayPauseAsync()) ([bool]) }
                'pause'  { $null = Await-Op ($s.TryPauseAsync()) ([bool]) }
                'next'   {
                    # Video YouTube tunggal tidak punya "next" -> minta Electron memutar rekomendasi
                    if ($ctl.IsNextEnabled) { $null = Await-Op ($s.TrySkipNextAsync()) ([bool]) }
                    else { Emit @{ type = 'need-next' } }
                }
                'prev'   {
                    # tanpa "previous" -> ulang dari awal, seperti tombol previous pada umumnya
                    if ($ctl.IsPreviousEnabled) { $null = Await-Op ($s.TrySkipPreviousAsync()) ([bool]) }
                    else { $null = Await-Op ($s.TryChangePlaybackPositionAsync([long]0)) ([bool]) }
                }
            }
        }
        $pending = $stdin.ReadLineAsync()
    }

    # --- layar penuh? (dikirim hanya saat berubah) ---
    $fs = $false
    try { $fs = [CatFS]::IsFullscreen() } catch {}
    if ($fs -ne $lastFs) { $lastFs = $fs; Emit @{ type = 'fullscreen'; on = $fs } }

    # --- status sekarang ---
    $s = Get-SpotifySession
    $props = $null
    if ($s) { $props = Await-Op ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]) }
    if (-not ($s -and $props -and $props.Title)) {
        # Sesi hilang / judul kosong SESAAT (Brave melakukannya tiap resolusi YouTube diganti):
        # tahan status terakhir hingga 2,5 dtk agar cover tidak sempat terhapus.
        if (-not $goneSince) { $goneSince = Get-Date }
        if ($lastKey -and ((Get-Date) - $goneSince).TotalSeconds -lt 2.5) { Start-Sleep -Milliseconds 700; continue }
        $lastKey = ''
        Emit @{ type = 'state'; active = $false }
    } else {
        $goneSince = $null
        $isBrowser = $s.SourceAppUserModelId -match $BROWSER_RX
        $status = $s.GetPlaybackInfo().PlaybackStatus.ToString()
        $tl = $s.GetTimelineProperties()
        $pos = $tl.Position.TotalSeconds
        if ($status -eq 'Playing') {
            $pos += ([DateTimeOffset]::Now - $tl.LastUpdatedTime).TotalSeconds
        }
        $dur = $tl.EndTime.TotalSeconds
        if ($dur -gt 0 -and $pos -gt $dur) { $pos = $dur }

        $key = "$($props.Title)|$($props.Artist)"
        if ($key -ne $lastKey) { $lastKey = $key; $artDone = $false; $artTries = 0 }
        # Cover sering baru tersedia beberapa detik setelah judul berubah -> coba ulang
        if (-not $artDone -and $props.Title -and $artTries -lt 30) {
            $artTries++
            $art = Get-ArtBase64 $props $isBrowser
            # 'ICON' = ikon aplikasi browser, bukan cover -> abaikan & coba lagi di putaran berikutnya
            if ($art -and $art -ne 'ICON') { $artDone = $true; Emit @{ type = 'art'; key = $key; data = $art } }
            elseif ($artTries -eq 1) { Emit @{ type = 'art'; key = $key; data = $null } }
        }
        Emit @{
            type = 'state'; active = $true; key = $key
            source = $s.SourceAppUserModelId
            title = $props.Title; artist = $props.Artist; album = $props.AlbumTitle
            status = $status; position = [math]::Round($pos, 1); duration = [math]::Round($dur, 1)
            canNext = $s.GetPlaybackInfo().Controls.IsNextEnabled
        }
    }
    Start-Sleep -Milliseconds 700
}
