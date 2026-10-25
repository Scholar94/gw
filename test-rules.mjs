/* Firestore Security Rules tests. Run with the emulator:
     npm run test:rules
   Verifies that the public cannot read drafts/prayers, cannot self-promote to admin, and that submissions are validated. */
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, getDocs, collection, query, where, serverTimestamp } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { test, before, after, beforeEach } from 'node:test';

/* RULES_FILE=firestore.legacy.rules runs the same suite against the legacy (direct-write) rules. Default = strict rules. */
const RULES_FILE = process.env.RULES_FILE || 'firestore.rules';
const LEGACY = /legacy/.test(RULES_FILE);
const legacyOnly = LEGACY ? test : test.skip;
let env;
before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-cac-rules', firestore: { rules: readFileSync(RULES_FILE, 'utf8') } });
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
legacyOnly('public can submit a valid prayer request', () => assertSucceeds(addDoc(collection(anon(), 'prayer_requests'), prayer())));
test('public CANNOT read prayer requests', () => assertFails(getDoc(doc(anon(), 'prayer_requests/p1'))));
test('public CANNOT list prayer requests', () => assertFails(getDocs(collection(anon(), 'prayer_requests'))));
test('editor (non-pastoral) CANNOT read prayer requests', () => assertFails(getDoc(doc(as('editorUid'), 'prayer_requests/p1'))));
test('pastoral team can read prayer requests', () => assertSucceeds(getDoc(doc(as('pastorUid'), 'prayer_requests/p1'))));
test('super admin can read prayer requests', () => assertSucceeds(getDoc(doc(as('superUid'), 'prayer_requests/p1'))));
legacyOnly('prayer: extra fields rejected', () => assertFails(addDoc(collection(anon(), 'prayer_requests'), prayer({ isAdmin: true }))));
legacyOnly('prayer: spoofed status rejected', () => assertFails(addDoc(collection(anon(), 'prayer_requests'), prayer({ status: 'answered' }))));
legacyOnly('prayer: client-supplied timestamp rejected', () => assertFails(addDoc(collection(anon(), 'prayer_requests'), prayer({ timestamp: new Date('2020-01-01') }))));
legacyOnly('prayer: too short rejected', () => assertFails(addDoc(collection(anon(), 'prayer_requests'), prayer({ request: 'hi' }))));
legacyOnly('prayer: over 2000 chars rejected', () => assertFails(addDoc(collection(anon(), 'prayer_requests'), prayer({ request: 'x'.repeat(2001) }))));
legacyOnly('prayer: oversized name rejected', () => assertFails(addDoc(collection(anon(), 'prayer_requests'), prayer({ name: 'n'.repeat(81) }))));
test('public CANNOT edit or delete prayer requests', async () => { await assertFails(updateDoc(doc(anon(), 'prayer_requests/p1'), { status: 'x' })); await assertFails(deleteDoc(doc(anon(), 'prayer_requests/p1'))); });

/* ---------- visitor enquiries ---------- */
const visit = (o = {}) => ({ name: 'Ada', email: 'a@b.co', phone: '', visitDate: '', guests: '1', message: 'Hi', consent: true, status: 'new', timestamp: serverTimestamp(), ...o });
legacyOnly('public can submit a visitor enquiry with consent', () => assertSucceeds(addDoc(collection(anon(), 'visitor_enquiries'), visit())));
legacyOnly('visitor enquiry without consent rejected', () => assertFails(addDoc(collection(anon(), 'visitor_enquiries'), visit({ consent: false }))));
legacyOnly('visitor enquiry with extra field rejected', () => assertFails(addDoc(collection(anon(), 'visitor_enquiries'), visit({ role: 'admin' }))));
test('public CANNOT read visitor enquiries', () => assertFails(getDoc(doc(anon(), 'visitor_enquiries/v1'))));
test('pastoral team can read visitor enquiries', () => assertSucceeds(getDoc(doc(as('pastorUid'), 'visitor_enquiries/v1'))));

