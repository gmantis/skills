"""Convert a hand-written lesson page into a build_lesson.py spec (one-time migration).

Usage: python -I html_to_spec.py lessons/NNNN-slug.html [...]   ->  lessons/src/NNNN-slug.json

Recognised blocks become structured; anything else is kept verbatim as {"html": ...}, so nothing is lost.
Afterwards: build_lesson.py lessons/src/NNNN-slug.json, then check_lessons.py, and compare.
"""
import html, json, pathlib, re, sys
from html.parser import HTMLParser

sys.stdout.reconfigure(encoding="utf-8")
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}


class Splitter(HTMLParser):
    """Records [start, end) source offsets of the direct children of <main>."""

    def __init__(self, src):
        super().__init__(convert_charrefs=False)
        self.src, self.lines = src, [0]
        for m in re.finditer("\n", src):
            self.lines.append(m.end())
        self.depth, self.main_depth, self.cur, self.blocks = 0, None, None, []

    def off(self):
        line, col = self.getpos()
        return self.lines[line - 1] + col

    def handle_starttag(self, tag, attrs):
        if self.main_depth is not None and self.depth == self.main_depth + 1 and self.cur is None:
            self.cur = self.off()
            if tag in VOID:
                end = self.src.index(">", self.cur) + 1
                self.blocks.append(self.src[self.cur:end]); self.cur = None
                return
        if tag in VOID:
            return
        if tag == "main":
            self.main_depth = self.depth
        self.depth += 1

    def handle_startendtag(self, tag, attrs):
        if self.main_depth is not None and self.depth == self.main_depth + 1 and self.cur is None:
            start = self.off()
            self.blocks.append(self.src[start:self.src.index(">", start) + 1])

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        self.depth -= 1
        if self.main_depth is not None and self.depth == self.main_depth + 1 and self.cur is not None:
            end = self.src.index(">", self.off()) + 1
            self.blocks.append(self.src[self.cur:end]); self.cur = None
        if tag == "main" and self.depth == self.main_depth:
            self.main_depth = None


def tag_end(chunk):
    """Index just past the opening tag's '>', skipping '>' inside quoted attribute values."""
    q = None
    for i, c in enumerate(chunk):
        if q:
            q = None if c == q else q
        elif c in "\"'":
            q = c
        elif c == ">":
            return i + 1
    raise ValueError("unterminated tag")


def inner(chunk):
    return chunk[tag_end(chunk):chunk.rindex("</")].strip()


