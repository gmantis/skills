# Simulation (spatial / agent-based, stepped over time)

Start: `node scripts/build.js new sim page.html` (demo: 400 haze particles in a sealed 50 m³ room with a purifier,
validated against C(t) = C0·e^(−(CADR/V)t)). Runtime: `<style data-ie="sim">` and `<script data-ie="sim">` after core.

## When to pick it
The source describes many individual things moving or interacting in space, and the aggregate is the point: "particles
are removed by the filter", "an infection spreads from neighbour to neighbour", "cars bunch up", "heat diffuses",
"people queue at counters". Pick it when seeing the individuals makes the aggregate believable, or when the textbook
formula holds only under an assumption (well mixed, independent, steady) that the simulation can break. If only the
formula matters, use the over-time or parameter-sweep shape and skip the agents.

## Model (model.js, pure, seeded)
`{ init(P, rng) -> state, step(state, P, rng, t, dt), measure(state, P, t) -> { key: number }, clone(state) }`
- Fixed timestep `dt`; all randomness from the `rng` argument (never `Math.random`), so a seed fixes the run.
- State in typed arrays (x, y, alive, …) with a fixed capacity when agents can appear; count overflow, never grow silently.
- `measure` returns the aggregates you plot and check (count, concentration, cumulative removed, infected…).
- Write the **analytic or ODE solution** next to it (`analytic(P, t)`): it is the ghost line and the validation target.
- Choose per-tick probabilities so the expected rate is exact: survival per tick e^(−k·dt); a zone-limited process
  divides by the zone's share of the space (the demo's `(1 − e^(−k·dt))·A/A_zone`). Writing `k·dt` biases it.
- Keep the agents' previous positions (`px`, `py`) if you want smooth motion between ticks while playing.
- Variants: epidemic on a grid (cells in a Uint8Array, neighbour rule, `IE.sim.grid` to draw), queues (agents with
  arrival/service times; positions only for drawing), traffic (1D ring road, cars with gaps), diffusion (particles or
  a cell field). Same engine, same page.

## Main view, selection, what-if, tour
- **Selection = simulation time** (numeric `sel`, `step` = `unit` = dt, so ← → move one tick and pause; the slider is
  `data-time`). The app's ▶ Play advances it; `IE.sim.transport` adds Step ▸, Reset and a speed switch.
- Main view: `IE.sim.view` — canvas for the agents, SVG overlay for walls, zones and labels (themed, lintable).
  A HUD line above it (`.ie-sim-hud`) carries the live numbers; keep text off the canvas.
- Linked views: the time series (`IE.sim.chart`: this run up to t, the formula as a ghost, the spread of N seeded runs
  as a band; clicking sets t), and a bookkeeping bar chart (where every agent is now) that must add up.
- What-if = switch the mechanism off (purifier off: nothing changes, exactly), add a competing process (window open:
  a steady state), scale it (two purifiers: double rate), or break the formula's assumption (still air).
- Tour: the setup at t = 0 → **one concrete tick or minute** (what happens to one agent, its chance per tick) → the
  formula with the run on it → the assumption broken → a competing process → **step up**: N runs at once (the band)
  and a parameter change near the end.

## Module API (`IE.sim`)
```js
const sim = IE.sim.engine(ROOM_MODEL, { dt: 3, horizon: 3600, every: 5, snapEvery: 50 });
sim.run(P, seed)            // main run: records every `every` ticks, keeps snapshots (cheap scrubbing back and forth)
sim.at(t) -> state          // state at time t; sim.tick(t); sim.series('c', t => t / 60) -> [[x, y]]; sim.value('c', t)
sim.headless(P, seed)       // records only; sim.repeats(P, n, { seed0, q: 0.1 }) -> { t, n, mean, sd, lo, hi }[key][i]
sim.spread(P, n, done, { delay, chunk })   // the same in slices (UI stays live); cancels the previous call; returns cancel()
IE.sim.rng(seed)            // = IE.seeded's stream, state in r.s; r.normal(), r.int(n), r.poisson(m), r.range(a, b)
IE.sim.fitExp([[t, y]], { from, to }) -> { k, c0, half }    // log-linear least squares
const room = IE.sim.view(host, { world: { w: 5, h: 4 }, maxHeight: 380, title, summary,
  zones: [{ id, x, y, w, h, label, kind: 'sink'|'source'|'zone', color, off, pick }], onPick: id => …,   // pick: clickable zone
  draw(ctx, tf, frame){ IE.sim.dots(ctx, tf, xs, ys, n, { alive, color: IE.color('s2'), r }); IE.sim.grid(ctx, tf, vals, nx, ny, { world, max }); } });
room.draw(frame) /* in render */; room.set({ zones }) /* in recompute */; room.label(id, text); room.zone(id)
const chart = IE.sim.chart(host, { ...lineChartSpec, spread: [{ lo: [[x, y]], hi: [[x, y]], color }] })
IE.sim.transport(app, { rates: [['10×', 10], ['60×', 60], ['300×', 300]], value: 60 })   // speed = sim seconds per real second
IE.sim.clock(seconds) -> 'm:ss'
```
`tf` maps world units to pixels: `tf.X(x)`, `tf.Y(y)` (origin top-left, y down), `tf.k` px per unit.
The engine, rng, repeats and fitExp run in Node: `globalThis.IE = {}; require('runtime/sim.js'); require('./model.js')`.

## Page pattern (see the skeleton)
- `recompute(P)`: `sim.run(P, SEED)`, zones, start `sim.spread` for the band (cache by a key of the model's params).
- `render({ P, sel })`: `sim.at(sel)` → room.draw, chart cursor/marks every frame, but rebuild the chart's series only
  when the recorded index changes (a key) — a full lineChart rebuild at 60 fps is wasteful.
- Validation runs once after the first paint (`setTimeout`), seeded so the result never flickers; rows show
  "running…" until then.

## Validation ideas
- Mean of N seeded runs vs the formula at 3 times, within 3 standard errors (sd/√N): the demo's worst is 0.9 SE.
- Fitted rate or half-life vs the formula (±5%); a doubled cause doubles the fitted rate (±8%).
- A steady state (window open) vs the ODE's fixed point, averaged over the last quarter of the run.
- Conservation and bookkeeping exactly, every tick (nothing lost when nothing removes; in + caught + out = start + in).
- Determinism: the same seed gives the identical record. Plus one assumption-breaking case that must disagree.

## Pitfalls seen building it
- Local depletion: a sink zone that is small or strong empties its neighbourhood and the decay runs slower than the
  well-mixed formula (D = 0.05 m²/s gave −13%). Mix faster than you clean (D = 0.25, a 1 × 1.6 m intake) or say so.
- The `k·dt` per-tick probability is biased at coarse ticks; use the exact survival form.
- Interpolating positions between ticks only while playing; a paused or stepped frame shows the exact tick (and under
  reduced motion, frames are always still; nothing autoplays).
- N repeats on every slider move freeze the page: debounce with `sim.spread` (delay, chunks, cancel) and cache by key.
- Injected agents need a free slot: fixed capacity, reuse dead slots, count what did not fit (`lost`) and check it is 0.
- Canvas text is not lintable and is unreadable in screenshots at small sizes: zone labels go in the SVG overlay.
- The overlay svg would count as "mostly empty" for check.js; the room's wall outline (a path spanning it) avoids that.
- `IE.lineChart` has no band primitive; `IE.sim.chart` draws one as a closed ghost series and restyles it after each
  rebuild (wrapping `chart.set`).
