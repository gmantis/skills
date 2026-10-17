# Timeline shape (`IE.timeline`)

"What happened when, in which era, and what changed because of it." Start from `assets/skeleton-timeline.html`
(`node scripts/build.js new timeline page.html`): a fictional platform's 39 dated changes in 4 lanes and 4 eras.

## Pick it when the source says…
- "In 2014 we…, then in 2017…", a change log, release history, account/SR history, a patient's or project's history.
- The interesting part is *order and grouping*: eras, what came before what, bursts and quiet years, cause → effect.
- Not when the source is about a quantity rising and falling (that is the over-time shape), or about steps of a
  procedure (stepper). A history with a few numbers per year can add a line chart as the linked secondary view.

## Model (model.js: data, no DOM)
- `LANES` `[{ id, label, color: 's1'… }]`: kinds of change (3–6). Order them by importance; give incidents a warm slot.
- `ERAS` `[{ id, label, short, start, end }]`: the source's own periods, contiguous. `end` names the last included
  period: `end: '2013'` runs to the end of 2013, `'2013-06'` to the end of June.
- `EVENTS` `[{ id, date, end?, lane, title, short, text, source, ledTo?: [id] }]`, in the source's order.
  `date` is `YYYY`, `YYYY-MM` or `YYYY-MM-DD` and is printed at that precision. `end` makes a span (a bar).
  `short` (≤ 22 chars) is the label on the timeline; `title` and `text` go to the card. `ledTo` only when the source
  says so ("after the outage we decided…"), never inferred from dates.
- `SOURCE_COUNTS` (the source's own summary table, per era × lane) and any stated gaps ("two months later").
- An event belongs to the era its *start* falls in. A span must end inside its era; split it if the source's span
  really crosses an era boundary.

## Main view and linked views
- `IE.timeline(host, spec)`: era bands on top (click = jump to the era's first event), time axis, one lane per kind,
  dots and bars, labels packed into up to `maxRows` rows per lane (right of the dot, else left, else hidden: the dot
  stays, the card shows it), "led to" arrows from the picked event, a selected-date cursor whose label names the
  event when its own label is hidden, a span band for picked spans, and an overview strip with a brush (drag the
  window, its edges, or draw a new range; click picks the nearest event; double-click shows everything).
- `IE.timeline.counts(host, spec)`: stacked bars of events per era by lane, the picked event's era highlighted.
- `IE.timeline.card(data, i, { hiddenLabel })` → HTML for `#detail`: date, lane, era, title, text, citation, and
  "followed from / led to" jump buttons (`data-set="sel=<i>"`).
- Density view (`density: true`): per-lane columns of counts per year (per quarter below 3 years): the step up.

## Selection
Numeric `sel` = event index in date order (slider `data-time`, play walks the events), plus `stepBy` so ← → skip
events hidden by the lane/era filters. The slider can sit on a hidden event: show `IE.timeline.step(D, sel, 0, VIS)`
(the nearest visible one) everywhere. See the skeleton's `shown()`.

## What-ifs
Lane toggles (`toggles` with `value: true`, "Show incidents"), "show only one era" (a `whatIf` segment setting
`era`; the view zooms to the era), and the density view toggle. Steps reset them, so a step can hide lanes to make
a point ("incidents come before the jumps") and the next step restores them.

## Tour (4–7 steps)
whole history with one concrete event selected → one era at a time (2–3 eras that matter) → the pivotal event with
its "led to" arrows and jump buttons → a filtered view that shows the pattern → the step up (density, busiest year).

## Module API
```js
const D = IE.timeline.prepare(HISTORY);   // { lanes, eras, events (sorted, e.i, e.t, e.t1, e.era, e.next, e.prev), byId, domain }
const tl = IE.timeline(host, { data: D, title, summary, hidden: ['soft'], only: 'e2' | null, density: false, selected: i,
  maxRows: 3, rowH: 20, overview: true, densityStep: 'auto' | 1 | 0.25, minSpan: 0.25,
  onPick: i => app.setSel(i), onEra: id => …, onView: ([t0, t1]) => … });
tl.set({ selected: k });         // cheap: cursor, highlight, arrows; pans the window only when the pick changed
tl.set({ hidden, only, density }); // rebuild; a new `only` zooms to that era (or back to everything)
tl.view; tl.reset(); tl.labelHidden(i); tl.stats() // { hiddenLabels, offscreen, view }
const cnt = IE.timeline.counts(host, { data: D, hidden, only, highlight: eraId, onPick: eraId => … }); cnt.set({ highlight });
```
Pure helpers (also in Node: `const TL = require('<skill>/runtime/timeline.js')`):
`parse(date)` → `{ t, prec }`, `endOf(date)`, `fmtT(t, 'y'|'m'|'d')`, `fmtWhen(e)`, `prepare(model)`,
`audit(model)` → `{ ok, sortedInput, firstUnsorted, unknownLane, noEra, badSpan, crossEra, badLink, eraOverlap, eraGap, dupId }`,
`count(D, 'era'|'lane'|'year'|fn, filter)`, `matrix(D, filter)` → `{ era: { lane: n, total } }`,
`visible({ hidden, only })` → predicate, `step(D, i, dir, pred)` (dir 0 = nearest visible).

## Validation ideas (the skeleton's table does all of these)
- Counts per era × lane from the event list = the source's summary table (one row per era), and the total.
- `audit`: the source lists events in date order; every event has a known lane and an era; spans end after they
  start and inside their era; eras are contiguous; every "led to" points forward in time.
- Stated gaps: "the decision came two months after the outage" = `(t2 − t1) × 12`, rounded as the source rounds.
- Busiest year / quietest era if the source names them.

## Pitfalls
- Year-only dates sit at 1 January. If the source says "mid-2014", write `2014-07`, not `2014`.
- Era labels for the what-if segment: print the era's last year as `fmtT(r.t1 - 1e-6, 'y')`; `r.t1` itself is the
  first instant of the next year.
- Many events in one lane on a phone: most labels hide (by design). Keep `short` short, and make sure the card and
  the cursor label carry the meaning; do not raise `maxRows` past 3–4 or the lanes get tall and sparse.
- Answer-block stats should not follow the era filter ("busiest year" of the whole history), or they change
  meaning when the reader filters; filtered numbers belong in the step text and the readout.
- `ledTo` arrows are drawn only between events visible at the current zoom; the card always lists them.
- The brush has no keyboard of its own (← → belong to the selection); keyboard users zoom with the era segment,
  and the window follows the selected event.
