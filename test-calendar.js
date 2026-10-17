const assert = require('assert');
const C = require('./calendar-lib.js');
let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('  ok  ' + n); } catch (e) { console.error('FAIL  ' + n + '\n      ' + e.message); process.exitCode = 1; } };

t('Lagos->UTC conversion (8:15 WAT = 07:15Z)', () => assert.strictEqual(C.lagosToInstant('2026-10-18', '08:15').toISOString(), '2026-10-18T07:15:00.000Z'));
t('midnight Lagos is previous day in UTC', () => assert.strictEqual(C.lagosToInstant('2026-01-01', '00:30').toISOString(), '2025-12-31T23:30:00.000Z'));
t('todayLagos rolls over at 23:00Z', () => assert.strictEqual(C.todayLagos(new Date('2026-10-15T23:30:00Z')), '2026-10-16'));
t('todayLagos before rollover', () => assert.strictEqual(C.todayLagos(new Date('2026-10-15T22:59:00Z')), '2026-10-15'));
t('invalid date rejected', () => assert.strictEqual(C.parseYMD('2026-02-31'), null));
t('leap day accepted', () => assert.ok(C.parseYMD('2028-02-29')));
t('addDays across year end', () => assert.strictEqual(C.addDays('2026-12-31', 1), '2027-01-01'));

t('weekly Sundays Oct 2026', () => {
  const s = { id: 'sun', title: 'Sunday', rule: { kind: 'weekly', day: 0 } };
  assert.deepStrictEqual(C.expandSeries(s, '2026-10-01', '2026-10-31').map(o => o.date), ['2026-10-04', '2026-10-11', '2026-10-18', '2026-10-25']);
});
t('last Saturday of month (incl. year rollover)', () => {
  const s = { id: 'ls', title: 'RB', rule: { kind: 'monthly-last-weekday', day: 6 } };
  assert.deepStrictEqual(C.expandSeries(s, '2026-10-01', '2027-02-28').map(o => o.date), ['2026-10-31', '2026-11-28', '2026-12-26', '2027-01-30', '2027-02-27']);
});
t('last 3 days of month, Feb non-leap and leap', () => {
  const s = { id: 'f', title: 'F', rule: { kind: 'month-end-days', count: 3 } };
  assert.deepStrictEqual(C.expandSeries(s, '2027-02-01', '2027-02-28').map(o => o.date), ['2027-02-26', '2027-02-27', '2027-02-28']);
  assert.deepStrictEqual(C.expandSeries(s, '2028-02-01', '2028-02-29').map(o => o.date), ['2028-02-27', '2028-02-28', '2028-02-29']);
});
t('range filter excludes occurrences outside window', () => {
  const s = { id: 'f', title: 'F', rule: { kind: 'month-end-days', count: 3 } };
  assert.deepStrictEqual(C.expandSeries(s, '2026-10-30', '2026-11-02').map(o => o.date), ['2026-10-30', '2026-10-31']);
});
t('RRULE strings', () => {
  assert.strictEqual(C.seriesToRRULE({ rule: { kind: 'weekly', day: 3 } }), 'FREQ=WEEKLY;BYDAY=WE');
  assert.strictEqual(C.seriesToRRULE({ rule: { kind: 'monthly-last-weekday', day: 6 } }), 'FREQ=MONTHLY;BYDAY=-1SA');
  assert.strictEqual(C.seriesToRRULE({ rule: { kind: 'month-end-days', count: 3 } }), 'FREQ=MONTHLY;BYMONTHDAY=-3,-2,-1');
});

