# log-activity.ps1 - sample wakeup rates + per-process CPU on HWiNFO's cadence so the two
# logs can be joined by timestamp. No elevation needed.
#
#   .\log-activity.ps1 -Minutes 10
#
# Start HWiNFO logging first, then this. Writes:
#   act_sys_<stamp>.csv    one row per sample (join key = HwinfoTime)
#   act_proc_<stamp>.csv   top-N processes per sample (long format)
#
# Uses RAW perf counters and computes deltas itself - formatted WMI rate values are unreliable
# on first query (pitfalls #10).

param(
    [double]$Minutes = 10,
    [int]$IntervalMs = 2000,          # match HWiNFO's global polling period
    [int]$TopN = 12,
    [string]$OutDir = '.'
)

$stamp   = Get-Date -Format 'yyyyMMdd_HHmmss'
$sysCsv  = Join-Path $OutDir "act_sys_$stamp.csv"
$procCsv = Join-Path $OutDir "act_proc_$stamp.csv"

Add-Type -Name TimerRes -Namespace ActApi -MemberDefinition @'
[DllImport("ntdll.dll")] public static extern int NtQueryTimerResolution(out uint Mx, out uint Mn, out uint Cur);
'@ -ErrorAction SilentlyContinue

function Get-TimerMs {
    $mx = 0; $mn = 0; $cur = 0
    try { [void][ActApi.TimerRes]::NtQueryTimerResolution([ref]$mx, [ref]$mn, [ref]$cur); return [math]::Round($cur / 10000.0, 3) }
    catch { return 0 }
}

$nCores = (Get-CimInstance Win32_ComputerSystem).NumberOfLogicalProcessors

Write-Host "=============================================================="
Write-Host " activity logger"
Write-Host "   duration     : $Minutes min @ ${IntervalMs} ms"
Write-Host "   logical CPUs : $nCores"
Write-Host "   timer now    : $(Get-TimerMs) ms"
Write-Host "   sys  csv     : $sysCsv"
Write-Host "   proc csv     : $procCsv"
Write-Host "   >>> make sure HWiNFO logging is already running <<<"
Write-Host "=============================================================="

function Get-SysRaw {
    $s = Get-CimInstance Win32_PerfRawData_PerfOS_System
    $p = Get-CimInstance Win32_PerfRawData_Counters_ProcessorInformation -Filter "Name='_Total'" -ErrorAction SilentlyContinue
    if (-not $p) { $p = Get-CimInstance Win32_PerfRawData_PerfOS_Processor -Filter "Name='_Total'" -ErrorAction SilentlyContinue }
    # NOTE: no `if` expressions inside the hashtable - PS 5.1 (pitfalls #8)
    $intr = 0.0; $dpc = 0.0
    if ($p) { $intr = [double]$p.InterruptsPersec; $dpc = [double]$p.DPCsQueuedPersec }
    [pscustomobject]@{
        T = [double]$s.Timestamp_Sys100NS
        Ctx = [double]$s.ContextSwitchesPersec
        Sys = [double]$s.SystemCallsPersec
        QLen = [int]$s.ProcessorQueueLength
        Procs = [int]$s.Processes
        Threads = [int]$s.Threads
        Intr = $intr
        Dpc = $dpc
    }
}

function Get-ProcRaw {
    $h = @{}
    foreach ($p in (Get-Process)) {
        try { $h["$($p.Id)|$($p.ProcessName)"] = $p.TotalProcessorTime.TotalMilliseconds } catch {}
    }
    return $h
}

'HwinfoTime,Iso,ElapsedSec,CtxSwPerSec,SysCallsPerSec,IntrPerSec,DpcPerSec,CpuPctAllCores,CpuPctOneCoreSum,ProcQueueLen,Processes,Threads,TopProc,TopProcPct,TimerResMs' |
    Out-File $sysCsv -Encoding utf8
'HwinfoTime,Iso,PID,Process,PctOfOneCore,CpuMs' | Out-File $procCsv -Encoding utf8

$prevSys = Get-SysRaw
$prevProc = Get-ProcRaw
$t0 = Get-Date
$deadline = $t0.AddMinutes($Minutes)
$n = 0

while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds $IntervalMs
    $now = Get-Date
    $s = Get-SysRaw
    $dt = ($s.T - $prevSys.T) / 1e7
    if ($dt -le 0) { $prevSys = $s; continue }

    $ctxRate  = [math]::Round(($s.Ctx  - $prevSys.Ctx)  / $dt, 0)
    $sysRate  = [math]::Round(($s.Sys  - $prevSys.Sys)  / $dt, 0)
    $intrRate = [math]::Round(($s.Intr - $prevSys.Intr) / $dt, 0)
    $dpcRate  = [math]::Round(($s.Dpc  - $prevSys.Dpc)  / $dt, 0)

    $pnow = Get-ProcRaw
    $rows = @()
    foreach ($k in $pnow.Keys) {
        if (-not $prevProc.ContainsKey($k)) { continue }
        $d = $pnow[$k] - $prevProc[$k]
        if ($d -le 0) { continue }
        $parts = $k -split '\|', 2
        $rows += [pscustomobject]@{ PID = [int]$parts[0]; Name = $parts[1]; CpuMs = $d; Pct = ($d / ($dt * 1000) * 100) }
    }
    $sumOne = ($rows | Measure-Object -Property Pct -Sum).Sum
    if (-not $sumOne) { $sumOne = 0 }
    $cpuAll = $sumOne / $nCores

    $top = $rows | Sort-Object Pct -Descending | Select-Object -First $TopN
    $topName = ''; $topPct = 0
    if ($top.Count -gt 0) { $topName = $top[0].Name; $topPct = [math]::Round($top[0].Pct, 1) }

    # HWiNFO writes H:m:s.fff - emit the same shape so the join is trivial
    $hw = "{0}:{1}:{2}.{3:000}" -f $now.Hour, $now.Minute, $now.Second, $now.Millisecond
    $timerMs = Get-TimerMs

    ('{0},{1},{2},{3},{4},{5},{6},{7},{8},{9},{10},{11},{12},{13},{14}' -f `
        $hw, $now.ToString('yyyy-MM-dd HH:mm:ss.fff'), [math]::Round(($now - $t0).TotalSeconds, 1),
        $ctxRate, $sysRate, $intrRate, $dpcRate,
        [math]::Round($cpuAll, 2), [math]::Round($sumOne, 2),
        $s.QLen, $s.Procs, $s.Threads, $topName, $topPct, $timerMs) |
        Out-File $sysCsv -Append -Encoding utf8

    foreach ($r in $top) {
        ('{0},{1},{2},{3},{4},{5}' -f $hw, $now.ToString('yyyy-MM-dd HH:mm:ss.fff'), $r.PID, $r.Name,
            [math]::Round($r.Pct, 2), [math]::Round($r.CpuMs, 0)) | Out-File $procCsv -Append -Encoding utf8
    }

    $n++
    Write-Host ("[{0,4}] {1}  cpu={2,5:N1}%  ctx={3,7:N0}/s  intr={4,6:N0}/s  dpc={5,6:N0}/s  timer={6,6}ms  top={7} ({8}%)" -f `
        $n, $now.ToString('HH:mm:ss'), $cpuAll, $ctxRate, $intrRate, $dpcRate, $timerMs, $topName, $topPct)

    $prevSys = $s; $prevProc = $pnow
}

Write-Host ""
Write-Host "done - $n samples"
Write-Host "  $sysCsv"
Write-Host "  $procCsv"
