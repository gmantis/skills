---
name: interactive-explainer
description: Use when the user wants to understand a mechanism, paper, article, dataset, piece of code, history or decision through a self-contained interactive HTML page, simulation or visualization ("build an interactive explainer/page/simulation", "help me understand this paper with a simulation", "make an explainer from this document", "explain X interactively", "/interactive-explainer"), or wants to learn a topic over several sessions ("teach me …", "make a lesson/course on …", "/teach", or the workspace has MISSION.md or lessons/). For a child's marked schoolwork use study-material-builder instead.
---

# Interactive explainer

Build one offline HTML page that lets the reader *play with* the mechanism in their material and answer "why does X
happen?" and "what if cause Y didn't exist?". Every page is the shared **runtime** (`runtime/`, inlined by
`scripts/build.js`) plus the page's own parts: a pure **model**, a guided **tour**, **what-if** switches and **linked
views** driven by one shared selection. You write only the page's own parts; never retype runtime code.

**Teaching mode.** If the user wants to *learn* the topic over sessions, or the workspace has `MISSION.md` or
`lessons/`, read `teach/TEACHING.md` first; it wraps this workflow.

## 0. Size it, pick the shape, say both in one line
| Tier | Use when | The page has | Budget |
|---|---|---|---|
| **Sketch** | a quick look, a few numbers to compare, "…style", a follow-up to an existing page | answer block, one main view (+1 linked), presets / what-ifs, a 3-step tour at most, sources, a validation of the key numbers | ~5 min · one quick + one full check |
| **Explainer** (default) | a paper, article, chapter, mechanism, dataset, code | answer block, 5–8 step tour, what-ifs, two linked views, live validation table, how the model works, sources | ~10–15 min · ≤ 3 check runs |
| **Lesson** | teaching mode | an Explainer plus the teaching layer in `teach/TEACHING.md` | as Explainer, plus quiz and records |

Tell the user, e.g. "Building an **Explainer**, causal-network shape, about 15 minutes." Ask only if a real ambiguity
changes the whole page (audience, which question matters).

**Pick the shape** from what the source is *shaped like*, then read only that guide in `shapes/`:

| The source mostly says… | Shape | Guide |
|---|---|---|
| X rises and falls over a cycle or years; A + B adds up to the curve | over-time | `shapes/over-time.md` |
| A raises B, which lowers C; feedback loops; what drives X; parts and what each does | graph | `shapes/graph.md` |
| first…, then…; protocols, algorithms, state machines, who sends what; "explain this code" | stepper | `shapes/stepper.md` |
| A vs B vs C, trade-offs | compare | `shapes/compare.md` |
| it depends on k; thresholds, tipping points, dose–response | sweep | `shapes/sweep.md` |
| kinds of…, nested totals, where does X go (as a tree) | tree | `shapes/tree.md` |
| what happens to each record in a graph / ETL job | recordflow | `shapes/recordflow.md` |
| what happened when, eras, dated changes | timeline | `shapes/timeline.md` |
| flows between stages with conserved totals | sankey | `shapes/sankey.md` |
| how likely, 1 in N, base rates, Monte Carlo, spread of outcomes | uncertainty | `shapes/uncertainty.md` |
| should I…? the reader's choice under their numbers | decision | `shapes/decision.md` |
| where: values by region, routes, wind, hotspots | map | `shapes/map.md` |
| particles, agents, grids, diffusion, queues of people over time | sim | `shapes/sim.md` |
| a proof, derivation or approximation | derivation | `shapes/derivation.md` |
| the mechanism is (or maps onto) a physical device | machine | `shapes/machine.md` |

Use at most two shapes: one main view and one linked secondary view. If you need three main views, it is two pages.
`shapes/SHAPES.md` has the combinations, the ladder of abstraction, and the library and offline rules.

