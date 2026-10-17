/* Firestore Security Rules tests. Run with the emulator:
     npm run test:rules
   Verifies that the public cannot read drafts/prayers, cannot self-promote to admin, and that submissions are validated. */
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, getDocs, collection, query, where, serverTimestamp } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { test, before, after, beforeEach } from 'node:test';

let env;
before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-cac-rules', firestore: { rules: readFileSync('firestore.rules', 'utf8') } });
});
after(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'admins/superUid'), { role: 'super' });
    await setDoc(doc(db, 'admins/editorUid'), { role: 'editor' });
    await setDoc(doc(db, 'admins/pastorUid'), { role: 'pastoral' });
    const dev = (date, status) => setDoc(doc(db, 'devotionals', date), { date, status, title: 'T ' + status, message: 'm', scripture: 'John 1:1' });
    await dev('2026-01-01', 'published'); await dev('2026-01-02', 'draft'); await dev('2026-01-03', 'scheduled'); await dev('2026-01-04', 'archived');
    await setDoc(doc(db, 'prayer_requests/p1'), { request: 'secret', status: 'pending' });
    await setDoc(doc(db, 'testimonies/tApproved'), { story: 'x'.repeat(40), status: 'approved', consent: true });
    await setDoc(doc(db, 'testimonies/tPending'), { story: 'y'.repeat(40), status: 'pending', consent: true });
    await setDoc(doc(db, 'events/e1'), { title: 'Camp', date: '2026-11-01' });
    await setDoc(doc(db, 'visitor_enquiries/v1'), { name: 'Ada', consent: true });
  });
});
const anon = () => env.unauthenticatedContext().firestore();
const as = uid => env.authenticatedContext(uid).firestore();

/* ---------- devotionals ---------- */
test('public can read a published devotional', () => assertSucceeds(getDoc(doc(anon(), 'devotionals/2026-01-01'))));
for (const [d, s] of [['2026-01-02', 'draft'], ['2026-01-03', 'scheduled'], ['2026-01-04', 'archived']])
  test(`public CANNOT read a ${s} devotional`, () => assertFails(getDoc(doc(anon(), 'devotionals/' + d))));
test('public can list ONLY with the published filter (what the site does)', () => assertSucceeds(getDocs(query(collection(anon(), 'devotionals'), where('status', '==', 'published')))));
test('public CANNOT list all devotionals without the filter (would leak drafts)', () => assertFails(getDocs(collection(anon(), 'devotionals'))));
test('public CANNOT write a devotional', () => assertFails(setDoc(doc(anon(), 'devotionals/2026-02-01'), { date: '2026-02-01', status: 'published', title: 'x', message: 'y' })));
test('editor can create a valid devotional', () => assertSucceeds(setDoc(doc(as('editorUid'), 'devotionals/2026-02-01'), { date: '2026-02-01', status: 'draft', title: 'x', message: 'y' })));
test('editor CANNOT use a doc id that differs from the date field', () => assertFails(setDoc(doc(as('editorUid'), 'devotionals/2026-02-01'), { date: '2026-02-02', status: 'draft', title: 'x', message: 'y' })));
test('editor CANNOT save an invalid status', () => assertFails(setDoc(doc(as('editorUid'), 'devotionals/2026-02-01'), { date: '2026-02-01', status: 'hacked', title: 'x', message: 'y' })));
test('editor CANNOT save an empty title', () => assertFails(setDoc(doc(as('editorUid'), 'devotionals/2026-02-01'), { date: '2026-02-01', status: 'draft', title: '', message: 'y' })));
test('editor CANNOT use a non-date id', () => assertFails(setDoc(doc(as('editorUid'), 'devotionals/hello'), { date: 'hello', status: 'draft', title: 'x', message: 'y' })));
test('pastoral staff CANNOT edit devotionals', () => assertFails(setDoc(doc(as('pastorUid'), 'devotionals/2026-02-01'), { date: '2026-02-01', status: 'draft', title: 'x', message: 'y' })));
test('a signed-in non-admin CANNOT edit devotionals', () => assertFails(setDoc(doc(as('randomUser'), 'devotionals/2026-02-01'), { date: '2026-02-01', status: 'published', title: 'x', message: 'y' })));
test('editor can promote scheduled -> published', () => assertSucceeds(updateDoc(doc(as('editorUid'), 'devotionals/2026-01-03'), { status: 'published' })));

