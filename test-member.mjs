import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { mergePrefs, stamp } = createRequire(import.meta.url)('./member.js');
const NOW = Date.parse('2026-06-01T00:00:00Z');

test('first sign-in: local data is uploaded, nothing lost', () => {
  const m = mergePrefs({ bookmarks: ['2026-01-02'], read: ['2026-01-01'], notes: { '2026-01-02': 'hi' }, meta: { bm: { '2026-01-02': NOW - 5 }, nt: { '2026-01-02': NOW - 5 } } }, null, NOW);
  assert.deepEqual(m.remote.bm['2026-01-02'], { on: true, at: NOW - 5 }); assert.equal(m.remote.notes['2026-01-02'].t, 'hi'); assert.deepEqual(m.local.read, ['2026-01-01']);
});
test('new device: remote data arrives locally', () => {
  const m = mergePrefs({}, { bm: { '2026-02-01': { on: true, at: NOW - 9 } }, notes: { '2026-02-01': { t: 'from phone', at: NOW - 9 } }, read: ['2026-02-01'] }, NOW);
  assert.deepEqual(m.local.bookmarks, ['2026-02-01']); assert.equal(m.local.notes['2026-02-01'], 'from phone'); assert.equal(m.local.meta.nt['2026-02-01'], NOW - 9);
});
test('un-bookmarking on one device wins when it is newer, and propagates', () => {
  const m = mergePrefs({ bookmarks: [], meta: { bm: { '2026-02-01': NOW - 1 } } }, { bm: { '2026-02-01': { on: true, at: NOW - 100 } } }, NOW);
  assert.deepEqual(m.local.bookmarks, []); assert.equal(m.remote.bm['2026-02-01'].on, false);
});
test('older local state loses to newer remote state', () => {
  const m = mergePrefs({ bookmarks: ['2026-02-01'], meta: { bm: { '2026-02-01': NOW - 100 } } }, { bm: { '2026-02-01': { on: false, at: NOW - 1 } } }, NOW);
  assert.deepEqual(m.local.bookmarks, []);
});
test('notes: newest edit wins, deleting a note propagates', () => {
  let m = mergePrefs({ notes: { '2026-02-01': 'old' }, meta: { nt: { '2026-02-01': NOW - 50 } } }, { notes: { '2026-02-01': { t: 'new', at: NOW - 10 } } }, NOW); assert.equal(m.local.notes['2026-02-01'], 'new');
  m = mergePrefs({ notes: {}, meta: { nt: { '2026-02-01': NOW - 1 } } }, { notes: { '2026-02-01': { t: 'x', at: NOW - 10 } } }, NOW); assert.equal(m.local.notes['2026-02-01'], undefined); assert.equal(m.remote.notes['2026-02-01'].t, '');
});
test('read history and plan progress are unions', () => {
  const m = mergePrefs({ read: ['2026-01-01'], plans: { 'john-21': { done: ['1', '2'], at: 5 } } }, { read: ['2026-01-02'], plans: { 'john-21': { done: ['2', '3'], at: 9 }, 'psalms-31': { done: ['1'], at: 1 } } }, NOW);
  assert.deepEqual(m.local.read, ['2026-01-01', '2026-01-02']); assert.deepEqual(m.local.plans['john-21'], { done: ['1', '2', '3'], at: 9 }); assert.ok(m.local.plans['psalms-31']);
});
test('idempotent: merging the result again changes nothing', () => {
  const a = mergePrefs({ bookmarks: ['2026-01-02'], read: ['2026-01-01'], notes: { '2026-01-02': 'hi' }, meta: { bm: { '2026-01-02': NOW - 5 }, nt: { '2026-01-02': NOW - 5 } } }, { bm: { '2026-03-03': { on: true, at: NOW - 2 } } }, NOW);
  const b = mergePrefs(a.local, a.remote, NOW); assert.deepEqual(b.local, a.local); assert.deepEqual(b.remote, a.remote);
});
test('hostile remote data is sanitised: bad dates, oversize notes, bad plan ids dropped', () => {
  const m = mergePrefs({}, { bm: { '<script>': { on: true, at: 1 } }, notes: { '2026-01-01': { t: 'x'.repeat(5000), at: 1 } }, read: ['nope', '2026-01-01'], plans: { 'BAD ID!': { done: ['1'] }, ok: { done: ['<b>', '7'] } } }, NOW);
  assert.deepEqual(m.local.bookmarks, []); assert.equal(m.local.notes['2026-01-01'].length, 2000); assert.deepEqual(m.local.read, ['2026-01-01']); assert.deepEqual(Object.keys(m.local.plans), ['ok']); assert.deepEqual(m.local.plans.ok.done, ['7']);
});
test('old un-bookmark tombstones (>60 days) are pruned', () => { const m = mergePrefs({}, { bm: { '2026-01-01': { on: false, at: NOW - 61 * 864e5 } } }, NOW); assert.deepEqual(m.remote.bm, {}); });
test('stamp records when something changed', () => { const d = {}; stamp(d, 'bm', '2026-01-01', 77); assert.equal(d.meta.bm['2026-01-01'], 77); });
