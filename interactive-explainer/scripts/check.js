// Headless render check for an interactive explainer page.
// Usage: node check.js <page.html> <outDir> [probeExpr] [--quick]
//   --quick: desktop pass only (steps, what-ifs, keys, picks, labels); skips HiDPI, phone, theme and the page tiles.
//            Use it while iterating; run the full check once before handing over.
// Output: summary.json (errors, warnings, probes, screenshots), contact.png (one sheet of every shot; read this
// first), viewport-sized tiles page-desktop-N.png / page-phone-N.png, and step/what-if shots.
//   probeExpr: optional JS expression evaluated in the page after each step/scenario; its JSON result is printed
//              (e.g. "({eot: LAST.eot, peak: YEAR_MAX})"). Use it to confirm the numbers match the source document.
// It syntax-checks the inline <script>, loads the page, walks every STEPS entry (via goStep) and every
// [data-w] what-if button, takes screenshots, and fails loudly on page errors.
// It also re-runs the page at devicePixelRatio 1.5 (canvases must not grow on redraw) and at phone width 390 px
// (no horizontal page scroll).
// It presses ← / → (time must move: the slider marked data-time) and Ctrl + ← / → (STEP must change).
// Diagram shapes: it clicks every [data-pick] element (probing after each), warns on overlapping labels (svg text, .lbl)
// and fails on labels cut off at their svg edge, at desktop and phone width.
// Teaching lint (warnings, not failures): quiz options must have equal word counts, the right answer must not be
// the stand-out longest, answer positions must vary; pages under lessons/ need a primary source, an
// "ask your teacher" reminder, a glossary, a quiz and some external citations.
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process'), { pathToFileURL } = require('url');

function playwrightCandidates(){   // every Playwright we can require: local, npm/nvm global, and the npx cache (WSL/Linux MCP installs)
  const tries = ['playwright', 'playwright-core'];
  const home = process.env.HOME || process.env.USERPROFILE || '', appdata = process.env.APPDATA || '';
  const bases = [path.join(appdata, 'npm/node_modules'), path.join(path.dirname(process.execPath), '../lib/node_modules'), '/usr/local/lib/node_modules', '/usr/lib/node_modules'];
  for (const base of bases) tries.push(path.join(base, '@playwright/cli/node_modules/playwright'), path.join(base, 'playwright'), path.join(base, '@playwright/test/node_modules/playwright'), path.join(base, '@playwright/mcp/node_modules/playwright'));
  const npx = path.join(home, '.npm/_npx');
  try { fs.readdirSync(npx).map(d => path.join(npx, d, 'node_modules/playwright')).filter(p => fs.existsSync(p))
    .sort((x, y) => fs.statSync(y).mtimeMs - fs.statSync(x).mtimeMs).forEach(p => tries.push(p)); } catch (_) {}
  const out = [];
  for (const t of tries){ try { const m = require(t); if (m && m.chromium && !out.includes(m)) out.push(m); } catch (_) {} }
  return out;
}

