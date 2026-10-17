#!/usr/bin/env python3
"""Subsets Font Awesome Free 6.5.x to ONLY the icons the site uses (saves ~300 KB).
Run after adding a new icon:  npm i && python3 build-icons.py
Needs: pip install fonttools brotli"""
import re, glob, pathlib, subprocess, shutil, sys
ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT/'node_modules/@fortawesome/fontawesome-free'
OUT = ROOT
EXTRA = {'fa-video', 'fa-image'}   # built dynamically in gallery.html (template string)

used = set(EXTRA)
for f in glob.glob(str(ROOT/'*.html')) + glob.glob(str(ROOT/'*.js')) + [str(ROOT/'style.css'), str(ROOT/'pages.css'), str(ROOT/'admin-style.css')]:
    used |= set(re.findall(r'\bfa-([a-z0-9-]+)', pathlib.Path(f).read_text(encoding='utf-8', errors='ignore'))) if False else {'fa-'+n for n in re.findall(r'\bfa-([a-z0-9-]+)', pathlib.Path(f).read_text(encoding='utf-8', errors='ignore'))}
css = (SRC/'css/all.min.css').read_text(encoding='utf-8')
ICON = re.compile(r'^((?:\.fa-[\w-]+:before,?)+)\{content:"([^"]*)"\}$')
out, codes, kept, dropped = [], set(), 0, 0
# split top-level rules while respecting nested blocks (@media/@keyframes/@font-face)
depth, buf, rules = 0, '', []
for ch in css:
    buf += ch
    if ch == '{': depth += 1
    elif ch == '}':
        depth -= 1
        if depth == 0: rules.append(buf); buf = ''
if buf.strip(): rules.append(buf)
for r in rules:
    m = ICON.match(r.strip())
    if not m: out.append(r); continue
    sels = [s for s in m.group(1).split(',') if s]
    keep = [s for s in sels if s[1:].replace(':before', '') in used]
    if not keep: dropped += 1; continue
    kept += 1
    for c in re.findall(r'\\([0-9a-fA-F]+)', m.group(2)): codes.add(int(c, 16))
    out.append(','.join(keep) + '{content:"' + m.group(2) + '"}')
trimmed = ''.join(out)
trimmed = re.sub(r',\s*url\([^)]*\.ttf\)\s*format\("truetype"\)', '', trimmed)
for old, new in {'fa-solid-900': 'icons-solid', 'fa-regular-400': 'icons-regular', 'fa-brands-400': 'icons-brands', 'fa-v4compatibility': 'icons-v4compat'}.items():
    trimmed = trimmed.replace('../webfonts/' + old + '.woff2', new + '.woff2')   # flat layout: fonts sit next to the stylesheet
(OUT/'icons.css').write_text(trimmed, encoding='utf-8')
uni = ','.join('U+%X' % c for c in sorted(codes))
for name, out in [('fa-solid-900', 'icons-solid'), ('fa-regular-400', 'icons-regular'), ('fa-brands-400', 'icons-brands')]:
    subprocess.check_call([sys.executable, '-m', 'fontTools.subset', str(SRC/f'webfonts/{name}.woff2'), f'--unicodes={uni}', '--flavor=woff2', '--layout-features=', '--no-hinting', '--desubroutinize', f'--output-file={OUT}/{out}.woff2'])
shutil.copy(SRC/'webfonts/fa-v4compatibility.woff2', OUT/'icons-v4compat.woff2')
print(f'icons kept: {kept}, dropped rules: {dropped}, codepoints: {len(codes)}, css: {len(trimmed)//1024} KB')
