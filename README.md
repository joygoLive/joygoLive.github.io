# joygoLive.github.io

Company homepage for **joygoLive**, introducing **UQI — Universal Quantum Infrastructure**,
joygoLive's vendor-neutral middleware for quantum computing.

## Stack

A single self-contained static `index.html`. All CSS, JavaScript, and copy (English / Korean,
toggled at runtime) are inline. **No build step, no framework, no bundler.**

## Local preview

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Hosting — portable by design

The site is intentionally host-agnostic so it can move off GitHub Pages with zero rework:

- **Just two files:** copy `index.html` and `favicon.png` to any static host
  (GitHub Pages, Netlify, Vercel, Cloudflare Pages, S3 + CloudFront, nginx, Apache, …).
- **No platform-specific config.** `.nojekyll` only matters on GitHub Pages and is harmless
  everywhere else.
- **All paths are relative** — works at a domain root or under a sub-path.
- **One external dependency:** Google Fonts (Syne / JetBrains Mono / Noto Sans KR) over CDN.
  This works from any host and is not a lock-in. Korean (Noto Sans KR) is served as a dynamic
  subset by the CDN; self-hosting it would add multiple megabytes, so the CDN is the practical
  choice. The page degrades gracefully to system fonts if the CDN is unavailable.

To migrate: point your new host at this repo (or just upload the two files) and you're done.

## Currently hosted at

GitHub Pages → https://joygolive.github.io/
