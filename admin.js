/* ===== PANEL SWITCHING ===== */
let allSermons  = [];
let allPrayers  = [];
let allGallery  = [];
let allEvents   = [];
let archives    = JSON.parse(localStorage.getItem('cacArchives') || '[]');

function showPanel(name) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.sidebar-nav-link').forEach(l => l.classList.remove('active'));
  document.getElementById('panel-' + name).classList.add('active');
  document.querySelectorAll('.sidebar-nav-link').forEach(l => {
    if (l.textContent.toLowerCase().includes(name === 'dashboard' ? 'dashboard' : name)) l.classList.add('active');
  });
  document.getElementById('topbarTitle').textContent =
    name.charAt(0).toUpperCase() + name.slice(1).replace('-', ' ');

  if (name === 'live' && window.loadLive) window.loadLive();
  if (name === 'rsvp' && window.loadRsvp) window.loadRsvp();
  if (name === 'giving' && window.loadGiving) window.loadGiving();
  if (name !== 'rsvp' && window.stopScan) window.stopScan();
  if (name === 'dashboard') loadDashboard();
  if (name === 'sermons')   loadSermons();
  if (name === 'audio')     loadAudio();
  if (name === 'gallery')   loadGallery();
  if (name === 'events')    loadEvents();
  if (name === 'devotionals') loadDevotionals();
  if (name === 'bbc')       loadBBC();
  if (name === 'testimonies') loadTestimonies();
  if (name === 'visitors')  loadVisitors();
  if (name === 'backup')    initBackup();
  if (name === 'activity')  loadActivity();
  if (name === 'prayers')   loadPrayers();
  if (name === 'livestream') renderArchives();

  // Close mobile sidebar
  document.getElementById('adminSidebar').classList.remove('open');
}

/* ===== LOGOUT ===== */
function doLogout() {
  if (!confirm('Sign out of the admin panel?')) return;
  window.cacAuth.signOut().finally(() => { window.location.href = 'admin-login.html'; });
}

/* ===== TOPBAR DATE ===== */
(function() {
  const el = document.getElementById('topbarDate');
  if (el) el.textContent = new Date().toLocaleDateString('en-NG', { weekday:'short', year:'numeric', month:'short', day:'numeric' });
})();

/* ===== MOBILE SIDEBAR ===== */
document.getElementById('sidebarToggle').addEventListener('click', () => {
  document.getElementById('adminSidebar').classList.toggle('open');
});

/* ===== LOAD DASHBOARD ===== */
async function loadDashboard() {
  try {
    const s = typeof window.getSermons === 'function'      ? await window.getSermons()      : getDemoSermons();
    const a = typeof window.getAudioSermons === 'function' ? await window.getAudioSermons() : [];
    const g = typeof window.getGalleryItems === 'function' ? await window.getGalleryItems() : [];
    const p = typeof window.getPrayerRequests === 'function' ? await window.getPrayerRequests() : getDemoPrayers();
    document.getElementById('statSermons').textContent  = s.length;
    document.getElementById('statAudio').textContent    = a.length;
    document.getElementById('statGallery').textContent  = g.length;
    document.getElementById('statPrayers').textContent  = p.length;
    document.getElementById('notifBadge').textContent   = p.filter(x => x.status !== 'read').length || 0;
  } catch(e) { console.warn('Dashboard load:', e); }
}

/* ===== SERMON HANDLERS ===== */
setupDropZoneHandler('sermonDropZone', 'sermonFileInput', 'video/*', f => {
  window._sermonVideoFile = f;
  document.querySelector('#sermonDropZone p').innerHTML = `<span style="color:var(--gold)">✓</span> ${esc(f.name)}`;
});

async function handleSermonUpload() {
  const title    = document.getElementById('sermonTitle').value.trim();
  const preacher = document.getElementById('sermonPreacher').value.trim();
  const category = document.getElementById('sermonCategory').value;
  const date     = document.getElementById('sermonDate').value;
  const desc     = document.getElementById('sermonDesc').value.trim();
  const ytUrl    = document.getElementById('sermonYoutubeUrl').value.trim();
  const file     = window._sermonVideoFile;

  if (!title || !preacher) { showToast('Title and preacher are required.', 'error'); return; }

  const btn = document.getElementById('uploadSermonBtn');
  btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';

  try {
    let videoUrl = ytUrl;
    if (file && typeof window.uploadFile === 'function') {
      videoUrl = await window.uploadFile(file, 'sermons', pct => {
        showProgressBar('sermonProgressWrap','sermonProgressFill','sermonProgressLabel', pct);
      });
    }
    const data = { title, preacher, category, date, description: desc, videoUrl, type: 'video' };
    if (typeof window.saveSermon === 'function') await window.saveSermon(data);
    showToast('Sermon uploaded successfully!');
    document.getElementById('sermonUploadForm').reset();
    window._sermonVideoFile = null;
    document.querySelector('#sermonDropZone p').innerHTML = 'Click or drag video file here<br><span>MP4, MOV, AVI — Max 500MB</span>';
    hideProgressBar('sermonProgressWrap');
    await loadSermons();
  } catch(e) { showToast('Upload failed: ' + e.message, 'error'); }
  btn.disabled = false; btn.innerHTML = '<i class="fas fa-upload"></i> Upload Sermon';
}