def classify(chunk, spec):
    tag = re.match(r"<\s*([a-zA-Z0-9]+)", chunk).group(1).lower()
    open_tag = chunk[:tag_end(chunk)]
    cls = (re.search(r'class="([^"]*)"', open_tag) or [None, ""])[1].split()
    if tag == "p" and "kicker" in cls:
        m = re.match(r"Lesson\s+(\d+)\s*·\s*(.*)", html.unescape(inner(chunk)))
        if m:
            spec["number"], spec["series"] = int(m.group(1)), m.group(2).strip()
        else:
            spec["series"] = inner(chunk)
        return None
    if tag == "h1":
        spec["title_html"] = inner(chunk)
        return None
    if tag == "p" and "hook" in cls:
        spec["hook"] = inner(chunk)
        return None
    if tag == "h2" and "step-no" in chunk:
        return {"step": re.sub(r'^<span class="step-no">[^<]*</span>', "", inner(chunk)).strip()}
    if tag == "div" and re.fullmatch(r'<div data-item="[^"]+"></div>', chunk.strip()):
        return {"item": re.search(r'data-item="([^"]+)"', chunk).group(1)}
    if tag == "div" and "data-grid=" in open_tag and chunk.strip().endswith("></div>"):
        return {"grid": json.loads(html.unescape(re.search(r"data-grid='([^']*)'", open_tag).group(1)))}
    if tag == "div" and "data-timeline=" in open_tag and chunk.strip().endswith("></div>"):
        return {"timeline": json.loads(html.unescape(re.search(r"data-timeline='([^']*)'", open_tag).group(1)))}
    if tag == "ol" and "rules" in cls:
        return {"rules": [m.strip() for m in re.findall(r"<li>(.*?)</li>", inner(chunk), re.S)]}
    if tag == "div" and "card" in cls and re.fullmatch(r"<p>.*</p>", inner(chunk), re.S):
        b = {"card": inner(chunk)[3:-4].strip()}
        tone = [c for c in cls if c != "card"]
        if tone:
            b["tone"] = tone[0]
        return b
    if tag == "figure" and re.fullmatch(r'<img [^>]*>\s*(<figcaption>.*</figcaption>)?', inner(chunk), re.S):
        img = re.search(r"<img [^>]*>", chunk).group(0)
        f = {"src": re.search(r'src="([^"]*)"', img).group(1), "alt": html.unescape((re.search(r'alt="([^"]*)"', img) or [0, ""])[1])}
        cap = re.search(r"<figcaption>(.*)</figcaption>", chunk, re.S)
        if cap:
            f["caption"] = cap.group(1).strip()
        return {"figure": f}
    if tag == "div" and "source" in cls:
        m = re.fullmatch(r'<b>([^<:]*):</b>\s*<a href="([^"]*)">(.*?)</a>\.?\s*(.*)', inner(chunk), re.S)
        spec["source"] = {"label": m.group(1), "url": m.group(2), "title": m.group(3), "note": m.group(4).strip()} if m else {"html": inner(chunk)}
        return None
    if tag == "div" and "ask" in cls:
        m = re.fullmatch(r'<b>Stuck or curious\?</b> Ask (.*?), or ask your AI tutor\.(?: Try: <em>"(.*)"</em>)?', inner(chunk), re.S)
        spec["ask"] = ({"helpers": m.group(1), **({"try": m.group(2)} if m.group(2) else {})} if m else {"html": inner(chunk)})
        return None
    if tag == "p" and "data-export" in chunk:
        note = chunk[chunk.index("</button>") + len("</button>"):chunk.rindex("</p>")].strip()
        if note:
            spec["parent_note"] = note
        return None
    if tag == "nav" and "lesson-nav" in cls:
        spec["nav"] = [{"href": h, "text": t} for h, t in re.findall(r'<a href="([^"]*)">(.*?)</a>', chunk)]
        return None
    if tag == "p" and re.fullmatch(r"<p( class=\"[^\"]*\")?>", open_tag):
        b = {"p": inner(chunk)}
        if cls:
            b["class"] = " ".join(cls)
        return b
    return {"html": chunk.strip()}


def convert(path):
    src = pathlib.Path(path).read_text(encoding="utf-8")
    sp = Splitter(src)
    sp.feed(src)
    data = json.loads(re.search(r'<script type="application/json" id="lesson-data">(.*?)</script>', src, re.S).group(1))
    spec = {"id": data["id"]}
    body = []
    for chunk in sp.blocks:
        b = classify(chunk, spec)
        if b is None:
            continue
        if "item" in b and body and ("item" in body[-1] or "items" in body[-1]):
            prev = body.pop()
            b = {"items": ([prev["item"]] if "item" in prev else prev["items"]) + [b["item"]]}
        body.append(b)
    title = spec.pop("title_html", data.get("title"))
    html_title = re.search(r"<title>(.*?)</title>", src, re.S).group(1)
    out = {"id": data["id"], "number": spec.get("number"), "series": spec.get("series", ""), "title": title}
    if html.unescape(html_title) != (f"Lesson {out['number']} · {title}" if out["number"] is not None else title):
        out["html_title"] = html.unescape(html_title)
    if data.get("title") and data["title"] != title:
        out["data_title"] = data["title"]
    for k in ("hook",):
        if k in spec:
            out[k] = spec[k]
    for k in ("learner", "subject", "topics", "source_scan", "source_items", "minutes", "retry_hint"):
        if k in data:
            out[k] = data[k]
    extra = [s for s in re.findall(r'<script src="\.\./assets/([^"]+)"></script>', src) if s != "quiz.js"]
    if extra:
        out["scripts"] = extra
    head = src[:src.index("<body")]
    styles = re.findall(r"<style>(.*?)</style>", head, re.S)
    if styles:
        out["style"] = "\n".join(x.strip("\n") for x in styles)
    out["body"] = body
    for k in ("source", "ask", "parent_note", "nav"):
        if k in spec:
            out[k] = spec[k]
    out["items"] = data["items"]
    dest = pathlib.Path(path).resolve().parent / "src" / f"{data['id']}.json"
    dest.parent.mkdir(exist_ok=True)
    dest.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    raw = sum(1 for b in body if "html" in b)
    print(f"{path} -> {dest}  ({len(body)} blocks, {raw} kept as raw html)")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    for p in sys.argv[1:]:
        convert(p)
