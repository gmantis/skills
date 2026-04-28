---
name: latex-to-pdf
description: Compile LaTeX .tex files to PDF using pdflatex. Triggers on "compile latex", "latex to pdf", "generate pdf from tex", "build pdf", or when a .tex file needs compilation.
---

# LaTeX to PDF

Compile `.tex` files to `.pdf` using `pdflatex` (MiKTeX).

## Prerequisites

- MiKTeX installed: `winget install MiKTeX.MiKTeX`
- `pdflatex` on PATH (MiKTeX adds it automatically after install; may need shell restart)
- On macOS: `brew install --cask mactex` or `brew install basictex`

## Usage

Given a `.tex` file path (absolute or relative), compile it to PDF.

## Steps

### 1. Locate pdflatex

```bash
# Windows
where pdflatex 2>/dev/null || echo "C:/Users/$USER/AppData/Local/Programs/MiKTeX/miktex/bin/x64/pdflatex.exe"

# macOS
which pdflatex || echo "/Library/TeX/texbin/pdflatex"
```

If not found, tell the user to install MiKTeX (`winget install MiKTeX.MiKTeX`) or MacTeX.

### 2. Compile

Run `pdflatex` twice (for cross-references) with output in the same directory as the source:

```bash
TEXFILE="path/to/file.tex"
OUTDIR="$(dirname "$TEXFILE")"

pdflatex -interaction=nonstopmode -output-directory="$OUTDIR" "$TEXFILE"
pdflatex -interaction=nonstopmode -output-directory="$OUTDIR" "$TEXFILE"
```

Flags:
- `-interaction=nonstopmode` — don't pause on errors
- `-output-directory` — keep PDF next to the .tex source

### 3. Clean up auxiliary files

```bash
STEM="${TEXFILE%.tex}"
rm -f "${STEM}.aux" "${STEM}.log" "${STEM}.out" "${STEM}.toc"
```

### 4. Verify

```bash
ls -la "${STEM}.pdf"
```

Report the PDF path and file size to the user.

## Error handling

- If pdflatex fails, show the last 20 lines of the `.log` file
- Common fixes: missing packages → MiKTeX auto-installs on first use (may prompt)
- If a package is missing and MiKTeX doesn't auto-install: `miktex-console --admin` → Packages → search and install

## Cross-platform notes

| Platform | Install | pdflatex location |
|----------|---------|-------------------|
| Windows | `winget install MiKTeX.MiKTeX` | `%LOCALAPPDATA%\Programs\MiKTeX\miktex\bin\x64\pdflatex.exe` |
| macOS | `brew install --cask mactex` | `/Library/TeX/texbin/pdflatex` |
| Linux | `sudo apt install texlive-full` | `/usr/bin/pdflatex` |
