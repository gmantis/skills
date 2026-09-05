#!/usr/bin/env python3
"""Extract a book (EPUB or PDF) into ordered plain-text chunks with a position index.

Usage:
    python book_index.py <book-file> <out-dir>

Writes:
    <out-dir>/NNN_<name>.txt   one file per spine document (epub) or page block (pdf)
    <out-dir>/index.tsv        seq \t file \t chars \t start_pct \t end_pct
    <out-dir>/SOURCE.txt       absolute path of the source book

The percentages are cumulative-character based, which is how most readers
(Kindle, Apple Books, Calibre) compute "% through the book". They are close
enough to bound a spoiler-safe search.
"""
import os
import re
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass
import zipfile
from html.parser import HTMLParser
from urllib.parse import unquote


class Strip(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out = []
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self.skip += 1
        elif tag in ("p", "div", "br", "h1", "h2", "h3", "h4", "li", "tr", "blockquote"):
            self.out.append("\n")

    def handle_endtag(self, tag):
        if tag in ("script", "style") and self.skip:
            self.skip -= 1
        elif tag in ("p", "div", "h1", "h2", "h3", "h4", "li", "tr", "blockquote"):
            self.out.append("\n")

    def handle_data(self, data):
        if not self.skip:
            self.out.append(data)

    def text(self):
        t = "".join(self.out)
        t = re.sub(r"[ \t\r\f\v]+", " ", t)
        t = re.sub(r"\n[ \t]*", "\n", t)
        t = re.sub(r"\n{3,}", "\n\n", t)
        return t.strip()


def strip_html(html):
    p = Strip()
    try:
        p.feed(html)
    except Exception:
        pass
    return p.text()


def epub_chunks(path):
    """Return [(name, text)] in spine (reading) order."""
    with zipfile.ZipFile(path) as z:
        names = z.namelist()
        # locate the OPF via META-INF/container.xml
        opf_path = None
        if "META-INF/container.xml" in names:
            c = z.read("META-INF/container.xml").decode("utf-8", "replace")
            m = re.search(r'full-path="([^"]+)"', c)
            if m:
                opf_path = m.group(1)
        if opf_path is None:
            opf_path = next((n for n in names if n.lower().endswith(".opf")), None)
        if opf_path is None:
            raise SystemExit("No OPF found; is this a valid EPUB?")

        opf = z.read(opf_path).decode("utf-8", "replace")
        base = os.path.dirname(opf_path)

        # id -> href
        manifest = {}
        for mm in re.finditer(r"<item\b[^>]*>", opf):
            tag = mm.group(0)
            i = re.search(r'\bid="([^"]+)"', tag)
            h = re.search(r'\bhref="([^"]+)"', tag)
            if i and h:
                manifest[i.group(1)] = unquote(h.group(1))

        order = [m.group(1) for m in re.finditer(r'<itemref\b[^>]*idref="([^"]+)"', opf)]
        if not order:
            order = list(manifest)

        chunks = []
        for idref in order:
            href = manifest.get(idref, idref)
            full = os.path.normpath(os.path.join(base, href)).replace("\\", "/")
            if full not in names:
                cand = next((n for n in names if n.endswith("/" + href) or n == href), None)
                if cand is None:
                    continue
                full = cand
            if not re.search(r"\.x?html?$", full, re.I):
                continue
            try:
                txt = strip_html(z.read(full).decode("utf-8", "replace"))
            except KeyError:
                continue
            chunks.append((os.path.splitext(os.path.basename(full))[0], txt))
        return chunks


def pdf_chunks(path, pages_per_chunk=5):
    try:
        from pypdf import PdfReader
    except ImportError:
        try:
            from PyPDF2 import PdfReader  # type: ignore
        except ImportError:
            raise SystemExit("PDF support needs pypdf:  pip install pypdf")
    reader = PdfReader(path)
    chunks = []
    buf, first = [], 1
    for n, page in enumerate(reader.pages, 1):
        buf.append(page.extract_text() or "")
        if len(buf) >= pages_per_chunk:
            chunks.append((f"p{first:04d}-{n:04d}", "\n".join(buf).strip()))
            buf, first = [], n + 1
    if buf:
        chunks.append((f"p{first:04d}-{len(reader.pages):04d}", "\n".join(buf).strip()))
    return chunks


def main():
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    src, out = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2])
    os.makedirs(out, exist_ok=True)

    ext = os.path.splitext(src)[1].lower()
    if ext == ".epub":
        chunks = epub_chunks(src)
    elif ext == ".pdf":
        chunks = pdf_chunks(src)
    else:
        raise SystemExit(f"Unsupported book format: {ext} (want .epub or .pdf)")

    if not chunks:
        raise SystemExit("Extracted no text from the book.")

    total = sum(len(t) for _, t in chunks) or 1
    rows, cum = [], 0
    for i, (name, txt) in enumerate(chunks, 1):
        start = cum * 100.0 / total
        cum += len(txt)
        end = cum * 100.0 / total
        fn = f"{i:03d}_{re.sub(r'[^A-Za-z0-9_.-]', '_', name)}.txt"
        with open(os.path.join(out, fn), "w", encoding="utf-8") as f:
            f.write(txt)
        rows.append((i, fn, len(txt), start, end))

    with open(os.path.join(out, "index.tsv"), "w", encoding="utf-8") as f:
        f.write("seq\tfile\tchars\tstart_pct\tend_pct\n")
        for i, fn, n, s, e in rows:
            f.write(f"{i}\t{fn}\t{n}\t{s:.1f}\t{e:.1f}\n")

    with open(os.path.join(out, "SOURCE.txt"), "w", encoding="utf-8") as f:
        f.write(src + "\n")

    print(f"{len(rows)} chunks, {total} chars -> {out}")
    for i, fn, n, s, e in rows:
        print(f"{i:3d}  {s:5.1f}%-{e:5.1f}%  {fn}")


if __name__ == "__main__":
    main()
