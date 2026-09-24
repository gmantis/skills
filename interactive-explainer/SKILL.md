---
name: interactive-explainer
description: Turn the documents and notes in the workspace (PDF, markdown, papers, articles, existing pages) into a self-contained interactive HTML explainer with a guided step-by-step tour, what-if toggles that switch each cause off, linked charts, and 3D views when geometry matters. Use when the user wants to understand a complicated mechanism or asks to "build an interactive page/simulation/visualization to explain this", "make an explainer from this document", "help me understand this article with a simulation", or "/interactive-explainer".
---

# Interactive explainer

Build one offline HTML page that lets the user *play with* the mechanism described in their material, and answer questions like "why does X happen?" and "what if cause Y didn't exist?".

Reference implementation: `examples/analemma.html` (what-if switches, ghost curves for each cause, presets, a table that reproduces the paper's data) and `examples/sun-explained-3d.html` (7-step guided 3D tour). Both are in this skill's folder. Open them when you need a pattern; don't copy their content.

## Workflow

### 1. Read the material first
- Find sources in the workspace: `*.pdf, *.md, *.txt, *.docx, *.epub, *.html`, notes and images. Read them fully. Use the `Read` tool for PDFs and the conversion skills (`docx-to-markdown`, `epub-to-markdown`) when needed.
- Write down, for yourself:
  - **The core question** in one sentence (e.g. "why does sunrise shift 30 min at the equator?").
  - **Validation targets**: concrete numbers, dates and tables in the source that the model must reproduce.
  - **Causal structure**: the observed quantity = combination of which independent causes? Each cause becomes a what-if toggle.
  - **Named cases** the source discusses. These become presets and tour steps.
- If the source is thin, add standard, well-established physics, maths or domain knowledge and say so on the page. If a real ambiguity changes the whole page (audience, which question matters), ask once; otherwise decide and go.

### 2. Build and validate the model before any UI
- Write the model as **pure functions** (no DOM) that are parameterised by every physically meaningful variable (latitude, tilt, eccentricity, rate, …).
- Where possible, **decompose the output exactly** into per-cause parts (A + B = total). Ghost curves and "split" arcs come from this.
- Prototype in Node (`node -e` or a scratch file in `$TEMP`, never in the user's workspace) and check against the validation targets. Fix sign conventions, units and offsets now. For example, a clock/time-zone offset shifted every time but not the dates.
- Degenerate settings (every cause off, flat series, polar/singular cases) must not crash or report fake extremes. Detect "flat" and show a message instead.

### 3. Design the page
Start from `assets/skeleton.html`. It already contains the steps engine, what-if segment, `data-dyn` live numbers, `Cam`, depth-split `poly`, clamped labels, a per-pixel `renderSphere`, `chartFrame` with click-to-pick, and the animation loop. Replace every `REPLACE`.

Include:
1. **Guided tour (5–8 steps)**. Build it up in order: define terms concretely ("declination = the latitude where the Sun is overhead"), give the mechanism of each cause **in isolation** (the step sets the other cause off via `params`), then the combination. Every step sets its full `params` and `layers`, so moving back and forth is consistent. Put live numbers in the text with `D('key')`. Add inline `<button data-set="k=v">` for "exaggerate this" experiments.
2. **What-if toggles**: one per cause plus a "Real / only A / only B / neither" segment. Dim sliders that a toggle overrides. When both causes are on, draw each cause alone as faint dashed "ghost" curves.
3. **Linked views**, all driven by one time/day state: a main visual (3D if the mechanism is spatial, otherwise a 2D diagram), charts over the cycle with a cursor, and a combined plot. Clicking or dragging any chart sets the time. Add a play/animate button.
4. **Live readout and explanation** that update with the settings, e.g. "A dominates" / "B dominates" / "balanced".
5. **Presets** for the named cases in the source, and a reproduction of any table in the source with the source's values shown in grey next to the model's.
6. **Plain-language captions** on every panel, saying what to look at.

### 4. 3D rules (only when geometry is the point)
- Draw with canvas 2D and the skeleton's `Cam` projection. No three.js or CDNs; the page must work offline.
- Draw back halves faded: `lines('back')` → opaque object (`renderSphere`) → `lines('front')`. Subdivide straight lines (`seg`/`curve`) so they split correctly at the depth threshold.
- Let the camera **follow the subject** (`azAdd`) by default, so the thing being explained stays in front and not on the limb. Dragging adjusts the offset.
- Labels: use `txt` (clamped inside the canvas). Put labels on the side away from the subject, skip marker labels near the subject, and stack related labels at one anchor. Exaggerate sizes ("not to scale") and say so. If you stretch a chart for visibility, say so in its caption.

### 5. Verify (required before handing over)
```bash
node ~/.claude/skills/interactive-explainer/scripts/check.js "<page.html>" "$TEMP/<name>-check" "<probe JS expression>"
```
- The script syntax-checks the inline script, walks every step and every `[data-w]` what-if, flags empty `data-dyn` fields and page errors, and saves screenshots. It finds a globally installed Playwright and uses the installed Edge or Chrome (`channel: 'msedge'`), so no browser download is needed.
- Use the probe to print model numbers per step, and compare them with the validation targets.
- **Look at the screenshots** (Read the PNGs): check for clutter, overlapping or cut-off labels, and views where the subject sits on the edge. Fix and rerun until clean.
- Delete the `$TEMP` check folder afterwards.

### 6. Deliver
- Save the page in the workspace next to the source (a short kebab-case name `.html`). Don't touch unrelated files, and mention any unfamiliar ones you notice.
- Open it: `start "" "<path>"` (Windows), `open` (macOS) or `xdg-open` (Linux).
- Final message: the link to the file, how to use it (steps, toggles, drag, click charts), the 2–4 key insights in plain words with numbers, and what was verified against the source. Keep it short.

## Pitfalls seen before
- A duplicate `const` in one script silently kills the whole page. `check.js` runs `node --check` for exactly this.
- Browsers restore checkbox state on reload, so call the UI sync function at init.
- `innerHTML` re-rendered every frame breaks inline buttons. Render step HTML once per step and update only the `[data-dyn]` spans.
- Using the absolute clock time for comparisons can hide offsets (time zones, reference meridians). Model them as an explicit parameter.
- Equal-scale plots can make the key shape invisible (the thin analemma). Stretch it and say so.