/* ---------- testimonies ---------- */
const testi = (o = {}) => ({ name: 'Ada', country: 'NG', email: '', story: 'z'.repeat(40), consent: true, status: 'pending', timestamp: serverTimestamp(), ...o });
legacyOnly('public can submit a pending testimony with consent', () => assertSucceeds(addDoc(collection(anon(), 'testimonies'), testi())));
legacyOnly('public CANNOT self-approve a testimony on create', () => assertFails(addDoc(collection(anon(), 'testimonies'), testi({ status: 'approved' }))));
legacyOnly('testimony without consent rejected', () => assertFails(addDoc(collection(anon(), 'testimonies'), testi({ consent: false }))));
legacyOnly('testimony too short rejected', () => assertFails(addDoc(collection(anon(), 'testimonies'), testi({ story: 'short' }))));
test('public can read an approved testimony', () => assertSucceeds(getDoc(doc(anon(), 'testimonies/tApproved'))));
test('public CANNOT read a pending testimony', () => assertFails(getDoc(doc(anon(), 'testimonies/tPending'))));
test('public can list approved testimonies only (site query)', () => assertSucceeds(getDocs(query(collection(anon(), 'testimonies'), where('status', '==', 'approved')))));
test('public CANNOT list all testimonies', () => assertFails(getDocs(collection(anon(), 'testimonies'))));
test('editor can approve a testimony', () => assertSucceeds(updateDoc(doc(as('editorUid'), 'testimonies/tPending'), { status: 'approved' })));
test('public CANNOT approve a testimony', () => assertFails(updateDoc(doc(anon(), 'testimonies/tPending'), { status: 'approved' })));

/* ---------- newsletter ---------- */
legacyOnly('newsletter: valid email accepted', () => assertSucceeds(addDoc(collection(anon(), 'newsletters'), { email: 'a@b.co', timestamp: serverTimestamp() })));
legacyOnly('newsletter: invalid email rejected', () => assertFails(addDoc(collection(anon(), 'newsletters'), { email: 'not-an-email', timestamp: serverTimestamp() })));
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


/* ---------- STRICT MODE: the public can never write to Firestore directly (only the Worker can, via a service account) ---------- */
const strictOnly = LEGACY ? test.skip : test;
strictOnly('strict: public CANNOT create a prayer request, even a perfectly valid one', () => assertFails(addDoc(collection(anon(), 'prayer_requests'), prayer())));
strictOnly('strict: public CANNOT create a visitor enquiry', () => assertFails(addDoc(collection(anon(), 'visitor_enquiries'), visit())));
strictOnly('strict: public CANNOT create a testimony', () => assertFails(addDoc(collection(anon(), 'testimonies'), testi())));
strictOnly('strict: public CANNOT subscribe a newsletter email directly', () => assertFails(addDoc(collection(anon(), 'newsletters'), { email: 'a@b.co', timestamp: serverTimestamp() })));
strictOnly('strict: even signed-in non-admins CANNOT create submissions', async () => { await assertFails(addDoc(collection(as('randomUser'), 'prayer_requests'), prayer())); await assertFails(addDoc(collection(as('randomUser'), 'testimonies'), testi())); });
strictOnly('strict: staff can still read/moderate what the Worker wrote', async () => { await assertSucceeds(getDoc(doc(as('pastorUid'), 'prayer_requests/p1'))); await assertSucceeds(updateDoc(doc(as('editorUid'), 'testimonies/tPending'), { status: 'approved' })); });
strictOnly('strict: push subscriptions are not readable or writable by any client', async () => { await assertFails(getDoc(doc(anon(), 'push_subscriptions/x'))); await assertFails(setDoc(doc(as('superUid'), 'push_subscriptions/x'), { endpoint: 'https://x' })); await assertFails(getDoc(doc(as('superUid'), 'push_subscriptions/x'))); });

/* ---------- site settings (BBC promo) ---------- */
test('site settings are publicly readable', () => assertSucceeds(getDoc(doc(anon(), 'siteSettings/bbc'))));
test('editor can save the BBC promo', () => assertSucceeds(setDoc(doc(as('editorUid'), 'siteSettings/bbc'), { headline: 'h', text: 't', buttonLabel: 'b', url: 'https://x.org', image: '', updatedAt: serverTimestamp() })));
test('public CANNOT write site settings', () => assertFails(setDoc(doc(anon(), 'siteSettings/bbc'), { headline: 'h' })));
test('pastoral staff CANNOT write site settings', () => assertFails(setDoc(doc(as('pastorUid'), 'siteSettings/bbc'), { headline: 'h' })));
test('site settings: unknown key and unknown field rejected', async () => { await assertFails(setDoc(doc(as('editorUid'), 'siteSettings/other'), { headline: 'h' })); await assertFails(setDoc(doc(as('editorUid'), 'siteSettings/bbc'), { headline: 'h', evil: 1 })); });
test('site settings: oversized text rejected', () => assertFails(setDoc(doc(as('editorUid'), 'siteSettings/bbc'), { text: 'x'.repeat(601) })));

