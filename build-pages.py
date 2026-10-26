#!/usr/bin/env python3
"""Generates new pages and patches shared chrome (nav/footer/scripts) on existing pages. Idempotent."""
import re, pathlib
ROOT = pathlib.Path(__file__).resolve().parent
NAV_ITEMS = [('index.html','Home'),('about.html','About'),('ministries.html','Ministries'),('devotionals.html','Devotional'),
             ('sermons.html','Sermons'),('events.html','Events'),('gallery.html','Gallery'),('give.html','Give'),('contact.html','Contact')]
WA = '2348079731695'

def nav(active):
    li = ''.join(f'<li><a href="{h}"{" class=\"active\"" if h==active else ""}>{t}</a></li>' for h,t in NAV_ITEMS)
    return ('<nav class="navbar" id="navbar" aria-label="Main">\n  <div class="nav-container">\n    <a href="index.html" class="nav-logo"><img class="logo-emblem" src="logo-mark.webp" width="44" height="44" alt="" decoding="async"><div class="logo-text"><span class="logo-main">CAC Good Works</span><span class="logo-sub">Assembly</span></div></a>\n'
            f'    <ul class="nav-links" id="navLinks">{li}<li><a href="admin-login.html" class="nav-admin">Admin</a></li></ul>\n'
            '    <button type="button" class="hamburger" id="hamburger" aria-label="Toggle menu"><span></span><span></span><span></span></button>\n  </div>\n</nav>')

FOOTER = '''<footer class="footer">
  <div class="container">
    <div class="footer-grid">
      <div class="footer-brand"><div class="footer-logo"><img class="logo-emblem" src="logo-mark.webp" width="44" height="44" alt="" decoding="async"><div class="logo-text"><span class="logo-main">CAC Good Works</span><span class="logo-sub">Assembly</span></div></div>
        <p>Seeking God's manifest presence, leading people towards Christ-like nature.</p></div>
      <div class="footer-links"><h4>Explore</h4><ul><li><a href="devotionals.html">Daily Devotional</a></li><li><a href="bible.html">Bible</a></li><li><a href="live.html">Live Service</a></li><li><a href="prayer-wall.html">Prayer Wall</a></li><li><a href="events.html">Events &amp; Calendar</a></li><li><a href="sermons.html">Sermons</a></li><li><a href="index.html#bbc">Believers Bible College</a></li><li><a href="testimonies.html">Testimonies</a></li><li><a href="impact.html">Our Impact</a></li></ul></div>
      <div class="footer-links"><h4>Get Involved</h4><ul><li><a href="visit.html">Plan Your Visit</a></li><li><a href="index.html#prayer">Prayer Request</a></li><li><a href="give.html">Give</a></li><li><a href="contact.html">Contact</a></li><li><a href="privacy.html">Privacy Policy</a></li><li><a href="terms.html">Terms of Use</a></li></ul></div>
      <div class="footer-links"><h4>Service Times</h4><ul><li><i class="fas fa-circle-dot"></i> Sunday 8:15 AM</li><li><i class="fas fa-circle-dot"></i> Wednesday 5:00 PM</li><li><i class="fas fa-circle-dot"></i> Times in Lagos (WAT)</li></ul></div>
    </div>
    <div class="footer-bottom"><p>© 2026 CAC Good Works Assembly. All Rights Reserved.</p></div>
  </div>
</footer>'''

HEAD_EXTRA = '''  <link rel="manifest" href="manifest.json"/>
  <meta name="theme-color" content="#0a0a0f"/>
  <link rel="icon" href="icon-64.png" type="image/png" sizes="64x64"/>
  <link rel="apple-touch-icon" href="icon-180.png"/>'''

def shell(fname, title, desc, active, body, scripts, hero):
    return f'''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>{title} — CAC Good Works Assembly</title>
  <meta name="description" content="{desc}"/>
  <meta property="og:title" content="{title} — CAC Good Works Assembly"/>
  <meta property="og:description" content="{desc}"/>
  <link rel="canonical" href="{fname}"/>
{HEAD_EXTRA}
  <link rel="preload" href="font-jost-latin.woff2" as="font" type="font/woff2" crossorigin/>
  <link rel="preload" href="font-cinzel-latin.woff2" as="font" type="font/woff2" crossorigin/>
  <link rel="preload" href="font-cormorant-latin.woff2" as="font" type="font/woff2" crossorigin/>
  <link rel="preload" href="icons-solid.woff2" as="font" type="font/woff2" crossorigin/>
  <link rel="preload" href="icons-regular.woff2" as="font" type="font/woff2" crossorigin/>
  <link rel="preload" href="icons-brands.woff2" as="font" type="font/woff2" crossorigin/>
  <link rel="stylesheet" href="fonts.css"/>
  <link rel="stylesheet" href="icons.css"/>
  <link rel="stylesheet" href="style.css"/>
  <link rel="stylesheet" href="pages.css"/>
<script src="theme.js"></script>
</head>
<body>
<a href="#main" class="skip-link">Skip to content</a>
{nav(active)}
<header class="page-hero"><div class="container">{hero}</div></header>
<main id="main">
{body}
</main>
{FOOTER}
<button type="button" class="scroll-top" id="scrollTop" aria-label="Scroll to top"><i class="fas fa-chevron-up"></i></button>
<a href="https://wa.me/{WA}?text=Hello%20CAC%20Good%20Works%20Assembly,%20I%20would%20like%20to%20make%20an%20enquiry." target="_blank" rel="noopener" class="floating-whatsapp" aria-label="Chat on WhatsApp"><i class="fab fa-whatsapp"></i><span class="wa-tooltip">Chat with us on WhatsApp</span><div class="wa-ripple"></div></a>
<script src="config.js"></script>
<script src="calendar-lib.js"></script>
<script src="edge.js"></script>
<script src="monitor.js"></script>
<script type="module" src="firebase.js"></script>
<script src="app.js"></script>
<script src="i18n.js"></script>
{"" if fname == "live.html" else '<script src="live.js"></script>'}
{scripts}
<script src="translate.js"></script>
<script src="sw-register.js"></script>
</body>
</html>
'''