/* ---------- admin roles cannot be self-assigned ---------- */
test('user CANNOT make themselves admin', () => assertFails(setDoc(doc(as('randomUser'), 'admins/randomUser'), { role: 'super' })));
test('even a super admin cannot write admins from the client (console only)', () => assertFails(setDoc(doc(as('superUid'), 'admins/newUid'), { role: 'super' })));
test('admin can read their own role doc', () => assertSucceeds(getDoc(doc(as('editorUid'), 'admins/editorUid'))));
test('editor CANNOT read another admin doc', () => assertFails(getDoc(doc(as('editorUid'), 'admins/superUid'))));
test('anonymous CANNOT read admin docs', () => assertFails(getDoc(doc(anon(), 'admins/superUid'))));

/* ---------- prayer requests (sensitive) ---------- */
const prayer = (o = {}) => ({ name: 'Ada', phone: '+2348012345678', request: 'Please pray for me', type: 'General', timestamp: serverTimestamp(), status: 'pending', ...o });
test('public can submit a valid prayer request', () => assertSucceeds(addDoc(collection(anon(), 'prayer_requests'), prayer())));
test('public CANNOT read prayer requests', () => assertFails(getDoc(doc(anon(), 'prayer_requests/p1'))));
test('public CANNOT list prayer requests', () => assertFails(getDocs(collection(anon(), 'prayer_requests'))));
test('editor (non-pastoral) CANNOT read prayer requests', () => assertFails(getDoc(doc(as('editorUid'), 'prayer_requests/p1'))));
test('pastoral team can read prayer requests', () => assertSucceeds(getDoc(doc(as('pastorUid'), 'prayer_requests/p1'))));
test('super admin can read prayer requests', () => assertSucceeds(getDoc(doc(as('superUid'), 'prayer_requests/p1'))));
test('prayer: extra fields rejected', () => assertFails(addDoc(collection(anon(), 'prayer_requests'), prayer({ isAdmin: true }))));
test('prayer: spoofed status rejected', () => assertFails(addDoc(collection(anon(), 'prayer_requests'), prayer({ status: 'answered' }))));
test('prayer: client-supplied timestamp rejected', () => assertFails(addDoc(collection(anon(), 'prayer_requests'), prayer({ timestamp: new Date('2020-01-01') }))));
test('prayer: too short rejected', () => assertFails(addDoc(collection(anon(), 'prayer_requests'), prayer({ request: 'hi' }))));
test('prayer: over 2000 chars rejected', () => assertFails(addDoc(collection(anon(), 'prayer_requests'), prayer({ request: 'x'.repeat(2001) }))));
test('prayer: oversized name rejected', () => assertFails(addDoc(collection(anon(), 'prayer_requests'), prayer({ name: 'n'.repeat(81) }))));
test('public CANNOT edit or delete prayer requests', async () => { await assertFails(updateDoc(doc(anon(), 'prayer_requests/p1'), { status: 'x' })); await assertFails(deleteDoc(doc(anon(), 'prayer_requests/p1'))); });

/* ---------- visitor enquiries ---------- */
const visit = (o = {}) => ({ name: 'Ada', email: 'a@b.co', phone: '', visitDate: '', guests: '1', message: 'Hi', consent: true, status: 'new', timestamp: serverTimestamp(), ...o });
test('public can submit a visitor enquiry with consent', () => assertSucceeds(addDoc(collection(anon(), 'visitor_enquiries'), visit())));
test('visitor enquiry without consent rejected', () => assertFails(addDoc(collection(anon(), 'visitor_enquiries'), visit({ consent: false }))));
test('visitor enquiry with extra field rejected', () => assertFails(addDoc(collection(anon(), 'visitor_enquiries'), visit({ role: 'admin' }))));
test('public CANNOT read visitor enquiries', () => assertFails(getDoc(doc(anon(), 'visitor_enquiries/v1'))));
test('pastoral team can read visitor enquiries', () => assertSucceeds(getDoc(doc(as('pastorUid'), 'visitor_enquiries/v1'))));

