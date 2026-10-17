---
name: interactive-explainer
description: Turn the documents and notes in the workspace (PDF, markdown, papers, articles, existing pages) into a self-contained interactive HTML explainer with a guided step-by-step tour, what-if toggles that switch each cause off, and linked views shaped to the idea: charts over time, causal-loop networks, clickable structure diagrams, state machines and algorithm steppers, comparisons, parameter sweeps, hierarchies, and 3D views when geometry matters. Works for physics and for non-physics topics (health, biology, economics) via an illustrative, self-validating model, localised to the reader. Also runs a multi-session **teaching mode** (merged from Matt Pocock's teach skill): mission, curated resources, glossary, learning records, and one combined lesson page per topic with challenges, spaced-review quiz and primary source. Use when the user wants to understand a complicated mechanism or asks to "build an interactive page/simulation/visualization to explain this", "make an explainer from this document", "help me understand this article with a simulation", or "/interactive-explainer"; and when the user wants to learn a topic over time: "teach me …", "make a lesson/course on …", "/teach", or the workspace has MISSION.md or lessons/.
---

# Interactive explainer

Build one offline HTML page that lets the user *play with* the mechanism described in their material, and answer questions like "why does X happen?" and "what if cause Y didn't exist?".

Reference implementations, all in this skill's folder:
- `examples/analemma.html`: what-if switches, ghost curves for each cause, presets, and a table that reproduces the paper's data.
- `examples/sun-explained-3d.html`: a 7-step guided 3D tour.
- `examples/health-inflammation-2d.html`: a non-physics (biology/health) explainer from a book chapter. It has an illustrative compartment model, a 2D body diagram with screen-space labels, a dose J-curve, a localised "your numbers" card, an on-page validation table, and a glossary and quiz. Open them when you need a pattern; don't copy their content.
- `assets/skeleton-graph.html`: a causal network (signed arrows, a balancing loop, exact per-cause shares, click-to-inspect, a "how the change spreads" replay). It is the starting point for the network and structure shapes in `shapes/SHAPES.md`.
- `assets/skeleton-stepper.html`: a stepper over a simulated trace (lanes per actor, message contents and actor state at every step, rules checked per step, a reference run to diff against, and an optional source panel that highlights the lines that run). It is the starting point for the sequence, state-machine, algorithm and **code walkthrough** shapes.
- `assets/skeleton-sweep.html` (parameter sweep + small multiples), `assets/skeleton-compare.html` (options × criteria with weights and exact sensitivity), `assets/skeleton-tree.html` (collapsible tree + zoomable treemap) and `assets/skeleton-recordflow.html` (records through a pipeline of components, fields before/after each hop, rejects): one template per remaining shape in `shapes/SHAPES.md`.

**Teaching mode.** If the user wants to *learn* the topic over sessions (see the description), or the workspace has `MISSION.md` or `lessons/`, read `teach/TEACHING.md` first. It adds the mission interview, `RESOURCES.md`/`GLOSSARY.md`/learning records, the lesson section order (challenges, reference, glossary, spaced-review quiz, primary source, ask-your-teacher) and the feedback loop. Use `assets/quiz.js` for quizzes.

## Workflow

### 1. Read the material first
- Find sources in the workspace: `*.pdf, *.md, *.txt, *.docx, *.epub, *.html`, notes and images. Read them fully. Use the `Read` tool for PDFs and the conversion skills (`docx-to-markdown`, `epub-to-markdown`) when needed.
- Write down, for yourself:
  - **The core question** in one sentence (e.g. "why does sunrise shift 30 min at the equator?").
  - **Validation targets**: concrete numbers, dates and tables in the source that the model must reproduce.
  - **Causal structure**: the observed quantity = combination of which independent causes? Each cause becomes a what-if toggle.
  - **Named cases** the source discusses. These become presets and tour steps.
- **Know the reader.** If memory, notes or the conversation tell you who the reader is (where they live, skin type, schedule, kids), localise. Add a "your numbers" card computed live from the model, and write the take-aways with the reader's clock times and units. Example: minutes to reach a dose at 08:30 vs 13:00 in Singapore, by skin type and cloud.
- If the source is thin, add standard, well-established physics, maths or domain knowledge and say so on the page. If a real ambiguity changes the whole page (audience, which question matters), ask once; otherwise decide and go.

### 1b. Pick the explanation shape
Don't default to "a quantity over time". Decide what the source is *shaped* like, and say so in one line to yourself:
- **Over time**: a quantity rising and falling over a cycle, as a sum of causes → `assets/skeleton.html`.
- **Causal network**: "A raises B, which lowers C", feedback loops, "what drives X" → `assets/skeleton-graph.html`.
- **Structure**: parts and what each does (anatomy, architecture) → a labelled diagram or the graph skeleton without weights.
- **State machine / stepper**: ordered steps, rules, algorithms, life cycles, protocols → `assets/skeleton-stepper.html`, or the graph skeleton with states as nodes.
- **Sequence**: who sends what to whom, in order → `assets/skeleton-stepper.html` (lanes with messages).
- **Code walkthrough**: "explain this function / transform / script", especially code with state that survives between calls → `assets/skeleton-stepper.html` with `SOURCE` set; the trace is the code's logic re-implemented as a pure simulator over a realistic run of inputs.
- **Comparison**: options vs criteria, trade-offs → `assets/skeleton-compare.html`.
- **Parameter sweep**: "it depends on k", thresholds, dose–response → `assets/skeleton-sweep.html`.
- **Hierarchy**: kinds and sub-kinds, nested totals, "where does X go" → `assets/skeleton-tree.html`.
- **Record flow**: what happens to each record in a graph, ETL job or request pipeline → `assets/skeleton-recordflow.html`.

Then **read `shapes/SHAPES.md`** for that shape's model, main view, selection state, what-if meaning and tour order. Use at most two shapes: one main view and one linked secondary view. Offer one concrete case (a step down the ladder of abstraction) early in the tour, and one sweep across the range (a step up) near the end.

### 2. Build and validate the model before any UI
- Write the model as **pure functions** (no DOM) that are parameterised by every physically meaningful variable (latitude, tilt, eccentricity, rate, …).
- Where possible, **decompose the output exactly** into per-cause parts (A + B = total). Ghost curves and "split" arcs come from this.
- Prototype in Node (`node -e` or a scratch file in `$TEMP`, never in the user's workspace) and check against the validation targets. Fix sign conventions, units and offsets now. For example, a clock/time-zone offset shifted every time but not the dates.
- Degenerate settings (every cause off, flat series, polar/singular cases) must not crash or report fake extremes. Detect "flat" and show a message instead.
- Quantities that can be **unreachable** (a dose never reached before dusk, a threshold never crossed) return `Infinity`. Show them in plain words ("not by dusk"), not "> 4 h". Don't quote an unreachable case in take-aways; pick a reachable time.

#### When the source is not physics (health, biology, economics, psychology)
There is usually no exact equation, so build an **illustrative mechanistic model** and label it as one on the page ("illustrative, not fitted to data").
- Use a small compartment/ODE model stepped hourly. Chronic level, acute pulses per cause, adaptive responses such as tolerance and repair capacity, and damage that slips through. Hormesis ("a short stress that trains an anti-inflammatory response") is a natural pattern: an acute pulse → slow adaptive gain → a lower chronic level. Too large a pulse → the harm term wins (a J-curve).
- **Warm up** to steady state (for example 150 simulated days, cached by the parameters that change it), so day 1 isn't a transient.
- Split the acute term per cause (`Ae`, `As`, `Aa`, …), so what-ifs and diagrams can show each one.
- The validation targets become the source's **qualitative claims and ratios**: "A plus B beats either alone", "a burn reverses the benefit", "type IV needs about 3× the dose of type II". Put them in an on-page **validation table**: each claim, the model's number, and ✓/✗, computed live. The probe in step 5 should read it.
- Add an evidence table: claim, study or source, strength. Separate what the source shows from what the model assumes.

### 3. Design the page
Start from the skeleton for your shape (step 1b). `assets/skeleton-graph.html` has the same engine contract (steps, `data-w`, `data-dyn`, `data-set`, `setupCanvas`), plus an SVG diagram layer that is built once per size and updated per frame, layered auto-layout with routed long arrows and feedback arrows, `focus` dimming per step, a detail card, and `data-pick` on every clickable box and arrow. `assets/skeleton.html` already contains the steps engine, what-if segment, `data-dyn` live numbers, `Cam`, depth-split `poly`, clamped labels, a per-pixel `renderSphere`, `chartFrame` with click-to-pick, and the animation loop. Replace every `REPLACE`.

If the page is a *lesson*, make it **one combined page**, not separate pages, in the section order of `teach/TEACHING.md`: header + mission link → simulator (tour + what-ifs + charts) → challenges → evidence → reference/take-aways → glossary → quiz → primary source → ask-your-teacher → validation and "How the model works". Reuse the workspace's `assets/` (CSS, `quiz.js`, model JS) and add new reusable parts there.

Include:
1. **Guided tour (5–8 steps)**. Build it up in order: define terms concretely ("declination = the latitude where the Sun is overhead"), give the mechanism of each cause **in isolation** (the step sets the other cause off via `params`), then the combination. Every step sets its full `params` and `layers`, so moving back and forth is consistent. Put live numbers in the text with `D('key')`. Add inline `<button data-set="k=v">` for "exaggerate this" experiments.
2. **What-if toggles**: one per cause plus a "Real / only A / only B / neither" segment. Dim sliders that a toggle overrides. When both causes are on, draw each cause alone as faint dashed "ghost" curves.
3. **Linked views**, all driven by one shared selection state. That state is the time for the over-time shape, the selected box or arrow for networks and structure, the step index for steppers, and the parameter value for sweeps. Have a main visual (3D if the mechanism is spatial, otherwise a 2D diagram or the shape's view) and one or two secondary views with a cursor or highlight. Clicking any view sets the selection, and every other view follows. Add a play/animate button whenever the state can advance.
4. **Live readout and explanation** that update with the settings, e.g. "A dominates" / "B dominates" / "balanced".
5. **Presets** for the named cases in the source, and a reproduction of any table in the source with the source's values shown in grey next to the model's.
6. **Plain-language captions** on every panel, saying what to look at.
7. **Keyboard shortcuts**: <kbd>←</kbd> / <kbd>→</kbd> move the shared selection one natural unit and pause playback. That unit is a day, an hour or a cohort for the over-time shape, one notch of the parameter for a sweep, and one trace step `K` for a stepper. <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>←</kbd> / <kbd>→</kbd> go to the previous or next topic (tour step). Copy the skeleton's `onKey` and keep its guards: it ignores typing fields and Alt (browser back on Windows), and a focused slider keeps its own plain-arrow behaviour. Mark the slider that holds the selection `data-time` so `check.js` can test the keys, and show the keys hint (`.keys`) under the step text. Clamp in `stepTime` when the axis isn't cyclic (cohorts, a parameter range).

### 3b. 2D diagram and chart rules
- **Canvas sizing: always use the skeleton's `setupCanvas`.** It keeps the logical height in `data-h`. Never read the height back from `cv.height` or `getAttribute('height')` after setting the backing store to `H * dpr`. On a HiDPI screen (Windows at 125–150%) every redraw multiplies the height, and the chart grows with each click until the page is unusable. To resize a canvas at runtime, set `cv.dataset.h`.
- **Diagrams with labels** (body, machine, cell): draw the figure in its own coordinates under `translate` + `scale(sc)`, where `sc = min(fit height, fit width minus the label columns, max)`. Draw the **labels in screen space** at a fixed readable size (11–12 px bold name, 10.5 px detail) in left and right label columns, word-wrapped to the column width, with thin leader lines to the site. Then **de-overlap each column**: sort by y and push each block below the previous block's bottom. Set `data-h` from the scale, so a narrow phone doesn't leave a tall empty canvas. Keep long names short ("Heart", not "Heart & vessels").
- **HUD and gauges** go in reserved bands (a top-left readout, bottom bars), not over the figure.
- **End-of-line labels** on charts: sort by y and push them at least 12 px apart.
- **Annotations** go in empty regions (under a plateau, below a rising line), with a leader line to the point. Never put them on top of the data. Check that labels near an axis are not clipped.
- **No emoji on canvases.** They render as empty boxes in headless browsers and on some fonts. Use words ("exercise", "allergen"); `☀` is fine. Emoji in HTML text is fine.
- Put wide tables in a scroll wrapper and give number cells `white-space: nowrap`.
- **SVG diagrams** (graph skeleton, lanes, trees): build the elements once per size and only update attributes per frame, so CSS animations and click handlers survive. Set the viewBox to the real pixel width so 12 px text stays 12 px. Switch to a top-to-bottom layout when boxes would get narrower than about 90 px. Give every clickable element `data-pick` and every text label class `lbl`; `check.js` clicks the first and lints the second for overlaps and clipping.
- **Formulas**: use MathML (`<math>`) with a plain-words line beside it. Library rules are at the end of `shapes/SHAPES.md`.

### 4. 3D rules (only when geometry is the point)
- Draw with canvas 2D and the skeleton's `Cam` projection. No three.js or CDNs; the page must work offline.
- Draw back halves faded: `lines('back')` → opaque object (`renderSphere`) → `lines('front')`. Subdivide straight lines (`seg`/`curve`) so they split correctly at the depth threshold.
- Let the camera **follow the subject** (`azAdd`) by default, so the thing being explained stays in front and not on the limb. Dragging adjusts the offset.
- Labels: use `txt` (clamped inside the canvas). Put labels on the side away from the subject, skip marker labels near the subject, and stack related labels at one anchor. Exaggerate sizes ("not to scale") and say so. If you stretch a chart for visibility, say so in its caption.

### 5. Verify (required before handing over)
```bash
node ~/.claude/skills/interactive-explainer/scripts/check.js "<page.html>" "$TEMP/<name>-check" "<probe JS expression>"
```
- The script:
  - syntax-checks the inline script;
  - walks every step and every `[data-w]` what-if;
  - flags empty or `NaN`/`undefined` `data-dyn` fields and page errors;
  - presses <kbd>←</kbd>/<kbd>→</kbd> (the `data-time` slider must move) and <kbd>Ctrl</kbd>+<kbd>←</kbd>/<kbd>→</kbd> (`STEP` must change by one), and fails if they don't. Pages without a `data-time` slider or `.keys` hint (older pages) only get a warning;
  - re-runs at **devicePixelRatio 1.5**, clicking every non-drag canvas, and fails if any canvas height changes;
  - re-runs at **390 px phone width** and fails on horizontal page scroll;
  - clicks every inline `data-set` button in each step's text and probes after each;
  - clicks every `[data-pick]` element (boxes, arrows, tree nodes, rows) and probes after each, re-running `goStep(0)` when a target vanished (zoomable views) and warning if it is still gone;
  - warns on overlapping labels (`svg text`, `.lbl`) and fails on labels cut off at their svg edge, at desktop and phone widths;
  - saves screenshots (`step*.png`, `whatif-*.png`, `hidpi-after-clicks.png`, `phone.png`);
  - prints **teaching-lint warnings**: quiz options with unequal word counts, a right answer that stands out by length, answers bunched in one position. For pages in `lessons/`, also a missing primary source, ask reminder, glossary, quiz, or fewer than 3 citation links. Fix them for lessons.
- It finds Playwright in the local, npm/nvm-global or `~/.npm/_npx` (MCP) installs. It tries the installed Edge or Chrome, then bundled Chromium, so it also works from WSL/Linux.
- If it still can't launch, verify with the Playwright MCP instead:
  - Serve the folder with `python3 -m http.server <port>` (run it in the background).
  - Save screenshots under the cwd's `.playwright-mcp/`; `/tmp` is refused.
  - Use `browser_run_code_unsafe` with `browser.newContext({deviceScaleFactor: 1.5})` for the HiDPI test, and `browser_resize` to 390 for the phone test.
  - Afterwards, find the server with `ps -eo pid,args | grep "[h]ttp.server"` and kill that PID. `pkill -f http.server` matches its own shell and kills it (exit 144).
- Use the probe to print model numbers per step, and compare them with the validation targets.
- **Look at the screenshots** (Read the PNGs): check for clutter, overlapping or cut-off labels, and views where the subject sits on the edge. Fix and rerun until clean.
- Delete the `$TEMP` check folder afterwards.

### 6. Deliver
- Save the page in the workspace next to the source (a short kebab-case name `.html`). Don't touch unrelated files, and mention any unfamiliar ones you notice.
- Open it: `start "" "<path>"` (Windows), `open` (macOS) or `xdg-open` (Linux). From WSL use `cmd.exe /c start "" "C:\...\page.html"` with the Windows path.
- If the page is a lesson in a teaching workspace, add a one-line entry to its `NOTES.md`, and ask the user to paste their quiz results back. They become learning records (see `teach/TEACHING.md`, "Close the loop").
- Final message: the link to the file, how to use it (steps, toggles, drag, click charts), the 2–4 key insights in plain words with numbers, and what was verified against the source. Keep it short.

## Pitfalls seen before
- A duplicate `const` in one script silently kills the whole page. `check.js` runs `node --check` for exactly this.
- Browsers restore checkbox state on reload, so call the UI sync function at init.
- `innerHTML` re-rendered every frame breaks inline buttons. Render step HTML once per step and update only the `[data-dyn]` spans.
- Using the absolute clock time for comparisons can hide offsets (time zones, reference meridians). Model them as an explicit parameter.
- Equal-scale plots can make the key shape invisible (the thin analemma). Stretch it and say so.
- Hand-rolled `fit()` helpers that read `getAttribute('height')` make canvases grow on every redraw on HiDPI screens. Use `setupCanvas`/`data-h` (see 3b). Headless tests at dpr 1 don't show it; `check.js` now tests at 1.5.
- Emoji drawn with `fillText` show as boxes in the verification screenshots, so use words.
- Labels drawn in scaled figure coordinates become unreadable on small canvases. Draw them in screen space.
- A global arrow-key handler that doesn't check the focused element hijacks slider adjustment and Ctrl+← word jumps in text fields. Copy the skeleton's `onKey` guards rather than writing a bare `keydown` listener.
- Forcing a causal or structural source into a time chart hides the point. Pick the shape first (step 1b).
- At phone width the column `.layout` keeps `align-items:flex-start`, so `main` can grow to its max-content width when it holds a wide `nowrap` table. Add `align-items: stretch` to `.layout` in the 1000 px media query if `check.js` reports sideways scroll with no named element.
- `.dyn` live numbers are `nowrap`. For values that are sentences (a winner's name, a sensitivity line) use a wrapping variant (the compare skeleton's `DW()` / `.dyn.wrap`), or they run out of the tour card.
- In layered diagrams, an arrow that skips a layer runs through the box between, and its badge hides under that box. The graph skeleton inserts waypoints in skipped layers; keep that if you replace the layout. The phone layout showed this; the desktop layout hid it.
