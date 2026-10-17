# Tree (hierarchy, nested totals)

Pick it when the source says **"kinds of…"**, "X is made of A, B and C, each made of…", "where does the money / time /
space go", or gives a breakdown table with subtotals: budgets, disk use, taxonomies, org charts with headcount, cost
centres, a bill of materials. Not when the parts *act on each other* (graph) or happen *in order* (stepper).

Skeleton: `node scripts/build.js new tree page.html` (`assets/skeleton-tree.html`). Modules: `core` + `tree`
(`<style data-ie="tree">` and `<script data-ie="tree">`).

## Model
- model.js holds the data: `TREE` (`{ id, name, title, desc, color?, children? }`; leaves carry every measure, e.g.
  `bytes` and `files`) and `MEASURES` (`{ key: { label, button, column, fmt, fmtNum } }`). Folders are never stored:
  the module totals them bottom-up. Ids: unique, `[A-Za-z0-9_]`, not numbers (they go in the URL as the selection).
- Hiding a node takes it out of every total above it (`eff`), while `sub` keeps "what it would add back". Every share
  re-totals; the detail card of a hidden node says what showing it again would add.
- Two measures (bytes vs files, cost vs headcount) usually tell different stories: offer both as a switch.
- Shares never round a part up to 100% or a non-zero part down to 0% (`fmtShare`: "99.9%", "<0.1%").

## Views (all driven by one selection: a node id, null = the root)
- Collapsible tree (ARIA treeitems): value, share of parent, share of total, a bar in the branch colour; ▸ opens,
  Enter on the selected folder closes it. Selecting opens the node and its path.
- Treemap (SVG, squarified): two levels of the zoom node (the selection if it has parts, else its parent; hidden
  or empty nodes climb up), level-2 boxes under a header strip. Click a box to zoom in; the breadcrumb zooms out.
  Built once per zoom and width; hide/measure changes tween the boxes (220 ms, none with reduced motion).
  A label is drawn only when it fits; otherwise the name is in the tooltip, the tree and the card.
  Parts under 1% become slivers or vanish (honest); the caption counts them and the tree still lists them.
- Top-N leaves (the step up): every leaf ranked wherever it sits; click to jump.
- Detail card: value in every measure, share of parent and total, largest part, what removing it does + a
  "Hide this branch" button. Breadcrumb `nav`, `#selnav` (‹ › walk, top, up one level).
- ← → walk the visible rows of the tree in reading order (so → enters an opened folder), cycling.

## What-ifs and tour
- `whatIf: T.presets([{ key, label, hide: [ids] }])`: each button hides exactly those branches (all other hide flags
  off). The view adds a "Measure" segment (`data-w="m_<key>"`, `data-set="measure=<key>"`) to `#whatif`.
- Inline experiments: `<button data-set="hide_<id>=true">`, `data-set="measure=files"`, `data-set="sel=<id>"`.
- Tour: the whole (total, the biggest branch, what is a sliver) → one branch (zoom) → one concrete leaf (its
  share of parent and of the total, hide it) → hide a branch: everything re-totals (same amount, smaller whole) →
  switch measure: a different story → **step up**: the top-N leaves across the whole tree (`spot` the panel).

## API
```js
const T = IE.tree.model(TREE, { measures: MEASURES, measure: 'bytes' });
const V = IE.tree.view(T, { tree: 'tree', map: 'map', crumbs: 'crumbs', top: 'top', detail: 'detail',
  caption: 'mapCap', selnav: 'selnav', whatif: 'whatif' }, { topN: 5 });
const app = IE.app({ real: T.real, whatIf: T.presets([{ key: 'all', label: 'Everything', hide: [] }, …]),
  sel: { stepBy: V.stepBy, keyHint: 'next / previous row of the tree' }, steps,
  recompute: (P, app) => V.recompute(P, app), render(S){ V.render(S); valid.render(); },
  dyn: S => V.dyn(S), readout: S => V.readout(S) });
```
- Pure (Node: `require('runtime/tree.js')`): `index(tree)` → `ix { root, by, parent, depth, order, leaves, kids(id),
  pathTo(id), branchOf(id), isHidden(id, hidden) }`; `totals(ix, measure, hidden)` → `{ sub, eff }`; `share(a, b)`
  (null when b = 0); `fmtShare(s)`; `topLeaves(ix, eff, n)`; `largestChild(ix, id, eff)`; `zoomOf(ix, sel, eff)`;
  `squarify(items, rect)` → rects with area ∝ v tiling rect; `nestedLayout(ix, zoom, eff, W, H, { head, minW, minH })`.
- `model(tree, spec)` → `T`: `ix, measures, mkeys, real` (measure + `hide_<id>` false for every node but the root),
  `HIDE_KEYS`, `hideKey(id)`, `hidden(P)`, `hideOnly(ids)`, `compute(P)` → `C { hid, by: { m: totals }, M: totals of
  P.measure, all: totals with nothing hidden }`, `presets(list)`, `fmt(m, v)`, `fmtShare`, `share`, `topLeaves(eff, n)`,
  `largestChild`, `zoomOf(sel, eff)`, `relPath(id)`.
- `view(T, hosts, opts)` → `V`: `recompute`, `render`, `dyn` (val_/pct_/par_/pctall_<id>, v_<measure>_<id>,
  root_total, root_total_all, root_<measure>, n_leaves, top_n, top_pct, measure_name, n_hidden), `readout`, `stepBy`,
  `slivers(zoom)`, `C`, `zoom`, `layout` ({ W, H, rects } for validation). opts: `topN`, `height(W)`,
  `color(id)` (default: series slot per top-level branch, or `node.color`), `measureSeg`, `hideLabel`, `duration`.
- Tree open/closed state is view-only (not in the URL); the selection's path is always opened.

## Validation
Conservation, live on the current settings: every folder = Σ of its visible parts; Σ leaves = total in every measure;
hiding takes exactly the hidden branches' full amounts off the total; box areas ∝ amounts (one area-per-unit per level)
and level-1 boxes tile the view. Then the source's numbers: a stated subtotal, a count rule (9 files per 8-way
dataset), a stated share. In Node, also run `squarify` on random inputs (the demo: worst relative error 5e-12).

## Pitfalls
- Hundreds of leaves: keep the tree, but group the long tail into an "other (n items)" node so the treemap stays legible.
- More than 8 top-level branches repeat colours; adjacent boxes are separated by strokes, but group or recolour.
- One box can fill the whole view (a leaf of 99.9%): honest. check.js may then report "mostly empty" for the map,
  because it skips any rect over 90% of the svg as background (a false positive here).
- Don't rebuild the SVG per frame: build per zoom/width, update attributes, place labels when the tween settles.
- A treemap on log values lies about area; use the raw amounts, and switch measure instead.