async function loadSermons() {
  const tbody = document.getElementById('sermonTableBody');
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--white-60);padding:24px;"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';
  try {
    allSermons = typeof window.getSermons === 'function' ? await window.getSermons() : getDemoSermons();
    renderSermonRows(allSermons);
  } catch(e) { tbody.innerHTML = '<tr><td colspan="5" style="color:var(--danger);padding:16px;">Error loading sermons.</td></tr>'; }
}

function renderSermonRows(sermons) {
  const tbody = document.getElementById('sermonTableBody');
  if (!sermons.length) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--white-60);padding:32px;">No sermons uploaded yet.</td></tr>'; return; }
  tbody.innerHTML = sermons.map(s => `
    <tr>
      <td style="font-weight:500;color:var(--white);">${s.title||'—'}</td>
      <td>${s.preacher||'—'}</td>
      <td><span class="badge info">${s.category||'—'}</span></td>
      <td>${s.date||'—'}</td>
      <td style="display:flex;gap:8px;align-items:center;">
        ${s.videoUrl ? `<a href="${s.videoUrl}" target="_blank" class="admin-btn secondary" style="padding:6px 12px;"><i class="fas fa-play"></i></a>` : ''}
        <button class="admin-btn danger" style="padding:6px 12px;" data-on-click="confirmDelete('sermon','${s.id}')"><i class="fas fa-trash"></i></button>
      </td>
    </tr>`).join('');
}

function filterSermons(q) {
  const filtered = allSermons.filter(s => (s.title+s.preacher+s.category).toLowerCase().includes(q.toLowerCase()));
  renderSermonRows(filtered);
}

/* ===== AUDIO HANDLERS ===== */
setupDropZoneHandler('audioDropZone', 'audioFileInput', 'audio/*', f => {
  window._audioFile = f;
  document.querySelector('#audioDropZone p').innerHTML = `<span style="color:var(--gold)">✓</span> ${esc(f.name)}`;
});

async function handleAudioUpload() {
  const title    = document.getElementById('audioTitle').value.trim();
  const preacher = document.getElementById('audioPreacher').value.trim();
  const category = document.getElementById('audioCategory').value;
  const date     = document.getElementById('audioDate').value;
  const file     = window._audioFile;
  const linkUrl  = document.getElementById('audioUrlInput').value.trim();
  const chapters = document.getElementById('audioChapters').value.trim().slice(0, 4000);
  const transcript = document.getElementById('audioTranscript').value.trim().slice(0, 80000);
  if (!title || !preacher) { showToast('Title and preacher are required.', 'error'); return; }
  if (!file && !/^https:\/\/\S+$/i.test(linkUrl)) { showToast('Choose an audio file, or paste a direct https link.', 'error'); return; }

  const btn = document.getElementById('uploadAudioBtn');
  btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
  try {
    const audioUrl = file ? await window.uploadFile(file, 'audio-sermons', pct => {
      showProgressBar('audioProgressWrap','audioProgressFill','audioProgressLabel', pct);
    }) : linkUrl;
    if (typeof window.saveAudioSermon === 'function') await window.saveAudioSermon({ title, preacher, category, date, audioUrl, type:'audio', ...(chapters ? { chapters } : {}), ...(transcript ? { transcript } : {}) });
    showToast('Audio sermon uploaded!');
    document.getElementById('audioUploadForm').reset();
    window._audioFile = null;
    document.querySelector('#audioDropZone p').innerHTML = 'Click or drag audio file here<br><span>MP3, WAV, M4A — Max 100MB</span>';
    hideProgressBar('audioProgressWrap');
    await loadAudio();
  } catch(e) { showToast('Upload failed: ' + e.message, 'error'); }
  btn.disabled = false; btn.innerHTML = '<i class="fas fa-upload"></i> Upload Audio';
}

async function loadAudio() {
  const tbody = document.getElementById('audioTableBody');
  tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--white-60);padding:24px;"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';
  try {
    const items = typeof window.getAudioSermons === 'function' ? await window.getAudioSermons() : [];
    if (!items.length) { tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--white-60);padding:32px;">No audio sermons yet.</td></tr>'; return; }
    tbody.innerHTML = items.map(s => `
      <tr>
        <td style="font-weight:500;color:var(--white);">${esc(s.title)||'—'}</td>
        <td>${esc(s.preacher)||'—'}</td>
        <td>${esc(s.date)||'—'}</td>
        <td><audio controls preload="none" src="${esc(cacMedia.audioSrc(s.audioUrl))}" style="height:28px;vertical-align:middle;"></audio>
          <button class="admin-btn danger" style="padding:6px 12px;margin-left:8px;" data-on-click="confirmDelete('audio','${esc(s.id)}')"><i class="fas fa-trash"></i></button></td>
      </tr>`).join('');
  } catch(e) { tbody.innerHTML = '<tr><td colspan="4" style="color:var(--danger);padding:16px;">Error loading audio.</td></tr>'; }
}

/* ===== GALLERY HANDLERS ===== */
setupDropZoneHandler('galleryDropZone', 'galleryFileInput', 'image/*,video/*', f => {
  window._galleryFile = f;
  document.querySelector('#galleryDropZone p').innerHTML = `<span style="color:var(--gold)">✓</span> ${esc(f.name)}`;
});

