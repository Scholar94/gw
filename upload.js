/* =============================================
   CAC GOOD WORKS ASSEMBLY — UPLOAD.JS
   File Upload Management System
   Handles: Video Sermons, Audio Sermons, Gallery
   Works with firebase.js (window.uploadFile etc.)
   ============================================= */

'use strict';

/* =============================================
   PROGRESS BAR HELPERS
   ============================================= */
function showProgressBar(wrapId, fillId, labelId, percent) {
  const wrap  = document.getElementById(wrapId);
  const fill  = document.getElementById(fillId);
  const label = document.getElementById(labelId);
  if (wrap)  wrap.classList.add('show');
  if (fill)  fill.style.width = Math.min(percent, 100) + '%';
  if (label) label.textContent = `Uploading… ${Math.min(percent, 100)}%`;
}

function hideProgressBar(wrapId) {
  const wrap = document.getElementById(wrapId);
  if (wrap) wrap.classList.remove('show');
}

/* =============================================
   ADMIN TOAST NOTIFICATION
   ============================================= */
function adminToast(message, type = 'success') {
  const toast = document.getElementById('adminToast');
  if (!toast) return;
  const icon = toast.querySelector('i');
  const text = toast.querySelector('span');
  toast.className = `admin-toast ${type} show`;
  if (icon) icon.className = type === 'success'
    ? 'fas fa-check-circle'
    : 'fas fa-exclamation-circle';
  if (text) text.textContent = message;
  setTimeout(() => toast.classList.remove('show'), 4000);
}

/* =============================================
   DROP ZONE SETUP
   ============================================= */
/**
 * Wire up a drag-and-drop upload zone.
 * @param {string}   zoneId    - ID of the .upload-zone div
 * @param {string}   inputId   - ID of the hidden <input type="file">
 * @param {string}   accept    - MIME type filter e.g. 'video/*'
 * @param {Function} onFile    - Callback receiving the selected File object
 */
function setupDropZone(zoneId, inputId, accept, onFile) {
  const zone  = document.getElementById(zoneId);
  const input = document.getElementById(inputId);
  if (!zone || !input) return;

  // Set accepted types on the hidden input
  if (accept) input.setAttribute('accept', accept);

  // Click to open file picker
  zone.addEventListener('click', () => input.click());

  // Drag events
  zone.addEventListener('dragover', e => {
    e.preventDefault();
    zone.classList.add('dragover');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  });

  // File input change
  input.addEventListener('change', e => {
    if (e.target.files[0]) onFile(e.target.files[0]);
  });
}

/**
 * Update the label text inside a drop zone (e.g. after file selected).
 */
function updateDropZoneLabel(zoneId, text) {
  const zone = document.getElementById(zoneId);
  if (!zone) return;
  const p = zone.querySelector('p');
  if (p) p.innerHTML = `<span style="color:var(--gold)">✓</span> ${text}`;
}

/* =============================================
   VIDEO SERMON — UPLOAD & RENDER
   ============================================= */

/** Initialise the video sermon drop zone */
function initSermonDropZone() {
  setupDropZone('sermonDropZone', 'sermonFileInput', 'video/*', file => {
    window._sermonVideoFile = file;
    updateDropZoneLabel('sermonDropZone', `${file.name} (${formatBytes(file.size)})`);
  });
}

