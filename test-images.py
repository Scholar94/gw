#!/usr/bin/env python3
"""Tests for build-images.py (run: python3 test-images.py)."""
import os, sys, tempfile
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import importlib; B = importlib.import_module('build-images')
fails = 0
def check(name, ok, info=''):
    global fails; print(('  ok  ' if ok else 'FAIL  ') + name, '' if ok else info); fails += 0 if ok else 1
with tempfile.TemporaryDirectory() as d:
    p = os.path.join(d, 'big.jpg'); im = Image.new('RGB', (3000, 2000), (200, 120, 40)); ex = Image.Exif(); ex[0x0112] = 6; ex[0x010F] = 'PhoneMaker'; im.save(p, 'JPEG', exif=ex)
    made, tag = B.make(p, 'Youth choir <singing> "live"', d)
    check('three sizes are produced for a large photo', [m[1] for m in made] == [480, 960, 1600], made)
    check('EXIF rotation (6 = 90 degrees) is applied: landscape becomes portrait', Image.open(os.path.join(d, 'big-1600.webp')).size == (1600 * 2000 // 3000 + 1, 1600) or Image.open(os.path.join(d, 'big-1600.webp')).size[0] < Image.open(os.path.join(d, 'big-1600.webp')).size[1], Image.open(os.path.join(d, 'big-1600.webp')).size)
    check('output files carry no EXIF / camera data', not Image.open(os.path.join(d, 'big-960.webp')).getexif() and b'PhoneMaker' not in open(os.path.join(d, 'big-960.webp'), 'rb').read())
    check('web files are far smaller than the original', all(m[3] < os.path.getsize(p) / 5 for m in made))
    check('the tag has srcset, sizes, width+height, lazy loading and an escaped alt', all(x in tag for x in ['srcset="', 'sizes="', 'width="', 'height="', 'loading="lazy"', 'alt="Youth choir &lt;singing&gt; &quot;live&quot;"']), tag)
    s = os.path.join(d, 'small.png'); Image.new('RGB', (400, 300), (10, 20, 30)).save(s); m2, t2 = B.make(s, 'x', d)
    check('small photos are never enlarged (one file at the original width)', [m[1] for m in m2] == [400], m2)
    a = os.path.join(d, 'alpha.png'); Image.new('RGBA', (800, 600), (0, 0, 0, 0)).save(a); m3, _ = B.make(a, 'x', d); check('transparent PNGs keep working, and an in-between width (800) gets 480 + 800 (never 960 enlarged)', [m[1] for m in m3] == [480, 800] and Image.open(os.path.join(d, m3[-1][0])).size[0] == 800, m3)
print('FAILED' if fails else 'All image-tool checks passed.'); sys.exit(1 if fails else 0)
