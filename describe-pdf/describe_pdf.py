#!/usr/bin/env python3
"""
describe-pdf: Extract a structured JSON description of a PDF page via NotebookLM.

Usage:
  python describe_pdf.py --notebook NAME --source NAME --page N [--page-type printed|pdf]

Output:
  Prints the path to the saved JSON file. Reads from cache if available.
"""

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

# ── Config ────────────────────────────────────────────────────────────────────

CACHE_DIR = Path(".pdf-descriptions")

EXTRACTION_PROMPT = """\
You are analyzing the source "{source}" in this NotebookLM notebook.

Look at {page_ref}. Describe ALL content on that page as structured JSON.

## Rules

1. Return ONLY valid JSON — no markdown fences, no explanation, nothing else.
2. Describe the page faithfully in reading order (top to bottom, left to right).
3. Use "tick" for ✓ marks and "cross" for ✗ marks in table cells.
4. For diagrams and illustrations: write a clear text description of what is drawn, including any labels.
5. Capture BOTH the printed page number (as shown in the book) AND identify which PDF page it likely is.
6. If you cannot find the page, return the schema with an empty content array and a "note" field explaining.

## Content block types

- "heading": section title or chapter header  (add "level": 1 or 2)
- "text": prose paragraph
- "question": exam question with sub-fields (see schema)
- "diagram": visual/illustration described in text
- "table": data table with headers and rows
- "list": bullet or numbered list
- "image": photo or non-diagram visual

## JSON schema to return

{{
  "ref": {{
    "notebook": "<notebook name>",
    "source": "{source}",
    "page_printed": <integer or null>,
    "page_pdf": <integer or null>
  }},
  "content": [
    {{ "type": "heading", "level": 1, "text": "..." }},
    {{ "type": "text", "text": "..." }},
    {{
      "type": "question",
      "number": 1,
      "text": "...",
      "question_type": "MCQ | open-ended | fill-in | structured",
      "marks": <integer or null>,
      "options": [
        {{ "label": "(1)", "caption": "...", "description": "..." }},
        {{ "label": "(2)", "text": "..." }}
      ],
      "answer_lines": <integer or null>,
      "process_skill": "... or null",
      "student_answer": "... or null"
    }},
    {{ "type": "diagram", "description": "..." }},
    {{
      "type": "table",
      "caption": "... or null",
      "headers": ["col1", "col2"],
      "rows": [["val1", "val2"]]
    }},
    {{ "type": "list", "style": "bullet | numbered", "items": ["...", "..."] }}
  ]
}}

The page to describe: {page_ref}
Source file: {source}
"""


# ── NotebookLM helpers ────────────────────────────────────────────────────────

def nlm_run(*args) -> subprocess.CompletedProcess:
    """Run a notebooklm command, capturing output as utf-8."""
    return subprocess.run(
        ["notebooklm", *args],
        capture_output=True, encoding="utf-8", errors="replace"
    )


def find_notebook_id(notebook_name: str) -> str:
    """Find notebook ID by name (case-insensitive, partial match ok)."""
    result = nlm_run("list", "--json")
    if result.returncode != 0:
        err = result.stderr or result.stdout
        if "Authentication" in err or "login" in err.lower():
            print("NotebookLM authentication expired. Run: notebooklm login", file=sys.stderr)
        else:
            print(f"notebooklm list failed: {err}", file=sys.stderr)
        sys.exit(1)

    try:
        data = json.loads(result.stdout)
    except json.JSONDecodeError:
        print(f"Could not parse notebooklm list output: {result.stdout[:200]}", file=sys.stderr)
        sys.exit(1)

    name_lower = notebook_name.lower()
    # Exact match first
    for nb in data["notebooks"]:
        if nb["title"].lower() == name_lower:
            return nb["id"]
    # Partial match
    for nb in data["notebooks"]:
        if name_lower in nb["title"].lower():
            return nb["id"]

    available = [nb["title"] for nb in data["notebooks"]]
    print(f"Notebook '{notebook_name}' not found.\nAvailable: {available}", file=sys.stderr)
    sys.exit(1)


def set_context(notebook_id: str):
    nlm_run("use", notebook_id)


def ask_notebooklm(prompt: str) -> str:
    """Ask NotebookLM and return the answer text."""
    result = nlm_run("ask", prompt, "--json")
    if result.returncode != 0:
        err = result.stderr or result.stdout
        if "Authentication" in err or "login" in err.lower():
            print("NotebookLM authentication expired. Run: notebooklm login", file=sys.stderr)
            sys.exit(1)
        # Rate limit or transient error — return raw for caller to handle
        return result.stdout + result.stderr

    try:
        envelope = json.loads(result.stdout)
        return envelope.get("answer", result.stdout)
    except json.JSONDecodeError:
        return result.stdout


