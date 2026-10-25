/* =============================================
   CAC GOOD WORKS: SCRIPTURE ENGINE
   - finds Bible references in text ("John 3:16", "1 Cor 13:4-7", "Psalm 23", "Rom 8:28-30, 35")
   - shows the verses in a popover (KJV or WEB, both public domain, loaded on demand from bible-kjv.json / bible-web.json)
   - makes shareable verse images (canvas), verse of the day, and reading plans
   Pure functions are exported for unit tests (test-scripture.mjs); the UI only runs in a browser.
   ============================================= */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api; else { root.cacScripture = api; }
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  var BOOKS = ['Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy', 'Joshua', 'Judges', 'Ruth', '1 Samuel', '2 Samuel', '1 Kings', '2 Kings', '1 Chronicles', '2 Chronicles', 'Ezra', 'Nehemiah', 'Esther', 'Job', 'Psalms', 'Proverbs', 'Ecclesiastes', 'Song of Solomon', 'Isaiah', 'Jeremiah', 'Lamentations', 'Ezekiel', 'Daniel', 'Hosea', 'Joel', 'Amos', 'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah', 'Malachi', 'Matthew', 'Mark', 'Luke', 'John', 'Acts', 'Romans', '1 Corinthians', '2 Corinthians', 'Galatians', 'Ephesians', 'Philippians', 'Colossians', '1 Thessalonians', '2 Thessalonians', '1 Timothy', '2 Timothy', 'Titus', 'Philemon', 'Hebrews', 'James', '1 Peter', '2 Peter', '1 John', '2 John', '3 John', 'Jude', 'Revelation'];
  var CH = [50, 40, 27, 36, 34, 24, 21, 4, 31, 24, 22, 25, 29, 36, 10, 13, 10, 42, 150, 31, 12, 8, 66, 52, 5, 48, 12, 14, 3, 9, 1, 4, 7, 3, 3, 3, 2, 14, 4, 28, 16, 24, 21, 28, 16, 16, 13, 6, 6, 4, 4, 5, 3, 6, 4, 3, 1, 13, 5, 5, 3, 5, 1, 1, 1, 22];

  /* ---------- aliases ---------- */
  var BASE = { 'Genesis': ['Gen', 'Ge', 'Gn'], 'Exodus': ['Exod', 'Exo', 'Ex'], 'Leviticus': ['Lev', 'Le', 'Lv'], 'Numbers': ['Num', 'Nu', 'Nm', 'Nb'], 'Deuteronomy': ['Deut', 'Deu', 'Dt'], 'Joshua': ['Josh', 'Jos'], 'Judges': ['Judg', 'Jdg', 'Jg'], 'Ruth': ['Ru', 'Rth'],
    'Samuel': ['Sam', 'Sa', 'Sm'], 'Kings': ['Kgs', 'Ki', 'Kin'], 'Chronicles': ['Chron', 'Chr', 'Ch'], 'Ezra': ['Ezr'], 'Nehemiah': ['Neh', 'Ne'], 'Esther': ['Esth', 'Est'], 'Job': ['Jb'], 'Psalms': ['Psalm', 'Ps', 'Psa', 'Pss', 'Pslm'], 'Proverbs': ['Prov', 'Pro', 'Pr', 'Prv'],
    'Ecclesiastes': ['Eccles', 'Eccl', 'Ecc', 'Qoh'], 'Song of Solomon': ['Song of Songs', 'Song', 'SOS', 'Canticles'], 'Isaiah': ['Isa', 'Is'], 'Jeremiah': ['Jer', 'Je'], 'Lamentations': ['Lam', 'La'], 'Ezekiel': ['Ezek', 'Eze', 'Ezk'], 'Daniel': ['Dan', 'Da', 'Dn'], 'Hosea': ['Hos', 'Ho'], 'Joel': ['Jl'], 'Amos': ['Am'],
    'Obadiah': ['Obad', 'Ob'], 'Jonah': ['Jon', 'Jnh'], 'Micah': ['Mic', 'Mc'], 'Nahum': ['Nah', 'Na'], 'Habakkuk': ['Hab', 'Hb'], 'Zephaniah': ['Zeph', 'Zep', 'Zp'], 'Haggai': ['Hag', 'Hg'], 'Zechariah': ['Zech', 'Zec', 'Zc'], 'Malachi': ['Mal', 'Ml'], 'Matthew': ['Matt', 'Mat', 'Mt'], 'Mark': ['Mrk', 'Mar', 'Mk', 'Mr'],
    'Luke': ['Luk', 'Lk'], 'John': ['Joh', 'Jn', 'Jhn'], 'Acts': ['Act', 'Ac'], 'Romans': ['Rom', 'Ro', 'Rm'], 'Corinthians': ['Cor', 'Co'], 'Galatians': ['Gal', 'Ga'], 'Ephesians': ['Eph', 'Ephes'], 'Philippians': ['Phil', 'Php', 'Pp'], 'Colossians': ['Col'], 'Thessalonians': ['Thess', 'Thes', 'Th'],
    'Timothy': ['Tim', 'Ti', 'Tm'], 'Titus': ['Tit'], 'Philemon': ['Philem', 'Phlm', 'Phm'], 'Hebrews': ['Heb'], 'James': ['Jas', 'Jm'], 'Peter': ['Pet', 'Pe', 'Pt'], 'Jude': ['Jud'], 'Revelation': ['Revelations', 'Rev', 'Re', 'The Revelation'] };
  var NUMBERED = { Samuel: [1, 2], Kings: [1, 2], Chronicles: [1, 2], Corinthians: [1, 2], Thessalonians: [1, 2], Timothy: [1, 2], Peter: [1, 2] };
  var ROMAN = ['', 'I', 'II', 'III'], ALIAS = {}, FORMS = [];
  function key(s) { return String(s).toLowerCase().replace(/[.\s]/g, ''); }
  function add(canon, form) { var k = key(form); if (!ALIAS[k]) { ALIAS[k] = canon; FORMS.push(form); } }
  BOOKS.forEach(function (b) { add(b, b); });
  Object.keys(BASE).forEach(function (base) {
    var nums = NUMBERED[base];
    if (nums) nums.forEach(function (n) { var canon = n + ' ' + base; [base].concat(BASE[base]).forEach(function (f) { add(canon, n + ' ' + f); add(canon, ROMAN[n] + ' ' + f); }); });
    else if (base === 'John') { BASE.John.concat(['John']).forEach(function (f) { add('John', f); }); [1, 2, 3].forEach(function (n) { ['John', 'Jn', 'Jhn', 'Joh'].forEach(function (f) { add(n + ' John', n + ' ' + f); add(n + ' John', ROMAN[n] + ' ' + f); }); }); }
    else { var canon = BOOKS.filter(function (b) { return b === base || key(b) === key(base); })[0] || base; BASE[base].forEach(function (f) { add(canon, f); }); }
  });
  add('Psalms', 'Psalm'); add('Revelation', 'Revelation of John');
  FORMS.sort(function (a, b) { return b.length - a.length; });
  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  var BOOKRE = FORMS.map(function (f) { return esc(f).replace(/ /g, '\\s?'); }).join('|');
  var NUM = '(\\d{1,3})', DASH = '\\s*[-–—]\\s*';
  // 1 book  2 chapter  3 verse  4 end-chapter(chapter:verse form)  5 end-verse  6 chapter-only range end  7 extra ", 18, 20-22"
  var REF = '(' + BOOKRE + ')\\.?\\s*' + NUM + '(?:\\s*:\\s*' + NUM + '(?:' + DASH + '(?:' + NUM + '\\s*:\\s*)?' + NUM + ')?((?:\\s*,\\s*\\d{1,3}(?:' + DASH + '\\d{1,3})?(?!\\s*:))*)|' + DASH + NUM + '(?!\\s*:))?';
  function finder() { return new RegExp('(^|[^A-Za-z0-9])' + REF + '(?![A-Za-z0-9])', 'g'); }

  function bookIndex(name) { return BOOKS.indexOf(ALIAS[key(name)]); }

  /** Build a reference from regex groups, or null when it cannot exist (e.g. John 40, Jude 2:3). */
  function build(m) {
    var bi = bookIndex(m[1]); if (bi < 0) return null;
    var c1 = +m[2], r = { book: BOOKS[bi], c1: c1, v1: m[3] ? +m[3] : 0, c2: c1, v2: 0, extra: [] };
    if (CH[bi] === 1 && !m[3]) {            // one-chapter books: "Jude 3" / "3 John 4-6" mean VERSES of chapter 1
      var a = c1, b = m[7] ? +m[7] : a; if (b < a) return null; r.c1 = r.c2 = 1; r.v1 = a; r.v2 = b; return r;
    }
    if (c1 < 1 || c1 > CH[bi]) return null;
    if (m[3]) {
      if (r.v1 < 1) return null;
      if (m[5]) { r.c2 = m[4] ? +m[4] : c1; r.v2 = +m[5]; if (r.c2 < c1 || (r.c2 === c1 && r.v2 < r.v1) || r.c2 > CH[bi]) return null; } else r.v2 = r.v1;
      (m[6] || '').replace(/(\d{1,3})(?:\s*[-–—]\s*(\d{1,3}))?/g, function (_, a, b) { a = +a; b = b ? +b : a; if (b >= a && r.extra.length < 6) r.extra.push([a, b]); return ''; });
    } else if (m[7]) { r.c2 = +m[7]; if (r.c2 < c1 || r.c2 > CH[bi] || r.c2 - c1 > 9) return null; }
    return r;
  }
  function toString(r) {
    var s = r.book + ' ' + r.c1;
    if (r.v1) { s += ':' + r.v1; if (r.c2 !== r.c1) s += '–' + r.c2 + ':' + r.v2; else if (r.v2 !== r.v1) s += '–' + r.v2; r.extra.forEach(function (e) { s += ', ' + (e[0] === e[1] ? e[0] : e[0] + '–' + e[1]); }); }
    else if (r.c2 !== r.c1) s += '–' + r.c2;
    return s;
  }
  /** Parse one reference string. Returns a ref or null. */
  function parse(str) { var re = new RegExp('^\\s*' + REF + '\\s*$'), m = re.exec(String(str || '')); return m ? build(m) : null; }
  /** Find every reference in a block of text: [{start,end,text,ref}] */
  function find(text) {
    var re = finder(), out = [], m; text = String(text || '');
    while ((m = re.exec(text))) {
      var r = build(m.slice(1)); if (!r) { re.lastIndex = m.index + m[1].length + 1; continue; }
      var start = m.index + m[1].length; out.push({ start: start, end: m.index + m[0].length, text: text.slice(start, m.index + m[0].length), ref: r });
    }
    return out;
  }

  /** Verses for a ref from loaded data ({b:{Book:[[v..],..]}}): [{c,v,t}]. Capped at 200. */
  function verses(data, r) {
    var ch = data && data.b && data.b[r.book]; if (!ch) return [];
    var out = [];
    function chap(c, a, b) { var vs = ch[c - 1] || []; for (var v = a || 1; v <= (b || vs.length); v++) { if (out.length >= 200) return; out.push({ c: c, v: v, t: vs[v - 1] || '' }); } }
    if (!r.v1) { for (var c = r.c1; c <= r.c2; c++) chap(c); return out; }
    if (r.c2 === r.c1) chap(r.c1, r.v1, r.v2); else { chap(r.c1, r.v1); for (var k = r.c1 + 1; k < r.c2; k++) chap(k); chap(r.c2, 1, r.v2); }
    r.extra.forEach(function (e) { chap(r.c2, e[0], e[1]); });
    return out;
  }
  function plainText(vs) { return vs.filter(function (x) { return x.t; }).map(function (x) { return x.t; }).join(' '); }

  /* ---------- verse of the day ---------- */
  var VOTD = ['John 3:16', 'Psalm 23:1-3', 'Philippians 4:6-7', 'Romans 8:28', 'Proverbs 3:5-6', 'Isaiah 41:10', 'Jeremiah 29:11', 'Joshua 1:9', 'Matthew 6:33', 'Psalm 46:1', 'Romans 12:2', '2 Timothy 1:7', 'Psalm 121:1-2', 'Matthew 11:28', 'Hebrews 11:1', 'Galatians 5:22-23', 'Isaiah 40:31', 'Psalm 27:1', 'Ephesians 2:8-9', '1 Corinthians 13:4-7', 'Philippians 4:13', 'Psalm 91:1-2', 'Romans 5:8', '1 Peter 5:7', 'Lamentations 3:22-23', 'Colossians 3:23', 'Micah 6:8', 'Psalm 119:105', 'John 14:6', 'James 1:5', 'Isaiah 26:3', 'Psalm 37:4-5', '2 Corinthians 5:17', 'Deuteronomy 31:6', 'Hebrews 13:8', 'Matthew 5:16', 'John 15:5', 'Psalm 34:8', 'Romans 15:13', 'Zephaniah 3:17', 'Psalm 139:14', 'Proverbs 16:3', 'Isaiah 43:2', '1 John 4:19', 'Psalm 103:1-2', 'Joshua 24:15', 'Nahum 1:7', 'Habakkuk 3:17-18', 'Matthew 28:19-20', 'Acts 1:8', 'Psalm 62:1-2', 'John 10:10', 'Revelation 21:4', 'Exodus 14:14', 'Numbers 6:24-26', 'Psalm 150:6', 'Luke 1:37', '1 Thessalonians 5:16-18', 'Romans 10:9', 'Isaiah 55:8-9'];
  function dayNumber(ds) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ds || ''); return m ? Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5) : 0; }
  function votd(ds) { return parse(VOTD[dayNumber(ds) % VOTD.length]); }

  /* ---------- reading plans (chapter-based, derived from chapter counts: nothing to maintain) ---------- */
  var PLAN_DEFS = [
    { id: 'john-21', title: 'The Gospel of John', blurb: '21 days · 1 chapter a day', from: 'John', to: 'John', days: 21 },
    { id: 'proverbs-31', title: 'Proverbs in a month', blurb: '31 days · wisdom for daily living', from: 'Proverbs', to: 'Proverbs', days: 31 },
    { id: 'psalms-30', title: 'Psalms in 30 days', blurb: '30 days · about 5 psalms a day', from: 'Psalms', to: 'Psalms', days: 30 },
    { id: 'gospels-30', title: 'The four Gospels', blurb: '30 days · Matthew to John', from: 'Matthew', to: 'John', days: 30 },
    { id: 'nt-90', title: 'New Testament in 90 days', blurb: '90 days · about 3 chapters a day', from: 'Matthew', to: 'Revelation', days: 90 },
    { id: 'bible-365', title: 'The whole Bible in a year', blurb: '365 days · about 3 chapters a day', from: 'Genesis', to: 'Revelation', days: 365 }
  ];
  function planDays(id) {
    var d = PLAN_DEFS.filter(function (p) { return p.id === id; })[0]; if (!d) return [];
    var seq = []; for (var b = BOOKS.indexOf(d.from); b <= BOOKS.indexOf(d.to); b++) for (var c = 1; c <= CH[b]; c++) seq.push([b, c]);
    var per = Math.floor(seq.length / d.days), extra = seq.length % d.days, out = [], i = 0;
    for (var n = 1; n <= d.days; n++) {
      var take = per + (n <= extra ? 1 : 0), chunk = seq.slice(i, i + take); i += take; if (!chunk.length) break;
      var refs = [], label = [];
      chunk.forEach(function (x) { var last = refs[refs.length - 1]; if (last && last.b === x[0] && last.c2 === x[1] - 1) last.c2 = x[1]; else refs.push({ b: x[0], c1: x[1], c2: x[1] }); });
      refs.forEach(function (r) { label.push(BOOKS[r.b] + ' ' + (r.c1 === r.c2 ? r.c1 : r.c1 + '–' + r.c2)); });
      out.push({ id: String(n), label: label.join(' · '), refs: refs.map(function (r) { return { book: BOOKS[r.b], c1: r.c1, v1: 0, c2: r.c2, v2: 0, extra: [] }; }) });
    }
    return out;
  }

  /* ---------- share image ---------- */
  function wrap(measure, text, maxW) {
    var words = String(text).split(/\s+/).filter(Boolean), lines = [], cur = '';
    words.forEach(function (w) { var t = cur ? cur + ' ' + w : w; if (measure(t) <= maxW || !cur) cur = t; else { lines.push(cur); cur = w; } });
    if (cur) lines.push(cur); return lines;
  }
  function drawCard(canvas, o) {
    var W = 1080, H = 1350, x = canvas.getContext('2d'); canvas.width = W; canvas.height = H;
    var g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#12121c'); g.addColorStop(1, '#0a0a0f'); x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.strokeStyle = 'rgba(201,169,110,.55)'; x.lineWidth = 3; x.strokeRect(48, 48, W - 96, H - 96); x.strokeStyle = 'rgba(201,169,110,.2)'; x.lineWidth = 1; x.strokeRect(64, 64, W - 128, H - 128);
    if (o.logo) { try { x.drawImage(o.logo, W / 2 - 48, 120, 96, 96); } catch (e) {} }
    var serif = '"Cormorant Garamond", Georgia, serif', maxW = W - 280, top = 300, bottom = H - 330, size = 76, lines;
    for (; size >= 30; size -= 2) { x.font = '500 ' + size + 'px ' + serif; lines = wrap(function (s) { return x.measureText(s).width; }, '“' + o.text + '”', maxW); if (lines.length * size * 1.35 <= bottom - top) break; }
    x.fillStyle = '#f5f1e8'; x.textAlign = 'center'; x.textBaseline = 'top';
    var y = top + Math.max(0, (bottom - top - lines.length * size * 1.35) / 2); lines.forEach(function (l) { x.fillText(l, W / 2, y); y += size * 1.35; });
    x.fillStyle = '#c9a96e'; x.font = '600 46px ' + serif; x.fillText(o.ref + (o.version ? ' (' + o.version + ')' : ''), W / 2, H - 290);
    x.fillStyle = 'rgba(245,241,232,.6)'; x.font = '400 30px Jost, Arial, sans-serif'; x.fillText(o.site || 'CAC Good Works Assembly', W / 2, H - 200);
    return canvas;
  }

  var api = { BOOKS: BOOKS, CH: CH, parse: parse, find: find, toString: toString, verses: verses, plainText: plainText, votd: votd, VOTD: VOTD, PLAN_DEFS: PLAN_DEFS, planDays: planDays, wrap: wrap, drawCard: drawCard, dayNumber: dayNumber };
  if (typeof document === 'undefined') return api;

  /* ================= browser UI ================= */
  var cache = {}, ver = (function () { try { return root.localStorage.getItem('cacBibleVersion') === 'WEB' ? 'WEB' : 'KJV'; } catch (e) { return 'KJV'; } })();
  api.version = function (v) { if (v) { ver = v === 'WEB' ? 'WEB' : 'KJV'; try { root.localStorage.setItem('cacBibleVersion', ver); } catch (e) {} } return ver; };
  api.load = function (v) {
    v = v === 'WEB' ? 'WEB' : 'KJV';
    return cache[v] || (cache[v] = root.fetch('bible-' + v.toLowerCase() + '.json').then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).catch(function (e) { delete cache[v]; throw e; }));
  };
  function h(tag, a) { var e = document.createElement(tag); if (a) Object.keys(a).forEach(function (k) { if (k === 'text') e.textContent = a[k]; else if (k === 'class') e.className = a[k]; else if (a[k] !== false && a[k] != null) e.setAttribute(k, a[k] === true ? '' : a[k]); }); for (var i = 2; i < arguments.length; i++) if (arguments[i]) e.appendChild(typeof arguments[i] === 'string' ? document.createTextNode(arguments[i]) : arguments[i]); return e; }
  api.h = h;

  /** Render verses (with small verse numbers) into el. */
  api.renderVerses = function (el, vs) {
    el.textContent = '';
    var lastC = 0;
    vs.forEach(function (x) { if (x.c !== lastC && vs[0].c !== x.c) el.appendChild(h('div', { class: 'sc-ch', text: 'Chapter ' + x.c })); lastC = x.c; el.appendChild(h('span', { class: 'sc-v' }, h('sup', { text: String(x.v) }), (x.t || '(this verse is not in this translation)') + ' ')); });
  };

  /** Turn references inside root into buttons that open the popover. */
  api.linkify = function (rootEl) {
    if (!rootEl) return;
    var walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, { acceptNode: function (n) { var p = n.parentNode; if (!p || /^(A|BUTTON|SCRIPT|STYLE|TEXTAREA|INPUT|SELECT)$/.test(p.nodeName) || (p.closest && p.closest('.scripture-ref,[data-no-scripture]'))) return NodeFilter.FILTER_REJECT; return /\d/.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT; } }), nodes = [], n;
    while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(function (node) {
      var found = find(node.nodeValue); if (!found.length) return;
      var frag = document.createDocumentFragment(), i = 0;
      found.forEach(function (f) { if (f.start > i) frag.appendChild(document.createTextNode(node.nodeValue.slice(i, f.start))); frag.appendChild(h('button', { type: 'button', class: 'scripture-ref', 'data-ref': toString(f.ref), 'aria-haspopup': 'dialog', title: 'Read ' + toString(f.ref), text: f.text })); i = f.end; });
      if (i < node.nodeValue.length) frag.appendChild(document.createTextNode(node.nodeValue.slice(i)));
      node.parentNode.replaceChild(frag, node);
    });
  };

  var pop, popFocus;
  function closePop() { if (!pop) return; pop.remove(); pop = null; document.removeEventListener('keydown', onKey, true); if (popFocus && popFocus.focus) popFocus.focus(); popFocus = null; }
  function onKey(e) {
    if (e.key === 'Escape') { e.stopPropagation(); closePop(); }
    if (e.key === 'Tab' && pop) { var f = pop.querySelectorAll('button,a[href],select'); if (!f.length) return; var a = f[0], z = f[f.length - 1]; if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); } }
  }
  function download(blob, name) { var u = URL.createObjectURL(blob), a = h('a', { href: u, download: name }); document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 4000); }
  /** Make and share (or download) a verse image. */
  api.shareImage = function (text, refStr, version) {
    var fontsReady = document.fonts && document.fonts.load ? document.fonts.load('500 60px "Cormorant Garamond"').catch(function () {}) : Promise.resolve();
    var logo = new Image(); var logoReady = new Promise(function (res) { logo.onload = res; logo.onerror = res; logo.src = 'logo-mark.webp'; });
    return Promise.all([fontsReady, logoReady]).then(function () {
      var c = document.createElement('canvas'); drawCard(c, { text: text, ref: refStr, version: version, logo: logo.complete && logo.naturalWidth ? logo : null, site: (root.CAC_CONFIG && root.CAC_CONFIG.name) || 'CAC Good Works Assembly' });
      return new Promise(function (res) { c.toBlob(res, 'image/png'); });
    }).then(function (blob) {
      var file = new File([blob], 'verse.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) return navigator.share({ files: [file], title: refStr, text: refStr + ' ' + location.origin }).catch(function (e) { if (e && e.name !== 'AbortError') download(blob, 'verse.png'); });
      download(blob, 'verse.png');
    });
  };

  /** Open the verse popover for a reference string. */
  api.open = function (refStr, anchor) {
    var r = parse(refStr); if (!r) return; closePop(); popFocus = anchor || document.activeElement;
    var body = h('div', { class: 'sc-body', 'aria-live': 'polite' }, h('p', { text: 'Loading…' })), sel = h('select', { class: 'sc-ver', 'aria-label': 'Bible translation' }, h('option', { value: 'KJV', text: 'KJV' }), h('option', { value: 'WEB', text: 'WEB' }));
    sel.value = ver;
    var status = h('span', { class: 'sc-status', role: 'status' }), close = h('button', { type: 'button', class: 'sc-x', 'aria-label': 'Close' }, h('i', { class: 'fas fa-times', 'aria-hidden': 'true' }));
    var copy = h('button', { type: 'button', class: 'btn-sm', text: 'Copy' }), share = h('button', { type: 'button', class: 'btn-sm', text: 'Share as image' });
    var read = h('a', { class: 'btn-sm', href: 'bible.html?ref=' + encodeURIComponent(toString(r)) + '&v=' + ver, text: 'Open in reader' });
    pop = h('div', { id: 'scripPop', class: 'sc-pop', role: 'dialog', 'aria-modal': 'true', 'aria-label': toString(r) },
      h('div', { class: 'sc-head' }, h('strong', { text: toString(r) }), sel, close), body, h('div', { class: 'sc-actions' }, copy, share, read, status));
    document.body.appendChild(pop); document.addEventListener('keydown', onKey, true); close.focus();
    var cur = [];
    function paint() {
      var v = sel.value; api.version(v); read.href = 'bible.html?ref=' + encodeURIComponent(toString(r)) + '&v=' + v;
      api.load(v).then(function (d) { cur = verses(d, r); if (!cur.length) body.textContent = 'Reference not found.'; else api.renderVerses(body, cur); }, function () { body.textContent = 'Could not load the Bible text. Please check your connection and try again.'; });
    }
    sel.addEventListener('change', paint); close.addEventListener('click', closePop); paint();
    copy.addEventListener('click', function () { var t = plainText(cur) + ' — ' + toString(r) + ' (' + sel.value + ')'; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { status.textContent = 'Copied'; }, function () { status.textContent = 'Could not copy'; }); });
    share.addEventListener('click', function () { if (!cur.length) return; share.disabled = true; api.shareImage(plainText(cur), toString(r), sel.value).then(function () { share.disabled = false; }, function () { share.disabled = false; status.textContent = 'Could not make the image'; }); });
  };
  document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('.scripture-ref'); if (b) { e.preventDefault(); api.open(b.getAttribute('data-ref'), b); } else if (pop && !e.target.closest('#scripPop')) closePop(); });
  return api;
});
