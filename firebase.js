/* =============================================
   CAC GOOD WORKS — FIREBASE.JS
   Replace firebaseConfig values with your own from
   https://console.firebase.google.com (Project settings > Web app).
   These values are public identifiers, NOT secrets; access is
   controlled by firestore.rules + Firebase Auth.
   ============================================= */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, getDoc, setDoc, deleteDoc, doc, updateDoc, query, where, orderBy, limit, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

/* ── REPLACE THESE WITH YOUR FIREBASE PROJECT CREDENTIALS ── */
const firebaseConfig = {
  apiKey: "AIzaSyAlUpIbQH1k678yqHnhxMiyYJ_NZ3zaeKo",
  authDomain: "prayer-72a4b.firebaseapp.com",
  projectId: "prayer-72a4b",
  storageBucket: "prayer-72a4b.firebasestorage.app",
  messagingSenderId: "629914619936",
  appId: "1:629914619936:web:ebe967ca3da7198982ac45"
};
/* ────────────────────────────────────────────────────────── */

/* Optional anti-abuse: paste a reCAPTCHA v3 site key (Firebase console > App Check > Web app > reCAPTCHA v3), then turn on
   "Enforce" for Cloud Firestore. Bots calling your database directly are then rejected. Leave empty to disable. */
const APP_CHECK_SITE_KEY = '';

const configured = !Object.values(firebaseConfig).some(v => /^YOUR_|YOUR_/.test(v));
let app, db, storage, auth;
if (configured) {
  try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app); storage = getStorage(app); auth = getAuth(app);
  } catch (e) { console.error('[Firebase] init failed', e); }
  if (app && APP_CHECK_SITE_KEY) {
    try {
      const { initializeAppCheck, ReCaptchaV3Provider } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-check.js");
      if (['localhost', '127.0.0.1'].includes(location.hostname)) self.FIREBASE_APPCHECK_DEBUG_TOKEN = true; // prints a debug token to register in the console
      initializeAppCheck(app, { provider: new ReCaptchaV3Provider(APP_CHECK_SITE_KEY), isTokenAutoRefreshEnabled: true });
    } catch (e) { console.error('[Firebase] App Check failed to start', e); }
  }
} else {
  console.warn('[Firebase] Not configured. Public pages run in preview mode; forms and the admin area are disabled until firebase.js is configured.');
}
const live = () => !!db;
const need = () => { if (!live()) throw new Error('The church database is not connected yet. Please try again later.'); };
const rows = s => s.docs.map(d => ({ id: d.id, ...d.data() }));
window.CAC_BACKEND = { configured: live() };

/* ---------- AUTH (admins are listed in Firestore: admins/{uid}) ---------- */
window.cacAuth = {
  available: () => !!auth,
  signIn: (email, pass) => { if (!auth) throw new Error('Firebase is not configured.'); return signInWithEmailAndPassword(auth, email, pass); },
  signOut: () => auth ? signOut(auth) : Promise.resolve(),
  /** cb(user|null, role|null) – role is null unless the user is a registered admin */
  onChange: cb => {
    if (!auth) { cb(null, null); return () => {}; }
    return onAuthStateChanged(auth, async u => {
      if (!u) return cb(null, null);
      try { const s = await getDoc(doc(db, 'admins', u.uid)); cb(u, s.exists() ? (s.data().role || 'editor') : null); }
      catch { cb(u, null); }
    });
  }
};

/* ---------- PRAYER REQUESTS (public create-only; admin read) ---------- */
window.savePrayerRequest = async d => { need(); return addDoc(collection(db,'prayer_requests'), { ...d, timestamp: serverTimestamp(), status:'pending' }); };
window.getPrayerRequests = async () => { need(); return rows(await getDocs(query(collection(db,'prayer_requests'), orderBy('timestamp','desc')))); };
window.deletePrayerRequest = async id => { need(); await deleteDoc(doc(db,'prayer_requests',id)); };
window.listenToPrayerRequests = cb => live() ? onSnapshot(query(collection(db,'prayer_requests'), orderBy('timestamp','desc')), s => cb(rows(s))) : () => {};

