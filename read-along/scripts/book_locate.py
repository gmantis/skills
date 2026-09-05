#!/usr/bin/env python3
"""Resolve a reader's stated position into a percentage bound.

Usage:
    python book_locate.py <index-dir> --list [--max-pct N]
    python book_locate.py <index-dir> --resolve "<spec>" [--at end|start]

<spec> accepts what a reader actually says:
    "32%"                    a raw percentage
    "chapter 14" / "ch14"    a chapter
    "part 2 chapter 3"       a chapter inside a part
    "volume 2 chapter 3"     same, for multi-volume works
    "book three"             a whole named division
    "section 4"              a numbered section
    "prologue" / "epilogue"  named front/back divisions
Numbers may be digits, words ("twelve"), or roman numerals ("XIV").

--at end    (default) resolve to the END of that unit -- "I finished chapter 14".
--at start  resolve to the START of that unit -- "I'm partway into chapter 14",
            which bounds at everything before it and withholds the chapter
            itself. Erring short is a missed hit; erring long is a spoiler.

--list prints the book's divisions. Pass --max-pct to avoid printing titles the
reader has not reached: a table of contents is itself a spoiler surface, since
a chapter can be titled after the thing that happens in it.

Prints the resolved percentage alone on stdout, so it can be fed straight into
book_search.py --max-pct.
"""
import argparse
import csv
import os
import re
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

WORDS = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6,
    "seven": 7, "eight": 8, "nine": 9, "ten": 10, "eleven": 11, "twelve": 12,
    "thirteen": 13, "fourteen": 14, "fifteen": 15, "sixteen": 16,
    "seventeen": 17, "eighteen": 18, "nineteen": 19, "twenty": 20,
    "thirty": 30, "forty": 40, "fifty": 50,
}

CONTAINERS = ("volume", "book", "part")

NUM = r"([0-9]+|[ivxlcdm]+|[a-z]+(?:[ -][a-z]+)?)"
KIND_RX = re.compile(
    r"^\s*(volume|book|part|chapter|section|interlude|appendix)\b[\s.:]*" + NUM + r"?",
    re.I,
)
NAMED_RX = re.compile(r"^\s*(prologue|epilogue|foreword|preface|afterword)\b", re.I)


def from_roman(s):
    vals = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100, "D": 500, "M": 1000}
    s = s.upper()
    if not s or any(c not in vals for c in s):
        return None
    total, prev = 0, 0
    for c in reversed(s):
        v = vals[c]
        total = total - v if v < prev else total + v
        prev = max(prev, v)
    return total or None


def to_number(tok):
    """'12' | 'twelve' | 'twenty-one' | 'XIV' -> int, or None."""
    if tok is None:
        return None
    tok = tok.strip().lower().replace("-", " ")
    if tok.isdigit():
        return int(tok)
    parts = tok.split()
    if parts and all(p in WORDS for p in parts):
        return sum(WORDS[p] for p in parts)
    return from_roman(tok)


def parse_heading(text):
    """Pull (kind, number, label) out of a chunk's opening lines."""
    lines = [l.strip() for l in text.split("\n")[:12] if l.strip()]
    for line in lines:
        if len(line) > 80:
            continue
        m = NAMED_RX.match(line)
        if m:
            return m.group(1).lower(), None, line
        m = KIND_RX.match(line)
        if m:
            return m.group(1).lower(), to_number(m.group(2)), line
    return None, None, (lines[0] if lines else "")


def load(index_dir):
    idx = os.path.join(index_dir, "index.tsv")
    if not os.path.exists(idx):
        sys.exit(f"No index.tsv in {index_dir}. Run book_index.py first.")
    with open(idx, encoding="utf-8") as f:
        rows = list(csv.DictReader(f, delimiter="\t"))
    units = []
    for r in rows:
        title = (r.get("title") or "").strip()
        if title:
            kind, num, label = parse_heading(title)
        else:
            path = os.path.join(index_dir, r["file"])
            with open(path, encoding="utf-8") as fh:
                kind, num, label = parse_heading(fh.read(4000))
        units.append({
            "seq": int(r["seq"]),
            "start": float(r["start_pct"]),
            "end": float(r["end_pct"]),
            "kind": kind,
            "num": num,
            "label": label,
        })
    return units


