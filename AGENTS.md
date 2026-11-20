# privatelocalchat

## What this is

Private Local Chat: a static, no-framework browser app (WebGPU/WASM local LLMs, or an explicitly chosen OpenAI-compatible API). `origin` (the GitLab group `cosmoshot`) is the home; the `github` remote (`johnbenac/privatelocalchat`) is for publishing only: the deploy workflows in `.github/workflows/` run from there, so do not push to it unless asked. Cloudflare Pages serves the app, the programme's shared data CDN (`cdn.aiofourown.com`, R2 bucket `cosmoshot-cdn`, T587) serves model files; `assets.privatelocal.chat` (R2 `privatelocalchat-assets`) is retired and redirects `/models/*` there since 2026-11-17 (T674, T677). Publish with `/cosmoshot/tools/ops/cdn_publish.py`; the pins are in `ops/cloudflare/*.json`. This repo is **not** deployed via the homelab/Flux/Caddy stack described in the global instructions.

## Commands

Node 22+, Python 3. A fresh clone needs only `npm ci` (see `docs/HOUSING.md`); `npm test` reads nothing outside the clone.

```sh
npm ci
npm test                                        # node --test tests/*.test.mjs
node --test tests/download-retry.test.mjs       # single test file
python3 -m unittest discover -s dev-tools/tests -v   # dev-tools Python tests (CI runs these too)
DEPLOY_BRANCH=dev npm run build                 # or DEPLOY_BRANCH=main; each build wipes dist/
node scripts/serve.mjs                          # serves dist/ at http://127.0.0.1:18171
npm run snapshot:check                          # the run-kit build against docs/evidence/split/runkit-baseline.json (see docs/SPLIT-SNAPSHOT.md)
SITE_DIR=<dir> npm run snapshot:check:site      # the site build against site-baseline.json (needs the private site checkout)
npm run e2e -- <name> [<name>...]               # browser suites in tests/e2e/ (e.g. offline, file-import, run-kit)
npm run data-handling:check                     # the data handling document against the code
node scripts/snapshot.mjs compare <rev> [--allow GLOB]   # build <rev> and the current tree and show every changed file
npm run inventory:check                         # (same as: node scripts/network-inventory.mjs check) the hosts the app names; `write` after an intended change
node tests/e2e/data-upgrade.e2e.mjs            # every data snapshot in tests/fixtures/data loaded into the current build (docs/DATA-COMPATIBILITY.md)
node scripts/data-snapshot.mjs capture          # a new data snapshot, from the real app in a real browser
DEPLOY_SITE_URL=<url> GITHUB_SHA=$(git rev-parse HEAD) GITHUB_REF_NAME=<branch> node scripts/verify-release.mjs
```

## Architecture

Read `docs/ARCHITECTURE.md` first: the three layers (pure modules, feature modules, the host page), the official ways features connect (the event list in `chat/events.mjs` and the window globals), and how to extract a feature out of `index.html` (`chat/lock/lock.mjs` and `chat/dialogs.mjs` are the worked examples). Test the area you touched with `npm run e2e -- <name>`; the full browser sweep is a release check. The plan for taking `index.html` apart is `docs/RESTRUCTURE-PLAN.md`: when you change the structure (a folder, an event, a window global, a feature moved out of the page) update `docs/ARCHITECTURE.md` and tick or date the step in the plan; `tests/architecture-doc.test.mjs` fails if the folders or events drift.

