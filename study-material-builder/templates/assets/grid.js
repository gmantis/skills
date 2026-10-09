/* Square-grid figures for geometry lessons (parallel / perpendicular lines, shapes on a grid).
 *
 * Declare a figure in the HTML (also works inside item prompts):
 *   <div data-grid='{"id":"practice","w":12,"h":6,                // id: lets items "verify" claims against this grid
 *        "points":{"P":[1,4],"Q":[5,2,"ne"]},          // [x, y, label position n|s|e|w|ne|nw|se|sw]; y counts DOWN
 *        "segments":["PQ","RS"],                       // lines between named points
 *        "highlight":["PQ"],                           // drawn in the accent colour
 *        "boxes":[{"at":[1,2],"w":4,"h":2,"label":"4 across, 2 up"}],   // step boxes, dashed
 *        "caption":"…"}'></div>
 *
 * Visual only: not an item and not scored. Load before quiz.js, like the other widgets.
 */
(function () {
  const NS = "http://www.w3.org/2000/svg";
  const CELL = 34, PAD = 22;
  const OFF = { n: [0, -10], s: [0, 20], e: [12, 5], w: [-12, 5], ne: [9, -7], nw: [-9, -7], se: [9, 18], sw: [-9, 18] };
  const ANCHOR = { n: "middle", s: "middle", e: "start", w: "end", ne: "start", nw: "end", se: "start", sw: "end" };

  function svg(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  function render(host, opt) {
    const w = opt.w || 10, h = opt.h || 6;
    const X = x => PAD + x * CELL, Y = y => PAD + y * CELL;
    const root = svg("svg", { viewBox: `0 0 ${w * CELL + 2 * PAD} ${h * CELL + 2 * PAD}`, role: "img",
      "aria-label": opt.label || "Figure on a square grid" });
    const g = svg("g", { class: "grid-lines", stroke: "#d9d0bf", "stroke-width": 1 }, root);
    for (let i = 0; i <= w; i++) svg("line", { x1: X(i), y1: Y(0), x2: X(i), y2: Y(h) }, g);
    for (let j = 0; j <= h; j++) svg("line", { x1: X(0), y1: Y(j), x2: X(w), y2: Y(j) }, g);

    (opt.boxes || []).forEach(b => {
      svg("rect", { x: X(b.at[0]), y: Y(b.at[1]), width: b.w * CELL, height: b.h * CELL,
        fill: "#fdebdd", "fill-opacity": .7, stroke: "#c2410c", "stroke-width": 2, "stroke-dasharray": "6 4" }, root);
      if (b.label) {
        const t = svg("text", { class: "box-label", x: X(b.at[0] + b.w / 2), y: Y(b.at[1] + b.h) + 16, "text-anchor": "middle",
          "font-family": "Segoe UI, Arial, sans-serif", "font-size": 13, "font-weight": 700, fill: "#c2410c" }, root);
        t.textContent = b.label;
      }
    });

    const pts = opt.points || {};
    const hl = new Set(opt.highlight || []);
    (opt.segments || []).forEach(s => {
      const a = pts[s[0]], b = pts[s[1]];
      if (!a || !b) return;
      const on = hl.has(s) || hl.has(s[1] + s[0]);
      svg("line", { class: "seg", "data-name": s, x1: X(a[0]), y1: Y(a[1]), x2: X(b[0]), y2: Y(b[1]), stroke: on ? "#c2410c" : "#1f1d1a",
        "stroke-width": on ? 3.5 : 2.5, "stroke-linecap": "round" }, root);
    });
    for (const name in pts) {
      const [x, y, pos = "nw"] = pts[name];
      svg("circle", { "data-name": name, cx: X(x), cy: Y(y), r: 4, fill: "#1f1d1a" }, root);
      const t = svg("text", { class: "pt-label", "data-name": name, x: X(x) + OFF[pos][0], y: Y(y) + OFF[pos][1], "text-anchor": ANCHOR[pos],
        "font-family": "Segoe UI, Arial, sans-serif", "font-size": 17, "font-weight": 700, fill: "#1f1d1a" }, root);
      t.textContent = name;
    }

    const fig = document.createElement("figure");
    fig.className = "grid-figure";
    fig.dataset.gridSpec = JSON.stringify(opt);   // kept for check_lessons.py: label collisions, geometry claims
    if (opt.id) fig.dataset.gridId = opt.id;
    fig.appendChild(root);
    if (opt.caption) {
      const c = document.createElement("figcaption");
      c.innerHTML = opt.caption;
      fig.appendChild(c);
    }
    host.replaceWith(fig);
  }

  function mountAll() {
    document.querySelectorAll("[data-grid]").forEach(h => render(h, JSON.parse(h.dataset.grid)));
  }
  // Run after quiz.js has rendered item prompts, so grids inside prompts are drawn too.
  const later = () => setTimeout(mountAll, 0);
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", later) : later();
  window.LessonGrid = { render };
})();
