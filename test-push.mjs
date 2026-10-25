import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPayload, sendAll, run } from './job-push.mjs';

test('payload: relative url, verse in body, truncation', () => {
  const p = buildPayload({ date: '2026-02-03', title: 'T'.repeat(200), scripture: 'John 3:16' }); assert.equal(p.url, 'devotionals.html?d=2026-02-03'); assert.ok(p.body.length < 170 && p.body.endsWith('John 3:16'));
});
test('sendAll: counts, prunes 404/410, tolerates other failures, respects TTL', async () => {
  const subs = [{ id: 'a', endpoint: 'https://x/a', keys: {} }, { id: 'b', endpoint: 'https://x/b', keys: {} }, { id: 'c', endpoint: 'https://x/c', keys: {} }, { id: 'd', endpoint: 'https://x/d', keys: {} }], removed = [], opts = [];
  const send = async (s, body, o) => { opts.push(o); if (s.endpoint.endsWith('b')) throw { statusCode: 410 }; if (s.endpoint.endsWith('c')) throw { statusCode: 404 }; if (s.endpoint.endsWith('d')) throw { statusCode: 500 }; };
  const r = await sendAll(subs, send, async id => removed.push(id), { title: 'x' }, 2);
  assert.deepEqual(r, { sent: 1, removed: 2, failed: 1 }); assert.deepEqual(removed.sort(), ['b', 'c']); assert.equal(opts[0].TTL, 43200);
});
function fakeDb({ devs = [], subs = [], logged = false }) {
  const sent = { logCreated: 0 };
  return { sent, collection: n => ({
    where: () => ({ where: () => ({ limit: () => ({ get: async () => ({ empty: !devs.length, docs: devs.map(d => ({ id: d.date, data: () => d })) }) }) }) }),
    doc: id => ({ create: async () => { if (logged) { const e = new Error('6 ALREADY_EXISTS'); e.code = 6; throw e; } sent.logCreated++; }, delete: async () => {} }),
    get: async () => ({ docs: subs.map((s, i) => ({ id: 's' + i, data: () => s })) }) }) };
}
const wp = n => ({ sendNotification: async () => { n.c++; } });
test('run: sends once with a published devotional; skips insecure subscriptions', async () => {
  const n = { c: 0 }, db = fakeDb({ devs: [{ date: '2026-02-03', title: 'T', scripture: 'Ps 1' }], subs: [{ endpoint: 'https://a/1', keys: { auth: 'x' } }, { endpoint: 'http://bad', keys: {} }] });
  const r = await run(db, wp(n), '2026-02-03'); assert.equal(r.sent, 1); assert.equal(n.c, 1); assert.equal(db.sent.logCreated, 1);
});
test('run: nothing to send without a published devotional', async () => { const n = { c: 0 }; assert.equal(await run(fakeDb({}), wp(n), '2026-02-03'), null); assert.equal(n.c, 0); });
test('run: a same-day re-run never double-sends', async () => { const n = { c: 0 }; assert.equal(await run(fakeDb({ devs: [{ date: 'd', title: 't' }], subs: [{ endpoint: 'https://a/1', keys: {} }], logged: true }), wp(n), 'd'), null); assert.equal(n.c, 0); });
