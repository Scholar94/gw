import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { XMLParser } from 'fast-xml-parser';
import { C, loadConfig, promoteScheduled, buildRSS, buildCalendar, xmlEsc } from './job-lib.mjs';
const require = createRequire(import.meta.url);
const ICAL = require('ical.js');
const cfg = loadConfig(), TODAY = '2026-10-16', SITE = 'https://church.example';
const dev = (date, status, extra = {}) => ({ id: date, date, status, title: 'T ' + date, scripture: 'John 1:1', message: 'Body text '.repeat(40), author: 'Pastor A', theme: 'Faith', ...extra });

/* ---- fake Firestore (just enough surface) ---- */
function fakeDb(docs) {
  const updates = [];
  const mk = (arr) => ({ where(f, op, v) { const o = { '==': (a, b) => a === b, '<=': (a, b) => a <= b }[op]; return mk(arr.filter(d => o(d[f], v))); },
    async get() { return { docs: arr.map(d => ({ id: d.id, data: () => d, ref: { update: async p => { updates.push([d.id, p]); Object.assign(d, p); } } })) }; } });
  return { collection: () => mk(docs), updates };
}

test('promote: publishes only scheduled devotionals whose date has arrived', async () => {
  const docs = [dev('2026-10-15', 'scheduled'), dev('2026-10-16', 'scheduled'), dev('2026-10-17', 'scheduled'), dev('2026-10-14', 'draft'), dev('2026-10-13', 'archived')];
  const db = fakeDb(docs);
  const ids = await promoteScheduled(db, TODAY, 'TS');
  assert.deepEqual(ids.sort(), ['2026-10-15', '2026-10-16']);
  assert.equal(docs.find(d => d.id === '2026-10-17').status, 'scheduled', 'future stays scheduled');
  assert.equal(docs.find(d => d.id === '2026-10-14').status, 'draft', 'drafts untouched');
  assert.equal(docs.find(d => d.id === '2026-10-13').status, 'archived', 'archived untouched');
});
test('promote: idempotent on retry (second run changes nothing)', async () => {
  const docs = [dev('2026-10-16', 'scheduled')]; const db = fakeDb(docs);
  await promoteScheduled(db, TODAY, 'TS'); const n = db.updates.length;
  const again = await promoteScheduled(db, TODAY, 'TS');
  assert.deepEqual(again, []); assert.equal(db.updates.length, n);
});

test('RSS: well-formed and contains only published, non-future items, newest first', () => {
  const xml = buildRSS([dev('2026-10-16', 'published'), dev('2026-10-15', 'published'), dev('2026-10-14', 'draft', { title: 'DRAFT-LEAK' }), dev('2026-10-13', 'scheduled', { title: 'SCHED-LEAK' }),
    dev('2026-10-12', 'archived', { title: 'ARCH-LEAK' }), dev('2026-10-20', 'published', { title: 'FUTURE-LEAK' })], SITE, TODAY, cfg);
  for (const leak of ['DRAFT-LEAK', 'SCHED-LEAK', 'ARCH-LEAK', 'FUTURE-LEAK']) assert.ok(!xml.includes(leak), leak);
  const p = new XMLParser().parse(xml); const items = [].concat(p.rss.channel.item);
  assert.equal(items.length, 2); assert.equal(items[0].guid, `${SITE}/devotionals.html?d=2026-10-16`);
  assert.match(items[0].pubDate, /^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} 2026 05:00:00 GMT$/, '06:00 Lagos = 05:00 GMT');
});
test('RSS: escapes XML-breaking and control characters from content', () => {
  const xml = buildRSS([dev(TODAY, 'published', { title: 'A & B <script>"x"</script>', message: 'bad \u0001 char ]]> & <b>', author: "O'Neil" })], SITE, TODAY, cfg);
  const p = new XMLParser().parse(xml); assert.ok(p.rss.channel.item.title.includes('A & B'));
  assert.ok(!/<script>/.test(xml)); assert.ok(!xml.includes('\u0001'));
});
test('RSS: empty feed is still valid', () => assert.ok(new XMLParser().parse(buildRSS([], SITE, TODAY, cfg)).rss.channel.title));
test('xmlEsc covers all five characters', () => assert.equal(xmlEsc(`&<>"'`), '&amp;&lt;&gt;&quot;&apos;'));

test('calendar: parses; recurring services expand to the right dates', () => {
  const ics = buildCalendar([], cfg, TODAY);
  const comp = new ICAL.Component(ICAL.parse(ics)); const evs = comp.getAllSubcomponents('vevent').map(v => new ICAL.Event(v));
  assert.equal(evs.length, cfg.series.length);
  const sunday = evs.find(e => e.summary === 'Sunday Service'); const it = sunday.iterator(); let t;
  while ((t = it.next()) && t.toString().slice(0, 10) < '2026-10-16');
  assert.equal(t.toString().slice(0, 10), '2026-10-18'); assert.equal(t.toString().slice(11, 16), '08:15');
  assert.ok(ics.includes('BYDAY=-1SA') && ics.includes('BYMONTHDAY=-3,-2,-1'));
});
test('calendar: includes upcoming special events, excludes cancelled and long-past', () => {
  const ics = buildCalendar([{ id: 'a', title: 'Camp Meeting', date: '2026-11-20', time: '18:00', status: 'upcoming' }, { id: 'b', title: 'Cancelled One', date: '2026-11-21', status: 'cancelled' },
    { id: 'c', title: 'Old Event', date: '2025-01-01' }, { id: 'd', title: 'Bad date', date: '2026-02-31' }], cfg, TODAY);
  assert.ok(ics.includes('SUMMARY:Camp Meeting')); assert.ok(!ics.includes('Cancelled One')); assert.ok(!ics.includes('Old Event')); assert.ok(!ics.includes('Bad date'));
});
test('calendar: deterministic (no daily churn) and refresh hint present', () => {
  const ev = [{ id: 'a', title: 'X', date: '2026-11-20', time: '18:00' }];
  assert.equal(buildCalendar(ev, cfg, TODAY), buildCalendar(ev, cfg, TODAY)); assert.ok(buildCalendar(ev, cfg, TODAY).includes('REFRESH-INTERVAL'));
});
test('calendar: text with commas/newlines survives escaping', () => {
  const ics = buildCalendar([{ id: 'a', title: 'Praise, Worship; & Word', date: '2026-11-20', description: 'Line1\nLine2' }], cfg, TODAY);
  const evs = new ICAL.Component(ICAL.parse(ics)).getAllSubcomponents('vevent').map(v => new ICAL.Event(v)); const e = evs.find(x => x.summary.startsWith('Praise'));
  assert.equal(e.summary, 'Praise, Worship; & Word'); assert.equal(e.description, 'Line1\nLine2');
});
