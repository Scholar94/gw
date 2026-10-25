/* RSVP engine tests against an in-memory Firestore that enforces REAL commit semantics (atomic writes, exists/updateTime preconditions). */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import worker, { _resetTokenCache, fv, dv } from './worker.js';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const env = { ALLOWED_ORIGINS: 'https://site.test', TURNSTILE_SECRET: 's', FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ project_id: 'proj', client_email: 'sa@proj.iam', private_key: privateKey }) };
const store = new Map(); let clock = 0, commitHook = null;
const rc = new Map(); globalThis.caches = { default: { match: async r => (rc.has(r.url) ? new Response(rc.get(r.url)) : undefined), put: async (r, res) => { rc.set(r.url, await res.text()); } } };
const ROOT = 'https://firestore.googleapis.com/v1/projects/proj/databases/(default)/documents';
const fsErr = (status, st) => new Response(JSON.stringify({ error: { status: st } }), { status });
const doc = p => { const d = store.get(p); return d ? { name: `projects/proj/databases/(default)/documents/${p}`, fields: d.fields, updateTime: d.t } : null; };
const put = (p, data) => store.set(p, { fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, fv(v)])), t: String(++clock) });
const rel = n => n.split('/documents/')[1];
function fetchImpl(url, init = {}) {
  url = String(url);
  if (url.startsWith('https://oauth2.googleapis.com/')) return Response.json({ access_token: 'tok', expires_in: 3600 });
  if (url.startsWith('https://challenges.cloudflare.com/')) return Response.json({ success: globalThis.__ts !== false });
  if (url.endsWith(':commit')) {
    if (commitHook) { const h = commitHook; commitHook = null; h(); }
    const writes = JSON.parse(init.body).writes;
    for (const w of writes) { const p = rel((w.update || {}).name || w.delete), cur = store.get(p), pre = w.currentDocument;
      if (pre && pre.exists === false && cur) return fsErr(409, 'ALREADY_EXISTS'); if (pre && pre.updateTime && (!cur || cur.t !== pre.updateTime)) return fsErr(400, 'FAILED_PRECONDITION'); }
    for (const w of writes) { if (w.delete) { store.delete(rel(w.delete)); continue; } const p = rel(w.update.name), cur = store.get(p);
      const fields = w.updateMask ? { ...(cur ? cur.fields : {}), ...Object.fromEntries(w.updateMask.fieldPaths.map(f => [f, w.update.fields[f]])) } : w.update.fields; store.set(p, { fields, t: String(++clock) }); }
    return Response.json({});
  }
  if (url.endsWith(':runQuery')) {
    const q = JSON.parse(init.body).structuredQuery, fl = q.where.compositeFilter ? q.where.compositeFilter.filters : [q.where], col = q.from[0].collectionId, out = [];
    for (const [p, d] of store) if (p.startsWith(col + '/') && p.split('/').length === 2 && fl.every(f => dv(d.fields[f.fieldFilter.field.fieldPath]) === dv(f.fieldFilter.value))) out.push({ document: doc(p) });
    return Response.json(out.length ? out : [{}]);
  }
  if (url.startsWith(ROOT + '/') && (!init.method || init.method === 'GET')) { const d = doc(url.slice(ROOT.length + 1)); return d ? Response.json(d) : new Response('{}', { status: 404 }); }
  throw new Error('unexpected fetch ' + url);
}
const EV = 'EventAbcdef12345', TOMORROW = new Date(Date.now() + 36 * 3600e3).toISOString().slice(0, 10);
beforeEach(() => { store.clear(); rc.clear(); _resetTokenCache(); commitHook = null; globalThis.__ts = true; globalThis.fetch = async (u, i) => fetchImpl(u, i);
  put('events/' + EV, { title: 'Couples Night', date: TOMORROW, time: '17:00', venue: 'Hall', rsvp: true, capacity: 4, status: 'upcoming' }); });
