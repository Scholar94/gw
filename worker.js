/* =====================================================================
   CAC GOOD WORKS: EDGE API (Cloudflare Worker, free plan, no card)

   Sits between the public forms and Firestore:
     1. verifies a Cloudflare Turnstile token (free CAPTCHA),
     2. rate-limits per visitor,
     3. validates + sanitises the payload (same limits as the old Firestore rules),
     4. writes to Firestore itself with a service account.
   Because only this Worker writes public submissions, firestore.rules can refuse
   every public write (see firestore.rules).

   Routes
     GET  /health                 uptime check (use with UptimeRobot)
     POST /v1/submit/{kind}       kind = prayer | newsletter | visit | testimony
     POST /v1/prayed/{id}         "I prayed" counter on the prayer wall
     POST /v1/rsvp                reserve a place at an event (capacity + waiting list), returns a ticket code
     POST /v1/rsvp/cancel         cancel by ticket code (promotes the next person on the waiting list)
     GET  /v1/rsvp/{code}         ticket status for the QR ticket page
     POST /v1/give/init           start a Paystack payment (returns the hosted checkout URL)
     POST /v1/give/verify         verify a Paystack payment after the donor returns
     POST /v1/push/subscribe      store a Web Push subscription
     POST /v1/push/unsubscribe    remove it
     GET  /v1/media/{driveId}     stream a public Google Drive audio/image (Range supported, edge-cached)

   Configuration (wrangler.toml [vars] and `wrangler secret put`)
     ALLOWED_ORIGINS            comma-separated site origins, e.g. https://you.github.io
     TURNSTILE_REQUIRED         "true" (default) | "false" (local testing only)
     TURNSTILE_SECRET           secret
     FIREBASE_SERVICE_ACCOUNT   secret (service-account JSON; role "Cloud Datastore User" is enough)
     GOOGLE_API_KEY             secret, optional (Drive API key for /v1/media)
     PAYSTACK_SECRET            secret, optional (online giving). GIVE_CURRENCY var (default NGN)
   ===================================================================== */

const MAX_BODY = 16 * 1024;
const RATE = {                       // [max requests, window seconds] per visitor
  submit: [5, 600], prayed: [30, 3600], rsvp: [6, 600], rsvpget: [60, 600], give: [8, 600], push: [10, 3600], media: [600, 600]
};

/* ---------- small helpers ---------- */
const enc = new TextEncoder();
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
export const sha256 = async s => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const clean = v => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^\+?[0-9\s()-]{7,20}$/;

export class HttpError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; }
}

/* ---------- validation (mirrors the limits that used to live in firestore.rules) ---------- */
const str = (b, k, min, max, label) => {
  const v = clean(b[k]);
  if (v.length < min) throw new HttpError(400, min ? `${label} is required${min > 1 ? ` (at least ${min} characters)` : ''}.` : `${label} is invalid.`);
  if (v.length > max) throw new HttpError(400, `${label} must be ${max} characters or fewer.`);
  return v;
};
const opt = (b, k, max, label) => str(b, k, 0, max, label);

export const KINDS = {
  prayer: {
    collection: 'prayer_requests',
    build(b) {
      const phone = opt(b, 'phone', 25, 'Phone');
      if (phone && !PHONE.test(phone)) throw new HttpError(400, 'Please enter a valid phone number.');
      const type = clean(b.type || 'prayer').toLowerCase();
      if (!['prayer', 'testimony', 'counselling', 'general'].includes(type)) throw new HttpError(400, 'Unknown request type.');
      return { name: opt(b, 'name', 80, 'Name'), phone, request: str(b, 'request', 5, 2000, 'Your request'), type, status: 'pending' };
    }
  },
  newsletter: {
    collection: 'newsletters',
    async id(d) { return sha256(d.email); },          // one doc per address: re-subscribing is idempotent
    build(b) {
      const email = str(b, 'email', 5, 120, 'Email').toLowerCase();
      if (!EMAIL.test(email)) throw new HttpError(400, 'Please enter a valid email address.');
      return { email };
    }
  },
  visit: {
    collection: 'visitor_enquiries',
    build(b) {
      const email = opt(b, 'email', 120, 'Email'), phone = opt(b, 'phone', 25, 'Phone');
      if (!email && !phone) throw new HttpError(400, 'Please provide an email or phone number.');
      if (email && !EMAIL.test(email)) throw new HttpError(400, 'Please enter a valid email address.');
      if (phone && !PHONE.test(phone)) throw new HttpError(400, 'Please enter a valid phone number.');
      if (b.consent !== true) throw new HttpError(400, 'Please agree to be contacted.');
      return { name: str(b, 'name', 2, 80, 'Name'), email, phone, visitDate: opt(b, 'visitDate', 20, 'Visit date'), guests: opt(b, 'guests', 10, 'Guests'),
        message: opt(b, 'message', 1000, 'Message'), consent: true, status: 'new' };
    }
  },
  testimony: {
    collection: 'testimonies',
    build(b) {
      const email = opt(b, 'email', 120, 'Email');
      if (email && !EMAIL.test(email)) throw new HttpError(400, 'Please enter a valid email address.');
      if (b.consent !== true) throw new HttpError(400, 'Please confirm your consent to publish.');
      return { name: opt(b, 'name', 80, 'Name'), country: opt(b, 'country', 60, 'Country'), email, story: str(b, 'story', 30, 3000, 'Your testimony'), consent: true, status: 'pending' };
    }
  }
};