async function handleGalleryUpload() {
  const caption  = document.getElementById('galleryCaption').value.trim();
  const category = document.getElementById('galleryCategory').value;
  const file     = window._galleryFile;
  const linkUrl  = document.getElementById('galleryUrlInput').value.trim();
  if (!file && !/^https:\/\/\S+$/i.test(linkUrl)) { showToast('Choose a file, or paste a direct https link.', 'error'); return; }

  const btn = document.getElementById('uploadGalleryBtn');
  btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
  try {
    const isVideo = file ? file.type.startsWith('video/') : /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(linkUrl);
    const folder  = isVideo ? 'gallery/videos' : 'gallery/images';
    const mediaUrl = file ? await window.uploadFile(file, folder, pct => {
      showProgressBar('galleryProgressWrap','galleryProgressFill','galleryProgressLabel', pct);
    }) : linkUrl;
    const fileName = file ? file.name : linkUrl.split('/').pop().split('?')[0];
    if (typeof window.saveGalleryItem === 'function')
      await window.saveGalleryItem({ caption: caption||fileName, category, mediaUrl, mediaType: isVideo?'video':'image', fileName });
    showToast('Media uploaded to gallery!');
    document.getElementById('galleryUploadForm').reset();
    window._galleryFile = null;
    document.querySelector('#galleryDropZone p').innerHTML = 'Click or drag image/video here<br><span>JPG, PNG, MP4 — Max 50MB per file</span>';
    hideProgressBar('galleryProgressWrap');
    await loadGallery();
  } catch(e) { showToast('Upload failed: ' + e.message, 'error'); }
  btn.disabled = false; btn.innerHTML = '<i class="fas fa-upload"></i> Upload to Gallery';
}

async function loadGallery() {
  const grid = document.getElementById('adminGalleryGrid');
  grid.innerHTML = '<div style="color:var(--white-60);text-align:center;grid-column:1/-1;padding:40px;"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';
  try {
    allGallery = typeof window.getGalleryItems === 'function' ? await window.getGalleryItems() : [];
    renderGalleryItems(allGallery);
  } catch(e) { grid.innerHTML = '<div style="color:var(--danger);grid-column:1/-1;padding:20px;">Error loading gallery.</div>'; }
}

function renderGalleryItems(items) {
  const grid = document.getElementById('adminGalleryGrid');
  if (!items.length) { grid.innerHTML = '<div style="color:var(--white-60);text-align:center;grid-column:1/-1;padding:40px;">No media uploaded yet.</div>'; return; }
  grid.innerHTML = items.map(item => `
    <div class="media-item">
      <div class="media-item-thumb">
        ${item.mediaType === 'video'
          ? `<i class="fas fa-video" style="font-size:2rem;color:var(--gold);opacity:0.5;"></i>`
          : `<img src="${esc(cacMedia.imageSrc(item.mediaUrl, 400))}" alt="${esc(item.caption)}" style="width:100%;height:100%;object-fit:cover;" loading="lazy"/>`}
      </div>
      <div class="media-item-info">
        <div class="media-item-name">${item.caption||'Untitled'}</div>
        <div class="media-item-size">${item.category||'General'}</div>
      </div>
      <button class="media-item-delete" data-on-click="confirmDelete('gallery','${item.id}')" aria-label="Delete"><i class="fas fa-times"></i></button>
    </div>`).join('');
}

function filterGallery(cat) {
  const filtered = cat ? allGallery.filter(i => i.category === cat) : allGallery;
  renderGalleryItems(filtered);
}

/* ===== EVENTS HANDLERS ===== */
async function handleEventSave() {
  const title = val('eventTitle'), date = val('eventDate');
  if (!title) return showToast('Event title is required.', 'error');
  if (!date) return showToast('Event date is required.', 'error');
  const time = val('eventTime'), endTime = val('eventEndTime'), endDate = val('eventEndDate');
  if (endDate && endDate < date) return showToast('End date cannot be before the start date.', 'error');
  if (time && endTime && (!endDate || endDate === date) && endTime <= time) return showToast('End time must be after the start time.', 'error');
  try {
    await window.saveEvent({ title, type: val('eventType'), date, time, endTime, endDate, venue: val('eventVenue'), status: val('eventStatus'), description: val('eventDesc'),
      rsvp: val('eventRsvp') === '1', capacity: Math.max(0, Math.min(5000, parseInt(val('eventCapacity'), 10) || 0)), waitlist: val('eventWaitlist') !== '0' });
    showToast('Event saved successfully!');
    document.getElementById('eventForm').reset();
    loadEvents();
  } catch (err) { showToast('Could not save event: ' + err.message, 'error'); }
}
async function loadEvents() {
  const tbody = document.getElementById('eventTableBody');
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--white-60);padding:24px;"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';
  try {
    allEvents = typeof window.getEvents === 'function' ? await window.getEvents() : getDemoEvents();
    if (!allEvents.length) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--white-60);padding:32px;">No events yet.</td></tr>'; return; }
    tbody.innerHTML = allEvents.map(ev => `
      <tr>
        <td style="font-weight:500;color:var(--white);">${ev.title||'—'}</td>
        <td>${ev.type||'—'}</td>
        <td>${ev.date||'—'}</td>
        <td>${ev.venue||'—'}</td>
        <td><span class="badge ${ev.status==='upcoming'?'info':ev.status==='ongoing'?'success':'warning'}">${ev.status||'—'}</span></td>
        <td><button class="admin-btn danger" style="padding:6px 12px;" data-on-click="confirmDelete('event','${ev.id}')"><i class="fas fa-trash"></i></button></td>
      </tr>`).join('');
  } catch(e) { tbody.innerHTML = '<tr><td colspan="6" style="color:var(--danger);padding:16px;">Error loading events.</td></tr>'; }
}