let ipN = 0;
const book = (o = {}, ip) => worker.fetch(new Request('https://e.test/v1/rsvp', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://site.test', 'cf-connecting-ip': ip || '10.0.0.' + (++ipN) }, body: JSON.stringify({ eventId: EV, name: 'Ada Obi', email: `p${++ipN}@x.org`, party: 1, turnstile: 't', ...o }) }), env, {});
const cancel = (code, ip) => worker.fetch(new Request('https://e.test/v1/rsvp/cancel', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://site.test', 'cf-connecting-ip': ip || '20.0.0.' + (++ipN) }, body: JSON.stringify({ code }) }), env, {});
const get = code => worker.fetch(new Request('https://e.test/v1/rsvp/' + code, { headers: { 'cf-connecting-ip': '30.0.0.' + (++ipN) } }), env, {});
const counts = () => Object.fromEntries(Object.entries(store.get('rsvp_counts/' + EV).fields).map(([k, v]) => [k, dv(v)]));
const rsvp = code => Object.fromEntries(Object.entries(store.get('rsvps/' + code).fields).map(([k, v]) => [k, dv(v)]));

test('books a place: confirmed ticket with a 12-char code, counts updated, contact stored privately', async () => {
  const r = await book({ party: 2 }), j = await r.json(); assert.equal(r.status, 200); assert.equal(j.status, 'confirmed'); assert.match(j.code, /^[0-9A-HJKMNP-TV-Z]{12}$/);
  assert.deepEqual([counts().confirmed, counts().waiting], [2, 0]); assert.equal(rsvp(j.code).name, 'Ada Obi'); assert.equal(rsvp(j.code).checkedIn, false);
});
test('rejects: unknown / closed / completed / past events', async () => {
  assert.equal((await book({ eventId: 'Nope123456789' })).status, 404);
  put('events/Closed12345678', { title: 'x', date: TOMORROW }); assert.equal((await book({ eventId: 'Closed12345678' })).status, 404);
  put('events/Done123456789', { title: 'x', date: TOMORROW, rsvp: true, status: 'completed' }); assert.equal((await book({ eventId: 'Done123456789' })).status, 404);
  put('events/Past123456789', { title: 'x', date: '2020-01-01', rsvp: true }); assert.equal((await book({ eventId: 'Past123456789' })).status, 404);
  assert.equal((await book({ eventId: '../admins' })).status, 400);
});
test('validation: contact needed, valid email/phone, party 1-4, name', async () => {
  for (const o of [{ email: '', phone: '' }, { email: 'bad' }, { email: '', phone: 'abc' }, { party: 0 }, { party: 5 }, { party: 1.5 }, { party: 'x' }, { name: 'A' }]) assert.equal((await book(o)).status, 400, JSON.stringify(o));
  assert.equal(store.has('rsvp_counts/' + EV), false, 'nothing is written for invalid input');
});
test('Turnstile is required and failing it writes nothing', async () => { globalThis.__ts = false; assert.equal((await book()).status, 403); assert.equal([...store.keys()].filter(k => k.startsWith('rsvps/')).length, 0); });
test('capacity: seats fill up, then people join the waiting list in order', async () => {
  const a = await (await book({ party: 3 })).json(), b = await (await book({ party: 2 })).json(), c = await (await book({ party: 1 })).json();
  assert.deepEqual([a.status, b.status, c.status], ['confirmed', 'waitlist', 'confirmed']); assert.deepEqual([counts().confirmed, counts().waiting], [4, 2]);
  const d = await (await book()).json(); assert.equal(d.status, 'waitlist'); assert.ok(rsvp(d.code).seq > rsvp(b.code).seq);
});
test('waiting list can be switched off: a full event says so', async () => { put('events/' + EV, { title: 'x', date: TOMORROW, rsvp: true, capacity: 1, waitlist: false }); await book(); assert.equal((await book()).status, 409); });
test('capacity 0 means unlimited', async () => { put('events/' + EV, { title: 'x', date: TOMORROW, rsvp: true, capacity: 0 }); for (let i = 0; i < 5; i++) assert.equal((await (await book({ party: 4 })).json()).status, 'confirmed'); });
test('one reservation per person per event; a different person is fine', async () => {
  assert.equal((await book({ email: 'same@x.org' })).status, 200); assert.equal((await book({ email: 'SAME@x.org' })).status, 409); assert.equal((await book({ email: 'other@x.org' })).status, 200);
});
test('RACE: 10 people book at the same instant for 4 seats: never oversold, counts exact, codes unique', async () => {
  put('events/' + EV, { title: 'x', date: TOMORROW, rsvp: true, capacity: 4 });
  const res = await Promise.all(Array.from({ length: 10 }, () => book())), js = await Promise.all(res.map(r => r.json()));
  assert.ok(res.every(r => r.status === 200), 'all accepted (some on the waiting list)'); assert.equal(js.filter(j => j.status === 'confirmed').length, 4); assert.equal(js.filter(j => j.status === 'waitlist').length, 6);
  assert.deepEqual([counts().confirmed, counts().waiting], [4, 6]); assert.equal(new Set(js.map(j => j.code)).size, 10);
  assert.equal([...store.keys()].filter(k => k.startsWith('rsvps/')).length, 10);
});
test('RACE with a competing write between read and commit: the loser retries on fresh numbers', async () => {
  put('events/' + EV, { title: 'x', date: TOMORROW, rsvp: true, capacity: 2 }); put('rsvp_counts/' + EV, { confirmed: 0, waiting: 0, seq: 0 });
  commitHook = () => put('rsvp_counts/' + EV, { confirmed: 2, waiting: 0, seq: 2 });   // someone else took both seats first
  const j = await (await book()).json(); assert.equal(j.status, 'waitlist'); assert.deepEqual([counts().confirmed, counts().waiting], [2, 1]);
});
test('cancelling a confirmed ticket frees the seats and promotes the waiting list in order (skipping parties that do not fit)', async () => {
  const a = await (await book({ party: 3 })).json(), b = await (await book({ party: 2 })).json(), c = await (await book({ party: 2 })).json(), d = await (await book({ party: 1 })).json();
  assert.deepEqual([b.status, c.status, d.status], ['waitlist', 'waitlist', 'confirmed']); assert.equal((await cancel(a.code)).status, 200);
  assert.equal(rsvp(a.code).status, 'cancelled'); assert.equal(rsvp(b.code).status, 'confirmed', 'first in line promoted'); assert.equal(rsvp(c.code).status, 'waitlist', 'second does not fit yet');
  assert.deepEqual([counts().confirmed, counts().waiting], [3, 2]);
});
test('cancelling a waitlisted ticket only reduces the waiting count; double-cancel is harmless; cancelled people can book again', async () => {
  const a = await (await book({ party: 4, email: 'a@x.org' })).json(), b = await (await book({ party: 1, email: 'b@x.org' })).json();
  assert.equal((await cancel(b.code)).status, 200); assert.deepEqual([counts().confirmed, counts().waiting], [4, 0]); assert.equal((await cancel(b.code)).status, 200); assert.deepEqual([counts().confirmed, counts().waiting], [4, 0]);
  assert.equal((await book({ email: 'b@x.org' })).status, 200, 'dedupe key released'); assert.ok(a.code);
});
test('a ticket that was already scanned in cannot be cancelled; unknown or malformed codes are 404', async () => {
  const a = await (await book()).json(); put('rsvps/' + a.code, { ...rsvp(a.code), checkedIn: true }); assert.equal((await cancel(a.code)).status, 409);
  assert.equal((await cancel('ZZZZZZZZZZZZ')).status, 404); assert.equal((await cancel('short')).status, 404); assert.equal((await cancel("'; drop")).status, 404);
});
test('ticket lookup: status + event details, never the contact details; lowercase code works; unknown = 404', async () => {
  const a = await (await book({ email: 'secret@x.org', name: 'Grace' })).json(), r = await get(a.code.toLowerCase()), j = await r.json();
  assert.equal(r.status, 200); assert.equal(j.status, 'confirmed'); assert.equal(j.name, 'Grace'); assert.equal(j.event.title, 'Couples Night'); assert.ok(!JSON.stringify(j).includes('secret@x.org'));
  assert.equal((await get('ABCDEFGHJKMN')).status, 404); assert.equal((await get('bad')).status, 404);
});
test('rate limit on booking: the 7th attempt from one visitor in the window is refused', async () => {
  for (let i = 0; i < 6; i++) assert.equal((await book({ email: `r${i}@x.org` }, '9.9.9.9')).status, 200); const r = await book({ email: 'r7@x.org' }, '9.9.9.9'); assert.equal(r.status, 429); assert.ok(r.headers.get('retry-after'));
});
test('foreign origins cannot book', async () => { const r = await worker.fetch(new Request('https://e.test/v1/rsvp', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.test' }, body: '{}' }), env, {}); assert.equal(r.status, 403); });
test('honeypot returns success without touching the database', async () => { const r = await book({ website: 'http://spam' }); assert.equal(r.status, 200); assert.equal(store.has('rsvp_counts/' + EV), false); });
