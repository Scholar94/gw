#!/usr/bin/env python3
"""Translation workflow (no folders, no build step for translators).

  python3 build-i18n.py extract              scans the public pages (and the visitor-facing scripts) for short English UI strings and writes
                                             i18n-translators.csv  (English, French, Yoruba, Igbo, Hausa). Existing translations are KEPT.
  python3 build-i18n.py apply [--reviewed fr,yo]
                                             reads the CSV and writes i18n-fr.json, i18n-yo.json, i18n-ig.json, i18n-ha.json (a language file is only
                                             written when it has at least one translation). --reviewed marks languages a native speaker has signed off.

Only EXACT matches of a whole text node are replaced on the site, so long paragraphs stay in English until they are translated deliberately
(use the page-translate widget for a machine-translated reading aid, never for theology). A language appears in the switcher only when it is listed in
config.js > i18n.enabled."""
import csv, glob, html, json, os, re, sys
ROOT = os.path.dirname(os.path.abspath(__file__)); CSV = os.path.join(ROOT, 'i18n-translators.csv')
LANGS = [('fr', 'Français'), ('yo', 'Yorùbá'), ('ig', 'Igbo'), ('ha', 'Hausa')]
# Legal pages are never machine/UI-translated: they need a professional translator and legal review.
SKIP_FILES = re.compile(r'^(admin-|offline|privacy|terms)')
MAXLEN = 60

def strings():
    out = set()
    for f in sorted(glob.glob(os.path.join(ROOT, '*.html'))):
        if SKIP_FILES.match(os.path.basename(f)): continue
        h = open(f, encoding='utf-8').read(); body = h[h.find('<body'):] if '<body' in h else h
        body = re.sub(r'<(script|style|textarea)\b.*?</\1>', '', body, flags=re.S | re.I); body = re.sub(r'<!--.*?-->', '', body, flags=re.S)
        for m in re.finditer(r'>([^<>]+)<', body):
            t = re.sub(r'\s+', ' ', html.unescape(m.group(1))).strip()
            if 2 <= len(t) <= MAXLEN and re.search(r'[A-Za-z]{2}', t) and not re.search(r'[{}$“”"]|^\W+$|^\d+\.|—|\d{4}', t) and 'http' not in t and not t.endswith('.') or (len(t) < 30 and t.endswith('.') and not re.search(r'[“”"]', t)): out.add(t)
        for m in re.finditer(r'\b(?:aria-label|title|placeholder|alt)="([^"]{2,%d})"' % MAXLEN, body):
            t = html.unescape(m.group(1)).strip()
            if re.search(r'[A-Za-z]{2}', t) and not re.search(r'[{}$]', t): out.add(t)
    return sorted(out, key=lambda s: (s.lower(), s))

def read_csv():
    if not os.path.exists(CSV): return {}
    with open(CSV, encoding='utf-8', newline='') as fh: return {r['English']: r for r in csv.DictReader(fh)}

def extract():
    old = read_csv(); keys = strings()
    with open(CSV, 'w', encoding='utf-8', newline='') as fh:
        w = csv.writer(fh); w.writerow(['English'] + [n for _, n in LANGS])
        for k in keys: o = old.get(k, {}); w.writerow([k] + [o.get(n, '') for _, n in LANGS])
    print(f'{len(keys)} strings -> i18n-translators.csv (open in Excel/Google Sheets; fill a column; keep punctuation and numbers)')

def apply(reviewed):
    rows = read_csv(); done = []
    for code, name in LANGS:
        tr = {k: r[name].strip() for k, r in rows.items() if r.get(name, '').strip()}
        if not tr: continue
        json.dump({'_meta': {'code': code, 'name': name, 'reviewed': code in reviewed}, 'strings': tr}, open(os.path.join(ROOT, f'i18n-{code}.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1, sort_keys=True)
        done.append(f'{code}: {len(tr)}/{len(rows)}' + (' (reviewed)' if code in reviewed else ' (DRAFT: needs native review)'))
    print('wrote', ', '.join(done) or 'nothing (no translations in the CSV)')

if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    if cmd == 'extract': extract()
    elif cmd == 'apply': apply(set((sys.argv[sys.argv.index('--reviewed') + 1] if '--reviewed' in sys.argv else '').split(',')) - {''})
    else: print(__doc__)
