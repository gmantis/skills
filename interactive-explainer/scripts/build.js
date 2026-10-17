// Build (or refresh) an interactive-explainer page: fill its runtime blocks from runtime/ and its model from a file,
// so the page stays one offline HTML file while the shared engine is written once.
//
//   node build.js <page.html> [--from <dir>]  fill/refresh every block in place; --from: where data-ie-file files live
//                                             when they are not next to the page (e.g. the $TEMP folder the model was tested in)
//   node build.js new <shape> <page.html>     copy assets/skeleton-<shape>.html to page.html, then build it
//   node build.js list                        list shapes and runtime modules
//
// Blocks in the page (inner text is replaced on every build, so never edit inside them):
//   <style data-ie="core"></style>            runtime/core.css
//   <script data-ie="core"></script>          runtime/core.js   (also: 3d, graph, stepper, ... = runtime/<name>.js)
//   <script data-ie-file="model.js"></script> the model file you validated in Node, found next to the page or in --from.
//                                             If the file is gone (temp folder deleted), the inlined copy is kept, so
//                                             refreshing an old page's runtime never loses its model.
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), RT = path.join(ROOT, 'runtime'), SK = path.join(ROOT, 'assets');
const version = (fs.readFileSync(path.join(RT, 'core.js'), 'utf8').match(/version: '([^']+)'/) || [])[1] || '?';

const shapes = () => fs.readdirSync(SK).filter(f => /^skeleton(-[a-z0-9-]+)?\.html$/.test(f)).map(f => f === 'skeleton.html' ? 'over-time' : f.slice(9, -5));
const modules = () => fs.readdirSync(RT).filter(f => /\.(js|css)$/.test(f));
const usage = () => { console.error('usage: node build.js <page.html> | new <shape> <page.html> | list'); process.exit(2); };

function build(file, from){
  const abs = path.resolve(file), dir = path.dirname(abs);
  let html = fs.readFileSync(abs, 'utf8');
  const report = [];
  const comments = []; html = html.replace(/<!--[\s\S]*?-->/g, m => `\u0000C${comments.push(m) - 1}\u0000`);   // tags written inside comments are not blocks
  const safe = (s, tag) => tag === 'script' ? s.replace(/<\/script/gi, '<\\/script') : s.replace(/<\/style/gi, '<\\/style');
  html = html.replace(/<(script|style)\b([^>]*)\bdata-ie="([^"]+)"([^>]*)>([\s\S]*?)<\/\1>/g, (m, tag, a1, name, a2) => {
    const f = path.join(RT, name + (tag === 'style' ? '.css' : '.js'));
    if (!fs.existsSync(f)) throw new Error(`no runtime module ${path.relative(ROOT, f)} (have: ${modules().join(', ')})`);
    const src = fs.readFileSync(f, 'utf8'); report.push(`${name}.${tag === 'style' ? 'css' : 'js'} ${(src.length / 1024).toFixed(0)} KB`);
    return `<${tag}${a1}data-ie="${name}"${a2}>\n${safe(src, tag)}\n</${tag}>`;
  });
  html = html.replace(/<(script|style)\b([^>]*)\bdata-ie-file="([^"]+)"([^>]*)>([\s\S]*?)<\/\1>/g, (m, tag, a1, rel, a2, inner) => {
    const f = path.isAbsolute(rel) ? rel : [path.join(dir, rel), from && path.join(from, rel)].find(x => x && fs.existsSync(x)) || path.join(dir, rel);
    if (!fs.existsSync(f)){ if (inner.trim()){ report.push(`${rel} (kept inlined copy; file not found)`); return m; } throw new Error(`model file not found: ${f}`); }
    const src = fs.readFileSync(f, 'utf8'); report.push(`${rel} ${(src.length / 1024).toFixed(1)} KB`);
    return `<${tag}${a1}data-ie-file="${rel}"${a2}>\n${safe(src, tag)}\n</${tag}>`;
  });
  html = html.replace(/\u0000C(\d+)\u0000/g, (m, i) => comments[+i]);
  const gen = `<meta name="generator" content="interactive-explainer runtime ${version}">`;
  html = /<meta name="generator"[^>]*>/.test(html) ? html.replace(/<meta name="generator"[^>]*>/, gen) : html.replace(/<head>/i, `<head>\n${gen}`);
  fs.writeFileSync(abs, html);
  console.log(`built ${abs} (${(html.length / 1024).toFixed(0)} KB, runtime ${version}): ${report.join(', ') || 'no blocks'}`);
}

const args = process.argv.slice(2), fi = args.indexOf('--from'), FROM = fi >= 0 ? path.resolve(args.splice(fi, 2)[1]) : null;
const [a, b, c] = args;
if (!a) usage();
if (a === 'list'){ console.log('shapes: ' + shapes().join(', ') + '\nruntime: ' + modules().join(', ')); process.exit(0); }
try {
  if (a === 'new'){
    if (!b || !c) usage();
    const f = path.join(SK, b === 'over-time' ? 'skeleton.html' : `skeleton-${b}.html`);
    if (!fs.existsSync(f)){ console.error(`no shape "${b}"; have: ${shapes().join(', ')}`); process.exit(2); }
    if (fs.existsSync(c)){ console.error(`${c} exists; not overwriting`); process.exit(2); }
    fs.mkdirSync(path.dirname(path.resolve(c)), { recursive: true }); fs.copyFileSync(f, c); build(c, FROM);
  } else build(a, FROM);
} catch (e){ console.error('build failed: ' + e.message); process.exit(1); }
