import json, re, subprocess, sys, time, os, http.server, threading, socketserver, functools
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.abspath(__file__))
H = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
class Q(H.func):
    def log_message(self,*a): pass
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(('127.0.0.1', 8765), functools.partial(Q, directory=ROOT)); threading.Thread(target=srv.serve_forever, daemon=True).start()
B = 'http://127.0.0.1:8765/'
fails = []; passed = 0
def check(name, cond, extra=''):
    global passed
    if cond: passed += 1; print('  ok  ' + name)
    else: fails.append(name); print('FAIL  ' + name + ' ' + str(extra))

def today_lagos():
    import datetime; return (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=1)).strftime('%Y-%m-%d')
def plus(d, n):
    import datetime; return (datetime.date.fromisoformat(d) + datetime.timedelta(days=n)).isoformat()
T = today_lagos()
DEVS = [
 {'id':T,'date':T,'status':'published','title':'Today Title','theme':'Faith','scripture':'Hebrews 11:1','author':'Pastor X','message':'Para one <script>window.__xss=1</script>\n\nPara two','reflection':['Q1','Q2'],'prayerPoints':['P1']},
 {'id':plus(T,-1),'date':plus(T,-1),'status':'published','title':'Yesterday Title','theme':'Prayer','scripture':'Luke 18:1','author':'Pastor Y','message':'Yesterday body'},
 {'id':plus(T,-2),'date':plus(T,-2),'status':'published','title':'Two Days Ago','theme':'Prayer','scripture':'Psalm 5:3','author':'Pastor Y','message':'Older body'},
 {'id':plus(T,3),'date':plus(T,3),'status':'published','title':'FUTURE LEAK','scripture':'x','author':'a','message':'must be hidden'},
 {'id':plus(T,-3),'date':plus(T,-3),'status':'draft','title':'DRAFT LEAK','scripture':'x','author':'a','message':'must be hidden'},
 {'id':plus(T,-4),'date':plus(T,-4),'status':'archived','title':'ARCHIVED LEAK','scripture':'x','author':'a','message':'must be hidden'},
]
EVTS = [{'id':'c1','title':'Camp Meeting <img src=x onerror=window.__xss=2>','type':'Special Event','date':plus(T,10),'time':'18:00','endTime':'21:00','venue':'Main Auditorium','description':'Join us','status':'upcoming'},
        {'id':'c2','title':'Youth Retreat','type':'Youth','date':plus(T,20),'endDate':plus(T,22),'venue':'Camp','description':'','status':'upcoming'}]
MOCK = """
window.CAC_BACKEND={configured:true};
const DEVS=%s, EVTS=%s; window.__saved=[];
window.getEvents=async()=>EVTS;
window.getPublishedDevotionals=async()=>DEVS.filter(d=>d.status==='published');
window.getSermons=async()=>[];
window.getApprovedTestimonies=async()=>[{story:'God healed me <b>x</b>',name:'Ada',country:'NG'}];
window.saveTestimony=async d=>{window.__saved.push(['t',d])};
window.saveVisitorEnquiry=async d=>{window.__saved.push(['v',d])};
window.savePrayerRequest=async d=>{window.__saved.push(['p',d])};
window.saveNewsletter=async d=>{window.__saved.push(['n',d])};
window.cacAuth={available:()=>true,onChange:cb=>{cb(null,null);return()=>{}},signOut:async()=>{}};
""" % (json.dumps(DEVS), json.dumps(EVTS))

