#!/usr/bin/env python3
"""Spoiler-bounded search over an indexed book.

Usage:
    python book_search.py <index-dir> <regex> [--max-pct N] [--context N] [--all]

--max-pct N   Only search text up to N% through the book. REQUIRED for a
              first-read fiction question. Any chunk that starts at or before N%
              is searched; matches are reported with their own position.
--all         Search the whole book. Only for non-fiction, or a re-read.
--context N   Lines of context around each match (default 2).

Refuses to run without --max-pct or --all, so a spoiler bound can never be
forgotten by accident.
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


def main():
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument("index_dir")
    ap.add_argument("pattern")
    ap.add_argument("--max-pct", type=float, default=None)
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--context", type=int, default=2)
    ap.add_argument("--ignore-case", action="store_true", default=True)
    a = ap.parse_args()

    if a.max_pct is None and not a.all:
        sys.exit("Refusing to search: pass --max-pct N (first read) or --all (non-fiction / re-read).")

    idx = os.path.join(a.index_dir, "index.tsv")
    if not os.path.exists(idx):
        sys.exit(f"No index.tsv in {a.index_dir}. Run book_index.py first.")

    rx = re.compile(a.pattern, re.IGNORECASE if a.ignore_case else 0)
    hits = 0
    suppressed = 0
    nearest = None
    bound = 100.0 if a.all else a.max_pct

    with open(idx, encoding="utf-8") as f:
        rows = list(csv.DictReader(f, delimiter="\t"))

    for r in rows:
        start, end = float(r["start_pct"]), float(r["end_pct"])
        if start > bound:
            continue
        path = os.path.join(a.index_dir, r["file"])
        with open(path, encoding="utf-8") as fh:
            lines = fh.read().split("\n")
        span = max(end - start, 1e-9)
        for i, line in enumerate(lines):
            if not rx.search(line):
                continue
            # approximate position of this line inside the chunk
            pos = start + span * (i / max(len(lines) - 1, 1))
            # No upward slack: a line past the bound is withheld, even though
            # the position estimate is approximate. Erring long is a spoiler;
            # erring short is only a missed hit, and suppressed hits are
            # counted and reported below so the gap is never silent.
            if not a.all and pos > bound:
                suppressed += 1
                nearest = pos if nearest is None else min(nearest, pos)
                continue
            hits += 1
            lo, hi = max(0, i - a.context), min(len(lines), i + a.context + 1)
            print(f"\n===== {r['file']}  ~{pos:.1f}%  (chunk {start:.1f}-{end:.1f}%) line {i+1} =====")
            for j in range(lo, hi):
                mark = ">>" if j == i else "  "
                print(f"{mark} {lines[j]}")

    scope = "whole book" if a.all else f"first {bound:.1f}%"
    print(f"\n[{hits} match(es) within {scope}]")
    if suppressed:
        print(
            f"[{suppressed} further match(es) withheld beyond the bound; "
            f"nearest is at ~{nearest:.1f}%. Position estimates are approximate, "
            f"so ask the reader before raising the bound.]"
        )


if __name__ == "__main__":
    main()