/** Handle the sermon upload form submission */
async function handleSermonUpload() {
  const title    = val('sermonTitle');
  const preacher = val('sermonPreacher');
  const category = val('sermonCategory');
  const date     = val('sermonDate');
  const desc     = val('sermonDesc');
  const ytUrl    = val('sermonYoutubeUrl');
  const file     = window._sermonVideoFile;

  if (!title)    { adminToast('Sermon title is required.', 'error'); return; }
  if (!preacher) { adminToast('Preacher name is required.', 'error'); return; }
  if (!file && !ytUrl) { adminToast('Provide a YouTube URL or upload a video file.', 'error'); return; }

  const btn = document.getElementById('uploadSermonBtn');
  setButtonLoading(btn, true, 'Uploading…');

  try {
    let videoUrl   = ytUrl;
    let storagePath = '';

    if (file) {
      videoUrl = await window.uploadFile(file, 'sermons', pct => {
        showProgressBar('sermonProgressWrap', 'sermonProgressFill', 'sermonProgressLabel', pct);
      });
      storagePath = `sermons/${file.name}`;
    }

    const data = {
      title, preacher, category, date,
      description: desc, videoUrl, storagePath,
      type: 'video',
    };

    if (typeof window.saveSermon === 'function') {
      await window.saveSermon(data);
    }

    adminToast('Sermon uploaded successfully!');
    document.getElementById('sermonUploadForm')?.reset();
    window._sermonVideoFile = null;
    updateDropZoneLabel('sermonDropZone', 'Click or drag video file here');
    hideProgressBar('sermonProgressWrap');

    // Refresh table if visible
    if (typeof window.loadSermons === 'function') await window.loadSermons();

  } catch (err) {
    console.error('[upload.js] Sermon upload error:', err);
    adminToast('Upload failed: ' + err.message, 'error');
  }

  setButtonLoading(btn, false, '<i class="fas fa-upload"></i> Upload Sermon');
}

/** Fetch and render the sermons table */
async function loadSermons() {
  const tbody = document.getElementById('sermonTableBody');
  if (!tbody) return;

  tbody.innerHTML = loadingRow(5, 'Loading sermons…');

  try {
    const rows = typeof window.getSermons === 'function'
      ? await window.getSermons()
      : getDemoSermons();

    window._allSermons = rows;
    renderSermonRows(rows);
  } catch (err) {
    tbody.innerHTML = errorRow(5, 'Failed to load sermons.');
  }
}

function renderSermonRows(sermons) {
  const tbody = document.getElementById('sermonTableBody');
  if (!tbody) return;

  if (!sermons.length) {
    tbody.innerHTML = emptyRow(5, 'No sermons yet. Upload your first message!');
    return;
  }

  tbody.innerHTML = sermons.map(s => `
    <tr>
      <td style="font-weight:500;color:var(--white);">${esc(s.title)}</td>
      <td>${esc(s.preacher)}</td>
      <td><span class="badge info">${esc(s.category || 'General')}</span></td>
      <td>${esc(s.date || '—')}</td>
      <td style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        ${s.videoUrl && s.videoUrl !== '#'
          ? `<a href="${esc(s.videoUrl)}" target="_blank" class="admin-btn secondary" style="padding:6px 12px;" title="Watch">
               <i class="fas fa-play"></i>
             </a>`
          : ''}
        <button class="admin-btn danger" style="padding:6px 12px;"
          onclick="confirmDelete('sermon','${s.id}')" title="Delete">
          <i class="fas fa-trash"></i>
        </button>
      </td>
    </tr>`).join('');
}

function filterSermons(query) {
  const q = query.toLowerCase();
  const filtered = (window._allSermons || []).filter(s =>
    (s.title + s.preacher + s.category).toLowerCase().includes(q)
  );
  renderSermonRows(filtered);
}

/* =============================================
   AUDIO SERMON — UPLOAD & RENDER
   ============================================= */

function initAudioDropZone() {
  setupDropZone('audioDropZone', 'audioFileInput', 'audio/*', file => {
    window._audioFile = file;
    updateDropZoneLabel('audioDropZone', `${file.name} (${formatBytes(file.size)})`);
  });
}

