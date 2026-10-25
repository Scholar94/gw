#!/usr/bin/env python3
"""Builds bible-kjv.json and bible-web.json (compact, one file per translation, loaded on demand by the scripture reader).
Sources (both public domain texts):
  KJV  https://github.com/aruljohn/Bible-kjv            (MIT-licensed JSON of the public-domain King James Version)
  WEB  https://github.com/TehShrike/world-english-bible (JSON of the public-domain World English Bible)
Usage: python3 build-bible.py <Bible-kjv dir> <world-english-bible dir>
Format: {"t":"KJV","n":"King James Version","b":{"Genesis":[["v1","v2",...],[...chapter 2...]], ...}}  (verse N = index N-1)
NOTE: the KJV is public domain in the US and most places, but in the United Kingdom it is under a perpetual Crown patent: fine for a Nigerian site, mention it if you serve UK audiences commercially."""
import json, re, sys, os
BOOKS = ["Genesis","Exodus","Leviticus","Numbers","Deuteronomy","Joshua","Judges","Ruth","1 Samuel","2 Samuel","1 Kings","2 Kings","1 Chronicles","2 Chronicles","Ezra","Nehemiah","Esther","Job","Psalms","Proverbs","Ecclesiastes","Song of Solomon","Isaiah","Jeremiah","Lamentations","Ezekiel","Daniel","Hosea","Joel","Amos","Obadiah","Jonah","Micah","Nahum","Habakkuk","Zephaniah","Haggai","Zechariah","Malachi","Matthew","Mark","Luke","John","Acts","Romans","1 Corinthians","2 Corinthians","Galatians","Ephesians","Philippians","Colossians","1 Thessalonians","2 Thessalonians","1 Timothy","2 Timothy","Titus","Philemon","Hebrews","James","1 Peter","2 Peter","1 John","2 John","3 John","Jude","Revelation"]
tidy = lambda s: re.sub(r'\s+', ' ', s.replace('#', '').replace('¶', '')).strip()

def kjv(d):
    out = {}
    for b in BOOKS:
        j = json.load(open(os.path.join(d, b.replace(' ', '') + '.json'), encoding='utf-8'))
        out[b] = [[tidy(v['text']) for v in sorted(c['verses'], key=lambda v: int(v['verse']))] for c in sorted(j['chapters'], key=lambda c: int(c['chapter']))]
    return out

def web(d):
    out = {}
    for b in BOOKS:
        j = json.load(open(os.path.join(d, 'json', b.replace(' ', '').lower() + '.json'), encoding='utf-8')); ch = {}
        for e in j:
            if e.get('type') in ('paragraph text', 'line text') and 'chapterNumber' in e:
                ch.setdefault(e['chapterNumber'], {}).setdefault(e['verseNumber'], []).append(e['value'])
        out[b] = [[tidy(' '.join(ch[c].get(v, []))) for v in range(1, max(ch[c]) + 1)] for c in sorted(ch)]
    return out

for name, long, fn, src in (('kjv', 'King James Version', kjv, sys.argv[1]), ('web', 'World English Bible', web, sys.argv[2])):
    data = fn(src); n = sum(len(c) for b in data.values() for c in b)
    json.dump({'t': name.upper(), 'n': long, 'b': data}, open(f'bible-{name}.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(name, 'verses:', n, 'size KB:', os.path.getsize(f'bible-{name}.json') // 1024)
