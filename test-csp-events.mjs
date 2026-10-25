import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const E = createRequire(import.meta.url)('./csp-events.js');
test('parses the real handlers used on the site', () => {
  assert.deepEqual(E.parse("showPanel('sermons')"), [{ fn: 'showPanel', args: [{ k: 'lit', v: 'sermons' }] }]);
  assert.deepEqual(E.parse('toggleFaq(this)'), [{ fn: 'toggleFaq', args: [{ k: 'this' }] }]);
  assert.deepEqual(E.parse('filterSermons(this.value)')[0].args, [{ k: 'prop', v: 'value' }]);
  assert.deepEqual(E.parse('event.preventDefault(); handleSermonUpload();').map(s => s.ev || s.fn), ['preventDefault', 'handleSermonUpload']);
  assert.deepEqual(E.parse("confirmDelete('audio','abc123')")[0].args.map(a => a.v), ['audio', 'abc123']);
  assert.deepEqual(E.parse('removeArchive(3)')[0].args, [{ k: 'lit', v: 3 }]); assert.deepEqual(E.parse('doLogin()'), [{ fn: 'doLogin', args: [] }]);
});
test('strings may contain commas, semicolons, parentheses and escaped quotes', () => {
  assert.deepEqual(E.parse("f('a, b; c (d)', 'it\\'s')")[0].args.map(a => a.v), ['a, b; c (d)', "it's"]);
});
test('anything that is not a plain call is refused (no eval, no property access, no code)', () => {
  for (const bad of ['alert(1)+1', 'window.location="x"', 'a.b.c()', 'f(g())', 'f(document.cookie)', "f('x'", 'f(this.innerHTML)', 'x=1', 'f(1+1)', 'event.preventDefault(1)', 'constructor.constructor("x")()', 'f(`a`)', '(function(){})()'])
    assert.throws(() => E.parse(bad), bad);
});
test('run calls only existing global functions with the element as this', () => {
  const calls = []; globalThis.rec = function (...a) { calls.push([this.id, ...a]); };
  const el = { id: 'e1', value: 'v', checked: true }, ev = { prevented: 0, preventDefault() { this.prevented++; } };
  E.run("event.preventDefault(); rec('x', this.value, this.checked, 5, this)", el, ev); assert.equal(ev.prevented, 1); assert.deepEqual(calls[0], ['e1', 'x', 'v', true, 5, el]);
  assert.throws(() => E.run('nope()', el, ev), /not defined/);
});
