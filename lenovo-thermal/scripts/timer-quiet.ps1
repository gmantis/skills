# timer-quiet.ps1 - make Windows IGNORE a process's high-resolution timer requests.
# Portable: you supply the path pattern (find-blockers.ps1 prints ready-made commands).
#
#   .\timer-quiet.ps1 -PathLike '*\SomeApp\app\App.exe'            # timer-only, surgical
#   .\timer-quiet.ps1 -PathLike '*\App.exe' -Eco                   # also EcoQoS -> E-cores
#   .\timer-quiet.ps1 -PathLike '*\App.exe' -Persist               # + logon task, re-sweeps
#   .\timer-quiet.ps1 -PathLike '*\App.exe' -Revert
#   .\timer-quiet.ps1 -Status                                      # show flags + platform timer
#
# Mechanism: SetProcessInformation(ProcessPowerThrottling) with
#   PROCESS_POWER_THROTTLING_IGNORE_TIMER_RESOLUTION (0x4)  - discard timeBeginPeriod()
#   PROCESS_POWER_THROTTLING_EXECUTION_SPEED         (0x1)  - EcoQoS, schedule on E-cores
# This is exactly what Task Manager's "Efficiency mode" does.
#
# IMPORTANT: the flag lives on the process instance and is lost when it restarts. Use -Persist.
# Match by PATH, not process name - many apps ship several binaries with the same name.

param(
    [string]$PathLike,
    [switch]$Eco,
    [switch]$Revert,
    [switch]$Persist,
    [switch]$Status,
    [int]$Watch = 0,
    [string]$TaskName = 'ThermalTimerQuiet'
)

Add-Type -ErrorAction Stop -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class ThrottleApi {
    [StructLayout(LayoutKind.Sequential)]
    public struct STATE { public uint Version; public uint ControlMask; public uint StateMask; }
    public const uint VERSION = 1;
    public const uint EXECUTION_SPEED = 0x1;
    public const uint IGNORE_TIMER_RESOLUTION = 0x4;

    [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint a, bool i, int p);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetProcessInformation(IntPtr h, int c, ref STATE s, int n);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetProcessInformation(IntPtr h, int c, ref STATE s, int n);
    [DllImport("ntdll.dll")] static extern int NtQueryTimerResolution(out uint mx, out uint mn, out uint cur);

    const uint SET_INFORMATION = 0x0200;
    const uint QUERY_LIMITED   = 0x1000;
    const int  POWER_THROTTLING = 4;

    public static double TimerMs() { uint a, b, c; NtQueryTimerResolution(out a, out b, out c); return c / 10000.0; }

    public static string Set(int pid, uint control, uint state) {
        IntPtr h = OpenProcess(SET_INFORMATION, false, pid);
        if (h == IntPtr.Zero) return "open failed (" + Marshal.GetLastWin32Error() + ")";
        try {
            var s = new STATE(); s.Version = VERSION; s.ControlMask = control; s.StateMask = state;
            bool ok = SetProcessInformation(h, POWER_THROTTLING, ref s, Marshal.SizeOf(s));
            return ok ? "OK" : "set failed (" + Marshal.GetLastWin32Error() + ")";
        } finally { CloseHandle(h); }
    }

    public static string Get(int pid) {
        IntPtr h = OpenProcess(QUERY_LIMITED, false, pid);
        if (h == IntPtr.Zero) return "open failed";
        try {
            var s = new STATE(); s.Version = VERSION;
            if (!GetProcessInformation(h, POWER_THROTTLING, ref s, Marshal.SizeOf(s))) return "read failed";
            return string.Format("Control=0x{0:X} State=0x{1:X}", s.ControlMask, s.StateMask);
        } finally { CloseHandle(h); }
    }
}
'@

function Get-Targets {
    param([string]$Pattern)
    return @(Get-Process -ErrorAction SilentlyContinue | ForEach-Object {
        $p = ''
        try { $p = $_.Path } catch { return }
        if ($p -and $p -like $Pattern) { $_ }
    })
}

# ---------------- STATUS ----------------
if ($Status) {
    Write-Host ("platform timer : {0:N3} ms   (15.625 = default/good)" -f [ThrottleApi]::TimerMs()) -ForegroundColor Cyan
    if ($PathLike) {
        foreach ($t in (Get-Targets -Pattern $PathLike)) {
            "  pid {0,-7} {1,-24} {2}" -f $t.Id, $t.ProcessName, [ThrottleApi]::Get($t.Id)
        }
    }
    $exists = schtasks /query /tn $TaskName 2>&1
    if ($exists -match 'cannot find|ERROR') { "  logon task '$TaskName' : not created" }
    else { "  logon task '$TaskName' : present" }
    exit 0
}

