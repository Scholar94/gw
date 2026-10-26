import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
const I = createRequire(import.meta.url)('./i18n.js');
const csv = readFileSync('i18n-translators.csv', 'utf8');

test('translateText: exact whole-text matches only, whitespace preserved, no partial replacement', () => {
  const m = { About: 'À propos', 'Sermons & Messages': 'Prédications et messages' };
  assert.equal(I.translateText(m, '  About\n  '), '  À propos\n  '); assert.equal(I.translateText(m, 'Sermons &   Messages'), 'Prédications et messages');
  assert.equal(I.translateText(m, 'About our church'), null); assert.equal(I.translateText(m, ''), null); assert.equal(I.translateText(m, '   '), null);
});
test('translateText is safe against prototype keys and non-string values', () => { assert.equal(I.translateText({}, 'constructor'), null); assert.equal(I.translateText({}, '__proto__'), null); assert.equal(I.translateText({ A: 5 }, 'A'), null); assert.equal(I.translateText({ A: '' }, 'A'), null); });
test('usable: drafts are hidden unless explicitly allowed; malformed files are rejected', () => {
  const f = r => ({ _meta: { code: 'fr', name: 'Français', reviewed: r }, strings: { A: 'B' } });
  assert.equal(I.usable(f(true), {}), true); assert.equal(I.usable(f(false), {}), false); assert.equal(I.usable(f(false), { allowDrafts: false }), false); assert.equal(I.usable(f(false), { allowDrafts: true }), true);
  for (const bad of [null, {}, { _meta: { code: 'FR!', reviewed: true }, strings: {} }, { _meta: { code: 'fr', reviewed: true } }, { _meta: { code: 'fr', reviewed: 'yes' }, strings: {} }]) assert.equal(I.usable(bad, { allowDrafts: false }), false);
});
test('shipped French draft: honest metadata, every key is a real site string, no empty or identical-to-English entries that hide mistakes', () => {
  const fr = JSON.parse(readFileSync('i18n-fr.json', 'utf8')); assert.equal(fr._meta.code, 'fr'); assert.equal(fr._meta.reviewed, false, 'a draft must never claim to be reviewed');
  const en = new Set(csv.split('\n').slice(1).map(l => l.replace(/^"|",.*$/g, '')).filter(Boolean)); const keys = Object.keys(fr.strings); assert.ok(keys.length > 250);
  for (const [k, v] of Object.entries(fr.strings)) { assert.ok(v.trim().length > 0, k); assert.notEqual(v, k, 'identical: ' + k); }
});
test('shipped French draft keeps punctuation conventions: trailing colons, ellipses, asterisks and quotes survive', () => {
  const fr = JSON.parse(readFileSync('i18n-fr.json', 'utf8')).strings;
  for (const [k, v] of Object.entries(fr)) { if (/:\s*$/.test(k)) assert.match(v, /:\s*$/, k); if (/\*\s*$/.test(k)) assert.match(v, /\*\s*$/, k); if (/(…|\.\.\.)$/.test(k)) assert.match(v, /(…|\.\.\.)$/, k); assert.ok(!/[<>{}]/.test(v), 'markup in translation: ' + k); }
});
test('the translators CSV keeps all four target languages as columns and the English column has no duplicates', () => {
  const head = csv.split('\n')[0]; for (const n of ['English', 'Français', 'Yorùbá', 'Igbo', 'Hausa']) assert.ok(head.includes(n), n);
  const keys = csv.split('\n').slice(1).filter(Boolean).map(l => l.split(',')[0]); assert.equal(new Set(keys).size, keys.length);
});
test('no Yorùbá, Igbo or Hausa file is shipped: they must come from reviewed human translation', () => { for (const c of ['yo', 'ig', 'ha']) assert.equal(existsSync(`i18n-${c}.json`), false, c); });
