"""Static checks on lesson content: is every stated answer actually right?

Used by build_lesson.py (before writing a lesson) and check_lessons.py (on any lesson page).
No browser needed. Each item may carry a "verify" block (spot items: on "fix"):

  {"expr": "332 + (332 - 140)"}                 arithmetic, exact (fractions ok: "4/5 - 1/10"); − × ÷ allowed
  {"time": "18 45 + 30"}  {"time": "16 10 - 30"}  end/start time from a time and minutes
  {"duration": "15 30 -> 17 30"}                 minutes between two times (answer may be "2 h")
  {"to24": "12:50 am"}                           12-hour time in 24-hour clock (answer "00 50")
  (for a duration answer, "expr" counts minutes: "(12 - 10) * 60 * 4" for "8 h")
  {"grid": "practice", "step": "PQ"}            squares across for every 1 up/down on that grid
  {"grid": "practice", "parallel_to": "PQ"}     accepted answers must be EXACTLY the lines parallel to PQ,
  {"grid": "practice", "perpendicular_to": "PQ"}   and no trap may be one of them

Grids are the data-grid specs with an "id". Also: text_arithmetic() finds "a + b = c" statements in
any text and reports the false ones (intended wrong statements can be listed in "expected_wrong").
"""
import ast, operator, re
from fractions import Fraction

OPS = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul, ast.Div: operator.truediv}


def eval_expr(s):
    s = s.replace("−", "-").replace("×", "*").replace("÷", "/").replace("x", "*")

    def ev(n):
        if isinstance(n, ast.Expression):
            return ev(n.body)
        if isinstance(n, ast.Constant) and isinstance(n.value, (int, float)):
            return Fraction(str(n.value))
        if isinstance(n, ast.BinOp) and type(n.op) in OPS:
            return OPS[type(n.op)](ev(n.left), ev(n.right))
        if isinstance(n, ast.UnaryOp) and isinstance(n.op, ast.USub):
            return -ev(n.operand)
        raise ValueError(f"unsupported expression: {s!r}")
    return ev(ast.parse(s, mode="eval"))


def tmin(t):
    d = re.sub(r"\D", "", t)
    if len(d) != 4:
        raise ValueError(f"not a 4-digit time: {t!r}")
    return int(d[:2]) * 60 + int(d[2:])


def to_minutes(s):
    s = s.lower()
    h = re.search(r"(\d+)\s*(h|hr|hrs|hour|hours)\b", s)
    m = re.search(r"(\d+)\s*(m|min|mins|minute|minutes)\b", s)
    if not h and not m:
        return None
    return (int(h.group(1)) * 60 if h else 0) + (int(m.group(1)) if m else 0)


def to_value(kind, a):
    """The value an answer string stands for, comparable with a verify result."""
    a = str(a)
    if kind == "time":
        return tmin(a)
    if kind == "duration":
        return to_minutes(a)
    if kind == "fraction":
        n, d = re.sub(r"\s", "", a).split("/")
        return Fraction(int(n), int(d))
    if kind == "number":
        return Fraction(re.search(r"-?\d+(\.\d+)?", a.replace(",", "")).group(0))
    return a


def line_key(name):
    return "".join(sorted(re.sub(r"[^A-Za-z]", "", name).upper()))


def seg_vec(grid, seg):
    pts = grid.get("points", {})
    a, b = pts[seg[0]], pts[seg[1]]
    return b[0] - a[0], b[1] - a[1]


def related(grid, ref, rel):
    """Line keys of the grid's segments that are parallel/perpendicular to ref (ref itself excluded)."""
    rx, ry = seg_vec(grid, ref)
    out = set()
    for s in grid.get("segments", []):
        if line_key(s) == line_key(ref):
            continue
        x, y = seg_vec(grid, s)
        if (rel == "parallel" and rx * y - ry * x == 0) or (rel == "perpendicular" and rx * x + ry * y == 0):
            out.add(line_key(s))
    return out