/* ===== PRAYER REQUESTS ===== */
async function loadPrayers() {
  const tbody = document.getElementById('prayerTableBody');
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--white-60);padding:24px;"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';
  try {
    allPrayers = typeof window.getPrayerRequests === 'function' ? await window.getPrayerRequests() : getDemoPrayers();
    document.getElementById('countPrayer').textContent     = allPrayers.filter(p=>p.type==='prayer').length;
    document.getElementById('countTestimony').textContent  = allPrayers.filter(p=>p.type==='testimony').length;
    document.getElementById('countCounselling').textContent= allPrayers.filter(p=>p.type==='counselling').length;
    renderPrayerRows(allPrayers);
  } catch(e) { tbody.innerHTML = '<tr><td colspan="5" style="color:var(--danger);padding:16px;">Error loading requests.</td></tr>'; }
}

function renderPrayerRows(prayers) {
  const tbody = document.getElementById('prayerTableBody');
  if (!prayers.length) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--white-60);padding:32px;">No requests yet.</td></tr>'; return; }
  tbody.innerHTML = prayers.map(p => `
    <tr>
      <td style="font-weight:500;color:var(--white);">${esc(p.name)||'—'}</td>
      <td><span class="prayer-type-badge ${esc(['prayer','testimony','counselling','general'].includes(p.type) ? p.type : 'prayer')}">${esc(p.type||'prayer')}</span></td>
      <td style="max-width:240px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${esc(p.request)}">${esc(p.request)||'—'}</td>
      <td>${esc(p.phone)||'—'}</td>
      <td style="white-space:nowrap"><button type="button" class="admin-btn" style="padding:6px 12px;" data-wall="${esc(p.id)}" title="Publish to the public prayer wall" aria-label="Publish to prayer wall"><i class="fas fa-hands-praying"></i></button> <button class="admin-btn danger" style="padding:6px 12px;" data-on-click="confirmDelete('prayer','${esc(p.id)}')" aria-label="Delete"><i class="fas fa-trash"></i></button></td>
    </tr>`).join('');
}

function filterPrayers(type) {
  const filtered = type ? allPrayers.filter(p => p.type === type) : allPrayers;
  renderPrayerRows(filtered);
}

/* ===== LIVESTREAM / ARCHIVE ===== */
function saveLivestreamSettings() {
  const settings = {
    channelId: document.getElementById('ytChannelId').value.trim(),
    videoId: document.getElementById('ytVideoId').value.trim(),
    liveStatus: document.getElementById('liveStatus').value,
    announcement: document.getElementById('liveAnnouncement').value.trim()
  };
  localStorage.setItem('cacLiveSettings', JSON.stringify(settings));
  showToast('Livestream settings saved!');
}

function addArchive() {
  const title = document.getElementById('archiveTitle').value.trim();
  const url   = document.getElementById('archiveUrl').value.trim();
  if (!title || !url) { showToast('Enter both title and URL.', 'error'); return; }
  archives.push({ title, url, id: Date.now() });
  localStorage.setItem('cacArchives', JSON.stringify(archives));
  document.getElementById('archiveTitle').value = '';
  document.getElementById('archiveUrl').value   = '';
  renderArchives();
  showToast('Archive link added!');
}

function removeArchive(id) {
  archives = archives.filter(a => a.id !== id);
  localStorage.setItem('cacArchives', JSON.stringify(archives));
  renderArchives();
}

function renderArchives() {
  const list = document.getElementById('archiveList');
  if (!list) return;
  if (!archives.length) { list.innerHTML = '<p style="color:var(--white-60);font-size:0.875rem;">No archive links added yet.</p>'; return; }
  list.innerHTML = archives.map(a => `
    <div style="display:flex;align-items:center;justify-content:space-between;background:var(--dark-bg);border:1px solid var(--dark-border);border-radius:8px;padding:12px 16px;">
      <div><a href="${a.url}" target="_blank" style="color:var(--gold);font-size:0.875rem;">${a.title}</a></div>
      <button class="admin-btn danger" style="padding:4px 10px;font-size:0.75rem;" data-on-click="removeArchive(${a.id})"><i class="fas fa-times"></i></button>
    </div>`).join('');
}