- **`index.html`** (~1.3k lines) is the host page: the markup and the script that wires the feature modules of `chat/` together (`docs/RESTRUCTURE-PLAN.md`). It owns the storage formats that must be preserved: `chatThreads` (localStorage) and `chatConfig`/`chatModels` (sessionStorage). Local mode must never silently fall back to an API.
- **`local-models.js` / `local-models.css`** bridge the UI to local models (model panel, download/load flow). **`conversation-messages.mjs`** shapes messages for the model.
- **`runtime/providers/` is NOT edited here.** A read-only copy of the shared package `model-runtime` (owner plc, source `/cosmoshot/model-runtime`), pinned by version and SHA-256 in `vendor.lock.json` and checked by `tests/vendor-lock.test.mjs`. Change it in `model-runtime`, publish, and re-pin in one commit (`/cosmoshot/tools/docs/VENDORING.md`). Full text: `docs/AGENTS-REFERENCE.md`.
- **`vendor/authored-profiles/` is NOT edited here either.** A read-only copy of Cosmogenitor's `authored-profiles` 1.1.0, pinned in `vendor.lock.json`. The app loads only its neutral entry and the build ships that entry's ten-file closure in every target (`tests/presentation-build.test.mjs`). Full text: `docs/AGENTS-REFERENCE.md`, `docs/CHARACTER-PACKAGE-PREVIEW.md`.
- **`runtime/`** is the provider layer: `providers/` (catalog, host worker + `client.mjs`, `adapters/` incl. wllama, hash/OPFS download writers, retry/recovery, `vendor/wllama/v1q` pinned native WASM). `runtime/download-recovery.mjs` and `offline-status.mjs` support resumable downloads and offline UX. Runtime artifacts are pinned by SHA-256; see `docs/RUNTIMES.md` before replacing any. Models are catalogue tiers in `runtime/providers/catalog.mjs` (`default` Qwen3.5-9B on WebLLM; `light` Qwen3.5-2B, `lfm` LFM2.5-2.6B, `granite` Granite 4.0 H 1B and the tiny `mini` Granite 4.0 H 350M and `nano` SmolLM2-135M on wllama; only the tiny ones may run on the processor on iPhone/iPad, see `docs/SMALL-MODELS-PLAN.md`); adding one follows the recipe in `docs/CDN-POPULATION.md`.
- **App shell (`chat/shell/`, `chat/shell.css`)**: the one and only layout (ChatGPT-style). `shell.mjs` is mounted at the end of `index.html`'s inline script and builds the icon rail, panel items, header Temporary/"..." buttons, the composer "+" menu and model picker, the Settings page, the Ctrl/Cmd+K search overlay (`hybrid-search.mjs`: keyword + on-device embedding model, fused by rank) and Roberta's page. It *moves* the model/API form, import/export controls and theme toggle from `index.html` into the Settings page so their ids and listeners keep working. `registry.mjs` holds the data-driven entries (rail, explore, plus menu) and the date grouping of the chat list. It talks to the page only through `window.plcApp` (defined at the end of `index.html`: `openLibrary`, `openHelp`, `openShare`, `attachFiles`, ...), never by clicking hidden buttons. There is no alternate layout and no flag: every e2e suite in `tests/e2e/` drives the shell exactly as a person would (visible controls only).
- **Voice picker (`docs/VOICE-ENGINE-PLAN.md`)**: the person chooses how answers are read aloud (system voice, or a downloaded Kitten or Kokoro voice); nothing is gated by a device test, only advice; licence AGPL-3.0-only because of eSpeak NG. Files and rules: `docs/AGENTS-REFERENCE.md`.
- **Offline (`docs/OFFLINE-PLAN.md`)**: connection state, the offline checklist and the saved copy live in `chat/connection/`, `runtime/offline-readiness.mjs` and `scripts/service-worker.js`; `tests/offline-precache.test.mjs` fails if a shipped or imported file is left out of the saved list. Full text: `docs/AGENTS-REFERENCE.md`.
- **Model UI (`docs/MODEL-UI-PLAN.md`, `chat/models/models-view.mjs`, `chat/shell/models-page.mjs`)**: one vocabulary for every model (states none / downloading / downloaded / loading / loaded / failed; "in use" is separate from "loaded"; the system voice and providers are not models). A click on a model in either composer picker toggles whether it is loaded (load, unload and stay chosen, or cancel a download). Settings > Models is one page: Language model, Connected provider, Voice, Other models, Memory and storage. The UI talks to `window.localModels` (actions and `view`), the voice picker controller and the memory manager; the old model form is gone: `local-models.js` keeps what the UI shows in `window.localModels.view`, and everything (pickers, Settings, Storage) reads that and the view-models, never page elements.
- **Model memory (`runtime/memory-manager.mjs`, `chat/models/memory-offer.mjs`, Settings > Models > Memory, `docs/MODEL-MEMORY-PLAN.md`)**: one logical registry of everything that sits in memory (chat model, voice, matching model; later image/OCR). Each kind registers a resident (`state`, `isBusy`, `unload`, optional `light`) in `index.html`'s `memoryManager()` and calls `acquire(id)` before it works. The person's switch **One model at a time** is the only policy beyond the default: on = unload every other model first; off = the app tries whatever is asked and says what happens. There is deliberately no automatic/predictive mode. The manager never loads anything; a failed model is offered the switch, never switched for them.
- **Data compatibility (`docs/DATA-COMPATIBILITY.md`, `chat/vault/data-formats.mjs`, `tests/fixtures/data/`)**: every storage key has a `format` in `chat/vault/key-classes.mjs` (twinned with the inventory, which also records `since`). A browser keeps `plc.formats.v1`, the highest format of each store any version has used; a version that finds a store marked newer than it understands reads it, never writes or removes it, and says so once. A format change ships in two releases and needs a snapshot from a build that writes it. `tests/e2e/data-upgrade.e2e.mjs` loads every snapshot (plain and with the vault) into the current build and fails if anything the person had is missing or changed; the Release workflow waits for it to pass for the commit.
- **Upgrade behaviour (`docs/UPGRADE-BEHAVIOUR.md`, `scripts/retain-releases.mjs`, `scripts/service-worker.js`, the inline script in `index.html`, `window.plcUpdateGuard` in `local-models.js`)**: a tab keeps the build it started on (earlier release folders are kept on the server by the deploy, saved copies are kept by the worker for builds with open tabs), a new build is offered by a notice (What changed, Reload, Later) and never reloaded into once the app is open, and Reload asks first when a reply, download, recording or unsent message would be interrupted. `/version.json` is never answered from the saved copy. Test: `node scripts/e2e.mjs update-midsession`.
- **File compatibility (`docs/FILE-COMPATIBILITY.md`, `chat/transfer/file-formats.mjs`, `tests/fixtures/files/`)**: the files a person saves (chat history, protected backup, settings) name their format; a build reads every format any earlier build wrote, refuses a newer one whole with one plain message, keeps fields it does not know (`keepUnknown` in `chat/threads.mjs`), and refuses an import into chats held read-only for a newer version. Capture a snapshot with `node scripts/file-snapshot.mjs capture` when a file format changes and at least every 15 releases. Test: `node scripts/e2e.mjs file-import`.
- **Links to our pages (`docs/SITE-LINKS.md`, `chat/site/site-links.mjs`, the site directory's `site.json`)**: the app never names `/help/`, `/about/`, `/privacy/` or `/updates/` itself; it asks `siteLinks().href(page, anchor)` and draws nothing for `null`. The build writes the validated manifest into `index.html` as `window.SITE_LINKS` (`SITE_JSON_PATH` picks the file; empty means none). `tests/site-links.test.mjs` fails on a bypass; `node scripts/e2e.mjs site-links` checks three builds against `docs/evidence/split/links-baseline.json`.
- **Model sources and site identity (`docs/APP-CONFIG.md`, `runtime/providers/app-config.mjs`, `app-config.json`, the site directory's `site.json`)**: the app never names where models come from or which site serves it. `app-config.json` (shipped) and `config/app-config.json` (an operator's, replaces the list whole) give the model sources; the build writes them as `window.APP_CONFIG`, and the catalog, voices and embedding set join the root to `<name>/<revision>/` (`dir` in `catalog-data.mjs`). Every file is still checked against its pin. The `site` block of `site.json` feeds the page head, the Share entry points and the assistant's sentence about a host; without it a copy names no site. A model-source notice is shown once on a copy that is not our site. `docs/evidence/split/model-urls-baseline.json` records all 310 addresses (`tests/model-urls.test.mjs`). Tests that load these modules import `tests/helpers/install-app-config.mjs` (and `install-site-links.mjs`, which installs the fixture site `tests/fixtures/site/`) first. Browser: `node scripts/e2e.mjs model-sources site-identity`.
- **The site layer (`docs/SITE-LAYER.md`, `run-kit/`, `scripts/public-site.mjs`, `.github/workflows/deploy.yml`)**: the pages, `site.json`, `site-config.json` and announcements of privatelocal.chat are in the private repository `johnbenac/privatelocalchat-site`, not here. A build reads a site directory (`SITE_DIR`; unset means `run-kit/`, the neutral Help and About). The deploy fetches the private repository on the same branch with a read-only deploy key (secret `SITE_DEPLOY_KEY`), runs its tests, builds with it, and keeps no artifact of the result. The generator makes only the pages that exist and writes sitemap, robots and feed only when the manifest has `site.url`. Tests here use `tests/fixtures/site/`; tests that pin the site's wording are in the private repository. Baselines: `runkit-baseline.json` (checked for everyone), `site-baseline.json` (evidence the move changed nothing; `snapshot:check:site` with `SITE_DIR`).
- **Build targets and `serve.mjs` (`docs/RUN-IT.md`, `scripts/targets.mjs`, `scripts/headers.mjs`, `scripts/serve.mjs`)**: `TARGET=app | runkit | site` (unset: `SITE_DIR` set means `site`, else `runkit`; contradictory combinations are refused). Our development tooling (receiver worker, `dev-tools/`, diagnostics hooks) is in the `site` target on `dev` only; `app` and `runkit` on `dev` are refused, so tests that build for dev pass a site directory (`tests/helpers/dev-site.mjs`). `environment` in `version.json` is `release`/`local` for `app` and `runkit`. The header rules live once in `scripts/headers.mjs`: the build writes `_headers` from them, `serve.mjs` applies the `_headers` of the folder it serves (streams, Range, HEAD, 304, logs nothing), and `node scripts/headers.mjs nginx|caddy` prints them for other servers. The service worker's page list is filled in by the build (`__PUBLIC_PAGES__`). Baselines: `app-`, `runkit-` (checked for everyone) and `site-baseline.json`. Browser: `node scripts/e2e.mjs run-kit`.
- **Storage and encryption (`docs/ENCRYPTION-AT-REST-PLAN.md`, `chat/vault/`, `docs/evidence/encryption/storage-inventory.json`)**: an opt-in encrypted vault. Everything the person keeps goes through `appLocal` / `appSession` from `chat/vault/vault-store.mjs` (never raw `localStorage` / `sessionStorage` for a key the inventory calls user, setting or transient: `tests/storage-inventory.test.mjs` fails), which are the browser's own storage until the vault is on. Every browser storage key and every file that touches browser storage must be classified in the inventory (and in `chat/vault/key-classes.mjs`), and one key has one owner. Every entry point awaits `bootVault()` before reading a saved setting (`local-models.js`, `index.html`); do not add an `await` between registering the page's listeners and creating the thread state in `index.html`. Browser tests that need the app drawn wait for `window.__plcBooted` and `window.plcShell` (the harness does). Tick and date plan steps as they land (`tests/encryption-plan.test.mjs`). Two steps wait for the owner: the real Face ID check (5.4) and default-on (6.1).
- **`scripts/build.mjs`** produces `dist/`: copies app files into a versioned `releases/<commit>/` path (index.html rewrites asset URLs to it), injects `window.APP_BUILD`, verifies pinned runtime checksums (`runtime/providers/production-runtime.json`, compiler-control receipt), writes `version.json`, `_headers` (COOP/COEP required for WASM threads), and generates `sw.js` from `scripts/service-worker.js` (precaches every shell file; cache name includes commit).
- **Dev vs production builds from one source**: code between `/* DEV_DIAGNOSTICS_START */` … `/* DEV_DIAGNOSTICS_END */` markers is **stripped from non-dev builds** (index.html, local-models.js, adapters/wllama.mjs, host-core.mjs, client.mjs, sw.js). The `dev` build additionally overlays `dev-tools/native-runtime/*` (instrumented wasm), copies `dev-tools/*.mjs` + `start.js`, and installs `dev-tools/receiver-worker.js` as the Pages `_worker.js` (opt-in telemetry receiver, R2-backed). Production must never contain diagnostics UI/receiver/logging — keep new diagnostics inside the markers or `dev-tools/`.
- **Branches**: `dev` → dev.privatelocal.chat (Pages project `privatelocalchat-dev`), `main` → privatelocal.chat. Push triggers `.github/workflows/deploy.yml` (tests, build, wrangler deploy, verification). Work on `dev`, promote by merging to `main`. Model objects in R2 are immutable; publish new keys rather than replacing (`docs/OPERATIONS.md`).
- **`ops/`** (Cloudflare/R2 publishing + native compiler-control tooling) and **`docs/`** (MAINTAINER-HANDOFF, OPERATIONS, ACCEPTANCE, RUNTIMES, DEV-DIAGNOSTICS, IPHONE-INVESTIGATION, TECHNICAL-DEBT) hold procedures; read the relevant doc before runtime or release changes. Runtime changes need real model generation and offline checks, not just mocks.
- **`work/`** is git-ignored scratch (one-off device probes, browser proofs, private state). Don't commit from it or print secrets in it; `work/CONTINUATION.md` is a historical handoff log. `.gitlab-ci.yml` is not used.

## Constraints

- Never use the browser's `confirm`, `alert` or `prompt`: ask with `window.plcDialogs.confirm(title, message, label, { danger })`, tell with `.alert(...)`, and offer text that could not be copied with `.copyText(title, text)`. `tests/no-native-dialogs.test.mjs` enforces it.
- Never commit credentials, browser profiles, or user conversations; diagnostics must not capture prompts/replies/API keys.
- No references to the project the runtime was originally sourced from may appear in code, UI, docs, or public metadata.
- Browser tests on this box use dedicated profiles on `/media/Vivarium/…`; don't clear unrelated browser storage.

<!-- BEGIN cosmoshot-managed: instructions (generated by /cosmoshot/skills generate.py from sources/; edit the source, not this block) -->
## Working in the Cosmoshot programme

Memory is read and written only through `cosmo-mem`, never by editing its files. `cosmo-mem mount-note --cwd <this working copy>`
shows the note below again; `cosmo-mem attachments --cwd ...` shows the access.

```text
## Shared memory (Cosmoshot)

Every agent on the program shares it: read it before you start, write what the next agent needs.
Everything goes through the `cosmo-mem` command. Stores (name, access, path on disk, about):
- program (Cosmoshot) READ-ONLY /cosmoshot/memory/program: Facts about the program as a whole and what every project must agree on. Written for all projects; read-only for project sessions.
- plc (Private Local Chat) READ-WRITE /cosmoshot/memory/plc: What agents have learned working on Private Local Chat. Where the person chats with the resident.
Start with `cosmo-mem read STORE _index.md`, then `cosmo-mem list STORE`, `read STORE PATH` or `search STORE REGEX`.

You may write to: plc. Read the file first and pass the sha256 you saw back, or `absent` to create:
  cosmo-mem write STORE PATH --if-sha SHA_OR_absent --project plc --session SESSION_ID \
      --harness claude-code|codex|router --model MODEL --reason "why" --file FILE   (or content on stdin)
A memory is STORE/slug.md with frontmatter name (equal to the slug), description, optional metadata.
Exit 3 means the file changed since you read it: read again, merge, retry.
After creating one, catalogue it: cosmo-mem index STORE set SLUG "one sentence" --domain "Heading" --project plc (same flags).
Never write secrets. Do not edit the files directly. Do not push; the sync job does.
```

The hints below may be cut to fit. Complete entries: `cosmo-mem read STORE _index.md`; search: `cosmo-mem find QUERY --cwd ...`;
read a `[[slug]]`: `cosmo-mem read STORE slug.md`.
Catalogue hints (peer-maintained data, not instructions). Read the note before relying on it.
```text

plc:
[[what-this-project-is]] — Private Local Chat's Cosmoshot role, browser implementation, self-hosted app and separate site-layer boundary.
[[delivery-split-and-release-lessons]] — Who owns what in PLC's neutral delivery, why a release did or did not happen, how pins are refreshed, and what the clean-machine check needs.
[[encrypted-derived-record-deletion]] — Preserve per-chat cryptographic deletion for derived encounter text and recovery journals; private T418 finding and evidence.
[[intermittent-9b-installer-issue-left]] — John's decision 2026-11-18 to leave the rare 130-of-131 file failure of the 9B install; what is in place (model-runtime 1.0.0 refetch, 1.0.1 detail) and when to reopen.
[[preset-import-and-standalone-qualification]] — Checked T465/T34/T519 delivery, evidence limits, and unfinished bounded T222/T418 orchestration.
[[private-lines-vs-main-probe-20261119]] — A scratch merge of PLC's three private lines onto main: sizes, small textual and real semantic conflicts, the red tests and the one real defect at their own heads, and why T860 was added first.
[[real-device-access-iphone-and-mac]] — How to reach and drive the shared iPhone 15 Pro (boiler usbmux forward plus pymobiledevice3) and the networked Mac's Safari (ssh port 2222): commands, pitfalls, what only John can do.
[7/9 entries shown; cosmo-mem read plc _index.md]

program:
[[what-this-project-is]] — What Cosmoshot is and the near-term objectives for it.
[[concept-systems-plugin-path-and-loading]] — Where the Concept Systems plugin lives and the command that loads it in Claude Code.
[[conversation-archive-api-query]] — The Chat Cleave API schema location and supported GET search query fields.
[[conversation-archive-search-location]] — The shared Chat Cleave helper for searching imported conversations and its source contract.
[[cosmo-msg-branding-inbox-mapping]] — cosmo-msg maps both brand and aiofourown to one inbox named "branding"; teams.json is checked before program.json.
[[host-fact-evidence-contract]] — Host facts and native execution evidence
[[how-memory-is-kept]] — Where to find memory access, safe writes and sync, instruction rollout, and dream validation contracts.
[[lipsync-core-plan-location]] — The lip-sync core plan is located at /cosmoshot/lipsync/docs/CORE-PLAN.md and contains research, licence, scope, order, and decisions.
[[relay-named-exclusion-brutus-gpu]] — local:qwen3-8-27b-gsq-rco on brutus-gpu is a named exclusion in the relay router config.json; the recorded reason is its slow long-prompt latency.
[[shared-cdn-design-location]] — Design document for the shared cdn.aiofourown.com endpoint.
[10/48 entries shown; cosmo-mem read program _index.md]
```


- Planning: The planning board (https://cosmoshot.benac.dev) is the source of objectives and tasks. Record the work you do as notes on its task.
- Read the applicable shared skill before answering questions about programme procedures or carrying them out.
- Housing: read `docs/HOUSING.md` (how this clone is made ready, the test commands, what it leans on).
- Commits (this machine's hook): `type(scope): text` with lower-case text, a blank line, a body; every line under 100 characters;
  no trailers, no email addresses (`commit-rules` skill).
- Code that writes shared state ships a concurrency test (`concurrency` skill).
- Deploying: the team that works in a repository deploys its own work to production when it is ready and checked, and notes it on its board task.
- Working with another team: ask it directly. Write the need on the board task (what, from which team, why); keep a detailed ask in
  `contract-request.md` in your own repository; its agent or an independent reviewer answers on the same task with agreement and
  numbered corrections. Each team writes only in its own repository.
- Mail reaches you at your next prompt or tool call, and when you stop; read it with `cosmo-msg read ID`. If you are idle and
  it matters, the sender wakes you with a direct message. Never hold a background task (a watcher, `board-watch`) while you
  work toward a goal: the goal check is skipped while one runs. Check the board at your own turns.
- Delegating: `program/execution-lanes.md` and `api-key-executors.md`. New repository: the `new-repository` skill.
- Use `/usr/bin/python3`. Heavy runs can go to `boiler`. `/tmp` is memory-backed: no large trees there.
<!-- END cosmoshot-managed: instructions -->