/* ---------- NEWSLETTER / VISITORS ---------- */
window.saveNewsletter = async d => { need(); return addDoc(collection(db,'newsletters'), { email: d.email, timestamp: serverTimestamp() }); };
window.saveVisitorEnquiry = async d => { need(); return addDoc(collection(db,'visitor_enquiries'), { ...d, status:'new', timestamp: serverTimestamp() }); };
window.getVisitorEnquiries = async () => { need(); return rows(await getDocs(query(collection(db,'visitor_enquiries'), orderBy('timestamp','desc')))); };

/* ---------- SERMONS / AUDIO / GALLERY ---------- */
window.saveSermon      = async d => { need(); return addDoc(collection(db,'sermons'), { ...d, createdAt: serverTimestamp() }); };
window.getSermons      = async () => live() ? rows(await getDocs(query(collection(db,'sermons'), orderBy('createdAt','desc')))) : [];
window.deleteSermon    = async id => { need(); await deleteDoc(doc(db,'sermons',id)); };
window.updateSermon    = async (id,d) => { need(); await updateDoc(doc(db,'sermons',id), d); };
window.saveAudioSermon   = async d => { need(); return addDoc(collection(db,'audio_sermons'), { ...d, createdAt: serverTimestamp() }); };
window.getAudioSermons   = async () => live() ? rows(await getDocs(query(collection(db,'audio_sermons'), orderBy('createdAt','desc')))) : [];
window.deleteAudioSermon = async id => { need(); await deleteDoc(doc(db,'audio_sermons',id)); };
window.saveGalleryItem   = async d => { need(); return addDoc(collection(db,'gallery'), { ...d, createdAt: serverTimestamp() }); };
window.getGalleryItems   = async () => live() ? rows(await getDocs(query(collection(db,'gallery'), orderBy('createdAt','desc')))) : [];
window.deleteGalleryItem = async id => { need(); await deleteDoc(doc(db,'gallery',id)); };

/* ---------- EVENTS ---------- */
window.saveEvent   = async d => { need(); return addDoc(collection(db,'events'), { ...d, createdAt: serverTimestamp() }); };
window.getEvents   = async () => live() ? rows(await getDocs(query(collection(db,'events'), orderBy('date','asc')))) : [];
window.updateEvent = async (id,d) => { need(); await updateDoc(doc(db,'events',id), d); };
window.deleteEvent = async id => { need(); await deleteDoc(doc(db,'events',id)); };

/* ---------- DAILY DEVOTIONALS (doc id = YYYY-MM-DD → one per date, retries can't duplicate) ---------- */
window.getPublishedDevotionals = async (n = 60) => live()
  ? rows(await getDocs(query(collection(db,'devotionals'), where('status','==','published'), orderBy('date','desc'), limit(n)))) : [];
window.getAllDevotionals = async () => { need(); return rows(await getDocs(query(collection(db,'devotionals'), orderBy('date','desc'), limit(400)))); };
window.saveDevotional = async d => {
  need();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date || '')) throw new Error('A valid date is required.');
  const id = d.date;
  const { id: _omit, ...data } = d;
  await setDoc(doc(db,'devotionals',id), { ...data, updatedAt: serverTimestamp() }, { merge: true });
  return id;
};
window.deleteDevotional = async id => { need(); await deleteDoc(doc(db,'devotionals',id)); };
/** Idempotent: promotes scheduled → published for any date <= today (Lagos). Safe to run repeatedly. */
window.promoteScheduledDevotionals = async today => {
  need();
  const s = await getDocs(query(collection(db,'devotionals'), where('status','==','scheduled'), where('date','<=',today)));
  await Promise.all(s.docs.map(d => updateDoc(d.ref, { status:'published', publishedAt: serverTimestamp() })));
  return s.size;
};

