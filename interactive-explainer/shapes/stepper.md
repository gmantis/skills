# Stepper shape (`IE.stepper`): sequence, protocol, state machine, algorithm, code walkthrough

Start: `node scripts/build.js new stepper page.html`. Page blocks: `<style data-ie="stepper">` and
`<script data-ie="stepper">` after core. Demo: Client → Gateway → Worker payment; the reply can be lost or slow, the
client retries, an idempotency key decides whether the retry charges twice.

## When to pick it
- The source says "first…, then…, if … else …", "who sends what to whom, in which order", a protocol, a life cycle,
  an algorithm's steps, or "explain this function / script". The point is **order** and **who knows what when**.
- Boxes-and-arrows with no time order → graph shape (a state machine can be either: pick the stepper when the
  reader must follow one run, the graph when the reader must see every transition at once).

## The model (`model.js`): a pure simulator
```js
const ACTORS = [{ id: 'C', label: 'Client', short: 'Client' }, …];     // one lane each; short = phone header
function simulate(p){
  const R = IE.stepper.recorder({ C: { done: false }, W: { charges: 0 } }), st = R.st;   // live state; mutate it
  R.msg(t, 'C', 'G', 'POST /pay', payload, 'One sentence.', { tArr: t + p.lat, lost, line: [2, 3] });
  R.note(t, 'W', 'charge #1', 'One sentence.', { line: [10, 11] });
  R.at(t + p.timeout, tt => …);                                          // schedule; ties run in the order scheduled
  R.at(0, start); return R.run();                                        // -> TRACE, each entry with a state snapshot
}
const INVARIANTS = [{ id: 'once', label: 'Charged at most once', check: (s, isEnd) => s.W.charges <= 1 }];   // true | false | null
const REF_LABEL = 'With the key (correct)', referenceRun = p => simulate({ ...p, noKey: false });
const fmtT = t => t + ' ms', fmtTick = t => t + ' ms';
```
Node test: `globalThis.IE = {}; require('<skill>/runtime/stepper.js'); const m = require('./model.js');`.
- `short` is the diagram label (about 18 characters at most); `text` is the sentence in "At this step".
- `tArr` equal to `t` (the default) = an instant message, drawn flat: function calls inside one request, a code
  walkthrough where only order matters. A later `tArr` draws a sloped arrow down to the arrival time. `lost: true`
  draws a dashed arrow ending in a red cross halfway.
- `check(state, isEnd, entry, i)` returns `null` while it cannot tell yet ("the client ends with an answer").
- The reference run: for protocols, the correct rules on the **same input**; for code, the **fixed version under the
  same conditions**. Both beat a fixed baseline, because the diff then shows exactly where the what-if goes wrong.

## Main view and selection
- Lanes: one per actor, sticky headers, time down the page (time-proportional; a quiet stretch longer than `maxGap`
  is shortened and drawn as a dotted break, the gutter keeps the real times). The current entry gets a highlighted
  row, later entries fade, the first entry that breaks a rule is red, gutter times turn red from the step where the
  run leaves the reference.
- **The selection is the trace index K** (numeric `sel`, step 1): the slider (`data-time`), ▶ (about 1.4 steps/s),
  ← →, Back/Next buttons, clicks on a lane entry or a comparison row all set it. `IE.stepper.setLength(app, n)` in
  `recompute` sets the range; ▶ at the end restarts at step 1.
