# Deployment and recovery

## GitHub Actions

`.github/workflows/deploy.yml` fetches the site layer (the private repository `johnbenac/privatelocalchat-site`, on the same branch name, with a read-only deploy key), validates the exact pushed commit with the public tests and the site's own, and builds it with that site layer before uploading `dist/` with pinned Wrangler (`docs/SITE-LAYER.md`). If the site layer cannot be fetched the job fails and the live site stays as it is. `main` targets Pages project `privatelocalchat`; `dev` targets the separate project `privatelocalchat-dev`. Each project has only its own custom domain. Manual deployment uses **Actions → Deploy Cloudflare Pages → Run workflow**, selecting `main` or `dev`.

Deployment jobs serialize independently by branch. Immediately before upload the job compares the checkout SHA to the current branch tip and skips superseded commits. Failed validation prevents uploading. The workflow summary links to the deployed site. No artifact of the built site is kept: it holds the site layer, which is served but not published as files. The deploy keeps the release folders of the three builds before the new one (`scripts/retain-releases.mjs`, `docs/UPGRADE-BEHAVIOUR.md`), so a tab that started on one keeps loading its own files. Release tagging and notes follow a successful production deployment without pushing another commit to the branch. The branch tip remains the verified deployment commit.

Repository Actions secrets are `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` and `SITE_DEPLOY_KEY` (the private half of a read-only deploy key on the site repository; rotation is in `docs/SITE-LAYER.md`). The operator's local provisioning token is at `/root/.config/privatelocalchat/cloudflare-api-token`, outside Git. Never copy it into application code, commands, logs, or build output.

## Models

The R2 bucket is `privatelocalchat-assets`, exposed at `assets.privatelocal.chat`. See `ops/cloudflare/CDN-OPERATIONS.txt` and the tracked provisioning/publication scripts. Models are immutable, versioned objects. Upload new versions at new keys, verify every size and SHA-256, then update the application catalogue. Keep older versions available for older deployed apps.

Model objects use one-year immutable edge caching; the discovery catalogue uses a one-hour TTL. A response-header transform sends `Cache-Control: no-store` for `.gguf` and `.bin` weights, preventing a second ordinary browser HTTP copy beside the downloader's explicit offline storage. Config and WASM responses retain immutable browser caching. Standard edge caching has a 512 MB object ceiling. The current largest model shard is 508,559,360 bytes. Public CORS supports GET, HEAD, and byte ranges. The model downloader owns persistent model storage; the service worker caches the app/runtime shell and never deletes model caches.

## Rollback

In Cloudflare **Workers & Pages**, select the affected project, open **Deployments**, choose the last verified production deployment and select **Rollback to this deployment**. Production and development roll back independently. A later push will deploy again, so revert the faulty source commit on the affected branch before resuming normal releases.

For a source-controlled rollback, use `git revert` on the faulty commit and push the same branch. Confirm the resulting Actions job succeeds and `/version.json` identifies the revert commit. Model URLs remain available across rollbacks. Browser data keys are unchanged; do not clear site storage to roll back.

Check both app domains, canonical redirects, version identity, offline app installation, model installation/load, local generation, and feedback links after a release. A successful upload alone does not prove model inference works.

## Browser acceptance

Run `node scripts/browser-acceptance.mjs` after installing Playwright's browser or setting
`CHROME_EXECUTABLE`. `PROOF_ORIGIN` selects the site, `BROWSER_PROOF_MODEL=9b` selects the quality
model, `BROWSER_PROOF_PROFILE` chooses a dedicated persistent test profile, and `BROWSER_ARGS`
accepts a JSON array of browser launch flags. Receipts are written under ignored `work/evidence/`.
The test performs real model downloads and generation, including interruption/resumption, offline
generation, and offline reopening. It can transfer several gigabytes.

On the tested Linux NVIDIA setup the 2B runtime needs the browser's optional shader-f16 support
enabled; see `docs/evidence/desktop-environment.json`. This is a test-environment requirement, not
a promise that every Linux browser exposes that feature. The application refuses the unsupported
2B path instead of falling back to an API.

The canonical production domain is `privatelocal.chat`; `privatelocalchat.com` and its `www`
alias redirect there with path and query preservation. GitHub Pages was disabled after verifying
Cloudflare production and waiting for the previous DNS TTL. The GitHub repository continues to
host code, Actions and public feedback forms. Serving the app and models requires no homelab.

Run `node scripts/browser-cancellation.mjs` using the same browser environment variables and an
installed 2B model profile to verify stopping streamed output and sending another message. The
complete release gate status and unresolved device failures are in `docs/ACCEPTANCE.md`.

Use a dedicated browser profile with diagnostics disabled for the acceptance harness.
It creates a test conversation, generates online and offline, closes the whole browser,
and reopens the same profile offline to load the model and generate again. Model files
remain cached. Receipts and screenshots are written under `work/evidence/`.

## Offline checks

- **Every push** (`.github/workflows/offline-e2e.yml`): `node tests/e2e/offline.e2e.mjs`. The saved app opens cold with no
  connection, keeps and finds its conversations, opens the public pages and Settings, shows the connection pill and the
  offline checklist, and a provider failure while offline says so in words. No model is downloaded. `npm test` also builds
  the app and fails if the service worker leaves a shipped file or an imported file out of its list
  (`tests/offline-precache.test.mjs`), and if Help and the app stop using the same words (`tests/offline-help.test.mjs`).
- **Before a release:** `OFFLINE_MATRIX_OUT=docs/evidence/offline/matrix-chromium.json node tests/e2e/offline-model.e2e.mjs`.
  It downloads the small model (about 1.5 GB), replies online, closes the browser, cuts the network, opens cold, loads the
  model and gets a real reply, then goes back online. It takes minutes and is not part of the per-push run.
- **On devices:** the plan and evidence are in `docs/OFFLINE-PLAN.md` and `docs/evidence/offline/`. The iPhone is driven with
  `dev-tools/operator-safari-controller.py` and the development-only network switch on `dev.privatelocal.chat` (it denies
  network access in the service worker while the radios stay on); Mac Safari with the app served through the reverse tunnel
  and the server stopped. Neither proves airplane mode; say which was used when recording a result.

## Local test storage

Check free space before model downloads, native rebuilds or new browser profiles on Centroid,
Boiler and Brutus. Reserve at least 20 GiB on a system disk; defer large work if it would cross
that reserve. Brutus had only about 15 GiB free at the October 30 check and should receive no
large project artifacts. This is a project operating reserve, not a guarantee about other jobs.

Use Centroid's 2 TB Vivarium volume for active model/browser test data. Move inactive build
sources, toolchains and browser profiles to Atelier bulk storage and preserve their original
paths with symlinks. The October 30 archive is under
`/media/Atelier/privatelocalchat-archive/2026-10-30/`; the private relocation receipt is under
ignored `work/evidence/`. Preserve native provenance and diagnostic evidence. Remove redundant
installation archives after verifying the installed browser. Do not clean shared browser caches,
other projects' profiles, user Downloads or active test directories indiscriminately.
