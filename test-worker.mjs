/* Unit tests for the edge Worker (worker.js): runs in plain Node with a mocked network. `npm run test:unit` */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import worker, { fv, KINDS, _resetTokenCache, sha256 } from './worker.js';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const env = { ALLOWED_ORIGINS: 'https://site.test', TURNSTILE_SECRET: 's', FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ project_id: 'proj', client_email: 'sa@proj.iam', private_key: privateKey }) };
const ORIGIN = 'https://site.test';
let calls, turnstileOk, firestoreStatus;

// in-memory Cache API
const store = new Map();
globalThis.caches = { default: { match: async r => { const v = store.get(r.url); return v ? new Response(v) : undefined; }, put: async (r, res) => { store.set(r.url, await res.text()); } } };

beforeEach(() => {
  calls = []; turnstileOk = true; firestoreStatus = 200; store.clear(); _resetTokenCache();
  globalThis.fetch = async (url, init = {}) => {
    url = String(url); calls.push({ url, init });
    if (url.startsWith('https://oauth2.googleapis.com/token')) return Response.json({ access_token: 'tok', expires_in: 3600 });
    if (url.startsWith('https://challenges.cloudflare.com/')) return Response.json({ success: turnstileOk });
    if (url.startsWith('https://firestore.googleapis.com/')) return new Response('{}', { status: firestoreStatus });
    throw new Error('unexpected fetch ' + url);
  };
});

const post = (path, body, headers = {}) => new Request('https://edge.test' + path, { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN, 'cf-connecting-ip': '1.2.3.4', ...headers }, body: JSON.stringify(body) });
const run = (req) => worker.fetch(req, env, { waitUntil() {} });
const good = { request: 'Please pray for my family', name: 'Ada', turnstile: 'tkn' };
const fsCalls = () => calls.filter(c => c.url.startsWith('https://firestore.googleapis.com/'));