(async () => {
  const argv = process.argv.slice(2), QUICK = argv.includes('--quick'), positional = argv.filter(a => !a.startsWith('--'));
  const [file, outDir = 'explainer-check', probe] = positional;
  if (!file){ console.error('usage: node check.js <page.html> <outDir> [probeExpr] [--quick]'); process.exit(2); }
  const abs = path.resolve(file); if (!fs.existsSync(abs)){ console.error('no such page: ' + abs); process.exit(2); }
  fs.mkdirSync(outDir, { recursive: true });
  const t0 = Date.now(), shots = [], probes = [];
  const shot = async (pg, name, opts = {}) => { const f = path.join(outDir, name); await pg.screenshot({ path: f, ...opts }); shots.push(name); return f; };
  // viewport-sized tiles down the page: a full-page phone shot is ~20 000 px tall and unreadable once scaled down
  const tiles = async (pg, prefix, max = 8) => {
    const H = await pg.evaluate(() => document.documentElement.scrollHeight), vh = pg.viewportSize().height, n = Math.min(max, Math.ceil(H / vh));
    for (let i = 0; i < n; i++){ await pg.evaluate(y => window.scrollTo(0, y), i * vh); await pg.waitForTimeout(120); await shot(pg, `${prefix}-${i + 1}.png`); }
    await pg.evaluate(() => window.scrollTo(0, 0));
    return { n, of: Math.ceil(H / vh) };
  };

  // 1) syntax check of inline scripts (catches duplicate const etc. before the browser silently fails)
  const html = fs.readFileSync(abs, 'utf8');
  const unbuilt = [...html.matchAll(/<(script|style)\b[^>]*\bdata-ie(?:-file)?="([^"]+)"[^>]*>(\s*)<\/\1>/g)].map(m => m[2]);
  if (unbuilt.length){ console.error(`UNBUILT: empty runtime block(s) ${unbuilt.join(', ')}. Run: node ~/.claude/skills/interactive-explainer/scripts/build.js "${file}"`); process.exit(1); }
  const scripts = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  scripts.forEach((s, i) => {
    const tmp = path.join(outDir, `inline-${i}.js`); fs.writeFileSync(tmp, s);
    try { execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' }); }
    catch (e) { console.error(`SYNTAX ERROR in inline script ${i}:\n` + e.stderr.toString()); process.exit(1); }
  });

  // 2) render in a real browser
  const pws = playwrightCandidates();
  if (!pws.length){ console.error('Playwright not found. Install with: npm i -g playwright  (no browser download needed if Edge/Chrome is installed)'); process.exit(1); }
  let browser;
  outer: for (const { chromium } of pws) for (const opt of [{ channel: 'msedge' }, { channel: 'chrome' }, {}]){ try { browser = await chromium.launch(opt); break outer; } catch (_) {} }
  if (!browser){ console.error(`Could not launch Edge, Chrome or bundled Chromium with ${pws.length} Playwright install(s). Try: npx playwright install chromium`); process.exit(1); }
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, colorScheme: 'light' });
  const errors = [], warnings = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const url = pathToFileURL(abs).href;
  await page.goto(url);
  await page.waitForTimeout(700);
  const doProbe = async label => {
    const empty = await page.evaluate(() => [...document.querySelectorAll('[data-dyn]')].filter(e => !e.textContent.trim() || /NaN|undefined/.test(e.textContent)).map(e => e.dataset.dyn + '=' + JSON.stringify(e.textContent.trim())));
    if (empty.length) errors.push(`${label}: empty or NaN dynamic fields ${empty.join(', ')}`);
    if (probe){ try { const v = await page.evaluate(probe); probes.push({ label, value: v }); console.log(label, JSON.stringify(v)); } catch (e) { errors.push(`${label}: probe failed: ${e.message}`); } }
  };
  // teaching lint: quiz fairness and lesson parts (see teach/TEACHING.md)
  const lint = await page.evaluate(() => {
    const W = s => s.trim().split(/\s+/).length, qs = [];
    if (window.Quiz && Array.isArray(Quiz.all)) Quiz.all.forEach(z => z.questions.forEach(q => qs.push({ opts: q.options, answer: q.answer })));
    else document.querySelectorAll('.quiz .q, [id*="quiz" i] .q').forEach(q => qs.push({ opts: [...q.querySelectorAll('button')].map(b => b.textContent), answer: null }));
    const text = document.body.innerText, has = (sel, re) => !!document.querySelector(sel) || re.test(text);
    return { qs, parts: {
      'primary source (#primary-source)': has('#primary-source', /primary source/i),
      'ask-your-teacher reminder (#ask-teacher)': has('#ask-teacher', /\bask (me|your teacher|claude|follow-?up)|follow-?up questions/i),
      'glossary (#glossary)': has('#glossary', /\bglossary\b/i),
      'quiz (#quiz)': qs.length > 0 },
      citations: new Set([...document.querySelectorAll('a[href^="http"]')].map(a => a.href)).size };
  });
  lint.qs.forEach((q, i) => {
    const ws = q.opts.map(o => o.trim().split(/\s+/).length), cs = q.opts.map(o => o.trim().length);
    if (Math.max(...ws) !== Math.min(...ws)) warnings.push(`quiz Q${i + 1}: option word counts ${ws.join('/')} (make them equal)`);
    if (q.answer != null && cs[q.answer] === Math.max(...cs) && cs.filter(c => c === cs[q.answer]).length === 1 && cs[q.answer] > 1.15 * Math.min(...cs))
      warnings.push(`quiz Q${i + 1}: the right answer is the longest option by ${cs[q.answer] - Math.min(...cs)} chars (a length clue)`);
  });
  const pos = lint.qs.map(q => q.answer).filter(a => a != null);
  if (pos.length >= 4){ const top = Math.max(...pos.map(a => pos.filter(b => b === a).length)); if (top / pos.length > 0.5) warnings.push(`quiz: ${top} of ${pos.length} right answers share one position (vary it)`); }
  const isLesson = /[\\/]lessons[\\/]\d{4}-[^\\/]*\.html$/i.test(abs) || await page.evaluate(() => !!document.querySelector('[data-lesson]'));
  if (isLesson){
    Object.entries(lint.parts).forEach(([k, ok]) => { if (!ok) warnings.push(`lesson: no ${k}`); });
    if (lint.citations < 3) warnings.push(`lesson: only ${lint.citations} external citation link(s); link sources for claims`);
  }
  let desk = { n: 0, of: 0 };
  if (!QUICK) desk = await tiles(page, 'page-desktop');
  const nSteps = await page.evaluate(() => (typeof STEPS !== 'undefined' && typeof goStep === 'function') ? STEPS.length : 0);
  let nSetButtons = 0;
  for (let s = 0; s < nSteps; s++){
    await page.evaluate(k => goStep(k), s); await page.waitForTimeout(250);
    await doProbe(`step ${s + 1}`);
    await shot(page, `step${s + 1}.png`);
    // inline "try this" buttons in the step text: click each (they change params or move the selection), then restore the step
    const nb = await page.evaluate(() => document.querySelectorAll('#stepText button[data-set]').length);
    for (let b = 0; b < nb; b++){
      const label = await page.evaluate(i => { const el = document.querySelectorAll('#stepText button[data-set]')[i]; if (!el) return null; el.click(); return el.dataset.set; }, b);
      if (label == null) continue;
      nSetButtons++; await page.waitForTimeout(120); await doProbe(`step ${s + 1} button ${label}`);
      await page.evaluate(k => goStep(k), s); await page.waitForTimeout(120);
    }
  }
  const whats = await page.$$eval('[data-w]', bs => bs.map(b => b.dataset.w));
  for (const w of whats){
    await page.click(`[data-w="${w}"]`); await page.waitForTimeout(250);
    await doProbe(`what-if ${w}`);
    await shot(page, `whatif-${w}.png`);
  }
  // keyboard: ← / → must move time (the slider marked data-time changes), Ctrl + ← / → must change topic (STEP)
  const kb = await page.evaluate(() => ({ time: !!document.querySelector('input[data-time]'), hint: !!document.querySelector('.keys'),
    steps: typeof STEPS !== 'undefined' && typeof goStep === 'function' && typeof STEP !== 'undefined' }));
  if (!kb.time && !kb.hint) warnings.push('keyboard: page has no ← → / Ctrl+← → shortcuts (no data-time slider or .keys hint); add them from the skeleton onKey function');
  else {
    await page.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); if (typeof goStep === 'function') goStep(0); });
    await page.waitForTimeout(200);
    if (kb.time){
      const tv = () => page.$eval('input[data-time]', e => e.value), v0 = await tv();
      await page.keyboard.press('ArrowRight'); await page.waitForTimeout(150); let moved = (await tv()) !== v0;
      if (!moved){ await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(150); moved = (await tv()) !== v0; }   // may sit at a clamped end
      if (!moved) errors.push('keyboard: ← / → did not move time (input[data-time] unchanged); wire onKey/stepTime as in the skeleton');
    } else {   // non-numeric selection (node, option, event): ← / → must change APP.sel through sel.stepBy
      const sb = await page.evaluate(() => !!(window.APP && APP.cfg.sel && APP.cfg.sel.stepBy));
      if (sb){ const s0 = await page.evaluate(() => JSON.stringify(APP.sel));
        await page.keyboard.press('ArrowRight'); await page.waitForTimeout(150);
        if (await page.evaluate(() => JSON.stringify(APP.sel)) === s0){ await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(150);
          if (await page.evaluate(() => JSON.stringify(APP.sel)) === s0) errors.push('keyboard: ← / → did not move the selection (sel.stepBy)'); } }
      else warnings.push('keyboard: no time slider marked data-time and no sel.stepBy, so ← / → is untested');
    }
    if (kb.steps && nSteps > 1){
      const s0 = await page.evaluate(() => STEP);
      await page.keyboard.press('Control+ArrowRight'); await page.waitForTimeout(200); const s1 = await page.evaluate(() => STEP);
      await page.keyboard.press('Control+ArrowLeft'); await page.waitForTimeout(200); const s2 = await page.evaluate(() => STEP);
      if (s1 !== s0 + 1 || s2 !== s0) errors.push(`keyboard: Ctrl+→ / Ctrl+← should change topic ${s0}→${s0 + 1}→${s0}, got ${s0}→${s1}→${s2}`);
    }
  }
  // diagram shapes: click every [data-pick] target (boxes, arrows, tree nodes, table rows) and probe after each
  await page.evaluate(() => typeof goStep === 'function' && goStep(0)); await page.waitForTimeout(250);
  const picks = [...new Set(await page.$$eval('[data-pick]', es => es.map(e => e.dataset.pick)))];   // one click per id
  // a pick can disappear when an earlier click zooms or re-renders the view: reset the tour and retry, warn if still gone
  const clickPick = k => page.evaluate(k => { const el = [...document.querySelectorAll('[data-pick]')].find(e => e.dataset.pick === k);
    if (!el) return false; el.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true; }, k);
  const missing = [];
  for (const pk of picks){
    if (!await clickPick(pk)){
      await page.evaluate(() => typeof goStep === 'function' && goStep(0)); await page.waitForTimeout(150);
      if (!await clickPick(pk)){ missing.push(pk); continue; }
    }
    await page.waitForTimeout(120);
    await doProbe(`pick ${pk}`);
  }
  if (missing.length) warnings.push(`${missing.length} [data-pick] target(s) vanished before they could be clicked (even after goStep(0)): ${missing.slice(0, 8).join(', ')}`);
  if (picks.length && !QUICK) await shot(page, 'after-picks.png');
  // diagram lint: SVG/HTML labels (svg text, .lbl) must not overlap each other or stick out of their svg
  const lintLabels = async (pg, tag) => {
    const r = await pg.evaluate(() => {
      const els = [...document.querySelectorAll('svg text, .lbl')].filter(e => e.textContent.trim() && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden' && !e.closest('.dim'));
      const box = e => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, s: e.textContent.trim().slice(0, 24) }; };
      const bs = els.map(box), overlaps = [], clipped = [];
      for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++){ const a = bs[i], c = bs[j];
        const ox = Math.min(a.r, c.r) - Math.max(a.l, c.l), oy = Math.min(a.b, c.b) - Math.max(a.t, c.t);
        if (ox > 2 && oy > 2) overlaps.push(`"${a.s}" × "${c.s}"`); }
      els.forEach((e, i) => { const sv = e.ownerSVGElement; if (!sv) return; const s = sv.getBoundingClientRect(), b = bs[i];
        if (b.l < s.left - 1 || b.r > s.right + 1 || b.t < s.top - 1 || b.b > s.bottom + 1) clipped.push(`"${b.s}"`); });
      return { overlaps, clipped, n: els.length };
    });
    if (r.overlaps.length) warnings.push(`${tag}: ${r.overlaps.length} overlapping label pair(s): ${r.overlaps.slice(0, 8).join(', ')}`);
    if (r.clipped.length) errors.push(`${tag}: label(s) cut off at the svg edge: ${r.clipped.slice(0, 8).join(', ')}`);
  };
  await lintLabels(page, 'desktop labels');

  // empty-area lint: a panel whose canvas/svg is mostly blank band wastes the reader's screen (and hides a sizing bug)
  const lintEmpty = async (pg, tag) => {
    const r = await pg.evaluate(() => {
      const out = [], name = e => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '');
      const vis = e => { const b = e.getBoundingClientRect(); return b.width > 150 && b.height > 160 && getComputedStyle(e).visibility !== 'hidden' && !e.closest('[hidden]'); };
      const biggestGap = (H, covered) => { covered.sort((a, b) => a[0] - b[0]); let y = 0, gap = 0;
        for (const [a, b] of covered){ if (a > y) gap = Math.max(gap, a - y); y = Math.max(y, b); } return Math.max(gap, H - y); };
      document.querySelectorAll('canvas').forEach(cv => { if (!vis(cv)) return;
        let ctx; try { ctx = cv.getContext('2d'); } catch (_) { return; } if (!ctx) return;
        let d; try { d = ctx.getImageData(0, 0, cv.width, cv.height).data; } catch (_) { return; }
        const W = cv.width, H = cv.height, s = H / cv.getBoundingClientRect().height, x0 = Math.floor(W * 0.04), x1 = Math.ceil(W * 0.96);
        let run = 0, best = 0;
        for (let y = 0; y < H; y++){ const lo = [255, 255, 255, 255], hi = [0, 0, 0, 0];
          for (let x = x0; x < x1; x += 3){ const q = (y * W + x) * 4; for (let c = 0; c < 4; c++){ const v = d[q + c]; if (v < lo[c]) lo[c] = v; if (v > hi[c]) hi[c] = v; } }
          const uniform = hi.every((h, c) => h - lo[c] <= 6); run = uniform ? run + 1 : 0; if (run > best) best = run; }
        const gap = best / s, Hc = H / s; if (gap > 0.4 * Hc && gap > 120) out.push(`${name(cv)}: ${Math.round(gap)} of ${Math.round(Hc)} px is one blank band`); });
      document.querySelectorAll('main svg, .panel svg').forEach(sv => { if (!vis(sv) || sv.parentElement.closest('svg')) return;
        const S = sv.getBoundingClientRect(), cov = [];
        sv.querySelectorAll('path, line, polyline, polygon, circle, ellipse, rect, text, image, foreignObject, use').forEach(e => {
          const b = e.getBoundingClientRect(); if (!b.width && !b.height) return;
          if (e.tagName === 'rect' && !e.closest('[data-pick]') && b.width > 0.9 * S.width && b.height > 0.9 * S.height) return;   // background (a pickable box that fills the view is content)
          const a = Math.min(S.height, Math.max(0, b.top - S.top)), c = Math.min(S.height, Math.max(0, b.bottom - S.top)); if (c > a) cov.push([a, c]); });
        const gap = biggestGap(S.height, cov); if (gap > 0.4 * S.height && gap > 120) out.push(`${name(sv)}: ${Math.round(gap)} of ${Math.round(S.height)} px is empty`); });
      return out;
    });
    if (r.length) warnings.push(`${tag}: mostly-empty view(s), shrink data-h or fill the space: ${r.slice(0, 6).join('; ')}`);
  };
  await lintEmpty(page, 'empty space');

  // accessibility lint (warnings): names on controls, text alternatives on views, reduced motion
  const a11y = await page.evaluate(() => {
    const w = [], named = e => !!(e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || e.getAttribute('title') || e.textContent.trim() ||
      (e.id && document.querySelector(`label[for="${e.id}"]`)) || e.closest('label'));
    if (!document.documentElement.lang) w.push('<html> has no lang attribute');
    const un = [...document.querySelectorAll('button, input:not([type=hidden]), select')].filter(e => e.getClientRects().length && !named(e));
    if (un.length) w.push(`${un.length} control(s) without an accessible name (text, aria-label, title or <label>): ${un.slice(0, 5).map(e => e.outerHTML.slice(0, 60)).join(' | ')}`);
    const big = e => { const b = e.getBoundingClientRect(); return b.width > 200 && b.height > 120; };
    const svgs = [...document.querySelectorAll('svg')].filter(e => big(e) && !e.parentElement.closest('svg') && !(e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || e.querySelector(':scope > title') || e.getAttribute('aria-hidden') === 'true'));
    if (svgs.length) w.push(`${svgs.length} large svg view(s) without role="img" + aria-label or <title>`);
    const cvs = [...document.querySelectorAll('canvas')].filter(e => big(e) && !(e.getAttribute('aria-label') || e.textContent.trim()));
    if (cvs.length) w.push(`${cvs.length} canvas view(s) without aria-label or fallback text`);
    const css = [...document.querySelectorAll('style')].map(s => s.textContent).join('\n');
    if (!/prefers-reduced-motion/.test(css)) w.push('no prefers-reduced-motion rule (use the runtime core.css)');
    return w;
  });
  a11y.forEach(m => warnings.push('a11y: ' + m));

  // shareable state: runtime pages keep the step (and settings) in location.hash, so a link reopens the same view
  const rt = await page.evaluate(() => !!(window.IE && IE.current));
  if (rt && nSteps > 1){
    const k = Math.min(2, nSteps - 1);
    await page.evaluate(k => goStep(k), k); await page.waitForTimeout(450);
    const hash = await page.evaluate(() => location.hash);
    if (!/(^#|&)s=/.test(hash)) errors.push(`url state: goStep(${k}) did not write s= into location.hash (got "${hash}")`);
    else { await page.goto('about:blank'); await page.goto(url + hash); await page.waitForTimeout(600);
      const got = await page.evaluate(() => STEP); if (got !== k) errors.push(`url state: reopening ${hash} gave step ${got}, expected ${k}`); }
  } else if (!rt) warnings.push('url state: page does not use the runtime (IE.app), so links cannot reopen a step or setting');

  if (!QUICK){
    // interaction smoke test: play, drag a draggable canvas, wheel-zoom
    await page.goto(url); await page.waitForTimeout(500);
    const play = await page.$('#play'); if (play){ await play.click(); await page.waitForTimeout(700); await play.click(); }
    const cv = await page.$('canvas.drag');
    if (cv){ const b = await cv.boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
      await page.mouse.move(b.x + b.width / 2 + 120, b.y + b.height / 2 - 60); await page.mouse.up(); await page.mouse.wheel(0, -300); }
    await page.waitForTimeout(300);

    // 3) HiDPI: at devicePixelRatio 1.5 repeated redraws must not change canvas heights. The classic bug is fit()
    //    reading the logical height back from cv.height / getAttribute('height') after setting it to H*dpr.
    //    Keep the logical height in data-h (the runtime's setupCanvas does this).
    const hi = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 1.5, colorScheme: 'light' });
    hi.on('pageerror', e => errors.push('hidpi pageerror: ' + e.message));
    await hi.goto(url); await hi.waitForTimeout(600);
    const heights = () => hi.$$eval('canvas', cs => cs.map(c => (c.id || c.className || 'canvas') + ':' + c.clientHeight));
    const h0 = await heights();
    for (const c of await hi.$$('canvas:not(.drag)')){
      await c.scrollIntoViewIfNeeded().catch(() => {});   // mouse clicks below the fold would otherwise miss
      const b = await c.boundingBox(); if (!b || !b.width) continue;
      for (let i = 1; i <= 4; i++){ await hi.mouse.click(b.x + b.width * i / 5, b.y + b.height / 2); await hi.waitForTimeout(40); }
    }
    const h1 = await heights();
    const grew = h0.map((v, i) => v !== h1[i] ? `${v} -> ${String(h1[i]).split(':').pop()}px` : null).filter(Boolean);
    if (grew.length) errors.push('HiDPI: canvas height changed after clicks (dpr bug, keep logical height in data-h): ' + grew.join(', '));
    await hi.close();

    // 4) theme: the page must follow the reader's light/dark setting, and still work with reduced motion
    const dk = await browser.newPage({ viewport: { width: 1600, height: 1000 }, colorScheme: 'dark', reducedMotion: 'reduce' });
    dk.on('pageerror', e => errors.push('dark/reduced-motion pageerror: ' + e.message));
    await dk.goto(url); await dk.waitForTimeout(600);
    const bg = pg => pg.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const bgL = await bg(page), bgD = await bg(dk);
    if (bgL === bgD) warnings.push(`theme: background is ${bgL} in both light and dark mode; use the runtime core.css tokens so the page follows the reader's setting`);
    await shot(dk, 'theme-dark.png');
    await lintEmpty(dk, 'empty space (dark)');
    await dk.close();

    // 5) phone width: no horizontal page scroll
    const ph = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'light' });
    ph.on('pageerror', e => errors.push('phone pageerror: ' + e.message));
    await ph.goto(url); await ph.waitForTimeout(600);
    const over = await ph.evaluate(() => ({ dx: document.documentElement.scrollWidth - innerWidth,
      who: [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1 && !e.closest('table, pre, .tablewrap, .scroll')).slice(0, 6).map(e => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.split(' ')[0] : '')) }));
    if (over.dx > 0) errors.push(`phone 390px: page scrolls sideways by ${over.dx}px; widest: ${over.who.join(', ')}`);
    await lintLabels(ph, 'phone labels');
    const phn = await tiles(ph, 'page-phone', 10);
    if (phn.of > phn.n) warnings.push(`phone: the page is ${phn.of} screens tall (tiles stop at ${phn.n}); collapse reference sections (<details>) or split the page`);
    await ph.close();
  }

  // contact sheet: every shot on one image, so one Read shows the whole run
  const pickShots = (re, n) => shots.filter(f => re.test(f)).slice(0, n);
  const groups = [['steps', pickShots(/^step\d+\.png$/, 12), 340], ['what-ifs', pickShots(/^whatif-/, 8), 340], ['desktop page (light)', pickShots(/^page-desktop-/, 4), 340],
    ['dark + reduced motion', pickShots(/^theme-dark/, 1), 340], ['phone page', pickShots(/^page-phone-/, 10), 150]].filter(g => g[1].length);
  const cs = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const fig = (f, w) => `<figure style="margin:0;width:${w}px"><img style="width:${w}px;border:1px solid #bbb;display:block" src="data:image/png;base64,${fs.readFileSync(path.join(outDir, f)).toString('base64')}"><figcaption>${f}</figcaption></figure>`;
  await cs.setContent('<body style="margin:12px;font:12px system-ui;background:#fff;color:#222">' + groups.map(([t, list, w]) =>
    `<h3 style="margin:10px 0 4px">${t}</h3><div style="display:flex;flex-wrap:wrap;gap:8px">${list.map(f => fig(f, w)).join('')}</div>`).join('') + '</body>');
  await cs.waitForTimeout(200); await cs.screenshot({ path: path.join(outDir, 'contact.png'), fullPage: true }); await cs.close();
  await browser.close();

  const counts = { steps: nSteps, stepButtons: nSetButtons, whatIfs: whats.length, picks: picks.length, quiz: lint.qs.length, lesson: isLesson };
  const summary = { ok: !errors.length, mode: QUICK ? 'quick' : 'full', seconds: Math.round((Date.now() - t0) / 1000), counts, errors, warnings, probes, screenshots: ['contact.png', ...shots] };
  fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 1));
  console.log(`${QUICK ? 'QUICK' : 'FULL'} check in ${summary.seconds}s · steps: ${nSteps}, step buttons: ${nSetButtons}, what-if scenarios: ${whats.length}, picks: ${picks.length}, quiz questions: ${lint.qs.length}${isLesson ? ' (lesson)' : ''}`);
  console.log(`read first: ${path.resolve(outDir, 'contact.png')} · details: summary.json`);
  if (warnings.length) console.log('WARNINGS (not failures):\n' + warnings.join('\n'));
  if (errors.length){ console.error('ERRORS:\n' + errors.join('\n')); process.exit(1); }
  console.log('errors: none');
})();
