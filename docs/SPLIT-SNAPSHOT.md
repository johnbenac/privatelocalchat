# Snapshot tools

Two tools that make changes to what the build produces, and to the hosts the app names, visible and deliberate. They were added as stage 0 of the work that separates the app from the site wrapped around it, and they stay useful for any change to the build.

## The site snapshot

`scripts/snapshot.mjs` builds the production (`site`) output with a fixed commit, branch and clock, so the same sources always give byte-identical output. It records every file with its size and sha256.

```sh
node scripts/snapshot.mjs build --out manifest.json       # build and write the manifest
npm run snapshot:check                                    # compare the current build with docs/evidence/split/site-baseline.json
node scripts/snapshot.mjs diff A.json [B.json]            # compare two manifests (B defaults to a fresh build)
node scripts/snapshot.mjs compare <rev> [--allow GLOB]    # build <rev> and the current tree, list every changed file with its diff
```

`diff` and `compare` exit 1 when anything differs that is not covered by an `--allow` glob. Globs match paths in the output: `*` stays inside a folder and `**` crosses folders, for example `--allow 'releases/*/chat/shell/**'`. The paths contain the placeholder commit `0000000000000000000000000000000000000000`.

How it is reproducible: the build reads `GITHUB_SHA` and `DEPLOY_BRANCH` from the environment, and `SOURCE_DATE_EPOCH` (seconds) now sets the build time and the sitemap's date for the home page. With `SOURCE_DATE_EPOCH` unset, the build is unchanged: the clock and the last commit date are used. `tests/split-snapshot.test.mjs` builds twice and fails if the manifests ever differ.

`docs/evidence/split/site-baseline.json` is the output as it stood after the last change that meant to alter it. A change that is meant to alter the output either passes `--allow` for the files it touches or commits a new baseline with the reason in the commit message. `compare` works for any revision that contains `SOURCE_DATE_EPOCH` support in `scripts/build.mjs`; older revisions report that they cannot be compared byte for byte.

Branches named `split/**` run `npm run snapshot:check` in CI (`.github/workflows/split-snapshot.yml`).

## The network inventory

`scripts/network-inventory.mjs` scans the app source (`index.html`, `local-models.*`, `conversation-messages.mjs`, `chat/`, `runtime/`, `brand/`) for the hosts it names and for the paths it fetches from its own origin. It keeps three lists in `docs/evidence/split/network-origins.json`: hosts named by app code, hosts named by vendored libraries, and own-origin fetch paths, each with the files that name them.

```sh
node scripts/network-inventory.mjs check    # exit 1 and show what changed
node scripts/network-inventory.mjs write    # accept an intended change
```

`tests/split-snapshot.test.mjs` runs the check, so adding, moving or removing a host in the source fails the tests until the inventory is rewritten in the same change.

A host in the list is not necessarily contacted. The provider list and the documentation links name hosts that are only used when a person chooses them, and namespace strings such as `www.w3.org` are never fetched. The scan reads string literals, so a request whose address is assembled at run time appears only through the literal parts. Use the inventory as the complete list to review when describing the app's network behaviour.
