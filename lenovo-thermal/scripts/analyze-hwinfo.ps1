# analyze-hwinfo.ps1 - the main analysis. Portable, no machine-specific values.
#
#   .\analyze-hwinfo.ps1 -Idle idle.CSV -Busy busy.CSV     # full analysis + thermal resistance
#   .\analyze-hwinfo.ps1 -Idle idle.CSV                    # single log
#   .\analyze-hwinfo.ps1 -Idle after.CSV -Compare before.CSV   # before/after delta
#
# Note the param names are deliberately NOT reused as accumulators (pitfalls #9).

param(
    [Parameter(Mandatory)][string]$Idle,
    [string]$Busy,
    [string]$Compare
)

. (Join-Path $PSScriptRoot 'hwinfo-lib.ps1')

# ---- column patterns. '[C]' not the degree sign - see pitfalls #2 ----
$PAT = @{
    PkgW   = 'CPU Package Power [[]W[]]'
    IaW    = 'IA Cores Power*'
    SaW    = 'System Agent Power*'
    GtW    = 'GT Cores Power*'
    SysW   = 'Total System Power*'
    PkgT   = 'CPU Package [[]C[]]'
    CoreT  = 'Core Max [[]C[]]'
    CoreAvgT = 'Core Temperatures (avg)*'
    DistTj = 'Core Distance to TjMAX (avg)*'
    Use    = 'Total CPU Usage*'
    Util   = 'Total CPU Utility*'
    EffClk = 'Average Effective Clock*'
    PL1d   = 'PL1 Power Limit (Dynamic)*'
    PL1s   = 'PL1 Power Limit (Static)*'
    PL2d   = 'PL2 Power Limit (Dynamic)*'
    PC2    = 'Package C2 Residency*'
    PC6    = 'Package C6 Residency*'
    PC8    = 'Package C8 Residency*'
    GpuUse = 'GPU Total Usage*'
    GpuMedia = 'GPU Media Engine Usage*'
    NpuUse = 'NPU Total Usage*'
    DiskAct = 'Total Activity*'
    NetDl  = 'Current DL rate*'
    DrvT   = 'Drive Temperature [[]C[]]'
    PchT   = 'PCH Temperature [[]C[]]'
}
$FLAGS = @{
    ThrPkg = 'Package/Ring Thermal Throttling*'
    PlePkg = 'Package/Ring Power Limit Exceeded*'
    ThrCore = 'Core Thermal Throttling (avg)*'
    MaxTurbo = 'IA: Max Turbo Limit*'
    Ratl   = 'IA: Running Average Thermal Limit*'
    Prochot = 'IA: PROCHOT*'
    Edp    = 'IA: Electrical Design Point*'
}

