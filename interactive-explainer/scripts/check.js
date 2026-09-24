// Headless render check for an interactive explainer page.
// Usage: node check.js <page.html> <outDir> [probeExpr]
//   probeExpr: optional JS expression evaluated in the page after each step/scenario; its JSON result is printed
//              (e.g. "({eot: LAST.eot, peak: YEAR_MAX})"). Use it to confirm the numbers match the source document.
// It syntax-checks the inline <script>, loads the page, walks every STEPS entry (via goStep) and every
// [data-w] what-if button, takes screenshots, and fails loudly on page errors.
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');

function loadPlaywright(){
  const tries = ['playwright', 'playwright-core'];
  const appdata = process.env.APPDATA || '';
  for (const base of [path.join(appdata, 'npm/node_modules'), '/usr/local/lib/node_modules', '/usr/lib/node_modules']){
    tries.push(path.join(base, '@playwright/cli/node_modules/playwright'), path.join(base, 'playwright'), path.join(base, '@playwright/test/node_modules/playwright'));
  }
  for (const t of tries){ try { return require(t); } catch (_) {} }
  throw new Error('Playwright not found. Install with: npm i -g playwright  (no browser download needed if Edge/Chrome is installed)');
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
  const { chromium } = loadPlaywright();
  let browser;
  for (const opt of [{ channel: 'msedge' }, { channel: 'chrome' }, {}]){ try { browser = await chromium.launch(opt); break; } catch (_) {} }
  if (!browser){ console.error('Could not launch Edge, Chrome or bundled Chromium.'); process.exit(1); }
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('file:///' + abs.replace(/\\/g, '/').replace(/ /g, '%20'));
  await page.waitForTimeout(700);
  const doProbe = async label => {
    const empty = await page.evaluate(() => [...document.querySelectorAll('[data-dyn]')].filter(e => !e.textContent.trim()).map(e => e.dataset.dyn));
    if (empty.length) errors.push(`${label}: empty dynamic fields ${empty.join(', ')}`);
    if (probe){ try { console.log(label, JSON.stringify(await page.evaluate(probe))); } catch (e) { errors.push(`${label}: probe failed: ${e.message}`); } }
  };
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
  await browser.close();
  console.log(`steps: ${nSteps}, what-if scenarios: ${whats.length}, screenshots in ${path.resolve(outDir)}`);
  if (errors.length){ console.error('ERRORS:\n' + errors.join('\n')); process.exit(1); }
  console.log('errors: none');
})();
