"""Build a lesson page from a compact JSON spec, after checking the spec.

Usage: python -I build_lesson.py lessons/src/NNNN-slug.json [more specs...] [--out lessons/]

The spec is the source of truth (it is also what a database or app would store); the HTML is generated.
Default output: the spec's folder's parent, i.e. lessons/src/X.json -> lessons/X.html. Format: SCHEMA.md.

Refuses to write a lesson when: an item is placed twice or never, an id is unknown or repeated, a required
field is missing, a trap key is not in the form the marking compares, a trap equals an accepted answer,
a grid point is outside its grid or a segment names an unknown point, or a "verify" check fails.
Warns about: answers with no "verify", false "a + b = c" statements in text, missing image files.
"""
import html, json, pathlib, re, sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import lesson_verify as V   # noqa: E402

sys.stdout.reconfigure(encoding="utf-8")
POS = {"n", "s", "e", "w", "ne", "nw", "se", "sw"}
META = ["id", "title", "learner", "subject", "topics", "source_scan", "source_items", "minutes", "retry_hint"]


def attr_json(obj):
    """JSON for a single-quoted HTML attribute."""
    return html.escape(json.dumps(obj, ensure_ascii=False), quote=False).replace("'", "&#39;")


def trap_key_ok(kind, k):
    if kind == "time":
        return re.fullmatch(r"\d{4}", k)
    if kind == "duration":
        return re.fullmatch(r"(\d+h)?(\d+min)?", k) and k
    if kind == "number":
        return re.fullmatch(r"-?\d+(\.\d+)?", k)
    if kind == "fraction":
        return re.fullmatch(r"\d+/\d+", k)
    return k == k.lower() and " " not in k


def grids_in(spec):
    out = {}
    for b in spec.get("body", []):
        if "grid" in b:
            g = b["grid"]
            out[g.get("id", f"#{len(out)}")] = g
    for it in spec.get("items", []):
        for m in re.finditer(r"data-grid='([^']*)'", it.get("prompt", "")):
            g = json.loads(html.unescape(m.group(1)))
            out[g.get("id", f"#{len(out)}")] = g
    return out


def check(spec, out_path):
    errs, warns = [], []
    items = spec.get("items", [])
    ids = [i.get("id") for i in items]
    for d in {i for i in ids if ids.count(i) > 1}:
        errs.append(f"item id {d!r} is used twice")
    placed = []
    for b in spec.get("body", []):
        placed += [b["item"]] if "item" in b else b.get("items", [])
    for p in placed:
        if p not in ids:
            errs.append(f"body places item {p!r}, which is not in items")
    for i in ids:
        n = placed.count(i)
        if n != 1:
            errs.append(f"item {i!r} is placed {n} times in body (must be exactly once)")
    for it in items:
        t, iid = it.get("type"), it.get("id")
        need = {"typed": ["kind", "prompt", "answer"], "mcq": ["prompt", "options", "answer"],
                "spot": ["prompt", "steps", "wrong", "fix"], "explain": ["prompt", "key_ideas"],
                "jump-builder": ["start", "add"], "hops": ["from", "to"]}.get(t)
        if need is None:
            errs.append(f"{iid}: unknown item type {t!r}")
            continue
        errs += [f"{iid}: missing {f!r}" for f in need if f not in it]
        if t == "mcq" and not (isinstance(it.get("answer"), int) and 0 <= it["answer"] < len(it.get("options", []))):
            errs.append(f"{iid}: mcq answer must be an option index")
        if t == "mcq":
            errs += [f"{iid}: trap {k!r} is not one of the options" for k in it.get("traps", {}) if k not in it["options"]]
        if t == "spot" and not (0 <= it.get("wrong", -1) < len(it.get("steps", []))):
            errs.append(f"{iid}: spot 'wrong' must be a step index")
        for owner, w in ((it, iid), (it.get("fix") or {}, iid + ".fix")):
            kind = owner.get("kind")
            if not kind or "answer" not in owner:
                continue
            accepted = [owner["answer"]] if isinstance(owner["answer"], str) else owner["answer"]
            if kind == "text":
                accepted = [re.sub(r"\s", "", a.lower()) for a in accepted]
            for k in owner.get("traps", {}):
                if not trap_key_ok(kind, k):
                    errs.append(f"{w}: trap key {k!r} is not normalised for kind {kind!r} (see SCHEMA.md)")
                elif k in accepted:
                    errs.append(f"{w}: trap {k!r} is also an accepted answer")
    for gid, g in grids_in(spec).items():
        pts, w, h = g.get("points", {}), g.get("w", 10), g.get("h", 6)
        for name, p in pts.items():
            if not (0 <= p[0] <= w and 0 <= p[1] <= h):
                errs.append(f"grid {gid}: point {name} {p[:2]} is outside the {w}x{h} grid")
            if len(p) > 2 and p[2] not in POS:
                errs.append(f"grid {gid}: point {name} label position {p[2]!r} (use n s e w ne nw se sw)")
        for s in g.get("segments", []):
            if len(s) != 2 or s[0] not in pts or s[1] not in pts:
                errs.append(f"grid {gid}: segment {s!r} names a point that isn't defined")
    if not errs:
        verrs, unverified = V.verify_items(items, grids_in(spec))
        errs += verrs
        if unverified:
            warns.append(f"no 'verify' on {unverified}: their answers are not checked")
    texts = V.item_texts(items) + [(f"body[{n}]", json.dumps(b, ensure_ascii=False)) for n, b in enumerate(spec.get("body", []))]
    warns += V.text_arithmetic(texts, spec.get("expected_wrong", []))
    for b in spec.get("body", []):
        if "figure" in b and not (out_path.parent / b["figure"]["src"]).exists():
            warns.append(f"image not found: {b['figure']['src']}")
    return errs, warns


