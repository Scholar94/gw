import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import worker, { _resetTokenCache, fv, dv } from './worker.js';
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const env = { ALLOWED_ORIGINS: 'https://site.test,https://u.github.io', TURNSTILE_SECRET: 's', PAYSTACK_SECRET: 'sk_test_x', FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ project_id: 'proj', client_email: 'sa@proj.iam', private_key: privateKey }) };
const store = new Map(); let clock = 0, psCalls, psVerify, psInit;
const rc = new Map(); globalThis.caches = { default: { match: async r => (rc.has(r.url) ? new Response(rc.get(r.url)) : undefined), put: async (r, res) => { rc.set(r.url, await res.text()); } } };
const ROOT = 'https://firestore.googleapis.com/v1/projects/proj/databases/(default)/documents/', rel = n => n.split('/documents/')[1];
const dec = f => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, dv(v)]));
beforeEach(() => { store.clear(); rc.clear(); _resetTokenCache(); psCalls = []; psVerify = { status: 'success', amount: 500000, currency: 'NGN', paid_at: '2026-01-02T03:04:05Z', channel: 'card' }; psInit = null; globalThis.__ts = true;
  globalThis.fetch = async (url, init = {}) => { url = String(url);
    if (url.startsWith('https://oauth2.')) return Response.json({ access_token: 't', expires_in: 3600 });
    if (url.startsWith('https://challenges.')) return Response.json({ success: globalThis.__ts });
    if (url.startsWith('https://api.paystack.co')) { psCalls.push({ url, init }); if (init.headers.authorization !== 'Bearer sk_test_x') return new Response('{}', { status: 401 });
      if (url.endsWith('/transaction/initialize')) return psInit || Response.json({ status: true, data: { authorization_url: 'https://checkout.paystack.com/abc123', reference: JSON.parse(init.body).reference } });
      if (url.includes('/transaction/verify/')) return psVerify === 404 ? new Response('{}', { status: 404 }) : Response.json({ status: true, data: psVerify }); }
    if (url.endsWith(':commit')) { const ws = JSON.parse(init.body).writes; for (const w of ws) { const p = rel(w.update.name), cur = store.get(p); if (w.currentDocument.exists === false && cur) return new Response(JSON.stringify({ error: { status: 'ALREADY_EXISTS' } }), { status: 409 }); if (w.currentDocument.updateTime && (!cur || cur.t !== w.currentDocument.updateTime)) return new Response(JSON.stringify({ error: { status: 'FAILED_PRECONDITION' } }), { status: 400 }); }
      for (const w of ws) { const p = rel(w.update.name), cur = store.get(p); store.set(p, { fields: w.updateMask ? { ...(cur ? cur.fields : {}), ...Object.fromEntries(w.updateMask.fieldPaths.map(f => [f, w.update.fields[f]])) } : w.update.fields, t: String(++clock) }); } return Response.json({}); }
    if (url.startsWith(ROOT)) { const d = store.get(url.slice(ROOT.length)); return d ? Response.json({ fields: d.fields, updateTime: d.t }) : new Response('{}', { status: 404 }); }
    throw new Error('unexpected ' + url); }; });