/* ---------- TESTIMONIES (public create with consent; public read approved only) ---------- */
window.saveTestimony = async d => { need(); return addDoc(collection(db,'testimonies'), { ...d, status:'pending', timestamp: serverTimestamp() }); };
window.getApprovedTestimonies = async () => live() ? rows(await getDocs(query(collection(db,'testimonies'), where('status','==','approved'), orderBy('timestamp','desc'), limit(30)))) : [];
window.getAllTestimonies = async () => { need(); return rows(await getDocs(query(collection(db,'testimonies'), orderBy('timestamp','desc')))); };
window.setTestimonyStatus = async (id, status) => { need(); await updateDoc(doc(db,'testimonies',id), { status }); };
window.deleteTestimony = async id => { need(); await deleteDoc(doc(db,'testimonies',id)); };

/* ---------- BACKUP EXPORT (admin; free, runs in the browser) ---------- */
const plain = v => v && typeof v.toDate === 'function' ? v.toDate().toISOString() : Array.isArray(v) ? v.map(plain) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)])) : v;
window.cacExport = async name => { need(); return (await getDocs(collection(db, name))).docs.map(d => ({ id: d.id, ...plain(d.data()) })); };

/* ---------- FILE UPLOAD (Firebase Storage: optional, needs a paid plan; paste-a-link works on the free plan) ---------- */
window.uploadFile = (file, folder='uploads', onProgress=null) => new Promise((res, rej) => {
  if (!storage) return rej(new Error('Storage is not configured.'));
  const safe = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
  const task = uploadBytesResumable(ref(storage, `${folder}/${safe}`), file);
  task.on('state_changed',
    s => { if (onProgress) onProgress(Math.round((s.bytesTransferred/s.totalBytes)*100)); },
    rej,
    async () => res(await getDownloadURL(task.snapshot.ref))
  );
});
window.deleteStorageFile = async path => { if (storage) await deleteObject(ref(storage, path)); };

/* ---------- ADMIN ACTIVITY LOG (best-effort: a logging failure never blocks the admin's action) ---------- */
const logAudit = async (action, target) => {
  try { if (!db || !auth || !auth.currentUser) return;
    await addDoc(collection(db, 'auditLogs'), { action, target: String(target ?? '').slice(0, 120), by: auth.currentUser.email || '', uid: auth.currentUser.uid, at: serverTimestamp() });
  } catch (e) { console.warn('[audit] not recorded:', e.message); }
};
const audited = (name, label, tgt) => { const fn = window[name]; window[name] = async (...a) => { const r = await fn(...a); logAudit(label, tgt(a, r)); return r; }; };
const idOf = a => a[0], titleOf = a => (a[0] && (a[0].title || a[0].caption || a[0].email)) || '';
audited('saveDevotional', 'devotional.save', a => a[0].date + ' [' + a[0].status + ']'); audited('deleteDevotional', 'devotional.delete', idOf);
audited('saveEvent', 'event.create', titleOf); audited('updateEvent', 'event.update', idOf); audited('deleteEvent', 'event.delete', idOf);
audited('saveSermon', 'sermon.create', titleOf); audited('updateSermon', 'sermon.update', idOf); audited('deleteSermon', 'sermon.delete', idOf);
audited('saveAudioSermon', 'audio.create', titleOf); audited('deleteAudioSermon', 'audio.delete', idOf);
audited('saveGalleryItem', 'gallery.create', titleOf); audited('deleteGalleryItem', 'gallery.delete', idOf);
audited('setTestimonyStatus', 'testimony.status', a => a[0] + ' -> ' + a[1]); audited('deleteTestimony', 'testimony.delete', idOf);
audited('deletePrayerRequest', 'prayer.delete', idOf);
window.getAuditLogs = async () => { need(); return rows(await getDocs(query(collection(db, 'auditLogs'), orderBy('at', 'desc'), limit(200)))).map(r => ({ ...r, at: r.at && r.at.toDate ? r.at.toDate().toISOString() : r.at })); };

window.dispatchEvent(new Event('cac-backend-ready'));
export { app, db, storage, auth };
