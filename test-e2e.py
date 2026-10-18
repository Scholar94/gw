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
    pages = ['index','about','ministries','sermons','gallery','contact','events','devotionals','visit','testimonies','impact','give','privacy','terms','admin-login']
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
    on_disk = [d for d in os.listdir(ROOT) if os.path.isdir(os.path.join(ROOT, d)) and d not in ('.git', '.github', 'node_modules', '__pycache__')]
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
    PUBLIC = ['index','about','ministries','sermons','gallery','contact','events','devotionals','visit','testimonies','impact','give','privacy','terms']
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
    check('bbc: no link configured -> clear "coming soon" state, never a dead link', pg.locator('#bbc a.bbc-btn').count() == 0 and 'coming soon' in pg.inner_text('#bbc .bbc-disabled').lower() and pg.get_attribute('#bbc .bbc-disabled','aria-disabled') == 'true')
    check('bbc: footer link points at the section', pg.locator('footer a[href="#bbc"]').count() == 1)
    check('bbc: no js errors', not errs, errs[:2]); c.close()
    c = ctx(); pg = c.new_page()
    pg.route('**/config.js', lambda r: r.fulfill(body=open(os.path.join(ROOT,'config.js')).read().replace("url: '',   // PASTE", "url: 'https://bbc.example.org/join',   // PASTE"), content_type='application/javascript'))
    pg.goto(B + 'index.html'); pg.wait_for_selector('#bbc a.bbc-btn')
    a = pg.locator('#bbc a.bbc-btn')
    check('bbc: button opens the site in a new, safe tab', a.get_attribute('href') == 'https://bbc.example.org/join' and a.get_attribute('target') == '_blank' and 'noopener' in a.get_attribute('rel') and 'opens in a new tab' in a.get_attribute('aria-label'))
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
    check('bbc: javascript: link and image from settings are rejected', pg.locator('#bbc a.bbc-btn').count() == 0 and 'bbc-crest.webp' in pg.get_attribute('#bbc img','src')); c.close()
    c = with_settings("{headline:'x',text:'y',buttonLabel:'z',url:'http://insecure.example.org',image:'http://insecure.example.org/a.jpg'}")
    pg = c.new_page(); pg.goto(B + 'index.html'); pg.wait_for_timeout(900)
    check('bbc: plain http link/image rejected (https only)', pg.locator('#bbc a.bbc-btn').count() == 0 and 'bbc-crest.webp' in pg.get_attribute('#bbc img','src')); c.close()
    c = ctx(); pg = c.new_page(); pg.goto(B + 'devotionals.html'); pg.wait_for_selector('.bbc-compact')
    check('bbc: compact card appears on the Devotional page', pg.locator('.bbc-compact img').count() == 1 and 'Believers Bible College' in pg.inner_text('.bbc-compact')); c.close()
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
