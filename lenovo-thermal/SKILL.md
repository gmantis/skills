---
name: lenovo-thermal
description: Diagnose and fix CPU overheating, throttling, high fan noise, or "hot while idle" on Lenovo ThinkPad laptops running Windows (Intel Meteor Lake / Core Ultra U-series and similar). Triggers on "laptop overheating", "CPU throttling", "hot while idle", "thermal throttling", "fan always on", "cpu too hot", "lenovo-thermal", or when someone has already replaced the fan/CPU/motherboard and the heat persists.
---

# Lenovo ThinkPad Thermal Diagnosis

Evidence-driven workflow for laptops that run hot, throttle, or feel hot at idle. Built for
Intel Meteor Lake U-series ThinkPads (Core Ultra 5/7 125U–165U, 15 W base TDP, 2 P-cores +
8 E-cores + 2 LP E-cores) but the method generalizes to any modern Intel laptop.

**Core thesis, learned the hard way:** on these machines "overheating" is almost never a broken
cooler. It is usually *demand* — thousands of tiny wakeups per second, each ramping a P-core to
max turbo. People replace fans, CPUs, and motherboards and nothing changes. Measure before touching hardware.

## Prerequisites

- **HWiNFO64** (free) — Settings → Logging, and set Global polling to **2000 ms**
- Windows 11, PowerShell 5.1+ (scripts avoid 7.x-only syntax)
- Administrator access for one elevated collection run and for applying fixes
- Scripts live in `scripts/` beside this file. Copy them to a scratch dir (e.g. `C:\temp\thermal`) and work there.

## Hard rules

1. **Never raise PL1 to fix heat.** PL1 is the protection, not the cause. More watts = more heat. See `reference/interpretation.md`.
2. **Never disable security software** — `webthreatdefsvc`, CrowdStrike, Defender ATP, Device Guard/HVCI. On managed corporate machines these are policy-locked, will be re-enabled, and disabling them is not yours to decide. Surface them with numbers and route to IT.
3. **Never auto-disable input devices.** `usb-quiet.ps1` excludes HID/keyboard/mouse/camera classes by default. Disabling a keyboard can lock the user out.
4. **Always save a baseline and provide a revert path** before changing anything.
5. **Always verify writes by reading them back after a delay** — Intel DTT overwrites some settings within seconds (see Stage 4).
6. **Don't chase fan RPM.** Many ThinkPads expose no fan sensor to HWiNFO even with EC support enabled. If no fan column appears, accept it and move on — thermal resistance (Stage 2) answers the cooling question without it.
7. **Tell the user their monitoring tools are part of the problem.** Task Manager + Process Explorer + HWiNFO together commonly burn 25–35% of one core and can be a top-3 energy consumer. Any "idle" measurement taken with them open is contaminated.

## Stage 0 — Triage (2 minutes)

Confirm the complaint is real and find out whether it is power-bound or thermal-bound.

```powershell
.\scripts\quick-triage.ps1
```

Reports CPU%, interrupts/sec, context switches/sec, platform timer resolution, power-mode
overlay, boost mode, EPP, and top CPU processes. If interrupts/sec > 8000 or the platform timer
is 1.0/0.5 ms while the machine is idle, you already have the shape of the answer.

## Stage 1 — Capture baseline

Two HWiNFO logs are required. One is not enough — thermal resistance needs two power levels.

1. **Idle log.** Close everything (browsers, Electron apps, Task Manager, Process Explorer).
   Reboot if possible. Wait 10 minutes untouched. Start HWiNFO logging, hit the reset (⟲) button
   first, capture **10 minutes**. Save as `idle.CSV`.
2. **Busy log.** Normal workload. Capture **10–15 minutes**. Save as `busy.CSV`.
3. Alongside each HWiNFO log, run the activity sampler in another window:
   ```powershell
   .\scripts\log-activity.ps1 -Minutes 10
   ```
   It samples on the same 2 s cadence and emits `act_sys_*.csv` / `act_proc_*.csv` joinable to
   the HWiNFO CSV by timestamp.
4. **Elevated diagnostics** (once, ~2.5 min — needs Administrator):
   ```powershell
   .\scripts\collect-diag.ps1
   ```
   This is the highest-value single step. `powercfg /energy` names the processes holding
   high-resolution timers and the USB devices refusing to suspend. `powercfg /srumutil` gives
   7+ days of per-app energy accounting.

## Stage 2 — Analyze

```powershell
.\scripts\analyze-hwinfo.ps1 -Idle idle.CSV -Busy busy.CSV
.\scripts\join-logs.ps1 -Hwinfo busy.CSV -Activity act_sys_*.csv -Processes act_proc_*.csv
.\scripts\find-blockers.ps1 -DiagDir .\diag
```