def hero(h, p, extra=''):
    return f'<span class="section-tag">{h[0]}</span><h1>{h[1]}</h1><p>{p}</p>{extra}'

pages = {}

pages['events.html'] = shell('events.html','Events & Calendar','Church events, services and programmes. Add one or many to your Google, Outlook, Apple or Yahoo calendar.','events.html','''
<section class="sec"><div class="container">
  <h2 class="section-title" style="font-size:1.6rem;margin-bottom:6px">Regular services &amp; recurring programmes</h2>
  <p class="ev-desc" style="margin-bottom:20px">Add a repeating series once and your calendar keeps it up to date.</p>
  <div class="grid-auto" id="seriesGrid" aria-busy="true"><div class="skeleton" style="height:182px;margin:0" aria-hidden="true"></div><div class="skeleton" style="height:182px;margin:0" aria-hidden="true"></div><div class="skeleton" style="height:182px;margin:0" aria-hidden="true"></div><div class="skeleton" style="height:182px;margin:0" aria-hidden="true"></div><div class="skeleton" style="height:182px;margin:0" aria-hidden="true"></div></div>
</div></section>
<section class="sec alt" id="upcoming"><div class="container">
  <div id="evNotice" class="notice warn" hidden style="margin-bottom:16px" role="status"></div>
  <div class="ev-toolbar">
    <div class="ev-search"><i class="fas fa-search" aria-hidden="true"></i><label class="sr-only" for="evSearch">Search events</label><input id="evSearch" type="search" placeholder="Search events…" autocomplete="off"></div>
    <div class="seg" role="group" aria-label="View"><button type="button" data-view="list" aria-pressed="true"><i class="fas fa-list"></i> List</button><button type="button" data-view="month" aria-pressed="false"><i class="far fa-calendar"></i> Month</button></div>
  </div>
  <div class="ev-toolbar"><div class="chips" id="evChips" role="group" aria-label="Filter by type"></div></div>
  <div class="ev-toolbar no-print">
    <button type="button" class="btn-sm solid" id="selectAllTop"><i class="far fa-calendar-check"></i> Add all shown to my calendar</button>
    <button type="button" class="btn-sm" id="fullIcs"><i class="fas fa-download"></i> Download full calendar (.ics)</button>
    <span class="ev-desc" style="margin:0">Tick events to pick your own selection.</span>
  </div>
  <div class="ev-toolbar no-print" id="subRow"><span class="ev-desc" style="margin:0"><i class="fas fa-rotate"></i> Stay up to date automatically:</span>
    <a class="btn-sm" id="subWebcal" href="calendar.ics"><i class="fab fa-apple"></i> Subscribe (Apple / Outlook)</a>
    <a class="btn-sm" id="subGoogle" href="calendar.ics" target="_blank" rel="noopener" hidden><i class="fab fa-google"></i> Subscribe in Google</a>
    <button type="button" class="btn-sm" id="subCopy"><i class="far fa-copy"></i> Copy feed link</button>
  </div>
  <div id="evList" aria-live="polite"></div>
  <div id="evMonth" hidden></div>
</div></section>
<div class="selbar" id="selBar" role="region" aria-label="Selected events"><span id="selCount" aria-live="polite">0 events selected</span><button type="button" class="lnk" id="selAll">Select all shown</button><button type="button" class="lnk" id="selClear">Clear</button><button type="button" class="btn-sm solid" id="selAdd"><i class="far fa-calendar-plus"></i> Add to calendar</button></div>
<div class="modal-bg" id="bulkModal" hidden role="dialog" aria-modal="true" aria-labelledby="bulkTitle"><div class="modal">
  <button type="button" class="close" id="bulkClose" aria-label="Close">&times;</button>
  <h2 id="bulkTitle">Add <span id="bulkCount"></span> to your calendar</h2>
  <p class="sub">Times are saved in Lagos time (WAT) and automatically shown in your own timezone.</p>
  <button type="button" class="opt" id="bulkIcs"><i class="fas fa-file-arrow-down"></i><span><b>Download one calendar file (.ics)</b><small>Best choice: adds all events at once in Apple Calendar, Outlook, Google Calendar and others</small></span></button>
  <button type="button" class="opt" id="bulkGoogle"><i class="fab fa-google"></i><span><b>Google Calendar</b><small>Opens each event ready to save</small></span></button>
  <button type="button" class="opt" id="bulkOutlook"><i class="fab fa-microsoft"></i><span><b>Outlook.com</b><small>Opens each event ready to save</small></span></button>
  <button type="button" class="opt" id="bulkYahoo"><i class="fab fa-yahoo"></i><span><b>Yahoo Calendar</b><small>Opens each event ready to save</small></span></button>
  <div id="bulkLinks" hidden></div>
</div></div>
<div class="toast" id="evToast" role="status" aria-live="polite" style="bottom:90px"></div>
''', '<script src="qrcode.js"></script>\n<script src="rsvp.js"></script>\n<script src="events.js"></script>', hero(('Programmes','Events &amp; Calendar'),'Join us for services, fellowships, prayer and special programmes. Add any event, or all of them, straight to your calendar.'))

