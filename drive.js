/* =============================================
   CAC GOOD WORKS: GOOGLE DRIVE UPLOADS (admin only)
   Replaces Firebase Storage (which needs a paid plan) with your own free Google Drive folder.
   The admin signs in to Google once in a popup (Google Identity Services, scope drive.file = only files this site creates),
   the file is uploaded with Drive's resumable upload, then shared as "Anyone with the link can view".
   The saved link is a normal Drive link; media.js turns it into an image / audio / video the public pages can play.
   Setup (free, no card): README > "Google Drive media library". Configure in config.js > drive { clientId, folderId }.
   ============================================= */
(function () {
  'use strict';
  var cfg = (window.CAC_CONFIG && window.CAC_CONFIG.drive) || {};
  var CLIENT = String(cfg.clientId || ''), FOLDER = String(cfg.folderId || '');
  var SCOPE = 'https://www.googleapis.com/auth/drive.file';
  var MAX = 200 * 1024 * 1024;
  var token = '', tokenExp = 0, tokenClient, gisLoad;

  function enabled() { return /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(CLIENT); }
  function safeName(n) { return String(n || 'file').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '').slice(-80) || 'file'; }

  function loadGis() {
    if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
    if (!gisLoad) gisLoad = new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
      s.onload = function () { res(); }; s.onerror = function () { gisLoad = null; rej(new Error('Could not load Google sign-in. Check your connection or ad-blocker.')); };
      document.head.appendChild(s);
    });
    return gisLoad;
  }
  /** Must be called from a click/submit handler (browsers block the sign-in popup otherwise). */
  function getToken() {
    if (token && Date.now() < tokenExp - 60000) return Promise.resolve(token);
    return loadGis().then(function () {
      return new Promise(function (res, rej) {
        tokenClient = google.accounts.oauth2.initTokenClient({ client_id: CLIENT, scope: SCOPE, callback: function (r) {
          if (r && r.access_token) { token = r.access_token; tokenExp = Date.now() + (Number(r.expires_in) || 3600) * 1000; res(token); }
          else rej(new Error((r && r.error === 'access_denied') ? 'Google access was not granted.' : 'Google sign-in failed. Please try again.'));
        }, error_callback: function () { rej(new Error('Google sign-in was closed or blocked (allow pop-ups for this site).')); } });
        tokenClient.requestAccessToken({ prompt: token ? '' : 'consent' });
      });
    });
  }
  function api(url, init) {
    return fetch(url, init).then(function (r) {
      if (r.status === 401) { token = ''; throw new Error('Google session expired. Please try the upload again.'); }
      if (r.status === 403) throw new Error('Google Drive refused the request (permission or quota). Check the folder is yours and the Drive API is enabled.');
      if (!r.ok) throw new Error('Google Drive error ' + r.status + '.');
      return r;
    });
  }
  function put(url, file, type, onProgress) {
    return new Promise(function (res, rej) {
      var x = new XMLHttpRequest(); x.open('PUT', url); x.setRequestHeader('Content-Type', type);
      x.upload.onprogress = function (e) { if (e.lengthComputable && onProgress) onProgress(Math.round(e.loaded / e.total * 100)); };
      x.onload = function () { x.status >= 200 && x.status < 300 ? res(JSON.parse(x.responseText)) : rej(new Error('Upload failed (' + x.status + ').')); };
      x.onerror = function () { rej(new Error('Upload failed. Check your connection.')); };
      x.send(file);
    });
  }

  /** Drop-in replacement for firebase.js uploadFile: returns a Drive "view" link. */
  function uploadFile(file, folder, onProgress) {
    if (!file) return Promise.reject(new Error('No file chosen.'));
    if (file.size > MAX) return Promise.reject(new Error('That file is over 200 MB. Upload it to Drive yourself and paste its link instead.'));
    var type = file.type || 'application/octet-stream', name = safeName((folder || 'upload') + '-' + file.name);
    return getToken().then(function (t) {
      var auth = { Authorization: 'Bearer ' + t };
      var meta = { name: name, mimeType: type }; if (FOLDER) meta.parents = [FOLDER];
      return api('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': type }, auth), body: JSON.stringify(meta) })
        .then(function (r) { var loc = r.headers.get('Location'); if (!loc || loc.indexOf('https://www.googleapis.com/') !== 0) throw new Error('Google Drive did not return an upload address.'); return put(loc, file, type, onProgress); })
        .then(function (f) {
          if (!f || !f.id) throw new Error('Upload finished but Drive returned no file id.');
          return api('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(f.id) + '/permissions', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, auth), body: JSON.stringify({ role: 'reader', type: 'anyone' }) })
            .then(function () { return 'https://drive.google.com/file/d/' + f.id + '/view'; });
        });
    });
  }

  window.cacDrive = { enabled: enabled, uploadFile: uploadFile, safeName: safeName };
  if (enabled()) window.uploadFile = uploadFile;
})();
