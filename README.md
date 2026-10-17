# CAC Good Works Assembly: Website

A static website (HTML/CSS/JS, **no build step to run it**) with Firebase for the database and admin sign-in.
Everything lives in **one flat folder** (the only exception is `.github/`, which GitHub requires for automation).

## Project layout

Files are grouped by a naming convention, so related files sort together:

| Pattern | What it is |
|---|---|
| `index.html`, `about.html`, `ministries.html`, `devotionals.html`, `sermons.html`, `events.html`, `gallery.html`, `give.html`, `contact.html`, `visit.html`, `testimonies.html`, `impact.html`, `privacy.html`, `terms.html` | Public pages |
| `admin-login.html`, `admin-dashboard.html`, `admin-style.css`, `upload.js` | Admin area |
| `style.css`, `pages.css`, `fonts.css`, `icons.css` | Stylesheets |
| `config.js` | **Edit this:** church details, services, social links, YouTube channel ID |
| `app.js`, `home.js`, `events.js`, `devotionals.js`, `forms.js`, `translate.js`, `calendar-lib.js`, `firebase.js`, `sw.js` | Scripts (`firebase.js` holds your Firebase keys) |
| `font-*.woff2`, `icons-*.woff2`, `og-image.png`, `icon.svg` | Self-hosted fonts, icons and images |
| `calendar.ics`, `devotionals.xml`, `sitemap.xml`, `robots.txt`, `manifest.json` | Feeds and metadata |
| `firestore.rules`, `firestore.indexes.json`, `storage.rules`, `firebase.json`, `csp.json`, `_headers` | Security and hosting |
| `build-*.py` | Generators (pages, SEO tags/sitemap, icon subset, fonts) |
| `job-*.mjs` | The daily automation (publish scheduled devotionals, refresh feeds) |
| `test-*` | Test suites |
| `LICENSE-*`, `THIRD-PARTY-LICENSES.md` | Licences |
| `.github/workflows/` | CI tests and the daily job (**must** stay here for GitHub to run them) |

## Go live (one-time Firebase setup)
1. Create a Firebase project → add a Web app → paste the config into `firebase.js`.
2. Enable **Authentication → Email/Password** and **Firestore** (free Spark plan). **Do not enable Storage** unless you choose a paid plan: audio/gallery in the admin accept a pasted link instead (e.g. archive.org for audio, YouTube for video).
3. Create your admin user (Authentication tab), then in Firestore create `admins/{that user's UID}` with `{ role: "super" }` (roles: `super`, `editor` = content, `pastoral` = prayer requests/visitors). Admins can't be created from the website.
4. Deploy rules + indexes: `firebase deploy --only firestore` (add `,storage` only if you enabled Storage).
5. Host with `firebase deploy --only hosting` (Firebase Hosting, free) or Cloudflare Pages (free). Both apply the security headers.
6. **Scheduled publishing + feeds (free, no card):** in GitHub → Settings → Secrets, add `FIREBASE_SERVICE_ACCOUNT` (Firebase console → Project settings → Service accounts → Generate new private key; paste the JSON) and, under Variables, `SITE_URL` (e.g. `https://yourchurch.org`). `.github/workflows/daily.yml` then runs daily at 00:05 Lagos time: it publishes scheduled devotionals and regenerates `devotionals.xml` (RSS) and `calendar.ics` (subscribable calendar). Never commit the key.
7. Run `python3 build-seo.py https://yourchurch.org` once so the sitemap, canonical and share tags use your real domain.

Until step 1 is done, public pages run in **preview mode**: forms say they're not connected (they never fake success) and the admin area is locked.

## Everything here is free and needs no credit card
| Need | Free solution used |
|---|---|
| Database + admin login | Firebase **Spark** plan (Firestore + Authentication) |
| Scheduled publishing, RSS, subscribable calendar | **GitHub Actions** (`daily.yml`) |
| Hosting | Firebase Hosting, Cloudflare Pages, or GitHub Pages* |
| Audio / images | Paste a link (archive.org, GitHub + jsDelivr); video via YouTube |
| Reminders instead of push notifications | A repeating event in the visitor's own calendar |
| Backups | Admin → Backup (JSON/CSV download) |

\*GitHub Pages cannot send custom security headers, so the CSP only applies on Firebase Hosting or Cloudflare Pages. Avoided because they need a card: Cloud Functions, Firebase Storage (new projects), email/SMS services, true push notifications.

## Features
Daily devotionals (archive, search, print/share, bookmarks, streak, private notes, RSS, daily reminder) · Events (list/month views, add one/many/all to Google, Outlook, Yahoo or Apple calendars, subscribable feed, Lagos + visitor-local time) · Sermons, gallery, testimonies (moderated, with consent), visit registration, prayer requests · Floating translator (12 languages, RTL) · PWA · Admin: devotionals, events, sermons, testimonies, visitors, backup export, activity log.

## Development
```bash
npm install --legacy-peer-deps        # dev tooling only
python3 build-pages.py                # regenerate new pages + shared nav/footer/scripts   (run FIRST)
python3 build-seo.py https://DOMAIN   # canonical/OG tags, sitemap.xml, robots.txt        (run AFTER build-pages)
python3 build-icons.py                # re-subset icons after adding one (pip install fonttools brotli)
python3 build-fonts.py                # rebuild self-hosted fonts from node_modules
```
Fonts and icons are self-hosted, so the site makes no request to Google Fonts or a CDN.

## Tests
- `npm run test:unit`: calendar/ICS engine and the daily-job logic.
- `npm run test:e2e`: headless-browser suite (`pip install playwright && playwright install chromium`): pages, events + calendar export, devotionals, forms, translator, SEO, icons, dead links, layout shift, anchors, flat-folder layout, and the real Firebase SDK wiring.
- `npm run test:rules`: Firestore security rules in the emulator (needs Java). **Runs in CI; not yet run by the author.**
- `npm run lint:html`: html-validate. CI (`ci.yml`) runs all of these plus Lighthouse.

## Security headers
`_headers` (Cloudflare Pages) and `firebase.json` (Firebase Hosting) ship a Content-Security-Policy, HSTS, nosniff, referrer and permissions policies. The CSP allows `'unsafe-inline'` scripts because pages use inline handlers; moving them to external files would allow a strict CSP.

## Known limits
- **Google Drive**: not wired (needs a server and credentials). Paste links instead.
- **Online giving**: no payment provider connected (bank details only).
- Devotional bookmarks/notes/streaks are stored on the visitor's device, not synced to accounts.
- Translation is Google machine translation and loads only after a visitor picks a language.
- Yorùbá dotted vowels (ẹ, ọ) are not in the chosen fonts and use the system fallback.