/* ---------- live service mode + members ---------- */
test('live: public can read the live doc and notes', async () => { await assertSucceeds(getDoc(doc(anon(), 'live/current'))); await assertSucceeds(getDocs(collection(anon(), 'live_notes'))); });
test('live: editor can go live; public and pastoral cannot', async () => {
  const d = { active: true, title: 'Sunday', video: 'dQw4w9WgXcQ', updatedAt: serverTimestamp() };
  await assertSucceeds(setDoc(doc(as('editorUid'), 'live/current'), d)); await assertFails(setDoc(doc(anon(), 'live/current'), d)); await assertFails(setDoc(doc(as('pastorUid'), 'live/current'), d));
});
test('live: only the "current" doc, only known fields, active must be boolean', async () => {
  await assertFails(setDoc(doc(as('editorUid'), 'live/other'), { active: true })); await assertFails(setDoc(doc(as('editorUid'), 'live/current'), { active: 'yes' })); await assertFails(setDoc(doc(as('editorUid'), 'live/current'), { active: true, evil: 1 }));
});
test('live notes: editor can post notes and scriptures, public cannot, bad shapes rejected', async () => {
  await assertSucceeds(addDoc(collection(as('editorUid'), 'live_notes'), { kind: 'note', text: 'Point one', ts: serverTimestamp() })); await assertSucceeds(addDoc(collection(as('editorUid'), 'live_notes'), { kind: 'scripture', text: 'John 3:16', ts: serverTimestamp() }));
  await assertFails(addDoc(collection(anon(), 'live_notes'), { kind: 'note', text: 'spam', ts: serverTimestamp() })); await assertFails(addDoc(collection(as('editorUid'), 'live_notes'), { kind: 'script', text: 'x', ts: serverTimestamp() }));
  await assertFails(addDoc(collection(as('editorUid'), 'live_notes'), { kind: 'note', text: '', ts: serverTimestamp() })); await assertFails(addDoc(collection(as('editorUid'), 'live_notes'), { kind: 'note', text: 'x'.repeat(601), ts: serverTimestamp() }));
});
test('members: a signed-in visitor can read/write ONLY their own synced doc', async () => {
  const d = { bm: {}, notes: {}, read: [], plans: {}, updatedAt: serverTimestamp() };
  await assertSucceeds(setDoc(doc(as('visitorA'), 'members/visitorA'), d)); await assertSucceeds(getDoc(doc(as('visitorA'), 'members/visitorA')));
  await assertFails(getDoc(doc(as('visitorB'), 'members/visitorA'))); await assertFails(setDoc(doc(as('visitorB'), 'members/visitorA'), d)); await assertFails(getDoc(doc(anon(), 'members/visitorA'))); await assertFails(setDoc(doc(anon(), 'members/x'), d));
});
test('members: shape and size limits enforced', async () => {
  await assertFails(setDoc(doc(as('visitorA'), 'members/visitorA'), { bm: {}, notes: {}, read: [], plans: {}, isAdmin: true })); await assertFails(setDoc(doc(as('visitorA'), 'members/visitorA'), { bm: {}, notes: {}, read: new Array(2001).fill('2026-01-01'), plans: {} }));
  await assertFails(setDoc(doc(as('visitorA'), 'members/visitorA'), { bm: 'x', notes: {}, read: [], plans: {} }));
});
test('members: signing up as a visitor never grants staff powers', async () => { await assertFails(setDoc(doc(as('visitorA'), 'admins/visitorA'), { role: 'super' })); await assertFails(addDoc(collection(as('visitorA'), 'live_notes'), { kind: 'note', text: 'x', ts: serverTimestamp() })); });