function Show-LogSummary {
    param($Log, [string]$Label)

    Write-Host ""
    Write-Host ("=" * 74) -ForegroundColor Cyan
    Write-Host " $Label" -ForegroundColor Cyan
    Write-Host ("=" * 74) -ForegroundColor Cyan
    $pctDrop = 0
    if ($Log.Total -gt 0) { $pctDrop = [math]::Round(100.0 * $Log.Dropped / $Log.Total, 1) }
    "  samples: $($Log.Rows.Count) valid / $($Log.Total) candidate   (dropped $($Log.Dropped) = $pctDrop% misaligned)"
    if ($Log.Rows.Count -gt 0) {
        "  span   : $($Log.Rows[0][1])  ->  $($Log.Rows[-1][1])"
    }
    if ($Log.FanCol -lt 0) { "  fan    : no fan/RPM sensor exposed (normal on many ThinkPads - do not chase it)" }
    else { "  fan    : $($Log.Header[$Log.FanCol])" }

    Write-Host "`n  -- key sensors --" -ForegroundColor White
    "  {0,-26} {1,8} {2,8} {3,8} {4,8} {5,8}" -f 'sensor','avg','min','p50','p95','max'
    foreach ($k in 'PkgW','IaW','SaW','GtW','SysW','PkgT','CoreT','Use','Util','EffClk','PL1d','PL2d','GpuUse','GpuMedia','NpuUse','DrvT','PchT') {
        $s = Get-ColStats -Log $Log -Pattern $PAT[$k]
        if ($s) { "  {0,-26} {1,8} {2,8} {3,8} {4,8} {5,8}" -f $s.Name, $s.Avg, $s.Min, $s.P50, $s.P95, $s.Max }
    }

    # ---- TjMax derivation (pitfalls #7) ----
    $ct = Get-ColStats -Log $Log -Pattern $PAT.CoreAvgT
    $dt = Get-ColStats -Log $Log -Pattern $PAT.DistTj
    if ($ct -and $dt) {
        Write-Host ("`n  TjMax (derived: core temp + distance-to-TjMax) = {0} C" -f [math]::Round($ct.Avg + $dt.Avg, 0)) -ForegroundColor Yellow
    }

    # ---- power decomposition ----
    $pk = Get-ColStats -Log $Log -Pattern $PAT.PkgW
    $ia = Get-ColStats -Log $Log -Pattern $PAT.IaW
    $sa = Get-ColStats -Log $Log -Pattern $PAT.SaW
    $sy = Get-ColStats -Log $Log -Pattern $PAT.SysW
    if ($pk -and $ia -and $sa -and $pk.Avg -gt 0) {
        $resid = [math]::Round($pk.Avg - $ia.Avg - $sa.Avg, 2)
        Write-Host "`n  -- power decomposition (avg W) --" -ForegroundColor White
        "    CPU Package            {0,7}" -f $pk.Avg
        "      IA Cores             {0,7}   {1}% of package" -f $ia.Avg, [math]::Round(100 * $ia.Avg / $pk.Avg, 1)
        "      System Agent         {0,7}   {1}%" -f $sa.Avg, [math]::Round(100 * $sa.Avg / $pk.Avg, 1)
        "      residual (SoC/gfx)   {0,7}   {1}%" -f $resid, [math]::Round(100 * $resid / $pk.Avg, 1)
        if ($sy) { "    Total System (PSys)    {0,7}   -> non-CPU platform {1} W" -f $sy.Avg, [math]::Round($sy.Avg - $pk.Avg, 2) }
        Write-Host "    (GT Cores under-reports on Meteor Lake - cross-check GPU Total Usage)" -ForegroundColor DarkGray
    }

    # ---- package C-states ----
    $c2 = Get-ColStats -Log $Log -Pattern $PAT.PC2
    $c6 = Get-ColStats -Log $Log -Pattern $PAT.PC6
    $c8 = Get-ColStats -Log $Log -Pattern $PAT.PC8
    if ($c2 -or $c6 -or $c8) {
        $a2 = 0.0; $a6 = 0.0; $a8 = 0.0
        if ($c2) { $a2 = $c2.Avg }
        if ($c6) { $a6 = $c6.Avg }
        if ($c8) { $a8 = $c8.Avg }
        $awake = [math]::Round(100 - ($a2 + $a6 + $a8), 1)
        Write-Host "`n  -- package idle residency --" -ForegroundColor White
        "    C2={0}%  C6={1}%  C8={2}%   => awake in C0 ~{3}% of the time" -f $a2, $a6, $a8, $awake
        if ($a8 -lt 1) {
            Write-Host "    *** C8 ~= 0% : the SoC NEVER deep-sleeps. Hunt USB Selective Suspend" -ForegroundColor Red
            Write-Host "        failures and 1 ms timer requests (find-blockers.ps1). ***" -ForegroundColor Red
        }
    }

    # ---- limit attribution ----
    Write-Host "`n  -- limit reasons (% of samples) --" -ForegroundColor White
    $thr = $null; $ple = $null
    foreach ($k in 'PlePkg','ThrPkg','ThrCore','MaxTurbo','Prochot','Ratl','Edp') {
        $f = Get-FlagPct -Log $Log -Pattern $FLAGS[$k]
        if ($f) {
            "    {0,-52} {1,6}%" -f $f.Name, $f.Pct
            if ($k -eq 'PlePkg') { $ple = $f.Pct }
            if ($k -eq 'ThrPkg') { $thr = $f.Pct }
        }
    }
    if ($null -ne $ple -and $null -ne $thr) {
        if ($ple -gt 60 -and $thr -lt 25) {
            Write-Host "    VERDICT: POWER-bound. Cooling is keeping up; fix demand, do NOT raise PL1." -ForegroundColor Yellow
        } elseif ($thr -gt 40) {
            Write-Host "    VERDICT: substantially THERMAL-bound. Check thermal resistance below." -ForegroundColor Yellow
        }
    }
    # NOTE: do NOT return a value here. This function emits report lines to the output
    # stream; if a caller assigns the result (e.g. `$null = Show-LogSummary ...`) the whole
    # report is swallowed and only Write-Host lines survive. Call it bare.
}

# ---------------- run ----------------
$logIdle = Read-HwinfoCsv -Path $Idle
Show-LogSummary -Log $logIdle -Label "LOG A (idle): $Idle"

$logBusy = $null
if ($Busy) {
    $logBusy = Read-HwinfoCsv -Path $Busy
    Show-LogSummary -Log $logBusy -Label "LOG B (busy): $Busy"
}