pages['devotionals.html'] = shell('devotionals.html','Daily Devotional','Begin each day in His presence. Read today\'s devotional, browse the archive and keep a private reading journal.','devotionals.html','''
<section class="sec" id="dvTop"><div class="container"><div class="dv-wrap">
  <div><article class="dv-article" id="dvArticle" aria-live="polite"></article><p id="dvFlash" class="ev-desc" role="status" aria-live="polite"></p></div>
  <aside class="dv-side" aria-label="Devotional archive and tools">
    <div class="card"><h4>Your reading</h4><div class="streak" id="dvStreak">0</div><div class="ev-desc" style="margin:0 0 12px">day streak · <span id="dvReadTotal">0</span> read on this device</div>
      <div class="dv-notes"><label class="sr-only" for="dvNotes">Private notes for this devotional</label><textarea id="dvNotes" placeholder="Private reflection notes (saved only on this device)…"></textarea></div></div>
    <div class="card"><h4>Browse archive</h4><div class="dv-filters">
      <label class="sr-only" for="dvSearch">Search devotionals</label><input id="dvSearch" type="search" placeholder="Search title, scripture, author…">
      <label class="sr-only" for="dvTopic">Topic</label><select id="dvTopic"><option value="">All topics</option></select>
      <label class="ev-desc" style="margin:0" for="dvJump">Jump to date</label><input id="dvJump" type="date"></div>
      <div class="dv-list" id="dvList" style="margin-top:12px"></div><button type="button" class="btn-sm" id="dvMore" hidden style="margin-top:10px">Load more</button></div>
    <div class="card" id="dvRemind"><h4>Daily reminder</h4>
      <p class="ev-desc">Get a reminder in your own calendar every day. Free; nothing is sent to us.</p>
      <div class="f-group" style="margin-bottom:12px"><label for="remindTime">Time (your local time)</label><input id="remindTime" type="time" value="06:00"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn-sm" id="remGoogle" href="#" target="_blank" rel="noopener"><i class="fab fa-google"></i> Google</a><button type="button" class="btn-sm" id="remIcs"><i class="fas fa-file-arrow-down"></i> Apple / Outlook (.ics)</button></div>
      <p class="ev-desc" style="margin:14px 0 0"><a href="devotionals.xml" style="color:var(--gold)"><i class="fas fa-rss"></i> RSS feed</a> for feed readers and podcast-style apps.</p>
      <div id="dvPushBox" hidden></div></div>
    <div class="card" id="dvAccount" hidden></div>
    <div class="card"><h4>Bookmarks</h4><div class="dv-list" id="dvBm"></div></div>
    <div data-bbc="compact" style="min-height:440px"></div>
    <div id="dvRelated" class="card dv-list" style="display:contents"></div>
  </aside>
</div></div></section>
<section class="sec alt"><div class="container" style="text-align:center"><p class="ev-desc">Personal notes, bookmarks and streaks are stored privately on your device and are never sent to the church.</p></div></section>
''', '<script src="scripture.js"></script>\n<script src="listen.js"></script>\n<script src="devotionals.js"></script>\n<script src="member.js"></script>\n<script src="push.js"></script>\n<script src="bbc.js"></script>', hero(('Daily Devotional','Grow in the Word Every Day'),'“Begin Each Day in His Presence.”'))

