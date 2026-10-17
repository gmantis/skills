# Pitfalls — read before writing any parsing or analysis code

Every item here caused a silently wrong answer during the original investigation.
`scripts/hwinfo-lib.ps1` already handles all the HWiNFO ones; use it rather than re-rolling.

## HWiNFO CSV

### 1. The sensor set changes mid-log
HWiNFO adds/removes sensors while logging (devices appear, battery detaches, GPU idles out).
Rows then have **different field counts** than the header, and — worse — some rows have the
*same* count but **shifted columns**. Symptoms: "Rest-of-Chip Power" averaging 1680 W, "IGPU
Power" peaking at 800 W, boolean values landing in numeric columns.

**Fix:** validate every row against the header. A row is good only if, for every non-empty field:
- header contains `[Yes/No]` → value is exactly `Yes` or `No`
- otherwise → value parses as a double

Drop rows that fail. In the original 418-sample log, 76 rows (18%) were bad.

### 2. The degree sign breaks column matching
Headers contain `[°C]`. HWiNFO writes ANSI (codepage), not UTF-8.
- Read with `Get-Content -Encoding Default`
- Strip non-ASCII from header names before matching: `$name -replace '[^\x20-\x7E]',''`
- Then match `'CPU Package [C]'`, not `'CPU Package [°C]'`

If you skip this, temperature columns silently never match and you get zeros. Do **not** embed
a literal `°` in a `.ps1` file — the file's own encoding will mismatch at runtime.

### 3. Duplicate column names
`CPU Package [°C]` appears twice (core-block and package-block). So do `Total DL [MB]`,
`SPD Hub Temperature`, `VIN Voltage`, and all the `Avg. Power (PL1)` GPU/NPU throttle flags.
Match by index, and when a name is ambiguous prefer the first occurrence — or disambiguate by
neighbouring columns. `Import-Csv` **fails outright** on duplicate headers; parse manually.

### 4. A trailing header block
HWiNFO appends a repeated header (sometimes with a *different* column set reflecting sensors at
end-of-run) plus a blank line. Skip lines matching `Date,*` and blank lines.

### 5. Min/max/average columns are cumulative since HWiNFO launched
They blend idle and load. Press the reset button (⟲) immediately before any measurement run, and
prefer computing your own statistics from the CSV.

### 6. Sensors that lie or are absent
- **`GT Cores Power` ≈ 0** on Meteor Lake even under real graphics load — the graphics tile isn't
  in that RAPL domain. Don't conclude "iGPU idle" from it alone; cross-check `GPU Total Usage`
  and `GPU Media Engine Usage`.
- **`Processor Frequency`** (perf counter, not HWiNFO) often reports a constant nominal value.
  Use HWiNFO's `Average Effective Clock` instead.
- **Fan RPM may not exist at all**, even with EC support enabled in HWiNFO → Settings → Safety.
  Don't send the user chasing it.

### 7. Derive TjMax, don't assume it — and verify it per-sample
`Core Temperature + Distance to TjMAX = TjMax`. On the L16 Gen 1 this gives **110 °C**.