`analyze-hwinfo.ps1` produces the four things that matter:

- **Power decomposition** — IA Cores / System Agent / GT / residual. Tells you *which component*.
- **Thermal resistance** — regresses package temp on 30 s-smoothed package power across both
  logs. This is the only honest verdict on cooling.
- **Limit attribution** — power-bound vs thermal-bound, from the limit-reason flags.
- **Package C-state residency** — C8 at 0% is the signature of "hot while idle".

Read `reference/interpretation.md` for thresholds before drawing conclusions.

## Stage 3 — Root cause checklist

Work through all of these; multiple usually apply at once.

| # | Check | Where |
|---|---|---|
| 1 | Power-mode **overlay** = Best Performance | `quick-triage.ps1`. This is the *overlay*, not the scheme — `powercfg /getactivescheme` will misleadingly say "Balanced" |
| 2 | Boost mode = Aggressive (2) | should be Efficient Enabled (3) |
| 3 | EPP performance-biased (< 40) | 0 = max perf, 100 = max efficiency |
| 4 | USB devices failing Selective Suspend | `find-blockers.ps1` — parses the energy report. Empty card readers and unused USB NICs on docks are the classic offenders; they pin package C8 at 0% |
| 5 | Apps holding a 1 ms platform timer | `find-blockers.ps1`. Electron apps are the usual source |
| 6 | Wake timers armed | `diag\waketimers.txt` — OEM scheduled tasks often request wake |
| 7 | WiFi radio at Maximum Performance | `diag\energy.html` |
| 8 | Monitoring tools running | `diag\per-process-cpu.txt` |
| 9 | Security/VBS kernel tax | `diag\deviceguard.txt`, `System` + `System Interrupts` in SRUM. **Report only — do not change** |
| 10 | Cooling genuinely bad | Only if Stage 2 thermal resistance > ~2.5 °C/W measured across a wide power range *with* an idle anchor |

## Stage 4 — Apply fixes

Present findings first. Get explicit confirmation. Then:

```powershell
.\scripts\apply-fixes.ps1 -WhatIf     # dry run — show what would change
.\scripts\apply-fixes.ps1             # apply (elevated)
.\scripts\usb-quiet.ps1 -List         # show candidates, change nothing
.\scripts\usb-quiet.ps1 -Disable 'USB\VID_xxxx&PID_yyyy\...'
.\scripts\timer-quiet.ps1 -PathLike '*\SomeApp.exe' -Persist
```

`apply-fixes.ps1` writes `baseline.json` before its first change. `revert-fixes.ps1` restores
from that file — per-machine, never hardcoded.

**Expect two settings to be rejected.** `dptftcs` (Intel Dynamic Tuning) and
`LenovoVantageService` continuously rewrite **EPP** and **Maximum processor frequency**, within
seconds. `apply-fixes.ps1` detects this and reports it. Do not fight it and do not disable
`dptftcs` (it also governs fan curves and thermal protection). The durable paths are:

- **Power-mode overlay** via `PowerSetActiveOverlayScheme` in `powrprof.dll`
  (`powercfg /overlaysetactive` does not exist on all builds — the script handles both):
  ```powershell
  .\scripts\apply-fixes.ps1 -PowerMode Balanced      # or Efficiency
  ```
- **Lenovo Vantage → Intelligent Cooling → Quiet**, which makes it DTT's own policy so nothing fights it.

## Stage 5 — Re-measure

Re-run Stage 1's idle capture with monitoring tools closed, then:

```powershell
.\scripts\analyze-hwinfo.ps1 -Idle idle-after.CSV -Compare idle.CSV
```

Report the delta on: idle package power, idle package temp, **Package C8 residency**,
interrupts/sec, and throttle percentage. If C8 is still 0%, a USB device is still holding the
SoC awake — go back to check #4.

## Reporting style

- Lead with the measured number, then the interpretation.
- State clearly which findings are actionable by the user vs policy-locked (IT).
- Give realistic expectations. Typical achievable result on a 15 W U-series: idle
  **7 W / 52 °C → 3.5–4.5 W / 40–45 °C**, load temps down 10–20 °C. What this will *not* fix is
  a machine that is simply under-specced for its workload — say so plainly rather than implying
  a config tweak makes it a bigger laptop.
- If someone has already replaced fan/CPU/motherboard with no change, that is strong evidence
  the hardware is fine. Say so, with the thermal-resistance number behind it.

## Files

- `reference/interpretation.md` — thresholds, what each sensor means, PL1/PL2 explained
- `reference/pitfalls.md` — **read before writing any parsing code.** HWiNFO CSV and
  PowerShell 5.1 traps that cause silent wrong answers.
- `scripts/` — all tooling; every script supports `-?` style comment headers
