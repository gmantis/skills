# revert-fixes.ps1 - restore everything apply-fixes.ps1 changed, from the per-machine baseline.
# Run as Administrator.
#
#   .\revert-fixes.ps1                 # restore from .\baseline.json
#   .\revert-fixes.ps1 -WhatIf
#   .\revert-fixes.ps1 -BaselineFile C:\temp\thermal\baseline.json

param(
    [string]$BaselineFile = '.\baseline.json',
    [switch]$WhatIf
)

$ErrorActionPreference = 'Continue'
$ident = [Security.Principal.WindowsIdentity]::GetCurrent()
if (-not (New-Object Security.Principal.WindowsPrincipal($ident)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "Must run as Administrator." -ForegroundColor Red
    exit 1
}
if (-not (Test-Path $BaselineFile)) {
    Write-Host "No baseline at $BaselineFile - nothing to revert from." -ForegroundColor Red
    Write-Host "If you lost it: set power mode in Settings and re-run apply-fixes.ps1 -WhatIf to inspect." -ForegroundColor DarkGray
    exit 1
}

$bl = Get-Content $BaselineFile -Raw | ConvertFrom-Json
Write-Host "baseline from $($bl.SavedUtc) on $($bl.Machine)" -ForegroundColor Cyan
if ($bl.Machine -ne $env:COMPUTERNAME) {
    Write-Host "WARNING: baseline was captured on a different machine ($($bl.Machine))." -ForegroundColor Yellow
}

Write-Host "`n=== RESTORING ===" -ForegroundColor Cyan
"  {0,-44} {1,8}" -f 'setting', 'restore'
foreach ($s in $bl.Settings) {
    if ($null -eq $s.Was) {
        Write-Host ("  {0,-44} {1,8}  (was unreadable - skipping)" -f $s.Name, '-') -ForegroundColor DarkGray
        continue
    }
    "  {0,-44} {1,8}" -f $s.Name, $s.Was
    if ($WhatIf) { continue }
    powercfg /setacvalueindex SCHEME_CURRENT $s.Sub $s.Guid $s.Was 2>&1 | Out-Null
    powercfg /setdcvalueindex SCHEME_CURRENT $s.Sub $s.Guid $s.Was 2>&1 | Out-Null
}
if (-not $WhatIf) { powercfg /setactive SCHEME_CURRENT 2>&1 | Out-Null }

# ---- overlay ----
if ($bl.Overlay) {
    Write-Host "`nrestoring power-mode overlay -> $($bl.Overlay)" -ForegroundColor Cyan
    if (-not $WhatIf) {
        $r = powercfg /overlaysetactive $bl.Overlay 2>&1
        if ($LASTEXITCODE -ne 0 -or $r -match 'Invalid') {
            try {
                Add-Type -ErrorAction Stop -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class OverlayApi2 {
    [DllImport("powrprof.dll")] public static extern uint PowerSetActiveOverlayScheme(Guid g);
}
'@
                $rc = [OverlayApi2]::PowerSetActiveOverlayScheme([Guid]$bl.Overlay)
                Write-Host "  PowerSetActiveOverlayScheme rc=$rc" -ForegroundColor Green
            } catch { Write-Host "  could not restore overlay: $_" -ForegroundColor Yellow }
        }
    }
}

Write-Host @"

Not covered by this script (revert separately if you applied them):
  USB devices    ->  .\usb-quiet.ps1 -Revert
  Timer fix task ->  schtasks /delete /tn "ThermalTimerQuiet" /f
"@ -ForegroundColor DarkGray

if ($WhatIf) { Write-Host "(WhatIf - nothing changed)" -ForegroundColor DarkGray }