/* ---------- Firestore REST encoding ---------- */
export function fv(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(fv) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fv(x)])) } };
}
const fields = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, fv(v)]));

/* ---------- Google service-account auth (RS256 JWT via WebCrypto) ---------- */
let tokenCache = { token: '', exp: 0, key: '' };
function serviceAccount(env) {
  if (!env.FIREBASE_SERVICE_ACCOUNT) throw new HttpError(503, 'The server is not fully configured yet.');
  try { return JSON.parse(env.FIREBASE_SERVICE_ACCOUNT); } catch { throw new HttpError(503, 'The server is not fully configured yet.'); }
}
export async function accessToken(env, scope = 'https://www.googleapis.com/auth/datastore') {
  const sa = serviceAccount(env), now = Math.floor(Date.now() / 1000), cacheKey = sa.client_email + scope;
  if (tokenCache.key === cacheKey && tokenCache.exp - 60 > now) return tokenCache.token;
  const head = b64url(enc.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claim = b64url(enc.encode(JSON.stringify({ iss: sa.client_email, scope, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })));
  const der = Uint8Array.from(atob(sa.private_key.replace(/-----(BEGIN|END) PRIVATE KEY-----|\s/g, '')), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(head + '.' + claim));
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: head + '.' + claim + '.' + b64url(sig) })
  });
  if (!res.ok) throw new HttpError(502, 'Could not authenticate with the database.');
  const j = await res.json();
  tokenCache = { token: j.access_token, exp: now + (j.expires_in || 3600), key: cacheKey };
  return j.access_token;
}
export const _resetTokenCache = () => { tokenCache = { token: '', exp: 0, key: '' }; };

const base = env => `https://firestore.googleapis.com/v1/projects/${serviceAccount(env).project_id}/databases/(default)/documents`;

/** Create a document. Returns 'created' | 'exists' (idempotent callers treat both as success). */
export async function createDoc(env, collection, data, id) {
  const token = await accessToken(env);
  const url = `${base(env)}/${collection}` + (id ? `?documentId=${encodeURIComponent(id)}` : '');
  const res = await fetch(url, { method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify({ fields: fields({ ...data, timestamp: new Date() }) }) });
  if (res.status === 409) return 'exists';
  if (!res.ok) throw new HttpError(502, 'We could not save that right now. Please try again shortly.');
  return 'created';
}
export async function incrementField(env, docPath, field, by = 1) {
  const token = await accessToken(env), sa = serviceAccount(env);
  const name = `projects/${sa.project_id}/databases/(default)/documents/${docPath}`;
  const res = await fetch(`${base(env)}:commit`, { method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    body: JSON.stringify({ writes: [{ transform: { document: name, fieldTransforms: [{ fieldPath: field, increment: { integerValue: String(by) } }] }, currentDocument: { exists: true } }] }) });
  if (res.status === 400 || res.status === 404) throw new HttpError(404, 'Not found.');
  if (!res.ok) throw new HttpError(502, 'Please try again shortly.');
}
export async function putDoc(env, docPath, data) {            // upsert with a fixed id
  const token = await accessToken(env);
  const res = await fetch(`${base(env)}/${docPath}`, { method: 'PATCH', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify({ fields: fields(data) }) });
  if (!res.ok) throw new HttpError(502, 'We could not save that right now. Please try again shortly.');
}
export async function deleteDoc(env, docPath) {
  const token = await accessToken(env);
  const res = await fetch(`${base(env)}/${docPath}`, { method: 'DELETE', headers: { authorization: 'Bearer ' + token } });
  if (!res.ok && res.status !== 404) throw new HttpError(502, 'Please try again shortly.');
}

