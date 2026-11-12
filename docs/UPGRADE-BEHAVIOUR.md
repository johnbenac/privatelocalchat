# Upgrade behaviour on privatelocal.chat

A new build is published many times a day, and browsers fetch it without asking. This is what a tab does when one arrives.

## The rules

1. **A tab runs one build for as long as it is open.** Every file a running tab loads later (a lazy module, the voice files, a model runtime) comes from the build the tab started on: `/releases/<commit>/...`.
2. **A new build takes over when the app next opens, or when the person chooses.** A short notice at the bottom says "A new version of Private Local Chat is ready", links to What changed (`/updates/`), and offers Reload and Later. Later hides it for that build; a still newer build shows it again.
3. **The app does not reload itself once it is open.** The one automatic reload is at page load, before the app starts, when the page found itself older than the published build (a stale saved copy). It happens once per tab session; after that the notice is shown instead.
4. **Reload asks first when it would interrupt something.** `window.plcUpdateGuard` (in `local-models.js`) lists what a reload would stop: a reply being written, a model download or load, a recording or voice call, a message not yet sent. The notice then says so and offers Reload anyway or Keep working. An unsent message is saved and put back after the reload.

## How a tab keeps its build

- **On the server.** `scripts/build.mjs` writes `releases/<commit>/release.json` (every file with its size and SHA-256) and `releases/index.json` (`current`, `retained`). Before a deploy, `scripts/retain-releases.mjs` copies the folders the live site holds (the current build and the ones it kept) into the new output, checking each file against its manifest, and lists them in `retained`. Four builds are held at once (`DEFAULT_KEEP`). A folder that cannot be fetched or fails its checksums is left out and logged; the deploy goes ahead as it did before. `scripts/verify-release.mjs` checks the kept folders are served.
- **In the browser.** The service worker keeps one saved copy per build (`plc-shell-<commit>`). When a new worker activates it asks every open tab which build it runs (`which-build`, answered by the inline script in `index.html`) and keeps those copies as well as the one before, so a tab that stays open across several deploys can still start things offline.
- **Finding out a build was published.** `/version.json` and `/releases/index.json` are always fetched from the network by the worker (the saved copy is only a fallback offline), and the page asks with a changing query. Before this, an open tab was answered from its own saved copy and could not see a newer build.

## Tests

- `tests/retain-releases.test.mjs`: the folders are copied and verified, the limit holds, a tampered file or unsafe path keeps a build out, an unreachable site keeps nothing and does not fail; the build writes a correct manifest.
- `tests/e2e/update-midsession.e2e.mjs` (workflow **Update behaviour**): a real browser with the service worker, two deploys while the tab is open (the earlier build's folder gone from the server, as in production): the notice appears and the page does not reload; the tab still loads its own build's files, including after two newer builds; Later is remembered per build; unsent text and a reply in progress each stop Reload until confirmed; Reload brings the new build and the unsent message.
- `tests/e2e/fresh.e2e.mjs`: a page older than the published build repairs itself once, then offers the update.

## Upgrades of a copy you run

A copy installed as an operator folder (`docs/RUN-IT.md`) keeps a tab that is open working in the same way. Before it switches releases, `--upgrade` copies the build folders that tabs may still run (`releases/<commit>/`: the current build and the ones the release being left held, four at once) into the release being entered, checks every file against that build's `release.json`, and writes the entered release's `releases/index.json` (`current`, `retained`). A folder that fails its checks is left out and the tool says so. `--rollback` does the same in the other direction, so going back does not delete the files of a build someone is running. After a switch the notice of rule 2 offers the tab the other build; `/version.json` and `/releases/index.json` are answered from the live release.
