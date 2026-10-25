# Security policy

Please report suspected vulnerabilities **privately**: use GitHub's "Report a vulnerability" button (Security tab), or email the address in `security.txt`. Do not open a public issue for security problems.

We aim to acknowledge reports within 3 working days. Visitors' prayer requests, testimonies and contact details are treated as sensitive: only staff roles can read them, public writes go through the Cloudflare Worker (Turnstile + rate limits), and the strict Content-Security-Policy and Firestore rules are covered by automated tests.

Maintainers: renew `Expires` in `security.txt` every year (a test reminds you 14 days before it lapses).