/* ---------- Turnstile ---------- */
export async function verifyTurnstile(env, token, ip) {
  if (String(env.TURNSTILE_REQUIRED ?? 'true') === 'false') return true;
  if (!env.TURNSTILE_SECRET) throw new HttpError(503, 'The server is not fully configured yet.');
  if (!token || typeof token !== 'string' || token.length > 2048) throw new HttpError(400, 'Please complete the security check and try again.');
  const body = new FormData(); body.append('secret', env.TURNSTILE_SECRET); body.append('response', token); if (ip) body.append('remoteip', ip);
  let res;
  try { res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body }); } catch { throw new HttpError(502, 'Security check unavailable. Please try again.'); }
  const j = await res.json().catch(() => ({}));
  if (!j.success) throw new HttpError(403, 'The security check failed. Please refresh the page and try again.');
  return true;
}

/* ---------- rate limiting (Cache API: free, per data centre, best-effort; Turnstile is the main defence) ---------- */
export async function allow(bucket, ip) {
  if (typeof caches === 'undefined' || !caches.default) return { ok: true };
  const [max, win] = RATE[bucket], req = new Request(`https://rate.invalid/${bucket}/${(await sha256('cac|' + ip)).slice(0, 24)}`);
  const hit = await caches.default.match(req), n = hit ? parseInt(await hit.text(), 10) || 0 : 0;
  if (n >= max) return { ok: false, retryAfter: win };
  await caches.default.put(req, new Response(String(n + 1), { headers: { 'cache-control': `max-age=${win}` } }));
  return { ok: true };
}

/* ---------- CORS / responses ---------- */
const origins = env => String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim().replace(/\/$/, '')).filter(Boolean);
function corsHeaders(req, env) {
  const o = req.headers.get('origin'), h = { vary: 'Origin' };
  if (o && origins(env).includes(o)) Object.assign(h, { 'access-control-allow-origin': o, 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type, range', 'access-control-max-age': '86400', 'access-control-expose-headers': 'content-range, accept-ranges, content-length' });
  return h;
}
const json = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers } });

async function readJson(req) {
  if (!/^application\/json/i.test(req.headers.get('content-type') || '')) throw new HttpError(415, 'Unsupported content type.');
  const text = await req.text();
  if (text.length > MAX_BODY) throw new HttpError(413, 'That submission is too large.');
  try { const b = JSON.parse(text); if (!b || typeof b !== 'object' || Array.isArray(b)) throw 0; return b; } catch { throw new HttpError(400, 'Invalid request.'); }
}

/* ---------- route handlers ---------- */
async function submit(req, env, kind) {
  const spec = KINDS[kind]; if (!spec) throw new HttpError(404, 'Not found.');
  const ip = req.headers.get('cf-connecting-ip') || 'unknown', body = await readJson(req);
  if (clean(body.website)) return json(200, { ok: true });                                  // honeypot: pretend success
  const rl = await allow('submit', ip); if (!rl.ok) throw new HttpError(429, 'Too many submissions. Please try again later.', { retryAfter: rl.retryAfter });
  const data = spec.build(body);                                                              // validate first: cheap, no Turnstile token burned on bad input
  await verifyTurnstile(env, body.turnstile, ip);
  await createDoc(env, spec.collection, data, spec.id ? await spec.id(data) : undefined);
  return json(200, { ok: true });
}

async function prayed(req, env, id) {
  if (!/^[A-Za-z0-9]{10,40}$/.test(id)) throw new HttpError(404, 'Not found.');
  const ip = req.headers.get('cf-connecting-ip') || 'unknown', body = await readJson(req);
  const rl = await allow('prayed', ip); if (!rl.ok) throw new HttpError(429, 'Slow down a little. Thank you for praying!', { retryAfter: rl.retryAfter });
  await verifyTurnstile(env, body.turnstile, ip);
  await incrementField(env, `prayer_wall/${id}`, 'prayedCount', 1);
  return json(200, { ok: true });
}


