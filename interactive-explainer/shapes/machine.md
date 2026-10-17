# Machine shape (`IE.machine`)

Start: `node scripts/build.js new machine page.html`. Demo: a token-bucket rate limiter drawn as an isometric
machine (conveyor, gate, glass tube of tokens, drip regulator, reject chute and bins), driven by one pure model at the
selected time, validated against the exact long-run pass share (M/D/1/K), its large-bucket limit min(1, r/λ) and the
burst bound.

## When to pick it
The mechanism *is* a physical object, or maps one-to-one onto one: a cache key as a pin-tumbler lock, a rate limiter
as a token bucket, a gearbox, a lock-and-key protocol, a valve. The source says "imagine a bucket that…", "like a
turnstile", "the pins line up". If the parts are abstract boxes with arrows, use the graph shape; if only the
numbers change, use over-time or sweep.

## Model
- Pure simulation over a seeded input (`simulate(p)` → events), `stateAt(sim, t)` for everything drawn at time t,
  and the analytic results the machine should obey (long-run rate, bounds, conservation).
- The figure is a **pose function**: `pose(t, P)` places every part from `stateAt(sim, t)` (positions are functions of
  time since each event: approach, pass, reject), so scrubbing backwards works and the figure, chart and readout can
  never disagree.

## Main view
- An isometric SVG figure of 40–80 small purposeful parts (base plate, screws, rails, ticks, the moving parts), solid
  boxes, cylinders and prisms with three-tone shading by facing (top light, left mid, right dark), painted back to
  front. One **lit accent part** the reader should watch (`lit: true`, the accent colour): here the tokens.
- **No words in the drawing.** The framed card carries "Fig n" (top left), the title (top right), a hint (bottom
  left) and the live readout (bottom right). Parts are explained by picking them: the detail card under the frame
  (and a "Parts:" list of chips when nothing is picked, which is also the keyboard path).
- Linked views: a chart of the state over time (cursor = selected time, click to jump) and one step up (here the
  long-run pass share against arrival rate, click to set λ).

## Selection
Numeric `sel` = time (slider `data-time`, play at real speed). `sel.stepBy` jumps to the next / previous event (one
request), which reads better than a fixed time step. The figure eases to the new time with
`IE.machine.follow` (0.25–0.7 s tween; snapped while playing and under reduced motion; a cut, not a
fast-forward, for jumps longer than `maxJump`, such as tour steps).

## What-ifs and tour
- Sliders for the machine's settings (λ, r, b); toggles that change the input (a burst); `whatIf` presets for named
  regimes (light load, overload, overload + burst).
- Tour: the first event on a fresh machine → the refill alone (light load) → the first failure (overload) → a burst →
  the same burst with a bigger part → step up across the range (long-run chart).

## Module API
```js
const fig = IE.machine('machine', { fig: 'Fig 1', title, hint, label (aria), maxHeight: 560, extent?, pad?, onPick? });
const p = fig.part(id, { name, info: html | (state) => html, pick: true | 'groupId' | false, lit, layer, bias, mat });
p.box([x, y, z], [w, d, h], mat)                     // x lower right, y lower left, z up (model units)
p.cyl([x, y, z], r, h, mat, { axis: 'z'|'x'|'y', n }) // smooth side, faceted n-gon
p.prism([[u, v], …], a0, len, mat, { axis })          // convex profile across `axis`, extruded along it (ramps, wedges)
  // opt.inside: draw the far inner wall (glass back half); opt.cls: 'glass' (translucent)
p.move([dx, dy, dz]); p.show(bool); p.material('good'); p.clear().box(…)   // per frame; translation only
fig.build()                                            // once: draws, fits the viewBox to every part (+ extent points)
fig.state = {...}; fig.update()                         // per frame: applies moves, re-sorts depth, refreshes the card
fig.readout(html); fig.pick(id | null)                  // readout bottom right; open/close a part's card
IE.machine.frame(host, { fig, title, hint })            // the framed card alone, around any figure -> { el, body, card, readout }
IE.machine.follow(v0, { base, perUnit, max, maxJump }) // .update(target, snap) -> shown value; .moving
IE.machine.bump(dt, rise, hold, fall)                   // 0→1→0 pulse after an event (barrier lift, pusher stroke)
IE.machine.ease.{inOut, out, in, linear}, IE.machine.spring(x, v, target, dt, k), IE.machine.iso([x,y,z]) -> [sx, sy]
```
Materials: `base, steel, dark, rubber, glass, paper, brass, accent, token, good, bad, ink` (machine.css mixes them
from the core theme tokens), or any core slot (`'s3'`) or CSS colour. A part's `mat` is the default for its solids;
give solids no `mat` when the part changes colour per frame (`p.material(...)`).

Render loop: `render({ P, sel, app }) { const t = SHOW.update(sel, app.playing); pose(t, P); if (SHOW.moving)
app.redraw(); … }`; the readout and charts use `sel`, the figure catches up.

## Depth order
Parts are sorted per update by their world boxes: a part entirely on the far side of another along x, y or z is
painted first (exact for disjoint boxes); parts whose boxes intersect fall back to `bias`, then x + y + z. So:
- split containers into a back part (`bias: -1`) and a front part (`bias: 1`) with the contents between (bins,
  trays, the glass tube: `inside: true` back half, translucent front half);
- keep each part convex-ish and small; a long thin part (rail) is fine, an L-shape spanning others is not;
- `layer: 0` for the base plate.

## Validation ideas
- The long-run rate the machine should reach: an exact formula (here M/D/1/K by its embedded Markov chain) against
  a long seeded run with batch-means standard errors, and its limit (min(1, r/λ) for a large bucket).
- Bounds the mechanism guarantees on the drawn trace (no window of τ s passes more than b + r·τ).
- Conservation (arrived = passed + rejected; level within [0, b]); a degenerate case with a textbook answer
  (b = 1 is the Erlang loss formula 1/(1 + λ/r)).

## Pitfalls
- A part whose solids carry their own `mat` ignores `p.material()` (the solid's colour wins).
- Every pickable element has `data-pick`; parts that share a `pick` id share one card and one tab stop. check.js
  lists every element but clicks the first one with that id each time, so a pool of 26 boxes costs 26 identical
  clicks. Picking is idempotent (no toggling), so repeated clicks are harmless.
- Positions of moving things must come from the model's event times; never integrate positions frame by frame, or
  ← → and the URL state show a different picture from the one reached by playing.
- Poisson arrivals overlap on a conveyor; alternate two lanes by event index rather than delaying boxes.
- `IE.machine.follow` eases the *time*, so a long jump replays the mechanism fast; cap the duration (`max`).
- The svg is `role="group"` (not `img`) so its parts stay reachable as buttons; it has an aria-label and a `<title>`.