/* ===== DELETE CONFIRM ===== */
async function confirmDelete(type, id) {
  if (!confirm('Delete this item? This cannot be undone.')) return;
  try {
    if (type === 'sermon' && typeof window.deleteSermon === 'function') { await window.deleteSermon(id); await loadSermons(); }
    else if (type === 'audio' && typeof window.deleteAudioSermon === 'function') { await window.deleteAudioSermon(id); await loadAudio(); }
    else if (type === 'gallery' && typeof window.deleteGalleryItem === 'function') { await window.deleteGalleryItem(id); await loadGallery(); }
    else if (type === 'prayer' && typeof window.deletePrayerRequest === 'function') { await window.deletePrayerRequest(id); await loadPrayers(); }
    else if (type === 'event' && typeof window.deleteEvent === 'function') { await window.deleteEvent(id); await loadEvents(); }
    else { showToast('Item removed (Firebase not configured — reconnect to persist).'); }
    showToast('Item deleted successfully.');
  } catch(e) { showToast('Delete failed: ' + e.message, 'error'); }
}

/* ===== PROGRESS BAR HELPERS ===== */
function showProgressBar(wrapId, fillId, labelId, pct) {
  const wrap = document.getElementById(wrapId);
  if (wrap) wrap.classList.add('show');
  const fill = document.getElementById(fillId); if (fill) fill.style.width = pct + '%';
  const lbl  = document.getElementById(labelId); if (lbl) lbl.textContent = 'Uploading... ' + pct + '%';
}
function hideProgressBar(wrapId) {
  const wrap = document.getElementById(wrapId); if (wrap) wrap.classList.remove('show');
}

/* ===== TOAST ===== */
function showToast(msg, type = 'success') {
  const toast = document.getElementById('adminToast');
  toast.className = 'admin-toast ' + type + ' show';
  toast.querySelector('span').textContent = msg;
  toast.querySelector('i').className = type === 'success' ? 'fas fa-check-circle' : 'fas fa-exclamation-circle';
  setTimeout(() => toast.classList.remove('show'), 4000);
}

/* ===== DROP ZONE HELPER ===== */
function setupDropZoneHandler(zoneId, inputId, accept, onFile) {
  const zone  = document.getElementById(zoneId);
  const input = document.getElementById(inputId);
  if (!zone || !input) return;
  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('dragover'); if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]); });
  input.addEventListener('change', e => { if (e.target.files[0]) onFile(e.target.files[0]); });
}

