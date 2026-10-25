#!/usr/bin/env python3
"""Smoke test of the PRODUCTION build (dist/): every page loads under the meta-tag CSP (no header), hashed files all exist, no CSP violations,
admin handlers (data-on-*) survive minification, service worker is stamped. Run after:  node build-dist.mjs   ->   python3 test-dist.py"""
import functools, http.server, json, os, re, socketserver, sys, threading
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)); D = os.path.join(ROOT, 'dist')
if not os.path.isdir(D): sys.exit('dist/ missing: run node build-dist.mjs first')
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(Q, directory=D)); PORT = srv.server_address[1]; threading.Thread(target=srv.serve_forever, daemon=True).start()
B = f'http://127.0.0.1:{PORT}/'; fails = 0
def check(name, ok, info=''):
    global fails; print(('  ok  ' if ok else 'FAIL  ') + name, '' if ok else info); fails += 0 if ok else 1
htmls = sorted(f for f in os.listdir(D) if f.endswith('.html'))
missing = []
for f in htmls:
    h = open(os.path.join(D, f), encoding='utf-8').read()
    for m in re.finditer(r'(?:src|href)="([^"#?:]+\.(?:js|css|webp|png|woff2|json|xml|ics))"', h):
        if not os.path.exists(os.path.join(D, m.group(1))): missing.append((f, m.group(1)))
    if 'http-equiv="Content-Security-Policy"' not in h: missing.append((f, 'no meta CSP'))
    if re.search(r'src="(?!https?:)[^"]*[^.\w][a-z-]+\.js"', h) and not re.search(r'\.[0-9a-f]{10}\.js', h): missing.append((f, 'unhashed js'))
check('every referenced file exists in dist/, every page carries the meta CSP', not missing, missing[:3])
sw = open(os.path.join(D, 'sw.js')).read(); check('service worker cache version is stamped and precache names are hashed', re.search(r'cac-[0-9a-f]{10}', sw) and re.search(r'app\.[0-9a-f]{10}\.js', sw))
check('no tooling or secrets shipped (tests, builders, worker, rules, package files)', not [f for f in os.listdir(D) if re.match(r'(test-|build-|job-|backup-|worker|wrangler|package|firebase\.json|firestore|csp\.json)', f)], os.listdir(D))
ADMIN = "window.cacAuth={available:()=>true,onChange:cb=>{cb({email:'admin@church.org'},'super');return()=>{}},signOut:async()=>{}};"
MOCK = "window.CAC_BACKEND={configured:true};window.getSermons=async()=>[{id:'s1',title:'T',preacher:'P',category:'C',date:'2026-01-01',videoUrl:'https://youtu.be/dQw4w9WgXcQ'}];window.getAudioSermons=async()=>[];window.getGalleryItems=async()=>[];window.getEvents=async()=>[];window.getLive=async()=>null;"
IGNORE = re.compile(r'Failed to load resource|dynamically imported module|Failed to resolve module|ERR_FAILED|net::')
with sync_playwright() as p:
    b = p.chromium.launch(); c = b.new_context(viewport={'width': 1280, 'height': 900}); c.add_init_script(MOCK)
    c.route('**/*', lambda r: r.abort() if not r.request.url.startswith('http://127.0.0.1') else r.continue_())
    for f in htmls:
        msgs = []; pg = c.new_page()
        pg.on('console', lambda m, msgs=msgs: msgs.append(m.text) if m.type == 'error' and not IGNORE.search(m.text) else None); pg.on('pageerror', lambda e, msgs=msgs: msgs.append('PAGEERROR ' + str(e)) if not IGNORE.search(str(e)) else None)
        pg.goto(B + f); pg.wait_for_timeout(500); check(f'{f}: loads with 0 errors / CSP violations', not msgs, msgs[:2]); pg.close()
    pg = c.new_page(); pg.goto(B + 'sermons.html'); pg.wait_for_selector('.sermon-card'); check('minified sermons.js renders cards', pg.locator('.sermon-card').count() == 1)
    pg.goto(B + 'bible.html?ref=John%203%3A16'); pg.wait_for_selector('#bText .sc-v', timeout=8000); check('minified scripture engine loads Bible text', 'God so loved' in pg.inner_text('#bText')); pg.close()
    pg = c.new_page(); pg.goto(B + 'about.html'); pg.wait_for_timeout(300); q = pg.locator('.faq-item').first; q.locator('button').first.click(); check('data-on-click handlers survive minification (FAQ)', 'open' in (q.get_attribute('class') or '')); pg.close()
    c.close(); c = b.new_context(); c.add_init_script(MOCK + ADMIN + "window.getAllDevotionals=async()=>[];window.getPrayerRequests=async()=>[];")
    c.route('**/*', lambda r: r.abort() if not r.request.url.startswith('http://127.0.0.1') else r.continue_())
    pg = c.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)) if not IGNORE.search(str(e)) else None); pg.goto(B + 'admin-dashboard.html'); pg.wait_for_timeout(1200)
    try: pg.click('.sidebar-nav-link:has-text("Audio")'); ok = pg.evaluate("document.getElementById('panel-audio').classList.contains('active')")
    except Exception as e: ok = False; errs.append(str(e)[:80])
    check('admin dashboard: delegated handlers + globals work in the minified build', ok and not errs, errs[:2])
    b.close()
print('\nFAILED:' if fails else '\nAll dist checks passed.', fails or ''); sys.exit(1 if fails else 0)
