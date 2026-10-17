# Record flow (`recordflow`)

Start: `node scripts/build.js new recordflow page.html`. Module: `<script data-ie="recordflow">` + `<style data-ie="recordflow">`.

## When to pick it
The source says "what happens to a record in this graph / ETL job / middleware", "why did this row end up in the
reject file", "where did the NULL come from", "how many records reach the output", or it *is* a graph (.mp), a
transform (.xfr), a pipeline config. The reader follows one record, field by field, through named components.
Not this shape: control flow of one function (stepper / code walkthrough), message order between actors (sequence).

## Model (model.js)
`graph(p)` returns `{ nodes, edges }`; the engine `IE.recordflow.run(graph(p), p)` does the rest. Node kinds:
- source `{ id, name, kind: 'INPUT FILE', file, role: 'source', read: p => rows, key: row => 'P-1001', fn: (row, p) => result }`
- component `{ id, name, kind: 'REFORMAT', fn: (rec, p) => result }`; join `{ inputs: 2, join: ([in0, in1], p) => [joinResult], discard: ['unused1'] }`
- sink `{ role: 'sink', fn?: rec => ({ note }) }`; lookup `{ role: 'lookup', rows: p => [[key, value]], keyName }`
- `rec = { field: { v, t } }`: `v` null is NULL, `t` the DML type shown in the card.
- `result = { after, port: 'out' | 'reject' | 'deselect' | 'unused0' | …, rules: [{ tag, res, st: 'ok'|'null'|'fail'|'skip' }], err, note, keys }`
  (`keys: [{ key, value }]` feeds the lookup card). A join returns one result per output record **and** one per
  unmatched input, each with `use: [i0, i1]` (indexes, `null` = none).
- `edges: [{ from, to, port = 'out', toPort = 0, kind: 'lookup', cut: true }]`: `port` 'out' is the main flow,
  'reject'/'error' a reject flow, anything else deselect-like. `cut: true` draws the flow as disconnected: records
  leaving there are **lost** (in ≠ out + rejects…), unless the node lists the port in `discard` (dropped by design).
- `SRC(node, p) → [{ t, tag }]` for the source panel (a rule's `tag` highlights its line); `INVARIANTS` per hop:
  `{ id, label, hop: (hop, rec) => true | false | null }`; `refParams(p)` = the reference run (for code: the fixed
  version under the same conditions; for a graph: the fixed graph on the same input).
- Test in Node: `const RF = require('<skill>/runtime/recordflow.js'); RF.run(graph(p), p)` (the engine is pure).
- Sample records: one clean record to follow first, then one per edge case (whitespace, NULL, unknown code,
  negative value, no partner in the join, a duplicate key).

## Main view and selection
- `IE.recordflow(host, { onPick, title })`: auto-laid-out SVG. Columns by longest path; a short second input is
  pulled right next to its join; a join sits between its inputs; lookups and deselect/unused outputs in a row above
  (or below, when their component is in the lower half), reject outputs in a row below. Narrow hosts (columns under
  about 120 px) get the same layout top-to-bottom, side boxes in lanes. Counts on every flow, the selected record's
  path and dot in amber, "N lost" / "not connected" in the box when a port is cut.
- Selection = (record, component) as the string `'KEY@NODE'` (`RF.sel`, `RF.parse`), a non-numeric `IE.app` sel with
  `stepBy` (← → walk the hops of the current record) and the hop navigator (`RF.nav`: ◀ ▶ Play ▶| and a `data-time`
  hop slider, so `check.js` tests the keys). Chips, boxes, diff rows and `data-set="sel=P-1003@LK"` buttons all write it.
- Side panels (rebuild only when the selection or settings change): `RF.hopCard` (before / other input / after per
  field, rules with results, error port, the checks), `RF.source`, `RF.chips`, `RF.diffTable`.

## What-if
Change a rule (`p.defaultRule`), the order (`graph(p)` returns another chain: the layout rebuilds), the data
(`read(p)`), or a connection (`cut`). Keep the reference run fixed, so the diff table shows which records change.

## Tour order (5–7 steps)
Follow one clean record end to end → a field changes type/shape → a NULL becomes a reject (the exact error text) →
two inputs meet at the join (a match, an unmatched record, a dropped partner) → every record accounted for
(in = out + rejected + deselected, then cut the reject port) → order matters → the fix, across every record (step up:
the diff table). Each step sets `sel: 'KEY@NODE'` and only the `params` that differ.

## API (all on `IE.recordflow`, `RF` below)
```js
RF.run(graph, p) → RUN { counts: {id: {in,out,pass,rej,desel,drop,lost}}, flows, recs: [{key,src,raw,hops,end,endAt,endPort}], byKey, nodes, edges, order }
RF.balance(RUN) → [{ id, …counts, ok }]       RF.BALANCE  (the "in = out + rejected + deselected" invariant)
RF.analyse(RUN, [RF.BALANCE, ...INVARIANTS]) → { firstBreak: { id: { node, key } | null } }
RF.diff(REF, RUN) → { key: { j: first differing hop | -1, node } }        RF.endText(RUN, rec), RF.endWord(rec)
RF.sel(key, node), RF.parse(sel), RF.path(RUN, key), RF.stepBy(RUN, sel, dir), RF.select(RUN, key, keepNode)
const flow = RF(host, { onPick: node => app.setSel(RF.sel(key, node)), title }); flow.set({ run: RUN, key, node })
RF.hopCard(RUN, key, node, { dp: { amount: 2 }, srcText: (node, tag) => code, rawLine: rec => text, invariants, analysis }) → html
RF.chips(host, RUN, { selected, diff, onPick: key => … })     RF.source(host, SRC(node, p), { tag: st })
RF.diffTable(host, REF, RUN, DIFF, { selected, refLabel, detail: (rec, run) => text, onPick: key => … })
const nav = RF.nav(host, { step: dir => moved, go: k => …, atEnd: () => bool }); nav.update(k, n, label); nav.stop()
RF.layout(RUN, width, { vertical }) → { W, H, vert, nodes: {id: {x,y,w,h}}, flows: {key: {d, badge, end}} }
```
Page pattern (see the skeleton): `recompute(P)` runs RUN, REF, the analysis and the diff; `render({ sel })` calls
`flow.set`, `nav.update`, and rebuilds the side panels only when `sel` or the settings changed.

## Validation ideas
Conservation at every component for the current settings (a live ✗ when a reject port is cut is the lesson);
every input record ends exactly once; exact field values for named records (250.00 × 1.08 = 270.00); the exact
error text from the notes; counts the source states (lookups done, records written). For Ab Initio semantics (rule
priorities, NULL into a non-nullable field, reject/unused port behaviour) use only what the DAIS notes or product
docs say, cite them, and label the rest illustrative on the page.

## Pitfalls
- A reject port carries the record **as it entered** the component; the engine does this for 'reject'/'error'.
- `RF.diff` compares fields order-independently; still give every component the same output field set per branch.
- A join input used by several outputs (one customer, two payments) is followed into the first; its card says so.
- Main flows are not rerouted around boxes (side flows are). A main flow that skips columns can cross a box in another
  row; check the screenshots and reorder `nodes` or group components if it does. Keep graphs to about 14 boxes.
- Box names are fitted (font steps, then "…"); the full name is in the box's `<title>` and `aria-label`.