## 1. Read the material
- Read the sources fully (`*.pdf, *.md, *.txt, *.docx, *.epub, *.html`, notes, images; `docx-to-markdown`, `epub-to-markdown`).
- Write down for yourself: the **core question** in one sentence; the **validation targets** (numbers, dates, tables
  the model must reproduce, or the source's qualitative claims and ratios); the **causes** (each becomes a what-if);
  the **named cases** (presets and tour steps); and **who the reader is** (memory, notes: place, units, clock) so the
  answer block and a "your numbers" card can be localised.
- Thin source: add standard, well-established knowledge and say so on the page.
- Fetching data (APIs, many web pages, long PDFs to extract) can go to a subagent with `model: "sonnet"` while you
  design the model; give it the exact series and units you need and ask for a compact JSON file.

## 2. Model first, in a file
- Write `model.js` in `$TEMP/<name>/` (never in the user's workspace): pure functions parameterised by every meaningful
  variable, ending with `if (typeof module === 'object' && module.exports) module.exports = {…}`.
- Check it in Node against the validation targets before any UI (`node -e "const m=require('$TEMP/<name>/model.js'); …"`).
  Fix signs, units and offsets now. Decompose the output exactly into per-cause parts where possible.
- Degenerate settings (every cause off, flat series, singular cases) must not crash or report fake extremes.
  Unreachable quantities return `Infinity` and are said in words ("not by dusk").
- Not physics (health, economics, psychology)? Build an illustrative mechanistic model and label it as one: see
  `references/design.md`, "Non-physics models".

## 3. Write the page
- `node ~/.claude/skills/interactive-explainer/scripts/build.js new <shape> "<workspace>/<short-name>.html"` copies the
  shape's skeleton next to the source. Then replace its demo content with Edit, or write the page source once with
  Write; never re-Write the whole file to change a part. Page anatomy and every helper: `runtime/API.md`.
- Point `<script data-ie-file="model.js">` at your model and build:
  `node …/scripts/build.js "<page>.html" --from "$TEMP/<name>"`. Rebuild after every change to model.js.
- Include, in this order: header (title + one-line lede), **answer block** (the answer in one sentence with 1–3 live
  numbers), the **tour** (defines terms concretely, each cause in isolation, then the combination; a concrete case
  first and a step "up" across the range near the end; inline `data-set` experiment buttons), **what-ifs** (one per
  cause plus a segment; dashed ghost curves for each cause alone), **linked views** with plain-language captions,
  the readout, presets for named cases, a **live validation table** (`IE.validation`) that reproduces the source's
  numbers with the source's value beside the model's, "How the model works", and **sources** with exact quotes
  (`IE.sources`, `cite('id')` next to every number taken from the source).
- Design rules for diagrams, labels, canvas, 3D and layout: `references/design.md`. Read the section you need.

## 4. Verify (required before handing over)
```bash
node ~/.claude/skills/interactive-explainer/scripts/check.js "<page>.html" "$TEMP/<name>-check" "<probe JS>" [--quick]
```
- Iterate with `--quick` (desktop only); finish with one full run (HiDPI, phone, dark theme, reduced motion).
- Read `contact.png` first (every shot on one sheet), then only the tiles you need. Fix every error; fix warnings or
  know why each one is wrong. The probe prints model numbers per step: compare them with the validation targets.
- Details of what it tests, and the Playwright MCP fallback: `references/verify.md`. Delete the `$TEMP` folders after.

## 5. Deliver
- The page sits next to the source (short kebab-case name). Open it (`start "" "<path>"`, `open`, `xdg-open`; from WSL
  `cmd.exe /c start "" "C:\…"`). Don't touch unrelated files; mention unfamiliar ones you notice.
- Lessons: add the `NOTES.md` line and ask for quiz results (`teach/TEACHING.md`, "Close the loop").
- Final message: the link, how to use it (tour, what-ifs, click views, keys, shareable URL), the 2–4 key insights in plain
  words with numbers, and what was verified against the source. Keep it short.
- An older page built before the runtime (no `<meta name="generator" content="interactive-explainer runtime…">`) can't
  be refreshed; port it to a skeleton if the user wants the new features.

## Pitfalls that cost the most time
- Retyping the engine or the whole page: build from the skeleton and edit only the parts that change.
- Re-reading skeletons, examples or tall screenshots: read `runtime/API.md`, your shape's guide and `contact.png`.
- Forcing a causal, structural or historical source into a time chart: pick the shape first.
- A step that sets only some parameters: steps apply on top of `real`, so list only what differs, never patch state by hand.
- `innerHTML` re-rendered every frame breaks inline buttons: step HTML renders once; live numbers go in `D('key')`.
- Quoting a number from the source without `cite()`, or a model number without a validation row.
- A duplicate `const` in one script silently kills the whole page; `check.js` runs `node --check` for exactly this.
