# Release record: sharing, settings transfer and public help (2026-11-01)

Implements the "Private Local Chat Developer Instructions" brief. Source commit and deployment version are recorded in `/version.json` of the deployed site (and in the sidebar's release line).

## What shipped

* **Share** (public address only), **Transfer settings** (versioned link/QR/file, optional password-protected API token) and **Transfer chats and backups** as three separate flows with their own dialogs, scope text, icons and affirmative actions. `docs/SHARING-AND-TRANSFER.md`.
* Persistent **Help & about / Share** utility row in the sidebar and the mobile drawer; Help & about opens a compact sheet of public pages in new tabs.
* Public pages **/help/**, **/about/**, **/privacy/**, **/updates/** (+ `/updates/rss.xml`), `sitemap.xml`, `robots.txt`, root canonical, Open Graph and Twitter metadata, WebApplication JSON-LD; offline caching of the pages. `docs/PUBLIC-SITE.md`.
* Saved API tokens are now keyed by the full endpoint (path and query); requests only use the token saved for their exact destination.

## Tests

`npm test` (205 tests, including `tests/settings-transfer.test.mjs` and `tests/public-site.test.mjs`) and every browser suite through `node tests/e2e/<name>.e2e.mjs`: assistant, chat-core, cpu, device, docs, firstrun, fresh, mobile, organize, public-pages, sharing, smoke, voice. New: `tests/e2e/sharing.e2e.mjs`, `tests/e2e/public-pages.e2e.mjs`. `scripts/verify-release.mjs` now also checks the public routes, feed, sitemap and robots after deploy.

## Screenshots of the three flows, both themes

`docs/evidence/sharing-2026-11-01/` holds Share, Transfer settings and Transfer chats and backups for desktop and phone, light and dark (synthetic endpoint, model and token). `brand/screenshot-demo-1.png` is the About-page screenshot (synthetic conversation).

## Verified facts (from the repository and GitHub)

* Hosting: Cloudflare Pages `privatelocalchat` (main, `privatelocal.chat`) and `privatelocalchat-dev` (dev); models from R2 `privatelocalchat-assets` at `assets.privatelocal.chat`.
* The repository is public, owned by the JournalFoundation organization, licensed Apache-2.0; GitHub Discussions is **not** enabled.
* No analytics, tracking or cookies in app code; the app requests only its own files, `version.json`, model files from `assets.privatelocal.chat` and the chosen provider.

## Not done or not verifiable from here (needs the owner)

These are recorded as unset in `site-config.json` and the pages omit what depends on them rather than inventing it.

* **Support address and owner** (verified, monitored inbox): unset. The Help email action stays hidden until `supportEmail` is set.
* **GitHub Discussions** (categories Questions, Tips and uses, Ideas, Announcements; owner; welcome and starter posts): not created. The Community link and section appear when `discussionsUrl` is set.
* **Hosting log and retention facts**: not verified; Privacy states none and links the provider's policy. Check the Pages project and the R2 domain in the Cloudflare dashboard, then set `hostingLogs`.
* **robots.txt**: the live edge policy and content signals could not be read from the build environment. The generated file is the plain allow-all plus the sitemap line; reconcile it with the live file.
* **`privatelocalchat.com` redirects**: a Cloudflare rule outside this repo (recorded as 301 with path and query preserved on 2026-10-29 in `docs/evidence/hosting-and-releases.json`); not re-checked.
* **Search Console** property and URL inspection; **social-preview checks** in representative services (record title, description, image and crop).
* **Physical-device QR scan and a real native-share check**, enlarged text and the on-screen keyboard on a phone.
* **Demonstration video** and its captions/tested device-browser-model combination: not recorded; nothing on the site claims one exists. The Updates entry shows the release as "the next published release" until a tag exists.
* Ratings or reviews: none published, none claimed.