/* ---------- Firestore reads, precondition commits (optimistic concurrency) ---------- */
export function dv(v) {
  if (!v) return null; const k = Object.keys(v)[0];
  if (k === 'stringValue' || k === 'booleanValue' || k === 'doubleValue') return v[k]; if (k === 'integerValue') return Number(v[k]); if (k === 'timestampValue') return v[k]; if (k === 'nullValue') return null;
  if (k === 'arrayValue') return (v[k].values || []).map(dv); if (k === 'mapValue') return Object.fromEntries(Object.entries(v[k].fields || {}).map(([a, b]) => [a, dv(b)])); return null;
}
const decode = f => Object.fromEntries(Object.entries(f || {}).map(([k, v]) => [k, dv(v)]));
export async function fsGet(env, path) {
  const token = await accessToken(env), res = await fetch(`${base(env)}/${path}`, { headers: { authorization: 'Bearer ' + token } });
  if (res.status === 404) return null; if (!res.ok) throw new HttpError(502, 'Please try again shortly.');
  const j = await res.json(); return { data: decode(j.fields), updateTime: j.updateTime };
}
export async function fsQuery(env, collection, equals, limit = 200) {
  const token = await accessToken(env), filters = Object.entries(equals).map(([f, v]) => ({ fieldFilter: { field: { fieldPath: f }, op: 'EQUAL', value: fv(v) } }));
  const res = await fetch(`${base(env)}:runQuery`, { method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: collection }], where: filters.length > 1 ? { compositeFilter: { op: 'AND', filters } } : filters[0], limit } }) });
  if (!res.ok) throw new HttpError(502, 'Please try again shortly.');
  return (await res.json()).filter(r => r.document).map(r => ({ id: r.document.name.split('/').pop(), data: decode(r.document.fields), updateTime: r.document.updateTime }));
}
const docName = (env, p) => `projects/${serviceAccount(env).project_id}/databases/(default)/documents/${p}`;
export const W = {
  create: (env, p, d) => ({ update: { name: docName(env, p), fields: fields(d) }, currentDocument: { exists: false } }),
  patch: (env, p, d, updateTime) => ({ update: { name: docName(env, p), fields: fields(d) }, updateMask: { fieldPaths: Object.keys(d) }, currentDocument: { updateTime } }),
  del: (env, p) => ({ delete: docName(env, p) })
};
/** Atomic multi-document commit. Returns 'ok' | 'exists' (a create hit an existing doc) | 'conflict' (a precondition failed: someone else changed it). */
export async function fsCommit(env, writes) {
  const token = await accessToken(env), res = await fetch(`${base(env)}:commit`, { method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify({ writes }) });
  if (res.ok) return 'ok';
  const st = ((await res.json().catch(() => ({}))).error || {}).status;
  if (st === 'ALREADY_EXISTS') return 'exists'; if (st === 'FAILED_PRECONDITION' || st === 'ABORTED') return 'conflict';
  throw new HttpError(502, 'We could not save that right now. Please try again shortly.');
}

/* ---------- event RSVP: capacity, waiting list, tickets ---------- */
const CROCK = '0123456789ABCDEFGHJKMNPQRSTVWXYZ', CODE = /^[0-9A-HJKMNP-TV-Z]{12}$/, EVID = /^[A-Za-z0-9]{10,40}$/;
const newCode = () => [...crypto.getRandomValues(new Uint8Array(12))].map(x => CROCK[x & 31]).join('');
const todayLagos = () => new Date(Date.now() + 3600e3).toISOString().slice(0, 10);
const COUNTS0 = { confirmed: 0, waiting: 0, seq: 0 };
async function ensureCounts(env, eventId) { if (!(await fsGet(env, `rsvp_counts/${eventId}`))) await fsCommit(env, [W.create(env, `rsvp_counts/${eventId}`, COUNTS0)]); }
const cap = ev => Math.max(0, Math.floor(Number(ev.capacity) || 0));

