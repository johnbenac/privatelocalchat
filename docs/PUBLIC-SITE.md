# Public site: Help, About, Privacy, Updates

> **Since split stage 5** these pages are the *site layer* of privatelocal.chat: they live in a private repository, and the build reads them from a site directory (`docs/SITE-LAYER.md`). The paths below are relative to that directory. The app repository keeps the generator and a neutral Help and About (`run-kit/`).

Four static documents served from the product domain, with a sitemap, a robots file and an RSS feed. They need no model code and no JavaScript to read.

| Route | Source | Notes |
|---|---|---|
| `/help/` | `pages/help/index.html` | Start guide, FAQ (published word for word), troubleshooting, known issues, contact, community (only when configured), share panel |
| `/about/` | `pages/about/index.html` | Introduction, examples, ownership, source, install, share panel, share resources, demonstration screenshot |
| `/privacy/` | `pages/privacy/index.html` | Written from the deployed code and hosting; shows its last-reviewed date |
| `/updates/` | `pages/updates/index.html` + `updates/entries.json` | Release notes and known-issue summary; feed at `/updates/rss.xml` |
| `/sitemap.xml`, `/robots.txt` | generated | Root plus the four pages; robots allows everything and names the sitemap |

Shared pieces: `chat/public-pages.css` (brand tokens from `/brand/design-tokens.css`, light and dark by `prefers-color-scheme`, 44 px targets, reduced motion) and `chat/transfer/public-pages.mjs` (mounts `mountProductShare` from `chat/transfer/product-share.mjs` on Help and About; the only script on the pages). Both live in `chat/` so the build moves them into the versioned release folder like the other chat assets. Pages load no external fonts, scripts or images.

## How the build handles them

`scripts/build.mjs` calls `buildPublicSite` in `scripts/public-site.mjs`:

