# Interpretation reference

## Thresholds (15 W Intel U-series, e.g. Core Ultra 7 165U)

| Observation | Healthy | Problem | Meaning |
|---|---|---|---|
| Idle CPU Package Power | 1.5–4 W | **> 5 W** | SoC never reaching deep idle |
| Idle CPU Package temp | 40–52 °C | > 60 °C | follows from the above |
| **Package C8 residency** | > 60% | **≈ 0%** | SoC never deep-sleeps — the single most diagnostic number |
| Package C0 (awake) at idle | < 40% | > 55% | same story, inverse |
| Interrupts/sec at idle | 1,000–3,000 | **> 8,000** | excessive wakeup rate |
| Context switches/sec at idle | 3,000–8,000 | **> 15,000** | excessive wakeup rate |
| Syscalls/sec at idle | < 50,000 | > 120,000 | busy kernel path (AV, VBS) |
| DPCs queued/sec | < 2,000 | > 5,000 | driver-side load |
| Platform timer resolution | 15.625 ms | **1.0 / 0.5 ms** | an app raised it |
| `Average Effective Clock` at idle | < 200 MHz | — | low is *good*; compare to requested clock |
| Requested P-core clock at idle | — | near max turbo | microburst-to-turbo pattern |
| Thermal resistance ΔT/ΔP | 1.2–2.0 °C/W | **> 2.5** | only condemn cooling above this, and only with an idle anchor |
| Total CPU Utility vs Usage | similar | Utility ≫ Usage | running well above base clock |

Note `Total CPU Utility` can exceed 100% — it is work relative to *base* frequency, so 200%
means roughly 2× base clock. `% Processor Performance` (perf counter) behaves the same way.

## Power-bound vs thermal-bound

Read the limit-reason flags, not the temperature:

- `Package/Ring Power Limit Exceeded` ≈ 100% **and** thermal flags low → **power-bound**. The chip
  is producing exactly the heat it is allowed to, continuously. Cooling is keeping up. Fix demand.
- Thermal flags high **and** package power sagging *below* PL1 → **genuinely thermal-bound**.
  Now cooling is worth investigating.
- Both high → the machine is oscillating between PL2 bursts and thermal clamps. Smooth the
  demand (cap frequency / raise EPP / boost mode Efficient) rather than raising limits.

`IA: Max Turbo Limit` firing at high percentage just means "asked for more than max turbo" — it
is normal under load and not a fault.

## PL1 / PL2 — and why raising them backfires

- **PL1** = sustained power ceiling (long-term average the package may draw).
- **PL2** = short-burst ceiling, allowed for tens of seconds before the running average forces a
  drop back to PL1.
- **Static** values are silicon defaults (often 64 W). **Dynamic** values are what is actually
  enforced, set at runtime by Intel DTT using the OEM's thermal tables.

Typical L16 Gen 1: PL1 static 64 W, **PL1 dynamic 21 W**, PL2 static 64 W, PL2 dynamic 43 W.

**PL1 is the protection, not the cause.** A machine at PL1 = 21 W that still reaches TjMax will
get hotter, not cooler, if PL1 is raised. There is no setting where more watts yields lower
temperatures. What PL1 *does* cause is **slowness** — that is a different complaint, and
conflating the two leads to exactly the wrong fix.

The legitimate grain of truth: a low PL1 combined with Aggressive boost produces a sawtooth —
burst to PL2, overshoot thermally, get clamped, cool, repeat. That oscillation is worse than a
steady lower clock, and for sustained work a smooth 2.5 GHz often finishes faster in wall-clock
terms than a spiky 4.9 GHz that spends a third of its time throttled. The fix is to stop the
bursts, not to raise the ceiling.

PL1 is not a Windows setting. It comes from Intel DTT + OEM firmware. Change it via Lenovo
Vantage Intelligent Cooling or BIOS thermal mode; third-party tools (ThrottleStop, XTU) are
unsupported, often blocked on managed machines, and make heat worse.

