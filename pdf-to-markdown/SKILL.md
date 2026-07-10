---
name: pdf-to-markdown
description: Convert PDF files to Markdown (.md) format. Triggers on "pdf to markdown", "convert pdf to md", "pdf2md", "convert pdf", or when a .pdf file needs to be converted to text/markdown.
---

# PDF to Markdown Converter

Converts PDF files to clean Markdown using `pymupdf4llm` (best quality) with `pdfplumber` as fallback.

## Prerequisites

Install on first use:
```bash
pip install pymupdf4llm
```

`pdfplumber` and `pymupdf` are already available as fallback.

## Workflow

### Step 1 — Identify input

- User provides a PDF path (absolute or relative)
- Resolve to absolute path
- Determine output path: same directory, same stem, `.md` extension (unless user specifies otherwise)

### Step 2 — Convert using Python script

Run this script via Bash:

```python
import sys, pathlib

pdf_path = pathlib.Path(sys.argv[1]).resolve()
out_path = pathlib.Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else pdf_path.with_suffix('.md')

try:
    import pymupdf4llm
    md = pymupdf4llm.to_markdown(str(pdf_path))
    out_path.write_text(md, encoding='utf-8')
    print(f"[pymupdf4llm] Saved: {out_path}")
except ImportError:
    import pdfplumber
    lines = []
    with pdfplumber.open(str(pdf_path)) as pdf:
        for i, page in enumerate(pdf.pages, 1):
            text = page.extract_text() or ''
            lines.append(f'## Page {i}\n\n{text.strip()}\n')
    out_path.write_text('\n'.join(lines), encoding='utf-8')
    print(f"[pdfplumber] Saved: {out_path}")
```

Save script to a temp file and run:
```bash
python C:\Users\xxiang\.claude\temp\pdf2md_run.py "<pdf_path>" "<out_path>"
```

Or inline with `-c` for short runs.

### Step 3 — Install pymupdf4llm if missing

If `ImportError` on pymupdf4llm, install it first:
```bash
pip install pymupdf4llm
```
Then re-run conversion.

### Step 4 — Report result

Tell user:
- Output file path
- Which backend was used (pymupdf4llm or pdfplumber)
- Approximate page count / file size

## Tips

- `pymupdf4llm` preserves tables, headings, and layout far better than pdfplumber
- For scanned PDFs (image-only), neither library extracts text — tell user OCR is needed (e.g. `ocrmypdf` first)
- For multi-PDF batch: loop over all `.pdf` files in a directory
- If user wants stdout instead of file, skip `write_text` and print md directly

## Batch Mode

When user says "convert all PDFs in a folder":
```python
import pathlib, pymupdf4llm
folder = pathlib.Path(r"<folder>")
for pdf in folder.glob("*.pdf"):
    md = pymupdf4llm.to_markdown(str(pdf))
    pdf.with_suffix('.md').write_text(md, encoding='utf-8')
    print(f"Done: {pdf.name}")
```
