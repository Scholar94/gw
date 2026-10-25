#!/usr/bin/env node
/* Daily Web Push (GitHub Actions, free): sends today's published devotional to everyone who opted in.
   Needs secrets FIREBASE_SERVICE_ACCOUNT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (+ optional VAPID_SUBJECT mailto:). No Firebase Cloud Messaging server involved. */
import { C, loadConfig } from './job-lib.mjs';

export function buildPayload(dev) {
  const verse = String(dev.scripture || '').slice(0, 60), title = String(dev.title || 'Today’s devotional').slice(0, 90);
  return { title: 'Daily Devotional', body: verse ? `${title} · ${verse}` : title, url: `devotionals.html?d=${encodeURIComponent(dev.date)}` };
}

/** Send to every subscription; prune the dead ones (404/410). Concurrency-limited. Returns counts. */
export async function sendAll(subs, send, remove, payload, concurrency = 20) {
  const r = { sent: 0, removed: 0, failed: 0 }, body = JSON.stringify(payload);
  for (let i = 0; i < subs.length; i += concurrency) await Promise.all(subs.slice(i, i + concurrency).map(async s => {
    try { await send({ endpoint: s.endpoint, keys: s.keys }, body, { TTL: 12 * 3600, urgency: 'normal', topic: 'daily-devotional' }); r.sent++; }
    catch (e) { if (e && (e.statusCode === 404 || e.statusCode === 410)) { await remove(s.id); r.removed++; } else { r.failed++; console.warn('push failed', e && e.statusCode || e && e.message); } }
  }));
  return r;
}

/** Idempotent per day: a push_log/{date} doc is created first; a re-run the same day does nothing. */
export async function run(db, webpush, today) {
  const snap = await db.collection('devotionals').where('date', '==', today).where('status', '==', 'published').limit(1).get();
  if (snap.empty) { console.log('No published devotional for', today, ': nothing to send.'); return null; }
  try { await db.collection('push_log').doc(today).create({ at: new Date() }); } catch (e) { if (/ALREADY_EXISTS|already exists|code.?6/i.test(String(e.code) + e.message)) { console.log('Already sent for', today); return null; } throw e; }
  const subs = (await db.collection('push_subscriptions').get()).docs.map(d => ({ id: d.id, ...d.data() })).filter(s => /^https:\/\//.test(s.endpoint || '') && s.keys);
  const res = await sendAll(subs, (s, b, o) => webpush.sendNotification(s, b, o), id => db.collection('push_subscriptions').doc(id).delete(), buildPayload({ id: snap.docs[0].id, ...snap.docs[0].data() }));
  console.log(`Push ${today}: sent ${res.sent}, removed ${res.removed} expired, failed ${res.failed}, subscribers ${subs.length}`);
  return res;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { FIREBASE_SERVICE_ACCOUNT: sa, VAPID_PUBLIC_KEY: pub, VAPID_PRIVATE_KEY: priv } = process.env;
  if (!sa || !pub || !priv) { console.log('Push secrets not set (FIREBASE_SERVICE_ACCOUNT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY): skipping.'); process.exit(0); }
  const webpush = (await import('web-push')).default, { initializeApp, cert } = await import('firebase-admin/app'), { getFirestore } = await import('firebase-admin/firestore');
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:' + (loadConfig().email || 'admin@example.org'), pub, priv);
  initializeApp({ credential: cert(JSON.parse(sa)) });
  await run(getFirestore(), webpush, C.todayLagos());
}
