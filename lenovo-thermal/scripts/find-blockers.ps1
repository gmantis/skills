# find-blockers.ps1 - discover THIS machine's wakeup blockers from the energy report.
# Portable: resolves device IDs to real PnP instance IDs on the local machine. Hardcodes nothing.
# Changes nothing. Run collect-diag.ps1 first to produce diag\energy.html.
#
#   .\find-blockers.ps1 -DiagDir .\diag

param([string]$DiagDir = '.\diag')

$ErrorActionPreference = 'Continue'
$energy = Join-Path $DiagDir 'energy.html'
if (-not (Test-Path $energy)) {
    Write-Host "No $energy - run collect-diag.ps1 (elevated) first." -ForegroundColor Red
    exit 1
}

# ---- flatten the HTML report to text lines ----
$raw = Get-Content $energy -Raw
$txt = $raw -replace '(?s)<script.*?</script>', '' -replace '(?s)<style.*?</style>', ''
$txt = $txt -replace '<[^>]+>', "`n"
$txt = [System.Net.WebUtility]::HtmlDecode($txt)
$lines = @($txt -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' })

function Get-FieldAfter {
    param([int]$Start, [string]$Label, [int]$Window = 6)
    for ($i = $Start; $i -lt [math]::Min($Start + $Window, $lines.Count); $i++) {
        if ($lines[$i] -eq $Label -and ($i + 1) -lt $lines.Count) { return $lines[$i + 1] }
    }
    return $null
}

$allPnp = Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue

# =====================================================================
Write-Host "`n$("=" * 74)" -ForegroundColor Cyan
Write-Host " 1. USB DEVICES NOT ENTERING SELECTIVE SUSPEND" -ForegroundColor Cyan
Write-Host ("=" * 74) -ForegroundColor Cyan
Write-Host " These block deep package C-states. powercfg says so explicitly." -ForegroundColor DarkGray

$usbFound = @()
for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -notlike 'USB Suspend:USB Device not Entering Selective Suspend*') { continue }
    $devId = $null; $name = $null; $port = $null
    # Scan only until the NEXT report entry, and take the FIRST occurrence of each field.
    # Without both guards the following block's fields bleed in and names end up
    # paired with the wrong Device ID.
    for ($j = $i + 1; $j -lt [math]::Min($i + 24, $lines.Count); $j++) {
        if ($lines[$j] -match '^(USB Suspend:|CPU Utilization:|Platform Timer|Device Drivers:|Power Policy:|Battery:|System Availability|Platform Power)') { break }
        if (($j + 1) -ge $lines.Count) { break }
        if (-not $devId -and $lines[$j] -eq 'Device ID')   { $devId = $lines[$j + 1] }
        if (-not $name  -and $lines[$j] -eq 'Device Name') { $name  = $lines[$j + 1] }
        if (-not $port  -and $lines[$j] -eq 'Port Path')   { $port  = $lines[$j + 1] }
    }
    if ($devId) { $usbFound += [pscustomobject]@{ DeviceId = $devId; Name = $name; PortPath = $port } }
}

if (-not $usbFound) {
    Write-Host "  none reported - good." -ForegroundColor Green
} else {
    Write-Host ""
    foreach ($u in $usbFound) {
        $match = $allPnp | Where-Object { $_.InstanceId -like "*$($u.DeviceId)*" } | Select-Object -First 1
        $cls = '?'; $inst = '(not resolved)'; $svc = ''; $friendly = $u.Name
        if ($match) {
            $cls = $match.Class; $inst = $match.InstanceId; $svc = $match.Service
            # The resolved PnP name is authoritative; the report name is only a fallback.
            if ($match.FriendlyName) { $friendly = $match.FriendlyName }
        }
        # safety classification (MEDIA/usbaudio = headsets - user-facing, protect it)
        $safety = 'CANDIDATE'
        if ($cls -match 'HIDClass|Keyboard|Mouse|Camera|Image|Biometric|SmartCard|Bluetooth|MEDIA|AudioEndpoint' -or $svc -match 'usbaudio|HidUsb|usbvideo') { $safety = 'DO NOT DISABLE' }
        elseif ($svc -match 'USBHUB' -or $friendly -like '*Hub*') { $safety = 'HUB - leave alone' }
        $col = 'Yellow'
        if ($safety -eq 'DO NOT DISABLE') { $col = 'Red' }
        if ($safety -eq 'CANDIDATE') { $col = 'Green' }
        Write-Host ("  [{0}]" -f $safety) -ForegroundColor $col
        "      name     : $friendly"
        "      class    : $cls   service: $svc"
        "      port     : $($u.PortPath)   (report name: $($u.Name))"
        "      instance : $inst"
    }
    Write-Host "`n  Only 'CANDIDATE' entries are safe to disable, and only if genuinely unused." -ForegroundColor DarkGray
    Write-Host "  Classic offenders: empty card readers, unused USB NICs on docks/dongles." -ForegroundColor DarkGray
}