1. Reads the site directory (`SITE_DIR`, default `run-kit/`; `docs/SITE-LAYER.md`): its `site-config.json` (override the path with `SITE_CONFIG_PATH`), its `updates/entries.json` and the pages that exist. The known issues come from `content/known-issues.json`.
2. Fills the `<!--plc:name-->...<!--/plc:name-->` regions of each page (navigation, contact email, community, known issues, update list, hosting-log note). An unknown region name is a build error.
3. Rewrites `/chat/...` references to `/releases/<commit>/chat/...` and fails if any stylesheet, script, image or feed a page names is missing from `dist/`.
4. Writes `dist/<page>/index.html` for each page that exists and, only when the manifest has a `site.url`, `dist/sitemap.xml` (lastmod from each page's `last-updated` date; the root uses the commit date), `dist/robots.txt` and, when there is an updates page with entries, `dist/updates/rss.xml`.
5. Injects `<script>window.SITE_CONFIG={supportEmail,supportOwner,discussionsUrl};</script>` after the `window.APP_BUILD` script in `index.html`.
6. The service-worker shell list is made from `dist/`, so the pages, their CSS and the feed are in the required offline set. An offline navigation to `/help`, `/help/`, `/about/`, `/privacy/` or `/updates/` opens that page's cached `index.html`; any other path still falls back to the app. (The worker names all four pages; a build without some of them is a known gap, planned for stage 6.)

7. Publishes the licence documents: `scripts/build.mjs` copies `LICENSE` and `THIRD-PARTY-NOTICES.md` to the root of `dist/` (so `/LICENSE` and `/THIRD-PARTY-NOTICES.md` return 200) and `_headers` serves them as `text/plain` and `text/markdown`, both `charset=utf-8`. They are not in the service-worker precache. The page footers (`footer-source` region) link them as "Licence" and "Notices", and the About page has a "Licence and source" section (`licence-source` region); both are rendered by `scripts/public-site.mjs`.

`BUILD_OUT_DIR` redirects the output (tests use it so they do not touch `dist/`). `scripts/serve.mjs` resolves directory requests (and redirects `/help` to `/help/` like Pages) and serves `.xml` and `.txt`.

The committed pages hold the rendering of their regions with the site's own configuration, so they read as complete documents. After changing `updates/entries.json`, `site-config.json` or a renderer run `node scripts/public-site.mjs sync <site directory>`; `tests/run-kit.test.mjs` (neutral pages) and the site's own `tests/site.test.mjs` fail when they drift.

## Configuration (`site-config.json`)

Every value is `null` until the owner has verified it. Nothing is guessed or made up.

| Key | Effect when set |
|---|---|
| `supportEmail` | Help shows "Email the project team" (a `mailto:` link) with the recipient and purpose beside it; also in `window.SITE_CONFIG` |
| `supportOwner` | Named as the person monitoring that inbox; also in `window.SITE_CONFIG` |
| `discussionsUrl` | Help gets a Community section, and Community appears in every navigation and on About; also in `window.SITE_CONFIG` (https only) |
| `discussionsOwner`, `verifiedOn` | Shown in the Community section |
| `hostingLogs` | A verified one-line note shown in Privacy under "Hosting, logs and analytics" |
| `demo` | Reserved. Nothing uses it yet; no demonstration video exists and none is linked |

When `supportEmail` and `discussionsUrl` are unset, `#contact` still exists and offers the public GitHub Issues form, labelled as public.

## Adding an update

Add an entry at the top of `entries` in the site's `updates/entries.json` (in the private site repository; fields: `id`, `date`, `release` as `vX.Y.Z` or `null` until a release is cut, `title`, `summary`, `points`, `help` links, `issues` ids), then run `node scripts/public-site.mjs sync <site directory>` and the site's tests. The HTML list and the feed are both generated from that file. Known issues describe the app and live in this repository (`content/known-issues.json`); they appear in full on Help and in summary on Updates; each needs devices, browsers, models, symptom, status, a `verified` date and a workaround, and must come from recorded evidence.

The "Share, transfer settings, and help" entry (2026-11-01) has `release: null`: set it to the tag semantic-release creates once the release is published (releases are listed at https://github.com/johnbenac/privatelocalchat/releases; `package.json` still says 2.0.0, which is the internal build version).

## Demonstration screenshot

`brand/screenshot-demo-1.png` is made by `node scripts/demo-screenshot.mjs` from an invented conversation and the scripted test provider. Regenerate it whenever the interface changes. Keep it at or under 250 KB.

## Suggested JSON-LD for the app page

The root page (`index.html`) is not part of this module. A factual block it can carry:

```json
{"@context":"https://schema.org","@type":"WebApplication","name":"Private Local Chat","url":"https://privatelocal.chat/","description":"Free AI chat in your browser. Run a supported model on your device, or choose an outside provider.","applicationCategory":"UtilitiesApplication","operatingSystem":"Any system with a current web browser","isAccessibleForFree":true,"offers":{"@type":"Offer","price":"0","priceCurrency":"USD"}}
```

Add no rating or review fields unless genuine published evidence supports them.

## Not done in this repository

* **robots.txt policy.** The live robots file and any content-signal policy served at the edge could not be read from the build environment. The generated file is the plain `Allow: /` policy plus the sitemap line. The owner must compare it with the live file before deploying and carry over any policy that must stay.
* **Dev site indexing.** `dev.privatelocal.chat` receives the same robots file and canonical links to production; no `noindex` is added.
* **Redirects from `privatelocalchat.com`** are a Cloudflare rule, not part of this repository. They were verified as 301s with path and query preserved on 2026-10-29 (`docs/evidence/hosting-and-releases.json`); re-check them for the new paths.
* **Demonstration video**: none recorded; nothing links to one.
* **Support address, discussion space and owners**: unconfigured (see above).

## Verification checklist

1. `npm test`; in the site repository `node --test tests/*.test.mjs` and `node tests/e2e/public-pages.e2e.mjs` (they need `APP_ROOT`, or the two checkouts side by side); `DEPLOY_BRANCH=main node scripts/build.mjs` and `DEPLOY_BRANCH=dev node scripts/build.mjs` with `SITE_DIR` pointing at the site layer.
2. After deploying, open `/help/`, `/about/`, `/privacy/`, `/updates/`, `/updates/rss.xml`, `/sitemap.xml` and `/robots.txt` on the custom domain; check `https://privatelocalchat.com/help/` redirects with a 301.
3. Search Console: add the property for `https://privatelocal.chat/`, submit `sitemap.xml`, inspect the four new URLs.
4. Social previews: check the canonical URLs in representative messaging services and social networks; record the observed title, description, image and crop. Version the image filename if its artwork changes.
5. Cloudflare dashboard: confirm log retention, whether any web analytics or log export is enabled for the Pages project and the model storage domain, then fill `hostingLogs` and re-review `/privacy/`. Since 2026-11-11 Cloudflare Web Analytics (cookieless page-load counting, injected at the edge) is switched on for the production zone privatelocal.chat only; it is not in this repository's code, and the Privacy page (page-load-counting) and the Updates page say so. Keep both true if it is ever switched off or changed.
6. Contact and community: only after a monitored inbox (and an owner) and a working Discussions space exist, fill `supportEmail`, `supportOwner`, `discussionsUrl`, `discussionsOwner` and `verifiedOn`.
7. On a physical device: scan the share QR code, try native share, and open each page offline from an installed copy.