- Linked views, all redrawn from K: lanes, "At this step" card (message fields that changed since the previous
  message, every actor's state with changes marked, each rule ✓ ✗ …), the source panel (lines of `entry.line`),
  the reference-vs-this-run table.
- Phone: keep **4 lanes or fewer** and give actors a `short` name; with more, the lanes scroll sideways inside their
  own box (`minLane` px per lane), never the page.
- Tour steps set `sel` to a number or a function of the new TRACE: `sel: () => findK(e => e.short === 'timeout → retry')`,
  `sel: () => AN.firstBreak.once`, `sel: END` (`const END = () => TRACE.length - 1`), so a step lands on its moment.

## What-if
Change the input (presets from the source), drop / delay / duplicate a message, or break a rule (skip a step, change a
guard, remove the key); the comparison table and the red gutter show where the run diverges. Toggles default to off,
so phrase them as the break ("Client sends no idempotency key").

## Tour order
The normal run (concrete, step 1) → the first thing that goes wrong (land on it) → the fix working → the fix removed
(land on the first broken rule) → a second cause with the same symptom → the step up: rerun the whole simulation
across a setting (worker time, input size) and chart an outcome, with the threshold named.

## API (`IE.stepper`)
- `recorder(state0)` → `R = { st, trace, at(t, fn), note(t, actor, short, text, extra), msg(t, from, to, short, payload, text, extra), run(max) }`.
- `analyse(trace, invariants)` → `{ firstBreak: { id: i | -1 }, broken: Set, ok, at(i) → [{ inv, r }] }`.
- `diverge(trace, ref, key = keyOf)` → first differing index, or −1. `keyOf(e)`, `labelOf(e, actors)`.
- `setLength(app, n)`; `K(sel)` → integer trace index.
- `lanes(host, { actors, fmtTick, onPick, title, minLane: 84, timeSpan: 420, timeScale, maxGap: 110 })` →
  `L.set({ trace, div, broken })` (rebuild), `L.at(k)` (cheap; keeps the entry in view inside its own scroll box).
- `source(host, { text, name })` → `{ at([from, to]) }`.
- `card(host, { actors, invariants, fmtT })` → `{ set({ trace, k, an }) }`.
- `compare(host, { refLabel, actors, onPick })` → `{ set({ ref, trace, div }), at(k) }`.

```js
recompute(P, app){ TRACE = simulate(P); REF = referenceRun(P); AN = S.analyse(TRACE, INVARIANTS); DIV = S.diverge(TRACE, REF);
  S.setLength(app, TRACE.length); lanes.set({ trace: TRACE, div: DIV, broken: AN.broken }); cmp.set({ ref: REF, trace: TRACE, div: DIV }); lastK = -1; },
render({ sel }){ const k = Math.min(S.K(sel), TRACE.length - 1); if (k === lastK) return; lastK = k;
  lanes.at(k); card.set({ trace: TRACE, k, an: AN }); src && src.at(TRACE[k].line); cmp.at(k); },
```

## Code walkthrough
- Re-implement the logic in `simulate`, one entry per branch decision, call, load or write, each with `line`. Keep
  globals and cross-call state in the actor `state`, and drive it with a realistic run of inputs that crosses the
  edges the code handles (midnight, a missing file, a retry).
- Verify every built-in the logic depends on (product docs first, then a one-line REPL check under the conditions
  that matter) and say on the page what you verified.
- Embed the source verbatim, HTML-escaped, in `<pre hidden id="…" data-name="file.ext">` and read its `textContent`.
  Never use `<script type="text/plain">`: check.js syntax-checks every inline script.
- Say it is a model built from reading the code, and label any suggested fix as a sketch.

## Validation ideas
Exact timings from the rules (answer after `4·lat + work`; retry answer at `timeout + 4·lat`), counts (hops, charges),
every invariant holding at every step of the normal run, the normal run equal to the reference, a threshold found by
sweeping the simulation equal to the closed form, and "never" claims checked across a grid.

## Pitfalls
- Simultaneous events: ties run in the order scheduled, so a reply arriving exactly at the timeout loses to the timer
  scheduled earlier. Decide which the source means and state it ("a reply exactly at the timeout is too late").
- A full-width row per entry keeps labels from colliding; keep `short` short instead of shrinking the font.
- Keep side panels out of the per-frame path: render() returns early unless K changed.
- The page needs `.tablewrap{position:relative}` until core.css has it (phone sideways scroll from the hidden header).
