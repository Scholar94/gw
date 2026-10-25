import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const S = createRequire(import.meta.url)('./scripture.js');
const kjv = JSON.parse(readFileSync('./bible-kjv.json', 'utf8')), web = JSON.parse(readFileSync('./bible-web.json', 'utf8'));
const str = t => { const r = S.parse(t); return r && S.toString(r); };

test('chapter counts match the real Bible data (both translations) and total 1189', () => {
  assert.equal(S.CH.reduce((a, b) => a + b, 0), 1189);
  S.BOOKS.forEach((b, i) => { assert.equal(kjv.b[b].length, S.CH[i], 'KJV ' + b); assert.equal(web.b[b].length, S.CH[i], 'WEB ' + b); });
});
test('parse: common forms and abbreviations', () => {
  const cases = { 'John 3:16': 'John 3:16', 'Jn 3:16': 'John 3:16', 'Psalm 23': 'Psalms 23', 'Ps 23:1-3': 'Psalms 23:1–3', '1 Cor 13:4-7': '1 Corinthians 13:4–7', 'I Corinthians 13:4': '1 Corinthians 13:4', 'II Tim 1:7': '2 Timothy 1:7', '2Tim 1:7': '2 Timothy 1:7', 'Rom 8:28-30, 35': 'Romans 8:28–30, 35', 'Song of Solomon 2:4': 'Song of Solomon 2:4', 'Song of Songs 2:4': 'Song of Solomon 2:4', 'Matt. 5:3': 'Matthew 5:3', 'Gen 1:1': 'Genesis 1:1', '3 John 4': '3 John 1:4', 'Jude 3': 'Jude 1:3', 'Jude 3-5': 'Jude 1:3–5', 'John 3:16-4:2': 'John 3:16–4:2', 'John 3-4': 'John 3–4', 'Rev 21:4': 'Revelation 21:4', 'Phil 4:13': 'Philippians 4:13', 'Philem 6': 'Philemon 1:6', '1 Sam 17:45': '1 Samuel 17:45', 'Prov 3:5–6': 'Proverbs 3:5–6' };
  for (const [i, o] of Object.entries(cases)) assert.equal(str(i), o, i);
});
test('parse: impossible references are rejected', () => { for (const t of ['John 40', 'Jude 2:3', 'John 3:0', 'John 3:16-2', 'Genesis 51', 'Psalm 151', 'Foo 3:16', 'John', 'Obadiah 2:1']) assert.equal(S.parse(t), null, t); });
test('find: inside prose, with punctuation, ignoring false positives', () => {
  const t = 'Read John 3:16, then Rom 8:28-30. See also (Psalm 23) and 1 Cor 13:4–7; but not Mark my 3 words, nor in 3:16 alone, nor Johnny 3:16.';
  const f = S.find(t).map(x => x.text); assert.deepEqual(f, ['John 3:16', 'Rom 8:28-30', 'Psalm 23', '1 Cor 13:4–7']);
  assert.equal(t.slice(S.find(t)[0].start, S.find(t)[0].end), 'John 3:16');
});
test('find: a trailing comma/period is not swallowed, lists of verses are', () => { assert.equal(S.find('Romans 8:28, 30, 32-33.')[0].text, 'Romans 8:28, 30, 32-33'); assert.equal(S.find('John 3:16.')[0].text, 'John 3:16'); assert.equal(S.find('(John 3:16)')[0].text, 'John 3:16'); });
test('find: does not match inside words or other numbers', () => { assert.deepEqual(S.find('Xjohn 3:16 and Rejohn 3:1'), []); assert.equal(S.find('Acts 2:1 at 10:30')[0].text, 'Acts 2:1'); });
test('verses: exact KJV/WEB text for single verses, ranges, chapters, cross-chapter, lists', () => {
  assert.match(S.plainText(S.verses(kjv, S.parse('John 3:16'))), /^For God so loved the world, that he gave his only begotten Son/);
  assert.match(S.plainText(S.verses(web, S.parse('John 3:16'))), /one and only Son/);
  assert.equal(S.verses(kjv, S.parse('Psalm 23')).length, 6); assert.equal(S.verses(kjv, S.parse('John 3:16-18')).length, 3);
  const x = S.verses(kjv, S.parse('Genesis 1:31-2:2')); assert.deepEqual(x.map(v => v.c + ':' + v.v), ['1:31', '2:1', '2:2']);
  assert.deepEqual(S.verses(kjv, S.parse('Romans 8:28, 31')).map(v => v.v), [28, 31]); assert.equal(S.verses(kjv, S.parse('Psalm 119')).length, 176); assert.equal(S.verses(kjv, S.parse('Psalm 118-119')).length, 200, 'output is capped');
});
test('every verse-of-the-day reference exists and has text in both translations', () => {
  S.VOTD.forEach(t => { const r = S.parse(t); assert.ok(r, t); for (const d of [kjv, web]) { const v = S.verses(d, r); assert.ok(v.length && v.every(x => x.t), t); } });
  assert.equal(S.toString(S.votd('2026-01-01')), S.toString(S.votd('2026-01-01'))); assert.notEqual(S.toString(S.votd('2026-01-01')), S.toString(S.votd('2026-01-02')));
});
test('reading plans cover every chapter exactly once, in order, with sane days', () => {
  for (const p of S.PLAN_DEFS) {
    const days = S.planDays(p.id); assert.equal(days.length, p.days, p.id);
    const seen = []; days.forEach(d => d.refs.forEach(r => { for (let c = r.c1; c <= r.c2; c++) seen.push(r.book + ' ' + c); }));
    const from = S.BOOKS.indexOf(p.from), to = S.BOOKS.indexOf(p.to), expected = []; for (let b = from; b <= to; b++) for (let c = 1; c <= S.CH[b]; c++) expected.push(S.BOOKS[b] + ' ' + c);
    assert.deepEqual(seen, expected, p.id); assert.ok(days.every(d => d.label && /^\d+$/.test(d.id)));
  }
  assert.equal(S.planDays('bible-365')[0].label, 'Genesis 1–4'); assert.equal(S.planDays('john-21')[2].label, 'John 3'); assert.deepEqual(S.planDays('nope'), []);
});
test('plan day ids are valid for member sync (<=20 word chars) and the biggest plan fits the sync cap', () => { assert.ok(S.planDays('bible-365').length <= 2000); });
test('text wrapping never loses words and respects the width', () => {
  const m = s => s.length * 10, lines = S.wrap(m, 'For God so loved the world that he gave his only begotten Son', 200);
  assert.equal(lines.join(' '), 'For God so loved the world that he gave his only begotten Son'); assert.ok(lines.every(l => m(l) <= 200 || !l.includes(' ')));
  assert.deepEqual(S.wrap(m, 'Supercalifragilisticexpialidocious', 50), ['Supercalifragilisticexpialidocious']);
});
