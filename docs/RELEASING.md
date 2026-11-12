# Releasing

A release is something a person can download, check and run: two zips, their checksums and a record of the data formats they read and write. This page says how a release happens, what it carries, how to check a download, and how to cut one by hand. How to run a downloaded folder is in `docs/RUN-IT.md`.

## How a release happens

Nobody tags or uploads by hand. The `Release` workflow (`.github/workflows/release.yml`) starts after every successful `Deploy Cloudflare Pages` run on `main`:

1. It waits for the `Data upgrade` workflow to pass for that commit (`tests/e2e/data-upgrade.e2e.mjs` loads data saved by earlier releases into this build, `docs/DATA-COMPATIBILITY.md`). If the suite did not pass, or did not finish in 30 minutes, there is no release.
2. It installs the dependencies (`npm ci`) and runs `semantic-release` with `.releaserc.cjs`.
3. `semantic-release` reads the commit subjects since the last tag. `feat:` makes a minor release, `fix:` and `perf:` a patch, a `BREAKING CHANGE` a major one. `build:`, `test:`, `docs:`, `chore:`, `ci:` and `refactor:` make none, so use them for work that should not publish. The tag is `v<version>`.
4. Through `@semantic-release/exec` it runs `scripts/release-hooks.mjs`: `notes` appends the Upgrading section to the notes, and `prepare` writes the files to attach. If a zip fails `unzip -t` or carries anything `tests/neutrality.config.json` forbids, `prepare` stops and nothing is published.
5. `@semantic-release/github` creates the release with the files.
6. A separate step attests the files (`actions/attest-build-provenance`). If it fails, the release stands and the files are still published with their checksums.

A commit that is not a `feat`, `fix` or `perf` still deploys the site; it just makes no release. The version in a release is the release's, not `package.json`'s: the build takes it from `RELEASE_VERSION` (`docs/RUN-IT.md`). The deployed site keeps showing `package.json`'s version (`docs/TECHNICAL-DEBT.md`, item 6).

### When a release does not happen

- **The deploy failed.** `npm test` runs in the deploy, after a merge, and not in the pull request's checks. Run the whole suite on the committed tree before you push (`npm test`). A red deploy leaves the live site as it was and the release is skipped.
- **The Data upgrade suite failed.** Look at its run for that commit. If it is one of the intermittent suites below, rerun it (`gh run rerun <id> --failed`); the release job polls for it. Otherwise fix the cause: a release must not go out over data it cannot open.
- **Intermittent suites.** `tests/e2e/update-midsession.e2e.mjs` has failed in CI at its last step (the reload took over 30 s to commit); it records a trail on failure, and a rerun passes. `tests/e2e/voice-call-ui.e2e.mjs` is not in CI and fails about two runs in five on `main` too. Check `main` before blaming a change.
- **Tests that build run in parallel.** `node --test` runs files at the same time. A test that lists the repository root, or any shared folder, will meet another test's build folder and fail now and then. Give a test a folder of its own (`packageRelease` takes `workDir`).

## What a release carries

| File | What it is |
| --- | --- |
| `private-local-chat-<version>-app.zip` | the app and nothing else: no Help, About or other page |
| `private-local-chat-<version>-runkit.zip` | the app and the neutral Help and About that ship with it |
| `compat.json` | what this build reads and writes (below) |
| `SHA256SUMS` | the checksums of the two zips and `compat.json`, in the format `sha256sum -c` reads |

The notes hold the changes and an **Upgrading** section: the formats this release reads and writes, what changed since the previous release (a comparison of the two `compat.json` files), the oldest release it upgrades directly from, what stepping back does, and how to check a download.

Each zip holds one folder, `private-local-chat-<version>-<target>/`:

- `app/`: the build exactly, with its `_headers`, `version.json` and `sw.js`.
- The tools, which need only Node.js: `serve.mjs` (the server), `headers.mjs` (the header rules it reads), `plc.mjs`, `operator.mjs`, `overlay.mjs` and `zip.mjs` (the operator folder: install, upgrade, roll back, check, prune), and `fetch-models.mjs`. They are the `RELEASE_TOOLS` of `scripts/package-release.mjs`.
- `models.json`: every model file the app can download, with its size and SHA-256, written by the build from the pins the app uses. `fetch-models.mjs` reads it; the app never fetches it.
- `README.md`: how to run the folder and how to install it as an operator folder.
- `LICENSE` and `THIRD-PARTY-NOTICES.md`.
- `SOURCE.txt`: the tag, the full commit, the repository, the address of the source archive, and the command that rebuilds `app/`.
- `compat.json`.

How a person installs, upgrades and rolls back a release with these tools is in `docs/RUN-IT.md`.