def render_block(b, step):
    if "step" in b:
        step[0] += 1
        return f'  <h2><span class="step-no">{step[0]}</span>{b["step"]}</h2>'
    if "item" in b or "items" in b:
        return "\n".join(f'  <div data-item="{i}"></div>' for i in ([b["item"]] if "item" in b else b["items"]))
    if "p" in b:
        cls = f' class="{b["class"]}"' if b.get("class") else ""
        return f"  <p{cls}>{b['p']}</p>"
    if "card" in b:
        tone = f' {b["tone"]}' if b.get("tone") else ""
        return f'  <div class="card{tone}">\n    <p>{b["card"]}</p>\n  </div>'
    if "rules" in b:
        lis = "\n".join(f"    <li>{r}</li>" for r in b["rules"])
        return f'  <ol class="rules">\n{lis}\n  </ol>'
    if "figure" in b:
        f = b["figure"]
        cap = f"\n    <figcaption>{f['caption']}</figcaption>" if f.get("caption") else ""
        return f'  <figure>\n    <img src="{f["src"]}" alt="{html.escape(f.get("alt", ""))}">{cap}\n  </figure>'
    if "grid" in b:
        return f"  <div data-grid='{attr_json(b['grid'])}'></div>"
    if "timeline" in b:
        return f"  <div data-timeline='{attr_json(b['timeline'])}'></div>"
    if "bars" in b:
        bars = b["bars"]
        rows = []
        for r in bars["rows"]:
            parts = "".join(
                f'<div style="flex:{p["size"]}"></div>' if p.get("blank") else
                f'<div class="bar{" extra" if p.get("extra") else ""}" style="flex:{p["size"]}">{p.get("text", "")}</div>'
                for p in r["parts"])
            rows.append(f'    <div class="bar-row"><span>{r["label"]}</span><div class="bar-split">{parts}</div></div>')
        if bars.get("note"):
            rows.append(f'    <div class="bar-row"><span></span><span class="muted">{bars["note"]}</span></div>')
        label = html.escape(bars.get("label", "Bar model"))
        return f'  <div class="bars" role="img" aria-label="{label}">\n' + "\n".join(rows) + "\n  </div>"
    if "html" in b:
        return "  " + b["html"].strip()
    raise ValueError(f"unknown body block: {list(b)}")


