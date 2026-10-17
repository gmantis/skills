// Regression test for the runtime: build every skeleton into a temp folder and run check.js on it.
//   node test-skeletons.js [--quick] [shape ...]
// Run after any change to runtime/ or scripts/; every skeleton must end "errors: none".
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process');
const args = process.argv.slice(2), quick = args.includes('--quick'), only = args.filter(a => !a.startsWith('--'));
const SK = path.join(__dirname, '..', 'assets');
const shapes = fs.readdirSync(SK).filter(f => /^skeleton(-[a-z0-9-]+)?\.html$/.test(f)).map(f => f === 'skeleton.html' ? 'over-time' : f.slice(9, -5)).filter(s => !only.length || only.includes(s));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ie-skel-')); let bad = 0;
for (const s of shapes){
  const dir = path.join(root, s), page = path.join(dir, 'page.html'); fs.mkdirSync(dir);
  const b = spawnSync(process.execPath, [path.join(__dirname, 'build.js'), 'new', s, page], { encoding: 'utf8' });
  if (b.status){ console.log(`${s.padEnd(12)} BUILD FAILED ${b.stderr.trim()}`); bad++; continue; }
  const c = spawnSync(process.execPath, [path.join(__dirname, 'check.js'), page, path.join(dir, 'chk'), ...(quick ? ['--quick'] : [])], { encoding: 'utf8', timeout: 600000 });
  let sum = {}; try { sum = JSON.parse(fs.readFileSync(path.join(dir, 'chk', 'summary.json'), 'utf8')); } catch (_) {}
  const ok = c.status === 0 && sum.ok; if (!ok) bad++;
  console.log(`${s.padEnd(12)} ${ok ? 'ok  ' : 'FAIL'} ${sum.seconds ?? '?'}s · ${sum.counts ? `${sum.counts.steps} steps, ${sum.counts.picks} picks` : ''} · ${(sum.warnings || []).length} warning(s)${ok ? '' : '\n   ' + (sum.errors || [c.stderr.slice(-400)]).join('\n   ')}`);
}
console.log(`${shapes.length - bad}/${shapes.length} skeletons pass · output in ${root}`);
process.exit(bad ? 1 : 0);
