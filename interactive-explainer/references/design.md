# Design rules

Read the section you need. The runtime already handles theme, layout, sizing on HiDPI screens, keys, URL state,
reduced motion and print; these rules are about what you draw.

## Contents
- Page and prose
- Charts (SVG first)
- 2D diagrams with labels
- Canvas
- 3D (only when geometry is the point)
- Non-physics models (health, biology, economics, psychology)
- Layout pitfalls seen before

## Page and prose
- **Answer first.** The `.answer` block states the answer in one sentence with 1–3 live numbers (`data-dyn`), in the
  reader's units, clock and place. The tour then earns it.
- Keep the lede to two sentences. Captions under every panel say what to look at, not what the panel is.
- Every number from the source carries `cite('id')`; every model number that claims to match the source has a row in
  the validation table. Separate what the source shows from what the model assumes (badge `illustrative`).
- Live numbers in prose: `D('key')` (no wrap); sentences that change (a winner, a sensitivity line): `DW('key')`.
- Long reference material (tables, derivations, glossary) goes in `.wide` sections, collapsed with `<details>` when the
  phone page would be more than ~8 screens tall (`check.js` warns).
- Formulas: MathML (`<math>`) with a plain-words line beside it. Single-letter `<mi>` renders as an empty box in some
  headless Chromium builds; use `mathvariant="normal"` and CSS `font-style: italic`.
- No emoji on canvases (they render as boxes in headless browsers); emoji in HTML text is fine.

## Charts (SVG first)
- Use `IE.lineChart` / `IE.barChart` / `IE.table` unless the view needs thousands of marks or per-pixel work. SVG text
  follows the theme, is read by screen readers, and `check.js` lints it for overlaps and clipping; canvas text is not.
- Colours by role, from the theme: the main quantity `total` (ink), causes `s1`, `s2`, `s3` in that order (validated
  for colour-blind readers; at most three when every pair can touch, e.g. scatter or map), sequential `seq1`–`seq5`.
  Never hard-code hex in a page; it breaks the dark theme.
- End-of-line labels instead of a legend; dashed ghost curves get the automatic legend.
- Annotations go in empty regions with a leader to the point, never on the data. Name thresholds on the chart.
- Equal-scale plots can hide the key shape (a thin loop). Stretch it and say so in the caption.
- Past a limit where the outcome is unbounded, shade the region and say so; never plot or quote a number there.
- Small multiples need columns of at least ~300 px: `grid-template-columns: repeat(auto-fill, minmax(min(300px, 100%), 1fr))`.

## 2D diagrams with labels (body, machine, cell, architecture)
- Draw the figure in its own coordinates under a scale `sc = min(fit height, fit width minus label columns, max)`.
- Draw labels in screen space at a readable size (12 px name, 11 px detail) in left and right label columns,
  word-wrapped, with thin leader lines to the site. De-overlap each column: sort by y and push each block below the
  previous one. Size the view from the scale so a phone doesn't get a tall empty view. Keep names short.
- HUD and gauges go in reserved bands (a top-left readout, bottom bars), not over the figure.
- SVG diagrams: build elements once per size, update attributes per frame, so CSS transitions and handlers survive.
  Set the viewBox to the real pixel width so 12 px text stays 12 px. Switch to top-to-bottom when boxes would get
  narrower than ~90 px. Give every clickable element `data-pick` and every label class `lbl`.
- In layered diagrams an arrow that skips a layer runs through the box between; route it through waypoints.

## Canvas
- Always `IE.setupCanvas(cv)`; it keeps the logical height in `data-h`. Never read the height back from `cv.height`
  or `getAttribute('height')` after scaling by the device pixel ratio: on a 125–150% Windows screen every redraw
  multiplies the height. To resize at runtime, set `cv.dataset.h`.
- Colours via `IE.color('s1')` at draw time (follows the theme). Labels with `IE.txt` (clamped inside the canvas) and
  `IE.placeLabel` (avoids other labels and the data).
- Give the canvas an `aria-label` (setupCanvas uses the panel's `<h3>` when there is none) and put the key numbers in
  the readout or a table, since canvas content is invisible to screen readers.

## 3D (only when geometry is the point)
- Canvas 2D with `IE.v3.Cam` (`<script data-ie="3d">`); no three.js or CDNs.
- Draw back halves faded: `poly(…, 'back')` → opaque object (`renderSphere`) → `poly(…, 'front')`. Subdivide straight
  lines (`seg`/`curve`) so they split correctly at the depth threshold.
- The camera follows the subject (`azAdd`) so the thing being explained stays in front; dragging adjusts the offset.
- Labels with `label3`, on the side away from the subject; exaggerate sizes ("not to scale") and say so.

## Non-physics models (health, biology, economics, psychology)
There is usually no exact equation, so build an illustrative mechanistic model and label it as one on the page
("illustrative, not fitted to data").
- A small compartment/ODE model stepped hourly or daily: chronic level, acute pulses per cause, adaptive responses
  (tolerance, repair), damage that slips through. Hormesis is a natural pattern: an acute pulse → slow adaptive gain →
  lower chronic level; too large a pulse → the harm term wins (a J-curve).
- Warm up to steady state (e.g. 150 simulated days, cached by the parameters that change it) so day 1 isn't a transient.
- Split the acute term per cause so what-ifs and diagrams can show each one.
- Validation targets are the source's qualitative claims and ratios ("A plus B beats either alone", "type IV needs
  about 3× the dose of type II"): one validation row each, computed live.
- Add an evidence table: claim, study, strength.
- Weights for a causal network from a non-numeric source: small round numbers (0.3, 0.6, 0.9), labelled illustrative.

## Layout pitfalls seen before
- Browsers restore checkbox state on reload; the runtime syncs the UI at start, so keep state in `P`, not in the DOM.
- Using absolute clock time for comparisons hides offsets (time zones, reference meridians); model them as parameters.
- A wide `nowrap` table inside `main` can widen the page on a phone; keep tables in `.tablewrap` (IE.table does).
- `.dyn` numbers don't wrap: use `DW()` for sentences.
- A global arrow-key handler hijacks sliders and text fields; the runtime's handler has the guards, so don't add your own.