async function rsvpCreate(req, env) {
  const ip = req.headers.get('cf-connecting-ip') || 'unknown', b = await readJson(req);
  if (clean(b.website)) return json(200, { ok: true });
  const rl = await allow('rsvp', ip); if (!rl.ok) throw new HttpError(429, 'Too many attempts. Please try again later.', { retryAfter: rl.retryAfter });
  const eventId = clean(b.eventId); if (!EVID.test(eventId)) throw new HttpError(400, 'Unknown event.');
  const email = opt(b, 'email', 120, 'Email'), phone = opt(b, 'phone', 25, 'Phone');
  if (!email && !phone) throw new HttpError(400, 'Please give an email address or phone number.'); if (email && !EMAIL.test(email)) throw new HttpError(400, 'Please enter a valid email address.'); if (phone && !PHONE.test(phone)) throw new HttpError(400, 'Please enter a valid phone number.');
  const name = str(b, 'name', 2, 80, 'Name'), party = Number(b.party); if (!Number.isInteger(party) || party < 1 || party > 4) throw new HttpError(400, 'You can reserve for 1 to 4 people.');
  await verifyTurnstile(env, b.turnstile, ip);
  const ev = await fsGet(env, `events/${eventId}`); if (!ev || !ev.data.rsvp || ev.data.status === 'completed' || String(ev.data.endDate || ev.data.date || '') < todayLagos()) throw new HttpError(404, 'RSVPs are not open for this event.');
  const c = cap(ev.data); if (c && party > c) throw new HttpError(400, 'That is more than this event can hold.');
  await ensureCounts(env, eventId);
  const keyId = await sha256(eventId + '|' + (email || phone).toLowerCase());
  for (let i = 0; i < 6; i++) {
    const counts = await fsGet(env, `rsvp_counts/${eventId}`), n = { ...COUNTS0, ...counts.data }, fits = !c || n.confirmed + party <= c;
    if (!fits && ev.data.waitlist === false) throw new HttpError(409, 'Sorry, this event is full.');
    const code = newCode(), status = fits ? 'confirmed' : 'waitlist', seq = n.seq + 1;
    const next = fits ? { confirmed: n.confirmed + party, seq } : { waiting: n.waiting + party, seq };
    const r = await fsCommit(env, [W.patch(env, `rsvp_counts/${eventId}`, next, counts.updateTime),
      W.create(env, `rsvps/${code}`, { eventId, eventTitle: String(ev.data.title || '').slice(0, 120), name, email, phone, party, status, seq, keyId, checkedIn: false, createdAt: new Date() }),
      W.create(env, `rsvp_keys/${keyId}`, { eventId, code })]);
    if (r === 'ok') return json(200, { ok: true, code, status, party });
    if (r === 'exists') throw new HttpError(409, 'You already have a reservation for this event. Open your ticket from the same device, or contact us.');
  }
  throw new HttpError(503, 'Many people are booking right now. Please try again in a moment.');
}

async function promote(env, eventId) {
  for (let i = 0; i < 20; i++) {
    const ev = await fsGet(env, `events/${eventId}`); if (!ev) return; const c = cap(ev.data);
    const counts = await fsGet(env, `rsvp_counts/${eventId}`); if (!counts) return; const n = { ...COUNTS0, ...counts.data };
    const waiting = (await fsQuery(env, 'rsvps', { eventId, status: 'waitlist' })).sort((a, b) => a.data.seq - b.data.seq);
    const pick = waiting.find(w => !c || n.confirmed + w.data.party <= c); if (!pick) return;
    const r = await fsCommit(env, [W.patch(env, `rsvp_counts/${eventId}`, { confirmed: n.confirmed + pick.data.party, waiting: Math.max(0, n.waiting - pick.data.party) }, counts.updateTime), W.patch(env, `rsvps/${pick.id}`, { status: 'confirmed', promotedAt: new Date() }, pick.updateTime)]);
    if (r !== 'ok' && r !== 'conflict') return;
  }
}

async function rsvpCancel(req, env) {
  const ip = req.headers.get('cf-connecting-ip') || 'unknown', b = await readJson(req), code = clean(b.code).toUpperCase();
  const rl = await allow('rsvp', ip); if (!rl.ok) throw new HttpError(429, 'Too many attempts. Please try again later.', { retryAfter: rl.retryAfter });
  if (!CODE.test(code)) throw new HttpError(404, 'Ticket not found.');
  for (let i = 0; i < 6; i++) {
    const r = await fsGet(env, `rsvps/${code}`); if (!r) throw new HttpError(404, 'Ticket not found.'); if (r.data.status === 'cancelled') return json(200, { ok: true });
    if (r.data.checkedIn) throw new HttpError(409, 'This ticket has already been used.');
    const counts = await fsGet(env, `rsvp_counts/${r.data.eventId}`), n = { ...COUNTS0, ...(counts && counts.data) }, was = r.data.status;
    const next = was === 'confirmed' ? { confirmed: Math.max(0, n.confirmed - r.data.party) } : { waiting: Math.max(0, n.waiting - r.data.party) };
    const res = await fsCommit(env, [W.patch(env, `rsvp_counts/${r.data.eventId}`, next, counts.updateTime), W.patch(env, `rsvps/${code}`, { status: 'cancelled', cancelledAt: new Date() }, r.updateTime), W.del(env, `rsvp_keys/${r.data.keyId}`)]);
    if (res === 'ok') { if (was === 'confirmed') await promote(env, r.data.eventId); return json(200, { ok: true }); }
  }
  throw new HttpError(503, 'Please try again in a moment.');
}