## Power decomposition

`CPU Package Power` = `IA Cores` + `System Agent` + `GT Cores` + residual (SoC tile, media,
uncore, leakage).

Compare idle vs busy to attribute the *delta*:

- Δ dominated by **IA Cores** → CPU compute. Software demand.
- Δ in **System Agent** → memory/fabric traffic.
- Δ in **GT** → graphics (but see pitfalls #6 — GT RAPL under-reports on Meteor Lake).
- **Residual roughly constant** (~2.5–3 W) → that is fixed SoC overhead; unavoidable, but high.

Reference measurement from the original case: idle 7.89 W (IA 43%), busy 16.68 W (IA 69%).
Of the +8.79 W delta, **+8.05 W (92%) was IA Cores** — decisively CPU, not iGPU/NPU/PCH/disk.

Also check `Total System Power` (PSys) minus package power to see non-CPU platform draw
(memory, VRM losses, SSD, WiFi, display) — it heats the same chassis.

## Energy attribution over days

`powercfg /srumutil` gives Windows' own per-app accounting over ~7 days. Useful rows:

- `EMI_RAPL_Package0_PKG` / `_PP0` — total package vs core energy. PP0/PKG ≈ 0.60 means 60% of
  all package energy went to cores.
- `System` and `System Interrupts` — kernel + driver + interrupt overhead. If these lead the
  table (they did: 17.9% + 6.3% = 24.2%), the problem is overhead, not applications.
- Monitoring tools (`Taskmgr`, `procexp64`, `HWiNFO64`) — commonly a top-3 consumer. Check before
  blaming anything else.
- Share denominators: exclude the `EMI_RAPL_*` and `Unknown` rows to get attributable app total.

## The generalizable root causes, ranked by leverage

1. **Windows power-mode overlay = Best Performance.** Biases EPP toward max turbo on every wake.
   Note `powercfg /getactivescheme` reports the *scheme* ("Balanced") and hides this.
2. **Boost mode = Aggressive (2).** Every micro-wake slams a P-core to max turbo.
3. **EPP < 40.** With HWP autonomous mode on, EPP *is* the frequency ramp control.
4. **USB devices failing Selective Suspend.** `powercfg /energy` says it outright: "Processor power
   management may be prevented". Empty card readers and unused USB NICs on docks/dongles are the
   classic culprits and pin Package C8 at 0%.
5. **Apps holding a 1 ms platform timer.** ~15× the default timer tick rate. Electron apps are
   the usual source. Fix per-process with `PROCESS_POWER_THROTTLING_IGNORE_TIMER_RESOLUTION`,
   not globally.
6. **Monitoring tools left running.**
7. **Wake timers** armed by OEM scheduled tasks.
8. **WiFi radio at Maximum Performance** when plugged in.
9. **Security/VBS kernel tax** — Device Guard (Credential Guard + HVCI + System Guard),
   CrowdStrike `csagent.sys`, Defender ATP. Large and real, but **policy-locked. Report only.**
   The one actionable ask for IT: AV exclusions for dev directories, model caches, `node_modules`.

## P-core frequency floor

`powercfg /energy` reports per-core `Nominal Frequency` and `Lowest Performance Percentage`.
On the 165U: P-cores nominal 1700 MHz, lowest 71% → **P-cores cannot drop below ~1207 MHz**, and
max is 295% → 5015 MHz. E-cores nominal 1200 MHz, LP E-cores 700 MHz. This floor is why waking a
P-core is expensive and why steering background work to E-cores (EcoQoS) helps.

## Realistic outcomes

- Idle: **7 W / 52 °C → 3.5–4.5 W / 40–45 °C**
- Load temps down 10–20 °C by staying off the PL1 ceiling
- What it will **not** fix: a 15 W 2-P-core part hosting dozens of Electron processes, several
  browsers, AI agents and two endpoint security agents. That is a sizing problem, not a warranty
  problem, and saying so is more useful than implying a tweak makes it a bigger laptop.
