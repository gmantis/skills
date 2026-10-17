# join-logs.ps1 - join an HWiNFO CSV to log-activity.ps1 output by timestamp, so package power
# can be correlated with wakeup rates and named processes.
#
#   .\join-logs.ps1 -Hwinfo busy.CSV -Activity act_sys_20260731_141415.csv -Processes act_proc_20260731_141415.csv
#
# Param names are deliberately distinct from any accumulator (pitfalls #9).

param(
    [Parameter(Mandatory)][string]$Hwinfo,
    [Parameter(Mandatory)][string]$Activity,
    [string]$Processes,
    [double]$ToleranceSec = 1.5
)

. (Join-Path $PSScriptRoot 'hwinfo-lib.ps1')

$logHw = Read-HwinfoCsv -Path $Hwinfo
Write-Host "HWiNFO   : $($logHw.Rows.Count) valid / $($logHw.Total) candidate rows (dropped $($logHw.Dropped))"

$iP   = Get-ColIndex -Log $logHw -Pattern 'CPU Package Power [[]W[]]'
$iIA  = Get-ColIndex -Log $logHw -Pattern 'IA Cores Power*'
$iT   = Get-ColIndex -Log $logHw -Pattern 'CPU Package [[]C[]]'
$iUse = Get-ColIndex -Log $logHw -Pattern 'Total CPU Usage*'
$iEff = Get-ColIndex -Log $logHw -Pattern 'Average Effective Clock*'
$iThr = Get-ColIndex -Log $logHw -Pattern 'Package/Ring Thermal Throttling*'
$iC8  = Get-ColIndex -Log $logHw -Pattern 'Package C8 Residency*'

function ToNum($s) { $d = 0.0; if ([double]::TryParse($s, [ref]$d)) { return $d }; return 0.0 }

$hwPoints = foreach ($r in $logHw.Rows) {
    [pscustomobject]@{
        Sec = (ConvertTo-SecondOfDay -TimeText $r[1]); Time = $r[1]
        P = (ToNum $r[$iP]); IA = (ToNum $r[$iIA]); T = (ToNum $r[$iT])
        Use = (ToNum $r[$iUse]); Eff = (ToNum $r[$iEff]); C8 = (ToNum $r[$iC8])
        Thr = ($r[$iThr] -eq 'Yes')
    }
}

$actPoints = Import-Csv $Activity | ForEach-Object {
    [pscustomobject]@{
        Sec = (ConvertTo-SecondOfDay -TimeText $_.HwinfoTime)
        Ctx = [double]$_.CtxSwPerSec; Intr = [double]$_.IntrPerSec
        Dpc = [double]$_.DpcPerSec; Sys = [double]$_.SysCallsPerSec
        Cpu = [double]$_.CpuPctAllCores; Top = $_.TopProc; TopPct = [double]$_.TopProcPct
        Timer = [double]$_.TimerResMs
    }
}
Write-Host "Activity : $($actPoints.Count) samples"

# nearest-neighbour join
$actSorted = @($actPoints | Sort-Object Sec)
$pairs = New-Object System.Collections.Generic.List[object]
foreach ($h in $hwPoints) {
    $best = $null; $bd = [double]::MaxValue
    foreach ($a in $actSorted) {
        $d = [math]::Abs($a.Sec - $h.Sec)
        if ($d -lt $bd) { $bd = $d; $best = $a }
        if (($a.Sec - $h.Sec) -gt ($ToleranceSec + 1)) { break }
    }
    if ($best -and $bd -le $ToleranceSec) {
        $pairs.Add([pscustomobject]@{
            Time = $h.Time; P = $h.P; IA = $h.IA; T = $h.T; Use = $h.Use; Eff = $h.Eff; C8 = $h.C8; Thr = $h.Thr
            Ctx = $best.Ctx; Intr = $best.Intr; Dpc = $best.Dpc; Sys = $best.Sys
            Cpu = $best.Cpu; Top = $best.Top; TopPct = $best.TopPct; Timer = $best.Timer
        })
    }
}
Write-Host "Joined   : $($pairs.Count) paired samples`n"
if ($pairs.Count -lt 10) { Write-Host "Too few pairs - do the two logs actually overlap in time?" -ForegroundColor Red; exit 1 }

function Avg($vals) { if (-not $vals -or $vals.Count -eq 0) { return 0 }; return [math]::Round((($vals | Measure-Object -Average).Average), 1) }

Write-Host "=== CORRELATION vs CPU Package Power ===" -ForegroundColor Cyan
$P = @($pairs.P)
foreach ($m in @(
    @{ N = 'IA Cores Power';     V = @($pairs.IA) },
    @{ N = 'Total CPU Usage %';  V = @($pairs.Use) },
    @{ N = 'Avg Effective Clock'; V = @($pairs.Eff) },
    @{ N = 'Context switches/s'; V = @($pairs.Ctx) },
    @{ N = 'Interrupts/s';       V = @($pairs.Intr) },
    @{ N = 'DPCs queued/s';      V = @($pairs.Dpc) },
    @{ N = 'Syscalls/s';         V = @($pairs.Sys) },
    @{ N = 'Package temp';       V = @($pairs.T) }
)) {
    $r = Get-Correlation -X $P -Y $m.V
    "  {0,-22} r = {1}" -f $m.N, $r
}

