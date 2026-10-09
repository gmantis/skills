"""Crop a region of a page image for use in a lesson ("here's what you wrote").

Usage: python -I crop.py <page.png> <out.jpg> <x0> <y0> <x1> <y1> [--width 900]
Coordinates are fractions of the page (0-1) if all <= 1, otherwise pixels.
"""
import sys
from PIL import Image

args = sys.argv[1:]
width = 900
if "--width" in args:
    i = args.index("--width"); width = int(args[i + 1]); del args[i:i + 2]
src, out, *box = args
box = [float(v) for v in box]
im = Image.open(src)
if all(v <= 1 for v in box):
    box = [box[0] * im.width, box[1] * im.height, box[2] * im.width, box[3] * im.height]
im = im.crop(tuple(int(v) for v in box)).convert("RGB")
im = im.resize((width, int(im.height * width / im.width)))
im.save(out, quality=82)
print(out, im.size)
