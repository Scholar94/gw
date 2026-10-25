# Third-party licences

| Component | Used for | Licence | Full text |
|---|---|---|---|
| Font Awesome Free 6.5.2 | Icons (`icons.css`, `icons-*.woff2`, subset to the icons used) | Icons CC BY 4.0, fonts SIL OFL 1.1, code MIT | `LICENSE-fontawesome.txt` |
| Jost, Cormorant Garamond, Cinzel (via @fontsource-variable) | Typography (`font-*.woff2`, `fonts.css`) | SIL Open Font License 1.1 | `LICENSE-fonts.txt` |
| Firebase JS SDK | Database and admin sign-in (loaded from Google's CDN) | Apache 2.0 | https://github.com/firebase/firebase-js-sdk |
| Google Website Translator | Optional page translation (loaded only if a visitor picks a language) | Google Terms of Service | https://translate.google.com |

Development-only tools (Playwright, html-validate, ical.js, esbuild, fonttools) are not shipped to visitors.

## Bible texts (bundled, loaded on demand)
- **King James Version (KJV)**: public domain (except under the UK Crown letters patent for printing in the United Kingdom). Converted from https://github.com/aruljohn/Bible-kjv (MIT) by `build-bible.py`.
- **World English Bible (WEB)**: public domain. Converted from https://github.com/TehShrike/world-english-bible by `build-bible.py`.
## Build and test tooling (not shipped to visitors)
- axe-core (MPL-2.0), esbuild (MIT), Playwright (Apache-2.0), web-push (MPL-2.0, used only by the daily push job), firebase-admin (Apache-2.0).
## QR codes (bundled, minified)
- **qrcode-generator 1.4.4**: MIT, (c) Kazuhiko Arase. `qrcode.js`, makes the event ticket QR (browser).
- **jsQR 1.4.0**: Apache-2.0, (c) Cosmo Wolfe. `admin-jsqr.js`, camera fallback for the usher check-in scanner (admin only).
