# Sankey shape (`IE.sankey`)

"Where does it go": flows between stages with conserved totals. Start from `assets/skeleton-sankey.html`
(`node scripts/build.js new sankey page.html`): 10,000 records from three sources through validation,
deduplication and approval, measured in records or megabytes.

## Pick it when the source says…
- "Of the 10,000 records, 500 are rejected and 950 are duplicates", budgets ("where the money goes"), energy
  balances, funnels (visitors → sign-ups → buyers), time spent, people through a process.
- The totals are conserved: every unit that enters ends in an output or a loss. If the numbers do not add up in
  the source, find out why (a missing loss, double counting) before drawing anything.
- Not for nested categories without flow (hierarchy), or one record's field changes (record flow).

## Model (model.js, pure)
- `NODES` `[{ id, label, short?, kind?: 'loss', color?, note?, source? }]`. Sources and stages need no kind;
  losses (rejects, waste, drop-outs) get `kind: 'loss'` and sit just after the stage that loses them.
- Either `links` `[{ source, target, value }]` (totals per link), or **`paths`** `[{ nodes: [id, …], value }]` (one
  route with its amount; links are derived). Both take `values: { records, mb }` instead of `value` for a
  measure switch.
- Use **paths** whenever a split depends on where the units came from (web records fail validation at 8%, files at
  2%). With links only, tracing ("where do web records end up", "who supplies the rejects") assumes every stage mixes
  its inflow and splits it in the same ratios; the skeleton's demo gives 5% / 50% that way instead of the true
  8% / 80%. Write `flows(params) → { nodes, paths }` with one `add()` per route per source.

## Main view and linked views
- Columns by longest path, sinks justified to the right, losses one column after their source and pushed to the
  bottom of their column; barycentre sweeps order each column; link ends sorted at each node (fewer crossings).
- Labels right of each node: name, then "value · share of total"; truncated to the gap; one line or hidden (the
  card still shows it) when a column is crowded. A right gutter holds the last column's labels.
- Pick or hover a node or band: the part of *every* flow that passes through it is drawn on top (exact with
  paths), in the source's colour when one source owns it, neutral otherwise, losses red.
- "Follow units" (`particles`): dots travel along routes chosen by the amounts (restricted to the pick's routes).
  Off under `prefers-reduced-motion`.
- Linked: `IE.sankey.card` (detail), a bar chart of where the pick's units end up (`follow().fate`), and the
  step-up table of every source × end (`fates()`), rows pickable.
- Under `minWidth` (560) the diagram scrolls sideways inside the panel instead of shrinking its text.

## Selection
`sel: { stepBy: (dir, a) => a.setSel(IE.sankey.step(sk.G, a.sel, dir)) }`: keys `'n:<id>'`, `'l:<from>><to>'` or
null; ← → cycle nodes by column, top to bottom. Add a `<select>` of `IE.sankey.order(G)` in `#controls`. A pick that
a what-if removes is dropped by the view; check `IE.sankey.follow(G, sel)` before using it.

## What-ifs
- Split ratios as `params` sliders (the model recomputes the flows).
- Remove a stage: `IE.sankey.removeNode(model, id, { mode: 'reroute' | 'drop', label })`. Reroute: its inflow goes
  on to its normal outputs in their ratios and its losses stop. Drop: its inflow ends in a new loss `dropped:<id>`.
- Switch the measure (`measure: 'mb'`): the same flows can tell a different story by volume or cost.

## Tour
one source followed (concrete) → the whole flow → the biggest or most surprising loss, with an "exaggerate / halve
it" button → a stage removed → the step up: every source at once, or the other measure.

## Module API
```js
const G = IE.sankey.graph({ nodes, paths | links }, { measure: 'records', total, align: 'justify' | 'left' });
  // G.nodes: in, out, loss, value, col, role ('source'|'stage'|'sink'|'loss'), color; G.links: key, value, s, t, loss; G.by, G.total
const sk = IE.sankey(host, { nodes, paths | links, measure, fmt: v => text, unit: 'records', title, summary, height,
  minWidth: 560, nodeW: 12, gap: 16, selected: 'n:validate', particles: true, onPick: key => app.setSel(key) });
sk.set({ selected });   // cheap: highlight + dots; any other key rebuilds
sk.G; sk.follow(key);
```
Pure helpers (also in Node: `const SK = require('<skill>/runtime/sankey.js')`):
`balance(G)` → `{ rows, totalIn, delivered, lost, maxDiff, ok }`; `follow(G, key)` → `{ amount, up, down (Map link →
amount), nodes, fate, origin, exact }`; `fates(G)` → `{ sources, ends, m[source][end] }`; `removeNode(model, id, o)`;
`order(G)`, `step(G, key, dir)`; `layout(G, { width, height, … })`; `card(G, key, { fmt, unit })` → HTML.

## Validation ideas (the skeleton's table does all of these)
- Every number in the source: total in, each loss, each output, per measure.
- Conservation at every stage for every measure, live for the current settings (`balance(G).ok`).
- Every source's fates sum to 100%; a link's origin shares match the source ("400 of the 500 rejects are web").
- A what-if with a hand-computed answer ("without deduplication 9,500 × (0.8 + 0.2 × 0.8) = 9,120 are loaded").

## Pitfalls
- Proportional-mixing tracing on composition-dependent splits silently gives wrong fates: use paths (above).
- `removeNode` on paths assumes what follows the removed stage does not depend on origin; on links it keeps every
  downstream stage's split ratios. If the source says otherwise, compute the what-if in the model.
- Tiny flows get a minimum width (2 px nodes, 0.6 px bands): they are drawn larger than their value; say so if it
  matters, or group them ("other").
- More than about 6 columns or 25 nodes gets unreadable: group stages, or split the page.
- Core's `svg.ie-chart{width:100%}` would shrink the diagram on phones; the module overrides it to scroll instead.
