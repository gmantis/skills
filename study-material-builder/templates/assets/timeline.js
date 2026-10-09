/* Timeline: SVG timelines with jump arcs, for time problems (start / duration / end).
 * An example of a subject-specific widget: copy its pattern (render into the host, call
 * LessonKit.watch/record, register in window.LessonWidgets) for new subjects.
 *
 * Declarative use (rendered on load):
 *   <div data-timeline='{"start":"13 55","end":"15 10","ticks":["14 00","15 00"],
 *        "jumps":[{"from":"13 55","to":"14 00","label":"5 min"}], "play":true}'></div>
 *   <div data-jump-builder='{"id":"jb1","start":"06 25","add":40}'></div>
 *       guided: minutes to the next hour -> minutes left -> end time
 *   <div data-hops='{"id":"h1","from":"07 30","to":"09 30"}'></div>
 *       hop one hour at a time and count the jumps, then type the duration
 *
 * Times are "HH MM" strings (24-hour). Builders report results to LessonKit if present.
 */
(function () {
  const NS = "http://www.w3.org/2000/svg";
  const parse = t => { const d = String(t).replace(/\D/g, "").padStart(4, "0"); return +d.slice(0, 2) * 60 + +d.slice(2, 4); };
  const fmt = m => { m = ((m % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, "0") + " " + String(m % 60).padStart(2, "0"); };
  const svgEl = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
  const html = (tag, cls, inner) => { const e = document.createElement(tag); if (cls) e.className = cls; if (inner != null) e.innerHTML = inner; return e; };
  const kit = () => window.LessonKit;

  const W = 640, PAD = 46, BASE = 112, H = 160;

  function render(host, opt) {
    const s = parse(opt.start), e = parse(opt.end);
    const x = t => PAD + (parse(t) - s) / Math.max(1, e - s) * (W - 2 * PAD);
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `Timeline from ${opt.start} to ${opt.end}` });
    const defs = svgEl("defs", {});
    const mk = svgEl("marker", { id: "ah" + Math.random().toString(36).slice(2, 7), viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" });
    mk.appendChild(svgEl("path", { d: "M0,0 L10,5 L0,10 z", fill: "#c2410c" }));
    defs.appendChild(mk); svg.appendChild(defs);
    svg.appendChild(svgEl("line", { x1: PAD - 18, y1: BASE, x2: W - PAD + 18, y2: BASE, stroke: "#1f1d1a", "stroke-width": 2 }));

    const tickLayer = svgEl("g", {}), jumpLayer = svgEl("g", {});
    svg.append(jumpLayer, tickLayer);

    function tick(t, opts = {}) {
      const g = svgEl("g", {});
      const xx = x(t);
      g.appendChild(svgEl("line", { x1: xx, y1: BASE - 9, x2: xx, y2: BASE + 9, stroke: "#1f1d1a", "stroke-width": 2 }));
      const label = svgEl("text", { x: xx, y: BASE + 34, "text-anchor": "middle", "font-family": "Consolas, monospace", "font-size": 17, "font-weight": 600, fill: opts.color || "#1f1d1a" });
      label.textContent = opts.text || t;
      g.appendChild(label);
      tickLayer.appendChild(g);
      return g;
    }
    function jump(j, animate) {
      const x1 = x(j.from), x2 = x(j.to), mid = (x1 + x2) / 2;
      const h = Math.min(82, 22 + (x2 - x1) * 0.28);
      const color = j.color || "#c2410c";
      const p = svgEl("path", { d: `M${x1},${BASE - 4} Q${mid},${BASE - h * 2} ${x2 - 2},${BASE - 6}`, fill: "none", stroke: color, "stroke-width": 2.5, "marker-end": `url(#${mk.id})` });
      const lab = svgEl("text", { x: mid, y: BASE - h - 10, "text-anchor": "middle", "font-family": "Segoe UI, Arial, sans-serif", "font-size": 16, "font-weight": 700, fill: color });
      lab.textContent = j.label || "";
      jumpLayer.append(p, lab);
      if (animate) {
        const len = p.getTotalLength ? p.getTotalLength() : 400;
        p.style.strokeDasharray = len; p.style.strokeDashoffset = len; lab.style.opacity = 0;
        requestAnimationFrame(() => {
          p.style.transition = "stroke-dashoffset .7s ease"; lab.style.transition = "opacity .3s .5s";
          p.style.strokeDashoffset = 0; lab.style.opacity = 1;
        });
      }
    }

    host.innerHTML = "";
    host.classList.add("timeline");
    host.appendChild(svg);
    const ticks = [opt.start, ...(opt.ticks || []), opt.end].filter((t, i, a) => a.indexOf(t) === i);
    if (!opt.hideTicks) ticks.forEach(t => tick(t, (opt.tickText || {})[t] ? { text: opt.tickText[t], color: "#c2410c" } : {}));
    const api = { svg, tick, jump, x };

    if (opt.play) {
      const btn = html("button", "", "Show the jumps ▸");
      btn.style.marginTop = ".4rem";
      host.appendChild(btn);
      btn.addEventListener("click", () => {
        btn.remove();
        (opt.jumps || []).forEach((j, i) => setTimeout(() => jump(j, true), i * 750));
      });
    } else {
      (opt.jumps || []).forEach(j => jump(j, false));
    }
    return api;
  }

  // ---------- guided builder: adding minutes across the hour ----------
  function jumpBuilder(host, opt) {
    const s = parse(opt.start), add = +opt.add;
    const hour = Math.floor(s / 60) * 60 + 60;
    const toHour = hour - s, left = add - toHour, end = s + add;
    const id = opt.id;
    if (kit()) kit().scored.add(id);
    let wronged = false;

    const box = html("div", "item");
    host.replaceWith(box);
    if (kit()) kit().watch(box, id);
    box.appendChild(html("div", "q", opt.prompt || `Start at <span class="t">${fmt(s)}</span>. Add <b>${add} min</b>. Stop at the hour on the way!`));
    const tlHost = html("div");
    box.appendChild(tlHost);
    const tl = render(tlHost, { start: fmt(s), end: fmt(end), ticks: [], hideTicks: true });
    tl.tick(fmt(s));
    const endTick = tl.tick(fmt(end), { text: "?", color: "#c2410c" });

    const steps = [
      { q: `From <span class="t">${fmt(s)}</span> to the next hour <span class="t">${fmt(hour)}</span> is`, unit: "min", want: String(toHour),
        hint: `Count on from ${s % 60} to 60: how many minutes make the hour?`,
        done: () => { tl.tick(fmt(hour), { color: "#1f1d1a" }); tl.jump({ from: fmt(s), to: fmt(hour), label: toHour + " min" }, true); } },
      { q: `${add} min − ${toHour} min =`, unit: "min left", want: String(left),
        hint: `You have already used ${toHour} of the ${add} minutes. How many are still left?`,
        done: () => { tl.jump({ from: fmt(hour), to: fmt(end), label: left + " min" }, true); } },
      { q: `So the end time is`, unit: "", want: fmt(end), time: true,
        hint: `Start at ${fmt(hour)} and add the ${left} minutes left.`,
        done: () => { endTick.querySelector("text").textContent = fmt(end); endTick.querySelector("text").setAttribute("fill", "#1f7a3f"); } },
    ];

    const fb = html("div", "feedback");
    let i = 0;
    function showStep() {
      const st = steps[i];
      const row = html("div", "row");
      row.style.marginTop = ".7rem";
      const input = html("input", "answer" + (st.time ? "" : " small"));
      input.setAttribute("autocomplete", "off");
      if (st.time) input.placeholder = "_ _  _ _";
      const btn = html("button", "primary", "Check");
      row.append(html("span", "", st.q), input, html("span", "muted", st.unit), btn);
      box.insertBefore(row, fb);
      input.focus({ preventScroll: true });
      function go() {
        const v = input.value.trim();
        const ok = st.time ? v.replace(/\D/g, "") === st.want.replace(/\D/g, "") : v.replace(/\D/g, "") === st.want;
        if (!v) return;
        input.classList.remove("right", "wrong");
        if (!ok) {
          input.classList.add("wrong");
          if (!wronged && kit()) kit().record(id, `step${i + 1}:${v}`, false);
          wronged = true;
          fb.className = "feedback show hint"; fb.innerHTML = st.hint;
          return;
        }
        input.classList.add("right"); input.disabled = true; btn.disabled = true;
        fb.className = "feedback";
        st.done();
        i++;
        if (i < steps.length) setTimeout(showStep, 650);
        else {
          if (kit()) kit().record(id, fmt(end), true);
          setTimeout(() => { fb.className = "feedback show right"; fb.innerHTML = opt.success || `✓ ${toHour} min to the hour, then ${left} min more. End time <span class="t">${fmt(end)}</span>.`; }, 700);
        }
      }
      btn.addEventListener("click", go);
      input.addEventListener("keydown", e => { if (e.key === "Enter") go(); });
    }
    box.appendChild(fb);
    showStep();
  }

  // ---------- hop counter: duration by counting whole-hour jumps ----------
  function hops(host, opt) {
    const s = parse(opt.from), e = parse(opt.to), step = opt.step || 60;
    const total = Math.round((e - s) / step);
    const id = opt.id;
    if (kit()) kit().scored.add(id);

    const box = html("div", "item");
    host.replaceWith(box);
    if (kit()) kit().watch(box, id);
    box.appendChild(html("div", "q", opt.prompt || `From <span class="t">${opt.from}</span> to <span class="t">${opt.to}</span>. Hop one hour at a time.`));
    const tlHost = html("div");
    box.appendChild(tlHost);
    const marks = [];
    for (let t = s; t <= e; t += step) marks.push(fmt(t));
    const tl = render(tlHost, { start: opt.from, end: opt.to, ticks: marks });
    const row = html("div", "row");
    const hopBtn = html("button", "primary", "Hop 1 hour →");
    const count = html("span", "", `Jumps: <b>0</b>`);
    row.append(hopBtn, count);
    box.appendChild(row);
    const tail = html("div");
    box.appendChild(tail);

    let n = 0;
    hopBtn.addEventListener("click", () => {
      if (n >= total) return;
      tl.jump({ from: marks[n], to: marks[n + 1], label: "1 h" }, true);
      n++;
      count.innerHTML = `Jumps: <b>${n}</b>`;
      if (n === total) { hopBtn.disabled = true; ask(); }
    });

    function ask() {
      tail.appendChild(html("div", "card accent",
        `Numbers on the line: <b>${marks.length}</b> &nbsp;(${marks.map(m => `<span class="t">${m}</span>`).join(", ")})<br>Jumps: <b>${total}</b>`));
      const r = html("div", "row");
      const input = html("input", "answer small");
      input.setAttribute("autocomplete", "off");
      const btn = html("button", "primary", "Check");
      r.append(html("span", "", "So the duration is"), input, html("span", "muted", "h"), btn);
      tail.appendChild(r);
      const fb = html("div", "feedback");
      tail.appendChild(fb);
      function go() {
        const v = input.value.replace(/\D/g, "");
        if (!v) return;
        const ok = +v === total;
        if (kit()) kit().record(id, v + " h", ok);
        input.classList.remove("right", "wrong");
        if (ok) {
          input.classList.add("right"); input.disabled = true; btn.disabled = true;
          fb.className = "feedback show right"; fb.innerHTML = `✓ ${total} jumps = <b>${total} h</b>. Count the jumps, not the numbers.`;
        } else {
          input.classList.add("wrong");
          fb.className = "feedback show wrong";
          fb.innerHTML = +v === marks.length ? `That's how many <b>numbers</b> there are. How many <b>jumps</b> did you make?` : `Count the orange arcs.`;
        }
      }
      btn.addEventListener("click", go);
      input.addEventListener("keydown", ev => { if (ev.key === "Enter") go(); });
    }
  }

  function mountAll() {
    document.querySelectorAll("[data-timeline]").forEach(h => render(h, JSON.parse(h.dataset.timeline)));
    document.querySelectorAll("[data-jump-builder]").forEach(h => jumpBuilder(h, JSON.parse(h.dataset.jumpBuilder)));
    document.querySelectorAll("[data-hops]").forEach(h => hops(h, JSON.parse(h.dataset.hops)));
    if (kit()) kit().updateScore();
  }

  window.Timeline = { render, jumpBuilder, hops, parse, fmt };
  window.LessonWidgets = Object.assign(window.LessonWidgets || {}, { "jump-builder": jumpBuilder, hops });
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", mountAll) : mountAll();
})();