pages['visit.html'] = shell('visit.html','Plan Your Visit','Service times, what to expect and a simple visitor registration for CAC Good Works Assembly.','','''
<section class="sec"><div class="container"><div class="grid-auto">
  <div class="card"><h3><i class="far fa-clock" style="color:var(--gold)"></i> Service times</h3><p class="ev-desc">Sunday Service — 8:15 AM<br>Midweek Service (Wednesday) — 5:00 PM<br>Fasting &amp; Prayer — last 3 days of every month<br><small>All times Lagos (WAT, UTC+1)</small></p><a class="btn-sm" href="events.html">View calendar</a></div>
  <div class="card"><h3><i class="fas fa-location-dot" style="color:var(--gold)"></i> Find us</h3><p class="ev-desc">CAC Good Works Assembly, Ijebu-ode, Ogun State, Nigeria.</p><a class="btn-sm" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=CAC+Good+Works+Assembly+Ijebu-ode">Get directions</a></div>
  <div class="card"><h3><i class="fas fa-hands-praying" style="color:var(--gold)"></i> What to expect</h3><p class="ev-desc">A warm welcome, Spirit-filled worship, practical Bible teaching and prayer. Come as you are; there is no dress code and children are welcome.</p></div>
  <div class="card"><h3><i class="fas fa-universal-access" style="color:var(--gold)"></i> Accessibility</h3><p class="ev-desc">Please tell us in advance of any access or seating needs and we will gladly prepare for you.</p></div>
</div></div></section>
<section class="sec alt"><div class="container"><form class="form-card" id="visitForm" novalidate>
  <h2 style="margin-bottom:6px">Let us know you're coming</h2><p class="ev-desc" style="margin-bottom:22px">Optional, but it helps us welcome you personally.</p>
  <div class="hp" aria-hidden="true"><label>Website <input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
  <div class="f-row"><div class="f-group"><label for="vName">Full name *</label><input type="text" id="vName" name="name" required maxlength="80" autocomplete="name"></div>
  <div class="f-group"><label for="vDate">Planned visit date</label><input id="vDate" name="visitDate" type="date"></div></div>
  <div class="f-row"><div class="f-group"><label for="vEmail">Email</label><input id="vEmail" name="email" type="email" maxlength="120" autocomplete="email"></div>
  <div class="f-group"><label for="vPhone">Phone / WhatsApp</label><input id="vPhone" name="phone" type="tel" maxlength="25" autocomplete="tel"></div></div>
  <div class="f-group"><label for="vGuests">Number of people</label><select id="vGuests" name="guests"><option>1</option><option>2</option><option>3</option><option>4</option><option>5+</option></select></div>
  <div class="f-group"><label for="vMsg">Message</label><textarea id="vMsg" name="message" rows="3" maxlength="1000"></textarea></div>
  <label class="f-check"><input type="checkbox" name="consent"> I agree that the church may contact me about my visit. *</label>
  <button class="btn btn-primary" type="submit" style="width:100%;justify-content:center">Register my visit</button><div class="f-msg" aria-live="polite"></div>
</form></div></section>''','<script src="forms.js"></script>', hero(('Plan Your Visit','You are welcome here'),'Everything you need for your first Sunday with us.'))

pages['testimonies.html'] = shell('testimonies.html','Testimonies','Read and share what God has done. All testimonies are reviewed with consent before publishing.','','''
<section class="sec"><div class="container"><div class="grid-auto" id="testimonyList" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr))"><div class="skeleton"></div></div></div></section>
<section class="sec alt"><div class="container"><form class="form-card" id="testimonyForm" novalidate>
  <h2 style="margin-bottom:6px">Share your testimony</h2><p class="ev-desc" style="margin-bottom:22px">Submissions are reviewed by our team and are never published without your consent.</p>
  <div class="hp" aria-hidden="true"><label>Website <input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
  <div class="f-row"><div class="f-group"><label for="tName">Name</label><input type="text" id="tName" name="name" maxlength="80" autocomplete="name"></div><div class="f-group"><label for="tCountry">Country / city</label><input type="text" id="tCountry" name="country" maxlength="60"></div></div>
  <div class="f-group"><label for="tEmail">Email (private, optional)</label><input id="tEmail" name="email" type="email" maxlength="120"></div>
  <div class="f-group"><label for="tStory">Your testimony *</label><textarea id="tStory" name="story" rows="6" maxlength="3000" required></textarea></div>
  <label class="f-check"><input type="checkbox" name="anonymous"> Publish anonymously</label>
  <label class="f-check"><input type="checkbox" name="consent"> I consent to CAC Good Works Assembly reviewing and publishing my testimony on its website. *</label>
  <button class="btn btn-primary" type="submit" style="width:100%;justify-content:center">Submit testimony</button><div class="f-msg" aria-live="polite"></div>
</form></div></section>''','<script src="forms.js"></script>', hero(('Testimonies','What God Has Done'),'Real stories from our church family.'))

pages['impact.html'] = shell('impact.html','Our Impact','Outreach, missions and community service from CAC Good Works Assembly.','','''
<section class="sec"><div class="container"><div class="empty" style="max-width:640px;margin:0 auto"><i class="fas fa-hand-holding-heart"></i>
<h2 style="margin-bottom:10px">Impact reports are coming soon</h2>
<p>We only publish verified outreach reports, photographs and stories approved by church leadership. Check back soon, or <a href="contact.html" style="color:var(--gold)">contact us</a> to partner with our outreach team.</p></div></div></section>''','', hero(('Our Impact','Serving Our Community'),'Outreach, missions and community service.'))