# ---- corroborate: empty removable drives ----
Write-Host "`n  -- removable/USB disks with no media (prime suspects) --" -ForegroundColor White
$disks = Get-Disk -ErrorAction SilentlyContinue | Where-Object { $_.BusType -eq 'USB' }
if ($disks) { $disks | Select-Object Number, FriendlyName, BusType, OperationalStatus | Format-Table -AutoSize }
else { "    none" }

# ---- corroborate: disconnected network adapters ----
Write-Host "  -- network adapters that are up vs idle --" -ForegroundColor White
Get-NetAdapter -ErrorAction SilentlyContinue |
    Where-Object { $_.Status -ne 'Not Present' } |
    Select-Object Name, InterfaceDescription, Status, LinkSpeed |
    Sort-Object Status | Format-Table -AutoSize
Write-Host "    A 'Disconnected' USB NIC still keeps its hub awake. Disabling it is often free." -ForegroundColor DarkGray

# =====================================================================
Write-Host "`n$("=" * 74)" -ForegroundColor Cyan
Write-Host " 2. PROCESSES HOLDING A HIGH-RESOLUTION PLATFORM TIMER" -ForegroundColor Cyan
Write-Host ("=" * 74) -ForegroundColor Cyan

$timerFound = @{}
for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -notlike 'Platform Timer Resolution:Outstanding Timer Request*') { continue }
    $period = $null; $procPath = $null; $procPid = $null
    for ($j = $i; $j -lt [math]::Min($i + 12, $lines.Count); $j++) {
        if ($lines[$j] -eq 'Requested Period' -and ($j + 1) -lt $lines.Count) { $period = $lines[$j + 1] }
        if ($lines[$j] -eq 'Requesting Process ID' -and ($j + 1) -lt $lines.Count) { $procPid = $lines[$j + 1] }
        if ($lines[$j] -eq 'Requesting Process Path' -and ($j + 1) -lt $lines.Count) { $procPath = $lines[$j + 1] }
    }
    if ($procPath) {
        $ms = '?'
        if ($period) { $ms = [math]::Round([double]$period / 10000.0, 3) }
        $leaf = Split-Path $procPath -Leaf
        $key = $procPath
        if (-not $timerFound.ContainsKey($key)) { $timerFound[$key] = [pscustomobject]@{ Path = $procPath; Leaf = $leaf; Ms = $ms; Pids = @() } }
        $timerFound[$key].Pids += $procPid
    }
}

if (-not $timerFound.Count) {
    Write-Host "  none reported - good." -ForegroundColor Green
} else {
    foreach ($k in $timerFound.Keys) {
        $t = $timerFound[$k]
        Write-Host ("  {0}  requests {1} ms   (PIDs: {2})" -f $t.Leaf, $t.Ms, ($t.Pids -join ', ')) -ForegroundColor Yellow
        "      $($t.Path)"
        # build a -PathLike pattern that is safe (matches this install, not same-named binaries)
        $dir = Split-Path $t.Path -Parent
        $pattern = '*' + (Split-Path $dir -Leaf) + '\' + $t.Leaf
        Write-Host ("      fix: .\timer-quiet.ps1 -PathLike '{0}' -Persist" -f $pattern) -ForegroundColor Green
    }
    Write-Host "`n  Default timer is 15.625 ms. A 1 ms request means ~15x the timer tick rate." -ForegroundColor DarkGray
}

# =====================================================================
Write-Host "`n$("=" * 74)" -ForegroundColor Cyan
Write-Host " 3. OTHER FINDINGS FROM THE ENERGY REPORT" -ForegroundColor Cyan
Write-Host ("=" * 74) -ForegroundColor Cyan

foreach ($pat in @(
    @{ Match = 'CPU Utilization:Processor utilization is high'; Label = 'High average CPU utilization' },
    @{ Match = '802.11 Radio Power Policy is Maximum Performance*'; Label = 'WiFi radio at Maximum Performance (fixable)' },
    @{ Match = 'Device Drivers:*'; Label = 'Device with driver problem' },
    @{ Match = 'Platform Timer Resolution:Platform Timer Resolution*'; Label = 'Current platform timer' }
)) {
    $hits = @($lines | Where-Object { $_ -like $pat.Match })
    if ($hits) { Write-Host ("  [{0}] {1}" -f $hits.Count, $pat.Label) -ForegroundColor Yellow }
}