# ---------------- thermal resistance across both logs ----------------
if ($logBusy) {
    Write-Host "`n$("=" * 74)" -ForegroundColor Green
    Write-Host " THERMAL RESISTANCE  (temp vs 30s-smoothed package power, both logs pooled)" -ForegroundColor Green
    Write-Host ("=" * 74) -ForegroundColor Green

    $px = New-Object System.Collections.Generic.List[double]
    $ty = New-Object System.Collections.Generic.List[double]
    foreach ($lg in @($logIdle, $logBusy)) {
        $ip = Get-ColIndex -Log $lg -Pattern $PAT.PkgW
        $it = Get-ColIndex -Log $lg -Pattern $PAT.PkgT
        if ($ip -lt 0 -or $it -lt 0) { continue }
        $raw = Get-ColValues -Log $lg -Index $ip
        $sm = Get-SmoothedSeries -Values $raw -Alpha 0.15
        $tv = Get-ColValues -Log $lg -Index $it
        $n = [math]::Min($sm.Count, $tv.Count)
        for ($i = 0; $i -lt $n; $i++) {
            if ($tv[$i] -ge 99) { continue }        # drop TjMax-clipped samples
            $px.Add($sm[$i]); $ty.Add($tv[$i])
        }
    }
    $fit = Get-LinearFit -X $px -Y $ty
    if ($fit) {
        "  T = {0} + {1} * P     (n={2}, r2={3})" -f $fit.Intercept, $fit.Slope, $fit.N, $fit.R2
        "  => thermal resistance ~ {0} C/W" -f $fit.Slope
        Write-Host "  (1.2-2.0 C/W is normal for a thin chassis. Only suspect the cooler above ~2.5.)" -ForegroundColor DarkGray
        Write-Host "  (The intercept is NOT ambient - it includes chassis heat soak.)" -ForegroundColor DarkGray
        if ($fit.Slope -gt 2.5) {
            Write-Host "  *** Above 2.5 C/W - cooling is a legitimate suspect. ***" -ForegroundColor Red
        } else {
            Write-Host "  => Cooling is within normal range. Do not replace hardware on this evidence." -ForegroundColor Yellow
        }
    } else {
        Write-Host "  not enough paired samples" -ForegroundColor DarkGray
    }

    # delta attribution: what accounts for the extra power?
    $pkA = Get-ColStats -Log $logIdle -Pattern $PAT.PkgW
    $pkB = Get-ColStats -Log $logBusy -Pattern $PAT.PkgW
    $iaA = Get-ColStats -Log $logIdle -Pattern $PAT.IaW
    $iaB = Get-ColStats -Log $logBusy -Pattern $PAT.IaW
    $saA = Get-ColStats -Log $logIdle -Pattern $PAT.SaW
    $saB = Get-ColStats -Log $logBusy -Pattern $PAT.SaW
    if ($pkA -and $pkB -and $iaA -and $iaB) {
        $dPkg = $pkB.Avg - $pkA.Avg
        $dIa = $iaB.Avg - $iaA.Avg
        $dSa = 0.0
        if ($saA -and $saB) { $dSa = $saB.Avg - $saA.Avg }
        Write-Host "`n  -- what accounts for the idle->busy power delta --" -ForegroundColor White
        "    package  +{0} W" -f [math]::Round($dPkg, 2)
        if ($dPkg -ne 0) {
            "    IA cores +{0} W  = {1}% of the delta" -f [math]::Round($dIa, 2), [math]::Round(100 * $dIa / $dPkg, 1)
            "    sys agent +{0} W = {1}%" -f [math]::Round($dSa, 2), [math]::Round(100 * $dSa / $dPkg, 1)
            if (($dIa / $dPkg) -gt 0.7) {
                Write-Host "    => CPU COMPUTE dominates. Not iGPU/NPU/PCH/disk. Attack software demand." -ForegroundColor Yellow
            }
        }
    }
}

# ---------------- before/after comparison ----------------
if ($Compare) {
    $logBefore = Read-HwinfoCsv -Path $Compare
    Write-Host "`n$("=" * 74)" -ForegroundColor Green
    Write-Host " BEFORE / AFTER" -ForegroundColor Green
    Write-Host ("=" * 74) -ForegroundColor Green
    "  {0,-30} {1,10} {2,10} {3,10}" -f 'metric','before','after','delta'
    foreach ($k in 'PkgW','PkgT','CoreT','IaW','Use','EffClk','PC2','PC6','PC8') {
        $b = Get-ColStats -Log $logBefore -Pattern $PAT[$k]
        $a = Get-ColStats -Log $logIdle -Pattern $PAT[$k]
        if ($b -and $a) {
            "  {0,-30} {1,10} {2,10} {3,10}" -f $b.Name, $b.Avg, $a.Avg, [math]::Round($a.Avg - $b.Avg, 2)
        }
    }
    foreach ($k in 'ThrPkg','PlePkg') {
        $b = Get-FlagPct -Log $logBefore -Pattern $FLAGS[$k]
        $a = Get-FlagPct -Log $logIdle -Pattern $FLAGS[$k]
        if ($b -and $a) {
            "  {0,-30} {1,9}% {2,9}% {3,9}" -f $b.Name, $b.Pct, $a.Pct, [math]::Round($a.Pct - $b.Pct, 1)
        }
    }
    $c8b = Get-ColStats -Log $logBefore -Pattern $PAT.PC8
    $c8a = Get-ColStats -Log $logIdle -Pattern $PAT.PC8
    if ($c8b -and $c8a -and $c8a.Avg -lt 1) {
        Write-Host "`n  Package C8 still ~0% - a USB device is still holding the SoC awake." -ForegroundColor Red
        Write-Host "  Re-run find-blockers.ps1 and check remaining Selective Suspend failures." -ForegroundColor Red
    }
}

Write-Host "`nSee reference/interpretation.md for thresholds." -ForegroundColor DarkGray