The zips are written by `scripts/package-release.mjs` with `node:zlib` and no zip program: entries sorted, times fixed to the commit's time, fixed modes. The same commit gives the same bytes on the same Node and zlib; a different zlib may compress to other bytes with the same contents. The files inside `app/` are the same either way.

`compat.json` is written by `scripts/compat.mjs` from the code and never by hand: every key a browser keeps (`chat/vault/key-classes.mjs`, without session-only and test keys) with its format, the two database versions, each saved-file format with what it writes and every number it reads (`chat/transfer/file-formats.mjs`), the releases whose saved data the Data upgrade suite opens, and the oldest of them, which is the oldest release this one upgrades directly from.

### What a release is not

It is not the deployed site. The site is built from the private site layer (`docs/SITE-LAYER.md`), is never an asset, and the release job never fetches the site layer or uses its key. A release holds only the `app` and `runkit` targets, and `RELEASE_VERSION` is refused for the `site` target. The development tooling (the telemetry receiver, the dev tools, the diagnostics hooks) is not in a release; building `app` or `runkit` on the `dev` branch is refused.

## Checking a download

Put the zips and `SHA256SUMS` in one folder.

```sh
sha256sum -c SHA256SUMS                  # each file: OK
unzip -t private-local-chat-<version>-app.zip
gh attestation verify private-local-chat-<version>-app.zip --repo johnbenac/privatelocalchat
```

The checksums show the files are the ones that were published. The attestation shows GitHub built them from this repository, by `release.yml` on `main`, at the commit named in `SOURCE.txt`. `gh attestation verify` prints nothing unless it is writing to a terminal; the exit status is the answer (0 means verified). Add `--format json` to read the result: the repository, the commit and the workflow are in `verificationResult.signature.certificate`.

To check the build itself, rebuild it from the command in `SOURCE.txt` and compare the files with `app/`.

## Cutting one by hand

The normal path is the one above, and a hand-made release has no attestation. To make the files for a commit without publishing anything (to try the tools, or if the release job is down):

```sh
git checkout <commit>
npm ci
node scripts/release-hooks.mjs prepare --version <version> --commit "$(git rev-parse HEAD)" --out release-assets
```

`prepare` refuses a commit that is not the one checked out, writes the two zips, `compat.json` and `SHA256SUMS`, and runs the zip test and the neutrality scan over what it wrote. `node scripts/package-release.mjs --target app|runkit --version X.Y.Z --out DIR` makes one zip; `node scripts/release-hooks.mjs notes --version X.Y.Z --commit SHA --last-tag vA.B.C` prints the Upgrading section. Attaching the files to a release is `gh release upload v<version> release-assets/*`, and say in the notes that the files carry no attestation.

## What keeps a release neutral

`tests/neutrality.test.mjs` builds `app` and `runkit`, packs and unpacks the zips, and scans every text file for what is ours: our domain, the organisations that make the app, the maintainer's account and infrastructure, analytics hosts, links to our pages, and hosts the app does not fetch models from. Every host a file names must be in the network inventory (`docs/evidence/split/network-origins.json`) or listed with a reason. `scripts/release-hooks.mjs prepare` runs the same scan over the files it wrote, so the zips that are published are the ones that were scanned.

The rules are data in `tests/neutrality.config.json`. A place where one of the strings is meant to be (the default model source, the project's repository, a library's own text) is listed with its paths and its reason, and an entry that nothing uses fails the test, so the list cannot grow quietly. To allow something new, add the entry with a reason in the pull request that needs it, and say why in the description.

## Snapshots

The Data upgrade suite opens data saved by earlier releases, so it needs a snapshot taken from a real release (`docs/DATA-COMPATIBILITY.md`, `docs/FILE-COMPATIBILITY.md`). Take one whenever a stored or saved format changes, and at least every 15 releases; the check fails CI at sixteen releases behind.

```sh
git worktree add --detach /tmp/plc-vX.Y.Z vX.Y.Z      # the release, checked out, with a link to node_modules
ln -s "$PWD/node_modules" /tmp/plc-vX.Y.Z/node_modules
cd /tmp/plc-vX.Y.Z
node scripts/data-snapshot.mjs capture --release vX.Y.Z --commit <full sha>
node scripts/file-snapshot.mjs capture --release vX.Y.Z --commit <full sha> --data <the data snapshot folder just written>
```

Copy the two new folders (`tests/fixtures/data/NNN-…` and `tests/fixtures/files/NNN-…`) out of the worktree *before* removing it, put them in a branch of the repository and commit them with a `test:` subject. `compat.json` lists every snapshot and takes its oldest-release line from the oldest one, so it follows the folders by itself.

## Commits

Subjects are conventional (`type: subject`), at most 100 characters, with a body; body lines are at most 100 characters. The commit hook refuses a commit that breaks this, and the refusal is easy to miss if you cut its output with `tail`. Check that `git log` shows the new commit.
