---
name: epub-to-markdown
description: Convert EPUB e-book files to Markdown (.md) format. Triggers on "epub to markdown", "convert epub to md", "epub2md", "convert ebook to markdown", or when an .epub file needs to be converted.
---

# EPUB to Markdown Converter

Converts EPUB e-books to Markdown format, preserving headings, links, bold/italic text, and chapter structure separated by `---` dividers.

**Default:** images are stripped. Pass `--images` to extract them to a sibling folder.

## Prerequisites

- Python 3 installed (`python --version`)
- `ebooklib` and `html2text` packages (installed automatically if missing)

## How to Use

```
Convert my-book.epub to markdown           # images stripped (default)
Convert my-book.epub to markdown --images  # extract images to my-book-images/
```

## Installation

```bash
pip install ebooklib html2text -q
```

## Conversion Script

```python
import ebooklib
from ebooklib import epub
import html2text
import os, re, sys, zipfile, shutil

def epub_to_markdown(epub_path, output_path=None, extract_images=False):
    book = epub.read_epub(epub_path)
    base = os.path.splitext(epub_path)[0]

    if output_path is None:
        output_path = base + '.md'

    h = html2text.HTML2Text()
    h.ignore_links = False
    h.ignore_images = not extract_images
    h.body_width = 0  # no line wrapping

    # Extract images from the EPUB zip into a sibling folder
    img_map = {}  # original basename -> new relative path
    if extract_images:
        images_dir = base + '-images'
        os.makedirs(images_dir, exist_ok=True)
        with zipfile.ZipFile(epub_path, 'r') as z:
            for name in z.namelist():
                if re.search(r'\.(png|jpe?g|gif|svg|webp)$', name, re.I):
                    filename = os.path.basename(name)
                    dest = os.path.join(images_dir, filename)
                    with z.open(name) as src, open(dest, 'wb') as dst:
                        shutil.copyfileobj(src, dst)
                    img_map[filename] = os.path.join(os.path.basename(images_dir), filename)

    parts = []
    for item in book.get_items():
        if item.get_type() == ebooklib.ITEM_DOCUMENT:
            content = item.get_content().decode('utf-8', errors='replace')
            md = h.handle(content)
            # Rewrite broken EPUB-internal image paths to extracted folder
            if extract_images and img_map:
                md = re.sub(
                    r'!\[([^\]]*)\]\(([^)]+)\)',
                    lambda m: f'![{m.group(1)}]({img_map.get(os.path.basename(m.group(2)), m.group(2))})',
                    md
                )
            if md.strip():
                parts.append(md)

    with open(output_path, 'w', encoding='utf-8') as f:
        f.write('\n\n---\n\n'.join(parts))

    return output_path

extract = '--images' in sys.argv
epub_path = next(a for a in sys.argv[1:] if not a.startswith('--'))
out = epub_to_markdown(epub_path, extract_images=extract)
print(f"Converted: {epub_path} → {out} ({os.path.getsize(out):,} bytes)")
```

Run as:
```bash
python convert.py my-book.epub             # strip images
python convert.py my-book.epub --images    # extract images
```

## Output

| Mode | Output |
|---|---|
| Default | `my-book.md` — no image tags |
| `--images` | `my-book.md` + `my-book-images/` folder with all images; paths rewritten to match |

## Troubleshooting

**`ModuleNotFoundError: ebooklib`** — Run `pip install ebooklib html2text`

**Garbled characters** — Change `errors='replace'` to `errors='ignore'`

**Empty output** — Some EPUBs use non-standard item types; inspect with `for item in book.get_items(): print(item.get_type())`