/* ---------- prayer wall ---------- */
const wall = (o = {}) => ({ text: 'Please pray for healing for a church member', name: '', prayedCount: 0, createdAt: serverTimestamp(), ...o });
test('wall: public can read; only pastoral staff can publish; counter must start at 0', async () => {
  await assertSucceeds(getDocs(collection(anon(), 'prayer_wall'))); await assertSucceeds(addDoc(collection(as('pastorUid'), 'prayer_wall'), wall()));
  await assertFails(addDoc(collection(anon(), 'prayer_wall'), wall())); await assertFails(addDoc(collection(as('editorUid'), 'prayer_wall'), wall())); await assertFails(addDoc(collection(as('pastorUid'), 'prayer_wall'), wall({ prayedCount: 500 })));
  await assertFails(addDoc(collection(as('pastorUid'), 'prayer_wall'), wall({ text: 'x' }))); await assertFails(addDoc(collection(as('pastorUid'), 'prayer_wall'), wall({ phone: '0803' })));
});
test('wall: nobody on the client can change prayedCount (only the Worker can)', async () => {
  await env.withSecurityRulesDisabled(async c => setDoc(doc(c.firestore(), 'prayer_wall/w1'), { text: 'Pray for peace in our city', name: '', prayedCount: 3 }));
  await assertFails(updateDoc(doc(as('pastorUid'), 'prayer_wall/w1'), { prayedCount: 999 })); await assertFails(updateDoc(doc(as('superUid'), 'prayer_wall/w1'), { prayedCount: 999 })); await assertFails(updateDoc(doc(anon(), 'prayer_wall/w1'), { prayedCount: 4 }));
  await assertSucceeds(updateDoc(doc(as('pastorUid'), 'prayer_wall/w1'), { text: 'Pray for peace in our whole city' })); await assertSucceeds(deleteDoc(doc(as('pastorUid'), 'prayer_wall/w1'))); await assertFails(deleteDoc(doc(anon(), 'prayer_wall/w1')));
});

/* ---------- event RSVPs ---------- */
test('rsvps: staff (content roles) can read and tick people in; nobody can create, delete or change anything else', async () => {
  await env.withSecurityRulesDisabled(async c => setDoc(doc(c.firestore(), 'rsvps/ABCDEFGHJKMN'), { eventId: 'e1', name: 'Ada', status: 'confirmed', party: 1, checkedIn: false, email: 'a@x.org' }));
  await assertSucceeds(getDoc(doc(as('editorUid'), 'rsvps/ABCDEFGHJKMN'))); await assertSucceeds(updateDoc(doc(as('editorUid'), 'rsvps/ABCDEFGHJKMN'), { checkedIn: true, checkedInAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(as('editorUid'), 'rsvps/ABCDEFGHJKMN'), { status: 'cancelled' })); await assertFails(updateDoc(doc(as('editorUid'), 'rsvps/ABCDEFGHJKMN'), { party: 99 })); await assertFails(updateDoc(doc(as('editorUid'), 'rsvps/ABCDEFGHJKMN'), { checkedIn: 'yes' }));
  await assertFails(deleteDoc(doc(as('superUid'), 'rsvps/ABCDEFGHJKMN'))); await assertFails(setDoc(doc(as('superUid'), 'rsvps/NEWNEWNEWNEW'), { eventId: 'e1', status: 'confirmed' }));
});
test('rsvps: the public and pastoral-only staff cannot read contact details; counts are staff-only', async () => {
  await assertFails(getDoc(doc(anon(), 'rsvps/ABCDEFGHJKMN'))); await assertFails(getDocs(query(collection(anon(), 'rsvps'), where('eventId', '==', 'e1')))); await assertFails(getDoc(doc(as('visitorA'), 'rsvps/ABCDEFGHJKMN')));
  await assertFails(getDoc(doc(anon(), 'rsvp_counts/e1'))); await assertFails(setDoc(doc(as('superUid'), 'rsvp_counts/e1'), { confirmed: 0 })); await assertFails(setDoc(doc(as('superUid'), 'rsvp_keys/x'), { a: 1 })); await assertFails(getDoc(doc(as('superUid'), 'rsvp_keys/x')));
});
test('rsvps: staff can list one event\'s reservations', () => assertSucceeds(getDocs(query(collection(as('editorUid'), 'rsvps'), where('eventId', '==', 'e1')))));

/* ---------- donations ---------- */
test('donations: only SUPER admins can read; editors, pastoral, visitors and the public cannot; nobody can write', async () => {
  await env.withSecurityRulesDisabled(async c => setDoc(doc(c.firestore(), 'donations/cac_x'), { status: 'success', amount: 5000 }));
  await assertSucceeds(getDoc(doc(as('superUid'), 'donations/cac_x'))); await assertSucceeds(getDocs(collection(as('superUid'), 'donations')));
  await assertFails(getDoc(doc(as('editorUid'), 'donations/cac_x'))); await assertFails(getDoc(doc(as('pastorUid'), 'donations/cac_x'))); await assertFails(getDoc(doc(as('visitorA'), 'donations/cac_x'))); await assertFails(getDoc(doc(anon(), 'donations/cac_x')));
  await assertFails(setDoc(doc(as('superUid'), 'donations/cac_y'), { status: 'success', amount: 1 })); await assertFails(updateDoc(doc(as('superUid'), 'donations/cac_x'), { status: 'pending' })); await assertFails(deleteDoc(doc(as('superUid'), 'donations/cac_x')));
});
