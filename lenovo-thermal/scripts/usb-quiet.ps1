# usb-quiet.ps1 - disable idle USB leaf devices that block deep package C-states.
# Portable: discovers this machine's devices. Nothing is hardcoded. Nothing is disabled
# without you naming it explicitly.
#
#   .\usb-quiet.ps1 -List                              # show candidates + safety class (default)
#   .\usb-quiet.ps1 -Disable 'USB\VID_xxxx&PID_yyyy\*' # disable by instance-id pattern
#   .\usb-quiet.ps1 -Revert                            # re-enable everything this script disabled
#
# SAFETY: input devices (keyboard/mouse/HID), cameras, biometrics, smartcards and Bluetooth are
# NEVER offered as candidates - disabling a keyboard can lock the user out. Hubs are left alone;
# a hub with no active children suspends by itself.

param(
    [switch]$List,
    [string[]]$Disable,
    [switch]$Revert,
    [string]$StateFile = '.\usb-quiet-state.json',
    [string]$DiagDir = '.\diag'
)

$ErrorActionPreference = 'Continue'
$PROTECTED_CLASS   = 'HIDClass|Keyboard|Mouse|Camera|Image|Biometric|SmartCard|Bluetooth|MEDIA|AudioEndpoint|System'
$PROTECTED_SERVICE = 'usbaudio|HidUsb|usbvideo|kbdhid|mouhid'