def do_list(units, max_pct):
    shown = 0
    for u in units:
        if not u["kind"]:
            continue
        if max_pct is not None and u["start"] > max_pct:
            continue
        shown += 1
        print(f"{u['start']:6.1f}% - {u['end']:6.1f}%   {u['label']}")
    if not shown:
        print("[no chapter or part headings detected in this book]")
    if max_pct is not None:
        hidden = sum(1 for u in units if u["kind"] and u["start"] > max_pct)
        if hidden:
            print(f"\n[{hidden} later division(s) not listed: titles can spoil.]")


def resolve(units, spec, at):
    spec = spec.strip().lower()

    # The percent sign is required. A bare "14" is ambiguous between 14% and
    # chapter 14, and guessing wrong in the generous direction is a spoiler.
    m = re.fullmatch(r"([0-9]+(?:\.[0-9]+)?)\s*%", spec)
    if m:
        return float(m.group(1)), f"{m.group(1)}% (given directly)"
    if re.fullmatch(r"[0-9]+(?:\.[0-9]+)?", spec):
        sys.exit(
            f'Ambiguous position "{spec}": write "{spec}%" for a percentage or '
            f'"chapter {spec}" for a chapter.'
        )

    lo, hi = 0, len(units)
    container_label = None

    cm = re.match(r"(volume|book|part)\b[\s.:]*" + NUM, spec)
    if cm:
        ckind, cnum = cm.group(1), to_number(cm.group(2))
        hits = [i for i, u in enumerate(units)
                if u["kind"] == ckind and u["num"] == cnum]
        if not hits:
            sys.exit(f"No {ckind} {cnum} found. Run --list to see the divisions.")
        lo = hits[0]
        later = [i for i in range(lo + 1, len(units)) if units[i]["kind"] == ckind]
        hi = later[0] if later else len(units)
        container_label = units[lo]["label"]
        rest = spec[cm.end():].strip()
        if not rest:
            pct = units[hi - 1]["end"] if at == "end" else units[lo]["start"]
            return pct, f"{at} of {container_label}"
        spec = rest

    nm = NAMED_RX.match(spec)
    if nm:
        kind, num = nm.group(1).lower(), None
    else:
        # Longest alternatives first, and no \b before the separator, so that
        # both "chapter 14" and "ch14" parse.
        km = re.match(
            r"(chapters?|chaps?|sections?|secs?|chs?|interlude|appendix)[\s.:]*"
            + NUM,
            spec,
        )
        if not km:
            sys.exit(
                f'Could not parse position "{spec}". Try "32%", "chapter 14", '
                '"part 2 chapter 3", or run --list.'
            )
        raw = km.group(1).rstrip("s")
        kind = {"ch": "chapter", "chap": "chapter", "sec": "section"}.get(raw, raw)
        num = to_number(km.group(2))

    for i in range(lo, hi):
        u = units[i]
        if u["kind"] != kind:
            continue
        if num is not None and u["num"] != num:
            continue
        pct = u["end"] if at == "end" else u["start"]
        where = f"{at} of {u['label']}"
        if container_label:
            where += f" (in {container_label})"
        return pct, where

    scope = f" within {container_label}" if container_label else ""
    label = f"{kind} {num}" if num is not None else kind
    sys.exit(f"No {label}{scope} found. Run --list to see the divisions.")


def main():
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument("index_dir")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--resolve")
    ap.add_argument("--at", choices=("end", "start"), default="end")
    ap.add_argument("--max-pct", type=float, default=None)
    a = ap.parse_args()

    units = load(a.index_dir)

    if a.list:
        do_list(units, a.max_pct)
        return
    if not a.resolve:
        sys.exit('Pass --list or --resolve "<spec>".')

    pct, where = resolve(units, a.resolve, a.at)
    print(f"{pct:.1f}")
    print(f"[resolved to {where}]", file=sys.stderr)


if __name__ == "__main__":
    main()
