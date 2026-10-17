# Over time

Pick it when the source says **"X rises and falls over the day / year / cycle / decades"** or **"A + B adds up to the
curve"**: the equation of time, sunrise drift, GDP per person over 25 years, a drug level through the day, a
compartment model of inflammation. Not when the point is *what drives what* (graph), *what happened when* (timeline),
or *it depends on k* (sweep).

Skeleton: `node scripts/build.js new over-time page.html` (`assets/skeleton.html`). Modules: `core`, plus `3d` when
the geometry is the point (orbits, the sky, a body in space).

## Model
- `modelAt(t, P)` for one moment, returning the total **and each cause's part** (`{ a, b, total }`), and `series(P)`
  over the whole cycle. Decompose exactly where possible (A + B = total); the ghost curves and shares come from it.
- Every meaningful variable is a parameter (latitude, tilt, eccentricity, rate, exchange rate…), so sliders and
  what-ifs are just `P` changes. A cause is switched off by a toggle (`offA`) that zeroes its term.
- Data series (economics, measurements): keep the raw data in model.js, compute derived series (growth, per capita,
  constant-currency) in functions, and decompose a change exactly (e.g. log-additive factors: real growth × prices ×
  exchange rate × population).

## Views
- Main: `IE.lineChart` of the total with each cause as a dashed ghost, the selection as a cursor, click to pick a
  moment. Secondary: a scene (2D diagram, or 3D with `IE.v3`) at the selected moment, or a waterfall/bar chart of
  the parts at the selected moment (`IE.barChart`).
- Selection: time `T`, numeric `sel` with `unit` = one natural step (a day, an hour, a year), `cyclic: true` for a
  cycle, false for a span of years. Play advances it.

## What-ifs and tour
- What-if segment: Real / only A / only B / neither (or one per cause plus "all frozen" for factors).
- Tour: the puzzle (answer in the reader's numbers) → define terms concretely → each cause alone (the step sets the
  others off) → the combination → a named case from the source (preset) → the step up (a sweep across latitude, years
  or parameter values, small multiples) → what to remember.

## Validation
Reproduce the source's table(s) with the source's value next to the model's; extremes and their dates; the
decomposition sums to the total (to rounding); flat when every cause is off.

## Pitfalls
- An offset hidden in absolute clock time (time zones, reference meridians): make it a parameter.
- A thin curve on equal axes hides its shape: stretch and say so.
- The 3D subject drifting to the limb: let the camera follow it (`azAdd`).