# per-core frequency floor (explains why waking a P-core is expensive)
Write-Host "`n  -- per-core nominal frequency / performance range --" -ForegroundColor White
$seen = @{}
for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -ne 'Nominal Frequency (MHz)') { continue }
    $nom = $lines[$i + 1]
    $maxp = Get-FieldAfter -Start $i -Label 'Maximum Performance Percentage' -Window 8
    $lowp = Get-FieldAfter -Start $i -Label 'Lowest Performance Percentage' -Window 8
    $key = "$nom|$maxp|$lowp"
    if ($seen.ContainsKey($key)) { $seen[$key]++ ; continue }
    $seen[$key] = 1
}
foreach ($k in $seen.Keys) {
    $p = $k -split '\|'
    $nomMhz = [double]$p[0]
    $maxMhz = '?'; $minMhz = '?'
    if ($p[1] -match '^\d+$') { $maxMhz = [math]::Round($nomMhz * [double]$p[1] / 100, 0) }
    if ($p[2] -match '^\d+$') { $minMhz = [math]::Round($nomMhz * [double]$p[2] / 100, 0) }
    "    {0,4} cores: nominal {1} MHz  range {2}-{3} MHz" -f $seen[$k], $nomMhz, $minMhz, $maxMhz
}
Write-Host "    A high MINIMUM on P-cores is why each wakeup is expensive." -ForegroundColor DarkGray

# =====================================================================
Write-Host "`n$("=" * 74)" -ForegroundColor Cyan
Write-Host " 4. SRUM: 7-DAY PER-APP ENERGY (who actually burns the power)" -ForegroundColor Cyan
Write-Host ("=" * 74) -ForegroundColor Cyan
$srum = Join-Path $DiagDir 'srum.csv'
if (-not (Test-Path $srum)) {
    Write-Host "  no srum.csv" -ForegroundColor DarkGray
} else {
    $sr = New-Object System.IO.StreamReader($srum)
    $hdr = ($sr.ReadLine() -split ',') | ForEach-Object { $_.Trim() }
    $iApp = [array]::IndexOf($hdr, 'AppId')
    $iTot = [array]::IndexOf($hdr, 'TotalEnergyConsumption')
    $iCpu = [array]::IndexOf($hdr, 'CPUEnergyConsumption')
    $agg = @{}
    while ($null -ne ($ln = $sr.ReadLine())) {
        $f = $ln -split ','
        if ($f.Count -le $iTot) { continue }
        $app = $f[$iApp].Trim()
        if ($app -eq '') { continue }
        if (-not $agg.ContainsKey($app)) { $agg[$app] = @(0.0, 0.0) }
        $agg[$app][0] += [double]($f[$iTot] -as [double])
        $agg[$app][1] += [double]($f[$iCpu] -as [double])
    }
    $sr.Close()

    $rapl = 0.0
    $rows = foreach ($k in $agg.Keys) {
        if ($k -like 'EMI_RAPL*' -or $k -eq 'Unknown') {
            if ($k -like '*_PKG') { $rapl = $agg[$k][0] }
            continue
        }
        [pscustomobject]@{ App = (Split-Path $k -Leaf); Total = [math]::Round($agg[$k][0] / 1000, 0); Cpu = [math]::Round($agg[$k][1] / 1000, 0) }
    }
    $grand = ($rows.Total | Measure-Object -Sum).Sum
    "  attributable app energy total: $grand units"
    $rows | Sort-Object Total -Descending | Select-Object -First 18 |
        ForEach-Object { "  {0,-52} {1,10}  {2,6}%" -f $_.App, $_.Total, [math]::Round(100 * $_.Total / $grand, 1) }

    $monRows = @($rows | Where-Object { $_.App -match 'Taskmgr|procexp|HWiNFO|perfmon|HWMonitor|CoreTemp' })
    if ($monRows) {
        $monSum = ($monRows.Total | Measure-Object -Sum).Sum
        Write-Host ("`n  !! monitoring tools = {0} units = {1}% of attributable energy" -f $monSum, [math]::Round(100 * $monSum / $grand, 1)) -ForegroundColor Yellow
    }
    $kern = @($rows | Where-Object { $_.App -eq 'System' -or $_.App -eq 'System Interrupts' })
    if ($kern) {
        $kSum = ($kern.Total | Measure-Object -Sum).Sum
        Write-Host ("  kernel + interrupts = {0} units = {1}% -> overhead, not applications" -f $kSum, [math]::Round(100 * $kSum / $grand, 1)) -ForegroundColor Yellow
    }
}

Write-Host "`n$("=" * 74)" -ForegroundColor Cyan
Write-Host " SECURITY / POLICY-LOCKED (report only - do NOT disable)" -ForegroundColor Red
Write-Host ("=" * 74) -ForegroundColor Cyan
$dg = Join-Path $DiagDir 'deviceguard.txt'
if (Test-Path $dg) { Get-Content $dg | Where-Object { $_ -match '\S' } | ForEach-Object { "  $_" } }
$secSvc = Get-Service -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match 'CSFalcon|Sense|WinDefend|webthreatdef|MsSec|PanGP' -and $_.Status -eq 'Running' }
if ($secSvc) { $secSvc | Select-Object Name, DisplayName, Status | Format-Table -AutoSize }
Write-Host "  The only actionable ask for IT: AV exclusions for dev dirs, model caches, node_modules." -ForegroundColor DarkGray
