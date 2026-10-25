#!/usr/bin/env python3
"""Visual regression: screenshots of key pages (mobile + desktop) compared with committed baselines snap-<page>-<width>.png.
  python3 test-visual.py            compare (skips cleanly if no baselines exist yet)
  python3 test-visual.py --update   (re)write baselines. Do this on the CI runner (workflow "Visual baselines"): pixels differ between
                                    operating systems, so baselines made on your laptop would fail in CI.
Time is frozen, network is blocked, animations are off, so a diff means the design really changed."""
import functools, http.server, io, os, socketserver, sys, threading
from PIL import Image, ImageChops
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)); UPDATE = '--update' in sys.argv; TOL = 0.004   # max share of changed pixels
PAGES = ['index', 'about', 'sermons', 'devotionals', 'bible', 'live', 'events', 'give', 'contact']
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(Q, directory=ROOT)); PORT = srv.server_address[1]; threading.Thread(target=srv.serve_forever, daemon=True).start()
MOCK = "window.CAC_BACKEND={configured:true};window.getSermons=async()=>[];window.getAudioSermons=async()=>[];window.getGalleryItems=async()=>[];window.getEvents=async()=>[];window.getLive=async()=>null;window.listenLive=cb=>{cb(null);return()=>{}};window.listenLiveNotes=cb=>{cb([]);return()=>{}};"
CSS = "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}html{scroll-behavior:auto!important}"
base = [f for f in os.listdir(ROOT) if f.startswith('snap-') and f.endswith('.png')]
if not UPDATE and not base: print('No visual baselines yet (snap-*.png): skipping. Run the "Visual baselines" workflow once to create them.'); sys.exit(0)
bad = 0; n = 0
with sync_playwright() as p:
    b = p.chromium.launch()
    for w, h in ((390, 844), (1280, 900)):
        c = b.new_context(viewport={'width': w, 'height': h}, reduced_motion='reduce', locale='en-NG', timezone_id='Africa/Lagos'); c.add_init_script(MOCK)
        c.route('**/*', lambda r: r.abort() if not r.request.url.startswith('http://127.0.0.1') else r.continue_())
        for name in PAGES:
            pg = c.new_page(); pg.clock.install(time='2026-06-01T10:00:00Z'); pg.goto(f'http://127.0.0.1:{PORT}/{name}.html'); pg.add_style_tag(content=CSS)
            pg.evaluate("document.fonts.ready"); pg.wait_for_timeout(500); pg.evaluate("document.querySelectorAll('img[loading=lazy]').forEach(i=>i.loading='eager')"); pg.wait_for_timeout(300)
            shot = pg.screenshot(full_page=True, animations='disabled'); pg.close()
            path = os.path.join(ROOT, f'snap-{name}-{w}.png'); n += 1
            if UPDATE: open(path, 'wb').write(shot); print('wrote', os.path.basename(path)); continue
            if not os.path.exists(path): print('skip (no baseline)', os.path.basename(path)); continue
            a = Image.open(path).convert('RGB'); z = Image.open(io.BytesIO(shot)).convert('RGB')
            if a.size != z.size: print(f'FAIL {name}-{w}: size {a.size} -> {z.size}'); bad += 1; continue
            d = ImageChops.difference(a, z).convert('L').point(lambda v: 255 if v > 24 else 0); share = sum(1 for v in d.getdata() if v) / (a.size[0] * a.size[1])
            if share > TOL: d.save(f'/tmp/visual-diff-{name}-{w}.png'); print(f'FAIL {name}-{w}: {share:.2%} of pixels changed'); bad += 1
            else: print(f'ok   {name}-{w} ({share:.3%})')
        c.close()
    b.close()
print('done' if UPDATE else f'{n - bad}/{n} visual checks passed'); sys.exit(1 if bad else 0)
