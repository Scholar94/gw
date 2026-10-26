#!/usr/bin/env python3
"""Photo helper: turns your original photos into small, fast, responsive WebP files and prints the HTML to paste.

  python3 build-images.py photo-choir.jpg [photo-2.png ...] [--alt "Youth choir singing at Sunday service"]

For each photo it writes  <name>-480.webp, <name>-960.webp, <name>-1600.webp  (only sizes SMALLER than the original, never enlarged), strips
location/camera data (EXIF) for privacy, fixes phone-rotation, and prints an <img> with srcset, sizes, width/height (no layout shift) and loading=lazy.
Files stay in the project root (flat). Keep originals OUT of the repository (they are large): process, then delete or move them.
Needs: pip install pillow. Write a real description with --alt: it is what blind visitors hear."""
import os, sys
from PIL import Image, ImageOps
WIDTHS = (480, 960, 1600); QUALITY = 78

def make(path, alt='', out_dir=None):
    out_dir = out_dir or os.path.dirname(os.path.abspath(path)); base = os.path.splitext(os.path.basename(path))[0]
    im = ImageOps.exif_transpose(Image.open(path)); im.info.pop('exif', None)                  # honour phone rotation, then drop all metadata
    if im.mode not in ('RGB', 'RGBA'): im = im.convert('RGB')
    w, h = im.size; made = []
    sizes = [x for x in WIDTHS if x < w]; top = min(w, WIDTHS[-1])                                # never enlarge; always include the largest useful size
    if top not in sizes: sizes.append(top)
    for tw in sizes:
        th = round(h * tw / w); name = f'{base}-{tw}.webp'
        im.resize((tw, th), Image.LANCZOS).save(os.path.join(out_dir, name), 'WEBP', quality=QUALITY, method=6); made.append((name, tw, th, os.path.getsize(os.path.join(out_dir, name))))
    big = made[-1]; srcset = ', '.join(f'{n} {tw}w' for n, tw, _, _ in made)
    esc = lambda s: s.replace('&', '&amp;').replace('"', '&quot;').replace('<', '&lt;').replace('>', '&gt;')
    tag = f'<img src="{big[0]}" srcset="{srcset}" sizes="(max-width: 700px) 100vw, 700px" width="{big[1]}" height="{big[2]}" alt="{esc(alt)}" loading="lazy" decoding="async">'
    return made, tag

if __name__ == '__main__':
    a = sys.argv[1:]; alt = ''
    if '--alt' in a: i = a.index('--alt'); alt = a[i + 1]; del a[i:i + 2]
    if not a: print(__doc__); sys.exit(1)
    for p in a:
        made, tag = make(p, alt); print(f'\n{p}: ' + ', '.join(f'{n} ({s // 1024} KB)' for n, _, _, s in made)); print(tag)
        if not alt: print('  ! add --alt "describe the photo": an empty alt hides the picture from screen readers')