def render(spec):
    items = spec["items"]
    kinds = {i["type"] for i in items}
    blob = json.dumps(spec, ensure_ascii=False)
    scripts = []
    if "data-timeline" in blob or "timeline" in [k for b in spec["body"] for k in b] or kinds & {"jump-builder", "hops"}:
        scripts.append("timeline.js")
    if "data-grid" in blob or any("grid" in b for b in spec["body"]):
        scripts.append("grid.js")
    scripts += [s for s in spec.get("scripts", []) if s not in scripts]
    has_warmup = any(i["type"] == "explain" for i in items)
    step = [spec.get("step_start", 0 if has_warmup else 1) - 1]
    body = "\n".join(render_block(b, step) for b in spec["body"])
    n = spec.get("number")
    kicker = f"Lesson {n} · {spec['series']}" if n is not None else spec.get("series", "")
    src = spec.get("source")
    if not src:
        source = ""
    elif "html" in src:
        source = f'  <div class="source">{src["html"]}</div>'
    else:
        note = f". {src['note']}" if src.get("note") else ""
        source = f'  <div class="source"><b>{src.get("label", "Watch next")}:</b> <a href="{src["url"]}">{src["title"]}</a>{note}</div>'
    ask = spec.get("ask") or {}
    if "html" in ask:
        ask_html = f'  <div class="ask">{ask["html"]}</div>'
    else:
        helpers = ask.get("helpers", "a grown-up")
        try_ = f' Try: <em>"{ask["try"]}"</em>' if ask.get("try") else ""
        ask_html = f'  <div class="ask"><b>Stuck or curious?</b> Ask {helpers}, or ask your AI tutor.{try_}</div>'
    nav = spec.get("nav") or []   # [{"href", "text"}, ...] left to right
    links = "".join(f'<a href="{l["href"]}">{l["text"]}</a>' for l in nav)
    data = {k: spec[k] for k in META if k in spec}
    if "data_title" in spec:   # plain-text title for the record when the heading has markup
        data["title"] = spec["data_title"]
    data["items"] = items
    data_json = json.dumps(data, ensure_ascii=False, indent=2).replace("</", "<\\/")
    title = spec.get("html_title") or (f"Lesson {n} · {spec['title']}" if n is not None else spec["title"])
    script_tags = "\n".join(f'<script src="../assets/{s}"></script>' for s in scripts)
    hook = f'  <p class="hook">{spec["hook"]}</p>\n' if spec.get("hook") else ""
    style = f"\n<style>\n{spec['style']}\n</style>" if spec.get("style") else ""   # lesson-only CSS
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)}</title>
<!-- Generated by build_lesson.py from src/{spec['id']}.json. Edit the spec and rebuild; don't edit this file. -->
<link rel="stylesheet" href="../assets/lesson.css">{style}
</head>
<body>
<div class="scorebar" data-score></div>
<main>
  <p class="kicker">{kicker}</p>
  <h1>{spec['title']}</h1>
{hook}
{body}

{source}
{ask_html}

  <p class="small muted">For parents: <button data-export>Save results (JSON)</button>{(" " + spec["parent_note"]) if spec.get("parent_note") else ""}</p>
  <nav class="lesson-nav">{links}</nav>
</main>

<script type="application/json" id="lesson-data">
{data_json}
</script>
{script_tags}
<script src="../assets/quiz.js"></script>
</body>
</html>
"""


def main(argv):
    out_dir = None
    if "--out" in argv:
        i = argv.index("--out"); out_dir = pathlib.Path(argv[i + 1]); del argv[i:i + 2]
    if not argv:
        sys.exit(__doc__)
    ok = True
    for p in argv:
        sp = pathlib.Path(p)
        spec = json.loads(sp.read_text(encoding="utf-8"))
        out = (out_dir or sp.resolve().parent.parent) / f"{spec['id']}.html"
        errs, warns = check(spec, out)
        for w in warns:
            print(f"  WARN {spec['id']}: {w}")
        if errs:
            ok = False
            for e in errs:
                print(f"  ERROR {spec['id']}: {e}")
            print(f"{spec['id']}: NOT built ({len(errs)} errors)")
            continue
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(render(spec), encoding="utf-8", newline="\n")
        print(f"{spec['id']}: built {out}")
    return ok


if __name__ == "__main__":
    sys.exit(0 if main(sys.argv[1:]) else 1)