pages['give.html'] = shell('give.html','Give','Support the work of CAC Good Works Assembly through tithes, offerings and special giving.','give.html','''
<section class="sec"><div class="container"><div class="grid-auto">
  <div class="card"><h3>Tithes &amp; offerings</h3><p class="ev-desc">Honouring God with our first fruits and supporting the ongoing work of the church.</p></div>
  <div class="card"><h3>Special seed &amp; projects</h3><p class="ev-desc">Support building, outreach and missions projects as announced by church leadership.</p></div>
  <div class="card"><h3>Bank transfer</h3><p class="ev-desc">Please confirm the current account details on the <a style="color:var(--gold)" href="index.html#giving">homepage giving section</a> or from the church office before sending.</p></div>
</div>
<div id="giveOff"><div class="notice" style="margin-top:28px;max-width:760px"><i class="fas fa-shield-halved"></i> Online card payments are not enabled yet. When a payment provider is connected, transactions will be verified server-side before they are recorded. This site never stores card details.</div></div>
<div id="giveResult" class="card" style="margin-top:28px;max-width:760px" role="status" aria-live="polite" hidden></div>
<form id="giveForm" class="card" style="margin-top:28px;max-width:760px" novalidate hidden>
  <h3 style="margin-top:0">Give securely online</h3><p class="ev-desc">Payment is made on your payment provider's own secure page (card, bank transfer or USSD). We never see your card details.</p>
  <fieldset id="giveProv" class="f-group" hidden style="border:0;padding:0"><legend>Pay with</legend><label style="margin-right:18px"><input type="radio" name="provider" value="paystack" checked> Paystack</label><label><input type="radio" name="provider" value="flutterwave"> Flutterwave</label></fieldset>
  <div class="f-group"><label for="gAmount">Amount (₦)</label><input id="gAmount" name="amount" type="number" inputmode="numeric" min="100" max="5000000" step="1" placeholder="5000" required></div>
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin:-6px 0 14px"><button type="button" class="btn-sm" data-amt="1000">₦1,000</button><button type="button" class="btn-sm" data-amt="5000">₦5,000</button><button type="button" class="btn-sm" data-amt="10000">₦10,000</button><button type="button" class="btn-sm" data-amt="50000">₦50,000</button></div>
  <div class="f-group"><label for="gPurpose">I am giving towards</label><select id="gPurpose" name="purpose"><option value="offering">Offering</option><option value="tithe">Tithe</option><option value="missions">Missions &amp; outreach</option><option value="building">Building project</option><option value="other">Other</option></select></div>
  <div class="f-group"><label for="gName">Name (optional)</label><input id="gName" name="name" type="text" maxlength="60" autocomplete="name"></div>
  <div class="f-group"><label for="gEmail">Email (for your receipt)</label><input id="gEmail" name="email" type="email" maxlength="120" autocomplete="email" required></div>
  <p id="giveMsg" class="f-msg" role="status" aria-live="polite"></p><button type="submit" class="btn-sm solid">Give securely</button>
  <p class="ev-desc" style="margin-top:14px">We keep only the amount, purpose and optional name (never your email or card details). Gifts are verified with the payment provider before they are counted.</p>
</form></div></section>''','<script src="give.js"></script>', hero(('Giving','Give Cheerfully'),'“God loves a cheerful giver.” — 2 Corinthians 9:7'))


pages['bible.html'] = shell('bible.html','Bible','Read the Bible online (KJV and World English Bible), follow a reading plan, and share the verse of the day.','bible.html','''
<section class="sec"><div class="container">
  <div class="grid-auto" style="margin-bottom:28px"><div class="card" id="votd"><h3>Verse of the day</h3><p class="ev-desc" id="votdRef" style="color:var(--gold)"></p><p id="votdText" style="font-family:'Cormorant Garamond',serif;font-size:1.35rem;line-height:1.5;min-height:3em"></p>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn-sm" id="votdOpen">Read in context</button><button type="button" class="btn-sm" id="votdShare"><i class="fas fa-share-nodes"></i> Share as image</button></div></div></div>
  <div id="bTop" class="card" style="margin-bottom:28px">
    <form id="bForm" style="display:flex;gap:10px;flex-wrap:wrap;align-items:end" role="search">
      <div class="f-group" style="flex:1;min-width:220px;margin:0"><label for="bRef">Go to a passage</label><input id="bRef" type="text" placeholder="John 3:16 · Psalm 23 · Rom 8:28-30" autocomplete="off"></div>
      <div class="f-group" style="margin:0"><label for="bVer">Translation</label><select id="bVer"><option value="KJV">KJV (King James)</option><option value="WEB">WEB (World English)</option></select></div>
      <button type="submit" class="btn-sm">Go</button></form>
    <p id="bFlash" class="ev-desc" role="status" aria-live="polite" style="min-height:1.4em;margin:10px 0 0"></p>
    <div id="bText" class="sc-reader" aria-live="polite"></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px"><button type="button" class="btn-sm" id="bPrev" hidden><i class="fas fa-chevron-left"></i> Previous chapter</button><button type="button" class="btn-sm" id="bNext" hidden>Next chapter <i class="fas fa-chevron-right"></i></button>
      <span id="bTools" hidden style="display:contents"><button type="button" class="btn-sm" id="bCopy"><i class="fas fa-copy"></i> Copy</button><button type="button" class="btn-sm" id="bShare"><i class="fas fa-share-nodes"></i> Share as image</button></span></div>
    <p class="ev-desc" style="margin-top:16px">Texts: King James Version and World English Bible, both public domain.</p></div>
  <h2 style="margin:0 0 6px">Reading plans</h2><p class="ev-desc" style="margin:0 0 18px">Progress is saved on this device. Sign in on the <a href="devotionals.html" style="color:var(--gold)">devotional page</a> to keep it in sync across your devices.</p>
  <div class="grid-auto" id="plans"></div>
</div></section>
''', '<script src="config.js"></script>\n<script src="calendar-lib.js"></script>\n<script src="scripture.js"></script>\n<script src="member.js"></script>\n<script src="bible.js"></script>', hero(('The Word','Read &amp; Meditate'),'“Your word is a lamp to my feet and a light to my path.”'))


