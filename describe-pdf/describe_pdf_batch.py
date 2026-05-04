#!/usr/bin/env python3
"""
describe-pdf batch mode: describe multiple pages in parallel, max 4 concurrent.

Usage:
  python describe_pdf_batch.py --notebook NAME --source NAME --pages 99,100,101
  python describe_pdf_batch.py --notebook NAME --source NAME --pages 99-105
  python describe_pdf_batch.py --notebook NAME --source NAME --pages 99-105 --page-type pdf

Output:
  One line per page: "<page_num> <cache_path>"
  Pages already cached are returned immediately (no NotebookLM call).
"""

import argparse
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

SKILL_DIR = Path(__file__).parent
SCRIPT = SKILL_DIR / "describe_pdf.py"
MAX_PARALLEL = 4  # NotebookLM rate limit guard


def describe_page(notebook: str, source: str, page: int, page_type: str) -> tuple[int, str]:
    """Call describe_pdf.py for one page. Returns (page, path_or_error)."""
    result = subprocess.run(
        [
            sys.executable, str(SCRIPT),
            "--notebook", notebook,
            "--source", source,
            "--page", str(page),
            "--page-type", page_type,
        ],
        capture_output=True, encoding="utf-8", errors="replace"
    )
    if result.returncode != 0:
        err = (result.stderr or result.stdout).strip().splitlines()
        return page, f"ERROR: {err[-1] if err else 'unknown'}"
    return page, result.stdout.strip()


def parse_pages(spec: str) -> list[int]:
    """Parse '99,100,101' or '99-105' into a list of ints."""
    pages = []
    for part in spec.split(","):
        part = part.strip()
        if "-" in part:
            lo, hi = part.split("-", 1)
            pages.extend(range(int(lo), int(hi) + 1))
        else:
            pages.append(int(part))
    return sorted(set(pages))


def main():
    parser = argparse.ArgumentParser(
        description="Describe multiple PDF pages in parallel (max 4 concurrent)."
    )
    parser.add_argument("--notebook", required=True)
    parser.add_argument("--source",   required=True)
    parser.add_argument("--pages",    required=True,
                        help="Comma-separated or range, e.g. '99,100' or '99-105'")
    parser.add_argument("--page-type", choices=["printed", "pdf"], default="printed")
    args = parser.parse_args()

    pages = parse_pages(args.pages)
    print(f"Describing {len(pages)} pages with up to {MAX_PARALLEL} parallel workers...",
          file=sys.stderr)

    results: dict[int, str] = {}

    with ThreadPoolExecutor(max_workers=MAX_PARALLEL) as pool:
        futures = {
            pool.submit(describe_page, args.notebook, args.source, p, args.page_type): p
            for p in pages
        }
        for future in as_completed(futures):
            page, path = future.result()
            results[page] = path
            status = "OK" if not path.startswith("ERROR") else "FAIL"
            print(f"  [{status}] page {page}: {path}", file=sys.stderr)

    # Print results in page order
    for p in sorted(results):
        print(f"{p}\t{results[p]}")


if __name__ == "__main__":
    main()
