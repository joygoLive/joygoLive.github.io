# joygoLive.github.io

Company homepage for **joygoLive**, with one marketing page per service.
All pages are read-only — introduction and positioning only, no app functionality.

## Structure

```
index.html          company landing — hero + service cards + how they get built
uqh/index.html      UQH — Universal Quantum Hub (quantum computing middleware)
amc/index.html      AMC — AI Motion Coaching (community sports)
bor/index.html      BOR — Blockchain On-chain Raffle
assets/site.css     shared design system — tokens, shell, every component
assets/i18n.js      shared runtime — EN/KO switch, scroll fade-in, mobile menu
favicon.svg
```

Each page owns its own copy: the `_L` dictionary is inline at the bottom of the page,
keyed by `data-i18n` / `data-i18n-html` attributes in the markup. The language choice is
stored under one `localStorage` key (`joygo_lang`) so it carries across pages.

## Stack

Static HTML. **No build step, no framework, no bundler.** Only two shared files are
pulled in, both by relative path, so the tree works at a domain root or under a sub-path.

## Local preview

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000 — service pages are at `/uqh/`, `/amc/`, `/bor/`.

## Adding a service

1. `mkdir <svc>` and copy the closest existing service page as a starting point.
2. Point it at `../assets/site.css` and `../assets/i18n.js`; favicon is `../favicon.svg`.
3. Replace the `_L` dictionary. **Both `en` and `ko` must define every key the markup
   uses** — a missing key silently leaves the English fallback text on screen. To check:

   ```bash
   python3 -c "import re,sys,glob
   for p in glob.glob('*/index.html')+['index.html']:
       s=open(p,encoding='utf-8').read()
       used=set(re.findall(r'data-i18n(?:-html)?=\"([^\"]+)\"',s))
       b=re.search(r'const _L = \{(.*?)\n\};',s,re.S).group(1); i=b.find('\n  ko:{')
       en=set(re.findall(r'\"([a-zA-Z0-9_.]+)\"\s*:',b[:i])); ko=set(re.findall(r'\"([a-zA-Z0-9_.]+)\"\s*:',b[i:]))
       print(p, 'missing EN', sorted(used-en), 'missing KO', sorted(used-ko))"
   ```

4. Add a card to the `.svc-grid` in the root `index.html`, plus a nav and footer link.

## Copy constraints

**BOR copy is governed by `BOR/docs/홍보문구.md` §6 (「하면 안 되는 말」), not by this
repo.** That document forbids, among others: comparing against casinos or slots, saying
there is no operator, "fully decentralized", "audited"/"secure", "earn"/"returns"/"yield",
naming a specific country's lottery, and "guaranteed". Testnet status and the fact that a
ticket's expected value is below its price must appear alongside the claims. Read that file
before editing `bor/index.html`.

UQH and AMC copy is derived from their own repositories' READMEs and planning docs.

## Hosting — portable by design

Host-agnostic so it can move off GitHub Pages with zero rework:

- **Copy the tree as-is** to any static host (GitHub Pages, Netlify, Vercel, Cloudflare
  Pages, S3 + CloudFront, nginx, Apache, …). Nothing is generated at deploy time.
- **No platform-specific config.** `.nojekyll` only matters on GitHub Pages and is harmless
  everywhere else.
- **All paths are relative.**
- **One external dependency:** Google Fonts (Inter / JetBrains Mono / Noto Sans KR) over
  CDN. This works from any host and is not a lock-in. Korean (Noto Sans KR) is served as a
  dynamic subset by the CDN; self-hosting it would add multiple megabytes, so the CDN is
  the practical choice. Pages degrade gracefully to system fonts if the CDN is unavailable.

Analytics is GoatCounter — cookieless, so no consent banner is required.

## Currently hosted at

GitHub Pages → https://joygolive.github.io/