/* ---------- testimonies ---------- */
const testi = (o = {}) => ({ name: 'Ada', country: 'NG', email: '', story: 'z'.repeat(40), consent: true, status: 'pending', timestamp: serverTimestamp(), ...o });
test('public can submit a pending testimony with consent', () => assertSucceeds(addDoc(collection(anon(), 'testimonies'), testi())));
test('public CANNOT self-approve a testimony on create', () => assertFails(addDoc(collection(anon(), 'testimonies'), testi({ status: 'approved' }))));
test('testimony without consent rejected', () => assertFails(addDoc(collection(anon(), 'testimonies'), testi({ consent: false }))));
test('testimony too short rejected', () => assertFails(addDoc(collection(anon(), 'testimonies'), testi({ story: 'short' }))));
test('public can read an approved testimony', () => assertSucceeds(getDoc(doc(anon(), 'testimonies/tApproved'))));
test('public CANNOT read a pending testimony', () => assertFails(getDoc(doc(anon(), 'testimonies/tPending'))));
test('public can list approved testimonies only (site query)', () => assertSucceeds(getDocs(query(collection(anon(), 'testimonies'), where('status', '==', 'approved')))));
test('public CANNOT list all testimonies', () => assertFails(getDocs(collection(anon(), 'testimonies'))));
test('editor can approve a testimony', () => assertSucceeds(updateDoc(doc(as('editorUid'), 'testimonies/tPending'), { status: 'approved' })));
test('public CANNOT approve a testimony', () => assertFails(updateDoc(doc(anon(), 'testimonies/tPending'), { status: 'approved' })));

/* ---------- newsletter ---------- */
test('newsletter: valid email accepted', () => assertSucceeds(addDoc(collection(anon(), 'newsletters'), { email: 'a@b.co', timestamp: serverTimestamp() })));
test('newsletter: invalid email rejected', () => assertFails(addDoc(collection(anon(), 'newsletters'), { email: 'not-an-email', timestamp: serverTimestamp() })));
test('newsletter list is not public', () => assertFails(getDocs(collection(anon(), 'newsletters'))));

/* ---------- public content ---------- */
test('events are publicly readable', () => assertSucceeds(getDoc(doc(anon(), 'events/e1'))));
test('public CANNOT create/edit/delete events', async () => { await assertFails(setDoc(doc(anon(), 'events/x'), { title: 'x' })); await assertFails(deleteDoc(doc(anon(), 'events/e1'))); });
test('editor can create events', () => assertSucceeds(setDoc(doc(as('editorUid'), 'events/x'), { title: 'x', date: '2026-12-01' })));
test('pastoral CANNOT create events', () => assertFails(setDoc(doc(as('pastorUid'), 'events/x'), { title: 'x' })));

/* ---------- audit log ---------- */
const audit = (o = {}) => ({ action: 'devotional.save', target: '2026-01-01 [draft]', by: 'e@x.org', uid: 'editorUid', at: serverTimestamp(), ...o });
test('any admin can append an audit entry for themselves', () => assertSucceeds(addDoc(collection(as('editorUid'), 'auditLogs'), audit())));
test('audit entry cannot impersonate another uid', () => assertFails(addDoc(collection(as('editorUid'), 'auditLogs'), audit({ uid: 'superUid' }))));
test('audit entry cannot backdate itself', () => assertFails(addDoc(collection(as('editorUid'), 'auditLogs'), audit({ at: new Date('2020-01-01') }))));
test('non-admin CANNOT write audit logs', () => assertFails(addDoc(collection(as('randomUser'), 'auditLogs'), audit({ uid: 'randomUser' }))));
test('public CANNOT write audit logs', () => assertFails(addDoc(collection(anon(), 'auditLogs'), audit())));
test('only super admin can read audit logs', async () => {
  await env.withSecurityRulesDisabled(async ctx => setDoc(doc(ctx.firestore(), 'auditLogs/a1'), audit()));
  await assertSucceeds(getDoc(doc(as('superUid'), 'auditLogs/a1'))); await assertFails(getDoc(doc(as('editorUid'), 'auditLogs/a1'))); await assertFails(getDoc(doc(anon(), 'auditLogs/a1')));
});
test('audit logs are append-only (no edit or delete, even for super)', async () => {
  await env.withSecurityRulesDisabled(async ctx => setDoc(doc(ctx.firestore(), 'auditLogs/a1'), audit()));
  await assertFails(updateDoc(doc(as('superUid'), 'auditLogs/a1'), { action: 'x' })); await assertFails(deleteDoc(doc(as('superUid'), 'auditLogs/a1')));
});

/* ---------- default deny ---------- */
test('unknown collections are denied', async () => { await assertFails(getDoc(doc(anon(), 'secrets/a'))); await assertFails(setDoc(doc(as('superUid'), 'secrets/a'), { x: 1 })); });
