#!/usr/bin/env node
/* Nightly encrypted Firestore backup (GitHub Actions artifact, never committed: the repo may be public). Needs FIREBASE_SERVICE_ACCOUNT + BACKUP_PASSPHRASE.
   Excludes members (private synced data) and push subscriptions. Restore: node backup-decrypt.mjs backup-DATE.bin > backup.json */
import { writeFileSync } from 'node:fs';
import { encrypt, plain, COLLECTIONS } from './backup-lib.mjs';
const { FIREBASE_SERVICE_ACCOUNT: sa, BACKUP_PASSPHRASE: pass } = process.env;
if (!sa || !pass) { console.log('FIREBASE_SERVICE_ACCOUNT / BACKUP_PASSPHRASE not set: skipping backup.'); process.exit(0); }
const { initializeApp, cert } = await import('firebase-admin/app'), { getFirestore } = await import('firebase-admin/firestore');
initializeApp({ credential: cert(JSON.parse(sa)) }); const db = getFirestore(), out = { exportedAt: new Date().toISOString(), collections: {} };
for (const c of COLLECTIONS) { const s = await db.collection(c).get(); out.collections[c] = Object.fromEntries(s.docs.map(d => [d.id, plain(d.data())])); console.log(c, s.size); }
const name = `backup-${out.exportedAt.slice(0, 10)}.bin`; writeFileSync(name, encrypt(out, pass)); console.log('wrote', name);