const ev = { id: 'e1', title: 'Camp, Meeting; "Special"', description: 'Line1\nLine2', venue: 'Church Auditorium, Ijebu-Ode', date: '2026-11-20', time: '18:00' };
t('ICS escaping + folding + CRLF', () => {
  const ics = C.buildICS([{ ...ev, description: 'x'.repeat(200) + ' ✝ ' + 'é'.repeat(80) }]);
  assert.ok(ics.includes('SUMMARY:Camp\\, Meeting\\; "Special"'));
  ics.split('\r\n').forEach(l => assert.ok(Buffer.byteLength(l) <= 75, 'line too long: ' + Buffer.byteLength(l)));
  assert.ok(!/[^\r]\n/.test(ics), 'bare LF found');
});
t('default 2h duration', () => assert.ok(C.buildICS([ev]).includes('DTEND;TZID=Africa/Lagos:20261120T200000')));
t('duration crossing midnight', () => assert.ok(C.buildICS([{ ...ev, time: '23:00' }]).includes('DTEND;TZID=Africa/Lagos:20261121T010000')));
t('all-day event has exclusive DTEND', () => {
  const ics = C.buildICS([{ id: 'a', title: 'Fast', date: '2026-10-31' }]);
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20261031') && ics.includes('DTEND;VALUE=DATE:20261101'));
});
t('multi-day all-day', () => assert.ok(C.buildICS([{ id: 'a', title: 'Camp', date: '2026-10-30', endDate: '2026-11-01' }]).includes('DTEND;VALUE=DATE:20261102')));
t('Google link UTC dates', () => {
  const u = new URL(C.googleURL(ev));
  assert.strictEqual(u.searchParams.get('dates'), '20261120T170000Z/20261120T190000Z');
  assert.strictEqual(u.searchParams.get('ctz'), 'Africa/Lagos');
});
t('Google link carries recurrence', () => assert.ok(new URL(C.googleURL({ ...ev, rrule: 'FREQ=WEEKLY;BYDAY=SU' })).searchParams.get('recur') === 'RRULE:FREQ=WEEKLY;BYDAY=SU'));
t('Outlook + Yahoo links', () => {
  assert.strictEqual(new URL(C.outlookURL(ev)).searchParams.get('startdt'), '2026-11-20T17:00:00Z');
  assert.strictEqual(new URL(C.yahooURL(ev)).searchParams.get('st'), '20261120T170000Z');
});
t('ICS parses with independent parser (ical.js)', () => {
  const ICAL = require('ical.js');
  const s = { id: 'sun', title: 'Sunday Service', time: '08:15', endTime: '10:30', venue: 'Ijebu-Ode', rule: { kind: 'weekly', day: 0 } };
  const anchor = C.seriesAnchor(s, '2026-10-15');
  const ics = C.buildICS([anchor, ev, { id: 'a', title: 'Fast', date: '2026-10-31' }]);
  const comp = new ICAL.Component(ICAL.parse(ics));
  const evs = comp.getAllSubcomponents('vevent').map(v => new ICAL.Event(v));
  assert.strictEqual(evs.length, 3);
  assert.strictEqual(evs[0].summary, 'Sunday Service');
  assert.strictEqual(evs[0].startDate.toString().slice(0, 10), '2026-10-18');
  assert.strictEqual(evs[1].summary, 'Camp, Meeting; "Special"');
  assert.strictEqual(evs[1].description, 'Line1\nLine2');
  const it = evs[0].iterator(); const first3 = [it.next(), it.next(), it.next()].map(x => x.toString().slice(0, 10));
  assert.deepStrictEqual(first3, ['2026-10-18', '2026-10-25', '2026-11-01']);
  assert.ok(evs[2].startDate.isDate);
});
t('floating event: no TZID (follows visitor timezone), daily RRULE, alarm at start', () => {
  const ev = { id: 'r', title: 'Daily Devotional', date: '2026-10-17', time: '06:00', endTime: '06:15', rrule: 'FREQ=DAILY', floating: true };
  const ics = C.buildICS([ev], { alarmMinutes: 0 });
  assert.ok(ics.includes('DTSTART:20261017T060000') && ics.includes('DTEND:20261017T061500') && ics.includes('RRULE:FREQ=DAILY') && ics.includes('TRIGGER:PT0S'));
  assert.ok(!/DTSTART;TZID/.test(ics.split('BEGIN:VEVENT')[1]));
  const g = new URL(C.googleURL(ev)); assert.strictEqual(g.searchParams.get('dates'), '20261017T060000/20261017T061500'); assert.strictEqual(g.searchParams.get('ctz'), null); assert.strictEqual(g.searchParams.get('recur'), 'RRULE:FREQ=DAILY');
});
t('default alarm remains 60 minutes before', () => assert.ok(C.buildICS([{ id: 'x', title: 'X', date: '2026-11-01', time: '10:00' }]).includes('TRIGGER:-PT60M')));
t('floating ICS parses and repeats daily', () => {
  const ICAL = require('ical.js'); const ics = C.buildICS([{ id: 'r', title: 'D', date: '2026-10-17', time: '06:00', rrule: 'FREQ=DAILY', floating: true }]);
  const e = new ICAL.Event(new ICAL.Component(ICAL.parse(ics)).getFirstSubcomponent('vevent')); const it = e.iterator();
  assert.deepStrictEqual([it.next(), it.next(), it.next()].map(x => x.toString().slice(0, 10)), ['2026-10-17', '2026-10-18', '2026-10-19']);
});
console.log(`\n${pass} passed`);