def verify_answer(where, kind, answer, traps, v, grids):
    errs = []
    answers = [answer] if isinstance(answer, str) else list(answer)
    try:
        if "grid" in v:
            g = grids.get(v["grid"])
            if g is None:
                return [f"{where}: verify names grid {v['grid']!r}, but no grid has that id"]
            for rel in ("parallel", "perpendicular"):
                ref = v.get(rel + "_to")
                if not ref:
                    continue
                truth = related(g, ref, rel)
                given = {line_key(a) for a in answers}
                if given != truth:
                    errs.append(f"{where}: lines {rel} to {ref} on grid {v['grid']!r} are {sorted(truth) or 'none'}, "
                                f"but the accepted answers are {sorted(given)}")
                bad = [t for t in (traps or {}) if re.fullmatch(r"[a-z]{2}", t) and line_key(t) in truth]
                if bad:
                    errs.append(f"{where}: trap(s) {bad} are actually {rel} to {ref}")
            if "step" in v:
                x, y = seg_vec(g, v["step"])
                if y == 0:
                    errs.append(f"{where}: {v['step']} is flat, it has no 'across for every 1 up'")
                else:
                    truth = Fraction(abs(x), abs(y))
                    if to_value(kind, answers[0]) != truth:
                        errs.append(f"{where}: {v['step']} goes {abs(x)} across and {abs(y)} up/down = {truth} per 1, "
                                    f"but the answer is {answers[0]!r}")
            return errs
        if "expr" in v:
            truth = eval_expr(v["expr"])
        elif "time" in v:
            t, op, m = re.fullmatch(r"\s*(\d\d\s?\d\d)\s*([+-])\s*(\d+)\s*", v["time"]).groups()
            truth = (tmin(t) + (int(m) if op == "+" else -int(m))) % (24 * 60)
        elif "duration" in v:
            a, b = [x.strip() for x in v["duration"].split("->")]
            truth = tmin(b) - tmin(a)
        elif "to24" in v:
            h, m, ap = re.fullmatch(r"\s*(\d{1,2})[:.](\d\d)\s*(am|pm)\s*", v["to24"].lower()).groups()
            truth = (int(h) % 12 + (12 if ap == "pm" else 0)) * 60 + int(m)
        else:
            return [f"{where}: verify block has nothing to check: {v}"]
        got = to_value(kind, answers[0])
        if got != truth:
            show = f"{int(truth) // 60:02d} {int(truth) % 60:02d}" if kind == "time" else (
                f"{truth} min" if kind == "duration" else str(truth))
            errs.append(f"{where}: verify says {show}, but the answer is {answers[0]!r}")
        for t in (traps or {}):
            try:
                if kind in ("number", "fraction") and to_value(kind, t) == truth:
                    errs.append(f"{where}: trap {t!r} is actually the right answer")
            except Exception:
                pass
    except Exception as ex:
        errs.append(f"{where}: could not verify ({ex})")
    return errs


def verify_items(items, grids):
    """Returns (errors, unverified item ids)."""
    errs, unverified = [], []
    for it in items:
        if it["type"] == "typed":
            if "verify" in it:
                errs += verify_answer(it["id"], it.get("kind"), it["answer"], it.get("traps"), it["verify"], grids)
            elif it.get("kind") in ("number", "fraction", "time", "duration") or re.search(
                    r"grid|parallel|perpendicular", str(it.get("prompt", "")), re.I):
                unverified.append(it["id"])
        elif it["type"] == "spot":
            fix = it.get("fix", {})
            if "verify" in fix:
                errs += verify_answer(it["id"] + ".fix", fix.get("kind"), fix["answer"], fix.get("traps"), fix["verify"], grids)
            else:
                unverified.append(it["id"])
    return errs, unverified


# ---------- arithmetic written in text ----------
NUM = r"\d+(?:/\d+)?"
STATEMENT = re.compile(rf"(?<![\d/.])({NUM}(?:\s*[+\-−×÷]\s*{NUM})+)\s*=\s*({NUM})(?![\d/])")


def strip_tags(s):
    return re.sub(r"<[^>]+>", "", str(s)).replace("&nbsp;", " ")


def text_arithmetic(texts, expected_wrong=()):
    """texts: iterable of (where, text). Returns false 'a op b = c' statements not listed in expected_wrong."""
    allowed = {re.sub(r"\s", "", e) for e in expected_wrong}
    out = []
    for where, text in texts:
        for m in STATEMENT.finditer(strip_tags(text)):
            lhs, rhs = m.group(1), m.group(2)
            try:
                ok = eval_expr(lhs) == eval_expr(rhs)
            except Exception:
                continue
            if not ok and re.sub(r"\s", "", m.group(0)) not in allowed:
                out.append(f"{where}: '{m.group(0)}' is false ({lhs} = {eval_expr(lhs)})")
    return out


def item_texts(items):
    """(where, text) pairs for every piece of text in the items, skipping a spot item's deliberately wrong step."""
    out = []
    for it in items:
        for k in ("prompt", "explain", "retry"):
            if it.get(k):
                out.append((f"{it['id']}.{k}", it[k]))
        for k, msg in (it.get("traps") or {}).items():
            out.append((f"{it['id']}.traps[{k}]", msg))
        for i, s in enumerate(it.get("steps") or []):
            if i != it.get("wrong"):
                out.append((f"{it['id']}.steps[{i}]", s))
        fix = it.get("fix") or {}
        for k, msg in (fix.get("traps") or {}).items():
            out.append((f"{it['id']}.fix.traps[{k}]", msg))
    return out