/* ===== DEVOTIONALS ===== */
const todayLagos = () => CACCal.todayLagos();
let devCache = [];
const lines = t => (t || '').split('\n').map(x => x.trim()).filter(Boolean);
function resetDevForm() { document.getElementById('devForm').reset(); document.getElementById('devFormTitle').textContent = 'New Devotional'; }
async function loadDevotionals() {
  const tb = document.getElementById('devTableBody');
  tb.innerHTML = loadingRow(5, 'Loading…');
  try {
    // Idempotent promotion of scheduled → published for dates that have arrived (Lagos time).
    try { await window.promoteScheduledDevotionals(todayLagos()); } catch (e) { console.warn('promote:', e.message); }
    devCache = await window.getAllDevotionals();
    if (!devCache.length) { tb.innerHTML = emptyRow(5, 'No devotionals yet. Create the first one above.'); return; }
    const cls = { published: 'success', scheduled: 'info', draft: 'warning', archived: 'danger' };
    tb.innerHTML = devCache.map(d => `<tr>
      <td>${esc(d.date)}</td><td style="font-weight:500">${esc(d.title)}</td><td>${esc(d.scripture || '')}</td>
      <td><span class="badge ${cls[d.status] || 'info'}">${esc(d.status)}</span></td>
      <td style="white-space:nowrap">
        <button class="admin-btn secondary" style="padding:6px 12px" data-edit="${esc(d.id)}" title="Edit"><i class="fas fa-pen"></i></button>
        <a class="admin-btn secondary" style="padding:6px 12px" href="devotionals.html?d=${esc(d.date)}&preview=1" target="_blank" title="Preview"><i class="fas fa-eye"></i></a>
        <button class="admin-btn danger" style="padding:6px 12px" data-del="${esc(d.id)}" title="Delete"><i class="fas fa-trash"></i></button>
      </td></tr>`).join('');
  } catch (e) { tb.innerHTML = errorRow(5, 'Failed to load devotionals: ' + e.message); }
}
document.getElementById('devTableBody').addEventListener('click', async e => {
  const ed = e.target.closest('[data-edit]'), del = e.target.closest('[data-del]');
  if (ed) {
    const d = devCache.find(x => x.id === ed.dataset.edit); if (!d) return;
    const set = (id, v) => document.getElementById(id).value = v || '';
    set('devDate', d.date); set('devTitle', d.title); set('devTheme', d.theme); set('devScripture', d.scripture); set('devAuthor', d.author);
    set('devStatus', d.status); set('devScriptureText', d.scriptureText); set('devMessage', d.message); set('devSupporting', (d.supporting || []).join(', '));
    set('devApplication', d.application); set('devReflection', (d.reflection || []).join('\n')); set('devPoints', (d.prayerPoints || []).join('\n'));
    set('devPrayer', d.closingPrayer); set('devDeclaration', d.declaration); set('devMemory', d.memoryVerse); set('devImage', d.imageUrl); set('devPdf', d.pdfUrl);
    document.getElementById('devFormTitle').textContent = 'Editing ' + d.date;
    document.getElementById('devForm').scrollIntoView({ behavior: 'smooth' });
  }
  if (del && confirm('Delete this devotional permanently? Use "Archived" status instead to keep it in the system.')) {
    try { await window.deleteDevotional(del.dataset.del); showToast('Devotional deleted.'); loadDevotionals(); } catch (err) { showToast(err.message, 'error'); }
  }
});
document.getElementById('devForm').addEventListener('submit', async e => {
  e.preventDefault();
  const g = id => document.getElementById(id).value.trim();
  const d = { date: g('devDate'), title: g('devTitle'), theme: g('devTheme'), scripture: g('devScripture'), author: g('devAuthor'), status: g('devStatus'),
    scriptureText: g('devScriptureText'), message: g('devMessage'), supporting: g('devSupporting').split(',').map(x => x.trim()).filter(Boolean),
    application: g('devApplication'), reflection: lines(g('devReflection')), prayerPoints: lines(g('devPoints')), closingPrayer: g('devPrayer'),
    declaration: g('devDeclaration'), memoryVerse: g('devMemory'), imageUrl: g('devImage'), pdfUrl: g('devPdf') };
  if (!CACCal.parseYMD(d.date)) return showToast('Please choose a valid date.', 'error');
  for (const [k, label] of [['title','Title'],['scripture','Scripture reference'],['author','Author'],['message','Main message']]) if (!d[k]) return showToast(label + ' is required.', 'error');
  for (const k of ['imageUrl','pdfUrl']) if (d[k] && !/^https:\/\//i.test(d[k])) return showToast('Image/PDF links must start with https://', 'error');
  if (d.status === 'published' && d.date > todayLagos()) { d.status = 'scheduled'; showToast('Future date: saved as Scheduled; it will publish on that day.'); }
  const existing = devCache.find(x => x.id === d.date);
  if (existing && document.getElementById('devFormTitle').textContent !== 'Editing ' + d.date && !confirm('A devotional already exists for ' + d.date + '. Overwrite it?')) return;
  try { await window.saveDevotional(d); showToast('Devotional saved.'); resetDevForm(); loadDevotionals(); }
  catch (err) { showToast('Could not save: ' + err.message, 'error'); }
});

/* ===== TESTIMONIES ===== */
async function loadTestimonies() {
  const tb = document.getElementById('testimonyTableBody'); tb.innerHTML = loadingRow(4, 'Loading…');
  try {
    const list = await window.getAllTestimonies();
    if (!list.length) { tb.innerHTML = emptyRow(4, 'No testimonies yet.'); return; }
    tb.innerHTML = list.map(t => `<tr><td>${esc(t.name || 'Anonymous')}<br><small>${esc(t.country || '')}</small></td>
      <td style="max-width:420px">${esc(t.story)}</td>
      <td><span class="badge ${t.status === 'approved' ? 'success' : t.status === 'rejected' ? 'danger' : 'warning'}">${esc(t.status)}</span></td>
      <td style="white-space:nowrap">
        <button class="admin-btn primary" style="padding:6px 12px" data-ts="approved" data-id="${esc(t.id)}">Approve</button>
        <button class="admin-btn secondary" style="padding:6px 12px" data-ts="rejected" data-id="${esc(t.id)}">Reject</button>
        <button class="admin-btn danger" style="padding:6px 12px" data-tdel="${esc(t.id)}"><i class="fas fa-trash"></i></button></td></tr>`).join('');
  } catch (e) { tb.innerHTML = errorRow(4, 'Failed to load: ' + e.message); }
}
document.getElementById('testimonyTableBody').addEventListener('click', async e => {
  const b = e.target.closest('[data-ts]'), d = e.target.closest('[data-tdel]');
  try {
    if (b) { await window.setTestimonyStatus(b.dataset.id, b.dataset.ts); showToast('Testimony ' + b.dataset.ts + '.'); loadTestimonies(); }
    if (d && confirm('Delete this testimony?')) { await window.deleteTestimony(d.dataset.tdel); loadTestimonies(); }
  } catch (err) { showToast(err.message, 'error'); }
});

/* ===== VISITORS ===== */
async function loadVisitors() {
  const tb = document.getElementById('visitorTableBody'); tb.innerHTML = loadingRow(4, 'Loading…');
  try {
    const list = await window.getVisitorEnquiries();
    tb.innerHTML = list.length ? list.map(v => `<tr><td>${esc(v.name)}</td><td>${esc(v.email || '')}<br>${esc(v.phone || '')}</td><td>${esc(v.visitDate || '—')}</td><td style="max-width:380px">${esc(v.message || '')}</td></tr>`).join('') : emptyRow(4, 'No registrations yet.');
  } catch (e) { tb.innerHTML = errorRow(4, 'Failed to load: ' + e.message); }
}

/* ===== BELIEVERS BIBLE COLLEGE ===== */
const BBC_MAX_CHARS = 420000;           // stays well inside Firestore's 1 MB document limit and the security rule
let bbcImage = '';                        // '' = default picture; otherwise https link or compressed data URL
const bbcDef = () => (window.CAC_CONFIG && window.CAC_CONFIG.bbc) || {};
function bbcSetImage(v, msg) { bbcImage = v; document.getElementById('bbcPreview').src = v || bbcDef().image || 'bbc-crest.webp'; if (msg !== undefined) document.getElementById('bbcImgMsg').textContent = msg; }
async function loadBBC() {
  const d = bbcDef(), set = (id, v, ph) => { const e = document.getElementById(id); e.value = v || ''; if (ph !== undefined) e.placeholder = ph; };
  let s = null; try { s = await window.getSiteSetting('bbc'); } catch (e) { showToast('Could not load saved settings: ' + e.message, 'error'); }
  s = s || {};
  set('bbcHeadline', s.headline, d.headline); set('bbcText', s.text, d.text); set('bbcButton', s.buttonLabel, d.buttonLabel); set('bbcUrl', s.url, 'https://');
  bbcSetImage(s.image || '', ''); document.getElementById('bbcImgUrl').value = /^https:/.test(s.image || '') ? s.image : '';
  document.getElementById('bbcCount').textContent = '(' + (s.text || '').length + '/600)';
}
function bbcCompress(file) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) return reject(new Error('Please choose a JPG, PNG or WebP picture.'));
    if (file.size > 15 * 1024 * 1024) return reject(new Error('That picture is larger than 15 MB. Please choose a smaller one.'));
    const url = URL.createObjectURL(file), img = new Image();
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file could not be read as a picture.')); };
    img.onload = () => {
      URL.revokeObjectURL(url);
      const webp = document.createElement('canvas').toDataURL('image/webp').startsWith('data:image/webp'), type = webp ? 'image/webp' : 'image/jpeg';
      let w = Math.min(1200, img.naturalWidth), out = '';
      for (let shrink = 0; shrink < 5 && !out; shrink++, w = Math.round(w * 0.8)) {
        const h = Math.round(img.naturalHeight * (w / img.naturalWidth)), c = document.createElement('canvas'); c.width = w; c.height = h;
        const ctx = c.getContext('2d'); if (!webp) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); } ctx.drawImage(img, 0, 0, w, h);
        for (const q of [0.85, 0.75, 0.65, 0.55, 0.45]) { const d = c.toDataURL(type, q); if (d.length < BBC_MAX_CHARS) { out = d; break; } }
      }
      out ? resolve(out) : reject(new Error('Could not shrink that picture enough. Please choose a smaller one.'));
    };
    img.src = url;
  });
}
document.getElementById('bbcChoose').addEventListener('click', () => document.getElementById('bbcFile').click());
document.getElementById('bbcFile').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  try { document.getElementById('bbcImgMsg').textContent = 'Preparing picture…'; const d = await bbcCompress(f); document.getElementById('bbcImgUrl').value = ''; bbcSetImage(d, 'Picture ready (' + Math.round(d.length * 0.75 / 1024) + ' KB). Press Save to publish it.'); }
  catch (err) { document.getElementById('bbcImgMsg').textContent = err.message; showToast(err.message, 'error'); }
  e.target.value = '';
});
document.getElementById('bbcClearImg').addEventListener('click', () => { document.getElementById('bbcImgUrl').value = ''; bbcSetImage('', 'Default picture selected. Press Save to publish.'); });
document.getElementById('bbcImgUrl').addEventListener('change', e => {
  const v = e.target.value.trim(); if (!v) return;
  if (!/^https:\/\/\S+$/.test(v) || v.length > 500) { e.target.value = ''; return showToast('Picture links must start with https://', 'error'); }
  bbcSetImage(v, 'Link set. Press Save to publish.');
});
document.getElementById('bbcText').addEventListener('input', e => { document.getElementById('bbcCount').textContent = '(' + e.target.value.length + '/600)'; });
document.getElementById('bbcForm').addEventListener('submit', async e => {
  e.preventDefault();
  const g = id => document.getElementById(id).value.trim(), url = g('bbcUrl');
  if (url && (!/^https:\/\/\S+$/.test(url) || url.length > 500)) return showToast('The Bible College link must start with https://', 'error');
  try {
    await window.saveSiteSetting('bbc', { headline: g('bbcHeadline'), text: g('bbcText'), buttonLabel: g('bbcButton'), url, image: bbcImage });
    showToast('Believers Bible College promo saved.');
  } catch (err) { showToast('Could not save: ' + err.message, 'error'); }
});
document.getElementById('bbcReset').addEventListener('click', async () => {
  if (!confirm('Remove all customisations and go back to the defaults?')) return;
  try { await window.resetSiteSetting('bbc'); showToast('Defaults restored.'); loadBBC(); } catch (err) { showToast(err.message, 'error'); }
});

