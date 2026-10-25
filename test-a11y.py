#!/usr/bin/env python3
"""Automated accessibility checks (axe-core, WCAG 2.0/2.1/2.2 A + AA rules) on every public page, desktop and mobile widths.
Fails the build on any serious/critical violation. Run: python3 test-a11y.py  (needs: npm install, pip install playwright)
Automated tools find roughly a third of real problems: this is a safety net, not a substitute for screen-reader testing (see ACCESSIBILITY.md)."""
import http.server, json, os, socketserver, sys, threading, functools
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.abspath(__file__))
AXE = open(os.path.join(ROOT, 'node_modules', 'axe-core', 'axe.min.js'), encoding='utf-8').read()
TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']
BLOCK = {'serious', 'critical'}
PAGES = sorted(f for f in os.listdir(ROOT) if f.endswith('.html') and not f.startswith('admin-'))
H = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
class Q(H.func):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(Q, directory=ROOT)); PORT = srv.server_address[1]   # free port: never collides
threading.Thread(target=srv.serve_forever, daemon=True).start()
MOCK = "window.CAC_BACKEND={configured:true};window.getSermons=async()=>[];window.getAudioSermons=async()=>[];window.getGalleryItems=async()=>[];window.getEvents=async()=>[];"
bad = 0; total = 0
with sync_playwright() as p:
    b = p.chromium.launch()
    for name, vp, theme in (('desktop', {'width': 1280, 'height': 900}, 'dark'), ('mobile', {'width': 390, 'height': 800}, 'dark'), ('light', {'width': 1280, 'height': 900}, 'light'), ('contrast', {'width': 1280, 'height': 900}, 'contrast')):
        c = b.new_context(viewport=vp, reduced_motion='reduce'); c.add_init_script(MOCK + "localStorage.setItem('cacTheme','%s');" % theme)
        c.route('**/*', lambda r: r.abort() if not r.request.url.startswith('http://127.0.0.1') else r.continue_())
        for f in PAGES:
            pg = c.new_page(); pg.goto(f'http://127.0.0.1:{PORT}/{f}'); pg.wait_for_timeout(600)
            pg.add_script_tag(content=AXE)
            res = pg.evaluate("axe.run(document,{runOnly:{type:'tag',values:%s},resultTypes:['violations']}).then(r=>r.violations.map(v=>({id:v.id,impact:v.impact,help:v.help,n:v.nodes.length,sample:v.nodes.slice(0,2).map(n=>n.target.join(' '))})))" % json.dumps(TAGS))
            total += 1; blocking = [v for v in res if v['impact'] in BLOCK]; other = [v for v in res if v['impact'] not in BLOCK]
            print(('FAIL ' if blocking else 'ok   ') + f'{name:8} {f:18} blocking:{len(blocking)} minor/moderate:{len(other)}')
            for v in blocking: print('      -', v['impact'], v['id'], '(%d)' % v['n'], v['help'], v['sample'])
            for v in other: print('      ~', v['impact'], v['id'], '(%d)' % v['n'], v['sample'][:1])
            bad += bool(blocking); pg.close()
        c.close()
    b.close()
print(f'\n{total - bad}/{total} page checks without serious/critical accessibility violations')
sys.exit(1 if bad else 0)
