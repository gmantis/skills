# quick-triage.ps1 - 2 minute read on whether the complaint is real and what shape it has.
# No elevation needed. Changes nothing.

$ErrorActionPreference = 'Continue'

Write-Host "`n=== MACHINE ===" -ForegroundColor Cyan
$cs = Get-CimInstance Win32_ComputerSystem
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$bios = Get-CimInstance Win32_BIOS
"  {0} {1}" -f $cs.Manufacturer, $cs.Model
"  {0}" -f $cpu.Name.Trim()
"  cores {0} / logical {1}   BIOS {2} ({3})" -f $cpu.NumberOfCores, $cpu.NumberOfLogicalProcessors, $bios.SMBIOSBIOSVersion, $bios.ReleaseDate.ToString('yyyy-MM-dd')
"  uptime {0:N1} h" -f ((Get-Date) - (Get-CimInstance Win32_OperatingSystem).LastBootUpTime).TotalHours

Write-Host "`n=== POWER POLICY ===" -ForegroundColor Cyan
$scheme = (powercfg /getactivescheme) -join ''
"  scheme  : $scheme"
$ovKey = 'HKLM:\SYSTEM\CurrentControlSet\Control\Power\User\PowerSchemes'
$ov = (Get-ItemProperty $ovKey -ErrorAction SilentlyContinue).ActiveOverlayAcPowerScheme
$modeName = '(unknown)'
if ([string]::IsNullOrEmpty($ov) -or $ov -like '00000000*') { $modeName = 'Balanced' }
elseif ($ov -eq 'ded574b5-45a0-4f42-8737-46345c09c238') { $modeName = 'Best Performance  <-- biases every wake to max turbo' }
elseif ($ov -eq '961cc777-2547-4f9d-8174-7d86181b8a7a') { $modeName = 'Best Power Efficiency' }
Write-Host "  OVERLAY : $modeName" -ForegroundColor Yellow
Write-Host "            (the overlay overrides the scheme - /getactivescheme hides this)" -ForegroundColor DarkGray

# hidden processor settings
$want = @{
    'Processor performance boost mode' = '0=Off 1=Enabled 2=Aggressive 3=EfficientEnabled'
    'Processor energy performance preference policy' = '0=perf .. 100=efficiency'
    'Maximum processor frequency' = 'MHz, 0=uncapped'
    'Maximum processor state' = '%'
    'Processor performance autonomous mode' = '1=HWP, EPP is the ramp control'
}
$out = powercfg -qh SCHEME_CURRENT SUB_PROCESSOR 2>&1
$cur = $null
foreach ($line in $out) {
    $m1 = [regex]::Match($line, 'Power Setting GUID:\s+\S+\s+\((.+)\)')
    if ($m1.Success) { $cur = $m1.Groups[1].Value; continue }
    $m2 = [regex]::Match($line, 'Current AC Power Setting Index:\s+(\S+)')
    if ($m2.Success -and $cur -and $want.ContainsKey($cur)) {
        "  {0,-48} AC={1,-6} [{2}]" -f $cur, [Convert]::ToInt32($m2.Groups[1].Value, 16), $want[$cur]
    }
}

Write-Host "`n=== PLATFORM TIMER ===" -ForegroundColor Cyan
try {
    Add-Type -Name TR -Namespace TriageApi -MemberDefinition @'
[DllImport("ntdll.dll")] public static extern int NtQueryTimerResolution(out uint Mx, out uint Mn, out uint Cur);
'@ -ErrorAction Stop
    $mx = 0; $mn = 0; $cur2 = 0
    [void][TriageApi.TR]::NtQueryTimerResolution([ref]$mx, [ref]$mn, [ref]$cur2)
    $ms = $cur2 / 10000.0
    $verdict = 'default (good)'
    if ($ms -lt 15) { $verdict = "RAISED - an app requested it. Run find-blockers.ps1" }
    "  current {0:N3} ms   (coarsest {1:N3}, finest {2:N3})   {3}" -f $ms, ($mx / 10000.0), ($mn / 10000.0), $verdict
} catch { "  query failed: $_" }