async function rsvpGet(req, env, code) {
  const ip = req.headers.get('cf-connecting-ip') || 'unknown', rl = await allow('rsvpget', ip); if (!rl.ok) throw new HttpError(429, 'Too many requests.', { retryAfter: rl.retryAfter });
  code = String(code).toUpperCase(); if (!CODE.test(code)) throw new HttpError(404, 'Ticket not found.');
  const r = await fsGet(env, `rsvps/${code}`); if (!r) throw new HttpError(404, 'Ticket not found.');
  const ev = (await fsGet(env, `events/${r.data.eventId}`)) || { data: {} };
  return json(200, { ok: true, code, status: r.data.status, name: r.data.name, party: r.data.party, checkedIn: !!r.data.checkedIn, event: { title: ev.data.title || r.data.eventTitle || '', date: ev.data.date || '', time: ev.data.time || '', venue: ev.data.venue || '' } });
}


/* ---------- online giving (Paystack hosted checkout; the donor never types card details on our site) ---------- */
const PURPOSES = ['tithe', 'offering', 'missions', 'building', 'other'], REF = /^cac_[A-Za-z0-9]{16,40}$/, ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const currency = env => (/^[A-Z]{3}$/.test(env.GIVE_CURRENCY || '') ? env.GIVE_CURRENCY : 'NGN');
async function paystack(env, path, init = {}) {
  if (!env.PAYSTACK_SECRET) throw new HttpError(503, 'Online giving is not switched on yet.');
  let res; try { res = await fetch('https://api.paystack.co' + path, { ...init, headers: { authorization: 'Bearer ' + env.PAYSTACK_SECRET, 'content-type': 'application/json' } }); } catch { throw new HttpError(502, 'The payment service could not be reached. Please try again.'); }
  const j = await res.json().catch(() => ({}));
  if (res.status === 404) throw new HttpError(404, 'Payment not found.'); if (!res.ok || j.status === false || !j.data) throw new HttpError(502, 'The payment service refused that request. Please try again.');
  return j.data;
}
function returnUrl(env, v) {
  let u; try { u = new URL(String(v)); } catch { throw new HttpError(400, 'Invalid return address.'); }
  if (!origins(env).includes(u.origin) || !/\/give\.html$/.test(u.pathname) || u.search || u.hash) throw new HttpError(400, 'Invalid return address.');
  return u.origin + u.pathname;
}
async function giveInit(req, env) {
  const ip = req.headers.get('cf-connecting-ip') || 'unknown', b = await readJson(req);
  const rl = await allow('give', ip); if (!rl.ok) throw new HttpError(429, 'Too many attempts. Please try again later.', { retryAfter: rl.retryAfter });
  const amount = Number(b.amount); if (!Number.isInteger(amount) || amount < 100 || amount > 5000000) throw new HttpError(400, 'Please enter a whole amount between 100 and 5,000,000.');
  const email = str(b, 'email', 5, 120, 'Email').toLowerCase(); if (!EMAIL.test(email)) throw new HttpError(400, 'Please enter a valid email address (Paystack sends your receipt there).');
  const purpose = clean(b.purpose || 'offering').toLowerCase(); if (!PURPOSES.includes(purpose)) throw new HttpError(400, 'Unknown giving purpose.');
  const name = opt(b, 'name', 60, 'Name'), back = returnUrl(env, b.returnUrl);
  await verifyTurnstile(env, b.turnstile, ip);
  const reference = 'cac_' + [...crypto.getRandomValues(new Uint8Array(24))].map(x => ALNUM[x % ALNUM.length]).join(''), cur = currency(env);
  if (await fsCommit(env, [W.create(env, `donations/${reference}`, { status: 'pending', amount, amountKobo: amount * 100, currency: cur, purpose, name, createdAt: new Date() })]) !== 'ok') throw new HttpError(502, 'Please try again shortly.');
  const d = await paystack(env, '/transaction/initialize', { method: 'POST', body: JSON.stringify({ email, amount: amount * 100, currency: cur, reference, callback_url: back, metadata: { purpose, name, cancel_action: back } }) });
  if (!/^https:\/\/checkout\.paystack\.com\//.test(d.authorization_url || '')) throw new HttpError(502, 'The payment service returned an unexpected address.');
  return json(200, { ok: true, url: d.authorization_url, reference });
}
async function giveVerify(req, env) {
  const ip = req.headers.get('cf-connecting-ip') || 'unknown', b = await readJson(req), ref = clean(b.reference);
  const rl = await allow('give', ip); if (!rl.ok) throw new HttpError(429, 'Too many attempts. Please try again later.', { retryAfter: rl.retryAfter });
  if (!REF.test(ref)) throw new HttpError(404, 'Payment not found.');
  const doc = await fsGet(env, `donations/${ref}`); if (!doc) throw new HttpError(404, 'Payment not found.');
  const out = (status) => json(200, { ok: true, status, amount: doc.data.amount, currency: doc.data.currency });
  if (doc.data.status === 'success') return out('success');
  const d = await paystack(env, '/transaction/verify/' + ref);
  let status = d.status === 'success' ? 'success' : (d.status === 'failed' || d.status === 'abandoned' || d.status === 'reversed' ? d.status : 'pending');
  if (status === 'success' && (d.amount !== doc.data.amountKobo || d.currency !== doc.data.currency)) status = 'mismatch';   // never trust a payment whose amount differs from what we asked for
  if (status !== doc.data.status) await fsCommit(env, [W.patch(env, `donations/${ref}`, status === 'success' ? { status, paidAt: new Date(d.paid_at || Date.now()), channel: String(d.channel || '').slice(0, 20) } : { status }, doc.updateTime)]);
  return out(status);
}

const PUSH_ENDPOINT = /^https:\/\/[a-z0-9.-]+\/\S{10,1000}$/i;
async function pushSubscribe(req, env) {
  const ip = req.headers.get('cf-connecting-ip') || 'unknown', body = await readJson(req), s = body.subscription || {};
  const rl = await allow('push', ip); if (!rl.ok) throw new HttpError(429, 'Too many attempts. Please try again later.', { retryAfter: rl.retryAfter });
  if (!PUSH_ENDPOINT.test(s.endpoint || '') || !s.keys || !/^[A-Za-z0-9_-]{16,200}$/.test(s.keys.p256dh || '') || !/^[A-Za-z0-9_-]{8,100}$/.test(s.keys.auth || ''))
    throw new HttpError(400, 'Invalid subscription.');
  await verifyTurnstile(env, body.turnstile, ip);
  await putDoc(env, `push_subscriptions/${await sha256(s.endpoint)}`, { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth }, lang: clean(body.lang).slice(0, 10) || 'en', createdAt: new Date() });
  return json(200, { ok: true });
}
async function pushUnsubscribe(req, env) {
  const ip = req.headers.get('cf-connecting-ip') || 'unknown', body = await readJson(req);
  const rl = await allow('push', ip); if (!rl.ok) throw new HttpError(429, 'Too many attempts.', { retryAfter: rl.retryAfter });
  if (!PUSH_ENDPOINT.test(body.endpoint || '')) throw new HttpError(400, 'Invalid subscription.');
  await deleteDoc(env, `push_subscriptions/${await sha256(body.endpoint)}`);           // knowing the endpoint URL is the capability to unsubscribe
  return json(200, { ok: true });
}

