# Verify

```bash
node ~/.claude/skills/interactive-explainer/scripts/check.js "<page>.html" "$TEMP/<name>-check" "<probe JS>" [--quick]
```

## What it does
- Refuses an unbuilt page (empty `data-ie` blocks): run `scripts/build.js` first.
- Syntax-checks every inline script with `node --check` (a duplicate `const` silently kills a page).
- Walks every tour step and every `[data-w]` what-if; flags empty or `NaN`/`undefined` live numbers and page errors.
- Clicks every inline `data-set` button in each step's text and every `[data-pick]` element, probing after each.
- Keys: ← / → must move the `data-time` slider; Ctrl + ← / → must change `STEP` by one.
- URL state (runtime pages): after `goStep(k)` the hash must hold `s=k`, and reopening that URL must land on step k.
- Labels: warns on overlapping `svg text` / `.lbl`, fails on labels cut off at their svg edge (desktop and phone).
- Empty space: warns when a canvas or svg view is mostly one blank band (shrink `data-h` or fill the space).
- Accessibility (warnings): controls without names, large svg/canvas views without a text alternative, no
  `prefers-reduced-motion` rule, no `lang`.
- Teaching lint for quizzes and lesson parts (see `teach/TEACHING.md`).
- Full mode only: HiDPI 1.5 (canvas heights must not change after clicks), dark theme + reduced motion (no errors; the
  background must differ from light), phone 390 px (no sideways scroll; tiles of the page).
- Writes `contact.png` (every shot on one sheet: steps, what-ifs, desktop tiles, dark, phone tiles), viewport-sized
  `page-desktop-N.png` / `page-phone-N.png` tiles, `step*.png`, `whatif-*.png`, `theme-dark.png`, and `summary.json`
  (`ok`, errors, warnings, probe values per label, counts, seconds).

## How to use it
- `--quick` while iterating (≈10 s): desktop pass only, no tiles.
- One full run before handing over (≈20–30 s). Read `contact.png`, then only the tiles that need a closer look.
- The probe is any JS expression evaluated after each step, button, what-if and pick, e.g.
  `"({peak: EXT.peak, share: +document.querySelector('[data-dyn=shareA]').textContent.replace('%',''))})"`.
  Compare the printed numbers with the validation targets.
- Look at the screenshots like a critical reader: clutter, overlapping or cut-off labels, a subject on the edge, an
  empty band, unreadable colours in the dark theme. Fix and rerun until clean.

## If Playwright can't launch
`check.js` finds Playwright in the local, npm/nvm-global or `~/.npm/_npx` (MCP) installs and tries installed Edge or
Chrome, then bundled Chromium. If it still fails, verify with the Playwright MCP:
- Serve the folder with `python3 -m http.server <port>` in the background.
- Save screenshots under the cwd's `.playwright-mcp/` (`/tmp` is refused).
- HiDPI: `browser_run_code_unsafe` with `browser.newContext({deviceScaleFactor: 1.5})`; phone: `browser_resize` to 390.
- Afterwards find the server with `ps -eo pid,args | grep "[h]ttp.server"` and kill that PID
  (`pkill -f http.server` matches its own shell and kills it, exit 144).