pages['live.html'] = shell('live.html','Live Service','Watch our service live and follow the sermon notes and scriptures in real time.','live.html','''
<section class="sec"><div class="container">
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap"><span class="live-chip" id="liveStatus" role="status" aria-live="polite">Loading…</span><h2 id="liveHead" style="margin:0;font-size:1.5rem">Live Service</h2></div>
  <div id="liveStage" style="margin-bottom:28px"></div>
  <div class="card"><div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center"><h2 style="margin:0;font-size:1.4rem">Sermon notes &amp; scriptures</h2>
    <label class="ev-desc" style="margin:0"><input type="checkbox" id="liveAuto" checked> Follow along (auto-scroll)</label></div>
    <ul id="liveNotes" class="live-notes" aria-live="polite"></ul>
    <p class="ev-desc" style="margin-top:14px">Tap any scripture to read it in KJV or WEB.</p></div>
</div></section>
''', '<script src="config.js"></script>\n<script src="calendar-lib.js"></script>\n<script src="media.js"></script>\n<script src="scripture.js"></script>\n<script src="live.js"></script>', hero(('Live','Join the Service'),'“Where two or three gather in my name, there am I with them.”'))


pages['prayer-wall.html'] = shell('prayer-wall.html','Prayer Wall','Stand with others in prayer: requests our pastoral team has approved to share. Tap I prayed to encourage someone.','prayer-wall.html','''
<section class="sec"><div class="container">
  <p class="ev-desc" style="max-width:640px;margin:0 0 24px">These requests were shared with permission and reviewed by our pastoral team. No names or contact details are shown. Tap <strong>I prayed</strong> so the person knows they are not alone. Want us to pray for you? <a href="index.html#prayer" style="color:var(--gold)">Send a request</a>.</p>
  <div id="wallList" class="grid-auto" aria-live="polite"><p class="ev-desc">Loading…</p></div>
</div></section>
''', '<script src="wall.js"></script>', hero(('Prayer','Stand With Us'),'“Carry each other’s burdens, and in this way you will fulfill the law of Christ.”'))


pages['ticket.html'] = shell('ticket.html','My Ticket','Your event reservation and QR ticket.','ticket.html','''
<section class="sec"><div class="container" style="max-width:560px"><div id="ticketRoot" aria-live="polite"><p class="ev-desc">Loading…</p></div></div></section>
''', '<script src="qrcode.js"></script>\n<script src="rsvp.js"></script>\n<script src="ticket.js"></script>', hero(('Event','Your Ticket'),'“Let all things be done decently and in order.”'))

NOTE = '''<div class="notice" style="margin-bottom:28px"><i class="fas fa-circle-info"></i> Template prepared for the church. Retention periods and contact details below are proposed defaults and should be confirmed by church leadership and, ideally, reviewed by a Nigerian legal adviser before publication.</div>'''