/* Google Drive proxy: only files the owner shared as "Anyone with the link". Uses the public Drive API with an API key. */
async function media(req, env, ctx, id, cors) {
  if (!/^[A-Za-z0-9_-]{10,80}$/.test(id)) throw new HttpError(404, 'Not found.');
  if (!env.GOOGLE_API_KEY) throw new HttpError(503, 'Media is not configured yet.');
  const ip = req.headers.get('cf-connecting-ip') || 'unknown', rl = await allow('media', ip);
  if (!rl.ok) throw new HttpError(429, 'Too many requests.', { retryAfter: rl.retryAfter });
  const range = req.headers.get('range');
  const cacheReq = new Request(new URL(req.url).origin + '/v1/media/' + id + (range ? '?r=' + encodeURIComponent(range) : ''));
  if (typeof caches !== 'undefined' && caches.default) { const hit = await caches.default.match(cacheReq); if (hit) return new Response(hit.body, { status: hit.status, headers: { ...Object.fromEntries(hit.headers), ...cors } }); }
  const meta = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?fields=mimeType,size,name&key=${env.GOOGLE_API_KEY}`);
  if (meta.status === 404 || meta.status === 403) throw new HttpError(404, 'File not found or not shared.');
  if (!meta.ok) throw new HttpError(502, 'Media is temporarily unavailable.');
  const m = await meta.json();
  if (!/^(audio|image|video)\//.test(m.mimeType || '')) throw new HttpError(415, 'Only audio, image and video files can be served.');
  const up = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media&key=${env.GOOGLE_API_KEY}`, { headers: range ? { range } : {} });
  if (!up.ok && up.status !== 206) throw new HttpError(up.status === 403 || up.status === 429 ? 503 : 502, 'Media is temporarily unavailable. Please try again later.');
  const headers = { 'content-type': m.mimeType, 'accept-ranges': 'bytes', 'cache-control': 'public, max-age=86400', 'x-content-type-options': 'nosniff', 'cross-origin-resource-policy': 'cross-origin', ...cors };
  for (const h of ['content-length', 'content-range']) if (up.headers.get(h)) headers[h] = up.headers.get(h);
  const out = new Response(up.body, { status: up.status, headers });
  if (up.status === 200 && Number(m.size) < 25 * 1024 * 1024 && typeof caches !== 'undefined' && caches.default) ctx?.waitUntil(caches.default.put(cacheReq, out.clone()));   // cache small whole files only
  return out;
}

