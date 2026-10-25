/* =============================================
   CAC GOOD WORKS: CSP-SAFE EVENT BINDINGS
   A strict Content-Security-Policy forbids inline event handlers (onclick="…"). Our markup uses data-on-click="showPanel('x')" instead,
   and this tiny delegated runner executes ONLY plain function calls with simple literal arguments. It never uses eval().
   Supported:  name(args);  event.preventDefault();  args = 'text' | "text" | 123 | true | false | null | this | this.value | this.checked
   ============================================= */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api; else if (typeof document !== 'undefined') api.install(document);
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  var IDENT = /^[A-Za-z_$][\w$]*$/;

  function splitTop(s, sep) {                     // split on sep outside quotes
    var out = [], cur = '', q = '', i, c;
    for (i = 0; i < s.length; i++) {
      c = s[i];
      if (q) { cur += c; if (c === '\\') { cur += s[++i] || ''; } else if (c === q) q = ''; }
      else if (c === '"' || c === "'") { q = c; cur += c; }
      else if (c === sep) { out.push(cur); cur = ''; }
      else cur += c;
    }
    if (q) throw new Error('unterminated string');
    out.push(cur); return out;
  }
  function arg(tok) {
    tok = tok.trim();
    var m;
    if ((m = /^'((?:[^'\\]|\\.)*)'$/.exec(tok)) || (m = /^"((?:[^"\\]|\\.)*)"$/.exec(tok))) return { k: 'lit', v: m[1].replace(/\\(.)/g, '$1') };
    if (/^-?\d+(\.\d+)?$/.test(tok)) return { k: 'lit', v: Number(tok) };
    if (tok === 'true') return { k: 'lit', v: true }; if (tok === 'false') return { k: 'lit', v: false }; if (tok === 'null') return { k: 'lit', v: null };
    if (tok === 'this') return { k: 'this' };
    if (tok === 'this.value' || tok === 'this.checked') return { k: 'prop', v: tok.slice(5) };
    throw new Error('unsupported argument: ' + tok);
  }
  /** "a('x', 1); event.preventDefault()" -> [{fn:'a', args:[...]}, {ev:'preventDefault'}] ; throws on anything else */
  function parse(expr) {
    return splitTop(String(expr), ';').map(function (s) { return s.trim(); }).filter(Boolean).map(function (stmt) {
      var m = /^([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?)\s*\(([\s\S]*)\)$/.exec(stmt);
      if (!m) throw new Error('unsupported statement: ' + stmt);
      if (m[1] === 'event.preventDefault' || m[1] === 'event.stopPropagation') { if (m[2].trim()) throw new Error('no arguments allowed'); return { ev: m[1].slice(6) }; }
      if (!IDENT.test(m[1])) throw new Error('unsupported call: ' + m[1]);
      var raw = m[2].trim() === '' ? [] : splitTop(m[2], ',');
      return { fn: m[1], args: raw.map(arg) };
    });
  }
  function run(expr, el, ev) {
    parse(expr).forEach(function (st) {
      if (st.ev) return ev && ev[st.ev]();
      var f = (typeof globalThis !== 'undefined' ? globalThis : root)[st.fn]; if (typeof f !== 'function') throw new Error(st.fn + ' is not defined');
      f.apply(el, st.args.map(function (a) { return a.k === 'lit' ? a.v : a.k === 'this' ? el : el[a.v]; }));
    });
  }
  var TYPES = ['click', 'change', 'input', 'submit', 'keydown', 'keyup'];
  function install(doc) {
    TYPES.forEach(function (t) {
      var attr = 'data-on-' + t;
      doc.addEventListener(t, function (ev) {
        var el = ev.target && ev.target.closest ? ev.target.closest('[' + attr + ']') : null; if (!el) return;
        try { run(el.getAttribute(attr), el, ev); } catch (e) { if (root.console) console.error('[csp-events] ' + attr + ': ' + e.message); }
      });
    });
  }
  return { parse: parse, run: run, install: install };
});