let n = 0; const call = (path, body, o = {}) => worker.fetch(new Request('https://e.test' + path, { method: 'POST', headers: { 'content-type': 'application/json', origin: o.origin || 'https://site.test', 'cf-connecting-ip': '1.1.1.' + (++n) }, body: JSON.stringify(body) }), { ...env, ...(o.env || {}) }, {});
const good = { amount: 5000, email: 'donor@x.org', purpose: 'tithe', name: 'Ada', returnUrl: 'https://site.test/give.html', turnstile: 't' };
const donation = ref => dec(store.get('donations/' + ref).fields);
test('init: records a PENDING donation first, calls Paystack in kobo with our reference, returns the hosted checkout URL', async () => {
  const r = await call('/v1/give/init', good), j = await r.json(); assert.equal(r.status, 200); assert.match(j.reference, /^cac_[A-Za-z0-9]{24}$/); assert.equal(j.url, 'https://checkout.paystack.com/abc123');
  const d = donation(j.reference); assert.deepEqual([d.status, d.amount, d.amountKobo, d.currency, d.purpose, d.name], ['pending', 5000, 500000, 'NGN', 'tithe', 'Ada']); assert.equal(d.email, undefined, 'email is NOT stored: Paystack keeps it');
  const body = JSON.parse(psCalls[0].init.body); assert.equal(body.amount, 500000); assert.equal(body.reference, j.reference); assert.equal(body.callback_url, 'https://site.test/give.html'); assert.equal(body.email, 'donor@x.org');
});
test('init validation: amount range/whole number, email, purpose, name length', async () => {
  for (const o of [{ amount: 99 }, { amount: 5000001 }, { amount: 50.5 }, { amount: 'x' }, { email: 'bad' }, { purpose: 'bribe' }, { name: 'n'.repeat(61) }]) assert.equal((await call('/v1/give/init', { ...good, ...o })).status, 400, JSON.stringify(o));
  assert.equal(psCalls.length, 0); assert.equal(store.size, 0);
});
test('return URL must be OUR give page on an allowed origin (no open redirect)', async () => {
  for (const u of ['https://evil.test/give.html', 'https://site.test/other.html', 'https://site.test/give.html?x=1', 'https://site.test/give.html#a', 'javascript:alert(1)', 'nonsense']) assert.equal((await call('/v1/give/init', { ...good, returnUrl: u })).status, 400, u);
  assert.equal((await call('/v1/give/init', { ...good, returnUrl: 'https://u.github.io/repo/give.html' })).status, 200, 'GitHub Pages sub-path works');
});
test('init needs Turnstile, an allowed origin and the secret to be configured', async () => {
  globalThis.__ts = false; assert.equal((await call('/v1/give/init', good)).status, 403); globalThis.__ts = true;
  assert.equal((await call('/v1/give/init', good, { origin: 'https://evil.test' })).status, 403); assert.equal((await call('/v1/give/init', good, { env: { PAYSTACK_SECRET: '' } })).status, 503);
});
test('the checkout URL must really be Paystack (a hijacked response is refused)', async () => { psInit = Response.json({ status: true, data: { authorization_url: 'https://evil.test/pay' } }); assert.equal((await call('/v1/give/init', good)).status, 502); });
test('Paystack down or refusing -> friendly 502, no internals', async () => { psInit = new Response('{}', { status: 500 }); const r = await call('/v1/give/init', good); assert.equal(r.status, 502); assert.doesNotMatch((await r.json()).error, /sk_|secret|bearer/i); });
async function start(o = {}) { return (await (await call('/v1/give/init', { ...good, ...o })).json()).reference; }
test('verify: a genuine matching payment flips the record to success once; repeat calls do not call Paystack again', async () => {
  const ref = await start(); const r = await call('/v1/give/verify', { reference: ref }), j = await r.json(); assert.deepEqual([r.status, j.status, j.amount, j.currency], [200, 'success', 5000, 'NGN']);
  const d = donation(ref); assert.equal(d.status, 'success'); assert.equal(d.channel, 'card'); assert.ok(d.paidAt); const calls = psCalls.length; assert.equal((await (await call('/v1/give/verify', { reference: ref })).json()).status, 'success'); assert.equal(psCalls.length, calls);
});
test('verify: an amount or currency that differs from what we asked for is NEVER marked successful', async () => {
  const ref = await start(); psVerify = { ...psVerify, amount: 100 }; assert.equal((await (await call('/v1/give/verify', { reference: ref })).json()).status, 'mismatch'); assert.equal(donation(ref).status, 'mismatch');
  const ref2 = await start(); psVerify = { ...psVerify, amount: 500000, currency: 'USD' }; assert.equal((await (await call('/v1/give/verify', { reference: ref2 })).json()).status, 'mismatch');
});
test('verify: abandoned/failed stay unsuccessful; ongoing stays pending', async () => {
  const ref = await start(); psVerify = { status: 'abandoned' }; assert.equal((await (await call('/v1/give/verify', { reference: ref })).json()).status, 'abandoned'); assert.equal(donation(ref).status, 'abandoned');
  psVerify = { status: 'ongoing' }; const r2 = await start(); assert.equal((await (await call('/v1/give/verify', { reference: r2 })).json()).status, 'pending');
});
test('verify: unknown or malformed references are 404 and never reach Paystack', async () => {
  for (const ref of ['cac_' + 'x'.repeat(24), 'nope', '../x', 'cac_short']) assert.equal((await call('/v1/give/verify', { reference: ref })).status, 404, ref); assert.equal(psCalls.length, 0);
});
test('verify cannot be used to mark an arbitrary reference as paid without Paystack agreeing', async () => { const ref = await start(); psVerify = { status: 'failed' }; assert.equal((await (await call('/v1/give/verify', { reference: ref })).json()).status, 'failed'); assert.notEqual(donation(ref).status, 'success'); });
test('rate limit on giving endpoints', async () => { for (let i = 0; i < 8; i++) await worker.fetch(new Request('https://e.test/v1/give/verify', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://site.test', 'cf-connecting-ip': '7.7.7.7' }, body: '{"reference":"nope"}' }), env, {}); const r = await worker.fetch(new Request('https://e.test/v1/give/verify', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://site.test', 'cf-connecting-ip': '7.7.7.7' }, body: '{"reference":"nope"}' }), env, {}); assert.equal(r.status, 429); });