async function handleAudioUpload() {
  const title    = val('audioTitle');
  const preacher = val('audioPreacher');
  const category = val('audioCategory');
  const date     = val('audioDate');
  const file     = window._audioFile;

  if (!title)    { adminToast('Sermon title is required.', 'error'); return; }
  if (!preacher) { adminToast('Preacher name is required.', 'error'); return; }
  if (!file)     { adminToast('Please select an audio file.', 'error'); return; }

  const btn = document.getElementById('uploadAudioBtn');
  setButtonLoading(btn, true, 'Uploading…');

  try {
    const audioUrl = await window.uploadFile(file, 'audio-sermons', pct => {
      showProgressBar('audioProgressWrap', 'audioProgressFill', 'audioProgressLabel', pct);
    });

    const data = { title, preacher, category, date, audioUrl, type: 'audio' };

    if (typeof window.saveAudioSermon === 'function') {
      await window.saveAudioSermon(data);
    }

    adminToast('Audio sermon uploaded!');
    document.getElementById('audioUploadForm')?.reset();
    window._audioFile = null;
    updateDropZoneLabel('audioDropZone', 'Click or drag audio file here');
    hideProgressBar('audioProgressWrap');

    if (typeof window.loadAudio === 'function') await window.loadAudio();

  } catch (err) {
    console.error('[upload.js] Audio upload error:', err);
    adminToast('Upload failed: ' + err.message, 'error');
  }

  setButtonLoading(btn, false, '<i class="fas fa-upload"></i> Upload Audio');
}

async function loadAudio() {
  const tbody = document.getElementById('audioTableBody');
  if (!tbody) return;

  tbody.innerHTML = loadingRow(4, 'Loading audio sermons…');

  try {
    const rows = typeof window.getAudioSermons === 'function'
      ? await window.getAudioSermons()
      : [];

    if (!rows.length) {
      tbody.innerHTML = emptyRow(4, 'No audio sermons yet.');
      return;
    }

    tbody.innerHTML = rows.map(s => `
      <tr>
        <td style="font-weight:500;color:var(--white);">${esc(s.title)}</td>
        <td>${esc(s.preacher)}</td>
        <td>${esc(s.date || '—')}</td>
        <td>
          ${s.audioUrl
            ? `<audio controls src="${esc(s.audioUrl)}" style="height:28px;vertical-align:middle;max-width:220px;"></audio>`
            : '<span style="color:var(--white-60);font-size:0.8rem;">No audio URL</span>'}
          <button class="admin-btn danger" style="padding:6px 12px;margin-left:10px;vertical-align:middle;"
            onclick="confirmDelete('audio','${s.id}')" title="Delete">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      </tr>`).join('');
  } catch (err) {
    tbody.innerHTML = errorRow(4, 'Failed to load audio sermons.');
  }
}

/* =============================================
   GALLERY — UPLOAD & RENDER
   ============================================= */

function initGalleryDropZone() {
  setupDropZone('galleryDropZone', 'galleryFileInput', 'image/*,video/*', file => {
    window._galleryFile = file;
    updateDropZoneLabel('galleryDropZone', `${file.name} (${formatBytes(file.size)})`);
  });
}

async function handleGalleryUpload() {
  const caption  = val('galleryCaption');
  const category = val('galleryCategory');
  const file     = window._galleryFile;

  if (!file) { adminToast('Please select an image or video file.', 'error'); return; }

  const btn = document.getElementById('uploadGalleryBtn');
  setButtonLoading(btn, true, 'Uploading…');

  try {
    const isVideo  = file.type.startsWith('video/');
    const folder   = isVideo ? 'gallery/videos' : 'gallery/images';

    const mediaUrl = await window.uploadFile(file, folder, pct => {
      showProgressBar('galleryProgressWrap', 'galleryProgressFill', 'galleryProgressLabel', pct);
    });

    const data = {
      caption:   caption || file.name,
      category,
      mediaUrl,
      mediaType: isVideo ? 'video' : 'image',
      fileName:  file.name,
    };

    if (typeof window.saveGalleryItem === 'function') {
      await window.saveGalleryItem(data);
    }

    adminToast('Media uploaded to gallery!');
    document.getElementById('galleryUploadForm')?.reset();
    window._galleryFile = null;
    updateDropZoneLabel('galleryDropZone', 'Click or drag image/video here');
    hideProgressBar('galleryProgressWrap');

    if (typeof window.loadGallery === 'function') await window.loadGallery();

  } catch (err) {
    console.error('[upload.js] Gallery upload error:', err);
    adminToast('Upload failed: ' + err.message, 'error');
  }

  setButtonLoading(btn, false, '<i class="fas fa-upload"></i> Upload to Gallery');
}

