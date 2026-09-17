# jsm-options.com — canonical URLs, redirects, sitemap

## Canonical shape (use this everywhere)

Trailing slash, no `index.html`, no bare `.html`:

- `https://jsm-options.com/`
- `https://jsm-options.com/builder/`
- `https://jsm-options.com/strategies/`
- `https://jsm-options.com/level1/`
- `https://jsm-options.com/level2/`
- `https://jsm-options.com/level3/`
- `https://jsm-options.com/level4/`
- `https://jsm-options.com/covered-call/`
- `https://jsm-options.com/cash-secured-put/`
- `https://jsm-options.com/iron-condor/`
- `https://jsm-options.com/wheel/`
- `https://jsm-options.com/cheat-sheet/`
- `https://jsm-options.com/about/`
- `https://jsm-options.com/contact/`
- `https://jsm-options.com/disclaimer/`
- `https://jsm-options.com/privacy/`
- `https://jsm-options.com/tr/`
- `https://jsm-options.com/tr/builder/`

Keep query strings on `/builder/` (e.g. `?template=cash_secured_put`). Do **not** put template URLs in the sitemap unless each template is a unique, indexable landing page.

---

## What is already working

These already 308 correctly:

| From | To |
|---|---|
| `/index.html` | `/` |
| `/privacy` | `/privacy/` |
| `/privacy/index.html` | `/privacy/` |
| `/disclaimer` | `/disclaimer/` |
| `/about` | `/about/` |
| `/builder/index.html?template=…` | `/builder/?template=…` |

---

## What is still duplicated (fix these)

These return **200** and compete with the folder URLs:

| Live duplicate | Should 308 to |
|---|---|
| `/privacy.html` | `/privacy/` |
| `/disclaimer.html` | `/disclaimer/` |
| `/about.html` | `/about/` |
| `/contact.html` | `/contact/` |

Any other `*.html` or `*/index.html` should follow the same pattern.

---

## Cloudflare Redirect Rules (recommended)

Dashboard → **Rules** → **Redirect Rules** → Create rule.

Use **two wildcard rules**. Order matters: put them **before** any other path rewrites.

### Rule 1 — strip `index.html`

- Name: `Strip index.html`
- If incoming request matches: **Custom filter expression**
  ```
  http.request.uri.path wildcard "*/index.html"
  ```
- Then: **Dynamic redirect**
  - Status: `308`
  - Destination URL:
    ```
    concat("https://jsm-options.com", regex_replace(http.request.uri.path, "/index\\.html$", "/"), if(http.request.uri.query ne "", concat("?", http.request.uri.query), ""))
    ```

Simpler equivalent if you prefer **Wildcard pattern**:

- Request URL: `https://jsm-options.com/*/index.html*`
- Target: `https://jsm-options.com/${1}/${2}`
- Status: `308`
- Also add a second wildcard for the homepage file:
  - Request URL: `https://jsm-options.com/index.html*`
  - Target: `https://jsm-options.com/${1}`
  - Status: `308`

### Rule 2 — map leftover `.html` files

- Name: `HTML files to folders`
- Custom filter:
  ```
  http.request.uri.path matches "^/.+\\.html$"
  ```
- Dynamic destination (`308`):
  ```
  concat("https://jsm-options.com", regex_replace(http.request.uri.path, "\\.html$", "/"))
  ```

That turns:

- `/privacy.html` → `/privacy/`
- `/about.html` → `/about/`
- `/disclaimer.html` → `/disclaimer/`
- `/contact.html` → `/contact/`

If you also have `/strategies.html` later, it will be covered automatically.

### Rule 3 — optional explicit bulk list

If you would rather not use regex, Cloudflare **Bulk Redirects** list:

| Source URL | Target URL | Status | Preserve query |
|---|---|---|---|
| `https://jsm-options.com/privacy.html` | `https://jsm-options.com/privacy/` | 308 | yes |
| `https://jsm-options.com/disclaimer.html` | `https://jsm-options.com/disclaimer/` | 308 | yes |
| `https://jsm-options.com/about.html` | `https://jsm-options.com/about/` | 308 | yes |
| `https://jsm-options.com/contact.html` | `https://jsm-options.com/contact/` | 308 | yes |
| `https://jsm-options.com/index.html` | `https://jsm-options.com/` | 308 | yes |

Do **not** bulk-redirect `/privacy/` — that is already the canonical page.

---

## Cloudflare Pages / `_redirects` file

If the site is Cloudflare Pages (or Netlify-style), put this at the project root as `_redirects`:

```
/index.html                          /                               308
/*/index.html                        /:splat/                        308
/privacy.html                        /privacy/                       308
/disclaimer.html                     /disclaimer/                    308
/about.html                          /about/                         308
/contact.html                        /contact/                       308
```

A catch-all for other html files (Pages splat):

```
/*.html                              /:splat/                        308
```

Put the specific rules **above** the catch-all.

---

## `public/_redirects` copy-paste

See `jsm-options-_redirects` in this folder.

---

## Clean sitemap

Your current `https://jsm-options.com/sitemap.xml` is already correct. Keep it as-is. Do **not** add:

- `index.html`
- `privacy.html` / `about.html` / `disclaimer.html` / `contact.html`
- `/builder/?template=…` unless each template is a standalone article

`robots.txt` is also fine:

```
User-agent: *
Allow: /
Sitemap: https://jsm-options.com/sitemap.xml
```

After changing redirects, bump `<lastmod>` on touched URLs and resubmit the sitemap in GSC → Sitemaps.

---

## On-page checklist (stops Google rediscovering old URLs)

1. Every page `<link rel="canonical" href="https://jsm-options.com/THAT-FOLDER/">`
2. Nav, footer, buttons, sitemap, and PWA start_url use trailing-slash folders only
3. Search the repo for `index.html`, `.html"` and fix hrefs
4. `og:url` and schema `url` match the canonical
5. If you have a service worker cache of old paths, update it so it does not keep serving `/privacy.html`

---

## After deploy — Search Console

1. URL Inspection → test `/privacy.html` → should show **308** to `/privacy/`
2. Inspect `/privacy/`, `/`, `/builder/`, `/about/` → Request indexing if needed
3. Leave “Page with redirect” alone. Those rows should grow slightly after the new `.html` redirects, then fade as Google drops the sources
4. Do not use Removals on `/privacy.html` unless it is still appearing in live search results after a few weeks

---

## Verify locally

```bash
curl -sI https://jsm-options.com/privacy.html
# expect: HTTP/2 308
# expect: location: /privacy/   (or the absolute URL)

curl -sI https://jsm-options.com/about.html
# expect: 308 → /about/

curl -sI https://jsm-options.com/privacy/
# expect: 200
```