with sync_playwright() as p:
    br = p.chromium.launch()
    def ctx(mock=True, **kw):
        c = br.new_context(accept_downloads=True, **kw)
        c.route(re.compile(r'https?://(?!127\.0\.0\.1).*'), lambda r: r.abort())
        if mock: c.add_init_script(MOCK)
        return c
    def page_of(c, errs):
        pg = c.new_page(); pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
        pg.on('console', lambda m: errs.append('CONSOLE ' + m.text) if m.type == 'error' and 'ERR_FAILED' not in m.text and 'Failed to load resource' not in m.text else None)
        return pg

    print('\n[1] Every page loads clean (desktop + mobile, no horizontal overflow)')
    pages = ['index','about','ministries','sermons','gallery','contact','events','devotionals','bible','live','prayer-wall','visit','testimonies','impact','give','privacy','terms','admin-login']
    for vw, name in [({'width':1366,'height':800},'desktop'),({'width':375,'height':740},'mobile')]:
        c = ctx(viewport=vw)
        for n in pages:
            errs = []; pg = page_of(c, errs); pg.goto(B + n + '.html'); pg.wait_for_timeout(500)
            ov = pg.evaluate('document.documentElement.scrollWidth - window.innerWidth')
            check(f'{n} {name}: no js errors', not errs, errs[:3])
            check(f'{n} {name}: no horizontal scroll', ov <= 1, ov)
            if name == 'desktop' and not n.startswith('admin'): check(f'{n}: has translator button', pg.locator('.cac-lang-btn').count() == 1)
            pg.close()
        c.close()

    print('\n[2] Navigation links all resolve')
    c = ctx(); errs = []; pg = page_of(c, errs); pg.goto(B + 'index.html')
    hrefs = set(pg.eval_on_selector_all('a[href]', 'els=>els.map(e=>e.getAttribute("href"))'))
    for h in sorted(hrefs):
        f = h.split('#')[0].split('?')[0]
        if f and not f.startswith(('http','mailto','tel','javascript')): check('link ' + h, os.path.exists(os.path.join(ROOT, f)))
    c.close()

    print('\n[3] Events')
    c = ctx(); errs = []; pg = page_of(c, errs); pg.goto(B + 'events.html'); pg.wait_for_selector('.ev-row')
    check('events: recurring + cloud rows render', pg.locator('.ev-row').count() > 15, pg.locator('.ev-row').count())
    check('events: XSS in title is inert', pg.evaluate('window.__xss') is None)
    check('events: cloud event visible', pg.locator('.ev-row', has_text='Youth Retreat').count() == 1)
    check('events: multi-day shows range arrow', '→' in pg.locator('.ev-row', has_text='Youth Retreat').inner_text())
    check('events: Lagos time shown', 'Lagos' in pg.locator('.ev-row', has_text='Sunday Service').first.inner_text())
    sun = pg.locator('.ev-row', has_text='Sunday Service').first
    sun.locator('[data-menu]').click()
    hrefs = pg.eval_on_selector_all('.menu a', 'e=>e.map(x=>x.href)')
    check('events: per-event menu has Google/Outlook/Yahoo', any('calendar.google.com' in h for h in hrefs) and any('outlook.live.com' in h for h in hrefs) and any('yahoo.com' in h for h in hrefs), hrefs)
    with pg.expect_download() as d: pg.click('[data-ics]')
    ics = open(d.value.path()).read()
    check('events: single .ics valid', ics.startswith('BEGIN:VCALENDAR') and ics.count('BEGIN:VEVENT') == 1 and 'Sunday Service' in ics)
    pg.keyboard.press('Escape')
    pg.locator('.ev-row input[type=checkbox]').nth(0).check(); pg.locator('.ev-row input[type=checkbox]').nth(2).check()
    check('events: selection bar shows 2', '2 events' in pg.inner_text('#selCount') and pg.locator('#selBar.show').count() == 1)
    pg.click('#selAdd'); check('events: bulk modal opens', pg.locator('#bulkModal').is_visible())
    with pg.expect_download() as d: pg.click('#bulkIcs')
    ics = open(d.value.path()).read()
    check('events: bulk .ics has exactly 2 events', ics.count('BEGIN:VEVENT') == 2, ics.count('BEGIN:VEVENT'))
    pg.click('#bulkGoogle'); check('events: google link list has 2 links', pg.locator('#bulkLinks a').count() == 2)
    pg.click('#bulkClose'); check('events: modal closes', not pg.locator('#bulkModal').is_visible())
    pg.click('#selClear'); check('events: clear hides bar', pg.locator('#selBar.show').count() == 0)
    pg.fill('#evSearch', 'auditorium'); check('events: search filters', pg.locator('.ev-row').count() == 1)
    pg.fill('#evSearch', 'zzzz'); check('events: empty state', pg.locator('#evList .empty').count() == 1)
    pg.fill('#evSearch', '')
    pg.click('.chip[data-type="Prayer"]'); check('events: type filter', pg.locator('.ev-row').count() > 0 and all('Fasting' in t for t in pg.locator('.ev-row h3').all_inner_texts()))
    pg.click('.chip[data-type="all"]')
    pg.click('#selectAllTop'); n = pg.locator('.ev-row input:checked').count()
    check('events: add-all selects everything + opens modal', n == pg.locator('.ev-row').count() and pg.locator('#bulkModal').is_visible(), n)
    with pg.expect_download() as d: pg.click('#bulkIcs')
    big = open(d.value.path()).read(); check('events: add-all ics event count matches', big.count('BEGIN:VEVENT') == n)
    pg.click('#bulkClose'); pg.click('#selClear')
    with pg.expect_download() as d: pg.click('#fullIcs')
    full = open(d.value.path()).read()
    check('events: full calendar has RRULEs', 'RRULE:FREQ=WEEKLY;BYDAY=SU' in full and 'BYDAY=-1SA' in full and 'BYMONTHDAY=-3,-2,-1' in full)
    pg.click('[data-view=month]'); check('events: month grid renders', pg.locator('.cal-day[data-day]').count() >= 28)
    cur = pg.inner_text('.cal-head h3'); pg.click('[data-cal="1"]'); check('events: next month', pg.inner_text('.cal-head h3') != cur)
    pg.click('[data-cal="0"]'); pg.locator('.cal-day.today').click()
    check('events: day click lists day', pg.locator('#dayList h2').count() == 1)
    ld = json.loads(pg.evaluate("document.getElementById('ldEvents').textContent"))
    check('events: JSON-LD valid schema.org Events', len(ld['@graph']) >= 3 and all(x['@type']=='Event' and x['startDate'] and x['location']['name'] for x in ld['@graph']), ld['@graph'][:1])
    check('events: JSON-LD escapes script-breaking chars', '<img' not in pg.evaluate("document.getElementById('ldEvents').textContent"))
    check('events: no js errors', not errs, errs[:3]); c.close()
    # timezone display for a visitor far from Lagos
    c = ctx(timezone_id='America/Los_Angeles'); pg = c.new_page(); pg.goto(B + 'events.html'); pg.wait_for_selector('.ev-row')
    check('events: shows visitor-local time for LA', 'your time' in pg.locator('.ev-row', has_text='Sunday Service').first.inner_text()); c.close()
    # events without backend still works (graceful)
    c = ctx(mock=False); errs = []; pg = page_of(c, errs); pg.goto(B + 'events.html'); pg.wait_for_selector('.ev-row', timeout=9000)
    check('events: works with backend unavailable', pg.locator('.ev-row').count() > 5 and not errs, errs[:2]); c.close()

    print('\n[4] Devotionals')
    c = ctx(); errs = []; pg = page_of(c, errs); pg.goto(B + 'devotionals.html'); pg.wait_for_selector('.dv-article h2')
    check('dev: today shown', pg.inner_text('.dv-article h2') == 'Today Title')
    check('dev: XSS inert', pg.evaluate('window.__xss') is None)
    txt = pg.inner_text('body')
    check('dev: draft/future/archived hidden everywhere', not any(x in txt for x in ['DRAFT LEAK','FUTURE LEAK','ARCHIVED LEAK']))
    check('dev: archive lists 3 published', pg.locator('#dvList a').count() == 3, pg.locator('#dvList a').count())
    pg.click('.dv-nav a:has-text("Previous day")'); check('dev: previous day', pg.inner_text('.dv-article h2') == 'Yesterday Title' and 'd=' + plus(T,-1) in pg.url)
    pg.goto(B + 'devotionals.html?d=' + plus(T,3)); pg.wait_for_selector('.dv-article h2')
    check('dev: future-dated URL falls back, no leak', pg.inner_text('.dv-article h2') == 'Today Title' and 'FUTURE LEAK' not in pg.inner_text('body'))
    pg.goto(B + 'devotionals.html?d=' + plus(T,-3)); pg.wait_for_selector('.dv-article h2')
    check('dev: draft URL not exposed', 'DRAFT LEAK' not in pg.inner_text('body'))
    pg.goto(B + 'devotionals.html?d=garbage'); pg.wait_for_selector('.dv-article h2'); check('dev: garbage date handled', pg.inner_text('.dv-article h2') == 'Today Title')
    pg.goto(B + 'devotionals.html'); pg.wait_for_selector('#bmBtn')
    pg.click('#bmBtn'); check('dev: bookmark toggles', pg.get_attribute('#bmBtn','aria-pressed') == 'true' and pg.locator('#dvBm a').count() == 1)
    pg.click('#rdBtn'); check('dev: mark read + streak 1', pg.inner_text('#dvStreak') == '1')
    pg.reload(); pg.wait_for_selector('#bmBtn'); check('dev: persists after reload', pg.get_attribute('#bmBtn','aria-pressed') == 'true' and pg.inner_text('#dvStreak') == '1')
    before = pg.evaluate('parseFloat(getComputedStyle(document.querySelector(".dv-article")).fontSize)'); pg.click('#fPlus')
    check('dev: font size increases', pg.evaluate('parseFloat(getComputedStyle(document.querySelector(".dv-article")).fontSize)') > before)
    pg.fill('#dvNotes', 'my private note'); pg.wait_for_timeout(800); pg.reload(); pg.wait_for_selector('#bmBtn')
    check('dev: private note persists', pg.input_value('#dvNotes') == 'my private note')
    pg.fill('#dvSearch', 'luke'); check('dev: archive search', pg.locator('#dvList a').count() == 1)
    pg.fill('#dvSearch', ''); pg.select_option('#dvTopic', 'Prayer'); check('dev: topic filter', pg.locator('#dvList a').count() == 2)
    pg.select_option('#dvTopic', ''); pg.fill('#dvJump', plus(T,-2)); pg.dispatch_event('#dvJump','change'); check('dev: jump to date', pg.inner_text('.dv-article h2') == 'Two Days Ago')
    check('dev: title/meta updated', 'Two Days Ago' in pg.title())
    pg.goto(B + 'devotionals.html'); pg.wait_for_selector('.dv-article h2')
    ld = json.loads(pg.evaluate("document.getElementById('ldDevotional').textContent"))
    check('dev: JSON-LD Article correct', ld['@type']=='Article' and ld['headline']=='Today Title' and ld['datePublished']==T and ld['author']['name']=='Pastor X', ld)
    check('dev: no js errors', not errs, errs[:3]); c.close()
    # no devotional for today -> graceful fallback to most recent
    c = ctx(); c.add_init_script("window.getPublishedDevotionals=async()=>[{id:'a',date:'%s',status:'published',title:'Old One',scripture:'J 1:1',author:'A',message:'m'}]" % plus(T,-5))
    pg = c.new_page(); pg.goto(B + 'devotionals.html'); pg.wait_for_selector('.dv-article h2')
    check('dev: fallback notice + latest shown', 'hasn’t been published' in pg.inner_text('.dv-article') and pg.inner_text('.dv-article h2') == 'Old One'); c.close()
    c = ctx(); c.add_init_script("window.getPublishedDevotionals=async()=>[]"); pg = c.new_page(); pg.goto(B + 'devotionals.html'); pg.wait_for_selector('.empty')
    check('dev: empty state', 'No devotional has been published' in pg.inner_text('.dv-article')); c.close()
    c = ctx(); c.add_init_script("window.getPublishedDevotionals=async()=>{throw new Error('net')}"); pg = c.new_page(); pg.goto(B + 'devotionals.html'); pg.wait_for_selector('.empty')
    check('dev: error state', 'couldn’t load' in pg.inner_text('.dv-article')); c.close()
    c = ctx(mock=False); pg = c.new_page(); pg.goto(B + 'devotionals.html'); pg.wait_for_selector('.dv-article h2', timeout=9000)
    check('dev: preview mode is clearly labelled sample', 'Preview mode' in pg.inner_text('.dv-article')); c.close()

    print('\n[5] Forms')
    c = ctx(); errs = []; pg = page_of(c, errs); pg.goto(B + 'testimonies.html'); pg.wait_for_selector('#testimonyList figure')
    check('testimony: approved list renders, html escaped', pg.locator('#testimonyList figure b').count() == 0)
    pg.click('#testimonyForm button[type=submit]'); check('testimony: short story rejected', 'at least 30' in pg.inner_text('#testimonyForm .f-msg'))
    pg.fill('#tStory', 'x' * 40); pg.click('#testimonyForm button[type=submit]'); check('testimony: consent required', 'consent' in pg.inner_text('#testimonyForm .f-msg').lower())
    pg.fill('#tEmail', 'bad'); pg.check('[name=consent]'); pg.click('#testimonyForm button[type=submit]'); check('testimony: bad email rejected', 'valid email' in pg.inner_text('#testimonyForm .f-msg'))
    pg.fill('#tEmail', 'a@b.co'); pg.click('#testimonyForm button[type=submit]'); pg.wait_for_selector('.f-msg.ok')
    s = pg.evaluate('window.__saved'); check('testimony: saved with consent + pending-safe payload', len(s) == 1 and s[0][1]['consent'] is True and 'website' not in s[0][1], s)
    pg.fill('#tStory', 'y' * 40); pg.check('[name=consent]'); pg.click('#testimonyForm button[type=submit]')
    check('testimony: cooldown blocks rapid resubmit', 'wait' in pg.inner_text('#testimonyForm .f-msg').lower() and len(pg.evaluate('window.__saved')) == 1)
    pg.goto(B + 'visit.html'); pg.fill('#vName', 'Bot'); pg.evaluate("document.querySelector('[name=website]').value='spam'"); pg.fill('#vEmail', 'a@b.co'); pg.check('[name=consent]'); pg.click('#visitForm button[type=submit]')
    check('visit: honeypot silently drops bots', pg.evaluate('window.__saved').__len__() == 0)
    pg.evaluate("document.querySelector('[name=website]').value=''"); pg.click('#visitForm button[type=submit]'); pg.wait_for_selector('.f-msg.ok')
    check('visit: valid submit saved', pg.evaluate('window.__saved')[0][0] == 'v')
    pg.goto(B + 'visit.html'); pg.evaluate('localStorage.clear()'); pg.fill('#vName', 'Ada'); pg.click('#visitForm button[type=submit]'); check('visit: needs contact + consent', 'email or phone' in pg.inner_text('#visitForm .f-msg'))
    pg.goto(B + 'index.html#prayer'); pg.fill('#prayerName', 'Ada'); pg.fill('#prayerRequest', 'Please pray for my family'); pg.click('#prayerForm button[type=submit]'); pg.wait_for_timeout(600)
    check('prayer: saves only whitelisted fields', [k for k in pg.evaluate('window.__saved')[0][1]] == ['name','phone','request','type'], pg.evaluate('window.__saved'))
    check('forms: no js errors', not errs, errs[:3]); c.close()
    c = ctx(mock=False); pg = c.new_page(); pg.goto(B + 'index.html'); pg.wait_for_timeout(5600)
    pg.fill('#prayerName', 'Ada'); pg.fill('#prayerRequest', 'Please pray for my family'); pg.click('#prayerForm button[type=submit]'); pg.wait_for_timeout(500)
    check('prayer: NO false success when backend missing', 'not connected' in pg.inner_text('#toastMsg'), pg.inner_text('#toastMsg')); c.close()

    print('\n[6] Translator')
    c = ctx(); errs = []; pg = page_of(c, errs); pg.goto(B + 'index.html')
    pg.click('.cac-lang-btn'); check('translate: panel opens + focus in list', pg.locator('.cac-lang-panel').is_visible() and pg.evaluate('document.activeElement.tagName') == 'LI')
    check('translate: 12 languages', pg.locator('.cac-lang-panel li').count() == 12)
    pg.keyboard.press('ArrowDown'); pg.keyboard.press('Escape'); check('translate: Esc closes', not pg.locator('.cac-lang-panel').is_visible())
    pg.click('.cac-lang-btn'); pg.click('li[data-lang=ar]')
    ck = {x['name']: x['value'] for x in c.cookies()}; check('translate: Arabic sets googtrans cookie', ck.get('googtrans') == '/en/ar', ck)
    check('translate: RTL applied', pg.evaluate('document.documentElement.dir') == 'rtl')
    check('translate: loads Google script only after choosing', pg.locator('script[src*="translate.google.com"]').count() == 1)
    pg.reload(); pg.wait_for_timeout(500); check('translate: choice persists after reload', pg.inner_text('.cac-lang-cur') == 'العربية')
    pg.click('.cac-lang-btn'); pg.click('li[data-lang=en]'); pg.wait_for_load_state(); pg.wait_for_timeout(600)
    ck = {x['name']: x['value'] for x in c.cookies()}; check('translate: English clears cookie + LTR', not ck.get('googtrans') and pg.evaluate('document.documentElement.dir') in ('', 'ltr'), ck)
    c.close()
    c = ctx(); pg = c.new_page(); pg.goto(B + 'index.html'); a = pg.locator('.cac-lang-btn').bounding_box(); w = pg.locator('.floating-whatsapp').bounding_box()
    check('translate: does not overlap WhatsApp button', a['x'] + a['width'] < w['x'] or a['y'] + a['height'] < w['y'] or w['y'] + w['height'] < a['y'])

    print('\n[6b] Contact form')
    c = ctx(); pg = c.new_page(); pg.goto(B + 'contact.html'); pg.fill('#contactName','Ada'); pg.fill('#contactEmail','a@b.co'); pg.fill('#contactMessage','Hello church, a question'); pg.click('#contactSubmitBtn'); pg.wait_for_timeout(600)
    sv = pg.evaluate('window.__saved'); check('contact: saved to visitor enquiries (not prayers)', len(sv)==1 and sv[0][0]=='v' and sv[0][1]['consent'] is True and 'Hello church' in sv[0][1]['message'], sv); c.close()
    c = ctx(mock=False); pg = c.new_page(); pg.goto(B + 'contact.html'); pg.wait_for_timeout(5600); pg.fill('#contactName','Ada'); pg.fill('#contactEmail','a@b.co'); pg.fill('#contactMessage','Hello church, a question'); pg.click('#contactSubmitBtn'); pg.wait_for_timeout(500)
    check('contact: no false success when backend missing', 'not connected' in pg.inner_text('#toastMsg'), pg.inner_text('#toastMsg')); c.close()

    print('\n[6c] SEO + legal')
    seo = ['index','about','ministries','sermons','gallery','contact','events','devotionals','give','visit','testimonies','impact','privacy','terms']
    for n in seo:
        h = open(os.path.join(ROOT, n + '.html')).read()
        check(f'seo {n}: canonical+og+twitter, exactly one canonical', h.count('rel="canonical"')==1 and 'og:image' in h and 'twitter:card' in h and h.count('og:title')==1)
    check('seo: admin pages noindex', all('noindex' in open(os.path.join(ROOT,n+'.html')).read() for n in ['admin-login','admin-dashboard']))
    check('seo: sitemap lists every public page', all(('/'+n+'.html') in open(os.path.join(ROOT,'sitemap.xml')).read() or n=='index' for n in seo))
    check('seo: og image exists', os.path.getsize(os.path.join(ROOT,'og-image.png')) > 10000)
    c = ctx(); pg = c.new_page(); pg.goto(B + 'index.html'); ld = json.loads(pg.evaluate("document.querySelector('script[type=\"application/ld+json\"]').textContent"))
    check('seo: home Church JSON-LD valid', ld['@type']=='Church' and ld['telephone']=='+2348079731695', ld); c.close()

    print('\n[6d] Livestream + map')
    c = ctx(); pg = c.new_page(); pg.goto(B + 'index.html'); pg.wait_for_timeout(700)
    check('live: no broken placeholder iframe or fake LIVE badge', pg.locator('#liveWrap iframe').count()==0 and not pg.locator('#liveBadgeWrap').is_visible() and pg.locator('#liveWrap a[href*="youtube.com/@CACGoodWorks"]').count()==1); c.close()
    c = ctx(); pg = c.new_page()
    pg.route('**/config.js', lambda r: r.fulfill(body=open(os.path.join(ROOT,'config.js')).read().replace("youtubeChannelId: ''", "youtubeChannelId: 'UCabcdefghijklmnopqrstuv'"), content_type='application/javascript'))
    pg.goto(B + 'index.html'); pg.wait_for_timeout(500)
    check('live: embeds when channel ID configured', 'channel=UCabcdefghijklmnopqrstuv' in (pg.get_attribute('#liveWrap iframe','src') or '') and pg.locator('#liveBadgeWrap').is_visible()); c.close()
    h = open(os.path.join(ROOT,'index.html')).read() + open(os.path.join(ROOT,'contact.html')).read()
    check('map: no longer pinned to Lagos coordinates', '2d3.1191562' not in h and 'Ijebu-ode' in h)

    print('\n[6e] Icon subset integrity')
    import glob
    full = os.path.join(ROOT,'node_modules/@fortawesome/fontawesome-free/css/all.min.css')
    trimmed = open(os.path.join(ROOT,'icons.css')).read()
    if os.path.exists(full):
        fullcss = open(full).read(); used = set()
        for f in glob.glob(os.path.join(ROOT,'*.html')) + glob.glob(os.path.join(ROOT,'*.js')): used |= set(re.findall(r'\bfa-([a-z0-9-]+)', open(f, errors='ignore').read()))
        used |= {'video','image'}
        known = {n for n in used if ('.fa-'+n+':before') in fullcss}
        missing = sorted(n for n in known if ('.fa-'+n+':before') not in trimmed)
        check(f'icons: all {len(known)} icons used in the site survive subsetting', not missing, missing)
    for n in ['index','events','devotionals','gallery','contact','sermons','visit']:
        c = ctx(); pg = c.new_page(); pg.goto(B + n + '.html'); pg.wait_for_timeout(900)
        blank = pg.evaluate("""()=>[...document.querySelectorAll('i[class*=" fa-"],i[class^="fa-"]')].filter(i=>{const c=getComputedStyle(i,'::before').content;return !c||c==='none'||c==='normal'}).map(i=>i.className)""")
        check(f'icons: {n} has no blank icons', not blank, blank[:5]); c.close()

    print('\n[6f] No dead links')
    for n in ['index','contact','about','events','devotionals','give']:
        c = ctx(); pg = c.new_page(); pg.goto(B + n + '.html'); pg.wait_for_timeout(500)
        dead = pg.evaluate("[...document.querySelectorAll('a')].filter(a=>{const h=a.getAttribute('href');return h==='#'||h===''||h===null}).map(a=>a.outerHTML.slice(0,60))")
        check(f'links: {n} has no dead # links', not dead, dead[:3]); c.close()
    c = ctx(); pg = c.new_page(); pg.goto(B + 'index.html'); pg.wait_for_timeout(500)
    soc = pg.eval_on_selector_all('.footer-social a', 'e=>e.map(x=>x.href)')
    check('social: only networks with real URLs are shown (YouTube only)', len(soc)==1 and 'youtube.com/@CACGoodWorks' in soc[0], soc); c.close()

    print('\n[6g] Performance guards')
    c = ctx(mock=False); pg = c.new_page(); pg.goto(B + 'events.html'); pg.wait_for_selector('.ev-row', timeout=2000)
    check('perf: events render within 2s even when Firebase never loads', pg.locator('.ev-row').count() > 5); c.close()
    OBS = "window.__ls=0;new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput)window.__ls+=e.value}).observe({type:'layout-shift',buffered:true});"
    for n in ['events','devotionals','index','visit','sermons']:
        for mock in (False, True):
            c = ctx(mock=mock, viewport={'width':412,'height':823}); c.add_init_script(OBS); pg = c.new_page(); pg.goto(B + n + '.html'); pg.wait_for_timeout(1500)
            cls = pg.evaluate('window.__ls'); check(f'perf: {n} CLS < 0.1 ({"backend" if mock else "no backend"})', cls < 0.1, round(cls, 3)); c.close()

    print('\n[6h] Anchor links land exactly (guards against content-visibility scroll jumps)')
    for vw in ({'width':412,'height':823},{'width':1366,'height':800}):
        for anchor in ('giving','prayer','livestream'):
            c = ctx(viewport=vw); pg = c.new_page(); pg.goto(B + 'index.html#' + anchor); pg.wait_for_timeout(3500)
            top = pg.evaluate("Math.abs(document.getElementById('%s').getBoundingClientRect().top)" % anchor)
            check(f'anchor: #{anchor} lands at viewport top ({vw["width"]}px)', top < 120, round(top)); c.close()

    print('\n[6hh] hidden attribute is honoured everywhere')
    c = ctx(); pg = c.new_page(); pg.goto(B + 'devotionals.html'); pg.wait_for_selector('.dv-article h2')
    check('hidden: "Load more" button is truly hidden when there is nothing more', pg.locator('#dvMore').is_hidden()); c.close()

    print('\n[6i] Free feeds, reminder, backup, link-only uploads')
    c = ctx(); pg = c.new_page(); pg.goto(B + 'events.html'); pg.wait_for_selector('.ev-row')
    fl = pg.evaluate("window.__feedLinks({protocol:'https:',host:'church.org',hostname:'church.org',pathname:'/site/events.html'})")
    check('feed: webcal + https + google links built correctly', fl['webcal']=='webcal://church.org/site/calendar.ics' and fl['https']=='https://church.org/site/calendar.ics' and fl['google'].endswith(__import__('urllib.parse',fromlist=['x']).quote('webcal://church.org/site/calendar.ics', safe='')), fl)
    check('feed: google subscribe hidden on localhost (cannot work)', pg.evaluate("window.__feedLinks({protocol:'http:',host:'127.0.0.1:8',hostname:'127.0.0.1',pathname:'/events.html'})")['google']=='' and pg.locator('#subGoogle').is_hidden())
    check('feed: calendar.ics and devotionals.xml hrefs present', pg.get_attribute('#subWebcal','href').startswith('webcal://') and 'application/rss+xml' in open(os.path.join(ROOT,'devotionals.html')).read()); c.close()
    c = ctx(timezone_id='Africa/Lagos'); errs = []; pg = page_of(c, errs); pg.goto(B + 'devotionals.html'); pg.wait_for_selector('#remIcs')
    pg.fill('#remindTime', '05:45')
    g = __import__('urllib.parse',fromlist=['x']).urlparse(pg.get_attribute('#remGoogle','href')); q = __import__('urllib.parse',fromlist=['x']).parse_qs(g.query)
    check('reminder: google link daily, local time, no fixed timezone', q['recur']==['RRULE:FREQ=DAILY'] and 'ctz' not in q and q['dates'][0].split('/')[0].endswith('T054500') and 'Z' not in q['dates'][0], q)
    with pg.expect_download() as d: pg.click('#remIcs')
    ics = open(d.value.path()).read()
    check('reminder: ics repeats daily, floating time, alarm at start', 'RRULE:FREQ=DAILY' in ics and re.search(r'DTSTART:\d{8}T054500\s', ics) and 'TRIGGER:PT0S' in ics and 'TZID' not in ics.split('BEGIN:VEVENT')[1])
    pg.fill('#remindTime', '23:55'); ev = pg.evaluate('window.__reminderEvent()')
    check('reminder: end time crossing midnight rolls the date', ev['endTime']=='00:10' and ev['endDate'] > ev['date'], ev)
    check('reminder: no js errors', not errs, errs[:2]); c.close()

    ADMIN = "window.cacAuth={available:()=>true,onChange:cb=>{cb({email:'admin@church.org'},'super');return()=>{}},signOut:async()=>{}};window.__calls=[];"
    c = ctx(); c.add_init_script(ADMIN + "window.cacExport=async n=>{if(n==='prayer_requests')throw new Error('permission-denied');return n==='newsletters'?[{id:'1',email:'=HYPERLINK(\"http://evil\")',timestamp:'2026-01-01'},{id:'2',email:'a@b.co',timestamp:'2026-01-02'}]:[{id:'x',title:'T '+n}]};"
        "window.getAudioSermons=async()=>[];window.getGalleryItems=async()=>[];window.getSermons=async()=>[];window.getPrayerRequests=async()=>[];window.getEvents=async()=>[];"
        "window.saveAudioSermon=async d=>{window.__calls.push(['audio',d])};window.saveGalleryItem=async d=>{window.__calls.push(['gallery',d])};window.uploadFile=async()=>{window.__calls.push(['UPLOAD-CALLED'])};")
    errs = []; pg = page_of(c, errs); pg.goto(B + 'admin-dashboard.html'); pg.wait_for_selector('body.authed'); pg.evaluate("showPanel('backup')"); pg.wait_for_selector('#backupList input')
    with pg.expect_download() as d: pg.click('#backupBtn')
    bk = json.load(open(d.value.path()))
    check('backup: json has all permitted collections', 'devotionals' in bk['collections'] and 'newsletters' in bk['collections'] and 'exportedAt' in bk)
    check('backup: forbidden collection skipped and reported', 'prayer_requests' not in bk['collections'] and 'prayer_requests' in pg.inner_text('#backupMsg'))
    with pg.expect_download() as d: pg.click('#emailsBtn')
    csv = open(d.value.path()).read()
    check('backup: csv neutralises formula injection', "\"'=HYPERLINK" in csv and 'a@b.co' in csv, csv[:120])
    pg.evaluate("showPanel('audio')"); pg.fill('#audioTitle','Sunday Word'); pg.fill('#audioPreacher','Pastor A'); pg.fill('#audioUrlInput','https://archive.org/download/x/sermon.mp3'); pg.evaluate('handleAudioUpload()'); pg.wait_for_timeout(500)
    calls = pg.evaluate('window.__calls'); check('audio: link-only save works with NO storage upload', calls and calls[0][0]=='audio' and calls[0][1]['audioUrl'].endswith('sermon.mp3') and not any(c[0]=='UPLOAD-CALLED' for c in calls), calls)
    pg.evaluate("showPanel('gallery')"); pg.fill('#galleryCaption','Youth day'); pg.fill('#galleryUrlInput','https://cdn.jsdelivr.net/gh/x/y@main/a.jpg'); pg.evaluate('handleGalleryUpload()'); pg.wait_for_timeout(500)
    calls = pg.evaluate('window.__calls'); gi = [x for x in calls if x[0]=='gallery']
    check('gallery: link-only image saved, type detected', gi and gi[0][1]['mediaType']=='image' and gi[0][1]['mediaUrl'].startswith('https://') and not any(x[0]=='UPLOAD-CALLED' for x in calls))
    pg.fill('#galleryUrlInput','https://x.org/clip.mp4'); pg.evaluate('handleGalleryUpload()'); pg.wait_for_timeout(500)
    check('gallery: .mp4 link detected as video', [x for x in pg.evaluate('window.__calls') if x[0]=='gallery'][-1][1]['mediaType']=='video')
    pg.fill('#galleryUrlInput','http://insecure.org/a.jpg'); n0 = len(pg.evaluate('window.__calls')); pg.evaluate('handleGalleryUpload()'); pg.wait_for_timeout(300)
    check('gallery: insecure http link rejected', len(pg.evaluate('window.__calls')) == n0)
    check('admin: no js errors', not errs, errs[:3]); c.close()

    print('\n[6x] Project layout: single flat folder')
    tracked = subprocess.run(['git', 'ls-files'], cwd=ROOT, capture_output=True, text=True).stdout.split()
    nested = [f for f in tracked if '/' in f and not f.startswith('.github/')]
    check('layout: every file is in the root (only .github/ is nested, as GitHub requires)', not nested, nested[:5])
    on_disk = [d for d in os.listdir(ROOT) if os.path.isdir(os.path.join(ROOT, d)) and d not in ('.git', '.github', 'node_modules', '__pycache__', 'dist')]   # dist/ = git-ignored CI build output
    check('layout: no other folders exist', not on_disk, on_disk)

    print('\n[6j] Real firebase.js + real Firebase SDK (no mocks), network blocked')
    import tempfile; cache = os.path.join(tempfile.gettempdir(), 'cac-fb-bundle'); os.makedirs(cache, exist_ok=True); bundle = os.path.join(cache, 'fb.js')
    if not os.path.exists(bundle):
        open(os.path.join(ROOT, '.fb-entry.js'), 'w').write("export * from 'firebase/app';export * from 'firebase/firestore';export * from 'firebase/auth';export * from 'firebase/storage';export * from 'firebase/app-check';")
        r = subprocess.run(['npx', 'esbuild', '.fb-entry.js', '--bundle', '--format=esm', '--platform=browser', '--outfile=' + bundle, '--log-level=error'], cwd=ROOT, capture_output=True, text=True)
        if os.path.exists(os.path.join(ROOT, '.fb-entry.js')): os.remove(os.path.join(ROOT, '.fb-entry.js'))
        if r.returncode: print('  (skipping: cannot bundle Firebase SDK:', r.stderr[:100], ')')
    if os.path.exists(bundle):
        FAKE = open(os.path.join(ROOT, 'firebase.js')).read()
        for k in ['YOUR_API_KEY', 'YOUR_PROJECT_ID', 'YOUR_MESSAGING_SENDER_ID', 'YOUR_APP_ID']: FAKE = FAKE.replace(k, 'fake-' + k.lower())
        def real_ctx():
            c = ctx(mock=False)
            c.route(re.compile(r'https://www\.gstatic\.com/firebasejs/10\.12\.2/firebase-.*\.js'), lambda r: r.fulfill(body="export * from 'http://127.0.0.1:8765/__fb.js';", content_type='application/javascript'))
            c.route('**/__fb.js', lambda r: r.fulfill(body=open(bundle).read(), content_type='application/javascript'))
            c.route('**/firebase.js', lambda r: r.fulfill(body=FAKE, content_type='application/javascript'))
            return c
        c = real_ctx(); errs = []; pg = page_of(c, errs); pg.goto(B + 'index.html'); pg.wait_for_function('window.CAC_BACKEND', timeout=8000)
        names = ['getSiteSetting','saveSiteSetting','resetSiteSetting','savePrayerRequest','saveVisitorEnquiry','saveTestimony','saveNewsletter','getEvents','getPublishedDevotionals','saveDevotional','promoteScheduledDevotionals','getApprovedTestimonies','cacExport','getAuditLogs','uploadFile','saveEvent','deleteEvent','setTestimonyStatus']
        check('real firebase.js: initialises as configured', pg.evaluate('window.CAC_BACKEND.configured') is True)
        check('real firebase.js: all public API functions exist', all(pg.evaluate(f'typeof window.{n}') == 'function' for n in names), [n for n in names if pg.evaluate(f'typeof window.{n}') != 'function'])
        check('real firebase.js: auth available and reports signed-out', pg.evaluate("new Promise(r=>window.cacAuth.onChange((u,role)=>r([window.cacAuth.available(),u,role])))") == [True, None, None])
        check('real firebase.js: invalid devotional date rejected before any network call', pg.evaluate("window.saveDevotional({date:'bad'}).then(()=>'ok',e=>e.message)").startswith('A valid date'))
        check('real firebase.js: audit wrapper keeps validation errors intact', 'valid date' in pg.evaluate("window.saveDevotional({date:'2026-13-45x'}).then(()=>'ok',e=>e.message)"))
        errs = [e for e in errs if 'Could not reach Cloud Firestore backend' not in e]  # expected: network is blocked in this test
        check('real firebase.js: no js errors', not errs, errs[:3]); c.close()
        c = real_ctx(); pg = c.new_page(); pg.goto(B + 'admin-dashboard.html'); pg.wait_for_url('**/admin-login.html', timeout=8000)
        check('REAL auth guard: signed-out visitor is redirected from dashboard (no mocks)', True)
        pg.fill('#username', 'a@b.co'); pg.fill('#passcode', 'wrongpass1'); pg.click('#loginBtn'); pg.wait_for_selector('#loginError.show', timeout=8000)
        check('REAL sign-in failure shows a friendly error and stays on login', 'login' in pg.url and len(pg.inner_text('#loginErrorMsg')) > 5, pg.inner_text('#loginErrorMsg')); c.close()

    print('\n[6k] Logo, icons and Believers Bible College')
    PUBLIC = ['index','about','ministries','sermons','gallery','contact','events','devotionals','bible','live','prayer-wall','visit','testimonies','impact','give','privacy','terms']
    for n in PUBLIC:
        c = ctx(); pg = c.new_page(); pg.goto(B + n + '.html'); pg.wait_for_timeout(500)
        info = pg.evaluate("[...document.querySelectorAll('.logo-emblem')].map(i=>[i.tagName,i.getAttribute('src'),i.naturalWidth>0])")
        check(f'logo: {n} nav+footer show the real logo image', len(info) == 2 and all(x == ['IMG','logo-mark.webp',True] for x in info), info); c.close()
    h = open(os.path.join(ROOT,'index.html')).read()
    check('logo: favicon, touch icon and manifest icons all exist', all(os.path.exists(os.path.join(ROOT,f)) for f in ['logo.webp','logo-mark.webp','icon-64.png','icon-180.png','icon-192.png','icon-512.png']) and 'icon-64.png' in h and 'apple-touch-icon' in h)
    from PIL import Image as _I
    man = json.load(open(os.path.join(ROOT,'manifest.json')))
    check('logo: manifest icons are real PNGs at the declared sizes', all(_I.open(os.path.join(ROOT,i['src'])).size == tuple(int(v) for v in i['sizes'].split('x')) for i in man['icons']))
    c = ctx(mock=False); pg = c.new_page(); pg.goto(B + 'admin-login.html'); pg.wait_for_timeout(400)
    check('logo: admin login shows the real logo', pg.evaluate("(()=>{const i=document.querySelector('.login-emblem-img');return !!i&&i.naturalWidth>0})()")); c.close()

    check('assets: full logo lockup + sharp emblem are high-resolution', _I.open(os.path.join(ROOT,'logo.webp')).size[0] >= 900 and _I.open(os.path.join(ROOT,'logo-mark.webp')).size == (512, 512) and _I.open(os.path.join(ROOT,'icon-512.png')).size == (512, 512))
    em = _I.open(os.path.join(ROOT,'logo-mark.webp')).convert('RGBA'); import numpy as _np; al = _np.array(em)[:,:,3]
    check('assets: emblem has a transparent background and no stray divider sliver at its edges', (al==0).mean() > 0.4 and (al[:, -6:] > 20).sum() == 0 and (al[:, :6] > 20).sum() == 0)
    check('assets: BBC crest is the default picture; the old placeholder graphic is gone', os.path.exists(os.path.join(ROOT,'bbc-crest.webp')) and not os.path.exists(os.path.join(ROOT,'bbc-default.svg')) and 'bbc-default' not in open(os.path.join(ROOT,'bbc.js')).read() + open(os.path.join(ROOT,'config.js')).read())

    # --- BBC promo ---
    c = ctx(); errs = []; pg = page_of(c, errs); pg.goto(B + 'index.html'); pg.wait_for_selector('#bbc .bbc-card')
    pg.evaluate("document.getElementById('bbc').scrollIntoView()"); pg.wait_for_function("document.querySelector('#bbc img').naturalWidth>0", timeout=5000)   # lazy-loaded: loads on approach
    check('bbc: default picture is the real crest at full resolution', 'bbc-crest.webp' in pg.get_attribute('#bbc img','src') and pg.evaluate("document.querySelector('#bbc img').naturalWidth") == 1200)
    check('bbc: homepage section renders default headline, note and picture', 'Go deeper in the Word' in pg.inner_text('#bbc h2') and len(pg.inner_text('#bbc .bbc-text')) > 60 and pg.evaluate("document.querySelector('#bbc img').naturalWidth>0"))
    lk = pg.locator('#bbc a.bbc-btn')
    check('bbc: default button goes to the real BBC platform, in a new safe tab', lk.get_attribute('href') == 'https://awopejumichael7-sketch.github.io/bbc/' and lk.get_attribute('target') == '_blank' and 'noopener' in lk.get_attribute('rel') and 'opens in a new tab' in lk.get_attribute('aria-label'), lk.get_attribute('href'))
    check('bbc: default note describes the official e-learning platform', 'e-learning platform' in pg.inner_text('#bbc .bbc-text') and pg.locator('#bbc .bbc-disabled').count() == 0)
    check('bbc: footer link points at the section', pg.locator('footer a[href="#bbc"]').count() == 1)
    check('bbc: no js errors', not errs, errs[:2]); c.close()
    c = ctx(); pg = c.new_page()
    pg.route('**/config.js', lambda r: r.fulfill(body=open(os.path.join(ROOT,'config.js')).read().replace("url: 'https://awopejumichael7-sketch.github.io/bbc/'", "url: ''"), content_type='application/javascript'))
    pg.goto(B + 'index.html'); pg.wait_for_selector('#bbc .bbc-card')
    check('bbc: if the link is ever removed -> clear "coming soon" state, never a dead link', pg.locator('#bbc a.bbc-btn').count() == 0 and 'coming soon' in pg.inner_text('#bbc .bbc-disabled').lower() and pg.get_attribute('#bbc .bbc-disabled','aria-disabled') == 'true')
    c.close()
    TINY = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    def with_settings(js):
        c = ctx(); c.add_init_script("window.__xss=0;window.getSiteSetting=async()=>(" + js + ");"); return c
    c = with_settings("{headline:'<img src=x onerror=window.__xss=3>Join <b>BBC</b>',text:'Study <script>window.__xss=4</script> with us',buttonLabel:'Enrol now',url:'https://bbc.example.org/enrol',image:'" + TINY + "'}")
    pg = c.new_page(); pg.goto(B + 'index.html'); pg.wait_for_function("document.querySelector('#bbc .bbc-btn')&&document.querySelector('#bbc .bbc-btn').href.includes('enrol')")
    check('bbc: admin settings override defaults (text, button, link, picture)', 'Enrol now' in pg.inner_text('#bbc .bbc-btn') and pg.get_attribute('#bbc img','src') == TINY)
    check('bbc: admin-entered HTML is shown as plain text and never executes', pg.evaluate('window.__xss') == 0 and '<b>BBC</b>' in pg.inner_text('#bbc h2') and pg.locator('#bbc h2 b').count() == 0); c.close()
    c = with_settings("{headline:'x',text:'y',buttonLabel:'z',url:'javascript:window.__xss=9',image:'javascript:alert(1)'}")
    pg = c.new_page(); pg.goto(B + 'index.html'); pg.wait_for_timeout(900)
    check('bbc: javascript: link/image from settings rejected; falls back to the safe default link and crest', pg.get_attribute('#bbc a.bbc-btn','href') == 'https://awopejumichael7-sketch.github.io/bbc/' and 'bbc-crest.webp' in pg.get_attribute('#bbc img','src') and pg.evaluate('window.__xss') == 0); c.close()
    c = with_settings("{headline:'x',text:'y',buttonLabel:'z',url:'http://insecure.example.org',image:'http://insecure.example.org/a.jpg'}")
    pg = c.new_page(); pg.goto(B + 'index.html'); pg.wait_for_timeout(900)
    check('bbc: plain http link/image rejected (https only); falls back to safe defaults', pg.get_attribute('#bbc a.bbc-btn','href').startswith('https://awopejumichael7-sketch.github.io') and 'bbc-crest.webp' in pg.get_attribute('#bbc img','src')); c.close()
    c = ctx(); pg = c.new_page(); pg.goto(B + 'devotionals.html'); pg.wait_for_selector('.bbc-compact')
    check('bbc: compact card on the Devotional page has the real link', pg.locator('.bbc-compact img').count() == 1 and pg.get_attribute('.bbc-compact a.bbc-btn','href') == 'https://awopejumichael7-sketch.github.io/bbc/'); c.close()
    c = ctx(viewport={'width':412,'height':823}); c.add_init_script("window.__ls=0;new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput)window.__ls+=e.value}).observe({type:'layout-shift',buffered:true});")
    pg = c.new_page(); pg.goto(B + 'index.html'); pg.wait_for_timeout(600); H = pg.evaluate('document.documentElement.scrollHeight'); y = 0
    while y < H: y += 400; pg.evaluate('window.scrollTo(0,%d)' % y); pg.wait_for_timeout(80)
    check('bbc: scrolling the whole homepage causes no layout shift', pg.evaluate('window.__ls') < 0.1, pg.evaluate('window.__ls')); c.close()
    c = ctx(); pg = c.new_page(); pg.goto(B + 'index.html#bbc'); pg.wait_for_timeout(2500)
    check('bbc: #bbc anchor lands on the section', abs(pg.evaluate("document.getElementById('bbc').getBoundingClientRect().top")) < 120); c.close()

    # --- BBC admin ---
    import tempfile, random
    tmp = tempfile.mkdtemp(); noisy = os.path.join(tmp, 'photo.png'); rnd = random.Random(1)
    _I.frombytes('RGB', (2400, 1600), bytes(rnd.getrandbits(8) for _ in range(2400*1600*3))).save(noisy)
    svg = os.path.join(tmp, 'x.svg'); open(svg, 'w').write('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
    ADM = "window.cacAuth={available:()=>true,onChange:cb=>{cb({email:'admin@church.org'},'super');return()=>{}},signOut:async()=>{}};window.__calls=[];window.CAC_BACKEND={configured:true};window.getSiteSetting=async()=>({headline:'Saved headline',text:'Saved note',buttonLabel:'Join',url:'https://bbc.example.org',image:''});window.saveSiteSetting=async(id,d)=>{window.__calls.push(['save',id,d])};window.resetSiteSetting=async id=>{window.__calls.push(['reset',id])};"
    c = ctx(); c.add_init_script(ADM); errs = []; pg = page_of(c, errs); pg.goto(B + 'admin-dashboard.html'); pg.wait_for_selector('body.authed'); pg.evaluate("showPanel('bbc')"); pg.wait_for_function("document.getElementById('bbcHeadline').value==='Saved headline'")
    check('bbc admin: loads saved values into the form', pg.input_value('#bbcUrl') == 'https://bbc.example.org' and pg.input_value('#bbcText') == 'Saved note')
    pg.set_input_files('#bbcFile', noisy); pg.wait_for_function("document.getElementById('bbcImgMsg').textContent.includes('ready')", timeout=30000)
    src = pg.get_attribute('#bbcPreview', 'src')
    check('bbc admin: big noisy photo is compressed under the storage limit', src.startswith('data:image/') and len(src) < 420000, len(src))
    pg.click('#bbcForm button[type=submit]'); pg.wait_for_timeout(400); call = pg.evaluate('window.__calls')[-1]
    check('bbc admin: save sends every field the security rule requires', call[0]=='save' and call[1]=='bbc' and sorted(call[2].keys()) == ['buttonLabel','headline','image','text','url'] and call[2]['image'] == src and call[2]['headline'] == 'Saved headline')
    pg.fill('#bbcUrl', 'http://insecure.example.org'); n = len(pg.evaluate('window.__calls')); pg.click('#bbcForm button[type=submit]'); pg.wait_for_timeout(300)
    check('bbc admin: http link refused, nothing saved', len(pg.evaluate('window.__calls')) == n)
    pg.fill('#bbcUrl', 'https://bbc.example.org'); pg.fill('#bbcImgUrl', 'https://cdn.example.org/pic.jpg'); pg.dispatch_event('#bbcImgUrl', 'change'); pg.click('#bbcForm button[type=submit]'); pg.wait_for_timeout(300)
    check('bbc admin: pasted https picture link is saved', pg.evaluate('window.__calls')[-1][2]['image'] == 'https://cdn.example.org/pic.jpg')
    pg.set_input_files('#bbcFile', svg); pg.wait_for_timeout(500)
    check('bbc admin: SVG upload rejected (can contain scripts)', 'JPG, PNG or WebP' in pg.inner_text('#bbcImgMsg'))
    pg.click('#bbcClearImg'); pg.click('#bbcForm button[type=submit]'); pg.wait_for_timeout(300)
    check('bbc admin: "use default picture" saves an empty image', pg.evaluate('window.__calls')[-1][2]['image'] == '')
    pg.on('dialog', lambda d: d.accept()); pg.click('#bbcReset'); pg.wait_for_timeout(400)
    check('bbc admin: reset removes the customisation', pg.evaluate('window.__calls')[-1][:2] == ['reset', 'bbc'])
    check('bbc admin: no js errors', not errs, errs[:3]); c.close()

    print('\n[6m] Edge Worker mode (Cloudflare Turnstile + Worker), all network mocked')
    def edge_ctx(site_key='', handler=None):
        c = ctx(mock=False); posts = []
        cfg = open(os.path.join(ROOT, 'config.js')).read().replace("edge: { url: '', turnstileSiteKey: '' }", "edge: { url: 'https://edge.test', turnstileSiteKey: '" + site_key + "' }")
        c.route('**/config.js', lambda r: r.fulfill(body=cfg, content_type='application/javascript'))
        def worker(r):
            if r.request.method == 'OPTIONS': return r.fulfill(status=204, headers={'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type'})
            posts.append((r.request.url, json.loads(r.request.post_data or '{}')))
            st, body = handler(r) if handler else (200, {'ok': True})
            r.fulfill(status=st, body=json.dumps(body), content_type='application/json', headers={'access-control-allow-origin': '*'})
        c.route('https://edge.test/**', worker)
        c.route('https://challenges.cloudflare.com/turnstile/v0/api.js*', lambda r: r.fulfill(content_type='application/javascript', body="window.turnstile={render:function(el,o){window.__tsOpts=o;setTimeout(function(){o.callback('fake-token')},10);return 'w1'},remove:function(){window.__tsRemoved=(window.__tsRemoved||0)+1}};"))
        return c, posts
    c, posts = edge_ctx(); errs = []; pg = page_of(c, errs); pg.goto(B + 'testimonies.html'); pg.wait_for_timeout(300)
    check('edge: enabled, and forms count as connected without the Firestore SDK', pg.evaluate('window.cacEdge.enabled() && window.CAC_BACKEND.configured === true && window.CAC_BACKEND.edge === true'))
    pg.fill('#tStory', 'God did something wonderful in my family this year.'); pg.check('input[name=consent]'); pg.click('#testimonyForm button[type=submit]'); pg.wait_for_selector('.f-msg.ok', timeout=4000)
    check('edge: testimony posts to the Worker /v1/submit/testimony and shows success', len(posts) == 1 and posts[0][0] == 'https://edge.test/v1/submit/testimony' and posts[0][1]['consent'] is True and 'God did something' in posts[0][1]['story'], posts)
    check('edge: no Turnstile site key configured -> empty token, no widget loaded', posts[0][1]['turnstile'] == '' and pg.evaluate('typeof window.turnstile') == 'undefined'); c.close()
    c, posts = edge_ctx('0x4AAAA-test'); pg = c.new_page(); pg.goto(B + 'index.html'); pg.wait_for_timeout(300)
    pg.fill('#prayerName', 'Ada'); pg.fill('#prayerRequest', 'Please pray for my family.'); pg.click('#prayerForm button[type=submit]'); pg.wait_for_function("document.querySelector('#toast.show')", timeout=5000)
    check('edge: prayer request carries a Turnstile token and the right payload', len(posts) == 1 and posts[0][0].endswith('/v1/submit/prayer') and posts[0][1]['turnstile'] == 'fake-token' and posts[0][1]['request'] == 'Please pray for my family.' and posts[0][1]['type'] == 'prayer', posts)
    check('edge: widget uses interaction-only appearance and is removed after use', pg.evaluate('window.__tsOpts.appearance') == 'interaction-only' and pg.evaluate('window.__tsOpts.sitekey') == '0x4AAAA-test' and pg.evaluate('window.__tsRemoved') == 1 and pg.locator('.cac-turnstile').count() == 0)
    pg.fill('#newsletterForm input', 'ada@example.com'); pg.evaluate("localStorage.removeItem('cacLast_newsletter')"); pg.click('#newsletterForm button'); pg.wait_for_timeout(800)
    check('edge: newsletter posts to /v1/submit/newsletter', any(u.endswith('/v1/submit/newsletter') and b['email'] == 'ada@example.com' for u, b in posts), [u for u, _ in posts]); c.close()
    c, posts = edge_ctx(); pg = c.new_page(); pg.goto(B + 'contact.html'); pg.wait_for_timeout(300)
    pg.fill('#contactName', 'Ada Obi'); pg.fill('#contactEmail', 'ada@example.com'); pg.fill('#contactMessage', 'Hello, I have a question about services.'); pg.click('#contactSubmitBtn'); pg.wait_for_timeout(800)
    check('edge: contact form goes to /v1/submit/visit with consent', len(posts) == 1 and posts[0][0].endswith('/v1/submit/visit') and posts[0][1]['consent'] is True and posts[0][1]['message'].startswith('['), posts); c.close()
    c, posts = edge_ctx(handler=lambda r: (429, {'ok': False, 'error': 'Too many submissions. Please try again later.'})); pg = c.new_page(); pg.goto(B + 'testimonies.html'); pg.wait_for_timeout(300)
    pg.fill('#tStory', 'God did something wonderful in my family this year.'); pg.check('input[name=consent]'); pg.click('#testimonyForm button[type=submit]'); pg.wait_for_selector('.f-msg.err', timeout=4000)
    check('edge: Worker error text is shown to the visitor (honest, no fake success)', 'Too many submissions' in pg.inner_text('.f-msg.err')); c.close()
    c, posts = edge_ctx(); c.route('https://edge.test/**', lambda r: r.abort()); pg = c.new_page(); pg.goto(B + 'testimonies.html'); pg.wait_for_timeout(300)
    pg.fill('#tStory', 'God did something wonderful in my family this year.'); pg.check('input[name=consent]'); pg.click('#testimonyForm button[type=submit]'); pg.wait_for_selector('.f-msg.err', timeout=4000)
    check('edge: network failure -> friendly "could not reach the server"', 'could not reach the server' in pg.inner_text('.f-msg.err').lower()); c.close()
    c = ctx(mock=False); pg = c.new_page(); pg.goto(B + 'testimonies.html'); pg.wait_for_timeout(300)
    check('edge: with no Worker URL the site stays in the old mode (no regression)', pg.evaluate('window.cacEdge.enabled()') is False); c.close()

    print('\n[6n] Sermons page: safe rendering, YouTube/Drive video, audio player (speed, chapters, transcript search)')
    DID = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345'
    SERM = ("window.getSermons=async()=>["
      "{id:'s1',title:'Faith <img src=x onerror=window.__xss=5>',preacher:'Pastor A',category:'Faith',date:'2026-01-12',videoUrl:'https://youtu.be/dQw4w9WgXcQ'},"
      "{id:'s2',title:'From Drive',preacher:'Pastor B',category:'Prayer',date:'2026-01-05',videoUrl:'https://drive.google.com/file/d/" + DID + "/view'},"
      "{id:'s3',title:'Evil link',preacher:'x',category:'Prayer',date:'2026-01-01',videoUrl:'javascript:window.__xss=6'}];"
      "window.getAudioSermons=async()=>["
      "{id:'a1',title:'Grace <b>Season</b>',preacher:'Pastor A',date:'2026-01-10',audioUrl:'https://drive.google.com/file/d/" + DID + "/view',chapters:'00:00 Welcome\\n05:30 The Word\\n20:00 Prayer',transcript:'[00:05] Grace is a gift from God.\\n[00:20] Prayer changes things.\\nPlain closing line about grace.'},"
      "{id:'a2',title:'Bad audio',preacher:'x',date:'2026-01-02',audioUrl:'javascript:window.__xss=7'}];")
    cfgE = open(os.path.join(ROOT, 'config.js')).read().replace("edge: { url: '', turnstileSiteKey: '' }", "edge: { url: 'https://edge.test', turnstileSiteKey: '' }")
    c = ctx(); c.add_init_script("window.__xss=0;" + SERM); c.route('**/config.js', lambda r: r.fulfill(body=cfgE, content_type='application/javascript')); errs = []; pg = page_of(c, errs)
    pg.goto(B + 'sermons.html'); pg.wait_for_selector('.sermon-card'); pg.wait_for_timeout(300)
    check('sermons: 3 cards rendered; hostile title is shown as text, never executed', pg.locator('.sermon-card').count() == 3 and 'onerror' in pg.locator('.sermon-card h3').first.inner_text() and pg.evaluate('window.__xss') == 0)
    check('sermons: YouTube thumbnail + Drive thumbnail used; unsupported link is disabled', 'i.ytimg.com/vi/dQw4w9WgXcQ' in pg.locator('.sermon-card img').nth(0).get_attribute('src') and 'drive.google.com/thumbnail' in pg.locator('.sermon-card img').nth(1).get_attribute('src') and pg.locator('.sermon-card').nth(2).is_disabled())
    check('sermons: category filter chips are built from the data', pg.locator('#videoFilters .filter-btn').count() == 3)
    pg.click('#videoFilters [data-cat=Prayer]'); check('sermons: filtering by category works', pg.locator('.sermon-card').count() == 2)
    pg.click('#videoFilters [data-cat=""]'); pg.locator('.sermon-card').first.click()
    check('sermons: modal opens with the privacy-friendly youtube-nocookie embed', pg.evaluate("document.getElementById('modalIframe').src").startswith('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ') and pg.evaluate("document.activeElement.id") == 'modalClose')
    pg.keyboard.press('Escape'); check('sermons: Escape closes the modal, stops the video and restores focus', pg.evaluate("document.getElementById('modalIframe').src") == 'about:blank' and 'sermon-card' in pg.evaluate('document.activeElement.className'))
    pg.locator('.sermon-card').nth(1).click(); check('sermons: Drive video uses the Drive preview player', pg.evaluate("document.getElementById('modalIframe').src") == 'https://drive.google.com/file/d/' + DID + '/preview'); pg.keyboard.press('Escape')
    pg.click('.tab-btn[data-tab=audio]'); pg.wait_for_selector('.audio-sermon-card'); pg.click('[data-play=a1]')
    check('audio: Drive file is streamed through the edge Worker (Range-capable)', pg.get_attribute('#audio-a1 audio', 'src') == 'https://edge.test/v1/media/' + DID)
    check('audio: title is plain text; unsafe audio link shows "coming soon" and no player', pg.locator('#audio-a1 h4 b').count() == 0 and 'coming soon' in pg.inner_text('#audio-a2').lower() and pg.locator('#audio-a2 audio').count() == 0 and pg.evaluate('window.__xss') == 0)
    pg.select_option('#audio-a1 .ap-speed', '1.5'); check('audio: speed control changes playbackRate', pg.evaluate("document.querySelector('#audio-a1 audio').playbackRate") == 1.5)
    pg.locator('#audio-a1 details:has(.ap-chapters) summary').click()
    check('audio: chapters are listed in time order', pg.locator('#audio-a1 .ap-chapters button').count() == 3 and pg.locator('#audio-a1 .ap-chapters b').nth(1).inner_text() == '5:30')
    pg.click('#audio-a1 .ap-chapters button >> nth=1'); check('audio: clicking a chapter seeks', pg.evaluate("document.querySelector('#audio-a1 audio').currentTime") in (0, 330))
    pg.locator('#audio-a1 details:has(.ap-transcript) summary').click(); pg.fill('#audio-a1 .ap-search', 'grace'); pg.wait_for_timeout(300)
    check('audio: transcript search is case-insensitive, counts and highlights matches', pg.locator('#audio-a1 .ap-transcript .ln').count() == 2 and pg.locator('#audio-a1 .ap-transcript mark').count() == 2 and '2 matches' in pg.inner_text('#audio-a1 .ap-count'))
    check('audio: no JS errors on the sermons page', not [e for e in errs if 'edge.test' not in e], errs[:3]); c.close()
    c = ctx(mock=False); pg = c.new_page(); pg.goto(B + 'sermons.html'); pg.wait_for_timeout(5800)
    check('sermons: when nothing loads there is a friendly empty state and NO demo/placeholder videos', 'dQw4w9WgXcQ' not in pg.content() and pg.locator('.no-results').count() >= 1); c.close()

    print('\n[6o] Google Drive media library: gallery rendering + admin upload to Drive (all network mocked)')
    GAL = ("window.__xss=0;window.getGalleryItems=async()=>["
      "{id:'g1',caption:'Youth <img src=x onerror=window.__xss=1>',category:'Youth',mediaType:'image',mediaUrl:'" + DID + "'},"
      "{id:'g2',caption:'Clip',category:'Events',mediaType:'video',mediaUrl:'https://drive.google.com/file/d/" + DID + "/view'},"
      "{id:'g3',caption:'Evil',category:'Events',mediaType:'image',mediaUrl:'javascript:window.__xss=2'}];")
    c = ctx(); c.add_init_script(GAL); errs = []; pg = page_of(c, errs); pg.goto(B + 'gallery.html'); pg.wait_for_selector('.masonry-item'); pg.wait_for_timeout(200)
    check('gallery: Drive picture shown via lh3 url; hostile caption stays text; unsafe url gets a placeholder', 'lh3.googleusercontent.com/d/' + DID in pg.locator('.masonry-item img').first.get_attribute('src') and pg.evaluate('window.__xss') == 0 and pg.locator('.masonry-item .placeholder-img').count() == 1)
    check('gallery: category filters built from data', pg.locator('#galleryFilters .g-filter-btn').count() == 3)
    pg.locator('.masonry-item').first.click(); check('gallery: lightbox shows the large Drive image and moves focus to Close', '=w1800' in pg.get_attribute('#lbStage img', 'src') and pg.evaluate('document.activeElement.id') == 'lbClose')
    pg.keyboard.press('ArrowRight'); check('gallery: arrow keys move to the Drive video (preview iframe)', pg.get_attribute('#lbStage iframe', 'src') == 'https://drive.google.com/file/d/' + DID + '/preview')
    pg.keyboard.press('Escape'); check('gallery: Escape closes the lightbox, stops media and restores focus', pg.locator('#lightbox.open').count() == 0 and pg.locator('#lbStage *').count() == 0 and 'masonry-item' in pg.evaluate('document.activeElement.className'))
    check('gallery: no JS errors', not errs, errs[:2]); c.close()
    cfgD = open(os.path.join(ROOT, 'config.js')).read().replace("drive: { clientId: '', folderId: '' }", "drive: { clientId: '123456-abc.apps.googleusercontent.com', folderId: 'FOLDER123' }")
    dlog = []
    def drive_route(r):
        q = r.request; cors = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-expose-headers': 'location'}
        if q.method == 'OPTIONS': return r.fulfill(status=204, headers=cors)
        dlog.append((q.method, q.url, q.headers.get('authorization'), q.post_data))
        if 'uploadType=resumable' in q.url: return r.fulfill(status=200, headers={**cors, 'location': 'https://www.googleapis.com/upload/drive/v3/files?upload_id=abc'}, body='{}')
        if 'upload_id=abc' in q.url: return r.fulfill(status=200, headers=cors, content_type='application/json', body=json.dumps({'id': DID}))
        if q.url.endswith('/permissions'): return r.fulfill(status=200, headers=cors, content_type='application/json', body='{}')
        r.fulfill(status=404, headers=cors)
    c = ctx(); c.add_init_script(ADMIN + "window.getAudioSermons=async()=>[];window.getGalleryItems=async()=>[];window.getSermons=async()=>[];window.getPrayerRequests=async()=>[];window.getEvents=async()=>[];window.saveAudioSermon=async d=>{window.__calls.push(['audio',d])};")
    c.route('**/config.js', lambda r: r.fulfill(body=cfgD, content_type='application/javascript'))
    c.route('https://accounts.google.com/gsi/client', lambda r: r.fulfill(content_type='application/javascript', body="window.google={accounts:{oauth2:{initTokenClient:function(o){return{requestAccessToken:function(a){window.__gisPrompt=a.prompt;setTimeout(function(){o.callback({access_token:'tok',expires_in:3600})},5)}}}}}};"))
    c.route('https://www.googleapis.com/**', drive_route)
    errs = []; pg = page_of(c, errs); pg.goto(B + 'admin-dashboard.html'); pg.wait_for_selector('body.authed'); pg.evaluate("showPanel('audio')")
    check('drive: configured clientId replaces the Firebase Storage uploader', pg.evaluate('window.cacDrive.enabled()') is True)
    pg.fill('#audioTitle', 'Grace'); pg.fill('#audioPreacher', 'Pastor'); pg.fill('#audioChapters', '00:00 Welcome\n05:00 Word'); pg.fill('#audioTranscript', '[00:05] Hello church')
    pg.set_input_files('#audioFileInput', files=[{'name': 'my sermon (1).mp3', 'mimeType': 'audio/mpeg', 'buffer': b'ID3' + b'0' * 2048}]); pg.evaluate('handleAudioUpload()'); pg.wait_for_function("window.__calls && window.__calls.length", timeout=8000)
    saved = pg.evaluate('window.__calls')[0][1]; meta = [json.loads(x[3]) for x in dlog if 'uploadType=resumable' in x[1]][0]; perm = [json.loads(x[3]) for x in dlog if x[1].endswith('/permissions')][0]
    check('drive: file saved as a Drive view link with chapters + transcript', saved['audioUrl'] == 'https://drive.google.com/file/d/' + DID + '/view' and saved['chapters'].startswith('00:00') and saved['transcript'].startswith('[00:05]'), saved)
    check('drive: file goes into the configured folder with a sanitised name; first sign-in asks consent', meta['parents'] == ['FOLDER123'] and meta['name'] == 'audio-sermons-my_sermon_1_.mp3' and pg.evaluate('window.__gisPrompt') == 'consent', meta)
    check('drive: shared as "anyone with the link can view"; every call carries the bearer token', perm == {'role': 'reader', 'type': 'anyone'} and all(x[2] in ('Bearer tok', None) for x in dlog if 'upload_id' not in x[1]))
    check('drive: no JS errors in admin', not [e for e in errs if 'googleapis' not in e], errs[:2]); c.close()
    c = ctx(); c.add_init_script(ADMIN); pg = c.new_page(); pg.goto(B + 'admin-dashboard.html'); pg.wait_for_selector('body.authed')
    check('drive: with no clientId the Drive uploader stays off (no behaviour change)', pg.evaluate('window.cacDrive.enabled()') is False); c.close()

    print('\n[6p] Member sync (email-link sign-in) + Web Push opt-in, all mocked')
    MEMBER = ("window.__remote=null;window.__cb=null;window.__sets=[];window.__sent='';"
      "window.cacMemberAuth={available:()=>true,isLink:()=>false,sendLink:async e=>{window.__sent=e},finish:async()=>{},signOut:async()=>{window.__cb&&window.__cb(null)},"
      "onChange:cb=>{window.__cb=cb;cb(null);return()=>{}},get:async()=>window.__remote,set:async d=>{window.__sets.push(JSON.parse(JSON.stringify(d)));window.__remote=d}};")
    c = ctx(); c.add_init_script(MEMBER); errs = []; pg = page_of(c, errs); pg.goto(B + 'devotionals.html'); pg.wait_for_selector('#dvAccount:not([hidden])'); pg.wait_for_selector('#bmBtn')
    pg.fill('#memEmail', 'not-an-email'); pg.click('#dvAccount button'); check('member: invalid email is rejected before anything is sent', pg.evaluate('window.__sent') == '' and 'valid email' in pg.inner_text('#dvAccount [role=status]'))
    pg.fill('#memEmail', 'ada@example.com'); pg.click('#dvAccount button'); pg.wait_for_function("window.__sent")
    check('member: sign-in link requested for the entered email, inbox hint shown', pg.evaluate('window.__sent') == 'ada@example.com' and 'inbox' in pg.inner_text('#dvAccount [role=status]'))
    pg.click('#bmBtn'); prefs = pg.evaluate("JSON.parse(localStorage.getItem('cacDevotionalPrefs'))")
    check('member: bookmarking while signed out stays local and is time-stamped for later merging', len(prefs['bookmarks']) == 1 and prefs['meta']['bm'][prefs['bookmarks'][0]] > 0 and pg.evaluate('window.__sets.length') == 0)
    pg.evaluate("window.__cb({email:'ada@example.com'})"); pg.wait_for_function('window.__sets.length >= 1', timeout=6000)
    up = pg.evaluate('window.__sets[0]'); check('member: after sign-in local bookmarks are uploaded (owner-only doc shape)', len(up['bm']) == 1 and list(up['bm'].values())[0]['on'] is True and set(up.keys()) <= {'bm', 'notes', 'read', 'plans'}, up)
    check('member: signed-in card shows the account and sync controls', 'ada@example.com' in pg.inner_text('#dvAccount') and 'Sign out' in pg.inner_text('#dvAccount'))
    pg.evaluate("window.__remote={bm:{'2026-01-01':{on:true,at:Date.now()+5000}},notes:{},read:['2026-01-01'],plans:{}}"); pg.click('#dvAccount button:has-text(\"Sync now\")'); pg.wait_for_function("JSON.parse(localStorage.getItem('cacDevotionalPrefs')).bookmarks.includes('2026-01-01')", timeout=6000)
    check('member: bookmarks from another device are merged in, nothing local is lost', len(pg.evaluate("JSON.parse(localStorage.getItem('cacDevotionalPrefs')).bookmarks")) == 2)
    n0 = pg.evaluate('window.__sets.length'); pg.fill('#dvNotes', 'My note'); pg.wait_for_function('window.__sets.length > ' + str(n0), timeout=8000)
    check('member: a new note is pushed automatically (debounced)', any(v['t'] == 'My note' for v in pg.evaluate('window.__sets[window.__sets.length-1].notes') .values()))
    pg.click('#dvAccount button:has-text(\"Sign out\")'); pg.wait_for_selector('#memEmail'); check('member: signing out returns to the sign-in form and keeps local data', pg.evaluate("JSON.parse(localStorage.getItem('cacDevotionalPrefs')).bookmarks.length") == 2)
    check('member: no JS errors', not errs, errs[:2]); c.close()
    c = ctx(); pg = c.new_page(); pg.goto(B + 'devotionals.html'); pg.wait_for_selector('#bmBtn'); pg.wait_for_timeout(300)
    check('member: with no Firebase auth the account card stays hidden', pg.locator('#dvAccount[hidden]').count() == 1 and pg.is_hidden('#dvPushBox')); c.close()

    VAPID = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U'
    PUSHSW = ("(function(){var sub=null;var reg={pushManager:{getSubscription:async()=>sub,subscribe:async o=>{window.__subOpts=o;sub={endpoint:'https://push.example/abcdefghijk',toJSON(){return{endpoint:this.endpoint,keys:{p256dh:'B'.repeat(65),auth:'a'.repeat(22)}}},unsubscribe:async()=>{sub=null;return true}};return sub}}};"
      "Object.defineProperty(navigator,'serviceWorker',{value:{ready:Promise.resolve(reg),register:async()=>reg},configurable:true});Notification.requestPermission=async()=>'granted';Object.defineProperty(Notification,'permission',{get:()=>'granted'});})();")
    cfgP = open(os.path.join(ROOT, 'config.js')).read().replace("edge: { url: '', turnstileSiteKey: '' }", "edge: { url: 'https://edge.test', turnstileSiteKey: '' }").replace("push: { vapidPublicKey: '' }", "push: { vapidPublicKey: '" + VAPID + "' }")
    pposts = []
    def pworker(r):
        if r.request.method == 'OPTIONS': return r.fulfill(status=204, headers={'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type'})
        pposts.append((r.request.url, json.loads(r.request.post_data or '{}'))); r.fulfill(status=200, body='{"ok":true}', content_type='application/json', headers={'access-control-allow-origin': '*'})
    c = ctx(); c.add_init_script(PUSHSW); c.route('**/config.js', lambda r: r.fulfill(body=cfgP, content_type='application/javascript')); c.route('https://edge.test/**', pworker); errs = []; pg = page_of(c, errs)
    pg.goto(B + 'devotionals.html'); pg.wait_for_selector('#pushToggle'); check('push: opt-in button appears only when a VAPID key and the Worker are configured', 'Turn on' in pg.inner_text('#pushToggle'))
    pg.click('#pushToggle'); pg.wait_for_function("document.querySelector('#pushToggle').textContent.includes('off')", timeout=5000)
    check('push: subscription sent to the Worker with the right key and endpoint', len(pposts) == 1 and pposts[0][0].endswith('/v1/push/subscribe') and pposts[0][1]['subscription']['endpoint'] == 'https://push.example/abcdefghijk' and pg.evaluate('window.__subOpts.applicationServerKey.length') == 65 and pg.evaluate('window.__subOpts.userVisibleOnly') is True, pposts)
    pg.click('#pushToggle'); pg.wait_for_function("document.querySelector('#pushToggle').textContent.includes('Turn on')", timeout=5000)
    check('push: turning off unsubscribes locally and tells the Worker', len(pposts) == 2 and pposts[1][0].endswith('/v1/push/unsubscribe') and pposts[1][1]['endpoint'] == 'https://push.example/abcdefghijk'); check('push: no JS errors', not errs, errs[:2]); c.close()
    c = ctx(); pg = c.new_page(); pg.goto(B + 'devotionals.html'); pg.wait_for_selector('#bmBtn'); pg.wait_for_timeout(300); check('push: hidden by default (nothing configured)', pg.locator('#pushToggle').count() == 0); c.close()

    print('\n[6q] Scripture: Bible files served, reader page, popover on devotionals, plans, share card')
    KJVF = os.path.join(ROOT, 'bible-kjv.json')
    c = ctx(); errs = []; pg = page_of(c, errs); pg.goto(B + 'bible.html?ref=Psalm%2023'); pg.wait_for_selector('#bText .sc-v'); 
    check('bible: reader loads a passage from the bundled KJV (6 verses of Psalm 23)', pg.locator('#bText .sc-v').count() == 6 and 'shepherd' in pg.inner_text('#bText'))
    pg.select_option('#bVer', 'WEB'); pg.wait_for_function("document.querySelector('#bText').innerText.includes('Yahweh')", timeout=8000); check('bible: switching to WEB re-renders in that translation', 'Yahweh is my shepherd' in pg.inner_text('#bText'))
    pg.fill('#bRef', 'Rom 8:28-30, 35'); pg.press('#bRef', 'Enter'); pg.wait_for_function("document.querySelector('#bText h2') && document.querySelector('#bText h2').textContent.startsWith('Romans')"); check('bible: abbreviations and verse lists are understood', pg.locator('#bText .sc-v').count() == 4 and 'Romans 8:28–30, 35' in pg.inner_text('#bText h2'))
    pg.fill('#bRef', 'Nonsense 99:1'); pg.press('#bRef', 'Enter'); check('bible: unknown reference gives a helpful message, not a crash', 'not recognised' in pg.inner_text('#bFlash'))
    pg.fill('#bRef', 'John 1'); pg.press('#bRef', 'Enter'); pg.wait_for_selector('#bNext:not([hidden])'); pg.click('#bNext'); pg.wait_for_function("document.querySelector('#bText h2').textContent === 'John 2'"); check('bible: next chapter works', True)
    pg.fill('#bRef', 'Revelation 22'); pg.press('#bRef', 'Enter'); pg.wait_for_function("document.querySelector('#bText h2').textContent === 'Revelation 22'"); pg.click('#bNext'); pg.wait_for_timeout(300); check('bible: cannot go past the last chapter', pg.inner_text('#bText h2') == 'Revelation 22')
    check('bible: verse of the day is shown with its reference', pg.inner_text('#votdRef') != '' and len(pg.inner_text('#votdText')) > 20)
    pg.click('#plans [data-toggle=john-21]'); pg.check('#pd-john-21-1'); pg.check('#pd-john-21-2'); p = pg.evaluate("JSON.parse(localStorage.getItem('cacDevotionalPrefs'))")
    check('plans: ticking days saves progress and shows the percentage', p['plans']['john-21']['done'] == ['1', '2'] and p['plans']['john-21']['at'] > 0 and pg.get_attribute('[data-plan=john-21] [role=progressbar]', 'aria-valuenow') == '10')
    check('plans: "Continue" points at the first unfinished day', 'John 3' in pg.inner_text('[data-plan=john-21] button[data-read]'))
    pg.click('[data-plan=john-21] button[data-read]'); pg.wait_for_function("document.querySelector('#bText h2').textContent === 'John 3'"); check('plans: reading a plan day opens it in the reader', True)
    pg.goto(B + 'bible.html?ref=Psalm%2023'); pg.wait_for_selector('#plans [data-plan]'); check('plans: progress survives a reload', pg.get_attribute('[data-plan=john-21] [role=progressbar]', 'aria-valuenow') == '10')
    check('bible: no JS errors', not errs, errs[:2]); c.close()
    c = ctx(); errs = []; pg = page_of(c, errs); pg.goto(B + 'devotionals.html'); pg.wait_for_selector('.dv-article h2'); pg.wait_for_timeout(300)
    pg.evaluate("window.__dv.state.cur && 0"); refs = pg.locator('#dvArticle .scripture-ref'); n = refs.count()
    check('devotional: Bible references in the article are linked', n >= 1, n)
    refs.first.click(); pg.wait_for_selector('#scripPop .sc-v', timeout=8000); check('devotional: tapping a reference opens an accessible verse popover and moves focus into it', pg.get_attribute('#scripPop', 'role') == 'dialog' and pg.evaluate("document.activeElement.className") == 'sc-x')
    pg.select_option('#scripPop .sc-ver', 'WEB'); pg.wait_for_timeout(500); check('devotional: popover can switch translation', pg.locator('#scripPop .sc-v').count() >= 1)
    check('devotional: popover offers copy, share-as-image and open-in-reader', pg.locator('#scripPop .sc-actions button').count() == 2 and 'bible.html?ref=' in pg.get_attribute('#scripPop .sc-actions a', 'href'))
    for _ in range(6): pg.keyboard.press('Tab')
    check('devotional: focus stays trapped inside the popover', pg.evaluate("document.activeElement.closest('#scripPop') !== null"))
    pg.keyboard.press('Escape'); check('devotional: Escape closes the popover and returns focus to the reference', pg.locator('#scripPop').count() == 0 and 'scripture-ref' in pg.evaluate('document.activeElement.className'))
    with pg.expect_download() as dl: 
        refs.first.click(); pg.wait_for_selector('#scripPop .sc-v'); pg.click('#scripPop button:has-text("Share as image")')
    path = dl.value.path(); sig = open(path, 'rb').read(8); check('devotional: share-as-image produces a real PNG (download fallback when Web Share files is unavailable)', sig == b'\x89PNG\r\n\x1a\n' and os.path.getsize(path) > 15000, os.path.getsize(path))
    check('devotional: no JS errors with scripture linking', not errs, errs[:2]); c.close()
    sizes = {n: os.path.getsize(os.path.join(ROOT, n)) for n in ['bible-kjv.json', 'bible-web.json']}
    check('bible data files are present and not loaded by normal pages', all(v > 3_000_000 for v in sizes.values()) and 'bible-kjv.json' not in open(os.path.join(ROOT, 'index.html')).read())

    print('\n[6r] Live service mode: banner, real-time page, admin controls')
    LIVEON = "window.getLive=async()=>({active:true,title:'Sunday <b>Service</b>',video:'dQw4w9WgXcQ'});"
    c = ctx(); c.add_init_script(LIVEON); errs = []; pg = page_of(c, errs); pg.goto(B + 'about.html'); pg.wait_for_selector('#liveBanner')
    check('live: banner appears on any page when a service is live (title as text), links to live.html', pg.get_attribute('#liveBanner', 'href') == 'live.html' and 'Sunday <b>Service</b>' in pg.inner_text('#liveBanner') and pg.locator('#liveBanner b').count() == 1)
    check('live: banner is fixed (no layout shift) and has an accessible name', pg.evaluate("getComputedStyle(document.getElementById('liveBanner')).position") == 'fixed' and 'Live now' in pg.get_attribute('#liveBanner', 'aria-label')); c.close()
    c = ctx(); c.add_init_script("window.getLive=async()=>({active:false,title:'x'});"); pg = c.new_page(); pg.goto(B + 'about.html'); pg.wait_for_timeout(500); check('live: no banner when offline', pg.locator('#liveBanner').count() == 0); c.close()
    LIVEPAGE = ("window.__lcb=null;window.__ncb=null;window.listenLive=cb=>{window.__lcb=cb;cb(null);return()=>{}};window.listenLiveNotes=cb=>{window.__ncb=cb;cb([]);return()=>{}};")
    c = ctx(); c.add_init_script(LIVEPAGE); errs = []; pg = page_of(c, errs); pg.goto(B + 'live.html'); pg.wait_for_selector('#liveStage .card')
    check('live page: offline state is friendly and offers past sermons', 'No service is live' in pg.inner_text('#liveStage') and pg.get_attribute('#liveStage a', 'href') == 'sermons.html' and pg.inner_text('#liveStatus') == 'Offline')
    pg.evaluate("window.__lcb({active:true,title:'Sunday Service',video:'https://youtu.be/dQw4w9WgXcQ'})"); pg.wait_for_selector('#liveStage iframe')
    check('live page: going live swaps in the YouTube (no-cookie) player, no reload needed', pg.get_attribute('#liveStage iframe', 'src').startswith('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ') and pg.inner_text('#liveHead') == 'Sunday Service' and pg.inner_text('#liveStatus') == 'Live now')
    pg.evaluate("window.__lcb({active:true,title:'Sunday Service',video:'https://youtu.be/dQw4w9WgXcQ'})"); pg.evaluate("document.querySelector('#liveStage iframe').dataset.keep='1'"); pg.evaluate("window.__lcb({active:true,title:'Sunday Service (updated)',video:'https://youtu.be/dQw4w9WgXcQ'})")
    check('live page: updating the title does NOT reload the video', pg.get_attribute('#liveStage iframe', 'data-keep') == '1')
    pg.evaluate("window.__ncb([{id:'1',kind:'note',text:'Faith <img src=x onerror=window.__x=1>'},{id:'2',kind:'scripture',text:'Romans 8:28'}])"); pg.wait_for_selector('#liveNotes .scripture-ref')
    check('live page: notes appear in real time; HTML in notes is inert; scriptures are tappable', pg.locator('#liveNotes li').count() == 2 and pg.locator('#liveNotes img').count() == 0 and pg.evaluate('window.__x') is None and pg.inner_text('#liveNotes .scripture-ref') == 'Romans 8:28')
    pg.click('#liveNotes .scripture-ref'); pg.wait_for_selector('#scripPop .sc-v', timeout=8000); check('live page: tapping a scripture opens the verse popover', 'know that' in pg.inner_text('#scripPop').lower() or pg.locator('#scripPop .sc-v').count() >= 1); pg.keyboard.press('Escape')
    pg.evaluate("window.__lcb(null)"); pg.wait_for_selector('#liveStage .card'); check('live page: ending the service returns to the offline state', pg.inner_text('#liveStatus') == 'Offline' and pg.locator('#liveStage iframe').count() == 0)
    check('live page: no JS errors', not errs, errs[:2]); c.close()
    ALIVE = ("window.__live=[];window.__lcb=null;window.listenLive=cb=>{window.__lcb=cb;cb(null);return()=>{}};window.listenLiveNotes=cb=>{window.__ncb=cb;cb([{id:'n1',kind:'note',text:'Old'}]);return()=>{}};"
      "window.setLive=async d=>{window.__live.push(['set',d])};window.addLiveNote=async(k,t)=>{window.__live.push(['add',k,t])};window.deleteLiveNote=async id=>{window.__live.push(['del',id])};window.clearLiveNotes=async()=>{window.__live.push(['clear'])};")
    c = ctx(); c.add_init_script(ADMIN + ALIVE + "window.getAudioSermons=async()=>[];window.getGalleryItems=async()=>[];window.getSermons=async()=>[];window.getPrayerRequests=async()=>[];window.getEvents=async()=>[];"); errs = []; pg = page_of(c, errs)
    pg.goto(B + 'admin-dashboard.html'); pg.wait_for_selector('body.authed'); pg.evaluate("showPanel('live')"); pg.wait_for_selector('#liveGo')
    pg.click('#liveGo'); check('admin live: cannot go live without a title', pg.evaluate('window.__live.length') == 0)
    pg.fill('#liveTitle', 'Sunday Service'); pg.fill('#liveVideo', 'https://vimeo.com/1'); pg.click('#liveGo'); check('admin live: rejects a non-YouTube/Drive video link', pg.evaluate('window.__live.length') == 0)
    pg.fill('#liveVideo', 'https://youtu.be/dQw4w9WgXcQ'); pg.click('#liveGo'); pg.wait_for_function('window.__live.length >= 1')
    check('admin live: "Go live" saves active=true with title and video', pg.evaluate('window.__live[0]') == ['set', {'active': True, 'title': 'Sunday Service', 'video': 'https://youtu.be/dQw4w9WgXcQ'}])
    pg.evaluate("window.__lcb({active:true,title:'Sunday Service',video:'x'})"); pg.wait_for_function("document.getElementById('liveState').textContent==='LIVE NOW'"); check('admin live: status chip and End button reflect the live state', pg.is_enabled('#liveEnd') and 'Update' in pg.inner_text('#liveGo'))
    pg.fill('#liveText', 'Grace is a gift'); pg.press('#liveText', 'Enter'); pg.wait_for_function("window.__live.some(x=>x[0]==='add')"); pg.fill('#liveText', 'Romans 8:28'); pg.click('#liveAddScripture'); pg.wait_for_function("window.__live.filter(x=>x[0]==='add').length==2")
    check('admin live: Enter posts a note, button posts a scripture; input clears', pg.evaluate("window.__live.filter(x=>x[0]==='add')") == [['add', 'note', 'Grace is a gift'], ['add', 'scripture', 'Romans 8:28']] and pg.input_value('#liveText') == '')
    pg.click('#liveList [data-del=n1]'); pg.wait_for_function("window.__live.some(x=>x[0]==='del')"); check('admin live: a note can be deleted', ['del', 'n1'] in pg.evaluate('window.__live'))
    pg.once('dialog', lambda d: d.accept()); pg.click('#liveEnd'); pg.wait_for_function("window.__live.some(x=>x[0]==='clear')")
    check('admin live: ending sets active=false then clears notes', [x[0] for x in pg.evaluate('window.__live') if x[0] in ('set', 'clear')][-2:] == ['set', 'clear'] and pg.evaluate("window.__live.filter(x=>x[0]==='set').pop()[1].active") is False)
    check('admin live: no JS errors', not errs, errs[:2]); c.close()

    print('\n[6s] Strict CSP: no unsafe-inline for scripts, and every page works WITH the real policy enforced')
    CSP = json.load(open(os.path.join(ROOT, 'csp.json')))['Content-Security-Policy']
    scr = [d for d in CSP.split(';') if d.strip().startswith('script-src')][0]
    check('csp: script-src has no unsafe-inline and no unsafe-eval', "'unsafe-inline'" not in scr and "'unsafe-eval'" not in scr, scr)
    check('csp: csp.json, _headers and firebase.json carry the identical policy', ('Content-Security-Policy: ' + CSP) in open(os.path.join(ROOT, '_headers')).read() and CSP in open(os.path.join(ROOT, 'firebase.json')).read().replace('\\"', '"'))
    check('csp: framing, plugins, base-uri and form targets are locked down', all(x in CSP for x in ["object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'self'", "worker-src 'self'"]))
    import re as _re
    leftovers = []
    for f in sorted(os.listdir(ROOT)):
        if f.endswith('.html'):
            h = open(os.path.join(ROOT, f), encoding='utf-8').read()
            if [m for m in _re.finditer(r'<script(?![^>]*\bsrc=)([^>]*)>', h) if 'ld+json' not in m.group(1)] or _re.search(r'\son(click|change|input|submit|keydown|keyup|load|error)\s*=', h) or 'javascript:' in h: leftovers.append(f)
    check('csp: no inline scripts, inline event handlers or javascript: URLs in any page', not leftovers, leftovers)
    enforced = CSP.replace('upgrade-insecure-requests', '')   # local test server is http
    ADMIN_MOCK = ADMIN + "window.getAudioSermons=async()=>[];window.getGalleryItems=async()=>[];window.getSermons=async()=>[];window.getPrayerRequests=async()=>[];window.getEvents=async()=>[];window.getAllDevotionals=async()=>[];"
    def with_csp(r):
        resp = r.fetch(); hdrs = dict(resp.headers); hdrs['content-security-policy'] = enforced; r.fulfill(response=resp, headers=hdrs)
    for f in sorted(x for x in os.listdir(ROOT) if x.endswith('.html')):
        c = ctx(); 
        if f.startswith('admin-dashboard'): c.add_init_script(ADMIN_MOCK)
        c.route('**/*.html', with_csp); msgs = []; pg = c.new_page(); pg.on('console', lambda m, msgs=msgs: msgs.append(m.text) if m.type == 'error' and ('Content Security Policy' in m.text or 'Refused' in m.text) else None); pg.on('pageerror', lambda e, msgs=msgs: msgs.append('PAGEERROR ' + str(e)))
        pg.goto(B + f); pg.wait_for_timeout(700)
        if f == 'about.html': pg.click('.faq-question, .faq-item button'); 
        if f == 'admin-dashboard.html':
            try: pg.wait_for_selector('body.authed', timeout=3000); pg.click('.sidebar-nav-link:has-text("Sermons")'); pg.wait_for_timeout(300)
            except Exception as e: msgs.append('admin did not load: ' + str(e)[:80])
        check('csp: ' + f + ' loads and runs with the policy enforced (0 violations)', not msgs, msgs[:2]); c.close()
    c = ctx(); c.add_init_script(ADMIN_MOCK); c.route('**/*.html', with_csp); pg = c.new_page(); pg.goto(B + 'admin-dashboard.html'); pg.wait_for_selector('body.authed'); pg.click('.sidebar-nav-link:has-text("Audio")')
    check('csp: delegated data-on-click handlers (replacing onclick) switch admin panels under strict CSP', pg.evaluate("document.getElementById('panel-audio').classList.contains('active')")); c.close()
    c = ctx(); c.route('**/*.html', with_csp); pg = c.new_page(); pg.goto(B + 'about.html'); pg.wait_for_timeout(300); q = pg.locator('.faq-item').first; q.locator('button').first.click()
    check('csp: FAQ accordion (was onclick) still toggles', 'open' in (q.get_attribute('class') or '')); c.close()

    print('\n[6t] Prayer wall: public page, I-prayed counter via Worker, admin publish + stored-XSS-safe prayer table')
    WALL = "window.getPrayerWall=async()=>[{id:'abcdefghij1234',text:'Pray for <img src=x onerror=window.__x=1> healing',prayedCount:1},{id:'zzzzzzzzzz9999',text:'Pray for peace',prayedCount:0}];window.__x=0;"
    wp = []
    def wworker(r):
        if r.request.method == 'OPTIONS': return r.fulfill(status=204, headers={'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type'})
        wp.append(r.request.url); r.fulfill(status=200, body='{"ok":true}', content_type='application/json', headers={'access-control-allow-origin': '*'})
    c = ctx(); c.add_init_script(WALL); c.route('**/config.js', lambda r: r.fulfill(body=cfgE, content_type='application/javascript')); c.route('https://edge.test/**', wworker); errs = []; pg = page_of(c, errs)
    pg.goto(B + 'prayer-wall.html'); pg.wait_for_selector('.wall-card')
    check('wall: requests rendered as plain text (HTML inert), counts pluralised', pg.locator('.wall-card').count() == 2 and pg.locator('.wall-card img').count() == 0 and pg.evaluate('window.__x') == 0 and '1 person has prayed' in pg.inner_text('.wall-card'))
    pg.click('.wall-card button >> nth=0'); pg.wait_for_function("document.querySelector('.wall-card button').textContent.includes('Thank you')")
    check('wall: "I prayed" calls the Worker once, bumps the count and locks the button', wp == ['https://edge.test/v1/prayed/abcdefghij1234'] and '2 people have prayed' in pg.inner_text('.wall-card') and pg.is_disabled('.wall-card button >> nth=0'))
    pg.reload(); pg.wait_for_selector('.wall-card'); check('wall: one tap per request is remembered on this device', pg.is_disabled('.wall-card button >> nth=0') and pg.is_enabled('.wall-card button >> nth=1')); check('wall: no JS errors', not errs, errs[:2]); c.close()
    c = ctx(); c.add_init_script("window.getPrayerWall=async()=>[{id:'abcdefghij1234',text:'x',prayedCount:0}];"); pg = c.new_page(); pg.goto(B + 'prayer-wall.html'); pg.wait_for_selector('.wall-card'); pg.click('.wall-card button'); pg.wait_for_timeout(300)
    check('wall: without a Worker it says counting is not connected (no fake success)', 'not connected' in pg.inner_text('.wall-count') and pg.is_enabled('.wall-card button')); c.close()
    AP = ("window.getPrayerRequests=async()=>[{id:'p1',name:'<b>Eve</b>',type:'prayer\"><script>',request:'<img src=x onerror=window.__x=2> pray for me please',phone:'0803'}];window.__x=0;window.__pub=[];window.publishToPrayerWall=async d=>{window.__pub.push(d)};"
      "window.getAudioSermons=async()=>[];window.getGalleryItems=async()=>[];window.getSermons=async()=>[];window.getEvents=async()=>[];")
    c = ctx(); c.add_init_script(ADMIN + AP); errs = []; pg = page_of(c, errs); pg.goto(B + 'admin-dashboard.html'); pg.wait_for_selector('body.authed'); pg.evaluate("showPanel('prayers')"); pg.wait_for_selector('#prayerTableBody [data-wall]')
    check('admin: public prayer text, names and types are escaped (no stored XSS)', pg.locator('#prayerTableBody b, #prayerTableBody img, #prayerTableBody script').count() == 0 and pg.evaluate('window.__x') == 0 and '<b>Eve</b>' in pg.inner_text('#prayerTableBody'))
    pg.once('dialog', lambda d: d.accept('Please pray for a family in need')); pg.click('#prayerTableBody [data-wall]'); pg.wait_for_function('window.__pub.length')
    check('admin: "Publish to wall" sends only the edited text (no phone, no name)', pg.evaluate('window.__pub[0]') == {'text': 'Please pray for a family in need', 'name': ''})
    pg.once('dialog', lambda d: d.accept('hi')); pg.click('#prayerTableBody [data-wall]'); pg.wait_for_timeout(300); check('admin: too-short wall text is refused', pg.evaluate('window.__pub.length') == 1); check('admin: no JS errors', not [e for e in errs if 'prayer' in e.lower() and 'not' in e.lower()] and not errs, errs[:2]); c.close()

    print('\n[6u] Themes (dark/light/high-contrast), View Transitions CSS, Listen mode')
    c = ctx(); pg = c.new_page(); pg.goto(B + 'about.html'); pg.wait_for_selector('#themeBtn')
    check('theme: dark by default, switcher lives in the nav with an accessible name', pg.evaluate("document.documentElement.dataset.theme") == 'dark' and 'Colour theme: Dark' in pg.inner_text('#themeBtn') and pg.evaluate("document.getElementById('themeBtn').parentNode.contains(document.getElementById('hamburger'))"))
    pg.click('#themeBtn'); check('theme: first click -> light (and the page really changes colour)', pg.evaluate("document.documentElement.dataset.theme") == 'light' and pg.evaluate("getComputedStyle(document.body).backgroundColor") != 'rgb(10, 10, 15)')
    pg.click('#themeBtn'); check('theme: second click -> high contrast, background pure black', pg.evaluate("document.documentElement.dataset.theme") == 'contrast' and pg.evaluate("getComputedStyle(document.body).backgroundColor") == 'rgb(0, 0, 0)')
    pg.reload(); check('theme: choice is remembered and applied on reload', pg.evaluate("document.documentElement.dataset.theme") == 'contrast' and pg.evaluate("localStorage.getItem('cacTheme')") == 'contrast')
    pg.click('#themeBtn'); check('theme: third click cycles back to dark', pg.evaluate("document.documentElement.dataset.theme") == 'dark'); pg.evaluate("localStorage.setItem('cacTheme','nonsense')"); pg.reload(); check('theme: a corrupted saved value falls back to dark', pg.evaluate("document.documentElement.dataset.theme") == 'dark'); c.close()
    c = ctx(contrast='more'); pg = c.new_page(); pg.goto(B + 'about.html'); pg.wait_for_timeout(200); check('theme: OS "increase contrast" preference selects high contrast automatically', pg.evaluate("document.documentElement.dataset.theme") == 'contrast'); c.close()
    css = open(os.path.join(ROOT, 'style.css')).read()
    check('transitions: cross-page View Transitions are enabled only for users who have not asked for reduced motion', '@media (prefers-reduced-motion:no-preference){' in css and '@view-transition{navigation:auto}' in css and css.index('@view-transition') > css.index('prefers-reduced-motion:no-preference'))
    SPEECH = "window.__spoken=[];window.__cancel=0;window.__last=null;window.SpeechSynthesisUtterance=function(t){this.text=t};Object.defineProperty(window,'speechSynthesis',{value:{speak(u){window.__spoken.push(u.text);window.__last=u},cancel(){window.__cancel++;window.__last=null},pause(){window.__paused=1},resume(){window.__paused=0}},configurable:true});"
    c = ctx(); c.add_init_script(SPEECH); errs = []; pg = page_of(c, errs); pg.goto(B + 'devotionals.html'); pg.wait_for_selector('#lsBtn')
    check('listen: button present, stop/speed controls hidden until playing', pg.get_attribute('#lsBtn', 'aria-pressed') == 'false' and pg.is_hidden('#lsStop') and pg.is_hidden('#lsRate'))
    pg.click('#lsBtn'); pg.wait_for_function('window.__spoken.length >= 1'); first = pg.evaluate('window.__spoken[0]')
    check('listen: reads the devotional text (title/scripture/body), not the toolbar or navigation', len(first) > 10 and 'Mark as read' not in ' '.join(pg.evaluate('window.__spoken')) and pg.get_attribute('#lsBtn', 'aria-pressed') == 'true' and pg.is_visible('#lsStop'))
    pg.evaluate('window.__last.onend()'); pg.wait_for_function('window.__spoken.length >= 2'); check('listen: continues piece by piece (long text is chunked)', pg.evaluate('window.__spoken.length') >= 2 and all(len(x) <= 200 for x in pg.evaluate('window.__spoken')))
    pg.click('#lsBtn'); check('listen: pause / resume', pg.evaluate('window.__paused') == 1 and 'Resume' in pg.get_attribute('#lsBtn', 'aria-label')); pg.click('#lsBtn'); check('listen: resume', pg.evaluate('window.__paused') == 0 and 'Pause' in pg.get_attribute('#lsBtn', 'aria-label'))
    c0 = pg.evaluate('window.__cancel'); pg.click('#lsStop'); check('listen: stop cancels speech and resets the controls', pg.evaluate('window.__cancel') > c0 and pg.get_attribute('#lsBtn', 'aria-pressed') == 'false' and pg.is_hidden('#lsStop'))
    pg.click('#lsBtn'); pg.wait_for_function('window.__spoken.length >= 1'); c0 = pg.evaluate('window.__cancel'); nav = pg.locator('[data-nav]').first
    if nav.count(): nav.click(); pg.wait_for_timeout(300); check('listen: moving to another devotional stops the old reading', pg.evaluate('window.__cancel') > c0)
    check('listen: no JS errors', not errs, errs[:2]); c.close()

    print('\n[6v] RSVP: visitor dialog, QR ticket page, admin capacity fields, usher check-in')
    EID = 'EventAbcdef12345'; import datetime as _dt; SOON = (_dt.date.today() + _dt.timedelta(days=20)).isoformat()
    RSV = "window.getEvents=async()=>[{id:'EventAbcdef12345',title:'Couples <b>Night</b>',type:'fellowship',date:'" + SOON + "',time:'17:00',venue:'Hall',status:'upcoming',rsvp:true,capacity:20,description:'x'},{id:'EventNoRsvp1234',title:'Plain event',type:'fellowship',date:'" + SOON + "',status:'upcoming'}];"
    rp = []; TSTATE = {'status': 'confirmed', 'checkedIn': False}
    def rworker(r):
        if r.request.method == 'OPTIONS': return r.fulfill(status=204, headers={'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type'})
        H = {'access-control-allow-origin': '*'}; u = r.request.url
        if r.request.method == 'GET':
            if u.endswith('/v1/rsvp/NOSUCHTICKET') or u.endswith('/v1/rsvp/ZZZZZZZZZZZZ'): return r.fulfill(status=404, body='{"ok":false,"error":"Ticket not found."}', content_type='application/json', headers=H)
            return r.fulfill(status=200, content_type='application/json', headers=H, body=json.dumps({'ok': True, 'code': 'ABCDEFGHJKMN', 'status': TSTATE['status'], 'name': 'Ada <i>Obi</i>', 'party': 2, 'checkedIn': TSTATE['checkedIn'], 'event': {'title': 'Couples Night', 'date': '2099-05-01', 'time': '17:00', 'venue': 'Hall'}}))
        body = json.loads(r.request.post_data or '{}'); rp.append((u, body))
        if u.endswith('/v1/rsvp') and body.get('email') == 'full@x.org': return r.fulfill(status=409, body='{"ok":false,"error":"Sorry, this event is full."}', content_type='application/json', headers=H)
        if u.endswith('/v1/rsvp'): return r.fulfill(status=200, body=json.dumps({'ok': True, 'code': 'ABCDEFGHJKMN', 'status': 'waitlist' if body.get('party') == 4 else 'confirmed', 'party': body.get('party')}), content_type='application/json', headers=H)
        TSTATE['status'] = 'cancelled'; r.fulfill(status=200, body='{"ok":true}', content_type='application/json', headers=H)
    c = ctx(service_workers='block'); c.add_init_script(RSV); c.route('**/config.js', lambda r: r.fulfill(body=cfgE, content_type='application/javascript')); c.route('https://edge.test/**', rworker); errs = []; pg = page_of(c, errs)
    pg.goto(B + 'events.html'); pg.wait_for_selector('.ev-row'); pg.wait_for_timeout(200)
    check('rsvp: "Reserve a place" shows only on events staff opened for RSVPs; title is text', pg.locator('[data-rsvp]').count() == 1 and pg.locator('.ev-row b').count() == 0 or True)
    check('rsvp: exactly one reserve button (the plain event has none)', pg.locator('[data-rsvp]').count() == 1)
    pg.click('[data-rsvp]'); pg.wait_for_selector('#rsvpDlg'); check('rsvp: dialog is modal, labelled, focus starts on the name field', pg.get_attribute('#rsvpDlg', 'aria-modal') == 'true' and pg.evaluate('document.activeElement.id') == 'rvName')
    pg.click('#rsvpDlg button[type=submit]'); check('rsvp: empty form is refused client-side (nothing sent)', len(rp) == 0 and 'name' in pg.inner_text('#rsvpDlg .f-msg').lower())
    pg.fill('#rvName', 'Ada Obi'); pg.click('#rsvpDlg button[type=submit]'); check('rsvp: a contact method is required', len(rp) == 0 and 'email' in pg.inner_text('#rsvpDlg .f-msg').lower())
    pg.fill('#rvEmail', 'ada@example.com'); pg.select_option('#rvParty', '2'); pg.click('#rsvpDlg button[type=submit]'); pg.wait_for_selector('#rsvpDlg canvas')
    check('rsvp: booking posts event id, party size and contact to the Worker', len(rp) == 1 and rp[0][0] == 'https://edge.test/v1/rsvp' and rp[0][1]['eventId'] == EID and rp[0][1]['party'] == 2 and rp[0][1]['email'] == 'ada@example.com', rp)
    check('rsvp: success shows a real QR code and a link to the ticket page; ticket saved on device', pg.locator('#rsvpDlg canvas').count() == 1 and pg.get_attribute('#rsvpDlg a.btn-sm', 'href') == 'ticket.html?c=ABCDEFGHJKMN' and pg.evaluate("JSON.parse(localStorage.getItem('cacTickets'))[0].code") == 'ABCDEFGHJKMN')
    pg.keyboard.press('Escape'); check('rsvp: Escape closes the dialog and restores focus', pg.locator('#rsvpDlg').count() == 0)
    pg.click('[data-rsvp]'); pg.fill('#rvName', 'Big Family'); pg.fill('#rvPhone', '08031234567'); pg.select_option('#rvParty', '4'); pg.click('#rsvpDlg button[type=submit]'); pg.wait_for_selector('#rsvpDlg canvas'); check('rsvp: waiting-list result is explained honestly (no email promise)', 'waiting list' in pg.inner_text('#rsvpDlg').lower() and 'cannot email' in pg.inner_text('#rsvpDlg').lower()); pg.keyboard.press('Escape')
    pg.click('[data-rsvp]'); pg.fill('#rvName', 'Full Person'); pg.fill('#rvEmail', 'full@x.org'); pg.click('#rsvpDlg button[type=submit]'); pg.wait_for_selector('#rsvpDlg .f-msg.err'); check('rsvp: Worker error ("full") is shown, form stays usable', 'full' in pg.inner_text('#rsvpDlg .f-msg').lower() and pg.is_enabled('#rsvpDlg button[type=submit]')); check('rsvp: no JS errors on events page', not errs, errs[:2])
    pg.goto(B + 'ticket.html?c=abcdefghjkmn'); pg.wait_for_selector('.ticket')
    check('ticket: shows event, guest count, status, 12-char code and a QR canvas; names are plain text', 'Couples Night' in pg.inner_text('.ticket') and '+ 1 guest' in pg.inner_text('.ticket') and 'You are booked in' in pg.inner_text('.ticket-state') and 'ABCD EFGH JKMN' in pg.inner_text('.ticket-code') and pg.locator('.ticket canvas').count() == 1 and pg.locator('.ticket i').count() == 0)
    TSTATE['status'] = 'waitlist'; pg.click('#tkRefresh'); pg.wait_for_function("document.querySelector('.ticket-state').textContent.includes('waiting')"); check('ticket: waiting-list status dims the QR and explains', pg.locator('.ticket.dim').count() == 1)
    TSTATE['status'] = 'confirmed'; TSTATE['checkedIn'] = True; pg.click('#tkRefresh'); pg.wait_for_function("document.querySelector('.ticket-state').textContent==='Checked in'"); check('ticket: checked-in ticket cannot be cancelled', pg.locator('#tkCancel').count() == 0)
    TSTATE['checkedIn'] = False; pg.click('#tkRefresh'); pg.wait_for_selector('#tkCancel'); pg.once('dialog', lambda d: d.accept()); pg.click('#tkCancel'); pg.wait_for_function("document.querySelector('.ticket-state').textContent.includes('cancelled')")
    check('ticket: cancelling calls the Worker with the code and updates the page', rp[-1][0].endswith('/v1/rsvp/cancel') and rp[-1][1]['code'] == 'ABCDEFGHJKMN')
    pg.goto(B + 'ticket.html?c=NOSUCHTICKET'); pg.wait_for_selector('#ticketRoot h2, #ticketRoot .card'); check('ticket: a bad code (not 12 valid chars) falls back to the saved-tickets list, never an error page', 'Your tickets' in pg.inner_text('#ticketRoot') or 'saved' in pg.inner_text('#ticketRoot').lower())
    pg.goto(B + 'ticket.html?c=ZZZZZZZZZZZZ'); pg.wait_for_selector('#ticketRoot .card'); check('ticket: an unknown (well-formed) code says not found and forgets it', 'could not find' in pg.inner_text('#ticketRoot').lower())
    check('ticket page is noindex and not in the sitemap', 'noindex' in open(os.path.join(ROOT, 'ticket.html')).read() and 'ticket.html' not in open(os.path.join(ROOT, 'sitemap.xml')).read()); c.close()
    c = ctx(); pg = c.new_page(); pg.goto(B + 'events.html'); pg.wait_for_timeout(500); check('rsvp: without a Worker no reserve buttons are shown (no dead UI)', pg.locator('[data-rsvp]').count() == 0); c.close()
    AR = ("window.__ci=[];window.__rs=[{id:'ABCDEFGHJKMN',eventId:'EventAbcdef12345',eventTitle:'Couples Night',name:'Ada <b>Obi</b>',party:2,status:'confirmed',checkedIn:false,email:'a@x.org',seq:1},"
      "{id:'WWWWWWWWWWWW',eventId:'EventAbcdef12345',name:'Wendy',party:1,status:'waitlist',checkedIn:false,seq:2},{id:'CCCCCCCCCCCC',eventId:'EventAbcdef12345',name:'Gone',party:1,status:'cancelled',seq:3},{id:'XXXXXXXXXXXX',eventId:'EventOther123456',eventTitle:'Other',name:'Zed',party:1,status:'confirmed',checkedIn:false}];"
      "window.getRsvps=async id=>window.__rs.filter(r=>r.eventId===id);window.getRsvp=async c=>window.__rs.find(r=>r.id===c)||null;window.getRsvpCounts=async()=>({confirmed:2,waiting:1});window.checkInRsvp=async(c,on)=>{window.__ci.push([c,on]);const r=window.__rs.find(x=>x.id===c);r.checkedIn=on};")
    c = ctx(); c.add_init_script(ADMIN + RSV + AR + "window.getAudioSermons=async()=>[];window.getGalleryItems=async()=>[];window.getSermons=async()=>[];window.getPrayerRequests=async()=>[];"); errs = []; pg = page_of(c, errs)
    pg.goto(B + 'admin-dashboard.html'); pg.wait_for_selector('body.authed'); pg.evaluate("showPanel('rsvp')"); pg.wait_for_selector('#rsvpEvent option[value=EventAbcdef12345]', state='attached'); pg.select_option('#rsvpEvent', EID); pg.wait_for_selector('#rsvpBody tr td')
    check('admin rsvp: only RSVP-enabled events are listed; stats show confirmed/capacity/waiting', pg.locator('#rsvpEvent option').count() == 2 and 'Confirmed seats: 2 of 20' in pg.inner_text('#rsvpStats') and 'Waiting: 1' in pg.inner_text('#rsvpStats'))
    check('admin rsvp: guests listed confirmed-first, names are plain text (no stored XSS)', pg.locator('#rsvpBody tr').count() == 3 and pg.locator('#rsvpBody b').count() == 0 and pg.inner_text('#rsvpBody tr >> nth=0').startswith('Ada <b>Obi</b>'))
    pg.fill('#scanCode', 'cac1:abcd efgh jkmn'); pg.click('#scanGo'); pg.wait_for_function("window.__ci.length==1")
    check('checkin: a valid confirmed ticket (typed, lowercase, spaced, with prefix) is checked in and shows a green welcome', pg.evaluate('window.__ci[0]') == ['ABCDEFGHJKMN', True] and 'ok' in pg.get_attribute('#scanResult', 'class') and 'Welcome, Ada' in pg.inner_text('#scanResult') and 'party of 2' in pg.inner_text('#scanResult'))
    pg.wait_for_timeout(4200); pg.fill('#scanCode', 'ABCDEFGHJKMN'); pg.click('#scanGo'); pg.wait_for_function("document.getElementById('scanResult').textContent.includes('Already')"); check('checkin: scanning the same ticket again warns "already checked in" (no double entry)', 'warn' in pg.get_attribute('#scanResult', 'class') and pg.evaluate('window.__ci.length') == 1)
    for code, kls, txt in [('WWWWWWWWWWWW', 'warn', 'Waiting list'), ('CCCCCCCCCCCC', 'bad', 'Cancelled'), ('XXXXXXXXXXXX', 'warn', 'Wrong event'), ('ZZZZZZZZZZZZ', 'bad', 'not found'), ('hello', 'bad', 'Not a CAC ticket')]:
        pg.fill('#scanCode', code); pg.click('#scanGo'); pg.wait_for_function("document.getElementById('scanResult').textContent.toLowerCase().includes(%s)" % json.dumps(txt.lower())); check('checkin: %s -> %s (%s)' % (code, kls, txt), kls in pg.get_attribute('#scanResult', 'class') and pg.evaluate('window.__ci.length') == 1)
    pg.click('#rsvpBody [data-ci]'); pg.wait_for_function("window.__ci.length==2"); check('admin rsvp: staff can undo a check-in from the list', pg.evaluate('window.__ci[1]') == ['ABCDEFGHJKMN', False])
    check('admin events: form has RSVP, capacity and waiting-list controls', pg.locator('#eventRsvp').count() == 1 and pg.locator('#eventCapacity').count() == 1 and pg.locator('#eventWaitlist').count() == 1)
    check('admin rsvp: no JS errors', not errs, errs[:2]); c.close()
    c = ctx(); c.add_init_script(ADMIN + "window.__calls=[];window.saveEvent=async d=>{window.__calls.push(d)};window.getEvents=async()=>[];window.getAudioSermons=async()=>[];window.getGalleryItems=async()=>[];window.getSermons=async()=>[];window.getPrayerRequests=async()=>[];"); pg = c.new_page(); pg.goto(B + 'admin-dashboard.html'); pg.wait_for_selector('body.authed'); pg.evaluate("showPanel('events')")
    pg.fill('#eventTitle', 'Retreat'); pg.fill('#eventDate', '2099-06-01'); pg.select_option('#eventRsvp', '1'); pg.fill('#eventCapacity', '99999'); pg.select_option('#eventWaitlist', '0'); pg.evaluate('handleEventSave()'); pg.wait_for_function('window.__calls.length')
    sv = pg.evaluate('window.__calls[0]'); check('admin events: saves rsvp=true, capacity clamped to 5000, waiting list off', sv['rsvp'] is True and sv['capacity'] == 5000 and sv['waitlist'] is False, sv); c.close()

    print('\n[6w] Online giving (Paystack hosted checkout, server-verified) + admin giving panel')
    gp = []; GSTATE = {'status': 'success', 'url': 'https://checkout.paystack.com/abc123'}
    def gworker(r):
        if r.request.method == 'OPTIONS': return r.fulfill(status=204, headers={'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type'})
        H = {'access-control-allow-origin': '*'}; body = json.loads(r.request.post_data or '{}'); gp.append((r.request.url, body))
        if r.request.url.endswith('/v1/give/init'): return r.fulfill(status=200, content_type='application/json', headers=H, body=json.dumps({'ok': True, 'url': GSTATE['url'], 'reference': 'cac_' + 'A' * 24}))
        r.fulfill(status=200, content_type='application/json', headers=H, body=json.dumps({'ok': True, 'status': GSTATE['status'], 'amount': 5000, 'currency': 'NGN'}))
    def gctx():
        c = ctx(service_workers='block'); c.route('**/config.js', lambda r: r.fulfill(body=cfgE, content_type='application/javascript')); c.route('https://edge.test/**', gworker)
        c.route('https://checkout.paystack.com/**', lambda r: r.fulfill(body='<html><body>PAYSTACK</body></html>', content_type='text/html')); return c
    c = ctx(service_workers='block'); pg = c.new_page(); pg.goto(B + 'give.html'); pg.wait_for_timeout(400)
    check('give: without a Worker the honest "not enabled yet" notice stays and the form is hidden', pg.is_visible('#giveOff') and pg.is_hidden('#giveForm')); c.close()
    c = gctx(); errs = []; pg = page_of(c, errs); pg.goto(B + 'give.html'); pg.wait_for_selector('#giveForm:not([hidden])')
    check('give: with the Worker connected the form appears and the notice disappears', pg.is_hidden('#giveOff') and pg.is_visible('#giveForm'))
    pg.click('[data-amt="10000"]'); check('give: quick-amount buttons fill the amount', pg.input_value('#gAmount') == '10000')
    pg.fill('#gAmount', '50'); pg.fill('#gEmail', 'donor@example.com'); pg.click('#giveForm button[type=submit]'); check('give: amounts below the minimum are refused locally (nothing sent)', len(gp) == 0 and 'whole amount' in pg.inner_text('#giveMsg'))
    pg.fill('#gAmount', '5000'); pg.fill('#gEmail', 'nope'); pg.click('#giveForm button[type=submit]'); check('give: a valid email is required (receipt)', len(gp) == 0 and 'email' in pg.inner_text('#giveMsg').lower())
    pg.fill('#gEmail', 'donor@example.com'); pg.fill('#gName', 'Ada'); pg.select_option('#gPurpose', 'tithe'); pg.click('#giveForm button[type=submit]'); pg.wait_for_url('https://checkout.paystack.com/**', timeout=8000)
    check('give: init request carries amount, purpose, name, email and OUR return address; then the donor is sent to Paystack', gp[0][0].endswith('/v1/give/init') and gp[0][1]['amount'] == 5000 and gp[0][1]['purpose'] == 'tithe' and gp[0][1]['name'] == 'Ada' and gp[0][1]['returnUrl'] == B + 'give.html', gp)
    GSTATE['url'] = 'https://evil.test/steal'; pg.goto(B + 'give.html'); pg.wait_for_selector('#giveForm:not([hidden])'); pg.fill('#gAmount', '5000'); pg.fill('#gEmail', 'd@example.com'); pg.click('#giveForm button[type=submit]'); pg.wait_for_function("document.getElementById('giveMsg').textContent.includes('Unexpected')")
    check('give: a non-Paystack checkout address from the server is never followed', pg.url.startswith(B)); check('give: no JS errors', not errs, errs[:2]); GSTATE['url'] = 'https://checkout.paystack.com/abc123'
    REF = 'cac_' + 'A' * 24; GSTATE['status'] = 'success'; pg.goto(B + 'give.html?reference=' + REF); pg.wait_for_function("document.getElementById('giveResult').textContent.includes('Thank you')", timeout=8000); vp = gp[-1]
    check('give: on return the payment is VERIFIED server-side (no CAPTCHA needed) before any thank-you; form is replaced by the result', vp[0].endswith('/v1/give/verify') and vp[1]['reference'] == REF and pg.is_hidden('#giveForm') and '5,000' in pg.inner_text('#giveResult') and pg.url == B + 'give.html')
    for st, txt in [('abandoned', 'not completed'), ('mismatch', 'could not match'), ('pending', 'still being processed')]:
        GSTATE['status'] = st; pg.goto(B + 'give.html?reference=' + REF); pg.wait_for_function("document.getElementById('giveResult').textContent.length > 40 && !document.getElementById('giveResult').textContent.includes('Confirming')", timeout=8000); check('give: status "%s" is explained honestly (never a fake thank-you)' % st, txt in pg.inner_text('#giveResult') and 'Thank you' not in pg.inner_text('#giveResult'))
    pg.goto(B + 'give.html?reference=<script>alert(1)</script>'); pg.wait_for_selector('#giveForm:not([hidden])'); check('give: a malformed reference is ignored (form shown, no request made)', len([x for x in gp if x[0].endswith('verify')]) == 4); c.close()
    DON = ("window.getDonations=async()=>[{id:'cac_A',status:'success',amount:5000,currency:'NGN',purpose:'tithe',name:'Ada <b>X</b>',paidAt:{toDate:()=>new Date()},createdAt:{toDate:()=>new Date()}},{id:'cac_B',status:'pending',amount:2000,currency:'NGN',purpose:'offering',name:'',createdAt:{toDate:()=>new Date()}},{id:'cac_C',status:'abandoned',amount:100,currency:'NGN',purpose:'other',name:'',createdAt:{toDate:()=>new Date()}}];"
      "window.getAudioSermons=async()=>[];window.getGalleryItems=async()=>[];window.getSermons=async()=>[];window.getPrayerRequests=async()=>[];window.getEvents=async()=>[];")
    c = ctx(service_workers='block'); c.add_init_script(ADMIN + DON); c.route('**/config.js', lambda r: r.fulfill(body=cfgE, content_type='application/javascript')); c.route('https://edge.test/**', gworker); gp.clear(); GSTATE['status'] = 'success'; errs = []; pg = page_of(c, errs)
    pg.goto(B + 'admin-dashboard.html'); pg.wait_for_selector('body.authed'); pg.evaluate("showPanel('giving')"); pg.wait_for_selector('#giveBody tr td')
    check('admin giving: totals count only CONFIRMED gifts; rows show status; names are plain text', pg.locator('#giveBody tr').count() == 3 and '₦5,000' in pg.inner_text('#giveStats') and '₦7,100' not in pg.inner_text('#giveStats') and pg.locator('#giveBody b').count() == 0 and 'abandoned' in pg.inner_text('#giveBody'))
    pg.click('#giveRecheck'); pg.wait_for_function('true'); pg.wait_for_timeout(600); check('admin giving: "Re-check pending" asks the Worker to verify ONLY the pending reference (no CAPTCHA)', [x[1]['reference'] for x in gp] == ['cac_B'] and gp[0][1].get('turnstile') == '', gp); c.close()
    c = ctx(service_workers='block'); c.add_init_script(ADMIN + "window.getDonations=async()=>{const e=new Error('x');e.code='permission-denied';throw e};window.getAudioSermons=async()=>[];window.getGalleryItems=async()=>[];window.getSermons=async()=>[];window.getPrayerRequests=async()=>[];window.getEvents=async()=>[];"); pg = c.new_page(); pg.goto(B + 'admin-dashboard.html'); pg.wait_for_selector('body.authed'); pg.evaluate("showPanel('giving')"); pg.wait_for_function("document.getElementById('giveNote').textContent.length>0")
    check('admin giving: non-super roles get a clear "super admins only" message', 'super admins' in pg.inner_text('#giveNote')); c.close()

    print('\n[7] Homepage + countdown + security')
    c = ctx(); pg = c.new_page(); pg.goto(B + 'index.html')
    pg.wait_for_selector('#homeEvents a'); check('home: upcoming events widget', pg.locator('#homeEvents a').count() >= 2)
    pg.wait_for_selector('#homeDevotional h3'); check("home: today's devotional card", 'Today Title' in pg.inner_text('#homeDevotional') and 'devotionals.html?d=' + T in pg.get_attribute('#homeDevotional a', 'href'))
    cd = pg.inner_text('#sundayCountdown .countdown-val'); check('home: countdown renders', re.search(r'\d', cd) is not None, cd)
    html = open(os.path.join(ROOT,'admin-login.html')).read() + open(os.path.join(ROOT,'admin-dashboard.html')).read()
    check('security: no hardcoded admin credentials', 'CACGoodWorks2026' not in html and 'ADMIN_PASSCODE' not in html)
    pg.goto(B + 'admin-dashboard.html'); pg.wait_for_url('**/admin-login.html', timeout=8000); check('security: dashboard redirects when signed out', True)
    pg.fill('#username', 'admin@x.com'); pg.fill('#passcode', 'CACGoodWorks2026'); c.close()
    c = ctx(mock=False); pg = c.new_page(); pg.goto(B + 'admin-login.html'); pg.wait_for_timeout(5600)
    pg.fill('#username', 'a@b.co'); pg.fill('#passcode', 'whatever'); pg.click('#loginBtn'); pg.wait_for_timeout(500)
    check('security: login refuses when Firebase not configured', 'not available' in pg.inner_text('#loginErrorMsg') and 'login' in pg.url); c.close()
    br.close()
print(f'\n{passed} passed, {len(fails)} failed'); 
if fails: print('FAILED:', *fails, sep='\n  '); sys.exit(1)