if (-not $PathLike) {
    Write-Host "Specify -PathLike. Run find-blockers.ps1 to get the exact pattern for this machine." -ForegroundColor Yellow
    exit 1
}

$mask = [ThrottleApi]::IGNORE_TIMER_RESOLUTION
if ($Eco) { $mask = $mask -bor [ThrottleApi]::EXECUTION_SPEED }

function Invoke-Sweep {
    $targets = Get-Targets -Pattern $PathLike
    if (-not $targets) { Write-Host "  no process matches $PathLike" -ForegroundColor DarkGray; return 0 }
    foreach ($t in $targets) {
        $stateMask = $mask
        $verb = 'applied'
        if ($Revert) { $stateMask = 0; $verb = 'cleared' }
        $r = [ThrottleApi]::Set($t.Id, $mask, $stateMask)
        $col = 'Green'
        if ($r -ne 'OK') { $col = 'Yellow' }
        Write-Host ("  {0,-8} pid {1,-7} {2,-9} {3}" -f $verb, $t.Id, $r, (Split-Path $t.Path -Leaf)) -ForegroundColor $col
    }
    return $targets.Count
}

Write-Host ("platform timer BEFORE : {0:N3} ms" -f [ThrottleApi]::TimerMs()) -ForegroundColor Cyan
Write-Host "target : $PathLike"
$maskDesc = 'IGNORE_TIMER_RESOLUTION'
if ($Eco) { $maskDesc = "$maskDesc + EXECUTION_SPEED (EcoQoS)" }
Write-Host ("mask   : 0x{0:X}  {1}" -f $mask, $maskDesc)
Write-Host ""
$n = Invoke-Sweep

# ---------------- persistence ----------------
if ($Persist -and -not $Revert) {
    $ident = [Security.Principal.WindowsIdentity]::GetCurrent()
    if (-not (New-Object Security.Principal.WindowsPrincipal($ident)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        Write-Host "`n-Persist needs Administrator. Re-run elevated, or create the task manually:" -ForegroundColor Yellow
        Write-Host "  schtasks /create /tn `"$TaskName`" /sc onlogon /rl highest /f /tr `"...`"" -ForegroundColor DarkGray
    } else {
        $self = $MyInvocation.MyCommand.Path
        $ecoArg = ''
        if ($Eco) { $ecoArg = ' -Eco' }
        $cmd = "powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$self`" -PathLike `"$PathLike`"$ecoArg -Watch 86400"
        schtasks /delete /tn $TaskName /f 2>&1 | Out-Null
        schtasks /create /tn $TaskName /sc onlogon /rl highest /f /tr $cmd 2>&1 | Out-Host
        Write-Host "  task '$TaskName' created - re-sweeps every 15 s after logon." -ForegroundColor Green
        Write-Host "  remove with: schtasks /delete /tn `"$TaskName`" /f" -ForegroundColor DarkGray
    }
}
if ($Revert) {
    schtasks /query /tn $TaskName 2>&1 | Out-Null
    Write-Host "`nIf you created the logon task, remove it too:" -ForegroundColor DarkGray
    Write-Host "  schtasks /delete /tn `"$TaskName`" /f" -ForegroundColor DarkGray
}

# ---------------- watch ----------------
if ($Watch -gt 0) {
    Write-Host "`nwatching for $Watch s, re-applying every 15 s (catches new child processes)..." -ForegroundColor Cyan
    $end = (Get-Date).AddSeconds($Watch)
    while ((Get-Date) -lt $end) {
        Start-Sleep -Seconds 15
        $null = Invoke-Sweep
    }
}

Start-Sleep -Seconds 3
Write-Host ("`nplatform timer AFTER : {0:N3} ms" -f [ThrottleApi]::TimerMs()) -ForegroundColor Cyan
Write-Host @"
Verification note: Windows only honours a timer request while the requesting process is in the
FOREGROUND, so a coarse reading here proves nothing on its own. The real test is to foreground
the app, use it for a minute, then run:  .\timer-quiet.ps1 -Status
"@ -ForegroundColor DarkGray