privacy_body = '''
<section class="sec"><div class="container legal">
__NOTE__
<p class="ev-desc">Last updated: <time datetime="2026-10-15">15 October 2026</time></p>
<h2>1. Who we are</h2><p>CAC Good Works Assembly, Ijebu-ode, Ogun State, Nigeria (“the church”, “we”) operates this website. Questions about your data: <a href="mailto:cacgoodworksassembly@gmail.com">cacgoodworksassembly@gmail.com</a>. This policy is written to meet the Nigeria Data Protection Act 2023 and, for visitors in the UK/EU, the principles of the GDPR.</p>
<h2>2. What we collect and why</h2>
<div class="table-scroll" tabindex="0" role="region" aria-label="Data we collect (scrollable table)"><table class="legal-table"><thead><tr><th scope="col">Information</th><th scope="col">When</th><th scope="col">Why (lawful basis)</th><th scope="col">Who can see it</th><th scope="col">Kept for</th></tr></thead><tbody>
<tr><td>Prayer requests (name, phone, request)</td><td>You submit the prayer form</td><td>To pray with and follow up with you (consent)</td><td>Designated pastoral staff only</td><td>Up to 12 months, then deleted</td></tr>
<tr><td>Visit registration and contact messages</td><td>You submit those forms</td><td>To welcome you and reply (consent)</td><td>Authorised church staff</td><td>Up to 12 months</td></tr>
<tr><td>Testimonies (name, country, story, optional email)</td><td>You submit the form</td><td>To publish only after review, with your consent</td><td>Staff; the public only if approved</td><td>Until you ask us to remove it</td></tr>
<tr><td>Newsletter email</td><td>You subscribe</td><td>To send church updates (consent)</td><td>Authorised staff</td><td>Until you unsubscribe</td></tr>
<tr><td>Admin account (email) and activity log of admin actions</td><td>Church staff sign in and edit content</td><td>Security, accountability and access control (legitimate interest)</td><td>Administrators (activity log: Super Admins only)</td><td>Account while the person serves; activity log up to 24 months</td></tr>
</tbody></table></div>
<p>We do <strong>not</strong> sell personal data, run advertising trackers, or use analytics cookies. Giving: this site does not process card payments or store card details.</p>
<h2>3. Stored on your own device</h2><p>Your browser keeps, on your device only: devotional bookmarks, read history, reading streak, private notes, text size, and your chosen language. These are never sent to us. You can clear them in your browser settings.</p>
<h2>4. Third-party services</h2><ul>
<li><strong>Google Firebase</strong> (Firestore and Authentication) hosts the data above. Data may be processed outside Nigeria under Google’s safeguards.</li>
<li><strong>Google Translate</strong> loads <em>only if you choose a language</em>. Google then receives the page text to translate it and may set a cookie (googtrans).</li>
<li><strong>YouTube and Google Maps</strong> embeds may set their own cookies when they load.</li>
<li><strong>WhatsApp</strong>: if you tap the chat button, your conversation is governed by WhatsApp’s terms.</li></ul>
<h2>5. Sensitive information</h2><p>Prayer requests can reveal health, family or religious beliefs. Please share only what you are comfortable with. You may submit without a full name. We restrict access to pastoral staff and delete requests after the period above.</p>
<h2>6. Your rights</h2><p>You may ask to access, correct, delete, or restrict the use of your data, withdraw consent at any time, or object to processing. Email us and we will respond within 30 days. You may also complain to the Nigeria Data Protection Commission (<a href="https://ndpc.gov.ng" rel="noopener" target="_blank">ndpc.gov.ng</a>).</p>
<h2>7. Children</h2><p>Parents or guardians should supervise anyone under 18 using the forms. We do not knowingly collect data from children without parental consent.</p>
<h2>8. Security</h2><p>Data is protected by access rules, encrypted connections (HTTPS), and role-based administrator access. No system is perfectly secure; if a breach affecting you occurs we will notify you and the regulator as required by law.</p>
<h2>9. Changes</h2><p>We will update the date above when this policy changes.</p>
</div></section>'''
pages['privacy.html'] = shell('privacy.html','Privacy Policy','How CAC Good Works Assembly collects, uses and protects your personal information.','',privacy_body.replace('__NOTE__', NOTE),'', hero(('Legal','Privacy Policy'),'Your trust matters. Here is exactly what we do with your information.'))

terms_body = '''
<section class="sec"><div class="container legal">
__NOTE__
<p class="ev-desc">Last updated: <time datetime="2026-10-15">15 October 2026</time></p>
<h2>1. Using this website</h2><p>This site is provided free by CAC Good Works Assembly for worship, teaching and fellowship. By using it you agree to use it lawfully and respectfully.</p>
<h2>2. Content</h2><p>Devotionals, sermons, images and text belong to the church or their credited authors. You may share links and print devotionals for personal and ministry use. Please do not sell or alter our content. Scripture quotations remain the property of their respective Bible publishers.</p>
<h2>3. Submissions</h2><p>When you submit a testimony, message or prayer request you confirm it is yours to share and that it is truthful and not abusive, unlawful or promotional. Testimonies are published only after review and with your consent; we may edit for length or clarity and may decline any submission.</p>
<h2>4. Prayer and pastoral care</h2><p>Prayer requests are not an emergency service. In an emergency contact local emergency services; for urgent pastoral help call the church office.</p>
<h2>5. Giving</h2><p>Gifts are voluntary. Always confirm bank details with the church office before transferring.</p>
<h2>6. Translation and accuracy</h2><p>Automatic translation is provided by Google and may contain errors. The English text is the authoritative version. Event times are in Lagos time (WAT, UTC+1) and may change; please confirm with the church.</p>
<h2>7. Liability</h2><p>We work to keep the site accurate and available but provide it “as is”, without warranty, to the extent permitted by law.</p>
<h2>8. Governing law</h2><p>These terms are governed by the laws of the Federal Republic of Nigeria.</p>
<h2>9. Contact</h2><p><a href="mailto:cacgoodworksassembly@gmail.com">cacgoodworksassembly@gmail.com</a></p>
</div></section>'''
pages['terms.html'] = shell('terms.html','Terms of Use','Terms of use for the CAC Good Works Assembly website.','',terms_body.replace('__NOTE__', NOTE),'', hero(('Legal','Terms of Use'),'Simple, fair terms for using our website.'))

