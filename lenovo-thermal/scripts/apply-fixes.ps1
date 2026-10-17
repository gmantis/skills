# apply-fixes.ps1 - power policy remediation. Portable; saves a per-machine baseline first.
# Run as Administrator.
#
#   .\apply-fixes.ps1 -WhatIf                  # show what would change
#   .\apply-fixes.ps1                          # apply the safe set
#   .\apply-fixes.ps1 -PowerMode Balanced      # also set the OS power-mode overlay
#   .\apply-fixes.ps1 -PowerMode Efficiency    # strongest; noticeable on builds
#   .\apply-fixes.ps1 -NoFreqCap               # skip the frequency cap
#   .\revert-fixes.ps1                         # undo, from baseline.json
#
# Every write is verified by reading it back after a delay, because Intel DTT (dptftcs) and
# LenovoVantageService rewrite EPP and Maximum processor frequency within seconds.

param(
    [switch]$WhatIf,
    [ValidateSet('None', 'Balanced', 'Efficiency')][string]$PowerMode = 'None',
    [int]$Epp = 65,
    [int]$FreqCapMhz = 3000,
    [switch]$NoFreqCap,
    [string]$BaselineFile = '.\baseline.json'
)

$ErrorActionPreference = 'Continue'
$ident = [Security.Principal.WindowsIdentity]::GetCurrent()
if (-not (New-Object Security.Principal.WindowsPrincipal($ident)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "Must run as Administrator." -ForegroundColor Red
    exit 1
}

# ---------------- setting map ----------------
$SUB_PROC  = '54533251-82be-4824-96c1-47b60b740d00'
$SUB_USB   = '2a737441-1930-4402-8d77-b2bebba308a3'
$SUB_WIFI  = '19cbb8fa-5279-450e-9fac-8a3d5fedd0c1'
$SUB_SLEEP = '238c9fa8-0aad-41ed-83f4-97be242c8f20'

$OVERLAY = @{
    Balanced   = '00000000-0000-0000-0000-000000000000'
    Efficiency = '961cc777-2547-4f9d-8174-7d86181b8a7a'
    Performance = 'ded574b5-45a0-4f42-8737-46345c09c238'
}

# name; subgroup; setting guid; target value; DC too?
$plan = @(
    @{ Name = 'Boost mode -> Efficient Enabled'; Sub = $SUB_PROC; Guid = 'be337238-0d82-4146-a960-4f3749d470c7'; Val = 3; Dc = $true }
    @{ Name = "EPP (P-cores) -> $Epp";           Sub = $SUB_PROC; Guid = '36687f9e-e3a5-4dbf-b1dc-15eb381c6863'; Val = $Epp; Dc = $false; Fragile = $true }
    @{ Name = "EPP (E-cores) -> $Epp";           Sub = $SUB_PROC; Guid = '36687f9e-e3a5-4dbf-b1dc-15eb381c6864'; Val = $Epp; Dc = $false; Fragile = $true }
    @{ Name = "EPP (LP E-cores) -> $Epp";        Sub = $SUB_PROC; Guid = '36687f9e-e3a5-4dbf-b1dc-15eb381c6865'; Val = $Epp; Dc = $false; Fragile = $true }
    @{ Name = 'USB selective suspend -> Enabled'; Sub = $SUB_USB;  Guid = '48e6b7a6-50f5-4782-a5d4-53bb8f07e226'; Val = 1; Dc = $true }
    @{ Name = 'WiFi radio -> Medium power saving'; Sub = $SUB_WIFI; Guid = '12bbebe6-58d6-4636-95bb-3217ef867c1a'; Val = 2; Dc = $false }
    @{ Name = 'Wake timers (AC) -> Disabled';     Sub = $SUB_SLEEP; Guid = 'bd3b718a-0680-4d9d-8ab2-e1d2b4ac806d'; Val = 0; Dc = $false }
)
if (-not $NoFreqCap) {
    $plan += @{ Name = "Max frequency P-cores -> $FreqCapMhz MHz"; Sub = $SUB_PROC; Guid = '75b0ae3f-bce0-45a7-8c89-c9611c25e100'; Val = $FreqCapMhz; Dc = $false; Fragile = $true }
    $plan += @{ Name = "Max frequency E-cores -> $([int]($FreqCapMhz * 0.87)) MHz"; Sub = $SUB_PROC; Guid = '75b0ae3f-bce0-45a7-8c89-c9611c25e101'; Val = [int]($FreqCapMhz * 0.87); Dc = $false; Fragile = $true }
}

function Read-Setting {
    param([string]$Sub, [string]$Guid)
    $out = powercfg -qh SCHEME_CURRENT $Sub $Guid 2>&1
    $m = [regex]::Match(($out -join "`n"), 'Current AC Power Setting Index:\s+(\S+)')
    if ($m.Success) { return [Convert]::ToInt32($m.Groups[1].Value, 16) }
    return $null
}

# ---------------- baseline ----------------
$ovKeyPath = 'HKLM:\SYSTEM\CurrentControlSet\Control\Power\User\PowerSchemes'
$currentOverlay = (Get-ItemProperty $ovKeyPath -ErrorAction SilentlyContinue).ActiveOverlayAcPowerScheme

if (-not (Test-Path $BaselineFile)) {
    $baseline = [ordered]@{
        SavedUtc = (Get-Date).ToUniversalTime().ToString('o')
        Machine  = $env:COMPUTERNAME
        Overlay  = $currentOverlay
        Settings = @()
    }
    foreach ($p in $plan) {
        $baseline.Settings += [ordered]@{ Name = $p.Name; Sub = $p.Sub; Guid = $p.Guid; Was = (Read-Setting -Sub $p.Sub -Guid $p.Guid) }
    }
    if (-not $WhatIf) {
        $baseline | ConvertTo-Json -Depth 5 | Set-Content -Path $BaselineFile -Encoding utf8
        Write-Host "baseline saved -> $BaselineFile" -ForegroundColor Green
    } else {
        Write-Host "(WhatIf) baseline would be saved -> $BaselineFile" -ForegroundColor DarkGray
    }
} else {
    Write-Host "baseline already exists ($BaselineFile) - keeping the original." -ForegroundColor DarkGray
}

# ---------------- apply ----------------
Write-Host "`n=== APPLYING ===" -ForegroundColor Cyan
"  {0,-44} {1,8} {2,8}" -f 'setting', 'before', 'target'
foreach ($p in $plan) {
    $before = Read-Setting -Sub $p.Sub -Guid $p.Guid
    "  {0,-44} {1,8} {2,8}" -f $p.Name, $before, $p.Val
    if ($WhatIf) { continue }
    powercfg /setacvalueindex SCHEME_CURRENT $p.Sub $p.Guid $p.Val 2>&1 | Out-Null
    if ($p.Dc) { powercfg /setdcvalueindex SCHEME_CURRENT $p.Sub $p.Guid $p.Val 2>&1 | Out-Null }
}

if (-not $WhatIf) { powercfg /setactive SCHEME_CURRENT 2>&1 | Out-Null }

# ---------------- power-mode overlay ----------------
if ($PowerMode -ne 'None') {
    Write-Host "`n=== POWER-MODE OVERLAY -> $PowerMode ===" -ForegroundColor Cyan
    Write-Host "  This is the durable lever: DTT respects the OS overlay even though it" -ForegroundColor DarkGray
    Write-Host "  overwrites EPP directly." -ForegroundColor DarkGray
    if ($WhatIf) {
        Write-Host "  (WhatIf) would set overlay to $($OVERLAY[$PowerMode])" -ForegroundColor DarkGray
    } else {
        $done = $false
        # try the CLI verb first (absent on some builds)
        $r = powercfg /overlaysetactive $OVERLAY[$PowerMode] 2>&1
        if ($LASTEXITCODE -eq 0 -and $r -notmatch 'Invalid') { $done = $true }
        if (-not $done) {
            try {
                Add-Type -ErrorAction Stop -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class OverlayApi {
    [DllImport("powrprof.dll")] public static extern uint PowerSetActiveOverlayScheme(Guid g);
    [DllImport("powrprof.dll")] public static extern uint PowerGetEffectiveOverlayScheme(out Guid g);
}
'@
                $rc = [OverlayApi]::PowerSetActiveOverlayScheme([Guid]$OVERLAY[$PowerMode])
                if ($rc -eq 0) { $done = $true; Write-Host "  set via PowerSetActiveOverlayScheme (rc=0)" -ForegroundColor Green }
                else { Write-Host "  PowerSetActiveOverlayScheme rc=$rc" -ForegroundColor Yellow }
            } catch { Write-Host "  API call failed: $_" -ForegroundColor Yellow }
        } else { Write-Host "  set via powercfg /overlaysetactive" -ForegroundColor Green }
        if (-not $done) {
            Write-Host "  MANUAL: Settings > System > Power & battery > Power mode > $PowerMode" -ForegroundColor Yellow
        }
    }
}

if ($WhatIf) {
    Write-Host "`n(WhatIf - nothing was changed)" -ForegroundColor DarkGray
    exit 0
}

# ---------------- verify by read-back (catches DTT overwrites) ----------------
Write-Host "`nwaiting 20 s to see whether Intel DTT / Vantage reverts anything..." -ForegroundColor Cyan
Start-Sleep -Seconds 20

Write-Host "`n=== VERIFICATION ===" -ForegroundColor Cyan
"  {0,-44} {1,8} {2,8}  {3}" -f 'setting', 'target', 'actual', 'result'
$held = 0; $lost = 0
foreach ($p in $plan) {
    $now = Read-Setting -Sub $p.Sub -Guid $p.Guid
    $ok = ($now -eq $p.Val)
    $res = 'HELD'
    $col = 'Green'
    if (-not $ok) { $res = 'OVERWRITTEN'; $col = 'Yellow'; $lost++ } else { $held++ }
    Write-Host ("  {0,-44} {1,8} {2,8}  {3}" -f $p.Name, $p.Val, $now, $res) -ForegroundColor $col
}

$ovNow = (Get-ItemProperty $ovKeyPath -ErrorAction SilentlyContinue).ActiveOverlayAcPowerScheme
$ovName = '(unknown)'
foreach ($k in $OVERLAY.Keys) { if ($ovNow -eq $OVERLAY[$k] -or ([string]::IsNullOrEmpty($ovNow) -and $k -eq 'Balanced')) { $ovName = $k } }
"`n  power-mode overlay now: $ovName"

Write-Host "`n$held held, $lost overwritten." -ForegroundColor Cyan
if ($lost -gt 0) {
    Write-Host @"

  Overwritten settings are being enforced by Intel DTT (dptftcs) and/or
  LenovoVantageService. This is expected for EPP and Maximum processor frequency.
  Do NOT disable dptftcs - it also governs fan curves and thermal protection.
  Durable alternatives:
    1) .\apply-fixes.ps1 -PowerMode Efficiency
    2) Lenovo Vantage > Intelligent Cooling > Quiet
"@ -ForegroundColor Yellow
}

Write-Host "`nNext: close monitoring tools, then capture a fresh idle HWiNFO log and run" -ForegroundColor DarkGray
Write-Host "  .\analyze-hwinfo.ps1 -Idle idle-after.CSV -Compare idle.CSV" -ForegroundColor DarkGray
