# collect-diag.ps1 - elevated diagnostics collector. Portable; nothing machine-specific.
# Run as Administrator. Takes ~2 min. Writes everything under -OutDir (default .\diag).
#
#   .\collect-diag.ps1
#   .\collect-diag.ps1 -OutDir C:\temp\thermal\diag -Quick   # skip the 60 s energy trace
#
# The energy report is the single highest-value artefact: it NAMES the processes holding
# high-resolution timers and the USB devices refusing to suspend.

param(
    [string]$OutDir = '.\diag',
    [switch]$Quick
)

$ErrorActionPreference = 'Continue'
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$log = Join-Path $OutDir 'collect.log'

function Say($m) {
    $line = "[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $m
    Write-Host $line
    Add-Content -Path $log -Value $line -Encoding utf8
}

$ident = [Security.Principal.WindowsIdentity]::GetCurrent()
$elev = (New-Object Security.Principal.WindowsPrincipal($ident)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
Say "=== collect-diag start (elevated=$elev) ==="
if (-not $elev) {
    Write-Host "NOT ELEVATED. powercfg /energy, /sleepstudy, /requests, /srumutil, /waketimers will all fail." -ForegroundColor Red
    Write-Host "Re-run as Administrator:" -ForegroundColor Yellow
    Write-Host "  Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','$($MyInvocation.MyCommand.Path)'" -ForegroundColor DarkGray
    exit 1
}

# ---------- machine identity ----------
Say "machine identity"
$cs = Get-CimInstance Win32_ComputerSystem
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$bios = Get-CimInstance Win32_BIOS
@(
    "Manufacturer : $($cs.Manufacturer)"
    "Model        : $($cs.Model)"
    "CPU          : $($cpu.Name.Trim())"
    "Cores/Logical: $($cpu.NumberOfCores)/$($cpu.NumberOfLogicalProcessors)"
    "BIOS         : $($bios.SMBIOSBIOSVersion)  $($bios.ReleaseDate)"
    "OS Build     : $((Get-CimInstance Win32_OperatingSystem).BuildNumber)"
) | Out-File "$OutDir\machine.txt" -Encoding utf8

# ---------- instant powercfg queries ----------
Say "powercfg /requests (what is blocking idle right now)"
powercfg /requests 2>&1 | Out-File "$OutDir\requests.txt" -Encoding utf8
Say "powercfg /waketimers"
powercfg /waketimers 2>&1 | Out-File "$OutDir\waketimers.txt" -Encoding utf8
Say "powercfg /lastwake"
powercfg /lastwake 2>&1 | Out-File "$OutDir\lastwake.txt" -Encoding utf8
Say "powercfg /devicequery wake_armed"
powercfg /devicequery wake_armed 2>&1 | Out-File "$OutDir\wake_armed.txt" -Encoding utf8

# ---------- SRUM: multi-day per-app energy ----------
Say "powercfg /srumutil (per-app energy, ~7 days)"
powercfg /srumutil /output "$OutDir\srum.csv" /csv 2>&1 | Out-File "$OutDir\srumutil.log" -Encoding utf8

# ---------- sleepstudy + battery ----------
Say "powercfg /sleepstudy"
powercfg /sleepstudy /output "$OutDir\sleepstudy.html" 2>&1 | Out-File "$OutDir\sleepstudy.log" -Encoding utf8
Say "powercfg /batteryreport"
powercfg /batteryreport /output "$OutDir\battery.html" 2>&1 | Out-Null

# ---------- wakeup counters ----------
Say "sampling wakeup counters (10 s)"
$ctrs = @(
    '\System\Context Switches/sec', '\System\System Calls/sec', '\System\Processor Queue Length',
    '\Processor Information(_Total)\Interrupts/sec', '\Processor Information(_Total)\DPCs Queued/sec',
    '\Processor Information(_Total)\% Processor Time', '\Processor Information(_Total)\% Idle Time',
    '\Processor Information(_Total)\% Processor Performance'
)
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
    $outLines = foreach ($k in ($agg.Keys | Sort-Object)) {
        "{0,-52} avg={1,12:N0}  min={2,12:N0}  max={3,12:N0}" -f $k,
            (($agg[$k] | Measure-Object -Average).Average),
            (($agg[$k] | Measure-Object -Minimum).Minimum),
            (($agg[$k] | Measure-Object -Maximum).Maximum)
    }
    $outLines | Out-File "$OutDir\wakeup-counters.txt" -Encoding utf8
} catch { Say "counter sample failed: $_" }

