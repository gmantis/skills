/* LessonKit: renders practice items from the lesson's JSON data block and tracks results.
 *
 * A lesson declares its content in <script type="application/json" id="lesson-data">:
 *   { id, title, knowledge_points, source_scan, source_items, items: [ ... ] }
 * and places items with <div data-item="<item id>"></div>.
 *
 * Item types
 *   typed  { id, type:"typed", kind:"time"|"duration"|"number"|"fraction"|"text", prompt, answer, traps?, explain?, retry?, simplest? }
 *          number: marked by value, so "54 cm" = 54. fraction: equal value accepted ("simplest":true requires lowest terms).
 *          text: case and spaces ignored; answer may be a list of accepted strings.
 *          retry: first-wrong-answer nudge for this item (falls back to the lesson's "retry_hint", then a generic line).
 *   mcq    { id, type:"mcq", prompt, options:[...], answer:<index>, explain? }
 *   spot   { id, type:"spot", prompt, steps:[...], wrong:<index>, fix:{ kind, answer, prompt?, traps? }, explain? }
 *          "Spot the mistake": tap the wrong step in a worked answer, then type the fix. Marked by rules.
 *   explain { id, type:"explain", prompt, key_ideas:[...] }
 *          "Explain it": one sentence, saved with the results and judged later (got it / partly / not yet)
 *          by the agent or parent from key_ideas. Not part of the star score.
 *   <widget> any type registered in window.LessonWidgets by a widget script loaded BEFORE this file,
 *          e.g. timeline.js registers "jump-builder" and "hops". Signature: (hostElement, item) => void.
 *
 * Every recorded item also gets active_ms: time on that item while the page was visible and the
 * learner had interacted within the last 60 s (idle gaps are not counted).
 *
 * `traps` maps a normalised wrong answer to targeted feedback for a known misconception,
 * e.g. { "1210": "That's ten past noon..." }.
 *
 * Results persist in localStorage under "lessonkit:<lesson id>" and can be downloaded as
 * JSON with a [data-export] button, so the agent can read them back after the lesson.
 */