# ── JSON extraction ───────────────────────────────────────────────────────────

def extract_json(text: str) -> dict:
    """Parse JSON from NotebookLM response, stripping any markdown fences."""
    text = text.strip()

    # Strip "Answer:" prefix if present
    if text.startswith("Answer:"):
        text = text[7:].strip()

    # Strip markdown fences
    if "```json" in text:
        text = text.split("```json", 1)[1]
        text = text.rsplit("```", 1)[0]
    elif "```" in text:
        text = text.split("```", 1)[1]
        text = text.rsplit("```", 1)[0]

    return json.loads(text.strip())


# ── Cache helpers ─────────────────────────────────────────────────────────────

def _safe(name: str) -> str:
    """Sanitise a string for use as a directory name."""
    return re.sub(r'[^\w\-]', '_', name).strip('_')


def cache_path(notebook: str, source: str, page: int, page_type: str) -> Path:
    src_stem = Path(source).stem  # drop .pdf
    return (CACHE_DIR / _safe(notebook) / _safe(src_stem)
            / f"page-{page_type}-{page}.json")


def write_cache(data: dict, primary_path: Path):
    """Write JSON to primary path and create an alias for the other page numbering."""
    primary_path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(data, indent=2, ensure_ascii=False)
    primary_path.write_text(text, encoding="utf-8")

    # If both page numbers are known, write the alternate path too
    ref = data.get("ref", {})
    pp = ref.get("page_printed")
    pf = ref.get("page_pdf")

    if pp and pf:
        for ptype, pnum in [("printed", pp), ("pdf", pf)]:
            alt = primary_path.parent / f"page-{ptype}-{pnum}.json"
            if not alt.exists():
                alt.write_text(text, encoding="utf-8")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Describe a PDF page from NotebookLM as structured JSON."
    )
    parser.add_argument("--notebook", required=True, help="NotebookLM notebook name")
    parser.add_argument("--source",   required=True, help="PDF source name within the notebook")
    parser.add_argument("--page",     required=True, type=int, help="Page number")
    parser.add_argument(
        "--page-type",
        choices=["printed", "pdf"],
        default="printed",
        help="'printed' = page number shown in book (default); 'pdf' = page index from 1"
    )
    args = parser.parse_args()

    # Check cache first
    primary = cache_path(args.notebook, args.source, args.page, args.page_type)
    if primary.exists():
        print(str(primary))
        return

    # Build page reference string for the prompt
    if args.page_type == "printed":
        page_ref = (
            f"the page with printed page number {args.page} "
            f"(the number shown at the bottom or top of the page in the book)"
        )
    else:
        page_ref = (
            f"PDF page {args.page} counting from 1 "
            f"(i.e. the {args.page}{'st' if args.page == 1 else 'nd' if args.page == 2 else 'rd' if args.page == 3 else 'th'} page of the PDF file)"
        )

    prompt = EXTRACTION_PROMPT.format(
        source=args.source,
        page_ref=page_ref,
    )

    # Find notebook and set context
    notebook_id = find_notebook_id(args.notebook)
    set_context(notebook_id)

    # Ask NotebookLM
    print(f"Querying NotebookLM for {args.notebook} / {args.source} / page {args.page} ({args.page_type})...",
          file=sys.stderr)
    response = ask_notebooklm(prompt)

    # Parse JSON
    try:
        data = extract_json(response)
    except (json.JSONDecodeError, ValueError) as e:
        # Save raw response for debugging
        raw_path = primary.with_suffix(".raw.txt")
        raw_path.parent.mkdir(parents=True, exist_ok=True)
        raw_path.write_text(response, encoding="utf-8")
        print(f"Failed to parse JSON response: {e}", file=sys.stderr)
        print(f"Raw response saved to: {raw_path}", file=sys.stderr)
        sys.exit(1)

    # Inject ref if NotebookLM didn't fill it in properly
    if "ref" not in data:
        data["ref"] = {}
    data["ref"].setdefault("notebook", args.notebook)
    data["ref"].setdefault("source", args.source)
    if args.page_type == "printed":
        data["ref"].setdefault("page_printed", args.page)
    else:
        data["ref"].setdefault("page_pdf", args.page)

    # Save and print path
    write_cache(data, primary)
    print(str(primary))


if __name__ == "__main__":
    main()
