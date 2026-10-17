// Score one eval run: the page an agent built for evals/cases/<id>, plus (optionally) the agent's transcript.
//   node eval-score.js <case-dir> <page.html> [--transcript <session.jsonl>] [--label <text>] [--no-save]
// Prints a score card and appends it to evals/results.jsonl (unless --no-save).
// Scores: check.js full run (ok, warnings), each case target (true at any probed moment), built on the runtime,
// page-specific size (without runtime blocks), shape modules used; from the transcript: wall minutes, turns,
// output and cache-read tokens, check.js runs, screenshots read, characters written into .html files.
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process');
const args = process.argv.slice(2), opt = k => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : null; };
const transcript = opt('--transcript'), label = opt('--label') || '', noSave = args.includes('--no-save');
const [caseDir, page] = args.filter(a => !a.startsWith('--'));
if (!caseDir || !page){ console.error('usage: node eval-score.js <case-dir> <page.html> [--transcript f.jsonl] [--label txt] [--no-save]'); process.exit(2); }
const C = JSON.parse(fs.readFileSync(path.join(caseDir, 'case.json'), 'utf8'));
const html = fs.readFileSync(page, 'utf8');

// page facts
const blocks = [...html.matchAll(/<(script|style)\b[^>]*\bdata-ie="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/g)];
const runtimeBytes = blocks.reduce((s, m) => s + m[0].length, 0);
const modules = [...new Set(blocks.map(m => m[2]))];
const page_ = { runtime: /interactive-explainer runtime/.test(html), kb_total: +(html.length / 1024).toFixed(1), kb_page: +((html.length - runtimeBytes) / 1024).toFixed(1),
  modules, shape_ok: (C.expect_shapes || []).some(s => modules.includes(s)) || (C.expect_shapes || []).includes('over-time') && modules.includes('core') };

// check.js with a probe that evaluates every target
const probe = '({' + C.targets.map((t, i) => `t${i}: (() => { try { return !!(${t.expr}); } catch (e) { return false; } })()`).join(', ') + '})';
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'ie-eval-'));
const r = spawnSync(process.execPath, [path.join(__dirname, 'check.js'), page, out, probe], { encoding: 'utf8', timeout: 300000 });
let sum = null; try { sum = JSON.parse(fs.readFileSync(path.join(out, 'summary.json'), 'utf8')); } catch (_) {}
const hit = C.targets.map((t, i) => !!(sum && sum.probes.some(p => p.value && p.value['t' + i])));
const check = sum ? { ok: sum.ok, errors: sum.errors.length, warnings: sum.warnings.length, seconds: sum.seconds, steps: sum.counts.steps } : { ok: false, errors: 'check.js did not finish: ' + (r.stderr || '').slice(0, 300) };

// transcript metrics
let cost = null;
if (transcript && fs.existsSync(transcript)){
  let t0 = null, t1 = null, turns = 0, outTok = 0, cacheRead = 0, cacheWrite = 0, checks = 0, images = 0, htmlChars = 0; const tools = {};
  for (const line of fs.readFileSync(transcript, 'utf8').split('\n')){ if (!line.trim()) continue; let d; try { d = JSON.parse(line); } catch (_) { continue; }
    if (d.timestamp){ const t = new Date(d.timestamp); t0 = t0 || t; t1 = t; }
    const m = d.message || {};
    if (d.type === 'assistant'){ turns++; const u = m.usage || {}; outTok += u.output_tokens || 0; cacheRead += u.cache_read_input_tokens || 0; cacheWrite += u.cache_creation_input_tokens || 0;
      for (const c of m.content || []) if (c.type === 'tool_use'){ tools[c.name] = (tools[c.name] || 0) + 1; const s = JSON.stringify(c.input || {});
        if (/check\.js/.test(s)) checks++; const fp = (c.input && c.input.file_path) || '';
        if (/\.html$/.test(fp)) htmlChars += (c.input.content || c.input.new_string || '').length; } }
    if (d.type === 'user' && Array.isArray(m.content)) for (const c of m.content) if (c.type === 'tool_result' && Array.isArray(c.content)) images += c.content.filter(x => x.type === 'image').length;
  }
  cost = { minutes: t0 ? +((t1 - t0) / 60000).toFixed(1) : null, turns, output_tokens: outTok, cache_read: cacheRead, cache_write: cacheWrite, check_runs: checks, images_read: images, html_chars_written: htmlChars, tools };
}

const passed = hit.filter(Boolean).length;
const res = { when: new Date().toISOString(), case: C.id, tier: C.tier, label, page: path.resolve(page), check, targets: `${passed}/${hit.length}`,
  target_detail: C.targets.map((t, i) => (hit[i] ? '✓ ' : '✗ ') + t.label), ...page_, cost,
  within_budget: cost ? { minutes: cost.minutes <= C.budget.minutes, output_tokens: cost.output_tokens <= C.budget.output_tokens } : null };
console.log(`case ${C.id} (${C.tier}) ${label}`);
console.log(`  check.js: ${check.ok ? 'ok' : 'FAIL'}${sum ? ` · ${check.warnings} warning(s) · ${check.steps} steps` : ' · ' + check.errors}`);
console.log(`  targets: ${res.targets}\n    ${res.target_detail.join('\n    ')}`);
console.log(`  runtime: ${page_.runtime ? 'yes' : 'NO'} · modules ${modules.join(', ') || '-'} · expected shape ${page_.shape_ok ? 'used' : 'NOT used'} · page ${page_.kb_page} KB of ${page_.kb_total} KB`);
if (cost) console.log(`  cost: ${cost.minutes} min · ${cost.turns} turns · ${cost.output_tokens} output tok · ${(cost.cache_read / 1e6).toFixed(1)}M cache read · ${cost.check_runs} checks · ${cost.images_read} images · ${cost.html_chars_written} html chars written`
  + ` · budget ${res.within_budget.minutes && res.within_budget.output_tokens ? 'met' : 'MISSED'}`);
if (!noSave) fs.appendFileSync(path.join(__dirname, '..', 'evals', 'results.jsonl'), JSON.stringify(res) + '\n');
fs.rmSync(out, { recursive: true, force: true });