(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

  const data = JSON.parse(($("#lesson-data") || { textContent: "{}" }).textContent);
  const storeKey = "lessonkit:" + (data.id || location.pathname);
  const session = { started: new Date().toISOString(), items: {} };
  const scored = new Set();   // item ids that count towards the score

  // ---------- normalisers ----------
  const digits = s => String(s).replace(/\D/g, "");
  function toMinutes(s) {
    s = String(s).toLowerCase();
    const h = s.match(/(\d+)\s*(h|hr|hrs|hour|hours)\b/);
    const m = s.match(/(\d+)\s*(m|min|mins|minute|minutes)\b/);
    if (!h && !m) return null;
    return (h ? +h[1] * 60 : 0) + (m ? +m[1] : 0);
  }
  function fmtDuration(min) {
    const h = Math.floor(min / 60), m = min % 60;
    return [h ? h + " h" : "", m ? m + " min" : ""].filter(Boolean).join(" ") || "0 min";
  }

  // Returns { ok, msg, hint } where hint=true means "not wrong, just fix the format".
  function judge(item, raw) {
    const v = String(raw).normalize("NFKC").trim();   // full-width digits from a Chinese keyboard: "９７" -> "97"
    if (!v) return { ok: false, hint: true, msg: "Type an answer first." };
    if (item.kind === "time") {
      const d = digits(v), want = digits(item.answer);
      if (d === want) return { ok: true };
      if (d.length === 3 && "0" + d === want) return { ok: false, hint: true, msg: "Almost! A 24-hour time always has <b>4 digits</b>. What goes in front?" };
      if (item.traps && item.traps[d]) return { ok: false, msg: item.traps[d] };
      if (d.length !== 4) return { ok: false, hint: true, msg: "Write it as 4 digits, like <span class='t'>07 15</span>." };
      return { ok: false };
    }
    if (item.kind === "duration") {
      const got = toMinutes(v), want = toMinutes(item.answer);
      if (got === null) return { ok: false, hint: true, msg: "Add a unit: <b>h</b> or <b>min</b>." };
      if (got === want) return { ok: true };
      const key = fmtDuration(got).replace(/\s/g, "");
      if (item.traps && item.traps[key]) return { ok: false, msg: item.traps[key] };
      return { ok: false };
    }
    if (item.kind === "number") {
      const got = toNumber(v);
      if (got === null) return { ok: false, hint: true, msg: "Type your answer as a number." };
      if ([].concat(item.answer).some(a => toNumber(a) === got)) return { ok: true };
      if (item.traps && item.traps[String(got)]) return { ok: false, msg: item.traps[String(got)] };
      return { ok: false };
    }
    if (item.kind === "fraction") {
      const got = toFraction(v), want = toFraction(item.answer);
      if (!got) return { ok: false, hint: true, msg: "Write it as a fraction, like <span class='t'>3/4</span>." };
      const key = got.n + "/" + got.d;
      if (item.traps && item.traps[key]) return { ok: false, msg: item.traps[key] };
      if (got.n * want.d === want.n * got.d) {
        if (item.simplest && key !== want.n + "/" + want.d) return { ok: false, hint: true, msg: "Right amount! Now simplify it: can the top and bottom both be divided by the same number?" };
        return { ok: true };
      }
      return { ok: false };
    }
    // Case, spaces and a final full stop are ignored: "R S", "rs" and "RS." all match "RS". Trap keys: lowercase, no spaces.
    // A leading "line" is dropped too, so "line RS" matches "RS".
    const norm = s => String(s).toLowerCase().replace(/\s+/g, "").replace(/[.!]+$/, "").replace(/^line(?=[a-z]{2}$)/, "");
    const accept = [].concat(item.answer).map(norm);
    if (accept.includes(norm(v))) return { ok: true };
    if (item.traps && item.traps[norm(v)]) return { ok: false, msg: item.traps[norm(v)] };
    return { ok: false };
  }
  const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
    "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
  function toNumber(s) {
    s = String(s).trim().toLowerCase();
    if (WORDS.includes(s.split(/\s+/)[0])) return WORDS.indexOf(s.split(/\s+/)[0]);     // "two", "two squares"
    s = s.replace(/(\d),(\d{3})/g, "$1$2").replace(/(\d)\s+(?=\d)/g, "$1");               // "1,000", "5 2 4"
    const m = s.match(/-?\d+(\.\d+)?/);
    return m ? Number(m[0]) : null;
  }
  function toFraction(s) {
    const m = String(s).replace(/\s+/g, "").replace(/[.!]+$/, "").match(/^(\d+)\/(\d+)$/);
    return m && +m[2] ? { n: +m[1], d: +m[2] } : null;
  }
  // Generic retry messages. A lesson can set "retry_hint" in #lesson-data and an item can set "retry"
  // to point at the lesson's own tool (timeline, bar model, step box...). Never name a tool the lesson doesn't use.
  function retryMsg(item, wrongs) {
    if (wrongs === 1) return item.retry || data.retry_hint || "Not yet. Look at your working again and try once more.";
    return "Still not it. Read the rules above again, or press <b>Show me</b>.";
  }

  // ---------- active time ----------
  // A clock that only runs while the page is visible and the learner touched it within IDLE_MS.
  const IDLE_MS = 60000;
  let activeMs = 0, lastTick = performance.now(), lastInput = performance.now();
  ["pointerdown", "keydown", "scroll", "input"].forEach(ev => addEventListener(ev, () => { lastInput = performance.now(); }, { passive: true, capture: true }));
  setInterval(() => {
    const now = performance.now();
    if (document.visibilityState === "visible" && now - lastInput < IDLE_MS) activeMs += now - lastTick;
    lastTick = now;
  }, 1000);
  const seenAt = {};
  const seen = new IntersectionObserver(entries => entries.forEach(e => {
    const id = e.target.dataset.itemId;
    if (e.isIntersecting && id && !(id in seenAt)) seenAt[id] = activeMs;
  }), { threshold: 0.4 });
  const watch = (node, id) => { node.dataset.itemId = id; seen.observe(node); };

  // ---------- recording ----------
  function record(id, answer, ok, countsAsTry = true) {
    const r = session.items[id] || (session.items[id] = { attempts: 0, answers: [], first_try_correct: null, done: false });
    r.active_ms = Math.round(activeMs - (seenAt[id] ?? activeMs));
    r.answers.push(answer);
    if (countsAsTry) {
      r.attempts++;
      if (r.first_try_correct === null) r.first_try_correct = !!ok;
    }
    if (ok) r.done = true;
    persist(); updateScore();
  }
  function persist() {
    try {
      const all = JSON.parse(localStorage.getItem(storeKey) || "[]");
      const i = all.findIndex(s => s.started === session.started);
      session.updated = new Date().toISOString();
      if (i >= 0) all[i] = session; else all.push(session);
      localStorage.setItem(storeKey, JSON.stringify(all.slice(-20)));
    } catch (e) { /* storage may be blocked on file:// in some browsers */ }
  }
  function updateScore() {
    const bar = $("[data-score]");
    if (!bar) return;
    const ids = [...scored];
    const done = ids.filter(id => session.items[id] && session.items[id].done).length;
    const first = ids.filter(id => session.items[id] && session.items[id].first_try_correct).length;
    bar.innerHTML = `<span>${done} / ${ids.length} done</span><span class="stars">${"★".repeat(first)}${"☆".repeat(ids.length - first)}</span>`;
  }

  // ---------- renderers ----------
  function feedback(box, kind, html) {
    box.className = "feedback show " + kind;
    box.innerHTML = html;
  }

  function placeholderFor(kind) {
    return { time: "_ _  _ _", duration: "e.g. 1 h 5 min", number: "Type a number", fraction: "e.g. 3/4" }[kind] || "Type your answer";
  }

  function renderTyped(host, item, n) {
    const wrap = el("div", "item");
    wrap.appendChild(el("div", "q", `<span class="n">${n}</span>${item.prompt}`));
    const row = el("div", "row");
    const input = el("input", "answer");
    input.setAttribute("autocomplete", "off");
    input.placeholder = item.placeholder || placeholderFor(item.kind);
    const check = el("button", "primary", "Check");
    const reveal = el("button", "", "Show me");
    reveal.style.display = "none";
    row.append(input, check, reveal);
    const fb = el("div", "feedback");
    wrap.append(row, fb);
    host.replaceWith(wrap);
    watch(wrap, item.id);

    let wrongs = 0;
    function go() {
      if (session.items[item.id] && session.items[item.id].done) return;
      const res = judge(item, input.value);
      record(item.id, input.value, res.ok, !res.hint);
      input.classList.remove("right", "wrong");
      if (res.ok) {
        input.classList.add("right"); input.disabled = true; check.disabled = true; reveal.style.display = "none";
        feedback(fb, "right", "✓ Yes! " + (item.explain || ""));
      } else if (res.hint) {
        feedback(fb, "hint", res.msg);
      } else {
        wrongs++;
        input.classList.add("wrong");
        feedback(fb, "wrong", res.msg || retryMsg(item, wrongs));
        if (wrongs >= 2) reveal.style.display = "";
      }
    }
    check.addEventListener("click", go);
    input.addEventListener("keydown", e => { if (e.key === "Enter") go(); });
    reveal.addEventListener("click", () => {
      const shown = [].concat(item.answer)[0];
      input.value = shown; input.disabled = true; check.disabled = true; reveal.style.display = "none";
      record(item.id, "(shown)", true, false);
      feedback(fb, "hint", `The answer is <span class="t">${shown}</span>. ${item.explain || ""}`);
    });
  }

  function renderMcq(host, item, n) {
    const wrap = el("div", "item");
    wrap.appendChild(el("div", "q", `<span class="n">${n}</span>${item.prompt}`));
    const opts = el("div", "opts");
    const fb = el("div", "feedback");
    item.options.forEach((o, i) => {
      const b = el("button", "", o);
      b.addEventListener("click", () => {
        if (session.items[item.id] && session.items[item.id].done) return;
        const ok = i === item.answer;
        record(item.id, o, ok);
        if (ok) {
          b.classList.add("right");
          opts.querySelectorAll("button").forEach(x => x.disabled = x !== b);
          feedback(fb, "right", "✓ Yes! " + (item.explain || ""));
        } else {
          b.classList.add("wrong"); b.disabled = true;
          feedback(fb, "wrong", (item.traps && item.traps[o]) || "Not that one. Try again.");
        }
      });
      opts.appendChild(b);
    });
    wrap.append(opts, fb);
    host.replaceWith(wrap);
    watch(wrap, item.id);
  }

  function renderSpot(host, item, n) {
    const wrap = el("div", "item spot");
    wrap.appendChild(el("div", "q", `<span class="n">${n}</span>${item.prompt}`));
    const list = el("ol", "steps");
    const fb = el("div", "feedback");
    const fixRow = el("div", "row");
    fixRow.style.display = "none";
    let found = false;
    item.steps.forEach((txt, i) => {
      const li = el("li");
      const b = el("button", "step", txt);
      b.addEventListener("click", () => {
        if (found) return;
        if (i === item.wrong) {
          found = true;
          b.classList.add("wrong-step");
          list.querySelectorAll("button").forEach(x => x.disabled = true);
          feedback(fb, "hint", "Yes, that's the step that goes wrong. Now fix it:");
          fixRow.style.display = "";
          fixInput.focus({ preventScroll: true });
        } else {
          b.classList.add("ok-step"); b.disabled = true;
          record(item.id, "step:" + (i + 1), false);
          feedback(fb, "wrong", "That step is fine. Look for the one where the thinking slips.");
        }
      });
      li.appendChild(b); list.appendChild(li);
    });
    const fix = Object.assign({ id: item.id }, item.fix);
    const fixInput = el("input", "answer");
    fixInput.setAttribute("autocomplete", "off");
    fixInput.placeholder = fix.placeholder || placeholderFor(fix.kind);
    const fixBtn = el("button", "primary", "Check");
    fixRow.append(el("span", "", fix.prompt || "The right answer is"), fixInput, fixBtn);
    function go() {
      const res = judge(fix, fixInput.value);
      if (res.hint) { feedback(fb, "hint", res.msg); return; }
      record(item.id, fixInput.value, res.ok);
      fixInput.classList.remove("right", "wrong");
      if (res.ok) {
        fixInput.classList.add("right"); fixInput.disabled = true; fixBtn.disabled = true;
        feedback(fb, "right", "✓ Mistake found and fixed! " + (item.explain || ""));
      } else {
        fixInput.classList.add("wrong");
        feedback(fb, "wrong", res.msg || "Not yet. Fix that step, then work it through again.");
      }
    }
    fixBtn.addEventListener("click", go);
    fixInput.addEventListener("keydown", e => { if (e.key === "Enter") go(); });
    wrap.append(list, fixRow, fb);
    host.replaceWith(wrap);
    watch(wrap, item.id);
  }

  function renderExplain(host, item) {
    const wrap = el("div", "item explain");
    wrap.appendChild(el("div", "q", item.prompt));
    const ta = el("textarea", "answer-text-input");
    ta.rows = 3;
    ta.placeholder = "Write one sentence in your own words.";
    const btn = el("button", "primary", "Save my answer");
    const fb = el("div", "feedback");
    btn.addEventListener("click", () => {
      const v = ta.value.trim();
      if (v.split(/\s+/).length < 4) { feedback(fb, "hint", "Write a whole sentence, at least a few words."); return; }
      const r = session.items[item.id] || (session.items[item.id] = { attempts: 0, answers: [], first_try_correct: null, done: false });
      r.answers.push(v); r.attempts++; r.done = true; r.kind = "explain"; r.key_ideas = item.key_ideas || [];
      r.active_ms = Math.round(activeMs - (seenAt[item.id] ?? activeMs));
      persist();
      ta.disabled = true; btn.disabled = true;
      feedback(fb, "right", "Saved! We'll read it together.");
    });
    wrap.append(ta, el("div", "row", ""), fb);
    wrap.querySelector(".row").appendChild(btn);
    host.replaceWith(wrap);
    watch(wrap, item.id);
  }

  function mount() {
    let n = 0;
    const widgets = window.LessonWidgets || {};   // registered by widget scripts loaded before this file
    const byId = Object.fromEntries((data.items || []).map(i => [i.id, i]));
    // Walk the page in DOM order, so question numbers always run 1, 2, 3... down the page.
    document.querySelectorAll("[data-item]").forEach(host => {
      const item = byId[host.dataset.item];
      if (!item) return;
      if (widgets[item.type]) { widgets[item.type](host, item); return; }  // widget registers its own score
      if (item.type === "explain") { renderExplain(host, item); return; }   // not scored: judged later
      n++;
      scored.add(item.id);
      ({ mcq: renderMcq, spot: renderSpot }[item.type] || renderTyped)(host, item, n);
    });
    const exp = $("[data-export]");
    if (exp) exp.addEventListener("click", exportResults);
    updateScore();
  }

  function exportResults() {
    const payload = { lesson: data.id, topics: data.topics, source_scan: data.source_scan, learner: data.learner, device: localStorage.getItem("lessonkit:device") || "", session };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = el("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${data.id}-results-${session.started.slice(0, 10)}.json`;
    a.click();
  }

  window.LessonKit = { data, judge, record, watch, toMinutes, fmtDuration, scored, updateScore, exportResults };
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", mount) : mount();
})();
