# Runs Shelfed's Windows installer the way people do, and fails if it, or
# anything it starts, starts a console program (PowerShell, cmd, tasklist),
# whose windows flash on screen.
# Pictures of each step go to screens/installer. Used by .github/workflows/screens.yml.
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$out = Join-Path $PWD "screens\installer"
New-Item -ItemType Directory -Force $out | Out-Null
# The installer people download, not the one inside it that updates run.
$installer = (Get-ChildItem dist\Shelfed-*-win-x64.exe | Where-Object Name -notlike "*-setup.exe" | Select-Object -First 1).FullName
Write-Host "Installing with $installer"
$app = Join-Path $env:LOCALAPPDATA "Programs\Shelfed\Shelfed.exe"
$consoles = "powershell.exe", "pwsh.exe", "cmd.exe", "tasklist.exe", "taskkill.exe", "findstr.exe"
$failed = $false

function Shot($name) {
  $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  $bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
  $bitmap.Save((Join-Path $out "$name.png"))
  $graphics.Dispose(); $bitmap.Dispose()
}

# Runs the installer, watching everything it starts, and what those start, for up to $seconds.
function Install($name, $seconds) {
  $process = Start-Process $installer -PassThru
  $started = @{}
  $tree = @{ [int]$process.Id = $true }
  $deadline = (Get-Date).AddSeconds($seconds)
  $n = 0
  while (-not $process.HasExited -and (Get-Date) -lt $deadline) {
    foreach ($child in Get-CimInstance Win32_Process) {
      if ($tree.ContainsKey([int]$child.ParentProcessId) -and -not $tree.ContainsKey([int]$child.ProcessId)) {
        $started[$child.Name] = $true
        # Shelfed opening at the end is the installer's last step; what Shelfed then does
        # (a hidden PowerShell looking for Kindles) is its own, not the installer's.
        if ($child.Name -ne "Shelfed.exe") { $tree[[int]$child.ProcessId] = $true }
      }
    }
    if ($n % 4 -eq 0) { Shot ("{0}-{1:d2}" -f $name, [int]($n / 4)) }
    $n++
    Start-Sleep -Milliseconds 150
  }
  $names = @($started.Keys | Sort-Object)
  Write-Host "${name}: the installer started $($names -join ', ')"
  $bad = $names | Where-Object { $consoles -contains $_.ToLower() }
  if ($bad) { Write-Host "::error::$name started console programs: $($bad -join ', ')"; $script:failed = $true }
  return $process
}

# 1. A first install, which opens Shelfed when it's done.
$first = Install "1-install" 120
if (-not (Test-Path $app)) { Write-Host "::error::Shelfed wasn't installed at $app"; exit 1 }
if (-not $first.HasExited) { Write-Host "::error::The installer didn't finish"; $failed = $true }
Start-Sleep -Seconds 6
Shot "1-opened"
if (-not (Get-Process Shelfed -ErrorAction SilentlyContinue)) { Write-Host "::error::Shelfed didn't open after installing"; $failed = $true }

# 2. Installing again while Shelfed is open: it asks to close Shelfed, and waits.
# The installer's check rests on Windows refusing to open a running program for writing.
try { [System.IO.File]::Open($app, "Open", "Write").Dispose(); Write-Host "::error::Shelfed.exe opened for writing while running"; $failed = $true }
catch { Write-Host "While Shelfed runs, Shelfed.exe can't be opened for writing, as the check expects." }
$before = (Get-Item $app).LastWriteTime
$second = Install "2-while-open" 8
Shot "2-asks-to-close"
if ((Get-Item $app).LastWriteTime -ne $before) { Write-Host "::error::The installer replaced Shelfed.exe while it was running"; $failed = $true }
$prompt = Get-Process -Id $second.Id -ErrorAction SilentlyContinue | Select-Object -ExpandProperty MainWindowTitle
Write-Host "While Shelfed was open, the installer's window said: $prompt"
if ($second.HasExited) { Write-Host "::error::The installer went ahead while Shelfed was open" ; $failed = $true }
Stop-Process -Id $second.Id -Force -ErrorAction SilentlyContinue

# 3. Installing over a closed Shelfed, as an update does.
Get-Process Shelfed -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2
$third = Install "3-over-closed" 120
if (-not $third.HasExited) { Write-Host "::error::Installing over a closed Shelfed didn't finish"; $failed = $true }
Start-Sleep -Seconds 4
Shot "3-opened"
Get-Process Shelfed -ErrorAction SilentlyContinue | Stop-Process -Force

if ($failed) { exit 1 }
Write-Host "The installer started no console programs."