Write-Host "`n=== WAKEUP RATES (10 s sample) ===" -ForegroundColor Cyan
$ctrs = @(
    '\System\Context Switches/sec', '\System\System Calls/sec', '\System\Processor Queue Length',
    '\Processor Information(_Total)\Interrupts/sec', '\Processor Information(_Total)\DPCs Queued/sec',
    '\Processor Information(_Total)\% Processor Time', '\Processor Information(_Total)\% Idle Time',
    '\Processor Information(_Total)\% Processor Performance'
)
$limits = @{
    'context switches/sec' = 15000; 'interrupts/sec' = 8000
    'system calls/sec' = 120000; 'dpcs queued/sec' = 5000
}
try {
    $samples = Get-Counter -Counter $ctrs -SampleInterval 2 -MaxSamples 5 -ErrorAction Stop
    $agg = @{}
    foreach ($set in $samples) {
        foreach ($v in $set.CounterSamples) {
            $n = $v.Path -replace '.*\\\\[^\\]+\\', ''
            if (-not $agg.ContainsKey($n)) { $agg[$n] = @() }
            $agg[$n] += $v.CookedValue
        }
    }
    foreach ($k in ($agg.Keys | Sort-Object)) {
        $avg = ($agg[$k] | Measure-Object -Average).Average
        $flag = ''
        foreach ($lk in $limits.Keys) {
            if ($k -like "*$lk*" -and $avg -gt $limits[$lk]) { $flag = "  <-- HIGH (expect < $($limits[$lk]))" }
        }
        $col = 'Gray'
        if ($flag) { $col = 'Red' }
        Write-Host ("  {0,-50} {1,12:N0}{2}" -f $k, $avg, $flag) -ForegroundColor $col
    }
} catch { "  counter sample failed: $_" }

Write-Host "`n=== TOP CPU PROCESSES (10 s) ===" -ForegroundColor Cyan
$snap = @{}
Get-Process | ForEach-Object { try { $snap[$_.Id] = $_.TotalProcessorTime.TotalMilliseconds } catch {} }
Start-Sleep -Seconds 10
$rows = @()
Get-Process | ForEach-Object {
    $p = $_
    try { $ms2 = $p.TotalProcessorTime.TotalMilliseconds } catch { return }
    if ($snap.ContainsKey($p.Id)) {
        $d = $ms2 - $snap[$p.Id]
        if ($d -gt 0) { $rows += [pscustomobject]@{ PID = $p.Id; Name = $p.ProcessName; PctOneCore = [math]::Round($d / 10000 * 100, 2) } }
    }
}
$rows | Sort-Object PctOneCore -Descending | Select-Object -First 12 | Format-Table -AutoSize
$tot = ($rows.PctOneCore | Measure-Object -Sum).Sum
"  total {0}% of one core = {1}% of all {2} logical CPUs" -f [math]::Round($tot,1), [math]::Round($tot / $cpu.NumberOfLogicalProcessors, 1), $cpu.NumberOfLogicalProcessors

# monitoring-tool self-check
$mon = $rows | Where-Object { $_.Name -match 'Taskmgr|procexp|HWiNFO|perfmon|CoreTemp|HWMonitor' }
if ($mon) {
    $ms3 = ($mon.PctOneCore | Measure-Object -Sum).Sum
    Write-Host ("`n  !! monitoring tools are using {0}% of one core - close them before measuring." -f [math]::Round($ms3,1)) -ForegroundColor Yellow
    $mon | Format-Table -AutoSize
}

Write-Host "`nNext: capture idle + busy HWiNFO logs (Stage 1), then run collect-diag.ps1 elevated." -ForegroundColor DarkGray