# ---------- per-process CPU (reliable: kernel CPU-time deltas) ----------
Say "per-process CPU over 15 s"
$snap = @{}
Get-Process | ForEach-Object { try { $snap[$_.Id] = $_.TotalProcessorTime.TotalMilliseconds } catch {} }
Start-Sleep -Seconds 15
$procRows = @()
Get-Process | ForEach-Object {
    $p = $_
    try { $ms = $p.TotalProcessorTime.TotalMilliseconds } catch { return }
    if ($snap.ContainsKey($p.Id)) {
        $d = $ms - $snap[$p.Id]
        if ($d -gt 0) {
            $path = ''
            try { $path = $p.Path } catch {}
            $procRows += [pscustomobject]@{
                PID = $p.Id; Name = $p.ProcessName; CpuMs = [math]::Round($d, 0)
                PctOfOneCore = [math]::Round($d / 15000 * 100, 2); Threads = $p.Threads.Count
                WorkingSetMB = [math]::Round($p.WorkingSet64 / 1MB, 1); Path = $path
            }
        }
    }
}
$procRows | Sort-Object CpuMs -Descending | Export-Csv "$OutDir\per-process-cpu.csv" -NoTypeInformation -Encoding utf8
$procRows | Sort-Object CpuMs -Descending | Select-Object -First 30 |
    Format-Table PID, Name, CpuMs, PctOfOneCore, Threads, WorkingSetMB -AutoSize |
    Out-File "$OutDir\per-process-cpu.txt" -Encoding utf8

# ---------- svchost -> service map with CPU ----------
Say "svchost service map"
$cpuByPid = @{}
foreach ($r in $procRows) { $cpuByPid[$r.PID] = $r.PctOfOneCore }
Get-CimInstance Win32_Service | Where-Object { $_.ProcessId -gt 0 } | ForEach-Object {
    $c = 0
    if ($cpuByPid.ContainsKey([int]$_.ProcessId)) { $c = $cpuByPid[[int]$_.ProcessId] }
    [pscustomobject]@{ PID = $_.ProcessId; Service = $_.Name; Display = $_.DisplayName; State = $_.State; StartMode = $_.StartMode; PctOfOneCore = $c }
} | Sort-Object PctOfOneCore -Descending | Export-Csv "$OutDir\services.csv" -NoTypeInformation -Encoding utf8

# ---------- power configuration ----------
Say "power configuration snapshot"
powercfg /getactivescheme 2>&1 | Out-File "$OutDir\powercfg-scheme.txt" -Encoding utf8
powercfg /a 2>&1 | Out-File "$OutDir\powercfg-scheme.txt" -Append -Encoding utf8
$ov = Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Power\User\PowerSchemes' -ErrorAction SilentlyContinue
"ActiveOverlayAcPowerScheme = $($ov.ActiveOverlayAcPowerScheme)" | Out-File "$OutDir\powercfg-scheme.txt" -Append -Encoding utf8
"ActiveOverlayDcPowerScheme = $($ov.ActiveOverlayDcPowerScheme)" | Out-File "$OutDir\powercfg-scheme.txt" -Append -Encoding utf8
"  (ded574b5=Best Performance | 00000000=Balanced | 961cc777=Best Power Efficiency)" | Out-File "$OutDir\powercfg-scheme.txt" -Append -Encoding utf8
powercfg -qh SCHEME_CURRENT SUB_PROCESSOR 2>&1 | Out-File "$OutDir\powercfg-processor.txt" -Encoding utf8

# ---------- VBS / Device Guard (report only) ----------
try {
    Get-CimInstance -ClassName Win32_DeviceGuard -Namespace root\Microsoft\Windows\DeviceGuard -ErrorAction Stop |
        Select-Object VirtualizationBasedSecurityStatus, SecurityServicesConfigured, SecurityServicesRunning, CodeIntegrityPolicyEnforcementStatus |
        Format-List | Out-File "$OutDir\deviceguard.txt" -Encoding utf8
    @"

Legend: VirtualizationBasedSecurityStatus 2 = Running
SecurityServices: 1=Credential Guard 2=HVCI 3=System Guard Secure Launch 4=SMM Firmware Measurement
CodeIntegrityPolicyEnforcementStatus 2 = Enforced
NOTE: policy-locked on managed machines. REPORT ONLY - do not disable.
"@ | Out-File "$OutDir\deviceguard.txt" -Append -Encoding utf8
} catch { Say "DeviceGuard query failed: $_" }

# ---------- USB / device topology ----------
Say "USB topology and disks"
Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue | Where-Object { $_.InstanceId -like 'USB\*' } |
    Select-Object Status, Class, FriendlyName, Service, InstanceId |
    Sort-Object Class, FriendlyName | Export-Csv "$OutDir\usb-devices.csv" -NoTypeInformation -Encoding utf8
Get-Disk -ErrorAction SilentlyContinue | Select-Object Number, FriendlyName, BusType, Size, OperationalStatus |
    Format-Table -AutoSize | Out-File "$OutDir\disks.txt" -Encoding utf8
Get-NetAdapter -ErrorAction SilentlyContinue | Select-Object Name, InterfaceDescription, Status, LinkSpeed |
    Format-Table -AutoSize | Out-File "$OutDir\netadapters.txt" -Encoding utf8

# ---------- the big one ----------
if ($Quick) {
    Say "-Quick specified: skipping the 60 s energy trace (find-blockers.ps1 will have nothing to parse)"
} else {
    Say "powercfg /energy - 60 s trace. LEAVE THE MACHINE ALONE (no typing/mouse)."
    powercfg /energy /duration 60 /output "$OutDir\energy.html" 2>&1 | Out-File "$OutDir\energy.log" -Encoding utf8
}

Say "=== done -> $OutDir ==="
Get-ChildItem $OutDir | Select-Object Name, Length | Format-Table -AutoSize
Write-Host "`nNext: .\find-blockers.ps1 -DiagDir $OutDir" -ForegroundColor Yellow
