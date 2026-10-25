/* =============================================
   CAC GOOD WORKS: MEDIA LINK HELPERS (YouTube + Google Drive + any https link)
   Pure functions: no network. Works in the browser (window.cacMedia) and in Node (import via createRequire).
   Google Drive is the media library: share a file as "Anyone with the link", paste its link (or ID) anywhere an
   audio / picture / video link is asked for. Rendering rules:
     - pictures : https://lh3.googleusercontent.com/d/{id}=w{width}     (public Drive images, no key, cached by Google)
     - audio    : {edge}/v1/media/{id}  (Cloudflare Worker streams it with Range support, cached at the edge)
                  fallback without a Worker: Drive download link (small files only; Google may show a scan page for big ones)
     - video    : https://drive.google.com/file/d/{id}/preview (Drive's own player, embedded)
   ============================================= */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.cacMedia = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var ID = /^[A-Za-z0-9_-]{20,80}$/;
  var YT = /^[A-Za-z0-9_-]{11}$/;

  function clean(u) { return String(u == null ? '' : u).trim(); }

  /** Accepts a Drive share link, open?id= link, uc?id= link, or a bare file ID. Returns the file ID or ''. */
  function driveId(u) {
    u = clean(u); if (!u) return '';
    if (ID.test(u)) return u;
    var m = u.match(/^https:\/\/(?:drive|docs)\.google\.com\/(?:file\/d\/|file\/u\/\d+\/d\/|uc\?(?:[^#]*&)?id=|open\?(?:[^#]*&)?id=)([A-Za-z0-9_-]{20,80})/);
    if (m) return m[1];
    m = u.match(/^https:\/\/lh3\.googleusercontent\.com\/d\/([A-Za-z0-9_-]{20,80})/);
    return m ? m[1] : '';
  }

  /** YouTube watch / share / embed / shorts / live links or a bare 11-char id -> id or ''. */
  function youtubeId(u) {
    u = clean(u); if (!u) return '';
    if (YT.test(u)) return u;
    var m = u.match(/^https:\/\/(?:www\.|m\.)?(?:youtube\.com|youtube-nocookie\.com)\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/|v\/)([A-Za-z0-9_-]{11})/)
         || u.match(/^https:\/\/youtu\.be\/([A-Za-z0-9_-]{11})/);
    return m ? m[1] : '';
  }

  function isHttps(u) { return /^https:\/\/[^\s"'<>]+$/.test(clean(u)); }
  function safeUrl(u) { u = clean(u); return isHttps(u) ? u : ''; }
  function edgeBase() { var c = typeof window !== 'undefined' && window.CAC_CONFIG && window.CAC_CONFIG.edge; return c && c.url ? String(c.url).replace(/\/+$/, '') : ''; }

  /** Playable audio URL, or '' when the link is not a safe https URL. */
  function audioSrc(u, edge) {
    var id = driveId(u); edge = String(edge === undefined ? edgeBase() : edge || '').replace(/\/+$/, '');
    if (id) return edge ? edge + '/v1/media/' + id : 'https://drive.google.com/uc?export=download&id=' + id;
    return safeUrl(u);
  }
  /** Picture URL (resized when it is a Drive picture). */
  function imageSrc(u, width) {
    var id = driveId(u); width = Math.max(64, Math.min(2400, width | 0 || 800));
    if (id) return 'https://lh3.googleusercontent.com/d/' + id + '=w' + width;
    return safeUrl(u);
  }
  /** { kind:'youtube'|'drive', id, embed, watch, thumb } for a video link, or null if unsupported. */
  function video(u) {
    var y = youtubeId(u);
    if (y) return { kind: 'youtube', id: y, embed: 'https://www.youtube-nocookie.com/embed/' + y, watch: 'https://www.youtube.com/watch?v=' + y, thumb: 'https://i.ytimg.com/vi/' + y + '/mqdefault.jpg' };
    var d = driveId(u);
    if (d && !/googleusercontent/.test(clean(u))) return { kind: 'drive', id: d, embed: 'https://drive.google.com/file/d/' + d + '/preview', watch: 'https://drive.google.com/file/d/' + d + '/view', thumb: 'https://drive.google.com/thumbnail?id=' + d + '&sz=w640' };
    return null;
  }
  /** Absolute audio URL for podcast enclosures (needs a Worker for Drive files). '' = cannot be published. */
  function podcastUrl(u, edge) {
    var id = driveId(u);
    if (id) return edge ? String(edge).replace(/\/+$/, '') + '/v1/media/' + id : '';
    return safeUrl(u);
  }

  /** "01:02:03" | "12:30" | "90" -> seconds, or -1 */
  function parseTime(s) {
    var m = String(s).trim().match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})$|^(\d{1,2}):(\d{2})$/);
    if (!m) return /^\d+$/.test(String(s).trim()) ? +s : -1;
    if (m[2] !== undefined) return (+m[1] || 0) * 3600 + (+m[2]) * 60 + (+m[3]);
    return (+m[4]) * 60 + (+m[5]);
  }
  function fmtTime(sec) { sec = Math.max(0, sec | 0); var h = (sec / 3600) | 0, m = ((sec % 3600) / 60) | 0, s = sec % 60, p = function (n) { return n < 10 ? '0' + n : '' + n; }; return (h ? h + ':' + p(m) : m) + ':' + p(s); }
  /** Chapters from admin text, one per line: "00:00 Welcome". Sorted, de-duplicated. */
  function parseChapters(text) {
    var out = [];
    String(text || '').split(/\r?\n/).forEach(function (line) {
      var m = line.trim().match(/^\[?((?:\d{1,2}:)?\d{1,2}:\d{2})\]?\s*[-–—:]?\s*(.{1,120})$/); if (!m) return;
      var t = parseTime(m[1]); if (t >= 0) out.push({ t: t, title: m[2].trim() });
    });
    out.sort(function (a, b) { return a.t - b.t; });
    return out.filter(function (c, i) { return !i || c.t !== out[i - 1].t; }).slice(0, 60);
  }
  /** Transcript: lines "[mm:ss] text" (timed) or plain text paragraphs. -> [{t:-1|seconds, text}] */
  function parseTranscript(text) {
    var out = [];
    String(text || '').split(/\r?\n/).forEach(function (line) {
      line = line.trim(); if (!line) return;
      var m = line.match(/^\[((?:\d{1,2}:)?\d{1,2}:\d{2})\]\s*(.*)$/);
      if (m && parseTime(m[1]) >= 0) out.push({ t: parseTime(m[1]), text: m[2] }); else out.push({ t: -1, text: line });
    });
    return out.slice(0, 5000);
  }

  return { driveId: driveId, youtubeId: youtubeId, isHttps: isHttps, safeUrl: safeUrl, audioSrc: audioSrc, imageSrc: imageSrc, video: video, podcastUrl: podcastUrl, parseTime: parseTime, fmtTime: fmtTime, parseChapters: parseChapters, parseTranscript: parseTranscript };
});
