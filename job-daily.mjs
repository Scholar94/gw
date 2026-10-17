#!/usr/bin/env node
/* Daily free job (GitHub Actions): publish due devotionals, then regenerate devotionals.xml + calendar.ics.
   Needs secret FIREBASE_SERVICE_ACCOUNT (JSON). Without it, only the static recurring calendar is written. */
import { writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { C, loadConfig, promoteScheduled, buildRSS, buildCalendar } from './job-lib.mjs';
const root = path.dirname(new URL(import.meta.url).pathname);
const cfg = loadConfig(), today = C.todayLagos();
const site = (process.env.SITE_URL || 'https://example.org').replace(/\/$/, '');
let devotionals = [], events = [];
const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
if (sa) {
  const { initializeApp, cert } = await import('firebase-admin/app');
  const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
  initializeApp({ credential: cert(JSON.parse(sa)) });
  const db = getFirestore();
  const promoted = await promoteScheduled(db, today, FieldValue.serverTimestamp());
  console.log(`Promoted ${promoted.length} scheduled devotional(s) for ${today}:`, promoted.join(', ') || '-');
  devotionals = (await db.collection('devotionals').where('status', '==', 'published').orderBy('date', 'desc').limit(60).get()).docs.map(d => ({ id: d.id, ...d.data() }));
  events = (await db.collection('events').get()).docs.map(d => ({ id: d.id, ...d.data() }));
} else console.log('FIREBASE_SERVICE_ACCOUNT not set: writing static calendar only (no devotionals).');
writeFileSync(path.join(root, 'calendar.ics'), buildCalendar(events, cfg, today));
// With credentials: real feed. Without: ship a valid empty feed once, but never overwrite a real one.
const rssPath = path.join(root, 'devotionals.xml');
if (sa || !existsSync(rssPath)) writeFileSync(rssPath, buildRSS(devotionals, site, today, cfg));
console.log('Feeds written for', site);
