/* =============================================
   CAC GOOD WORKS — FIREBASE.JS
   Replace firebaseConfig values with your own
   from: https://console.firebase.google.com
   ============================================= */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, updateDoc, query, orderBy, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

/* ── REPLACE THESE WITH YOUR FIREBASE PROJECT CREDENTIALS ── */
const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId:             "YOUR_APP_ID"
};
/* ────────────────────────────────────────────────────────── */

let app, db, storage;
try {
  app     = initializeApp(firebaseConfig);
  db      = getFirestore(app);
  storage = getStorage(app);
  console.log('%c[Firebase] ✓ Connected', 'color:#c9a96e;font-weight:bold;');
} catch(e) {
  console.warn('[Firebase] Running in demo mode — configure firebaseConfig to activate.', e.message);
}

/* PRAYER REQUESTS */
window.savePrayerRequest = async d => {
  if (!db) return null;
  return addDoc(collection(db,'prayer_requests'), { ...d, timestamp: serverTimestamp(), status:'pending' });
};
window.getPrayerRequests = async () => {
  if (!db) return [];
  const s = await getDocs(query(collection(db,'prayer_requests'), orderBy('timestamp','desc')));
  return s.docs.map(d => ({ id:d.id, ...d.data() }));
};
window.deletePrayerRequest = async id => { if (db) await deleteDoc(doc(db,'prayer_requests',id)); };
window.listenToPrayerRequests = cb => {
  if (!db) return () => {};
  return onSnapshot(query(collection(db,'prayer_requests'), orderBy('timestamp','desc')), s => cb(s.docs.map(d => ({ id:d.id, ...d.data() }))));
};

/* NEWSLETTER */
window.saveNewsletter = async d => { if (!db) return null; return addDoc(collection(db,'newsletters'), { ...d, timestamp: serverTimestamp() }); };

/* VIDEO SERMONS */
window.saveSermon      = async d => { if (!db) return null; return addDoc(collection(db,'sermons'), { ...d, createdAt: serverTimestamp() }); };
window.getSermons      = async () => { if (!db) return []; const s = await getDocs(query(collection(db,'sermons'), orderBy('createdAt','desc'))); return s.docs.map(d => ({ id:d.id, ...d.data() })); };
window.deleteSermon    = async id => { if (db) await deleteDoc(doc(db,'sermons',id)); };
window.updateSermon    = async (id,d) => { if (db) await updateDoc(doc(db,'sermons',id), d); };

/* AUDIO SERMONS */
window.saveAudioSermon   = async d => { if (!db) return null; return addDoc(collection(db,'audio_sermons'), { ...d, createdAt: serverTimestamp() }); };
window.getAudioSermons   = async () => { if (!db) return []; const s = await getDocs(query(collection(db,'audio_sermons'), orderBy('createdAt','desc'))); return s.docs.map(d => ({ id:d.id, ...d.data() })); };
window.deleteAudioSermon = async id => { if (db) await deleteDoc(doc(db,'audio_sermons',id)); };

/* GALLERY */
window.saveGalleryItem   = async d => { if (!db) return null; return addDoc(collection(db,'gallery'), { ...d, createdAt: serverTimestamp() }); };
window.getGalleryItems   = async () => { if (!db) return []; const s = await getDocs(query(collection(db,'gallery'), orderBy('createdAt','desc'))); return s.docs.map(d => ({ id:d.id, ...d.data() })); };
window.deleteGalleryItem = async id => { if (db) await deleteDoc(doc(db,'gallery',id)); };

/* EVENTS */
window.saveEvent   = async d => { if (!db) return null; return addDoc(collection(db,'events'), { ...d, createdAt: serverTimestamp() }); };
window.getEvents   = async () => { if (!db) return []; const s = await getDocs(query(collection(db,'events'), orderBy('date','asc'))); return s.docs.map(d => ({ id:d.id, ...d.data() })); };
window.deleteEvent = async id => { if (db) await deleteDoc(doc(db,'events',id)); };

/* FILE UPLOAD */
window.uploadFile = (file, folder='uploads', onProgress=null) => new Promise((res, rej) => {
  if (!storage) {
    /* Demo mode — simulate upload */
    let p = 0;
    const t = setInterval(() => {
      p += 10; if (onProgress) onProgress(Math.min(p, 100));
      if (p >= 100) { clearInterval(t); res(`https://via.placeholder.com/800x600?text=${encodeURIComponent(file.name)}`); }
    }, 150);
    return;
  }
  const safe = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
  const task = uploadBytesResumable(ref(storage, `${folder}/${safe}`), file);
  task.on('state_changed',
    s => { if (onProgress) onProgress(Math.round((s.bytesTransferred/s.totalBytes)*100)); },
    rej,
    async () => res(await getDownloadURL(task.snapshot.ref))
  );
});

window.deleteStorageFile = async path => { if (storage) await deleteObject(ref(storage, path)); };

export { app, db, storage };
