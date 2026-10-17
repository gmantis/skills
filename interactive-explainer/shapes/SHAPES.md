# Explanation shapes

A page explains best when its main view has the same shape as the idea. Pick the shape in SKILL.md step 0, then read
only that shape's guide. Every shape keeps the same core (runtime `IE.app`): a **pure model**, a **guided tour**,
**what-if switches**, **live numbers**, **one shared selection** that every view reads and writes, and `check.js`.
Only the main view and what "the selection" means change.

| Shape | Main view | Selection | What-if means | Guide · module |
|---|---|---|---|---|
| over-time | chart over the cycle/years + scene | time | switch a cause's term off | `over-time.md` · core (+3d) |
| graph | boxes and signed arrows, loops R/B; or a structure map | box / arrow | switch a box off, cut an arrow, remove a part | `graph.md` · graph |
| stepper | lanes of actors with messages; states; code with running lines | trace step K | change the input or a rule; diff vs reference | `stepper.md` · stepper |
| compare | options × criteria table + weight sweep | option / criterion | change weights; "only X matters" | `compare.md` · compare |
| sweep | outcome over a parameter + small multiples | parameter value | a cause off across the whole sweep | `sweep.md` · sweep |
| tree | collapsible tree + zoomable treemap | node and its path | hide a branch, switch measure | `tree.md` · tree |
| recordflow | pipeline of components, one record's fields per hop | (record, component) | change a rule, the order, the data | `recordflow.md` · recordflow |
| timeline | eras, event lanes, overview brush | event | filter lanes, one era | `timeline.md` · timeline |
| sankey | flows between stages, widths ∝ value | node / link | change a split, remove a node | `sankey.md` · sankey |
| uncertainty | icon array, simulated draws vs exact, intervals | probability / group | change base rate, rerun with a new seed | `uncertainty.md` · uncertainty |
| decision | questions → tree path → costed options, break-even, tornado | option / branch | "if price doubles", "if used half as much" | `decision.md` · decision |
| map | choropleth, symbols, routes, wind | region | switch measure, a source off, another year | `map.md` · map (+geo-world110m) |
| sim | particles / agents / grid over time + aggregate chart vs exact | time | a mechanism off, a second unit, a different seed | `sim.md` · sim |
| derivation | lines of algebra with highlighted terms + a linked plot | line | parameters; where an approximation breaks | `derivation.md` · derivation |
| machine | isometric figure of a real device whose motion is the concept | mechanism state | a part removed or a rate changed | `machine.md` · machine |

**Combine at most two.** Strong pairs: graph main + sweep or over-time secondary (how a change spreads); timeline main +
bar of counts per era; map main + over-time for the picked region; sim main + over-time aggregate vs the exact curve;
derivation main + sweep of the approximation error; decision main + uncertainty for the risky input.
If you need three main views, the page is two pages.

**Ladder of abstraction** (Bret Victor): for any shape, one step *down* (a single concrete case: one patient, one day,
one record, one request) early in the tour, and one step *up* (the same system across a range: a sweep, small multiples,
a distribution, counts per era) near the end.

**Source-anchored claims** work with every shape: `IE.sources({...})` with exact quotes and page numbers, `cite('id')`
beside every number taken from the source, and `IE.validation` rows that recompute each claim live.

## The machine shape and "anatomy"
The machine shape borrows the approach of wheresryan22/anatomy (MIT): invent a real object whose motion *is* the
concept, build it from many small purposeful parts, drive every moving part and readout from the same pure model, and
keep words out of the drawing (a framed card and a detail card on pick). For the full craft (painter's-order audits,
pipes and cables, WebGL shaders, 3D turning) see that repository; borrow the ideas, not its kit. Never use its
`publish.mjs`: it posts figures to a public gallery.

## Libraries and the offline rule
Pages must work offline: no CDNs, no fetches at view time. Prefer the runtime and the shape modules.
- **Formulas**: MathML, rendered natively (see `references/design.md`).
- **Large graphs** (more than ~25 nodes) or force/compound layouts: inline a vendored, minified copy of a permissively
  licensed library (Cytoscape.js MIT, d3-force ISC) through `<script data-ie-file="vendor/…js">`, licence header kept.
  If no copy is available offline, group nodes until the built-in layout works.
- **Finer map data** (50m countries, a city's districts): vendor a TopoJSON/GeoJSON file through `data-ie-file`; see `map.md`.
- **Mermaid** is fine for a static side figure in notes, not for the main interactive view (it re-renders the whole
  diagram, so selection and live numbers get lost).
- Never add a library for one effect the runtime can do in 20 lines.