async function loadGallery() {
  const grid = document.getElementById('adminGalleryGrid');
  if (!grid) return;

  grid.innerHTML = `<div style="color:var(--white-60);text-align:center;grid-column:1/-1;padding:40px;">
    <i class="fas fa-spinner fa-spin" style="font-size:1.5rem;color:var(--gold);"></i>
    <p style="margin-top:12px;">Loading gallery…</p>
  </div>`;

  try {
    window._allGallery = typeof window.getGalleryItems === 'function'
      ? await window.getGalleryItems()
      : [];

    renderGalleryGrid(window._allGallery);
  } catch (err) {
    grid.innerHTML = `<div style="color:var(--danger);grid-column:1/-1;padding:20px;">
      Failed to load gallery items.
    </div>`;
  }
}

function renderGalleryGrid(items) {
  const grid = document.getElementById('adminGalleryGrid');
  if (!grid) return;

  if (!items.length) {
    grid.innerHTML = `<div style="color:var(--white-60);text-align:center;grid-column:1/-1;padding:60px;">
      <i class="fas fa-images" style="font-size:3rem;opacity:0.3;display:block;margin-bottom:12px;"></i>
      No media uploaded yet.
    </div>`;
    return;
  }

  grid.innerHTML = items.map(item => `
    <div class="media-item">
      <div class="media-item-thumb">
        ${item.mediaType === 'video'
          ? `<i class="fas fa-video" style="font-size:2rem;color:var(--gold);opacity:0.5;"></i>`
          : `<img src="${esc(item.mediaUrl)}" alt="${esc(item.caption)}"
               style="width:100%;height:100%;object-fit:cover;" loading="lazy"
               onerror="this.style.display='none'">`}
      </div>
      <div class="media-item-info">
        <div class="media-item-name">${esc(item.caption || 'Untitled')}</div>
        <div class="media-item-size">${esc(item.category || 'General')}</div>
      </div>
      <button class="media-item-delete" title="Delete"
        onclick="confirmDelete('gallery','${item.id}')">
        <i class="fas fa-times"></i>
      </button>
    </div>`).join('');
}

function filterGallery(category) {
  const filtered = category
    ? (window._allGallery || []).filter(i => i.category === category)
    : (window._allGallery || []);
  renderGalleryGrid(filtered);
}

/* =============================================
   PRAYER REQUESTS — RENDER
   ============================================= */

async function loadPrayers() {
  const tbody = document.getElementById('prayerTableBody');
  if (!tbody) return;

  tbody.innerHTML = loadingRow(5, 'Loading prayer requests…');

  try {
    window._allPrayers = typeof window.getPrayerRequests === 'function'
      ? await window.getPrayerRequests()
      : getDemoPrayers();

    // Update summary counts
    updatePrayerCounts(window._allPrayers);
    renderPrayerRows(window._allPrayers);

  } catch (err) {
    tbody.innerHTML = errorRow(5, 'Failed to load prayer requests.');
  }
}

function updatePrayerCounts(prayers) {
  const counts = { prayer: 0, testimony: 0, counselling: 0 };
  prayers.forEach(p => { if (counts[p.type] !== undefined) counts[p.type]++; });
  const pEl = document.getElementById('countPrayer');
  const tEl = document.getElementById('countTestimony');
  const cEl = document.getElementById('countCounselling');
  if (pEl) pEl.textContent = counts.prayer;
  if (tEl) tEl.textContent = counts.testimony;
  if (cEl) cEl.textContent = counts.counselling;
}

function renderPrayerRows(prayers) {
  const tbody = document.getElementById('prayerTableBody');
  if (!tbody) return;

  if (!prayers.length) {
    tbody.innerHTML = emptyRow(5, 'No prayer requests yet.');
    return;
  }

  tbody.innerHTML = prayers.map(p => `
    <tr>
      <td style="font-weight:500;color:var(--white);">${esc(p.name || '—')}</td>
      <td><span class="prayer-type-badge ${esc(p.type || 'prayer')}">${esc(p.type || 'prayer')}</span></td>
      <td style="max-width:240px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
        ${esc(p.request || '—')}
      </td>
      <td>${esc(p.phone || '—')}</td>
      <td>
        <button class="admin-btn danger" style="padding:6px 12px;"
          onclick="confirmDelete('prayer','${p.id}')" title="Delete">
          <i class="fas fa-trash"></i>
        </button>
      </td>
    </tr>`).join('');
}

