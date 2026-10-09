"""Render PDF pages to PNG, optionally rotating sideways scans upright.

Usage: python -I render_pages.py <pdf> <out_dir> [--zoom 2.5] [--rotate 2=90,3=90]
  --rotate  page=degrees (clockwise) for pages scanned sideways. Look at the first render, then re-run.
Prints one line per page: path, size, and how many characters of text the PDF layer has
(Adobe Scan adds an OCR layer; it is often poor on handwriting, so read the image).
"""
import os, sys
import pymupdf

args = sys.argv[1:]
zoom, rot = 2.5, {}
if "--zoom" in args:
    i = args.index("--zoom"); zoom = float(args[i + 1]); del args[i:i + 2]
if "--rotate" in args:
    i = args.index("--rotate"); rot = {int(k): int(v) for k, v in (kv.split("=") for kv in args[i + 1].split(","))}; del args[i:i + 2]
pdf, out = args
os.makedirs(out, exist_ok=True)
doc = pymupdf.open(pdf)
for n, pg in enumerate(doc, 1):
    if n in rot:
        pg.set_rotation((pg.rotation + rot[n]) % 360)
    pix = pg.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom))
    path = os.path.join(out, f"p{n:02d}.png")
    pix.save(path)
    print(path, pix.width, pix.height, "text_chars=", len(pg.get_text()))
