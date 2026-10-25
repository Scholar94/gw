#!/usr/bin/env python3
"""Usage: python3 build-seo.py https://your-domain.org
Stamps canonical/Open Graph/Twitter tags + Church JSON-LD into public pages and writes sitemap.xml + robots.txt.
Idempotent: re-run whenever the domain changes."""
import sys, re, json, pathlib, datetime
ROOT = pathlib.Path(__file__).resolve().parent
SITE = (sys.argv[1] if len(sys.argv) > 1 else 'https://example.org').rstrip('/')
PUBLIC = ['index','about','ministries','devotionals','bible','live','prayer-wall','sermons','events','gallery','give','contact','visit','testimonies','impact','privacy','terms']
PRIORITY = {'index':'1.0','devotionals':'0.9','events':'0.9','sermons':'0.8'}
church = {"@context":"https://schema.org","@type":"Church","name":"CAC Good Works Assembly","url":SITE+'/',"telephone":"+2348079731695",
  "image":SITE+"/og-image.png","address":{"@type":"PostalAddress","addressLocality":"Ijebu-ode","addressRegion":"Ogun State","addressCountry":"NG"}}
for n in PUBLIC:
    p = ROOT/f'{n}.html'; s = p.read_text(encoding='utf-8')
    url = SITE + ('/' if n == 'index' else f'/{n}.html')
    title = re.search(r'<title>(.*?)</title>', s, re.S).group(1).strip()
    m = re.search(r'<meta name="description" content="([^"]*)"', s); desc = m.group(1) if m else title
    block = ('<!-- seo:start -->\n'
      f'  <link rel="canonical" href="{url}"/>\n  <meta property="og:type" content="{"website" if n=="index" else "article" if n=="devotionals" else "website"}"/>\n'
      f'  <meta property="og:site_name" content="CAC Good Works Assembly"/>\n  <meta property="og:url" content="{url}"/>\n  <meta property="og:title" content="{title}"/>\n'
      f'  <meta property="og:description" content="{desc}"/>\n  <meta property="og:image" content="{SITE}/og-image.png"/>\n  <meta property="og:image:width" content="1200"/>\n  <meta property="og:image:height" content="630"/>\n'
      '  <meta name="twitter:card" content="summary_large_image"/>\n'
      + (f'  <script type="application/ld+json">{json.dumps(church, ensure_ascii=False)}</script>\n' if n=='index' else '') + '  <!-- seo:end -->')
    s = re.sub(r'\s*<!-- seo:start -->.*?<!-- seo:end -->', '', s, flags=re.S)
    s = re.sub(r'\s*<link rel="canonical"[^>]*>', '', s)
    s = re.sub(r'\s*<meta property="og:(title|description)"[^>]*>', '', s)
    s = s.replace('</head>', '  ' + block + '\n</head>', 1)
    p.write_text(s, encoding='utf-8')
today = datetime.date.today().isoformat()
urls = ''.join(f'  <url><loc>{SITE}{"/" if n=="index" else f"/{n}.html"}</loc><lastmod>{today}</lastmod><priority>{PRIORITY.get(n,"0.6")}</priority></url>\n' for n in PUBLIC)
(ROOT/'sitemap.xml').write_text(f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{urls}</urlset>\n')
(ROOT/'robots.txt').write_text(f'User-agent: *\nAllow: /\nDisallow: /admin-login.html\nDisallow: /admin-dashboard.html\nDisallow: /ticket.html\n\nSitemap: {SITE}/sitemap.xml\n')
for n in ['admin-login','admin-dashboard','ticket']:   # keep admin out of search engines
    p = ROOT/f'{n}.html'; s = p.read_text(encoding='utf-8')
    if 'noindex' not in s: p.write_text(s.replace('</head>', '  <meta name="robots" content="noindex,nofollow"/>\n</head>', 1), encoding='utf-8')
print('SEO built for', SITE)