function filterPrayers(type) {
  const filtered = type
    ? (window._allPrayers || []).filter(p => p.type === type)
    : (window._allPrayers || []);
  renderPrayerRows(filtered);
}

/* =============================================
   EVENTS — SAVE & RENDER
   ============================================= */

async function handleEventSave() {
  const title  = val('eventTitle');
  const type   = val('eventType');
  const date   = val('eventDate');
  const time   = val('eventTime');
  const venue  = val('eventVenue');
  const status = val('eventStatus');
  const desc   = val('eventDesc');

  if (!title) { adminToast('Event title is required.', 'error'); return; }
  if (!date)  { adminToast('Event date is required.', 'error'); return; }

  try {
    if (typeof window.saveEvent === 'function') {
      await window.saveEvent({ title, type, date, time, venue, status, description: desc });
    }
    adminToast('Event saved successfully!');
    document.getElementById('eventForm')?.reset();
    if (typeof window.loadEvents === 'function') await window.loadEvents();
  } catch (err) {
    adminToast('Save failed: ' + err.message, 'error');
  }
}

async function loadEvents() {
  const tbody = document.getElementById('eventTableBody');
  if (!tbody) return;

  tbody.innerHTML = loadingRow(6, 'Loading events…');

  try {
    window._allEvents = typeof window.getEvents === 'function'
      ? await window.getEvents()
      : getDemoEvents();

    if (!window._allEvents.length) {
      tbody.innerHTML = emptyRow(6, 'No events yet.');
      return;
    }

    tbody.innerHTML = window._allEvents.map(ev => `
      <tr>
        <td style="font-weight:500;color:var(--white);">${esc(ev.title)}</td>
        <td>${esc(ev.type || '—')}</td>
        <td>${esc(ev.date || '—')}</td>
        <td>${esc(ev.venue || '—')}</td>
        <td>
          <span class="badge ${
            ev.status === 'upcoming' ? 'info'
            : ev.status === 'ongoing' ? 'success'
            : 'warning'
          }">${esc(ev.status || '—')}</span>
        </td>
        <td>
          <button class="admin-btn danger" style="padding:6px 12px;"
            onclick="confirmDelete('event','${ev.id}')" title="Delete">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      </tr>`).join('');
  } catch (err) {
    tbody.innerHTML = errorRow(6, 'Failed to load events.');
  }
}

/* =============================================
   DELETE CONFIRMATION
   ============================================= */
async function confirmDelete(type, id) {
  if (!confirm('Delete this item? This action cannot be undone.')) return;

  try {
    switch (type) {
      case 'sermon':
        if (typeof window.deleteSermon       === 'function') await window.deleteSermon(id);
        if (typeof window.loadSermons        === 'function') await window.loadSermons();
        break;
      case 'audio':
        if (typeof window.deleteAudioSermon  === 'function') await window.deleteAudioSermon(id);
        if (typeof window.loadAudio          === 'function') await window.loadAudio();
        break;
      case 'gallery':
        if (typeof window.deleteGalleryItem  === 'function') await window.deleteGalleryItem(id);
        if (typeof window.loadGallery        === 'function') await window.loadGallery();
        break;
      case 'prayer':
        if (typeof window.deletePrayerRequest=== 'function') await window.deletePrayerRequest(id);
        if (typeof window.loadPrayers        === 'function') await window.loadPrayers();
        break;
      case 'event':
        if (typeof window.deleteEvent        === 'function') await window.deleteEvent(id);
        if (typeof window.loadEvents         === 'function') await window.loadEvents();
        break;
    }
    adminToast('Item deleted successfully.');
  } catch (err) {
    adminToast('Delete failed: ' + err.message, 'error');
  }
}

/* =============================================
   LIVESTREAM SETTINGS
   ============================================= */
