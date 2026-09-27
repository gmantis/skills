---
name: interactive-explainer
description: Turn the documents and notes in the workspace (PDF, markdown, papers, articles, existing pages) into a self-contained interactive HTML explainer with a guided step-by-step tour, what-if toggles that switch each cause off, linked charts, and 3D views when geometry matters. Works for physics and for non-physics topics (health, biology, economics) via an illustrative, self-validating model, localised to the reader. Also runs a multi-session **teaching mode** (merged from Matt Pocock's teach skill): mission, curated resources, glossary, learning records, and one combined lesson page per topic with challenges, spaced-review quiz and primary source. Use when the user wants to understand a complicated mechanism or asks to "build an interactive page/simulation/visualization to explain this", "make an explainer from this document", "help me understand this article with a simulation", or "/interactive-explainer"; and when the user wants to learn a topic over time: "teach me …", "make a lesson/course on …", "/teach", or the workspace has MISSION.md or lessons/.
---

# Interactive explainer

Build one offline HTML page that lets the user *play with* the mechanism described in their material, and answer questions like "why does X happen?" and "what if cause Y didn't exist?".

Reference implementations, all in this skill's folder:
- `examples/analemma.html`: what-if switches, ghost curves for each cause, presets, and a table that reproduces the paper's data.
- `examples/sun-explained-3d.html`: a 7-step guided 3D tour.
- `examples/health-inflammation-2d.html`: a non-physics (biology/health) explainer from a book chapter. It has an illustrative compartment model, a 2D body diagram with screen-space labels, a dose J-curve, a localised "your numbers" card, an on-page validation table, and a glossary and quiz. Open them when you need a pattern; don't copy their content.

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
Start from `assets/skeleton.html`. It already contains the steps engine, what-if segment, `data-dyn` live numbers, `Cam`, depth-split `poly`, clamped labels, a per-pixel `renderSphere`, `chartFrame` with click-to-pick, and the animation loop. Replace every `REPLACE`.

If the page is a *lesson*, make it **one combined page**, not separate pages, in the section order of `teach/TEACHING.md`: header + mission link → simulator (tour + what-ifs + charts) → challenges → evidence → reference/take-aways → glossary → quiz → primary source → ask-your-teacher → validation and "How the model works". Reuse the workspace's `assets/` (CSS, `quiz.js`, model JS) and add new reusable parts there.

Include:
1. **Guided tour (5–8 steps)**. Build it up in order: define terms concretely ("declination = the latitude where the Sun is overhead"), give the mechanism of each cause **in isolation** (the step sets the other cause off via `params`), then the combination. Every step sets its full `params` and `layers`, so moving back and forth is consistent. Put live numbers in the text with `D('key')`. Add inline `<button data-set="k=v">` for "exaggerate this" experiments.
2. **What-if toggles**: one per cause plus a "Real / only A / only B / neither" segment. Dim sliders that a toggle overrides. When both causes are on, draw each cause alone as faint dashed "ghost" curves.
3. **Linked views**, all driven by one time/day state: a main visual (3D if the mechanism is spatial, otherwise a 2D diagram), charts over the cycle with a cursor, and a combined plot. Clicking or dragging any chart sets the time. Add a play/animate button.
4. **Live readout and explanation** that update with the settings, e.g. "A dominates" / "B dominates" / "balanced".
5. **Presets** for the named cases in the source, and a reproduction of any table in the source with the source's values shown in grey next to the model's.
6. **Plain-language captions** on every panel, saying what to look at.

### 3b. 2D diagram and chart rules
- **Canvas sizing: always use the skeleton's `setupCanvas`.** It keeps the logical height in `data-h`. Never read the height back from `cv.height` or `getAttribute('height')` after setting the backing store to `H * dpr`. On a HiDPI screen (Windows at 125–150%) every redraw multiplies the height, and the chart grows with each click until the page is unusable. To resize a canvas at runtime, set `cv.dataset.h`.
- **Diagrams with labels** (body, machine, cell): draw the figure in its own coordinates under `translate` + `scale(sc)`, where `sc = min(fit height, fit width minus the label columns, max)`. Draw the **labels in screen space** at a fixed readable size (11–12 px bold name, 10.5 px detail) in left and right label columns, word-wrapped to the column width, with thin leader lines to the site. Then **de-overlap each column**: sort by y and push each block below the previous block's bottom. Set `data-h` from the scale, so a narrow phone doesn't leave a tall empty canvas. Keep long names short ("Heart", not "Heart & vessels").
- **HUD and gauges** go in reserved bands (a top-left readout, bottom bars), not over the figure.
- **End-of-line labels** on charts: sort by y and push them at least 12 px apart.
- **Annotations** go in empty regions (under a plateau, below a rising line), with a leader line to the point. Never put them on top of the data. Check that labels near an axis are not clipped.
- **No emoji on canvases.** They render as empty boxes in headless browsers and on some fonts. Use words ("exercise", "allergen"); `☀` is fine. Emoji in HTML text is fine.
- Put wide tables in a scroll wrapper and give number cells `white-space: nowrap`.

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
  - re-runs at **devicePixelRatio 1.5**, clicking every non-drag canvas, and fails if any canvas height changes;
  - re-runs at **390 px phone width** and fails on horizontal page scroll;
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
