# Graph shape (`IE.graph`): causal network, structure, state machine as a graph

Start: `node scripts/build.js new graph page.html`. Page blocks: `<style data-ie="graph">` and `<script data-ie="graph">`
after core. Demo: two drivers push an outcome directly and through a mediator; a brake closes a balancing loop.

## When to pick it
- **Causal network**: the source says "A raises B, which lowers C", "what drives X", feedback, vicious or virtuous
  circles. Signed weighted arrows, loops marked R/B, an exact split of the outcome per input.
- **Structure**: "X is made of parts; each part does…", architecture, anatomy, dependencies. Same view, no weights.
- **State machine as a graph**: states as boxes, transitions as labelled arrows, the current state highlighted. If the
  story is the *order* of events between actors, use the stepper shape instead.
- Keep it to **12 boxes or fewer**. Past that, group boxes into a parent box (its card lists the children), or split
  the page. Above about 25 nodes a hand layout won't do; see "Libraries" in SHAPES.md.

## The model (`model.js`)
```js
const NODES = [{ id: 'A', label: 'Driver A', kind: 'input', desc: '…' }, …, { id: 'O', label: 'Outcome', kind: 'output' }];
const EDGES = [{ id: 'AM', from: 'A', to: 'M', w: 'wAM', desc: '…' }, …];   // w: param key | number | p => number | omitted (= 1)
const REAL = { inA: 1, wAM: 0.8, … };                                       // input levels are in<ID>
const NET = IE.graph.net({ nodes: NODES, edges: EDGES });
if (typeof module === 'object' && module.exports) module.exports = { NODES, EDGES, REAL, NET };
```
Node test: `globalThis.IE = {}; require('<skill>/runtime/graph.js'); const m = require('./model.js');`.
- Linear signed influence `x = ext + W·x`. `settle` runs rounds of influence (`x_{k+1} = ext + W·x_k`); because it is
  linear, every box = the sum of "only this input on" (`decompose`), exactly. Edges into inputs are ignored.