test('health check works and needs no origin', async () => { const r = await run(new Request('https://edge.test/health')); assert.equal(r.status, 200); assert.equal((await r.json()).ok, true); });
test('CORS preflight allowed only for configured origins', async () => {
  const ok = await run(new Request('https://edge.test/v1/submit/prayer', { method: 'OPTIONS', headers: { origin: ORIGIN } }));
  assert.equal(ok.status, 204); assert.equal(ok.headers.get('access-control-allow-origin'), ORIGIN);
  const bad = await run(new Request('https://edge.test/v1/submit/prayer', { method: 'OPTIONS', headers: { origin: 'https://evil.test' } }));
  assert.equal(bad.status, 403); assert.equal(bad.headers.get('access-control-allow-origin'), null);
});
test('POST from a foreign origin is rejected before anything else happens', async () => {
  const r = await run(post('/v1/submit/prayer', good, { origin: 'https://evil.test' })); assert.equal(r.status, 403); assert.equal(calls.length, 0);
});
test('POST without an Origin header is rejected', async () => {
  const r = await run(new Request('https://edge.test/v1/submit/prayer', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(good) })); assert.equal(r.status, 403);
});
test('valid prayer: Turnstile verified, then written to Firestore with a service-account token', async () => {
  const r = await run(post('/v1/submit/prayer', good)); assert.equal(r.status, 200); assert.equal((await r.json()).ok, true);
  assert.equal(r.headers.get('access-control-allow-origin'), ORIGIN);
  const f = fsCalls(); assert.equal(f.length, 1);
  assert.match(f[0].url, /projects\/proj\/databases\/\(default\)\/documents\/prayer_requests$/);
  assert.equal(f[0].init.headers.authorization, 'Bearer tok');
  const doc = JSON.parse(f[0].init.body).fields;
  assert.equal(doc.status.stringValue, 'pending'); assert.equal(doc.request.stringValue, good.request); assert.ok(doc.timestamp.timestampValue);
  assert.equal(doc.turnstile, undefined, 'the CAPTCHA token must never be stored');
});
test('JWT is a well-formed RS256 assertion', async () => {
  await run(post('/v1/submit/prayer', good));
  const t = calls.find(c => c.url.includes('oauth2')); const jwt = new URLSearchParams(t.init.body).get('assertion').split('.');
  assert.equal(jwt.length, 3); assert.equal(JSON.parse(Buffer.from(jwt[0], 'base64url')).alg, 'RS256');
  const claim = JSON.parse(Buffer.from(jwt[1], 'base64url')); assert.equal(claim.iss, 'sa@proj.iam'); assert.match(claim.scope, /datastore/);
});
test('access token is cached across requests', async () => { await run(post('/v1/submit/prayer', good)); await run(post('/v1/submit/prayer', { ...good, request: 'Another request here' }, { 'cf-connecting-ip': '9.9.9.9' })); assert.equal(calls.filter(c => c.url.includes('oauth2')).length, 1); });
test('failed Turnstile -> 403 and NOTHING is written', async () => { turnstileOk = false; const r = await run(post('/v1/submit/prayer', good)); assert.equal(r.status, 403); assert.equal(fsCalls().length, 0); });
test('missing Turnstile token -> 400', async () => { const r = await run(post('/v1/submit/prayer', { request: 'Please pray for me' })); assert.equal(r.status, 400); assert.equal(fsCalls().length, 0); });
test('Turnstile can be disabled ONLY by explicit config (local testing)', async () => { const r = await worker.fetch(post('/v1/submit/prayer', { request: 'Please pray for me' }), { ...env, TURNSTILE_REQUIRED: 'false' }, {}); assert.equal(r.status, 200); });
test('missing TURNSTILE_SECRET fails closed (503), never open', async () => { const r = await worker.fetch(post('/v1/submit/prayer', good), { ...env, TURNSTILE_SECRET: '' }, {}); assert.equal(r.status, 503); assert.equal(fsCalls().length, 0); });
test('honeypot: pretend success, write nothing, no Turnstile call', async () => { const r = await run(post('/v1/submit/prayer', { ...good, website: 'http://spam' })); assert.equal(r.status, 200); assert.equal(calls.length, 0); });
test('rate limit: 6th submission from one visitor is 429 with Retry-After', async () => {
  for (let i = 0; i < 5; i++) assert.equal((await run(post('/v1/submit/prayer', good))).status, 200);
  const r = await run(post('/v1/submit/prayer', good)); assert.equal(r.status, 429); assert.ok(r.headers.get('retry-after'));
});
test('rate limit is per visitor', async () => { for (let i = 0; i < 5; i++) await run(post('/v1/submit/prayer', good)); assert.equal((await run(post('/v1/submit/prayer', good, { 'cf-connecting-ip': '5.6.7.8' }))).status, 200); });
for (const [name, body] of [
  ['prayer too short', { ...good, request: 'hi' }], ['prayer too long', { ...good, request: 'x'.repeat(2001) }], ['prayer bad phone', { ...good, phone: 'abc' }],
  ['prayer unknown type', { ...good, type: 'hack' }], ['name too long', { ...good, name: 'n'.repeat(81) }]
]) test('validation: ' + name, async () => { const r = await run(post('/v1/submit/prayer', body)); assert.equal(r.status, 400); assert.equal(fsCalls().length, 0); assert.ok((await r.json()).error); });
test('unknown fields are dropped, not stored', async () => { await run(post('/v1/submit/prayer', { ...good, isAdmin: true, status: 'answered' })); const doc = JSON.parse(fsCalls()[0].init.body).fields; assert.equal(doc.isAdmin, undefined); assert.equal(doc.status.stringValue, 'pending'); });
test('control characters are stripped', async () => { await run(post('/v1/submit/prayer', { ...good, request: 'Pray\u0000 for\u0007 me please' })); assert.equal(JSON.parse(fsCalls()[0].init.body).fields.request.stringValue, 'Pray for me please'); });
test('newsletter: invalid email rejected, valid one stored under a hash id; duplicate = success', async () => {
  assert.equal((await run(post('/v1/submit/newsletter', { email: 'nope', turnstile: 't' }))).status, 400);
  const r = await run(post('/v1/submit/newsletter', { email: 'Ada@Example.com ', turnstile: 't' })); assert.equal(r.status, 200);
  assert.ok(fsCalls()[0].url.endsWith('documentId=' + await sha256('ada@example.com')));
  firestoreStatus = 409; const again = await run(post('/v1/submit/newsletter', { email: 'ada@example.com', turnstile: 't' }, { 'cf-connecting-ip': '8.8.8.8' })); assert.equal(again.status, 200);
});
test('visit: requires consent and a contact method', async () => {
  const v = { name: 'Ada Obi', email: 'a@b.co', consent: true, turnstile: 't' };
  assert.equal((await run(post('/v1/submit/visit', { ...v, consent: false }))).status, 400);
  assert.equal((await run(post('/v1/submit/visit', { ...v, email: '', phone: '' }))).status, 400);
  assert.equal((await run(post('/v1/submit/visit', v))).status, 200);
});
test('testimony: stored as pending, cannot self-approve', async () => {
  const r = await run(post('/v1/submit/testimony', { story: 'God healed me and I am grateful forever.', consent: true, status: 'approved', turnstile: 't' })); assert.equal(r.status, 200);
  assert.equal(JSON.parse(fsCalls()[0].init.body).fields.status.stringValue, 'pending');
});
test('oversized body -> 413; wrong content type -> 415; bad JSON -> 400', async () => {
  assert.equal((await run(post('/v1/submit/prayer', { ...good, pad: 'x'.repeat(20000) }))).status, 413);
  assert.equal((await run(new Request('https://edge.test/v1/submit/prayer', { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'text/plain' }, body: '{}' }))).status, 415);
  assert.equal((await run(new Request('https://edge.test/v1/submit/prayer', { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json' }, body: '{nope' }))).status, 400);
});
test('Firestore outage -> 502 with a friendly message (no internals leaked)', async () => { firestoreStatus = 500; const r = await run(post('/v1/submit/prayer', good)); assert.equal(r.status, 502); assert.doesNotMatch((await r.json()).error, /firestore|token|proj/i); });
test('unknown kind and unknown route -> 404', async () => { assert.equal((await run(post('/v1/submit/admin', good))).status, 404); assert.equal((await run(post('/v1/nope', good))).status, 404); });
test('prayer wall counter increments atomically via a commit transform on an EXISTING doc only', async () => {
  const r = await run(post('/v1/prayed/abcdefghij1234', { turnstile: 't' })); assert.equal(r.status, 200);
  const f = fsCalls()[0]; assert.match(f.url, /documents:commit$/); const w = JSON.parse(f.init.body).writes[0]; assert.equal(w.transform.fieldTransforms[0].increment.integerValue, '1'); assert.match(w.transform.document, /prayer_wall\/abcdefghij1234$/); assert.equal(w.currentDocument.exists, true);
  assert.equal((await run(post('/v1/prayed/..%2Fadmins', { turnstile: 't' }))).status, 404);
});
test('prayed: needs Turnstile and is rate limited', async () => { turnstileOk = false; assert.equal((await run(post('/v1/prayed/abcdefghij1234', { turnstile: 't' }))).status, 403); turnstileOk = true; for (let i = 0; i < 30; i++) await run(post('/v1/prayed/abcdefghij1234', { turnstile: 't' })); assert.equal((await run(post('/v1/prayed/abcdefghij1234', { turnstile: 't' }))).status, 429); });
test('push subscribe validates the shape and stores under a hash of the endpoint', async () => {
  const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/abcdefghijklmnop', keys: { p256dh: 'B'.repeat(65), auth: 'a'.repeat(22) } };
  assert.equal((await run(post('/v1/push/subscribe', { subscription: { endpoint: 'http://insecure/x', keys: sub.keys }, turnstile: 't' }))).status, 400);
  assert.equal((await run(post('/v1/push/subscribe', { subscription: { ...sub, keys: { p256dh: 'bad!', auth: 'x' } }, turnstile: 't' }))).status, 400);
  const r = await run(post('/v1/push/subscribe', { subscription: sub, turnstile: 't' })); assert.equal(r.status, 200);
  assert.ok(fsCalls()[0].url.includes('push_subscriptions/' + await sha256(sub.endpoint)));
  assert.equal(fsCalls()[0].init.method, 'PATCH');
});
test('Firestore value encoder', () => {
  assert.deepEqual(fv({ a: 'x', b: 2, c: 1.5, d: true, e: [1], f: null }).mapValue.fields, { a: { stringValue: 'x' }, b: { integerValue: '2' }, c: { doubleValue: 1.5 }, d: { booleanValue: true }, e: { arrayValue: { values: [{ integerValue: '1' }] } }, f: { nullValue: null } });
});
test('media proxy: refuses without API key, rejects bad ids and non-media files', async () => {
  assert.equal((await run(new Request('https://edge.test/v1/media/abcdefghij1234'))).status, 503);
  const e2 = { ...env, GOOGLE_API_KEY: 'k' };
  assert.equal((await worker.fetch(new Request('https://edge.test/v1/media/a b'), e2, {})).status, 404);
  globalThis.fetch = async u => String(u).includes('alt=media') ? new Response('x') : Response.json({ mimeType: 'application/zip', size: '10', name: 'a.zip' });
  assert.equal((await worker.fetch(new Request('https://edge.test/v1/media/abcdefghij1234'), e2, {})).status, 415);
});
test('media proxy: streams audio with Range passthrough and a cache header', async () => {
  const e2 = { ...env, GOOGLE_API_KEY: 'k' }; let sawRange = '';
  globalThis.fetch = async (u, init = {}) => String(u).includes('alt=media') ? (sawRange = init.headers?.range || '', new Response('abc', { status: 206, headers: { 'content-range': 'bytes 0-2/10', 'content-length': '3' } })) : Response.json({ mimeType: 'audio/mpeg', size: '10', name: 'a.mp3' });
  const r = await worker.fetch(new Request('https://edge.test/v1/media/abcdefghij1234', { headers: { range: 'bytes=0-2' } }), e2, {});
  assert.equal(r.status, 206); assert.equal(sawRange, 'bytes=0-2'); assert.equal(r.headers.get('content-type'), 'audio/mpeg'); assert.equal(r.headers.get('accept-ranges'), 'bytes'); assert.equal(await r.text(), 'abc');
});