function saveLivestreamSettings() {
  const settings = {
    channelId:    val('ytChannelId'),
    videoId:      val('ytVideoId'),
    liveStatus:   val('liveStatus'),
    announcement: val('liveAnnouncement'),
  };
  localStorage.setItem('cacLiveSettings', JSON.stringify(settings));
  adminToast('Livestream settings saved!');
}

/* Archive links */
let _archives = JSON.parse(localStorage.getItem('cacArchives') || '[]');

function addArchive() {
  const title = val('archiveTitle');
  const url   = val('archiveUrl');
  if (!title || !url) { adminToast('Enter both title and URL.', 'error'); return; }
  _archives.push({ id: Date.now(), title, url });
  localStorage.setItem('cacArchives', JSON.stringify(_archives));
  document.getElementById('archiveTitle').value = '';
  document.getElementById('archiveUrl').value   = '';
  renderArchives();
  adminToast('Archive link added!');
}

function removeArchive(id) {
  _archives = _archives.filter(a => a.id !== id);
  localStorage.setItem('cacArchives', JSON.stringify(_archives));
  renderArchives();
  adminToast('Archive link removed.');
}

function renderArchives() {
  const list = document.getElementById('archiveList');
  if (!list) return;
  if (!_archives.length) {
    list.innerHTML = '<p style="color:var(--white-60);font-size:0.875rem;">No archive links added yet.</p>';
    return;
  }
  list.innerHTML = _archives.map(a => `
    <div style="display:flex;align-items:center;justify-content:space-between;
      background:var(--dark-bg);border:1px solid var(--dark-border);
      border-radius:8px;padding:12px 16px;gap:12px;">
      <a href="${esc(a.url)}" target="_blank"
        style="color:var(--gold);font-size:0.875rem;flex:1;
          white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
        ${esc(a.title)}
      </a>
      <button class="admin-btn danger" style="padding:4px 10px;font-size:0.75rem;flex-shrink:0;"
        onclick="removeArchive(${a.id})">
        <i class="fas fa-times"></i>
      </button>
    </div>`).join('');
}

/* =============================================
   DASHBOARD STATS LOADER
   ============================================= */
async function loadDashboard() {
  try {
    const [sermons, audio, gallery, prayers] = await Promise.allSettled([
      typeof window.getSermons        === 'function' ? window.getSermons()        : Promise.resolve(getDemoSermons()),
      typeof window.getAudioSermons   === 'function' ? window.getAudioSermons()   : Promise.resolve([]),
      typeof window.getGalleryItems   === 'function' ? window.getGalleryItems()   : Promise.resolve([]),
      typeof window.getPrayerRequests === 'function' ? window.getPrayerRequests() : Promise.resolve(getDemoPrayers()),
    ]);

    const sv = sermons.status  === 'fulfilled' ? sermons.value  : getDemoSermons();
    const av = audio.status    === 'fulfilled' ? audio.value    : [];
    const gv = gallery.status  === 'fulfilled' ? gallery.value  : [];
    const pv = prayers.status  === 'fulfilled' ? prayers.value  : getDemoPrayers();

    setText('statSermons',  sv.length);
    setText('statAudio',    av.length);
    setText('statGallery',  gv.length);
    setText('statPrayers',  pv.length);

    const unread = pv.filter(p => p.status !== 'read').length;
    setText('notifBadge', unread || 0);

  } catch (err) {
    console.warn('[upload.js] Dashboard load error:', err);
  }
}

/* =============================================
   DEMO / FALLBACK DATA
   ============================================= */