**Compute it per-sample and assert the result is constant**, rather than adding two column
averages by hand:
```powershell
# every sample should yield the same value; distinct count must be 1
$sums | Sort-Object -Unique     # -> @(110)
```
In the original investigation a mental addition of `48.64 + 61.36` was reported as 100 instead of
110, and that 10 °C error inverted a headroom conclusion ("sitting exactly at TjMax" vs "10 °C of
margin"). The machine will tell you the right answer for free; ask it.

Note that thermal throttle flags fire well *below* TjMax — Intel throttles progressively via the
thermal control offset and RATL. So "throttling at 100 °C with TjMax 110 °C" is entirely
consistent; do not use throttle flags to infer TjMax.

## PowerShell 5.1

### 8. `if` is not an expression
This is a runtime error, most often inside a hashtable literal:
```powershell
# BROKEN
[pscustomobject]@{ Name = if ($x) { 'a' } else { 'b' } }
# OK
$n = 'b'; if ($x) { $n = 'a' }
[pscustomobject]@{ Name = $n }
```
Also absent: ternary `?:`, null-coalescing `??`, `?.`, and `-AsHashtable` on `ConvertFrom-Json`.

### 9. A typed param silently coerces a same-named variable — the nastiest one
Variables are **case-insensitive**, and a `[string]`-typed parameter keeps its type constraint
for the whole script:
```powershell
param([string]$Hw = 'file.csv')
$hw = @()            # <-- becomes "" , NOT an empty array
$hw += $someObject   # <-- string concatenation
$hw.Count            # <-- 1, always
```
This silently produced "1 valid sample" from a 652-row file. **Never reuse a parameter's name for
an accumulator, in any casing.** Prefix accumulators (`$rowsHw`) or name params distinctly (`$HwFile`).

### 10. Perf-counter traps
- `Win32_PerfFormattedData_*` rate values come from WMI's own internal cache and are unreliable
  on first query. Use `Win32_PerfRawData_*` and compute deltas yourself against
  `Timestamp_Sys100NS`.
- **Per-thread context-switch deltas are not attributable.** `Thread` instance names are
  `process/ordinal`, and the ordinal is *positional* — it gets reused as threads come and go, so
  deltas across two samples mix different threads and inflate totals ~12×. For per-process
  attribution use CPU-time deltas (`Get-Process`.`TotalProcessorTime`) and get the system-wide
  switch rate from `\System\Context Switches/sec`.
- `Get-Counter` path parsing: `$sample.Path -replace '.*\\\\[^\\]+\\',''` to strip the machine prefix.

### 11. Elevation and UAC
`powercfg /energy`, `/sleepstudy`, `/requests`, `/srumutil`, `/waketimers` **all require
Administrator**. Non-elevated they fail with a clear message. Launch with:
```powershell
Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File',$script
```
The UAC prompt is the user's consent gate. Have the script write results to files and poll for
them rather than blocking.

### 12. Regex `$Matches` is clobbered
Inside a loop that does two `-match` tests, the second overwrites `$Matches` from the first. Use
`[regex]::Match()` and read `.Groups[n]` instead.

## Device safety

### 16. USB composite devices: protection must be inherited across interfaces
A physical USB device exposes several PnP nodes — a composite parent plus one child per
interface (`&MI_00`, `&MI_01`, …). Only the *children* carry the meaningful class:

```
USB\VID_xxxx&PID_yyyy\<instance>          <- parent, Class = USB      (looks harmless!)
USB\VID_xxxx&PID_yyyy&MI_01\<instance>    <- child,  Class = HIDClass (the keyboard)
```

Classifying on the node's own class alone marks that parent as a safe disable candidate.
**Disabling it disables the keyboard.** The first version of `usb-quiet.ps1` did exactly this and
offered the keyboard, the headset, the webcam and the WWAN modem as candidates.

**Fix:** group nodes by VID+PID (all interfaces of one physical device share them) and if *any*
member is protected, protect the whole group. Report the reason so it's auditable:
`"same physical device as a HIDClass interface"`.

Protect on **both** class and service — a Logitech headset presents as `Class=MEDIA`,
`Service=usbaudio`, neither of which matches a naive `HIDClass|Keyboard|Mouse` filter.

### 17. A disabled device reports Status "Error"
`Get-PnpDevice` shows `Status=Error` for a deliberately disabled device. Check `.Problem` —
`CM_PROB_DISABLED` (Code 22) means it worked. Don't report it as a failure.

## Interpretation

### 13. Two power levels minimum for thermal resistance
A single short load sample gave 2.8 °C/W (looked broken). Pooling a 10-minute idle log with a
12-minute busy log and regressing on 30 s-smoothed power gave **1.7 °C/W** — normal. Temperature
lags power, so smooth the power series before regressing, and exclude TjMax-clipped samples.

### 14. The regression intercept is not ambient
It is inflated by chassis heat soak and by non-CPU platform power. Don't present it as room temperature.

### 15. Beware of measuring your own diagnostics
PowerShell scripts, Claude/agent processes, Process Explorer and HWiNFO all show up in the logs.
When a capture window overlaps active diagnosis, say so and treat the process ranking as
contaminated — the power-vs-wakeup *relationship* remains valid.
