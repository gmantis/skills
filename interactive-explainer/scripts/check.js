// Headless render check for an interactive explainer page.
// Usage: node check.js <page.html> <outDir> [probeExpr]
//   probeExpr: optional JS expression evaluated in the page after each step/scenario; its JSON result is printed
//              (e.g. "({eot: LAST.eot, peak: YEAR_MAX})"). Use it to confirm the numbers match the source document.
// It syntax-checks the inline <script>, loads the page, walks every STEPS entry (via goStep) and every
// [data-w] what-if button, takes screenshots, and fails loudly on page errors.
// It also re-runs the page at devicePixelRatio 1.5 (canvases must not grow on redraw) and at phone width 390 px
// (no horizontal page scroll).
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
  const [file, outDir = 'explainer-check', probe] = process.argv.slice(2);
  if (!file){ console.error('usage: node check.js <page.html> <outDir> [probeExpr]'); process.exit(2); }
  const abs = path.resolve(file); fs.mkdirSync(outDir, { recursive: true });

  // 1) syntax check of inline scripts (catches duplicate const etc. before the browser silently fails)
  const html = fs.readFileSync(abs, 'utf8');
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
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [], warnings = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const url = pathToFileURL(abs).href;
  await page.goto(url);
  await page.waitForTimeout(700);
  const doProbe = async label => {
    const empty = await page.evaluate(() => [...document.querySelectorAll('[data-dyn]')].filter(e => !e.textContent.trim() || /NaN|undefined/.test(e.textContent)).map(e => e.dataset.dyn + '=' + JSON.stringify(e.textContent.trim())));
    if (empty.length) errors.push(`${label}: empty or NaN dynamic fields ${empty.join(', ')}`);
    if (probe){ try { console.log(label, JSON.stringify(await page.evaluate(probe))); } catch (e) { errors.push(`${label}: probe failed: ${e.message}`); } }
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
  await page.screenshot({ path: path.join(outDir, 'initial.png'), fullPage: true });
  const nSteps = await page.evaluate(() => (typeof STEPS !== 'undefined' && typeof goStep === 'function') ? STEPS.length : 0);
  for (let s = 0; s < nSteps; s++){
    await page.evaluate(k => goStep(k), s); await page.waitForTimeout(250);
    await doProbe(`step ${s + 1}`);
    await page.screenshot({ path: path.join(outDir, `step${s + 1}.png`) });
  }
  const whats = await page.$$eval('[data-w]', bs => bs.map(b => b.dataset.w));
  for (const w of whats){
    await page.click(`[data-w="${w}"]`); await page.waitForTimeout(250);
    await doProbe(`what-if ${w}`);
    await page.screenshot({ path: path.join(outDir, `whatif-${w}.png`), fullPage: true });
  }
  // interaction smoke test: play, drag a draggable canvas, wheel-zoom
  const play = await page.$('#play'); if (play){ await play.click(); await page.waitForTimeout(700); await play.click(); }
  const cv = await page.$('canvas.drag');
  if (cv){ const b = await cv.boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + 120, b.y + b.height / 2 - 60); await page.mouse.up(); await page.mouse.wheel(0, -300); }
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outDir, 'after-interaction.png'), fullPage: true });

  // 3) HiDPI: at devicePixelRatio 1.5 repeated redraws must not change canvas heights. The classic bug is fit()
  //    reading the logical height back from cv.height / getAttribute('height') after setting it to H*dpr.
  //    Keep the logical height in data-h (skeleton setupCanvas does this).
  const hi = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 1.5 });
  hi.on('pageerror', e => errors.push('hidpi pageerror: ' + e.message));
  await hi.goto(url); await hi.waitForTimeout(600);
  const heights = () => hi.$$eval('canvas', cs => cs.map(c => (c.id || c.className || 'canvas') + ':' + c.clientHeight));
  const h0 = await heights();
  for (const c of await hi.$$('canvas:not(.drag)')){
    const b = await c.boundingBox(); if (!b || !b.width) continue;
    for (let i = 1; i <= 4; i++){ await hi.mouse.click(b.x + b.width * i / 5, b.y + b.height / 2); await hi.waitForTimeout(40); }
  }
  const h1 = await heights();
  const grew = h0.map((v, i) => v !== h1[i] ? `${v} -> ${String(h1[i]).split(':').pop()}px` : null).filter(Boolean);
  if (grew.length) errors.push('HiDPI: canvas height changed after clicks (dpr bug, keep logical height in data-h): ' + grew.join(', '));
  await hi.screenshot({ path: path.join(outDir, 'hidpi-after-clicks.png'), fullPage: true });
  await hi.close();

  // 4) phone width: no horizontal page scroll
  const ph = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  ph.on('pageerror', e => errors.push('phone pageerror: ' + e.message));
  await ph.goto(url); await ph.waitForTimeout(600);
  const over = await ph.evaluate(() => ({ dx: document.documentElement.scrollWidth - innerWidth,
    who: [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1 && !e.closest('table, pre, .tablewrap, .scroll')).slice(0, 6).map(e => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.split(' ')[0] : '')) }));
  if (over.dx > 0) errors.push(`phone 390px: page scrolls sideways by ${over.dx}px; widest: ${over.who.join(', ')}`);
  await ph.screenshot({ path: path.join(outDir, 'phone.png'), fullPage: true });
  await ph.close();
  await browser.close();
  console.log(`steps: ${nSteps}, what-if scenarios: ${whats.length}, quiz questions: ${lint.qs.length}${isLesson ? ' (lesson)' : ''}, screenshots in ${path.resolve(outDir)}`);
  if (warnings.length) console.log('WARNINGS (teaching lint, not failures):\n' + warnings.join('\n'));
  if (errors.length){ console.error('ERRORS:\n' + errors.join('\n')); process.exit(1); }
  console.log('errors: none');
})();
