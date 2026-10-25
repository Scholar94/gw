/* Performance budgets that FAIL THE BUILD (gzipped sizes, what a first visit downloads per page). Run: node --test test-budget.mjs
   Raise a limit deliberately in this file when a feature genuinely needs it: that is the point of a budget. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const KB = 1024, B = { jsPerPage: 70 * KB, cssPerPage: 32 * KB, htmlPerPage: 20 * KB, singleJs: 40 * KB, singleCss: 24 * KB, imageOnPage: 160 * KB, preloadedFonts: 150 * KB, totalFirstLoad: 340 * KB };
const gz = f => gzipSync(readFileSync(f), { level: 9 }).length;
const pages = readdirSync('.').filter(f => f.endsWith('.html') && !f.startsWith('admin-'));
const refs = (h, re) => [...h.matchAll(re)].map(m => m[1]).filter(u => !/^(https?:)?\/\//.test(u) && !u.startsWith('data:') && existsSync(u.split('#')[0].split('?')[0]));

for (const f of pages) {
  const h = readFileSync(f, 'utf8'), js = [...new Set(refs(h, /<script[^>]*\bsrc="([^"]+)"/g))], css = [...new Set(refs(h, /<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g))];
  const imgs = [...new Set(refs(h, /<img[^>]*\bsrc="([^"]+)"/g))], fonts = [...new Set(refs(h, /<link[^>]*rel="preload"[^>]*as="font"[^>]*href="([^"]+)"|<link[^>]*href="([^"]+)"[^>]*rel="preload"[^>]*as="font"/g))];
  const jsB = js.reduce((a, x) => a + gz(x), 0), cssB = css.reduce((a, x) => a + gz(x), 0), imgB = imgs.reduce((a, x) => a + statSync(x).size, 0), fontB = fonts.reduce((a, x) => a + statSync(x).size, 0);
  test(`budget ${f}: JS ${Math.round(jsB / KB)}KB, CSS ${Math.round(cssB / KB)}KB, HTML ${Math.round(gz(f) / KB)}KB`, () => {
    assert.ok(jsB <= B.jsPerPage, `JS ${jsB} > ${B.jsPerPage}`); assert.ok(cssB <= B.cssPerPage, `CSS ${cssB} > ${B.cssPerPage}`); assert.ok(gz(f) <= B.htmlPerPage, 'HTML too large');
    assert.ok(imgB <= B.imageOnPage * Math.max(1, imgs.length), 'images too large'); assert.ok(fontB <= B.preloadedFonts, `preloaded fonts ${fontB} > ${B.preloadedFonts}`);
    assert.ok(jsB + cssB + gz(f) + fontB <= B.totalFirstLoad, 'total first-load code+fonts over budget');
  });
}
test('no single script or stylesheet is bloated', () => {
  for (const f of readdirSync('.').filter(x => /\.(js|mjs)$/.test(x) && !/^(test-|build-|job-|worker|admin|upload|sw|wrangler)/.test(x))) if (f.endsWith('.js')) assert.ok(gz(f) <= B.singleJs, `${f} is ${gz(f)} gz bytes`);
  for (const f of readdirSync('.').filter(x => x.endsWith('.css'))) assert.ok(gz(f) <= B.singleCss, `${f} is ${gz(f)} gz bytes`);
});
test('the 4 MB Bible files are NEVER loaded by page markup (only fetched on demand by scripture.js)', () => {
  for (const f of pages) assert.ok(!/bible-(kjv|web)\.json/.test(readFileSync(f, 'utf8')), f);
});
test('every image on a public page declares width/height (prevents layout shift) or is inline-sized', () => {
  for (const f of pages) for (const m of readFileSync(f, 'utf8').matchAll(/<img\b[^>]*>/g)) assert.ok(/\bwidth=/.test(m[0]) && /\bheight=/.test(m[0]) || /style="[^"]*(width|height)/.test(m[0]), `${f}: ${m[0].slice(0, 90)}`);
});