Write-Host "`n=== POWER BINNED vs WAKEUP RATES ===" -ForegroundColor Cyan
Write-Host "  Power tracking wakeups more than utilization is the signature of the problem." -ForegroundColor DarkGray
"  {0,-11} {1,5} {2,7} {3,7} {4,7} {5,10} {6,10} {7,8}" -f 'bin', 'n', 'avgW', 'avgT', 'cpu%', 'ctxsw/s', 'intr/s', 'dpc/s'
foreach ($b in @(@(0, 8), @(8, 12), @(12, 16), @(16, 22), @(22, 30), @(30, 100))) {
    $sel = @($pairs | Where-Object { $_.P -ge $b[0] -and $_.P -lt $b[1] })
    if ($sel.Count -eq 0) { continue }
    "  {0,-11} {1,5} {2,7} {3,7} {4,7} {5,10} {6,10} {7,8}" -f "$($b[0])-$($b[1])W", $sel.Count,
        (Avg @($sel.P)), (Avg @($sel.T)), (Avg @($sel.Cpu)), (Avg @($sel.Ctx)), (Avg @($sel.Intr)), (Avg @($sel.Dpc))
}

Write-Host "`n=== TOP 10 HIGHEST-POWER SAMPLES ===" -ForegroundColor Cyan
"  {0,-14} {1,6} {2,5} {3,6} {4,7} {5,9} {6,9} {7,8} {8,-18} {9}" -f 'time','pkgW','T','use%','cpu%','ctxsw/s','intr/s','timer','topProcess','top%'
$pairs | Sort-Object P -Descending | Select-Object -First 10 | ForEach-Object {
    "  {0,-14} {1,6} {2,5} {3,6} {4,7} {5,9} {6,9} {7,8} {8,-18} {9}" -f $_.Time,
        [math]::Round($_.P,1), $_.T, $_.Use, [math]::Round($_.Cpu,1), [int]$_.Ctx, [int]$_.Intr, $_.Timer, $_.Top, $_.TopPct
}

# ---- per-process attribution: hottest vs coolest windows ----
if ($Processes -and (Test-Path $Processes)) {
    $K = [math]::Min(40, [int]($pairs.Count / 3))
    $hiTimes = @(($pairs | Sort-Object P -Descending | Select-Object -First $K).Time | ForEach-Object { ConvertTo-SecondOfDay -TimeText $_ })
    $loTimes = @(($pairs | Sort-Object P | Select-Object -First $K).Time | ForEach-Object { ConvertTo-SecondOfDay -TimeText $_ })
    $pr = Import-Csv $Processes | ForEach-Object {
        [pscustomobject]@{ Sec = (ConvertTo-SecondOfDay -TimeText $_.HwinfoTime); Process = $_.Process; Pct = [double]$_.PctOfOneCore }
    }
    function Get-Attribution($secs) {
        $acc = @{}
        foreach ($row in $pr) {
            foreach ($s in $secs) {
                if ([math]::Abs($row.Sec - $s) -le $ToleranceSec) {
                    if (-not $acc.ContainsKey($row.Process)) { $acc[$row.Process] = 0.0 }
                    $acc[$row.Process] += $row.Pct
                    break
                }
            }
        }
        return $acc
    }
    $hi = Get-Attribution $hiTimes
    $lo = Get-Attribution $loTimes
    Write-Host "`n=== PROCESS ATTRIBUTION: $K hottest vs $K coolest samples (avg % of one core) ===" -ForegroundColor Cyan
    "  {0,-24} {1,12} {2,12}" -f 'process', 'HIGH-power', 'LOW-power'
    $names = @($hi.Keys + $lo.Keys | Sort-Object -Unique)
    $attrRows = foreach ($n in $names) {
        $h = 0.0; $l = 0.0
        if ($hi.ContainsKey($n)) { $h = $hi[$n] / $K }
        if ($lo.ContainsKey($n)) { $l = $lo[$n] / $K }
        [pscustomobject]@{ N = $n; H = [math]::Round($h, 2); L = [math]::Round($l, 2) }
    }
    $attrRows | Sort-Object H -Descending | Select-Object -First 15 |
        ForEach-Object { "  {0,-24} {1,12} {2,12}" -f $_.N, $_.H, $_.L }
    Write-Host "`n  A process with a HIGH-power figure similar to its LOW-power figure is a fixed tax" -ForegroundColor DarkGray
    Write-Host "  (monitoring tools behave this way). Big gaps indicate the actual load drivers." -ForegroundColor DarkGray
    Write-Host "  If you ran diagnostics during this window, the ranking is contaminated - say so." -ForegroundColor DarkGray
}
