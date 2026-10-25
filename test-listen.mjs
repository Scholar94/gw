import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const L = createRequire(import.meta.url)('./listen.js');
test('chunks never exceed the limit and never lose words', () => {
  const t = 'Faith is the substance of things hoped for. It comes by hearing; and hearing by the word of God! ' + 'word '.repeat(120) + 'The end.';
  const c = L.chunk(t, 120); assert.ok(c.every(x => x.length <= 120), 'too long'); assert.equal(c.join(' ').replace(/\s+/g, ' '), t.replace(/\s+/g, ' ').trim());
});
test('short text stays in order, empty input gives nothing', () => { assert.deepEqual(L.chunk('Hello there. Peace be with you.', 200).join(' '), 'Hello there. Peace be with you.'); assert.deepEqual(L.chunk('   ', 200), []); assert.deepEqual(L.chunk(null), []); });
test('an unbroken 500-character token is still split safely', () => { const c = L.chunk('x'.repeat(500), 100); assert.ok(c.length >= 5 && c.every(x => x.length <= 100)); });
test('no speechSynthesis in Node: reports unsupported and start() is a safe no-op', () => { assert.equal(L.supported, false); assert.equal(L.start('hi'), false); L.stop(); });