for name, html in pages.items():
    (ROOT/name).write_text(html, encoding='utf-8'); print('wrote', name)

# ---- patch existing pages ----
for name in ['index.html','about.html','ministries.html','sermons.html','gallery.html','contact.html']:
    p = ROOT/name; s = p.read_text(encoding='utf-8')
    s = re.sub(r'<nav class="navbar" id="navbar">.*?</nav>', lambda m: nav(name), s, count=1, flags=re.S)
    s = s.replace('wa.me/2348000000000', f'wa.me/{WA}')
    if 'manifest.json' not in s: s = s.replace('</head>', HEAD_EXTRA + '\n</head>', 1)
    s = re.sub(r'<script src="theme\.js"></script>\n', '', s); s = s.replace('</head>', '<script src="theme.js"></script>\n</head>', 1)   # applied before first paint
    if 'prayer-wall.html' not in s and 'live.html">Live' in s:
        s = s.replace('<li><a href="live.html">Live Service</a></li>', '<li><a href="live.html">Live Service</a></li><li><a href="prayer-wall.html">Prayer Wall</a></li>', 1)
    if 'live.html">Live' not in s and 'bible.html">Bible' in s:
        s = s.replace('<li><a href="bible.html">Bible</a></li>', '<li><a href="bible.html">Bible</a></li><li><a href="live.html">Live Service</a></li><li><a href="prayer-wall.html">Prayer Wall</a></li>', 1)
    if 'bible.html">Bible' not in s:   # footer link on pages whose footer is hand-written
        s = s.replace('<li><a href="devotionals.html">Daily Devotional</a></li>', '<li><a href="devotionals.html">Daily Devotional</a></li><li><a href="bible.html">Bible</a></li><li><a href="live.html">Live Service</a></li><li><a href="prayer-wall.html">Prayer Wall</a></li>', 1)
    # idempotent: strip every earlier copy (plain OR deferred) before re-inserting exactly one
    s = re.sub(r'<script (?:defer )?src="(?:config|calendar-lib|edge|monitor)\.js"></script>\n', '', s)
    m = re.search(r'<script type="module" src="firebase.js"></script>|<script (?:defer )?src="app.js"></script>', s)
    s = s[:m.start()] + '<script src="config.js"></script>\n<script src="calendar-lib.js"></script>\n<script src="edge.js"></script>\n<script src="monitor.js"></script>\n' + s[m.start():]
    s = re.sub(r'<script (?:defer )?src="i18n\.js"></script>\n', '', s)
    s = re.sub(r'<script (?:defer )?src="live\.js"></script>\n', '', s)   # live-now banner on every page
    s = re.sub(r'(<script (?:defer )?src="app\.js"></script>\n)', r'\1<script src="i18n.js"></script>\n<script src="live.js"></script>\n', s, count=1)
    if 'translate.js' not in s:
        s = s.replace('</body>', '<script src="translate.js"></script>\n<script src="sw-register.js"></script>\n</body>', 1)
    if 'firebase.js' not in s:
        s = re.sub(r'(<script (?:defer )?src="app.js"></script>)', r'<script type="module" src="firebase.js"></script>\n\1', s, count=1)
    if 'privacy.html' not in s and '<footer' in s:
        s = s.replace('<p>© 2026 CAC Good Works Assembly. All Rights Reserved.</p>', '<p>© 2026 CAC Good Works Assembly. All Rights Reserved. · <a href="privacy.html">Privacy</a> · <a href="terms.html">Terms</a></p>', 1)
    if '<footer' not in s:
        s = s.replace('<button type="button" class="scroll-top"', FOOTER + '\n\n<button class="scroll-top"', 1)
    if False:
        s = s.replace('<body>', '<body>\n<a href="#main" class="skip-link">Skip to content</a>', 1)
        s = s.replace('</style>\n</head>', '</style>\n<link rel="stylesheet" href="pages.css"/>\n</head>', 1) if 'pages.css' not in s else s
    p.write_text(s, encoding='utf-8'); print('patched', name)

# ---- post-pass: defer our own classic scripts on PUBLIC pages (never block first paint). Admin pages keep sync order. ----
for p in ROOT.glob('*.html'):
    if p.name.startswith('admin-'): continue
    s = p.read_text(encoding='utf-8')
    s2 = re.sub(r'<script src="((?:config|calendar-lib|edge|monitor|i18n|member|push|wall|listen|qrcode|rsvp|ticket|give|scripture|bible|live|media|sw-register|app|home|translate|events|devotionals|forms|bbc)\.js)"></script>', r'<script defer src="\1"></script>', s)
    if s2 != s: p.write_text(s2, encoding='utf-8')

p = ROOT/'devotionals.html'; s = p.read_text(encoding='utf-8')
if 'application/rss+xml' not in s:
    p.write_text(s.replace('<link rel="manifest" href="manifest.json"/>', '<link rel="manifest" href="manifest.json"/>\n  <link rel="alternate" type="application/rss+xml" title="CAC Good Works Daily Devotional" href="devotionals.xml"/>', 1), encoding='utf-8')