- Switches live in P: `off_<node>` (box switched off, its arrows carry nothing), `cut_<edge>`. Put `...NET.switches()`
  into `real` so every step starts with all of them off (IE.app's `goStep` only resets keys that `real` has).
- Saturation or thresholds: pass `w: p => …` for a parameter-dependent weight, but a non-linear update
  (`y = f(ext + W·x)`) needs your own settle; drop the exact split and show "only this cause on" shares, labelled as
  not adding up exactly.
- Weights from a non-numeric source: small round numbers (0.3, 0.6, 0.9), say "illustrative weights" on the page, and
  validate the qualitative claims (signs, which route dominates, the loop damps).

## Main view and selection
- `IE.graph.view(host, NET, opts)` draws the layered SVG: inputs on the left, feedback arrows routed orthogonally in
  their own lane below the boxes, arrows that skip a layer routed through waypoints (never through a box), badges and
  edge labels placed clear of boxes and of each other. It switches to top-to-bottom (feedback lane on the right) when
  boxes would be narrower than `minNodeW` (90 px), so phones get a readable column.
- **Two pieces of state**: the numeric selection is the *round of influence* (slider with `data-time`, ▶ replays how a
  change spreads from the old steady state, ← → one round); the *pick* (`P.pick = 'n:O' | 'e:FM'`) is the selected box
  or arrow. Keeping pick in P lets steps set it (`params: { pick: 'e:FM' }`) and puts it in shareable links. Clicking a
  box, an arrow or a contribution bar sets it; the detail card, the bar chart and the spread chart follow.
- Steps land on the settled state: `sel: END` with `const END = () => RUN.rounds`. Param changes from the reader replay
  (`IE.graph.rounds(app, n, replay)` does the plumbing; skipped under reduced motion).
- `focus: [ids]` on a step dims everything else (the loop's boxes and arrows, one driver's path).

## What-if
Switch a driver off (`off_A`), cut an arrow (`cut_FM`, "without the loop" as a live counterfactual), or move a weight.
Structure: switching a part off greys every part that stops working (`NET.broken(P)`, see below).

## Tour order
The whole map (concrete values) → each driver alone (others off, `focus` on its path) → each loop (gain, "without
it" number, cut/restore buttons) → everything together with the shares adding up → the step up: one weight across its
range (`NET.sweep`), with the runaway range shaded and never quoted.

## API (`IE.graph`)
- `net({ nodes, edges, out, needs, keys })` → NET with:
  `settle(p, x0?, { maxIt: 5000, tol: 1e-9, blow: 1e6, trace: true })` → `{ x, trace, converged, runaway, rounds }` ·
  `solve(p)` exact fixed point by Gaussian elimination (null if singular; exists even when the rounds run away) ·
  `decompose(p)` → `{ by, ok, share(input, node = out), sum(node) }` · `loops(p)` → `[{ edges, nodes, gain, type: 'R'|'B'|'0', name: 'R1'|'B1'|'cut' }]` ·
  `cycles` · `flux(p, x)` → `{ edgeId: weight × source }` · `weight(e, p)` · `ext(p)` ·
  `run(p, prevX)` → `{ sol, dec, loops, rounds, converged, x, before, at(k) }` (everything a page redraws from) ·
  `sweep(p, key, xs, node = out)` → `[[v, value | NaN when it does not settle]]` · `broken(p)` → Set of failed boxes
  (a box fails when it is off, or when all its suppliers failed; `needs: 'any'` on a node or on net: any) ·
  `key(p)` (skip re-solving when only view state changed) · `switches()` · `layout()` · `label(id)`, `idx`, `edge`, `inputs`, `out`.
- `view(host, NET, { title, weights: true, values: true, loops: true, fmt, onPick, nodeW: 140, nodeH: 50, minNodeW: 90 })` → V;
  `V.set({ p, x, focus, pick, hot: [ids], broken: Set, loops, runaway, summary })` updates attributes only (cheap per
  frame); geometry is rebuilt when the width changes. Boxes and arrows are `data-pick`, focusable, Enter/Space picks.
- `dyn(NET, RUN, p, fmt?)` → live numbers `x_<node>`, `f_<edge>`, `w_<edge>`, `c_<input>`, `c_<input>_<node>`,
  `loop<n>`, `gain<n>`, `type<n>`, `out` ("runs away" when the loops do not settle). Add page keys to the object.
- `detail(NET, pick, p, { weights })` → card HTML with live numbers and a `data-set` switch-off / cut button.
- `rounds(app, n, replay)` → sets the round slider's range; ▶ at the end restarts from round 0.
- `fmt(v)` → two decimals, or "runs away".

```js
const map = IE.graph.view(document.getElementById('map'), NET, { title: 'Map of causes', onPick: id => app.set({ pick: id }) });
// in recompute: if (NET.key(P) !== lastKey){ RUN = NET.run(P, RUN?.converged ? RUN.x : null); IE.graph.rounds(app, RUN.rounds, !!old); }
// in render:    map.set({ p: P, x: RUN.at(sel), focus: step.focus, pick: P.pick, loops: RUN.loops });
```

## Structure (no weights) and state machines
- Omit `w` (every weight is 1) and create the view with `{ weights: false }`: no badges, no numbers, no flow
  animation, uniform arrows, no loop labels. Pass `broken: NET.broken(P)` to grey the parts that stop working, and
  `detail(NET, pick, P, { weights: false })` lists "Gets from / Feeds / Without it: … stop working".
- State machine: states as nodes, transitions as edges with `label: 'timeout'` (drawn as a small tag on the arrow);
  self-transitions are drawn as a loop at the box's top right. Mark the current state and the last transition with
  `hot: ['S2', 't3']`; the trace position can be the numeric selection (a `TRACE` of states, as in the stepper).

## Validation ideas
Rounds reach `solve(p)` (exactness of the replay); a closed form for a small net (`O = … / (1 − loop gain)`); the
shares sum to the total; each loop's sign matches the source (R or B); cutting a balancing loop raises the outcome;
the gain where it starts to run away (|gain| ≥ 1 for a lone loop). For structure: removing part X breaks exactly the
parts the source names.

## Pitfalls
- A forward arrow that skips a layer used to run through the box between, hiding its badge; waypoints prevent it.
  Feedback arrows leaving the bottom of a box with another box below it ran through that box; they now leave sideways.
- Several feedback arrows on one box share a lane end: their ends are fanned 12 px apart.
- With several loops, `|gain| < 1` per loop does not guarantee settling; trust `converged`, and keep `maxIt` high:
  a gain of −0.98 needs about 2 000 rounds to settle within 1e-9.
- Pick values are strings (`'n:O'`): keep them in `real` so `goStep` resets them and links restore them.
- The page needs `.tablewrap{position:relative}` until core.css has it, or the validation table's hidden header
  scrolls the phone page sideways.