function getDemoSermons() {
  return [
    { id:'d1', title:"Walking In God's Presence", preacher:'Pastor Akin Akinbajo', category:'Faith',   date:'2026-01-12', videoUrl:'#' },
    { id:'d2', title:'The Power of Prayer',        preacher:'Pastor Akin Akinbajo', category:'Prayer',  date:'2026-01-05', videoUrl:'#' },
    { id:'d3', title:'Seeking His Face',            preacher:'Pastor Olusheye',      category:'Worship', date:'2025-12-29', videoUrl:'#' },
  ];
}
function getDemoPrayers() {
  return [
    { id:'p1', name:'John Adeyemi',  type:'prayer',     request:'Please pray for my healing and restoration.',      phone:'+234 800 000 0001', status:'pending' },
    { id:'p2', name:'Grace Okafor', type:'testimony', request:'God answered my prayer for a job! Hallelujah!',   phone:'+234 800 000 0002', status:'pending' },
    { id:'p3', name:'Chioma E.',     type:'counselling', request:'I need guidance on a personal matter.',           phone:'+234 800 000 0003', status:'pending' },
  ];
}
function getDemoEvents() {
  return [
    { id:'e1', title:'Sunday Service',             type:'Sunday Service',    date:'2026-05-11', time:'08:00', venue:'Church Auditorium', status:'upcoming' },
    { id:'e2', title:'Ruth & Boaz Couples Meeting', type:'Ruth & Boaz',       date:'2026-05-15', time:'17:00', venue:'Fellowship Hall',   status:'upcoming' },
    { id:'e3', title:'Corporate Fasting & Prayer',  type:'Fasting & Prayer',  date:'2026-05-28', time:'06:00', venue:'Church Auditorium', status:'upcoming' },
  ];
}

/* =============================================
   UTILITY HELPERS
   ============================================= */

/** Get trimmed value from an input/select element */
function val(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}

/** Set text content of an element */
function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

/** HTML-escape to prevent XSS in rendered content */
function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

/** Format bytes to KB/MB string */
function formatBytes(bytes) {
  if (bytes < 1024)      return bytes + ' B';
  if (bytes < 1048576)   return (bytes/1024).toFixed(1)   + ' KB';
  return                        (bytes/1048576).toFixed(1) + ' MB';
}

/** Show/hide a button's loading state */
function setButtonLoading(btn, loading, label) {
  if (!btn) return;
  btn.disabled = loading;
  btn.innerHTML = loading
    ? '<i class="fas fa-spinner fa-spin"></i> ' + label
    : label;
}

/** Table helpers */
function loadingRow(cols, msg) {
  return `<tr><td colspan="${cols}" style="text-align:center;color:var(--white-60);padding:32px;">
    <i class="fas fa-spinner fa-spin" style="color:var(--gold);margin-right:8px;"></i>${msg}
  </td></tr>`;
}
function emptyRow(cols, msg) {
  return `<tr><td colspan="${cols}" style="text-align:center;color:var(--white-60);padding:48px;">
    <i class="fas fa-inbox" style="font-size:2rem;opacity:0.3;display:block;margin-bottom:12px;"></i>${msg}
  </td></tr>`;
}
function errorRow(cols, msg) {
  return `<tr><td colspan="${cols}" style="color:var(--danger);padding:20px;">${msg}</td></tr>`;
}

/* =============================================
   EXPOSE GLOBALS FOR ADMIN DASHBOARD HTML
   ============================================= */
window.handleSermonUpload   = handleSermonUpload;
window.handleAudioUpload    = handleAudioUpload;
window.handleGalleryUpload  = handleGalleryUpload;
window.handleEventSave      = handleEventSave;
window.loadSermons          = loadSermons;
window.loadAudio            = loadAudio;
window.loadGallery          = loadGallery;
window.loadPrayers          = loadPrayers;
window.loadEvents           = loadEvents;
window.loadDashboard        = loadDashboard;
window.filterSermons        = filterSermons;
window.filterGallery        = filterGallery;
window.filterPrayers        = filterPrayers;
window.confirmDelete        = confirmDelete;
window.saveLivestreamSettings = saveLivestreamSettings;
window.addArchive           = addArchive;
window.removeArchive        = removeArchive;
window.renderArchives       = renderArchives;
window.adminToast           = adminToast;
window.setupDropZone        = setupDropZone;
window.updateDropZoneLabel  = updateDropZoneLabel;
window.initSermonDropZone   = initSermonDropZone;
window.initAudioDropZone    = initAudioDropZone;
window.initGalleryDropZone  = initGalleryDropZone;
