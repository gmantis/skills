# lenovo-thermal — share this with a colleague

A Claude Code skill that diagnoses and fixes CPU overheating / throttling on Lenovo ThinkPads
(Windows 11, Intel Core Ultra U-series). It also works standalone — the PowerShell scripts run
fine on their own if your colleague doesn't use Claude Code.

**The short version of what it knows:** on these 15 W laptops "overheating" is almost never a
broken cooler. It's usually thousands of tiny wakeups per second, each dragging a P-core to max
turbo. People replace fans, CPUs, and whole motherboards and nothing changes. Measure first.

## Install (with Claude Code)

Copy the `lenovo-thermal` folder to:

```
%USERPROFILE%\.claude\skills\lenovo-thermal
```

Then just say *"my laptop is overheating"* or `/lenovo-thermal`. Claude reads `SKILL.md` and
drives the workflow.

## Use standalone (no Claude Code)

1. Install [HWiNFO64](https://www.hwinfo.com/download/) (free). Set Sensor Settings → General →
   Global polling period to **2000 ms**.
2. Copy `scripts\` somewhere writable, e.g. `C:\temp\thermal`, and open PowerShell there.

```powershell
# 0. two-minute triage - is it real, and what shape is it?
.\quick-triage.ps1

# 1a. elevated diagnostics (~2 min). Run from an Administrator PowerShell.
.\collect-diag.ps1

# 1b. capture two HWiNFO logs (Sensors -> Logging -> Start).
#     idle.CSV : everything closed, 10 min untouched
#     busy.CSV : your normal workload, 10-15 min
#     Run this alongside each one, in a second window:
.\log-activity.ps1 -Minutes 10

# 2. analyse
.\analyze-hwinfo.ps1 -Idle idle.CSV -Busy busy.CSV
.\find-blockers.ps1
.\join-logs.ps1 -Hwinfo busy.CSV -Activity act_sys_*.csv -Processes act_proc_*.csv

# 3. fix (Administrator). Always dry-run first.
.\apply-fixes.ps1 -WhatIf
.\apply-fixes.ps1
.\usb-quiet.ps1 -List
.\timer-quiet.ps1 -Status

# 4. re-measure: capture idle-after.CSV, then
.\analyze-hwinfo.ps1 -Idle idle-after.CSV -Compare idle.CSV
```

## Undo everything

```powershell
.\revert-fixes.ps1                                  # power policy, from baseline.json
.\usb-quiet.ps1 -Revert                             # re-enable any disabled USB device
schtasks /delete /tn "ThermalTimerQuiet" /f         # remove the timer logon task
```

`apply-fixes.ps1` writes `baseline.json` before its first change, and `usb-quiet.ps1` writes
`usb-quiet-state.json`. Both are per-machine — keep them.

## The four numbers that matter

| Number | Where | Healthy | Bad |
|---|---|---|---|
| Idle CPU Package Power | `analyze-hwinfo.ps1` | 1.5–4 W | > 5 W |
| **Package C8 residency** | `analyze-hwinfo.ps1` | > 60% | **≈ 0%** |
| Interrupts/sec at idle | `quick-triage.ps1` | 1,000–3,000 | > 8,000 |
| Thermal resistance ΔT/ΔP | `analyze-hwinfo.ps1` | 1.2–2.0 °C/W | > 2.5 |

**Package C8 at 0% is the single most diagnostic reading.** It means the SoC never deep-sleeps,
and it is almost always caused by a USB device that won't enter Selective Suspend — very often an
empty card reader or an unplugged USB Ethernet port on a dock.

## Safety

- **Never disable security software.** CrowdStrike, Defender ATP, `webthreatdefsvc`, Device
  Guard/HVCI. On a managed corporate laptop these are policy-locked and not yours to change. The
  skill reports their cost and routes you to IT. The one useful ask: **AV exclusions** for dev
  directories, model caches, and `node_modules`.
- **Don't raise PL1.** It's the protection, not the cause. More watts = more heat.
- `usb-quiet.ps1` refuses to disable keyboards, mice, HID, cameras, biometrics, and smartcards.
- Everything is reversible. Nothing touches BIOS or firmware.

## Two things that will waste your time

- **Fan RPM.** Many ThinkPads expose no fan sensor to HWiNFO even with EC support enabled. The
  thermal-resistance measurement answers the cooling question without it.
- **Your own monitoring tools.** Task Manager + Process Explorer + HWiNFO together commonly burn
  25–35% of one core and can be a top-3 energy consumer over a week. Close them before you
  measure anything, or every reading you take is contaminated.

## Realistic outcome

Idle **7 W / 52 °C → 3.5–4.5 W / 40–45 °C**, load temps down 10–20 °C.

What it will *not* fix: a 2 P-core 15 W chip hosting dozens of Electron processes, several
browsers, AI agents, and two endpoint security agents. That's a sizing problem, not a warranty
problem — and knowing that is worth more than another motherboard swap.

## Layout

```
lenovo-thermal/
├── SKILL.md                      staged workflow Claude follows
├── README.md                     this file
├── reference/
│   ├── interpretation.md         thresholds, PL1/PL2, root-cause ranking
│   └── pitfalls.md               HWiNFO CSV + PowerShell 5.1 traps (read before coding)
└── scripts/
    ├── hwinfo-lib.ps1            robust CSV parser (dot-source it)
    ├── quick-triage.ps1          2-min assessment
    ├── collect-diag.ps1          elevated: powercfg energy/srum/sleepstudy + process data
    ├── log-activity.ps1          wakeup-rate + per-process sampler, joinable to HWiNFO
    ├── analyze-hwinfo.ps1        power decomposition, thermal resistance, C-states, limits
    ├── join-logs.ps1             correlate power with wakeups and named processes
    ├── find-blockers.ps1         discover USB suspend failures + 1 ms timer holders
    ├── apply-fixes.ps1           power policy, with baseline + read-back verification
    ├── revert-fixes.ps1          restore from baseline.json
    ├── usb-quiet.ps1             disable idle USB leaf devices (safe by default)
    └── timer-quiet.ps1           kill 1 ms timer requests per-process
```

Requires PowerShell 5.1 (ships with Windows 11) — no modules to install.