function Test-Admin {
    $i = [Security.Principal.WindowsIdentity]::GetCurrent()
    return (New-Object Security.Principal.WindowsPrincipal($i)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-SuspendOffenders {
    # Device IDs that powercfg /energy flagged, if the report exists.
    $energy = Join-Path $DiagDir 'energy.html'
    $ids = @()
    if (-not (Test-Path $energy)) { return $ids }
    $raw = Get-Content $energy -Raw
    $t = $raw -replace '(?s)<script.*?</script>', '' -replace '<[^>]+>', "`n"
    $t = [System.Net.WebUtility]::HtmlDecode($t)
    $ln = @($t -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' })
    for ($i = 0; $i -lt $ln.Count; $i++) {
        if ($ln[$i] -notlike 'USB Suspend:USB Device not Entering Selective Suspend*') { continue }
        for ($j = $i; $j -lt [math]::Min($i + 20, $ln.Count); $j++) {
            if ($ln[$j] -eq 'Device ID' -and ($j + 1) -lt $ln.Count) { $ids += $ln[$j + 1]; break }
        }
    }
    return ($ids | Select-Object -Unique)
}

function Get-VidPidKey {
    # All interfaces of one physical USB device share VID+PID. Used to inherit protection
    # from a child interface up to its composite parent - disabling the parent of a
    # keyboard interface disables the keyboard.
    param([string]$InstanceId)
    $m = [regex]::Match($InstanceId, 'VID_([0-9A-Fa-f]{4})&PID_([0-9A-Fa-f]{4})')
    if ($m.Success) { return ('{0}:{1}' -f $m.Groups[1].Value.ToUpper(), $m.Groups[2].Value.ToUpper()) }
    return $InstanceId
}

function Get-Candidates {
    $offenders = Get-SuspendOffenders
    $all = Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue | Where-Object { $_.InstanceId -like 'USB\*' }
    $usbDisks = @(Get-Disk -ErrorAction SilentlyContinue | Where-Object { $_.BusType -eq 'USB' })
    $netIdle = @(Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Disconnected' })

    # ---- pass 1: which physical devices contain ANY protected interface? ----
    $protectedKeys = @{}
    foreach ($d in $all) {
        if ($d.Class -match $PROTECTED_CLASS -or $d.Service -match $PROTECTED_SERVICE) {
            $protectedKeys[(Get-VidPidKey -InstanceId $d.InstanceId)] = $d.Class
        }
    }

    # ---- pass 2: classify ----
    $rows = foreach ($d in $all) {
        $vpKey = Get-VidPidKey -InstanceId $d.InstanceId
        $flagged = $false
        foreach ($o in $offenders) { if ($d.InstanceId -like "*$o*") { $flagged = $true; break } }

        $safety = 'other'
        $why = ''
        if ($d.Class -match $PROTECTED_CLASS) { $safety = 'PROTECTED'; $why = "class $($d.Class)" }
        elseif ($d.Service -match $PROTECTED_SERVICE) { $safety = 'PROTECTED'; $why = "service $($d.Service)" }
        elseif ($protectedKeys.ContainsKey($vpKey)) {
            # a sibling interface on the same physical device is protected
            $safety = 'PROTECTED'
            $why = "same physical device as a $($protectedKeys[$vpKey]) interface"
        }
        elseif ($d.Service -match 'USBHUB' -or $d.FriendlyName -like '*Hub*') { $safety = 'HUB'; $why = 'leave alone; suspends when children do' }
        elseif ($d.Service -eq 'USBSTOR') {
            $safety = 'CANDIDATE'
            $why = 'USB storage'
            $noMedia = @($usbDisks | Where-Object { $_.OperationalStatus -ne 'Online' })
            if ($noMedia.Count -gt 0) { $why = 'USB storage with NO MEDIA - prime suspect' }
        }
        elseif ($d.Class -eq 'Net') {
            $safety = 'CANDIDATE'
            $why = 'USB network adapter'
            foreach ($n in $netIdle) { if ($n.InterfaceDescription -eq $d.FriendlyName) { $why = 'USB NIC, DISCONNECTED - free to disable' } }
        }
        elseif ($flagged) { $safety = 'CANDIDATE'; $why = 'flagged by powercfg, purpose unknown' }

        [pscustomobject]@{
            Safety = $safety; Name = $d.FriendlyName; Class = $d.Class; Service = $d.Service
            Status = $d.Status; Flagged = $flagged; Why = $why; InstanceId = $d.InstanceId
        }
    }
    return $rows
}

# ---------------- REVERT ----------------
if ($Revert) {
    if (-not (Test-Admin)) { Write-Host "Must run as Administrator." -ForegroundColor Red; exit 1 }
    if (-not (Test-Path $StateFile)) { Write-Host "No state file at $StateFile - nothing to revert." -ForegroundColor Yellow; exit 0 }
    $st = Get-Content $StateFile -Raw | ConvertFrom-Json
    foreach ($item in $st.Disabled) {
        Write-Host "  enabling: $($item.Name)" -ForegroundColor Green
        Enable-PnpDevice -InstanceId $item.InstanceId -Confirm:$false -ErrorAction Continue
    }
    Remove-Item $StateFile -Force -ErrorAction SilentlyContinue
    Write-Host "reverted." -ForegroundColor Green
    exit 0
}

# ---------------- DISABLE ----------------
if ($Disable) {
    if (-not (Test-Admin)) { Write-Host "Must run as Administrator." -ForegroundColor Red; exit 1 }
    $cands = Get-Candidates
    $state = [ordered]@{ SavedUtc = (Get-Date).ToUniversalTime().ToString('o'); Machine = $env:COMPUTERNAME; Disabled = @() }
    if (Test-Path $StateFile) {
        $prev = Get-Content $StateFile -Raw | ConvertFrom-Json
        foreach ($p in $prev.Disabled) { $state.Disabled += [ordered]@{ Name = $p.Name; InstanceId = $p.InstanceId } }
    }
    foreach ($pattern in $Disable) {
        $hits = @($cands | Where-Object { $_.InstanceId -like $pattern })
        if (-not $hits) { Write-Host "  no match: $pattern" -ForegroundColor Yellow; continue }
        foreach ($h in $hits) {
            if ($h.Safety -eq 'PROTECTED') {
                Write-Host "  REFUSING (protected class $($h.Class)): $($h.Name)" -ForegroundColor Red
                continue
            }
            if ($h.Safety -eq 'HUB') {
                Write-Host "  REFUSING (hub - disable its children instead): $($h.Name)" -ForegroundColor Red
                continue
            }
            Write-Host "  disabling: $($h.Name)  [$($h.InstanceId)]" -ForegroundColor Yellow
            Disable-PnpDevice -InstanceId $h.InstanceId -Confirm:$false -ErrorAction Continue
            $state.Disabled += [ordered]@{ Name = $h.Name; InstanceId = $h.InstanceId }
        }
    }
    $state | ConvertTo-Json -Depth 5 | Set-Content -Path $StateFile -Encoding utf8
    Write-Host "`nstate saved -> $StateFile   (revert with: .\usb-quiet.ps1 -Revert)" -ForegroundColor Green
    Write-Host "Note: 'Error' status in Get-PnpDevice for a disabled device is normal (Code 22)." -ForegroundColor DarkGray
    Write-Host "Re-capture an idle log and check Package C8 residency." -ForegroundColor DarkGray
    exit 0
}

# ---------------- LIST (default) ----------------
$rows = Get-Candidates
Write-Host "`n=== USB DEVICES ===" -ForegroundColor Cyan
Write-Host "Flagged = powercfg /energy said it does not enter Selective Suspend.`n" -ForegroundColor DarkGray

foreach ($grp in 'CANDIDATE', 'HUB', 'PROTECTED', 'other') {
    $sel = @($rows | Where-Object { $_.Safety -eq $grp })
    if (-not $sel) { continue }
    $col = 'Gray'
    if ($grp -eq 'CANDIDATE') { $col = 'Green' }
    if ($grp -eq 'PROTECTED') { $col = 'Red' }
    Write-Host "-- $grp --" -ForegroundColor $col
    foreach ($r in $sel) {
        $mark = ' '
        if ($r.Flagged) { $mark = '*' }
        Write-Host ("  {0} {1,-38} {2,-10} {3}" -f $mark, $r.Name, $r.Class, $r.Why) -ForegroundColor $col
        Write-Host ("      {0}" -f $r.InstanceId) -ForegroundColor DarkGray
    }
    Write-Host ""
}

$actionable = @($rows | Where-Object { $_.Safety -eq 'CANDIDATE' -and $_.Flagged })
if ($actionable) {
    Write-Host "Suggested (only if genuinely unused - confirm with the user first):" -ForegroundColor Yellow
    foreach ($a in $actionable) {
        Write-Host ("  .\usb-quiet.ps1 -Disable '{0}'" -f $a.InstanceId) -ForegroundColor Green
    }
} else {
    Write-Host "No flagged candidates. If Package C8 is still 0%, the blocker may be a timer request" -ForegroundColor DarkGray
    Write-Host "(find-blockers.ps1 section 2) rather than USB." -ForegroundColor DarkGray
}
Write-Host "`nPhysically unplugging an unused dongle achieves the same thing with no config change." -ForegroundColor DarkGray