/* ---------- entry point ---------- */
export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url), cors = corsHeaders(req, env);
    try {
      if (req.method === 'OPTIONS') return new Response(null, { status: cors['access-control-allow-origin'] ? 204 : 403, headers: cors });
      if (url.pathname === '/health' && req.method === 'GET') return json(200, { ok: true, service: 'cac-edge', time: new Date().toISOString() }, cors);
      const o = req.headers.get('origin');
      const media_ = url.pathname.startsWith('/v1/media/');
      if (req.method === 'POST' && !(o && origins(env).includes(o))) throw new HttpError(403, 'Origin not allowed.');
      let m;
      if (req.method === 'POST' && (m = url.pathname.match(/^\/v1\/submit\/([a-z]+)$/))) return withCors(await submit(req, env, m[1]), cors);
      if (req.method === 'POST' && (m = url.pathname.match(/^\/v1\/prayed\/([^/]+)$/))) return withCors(await prayed(req, env, m[1]), cors);
      if (req.method === 'POST' && url.pathname === '/v1/rsvp') return withCors(await rsvpCreate(req, env), cors);
      if (req.method === 'POST' && url.pathname === '/v1/rsvp/cancel') return withCors(await rsvpCancel(req, env), cors);
      if (req.method === 'GET' && (m = url.pathname.match(/^\/v1\/rsvp\/([A-Za-z0-9]{12})$/))) return withCors(await rsvpGet(req, env, m[1]), cors);
      if (req.method === 'POST' && url.pathname === '/v1/give/init') return withCors(await giveInit(req, env), cors);
      if (req.method === 'POST' && url.pathname === '/v1/give/verify') return withCors(await giveVerify(req, env), cors);
      if (req.method === 'POST' && url.pathname === '/v1/push/subscribe') return withCors(await pushSubscribe(req, env), cors);
      if (req.method === 'POST' && url.pathname === '/v1/push/unsubscribe') return withCors(await pushUnsubscribe(req, env), cors);
      if (req.method === 'GET' && media_) return await media(req, env, ctx, url.pathname.slice('/v1/media/'.length), cors);
      throw new HttpError(404, 'Not found.');
    } catch (e) {
      if (e instanceof HttpError) return json(e.status, { ok: false, error: e.message, ...e.extra }, { ...cors, ...(e.extra.retryAfter ? { 'retry-after': String(e.extra.retryAfter) } : {}) });
      console.error('unhandled', e && e.message);
      return json(500, { ok: false, error: 'Something went wrong. Please try again.' }, cors);
    }
  }
};
function withCors(res, cors) { for (const [k, v] of Object.entries(cors)) res.headers.set(k, v); return res; }