/* ===== ACTIVITY LOG ===== */
async function loadActivity() {
  const tb = document.getElementById('activityBody'); tb.innerHTML = loadingRow(4, 'Loading…');
  try {
    const list = await window.getAuditLogs();
    const fmt = iso => iso ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)) : '—';
    tb.innerHTML = list.length ? list.map(l => `<tr><td>${esc(fmt(l.at))}</td><td>${esc(l.by)}</td><td><code>${esc(l.action)}</code></td><td>${esc(l.target)}</td></tr>`).join('') : emptyRow(4, 'No activity recorded yet.');
  } catch (e) { tb.innerHTML = errorRow(4, 'Only Super Admins can view the activity log.'); }
}

/* ===== BACKUP / EXPORT ===== */
const BACKUP_SETS = [['devotionals','Devotionals'],['events','Events'],['sermons','Video sermons'],['audio_sermons','Audio sermons'],['gallery','Gallery'],['testimonies','Testimonies'],['visitor_enquiries','Visitors & messages'],['newsletters','Newsletter emails'],['prayer_requests','Prayer requests (private)']];
function initBackup() {
  const box = document.getElementById('backupList'); if (box.dataset.ready) return; box.dataset.ready = '1';
  box.innerHTML = BACKUP_SETS.map(([k, l]) => `<label style="display:flex;gap:8px;align-items:center;font-size:.9rem"><input type="checkbox" value="${k}" checked/> ${l}</label>`).join('');
}
function downloadText(name, text, type) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const csvCell = v => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; }; // neutralise spreadsheet formula injection
document.getElementById('backupBtn').addEventListener('click', async () => {
  const msg = document.getElementById('backupMsg'), picked = [...document.querySelectorAll('#backupList input:checked')].map(i => i.value);
  if (!picked.length) { msg.textContent = 'Choose at least one item.'; return; }
  msg.textContent = 'Preparing backup…'; const out = { exportedAt: new Date().toISOString(), collections: {} }, skipped = [];
  for (const name of picked) { try { out.collections[name] = await window.cacExport(name); } catch (e) { skipped.push(name); } }
  const n = Object.values(out.collections).reduce((a, r) => a + r.length, 0);
  downloadText('cac-backup-' + CACCal.todayLagos() + '.json', JSON.stringify(out, null, 2), 'application/json');
  msg.textContent = `Backup downloaded: ${n} records from ${Object.keys(out.collections).length} collection(s).` + (skipped.length ? ` Skipped (no permission for your role): ${skipped.join(', ')}.` : '');
});
document.getElementById('emailsBtn').addEventListener('click', async () => {
  const msg = document.getElementById('backupMsg');
  try {
    const rows = await window.cacExport('newsletters');
    downloadText('newsletter-emails-' + CACCal.todayLagos() + '.csv', 'email,subscribed\n' + rows.map(r => csvCell(r.email) + ',' + csvCell(r.timestamp)).join('\n') + '\n', 'text/csv');
    msg.textContent = `${rows.length} email(s) exported.`;
  } catch (e) { msg.textContent = 'Could not export: ' + e.message; }
});

/* ===== DEMO DATA ===== */
function getDemoSermons() {
  return [
    { id:'d1', title:"Walking In God's Presence", preacher:'Pastor Akin Akinbajo', category:'Faith', date:'2026-01-12', videoUrl:'#' },
    { id:'d2', title:"The Power of Prayer",       preacher:'Pastor Akin Akinbajo', category:'Prayer', date:'2026-01-05', videoUrl:'#' },
    { id:'d3', title:"Seeking His Face",           preacher:'Pastor Olusheye',      category:'Worship', date:'2025-12-29', videoUrl:'#' },
  ];
}
function getDemoPrayers() {
  return [
    { id:'p1', name:'John Adeyemi',  type:'prayer',     request:'Please pray for my healing and restoration.', phone:'+234 800 000 0001' },
    { id:'p2', name:'Grace Okafor', type:'testimony', request:'God answered my prayer for a job. Hallelujah!', phone:'+234 800 000 0002' },
    { id:'p3', name:'Chioma E.',     type:'counselling', request:'I need guidance on my marriage situation.', phone:'+234 800 000 0003' },
  ];
}
function getDemoEvents() {
  return [
    { id:'e1', title:'Sunday Service', type:'Sunday Service', date:'2026-05-10', time:'08:00', venue:'Church Auditorium', status:'upcoming', description:'' },
    { id:'e2', title:'Ruth & Boaz Couples Meeting', type:'Ruth & Boaz', date:'2026-05-15', time:'17:00', venue:'Fellowship Hall', status:'upcoming', description:'' },
    { id:'e3', title:'Corporate Fasting & Prayer', type:'Fasting & Prayer', date:'2026-05-28', time:'06:00', venue:'Church Auditorium', status:'upcoming', description:'' },
  ];
}

/* ===== INITIAL LOAD (after admin auth is confirmed) ===== */
window.cacReady.then(() => window.cacAuth.onChange((u, r) => { if (r && !window.__dashLoaded) { window.__dashLoaded = true; loadDashboard(); } }));


/* ===== PRAYER WALL: staff publish a prayer (edited, no phone number) to the public wall ===== */
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-wall]'); if (!b) return;
  const p = allPrayers.find(x => x.id === b.getAttribute('data-wall')); if (!p) return;
  const text = window.prompt('Text to show on the public prayer wall (remove names, phone numbers and private details):', String(p.request || '').slice(0, 400));
  if (text === null) return; const clean = text.trim();
  if (clean.length < 5 || clean.length > 400) return showToast('Please keep it between 5 and 400 characters.', 'error');
  try { await window.publishToPrayerWall({ text: clean, name: '' }); showToast('Published to the prayer wall.'); } catch (err) { showToast('Could not publish (permission or connection).', 'error'); }
});
