# The site layer

The app is open source. The site that serves it at privatelocal.chat is not part of it: its pages, its manifests and its announcements are a **site layer**, kept in a private repository, `johnbenac/privatelocalchat-site`, licensed to nobody. This document is the contract between the two. It names nothing that is in the private repository except by role.

## The site directory

A build takes a site directory (`SITE_DIR`, a folder; unset means `run-kit/`, the neutral set that ships here). The three kinds of build, `TARGET=app | runkit | site`, are described in `docs/RUN-IT.md`; `SITE_DIR` means the `site` target:

```
<site>/
  site.json                 the site manifest: the pages that exist, and who the site is (docs/SITE-LINKS.md)
  site-config.json          facts about the site: support address, discussion space, hosting logs, the organisation it belongs to
  pages/<name>/index.html   any of help, about, privacy, updates; the build makes exactly the ones that exist
  updates/entries.json      announcements ({ "entries": [...] }), needed only when there is an updates page
  CNAME                     kept for the record; nothing reads it
  tests/                    tests that pin this site's own wording and policy
```

What the build does with it (`scripts/build.mjs`, `scripts/public-site.mjs`):

- **Pages.** Each page is a plain HTML file with region markers (`<!--plc:name-->...<!--/plc:name-->`) that the generator fills: the navigation (only pages that exist), the licence line, the known issues, the announcements, and, when `site-config.json` supplies them, the contact address, the community section and the organisation line (`umbrella`, as `{ "name", "url" }`). `node scripts/public-site.mjs sync <site>` rewrites the regions in the committed pages.
- **Known issues** (`content/known-issues.json`) describe the app and belong to everyone, so they are in this repository. Announcements are the site's.
- **The address.** The sitemap, `robots.txt` and the RSS feed are made only when the manifest has `site.url`, and the feed only when there is an updates page with entries. Without an address a copy writes none of them.
- **The page head of the app** (canonical, Open Graph, social card, structured data), the Share entry points and the assistant's sentence about the host also come from the manifest's `site` block (`docs/APP-CONFIG.md`).
- Pages are checked while building: every stylesheet, script and image a page names must exist in the output.

## The neutral set (`run-kit/`)

Help and About only, with a manifest that lists just those two and has no `site` block. It is Help with everything that names a site or its hosting taken out, plus a short About, and it carries every anchor the app links to. A clone, a fork or a contributor's machine builds it with no setup. `tests/run-kit.test.mjs` checks the structure, the anchors, the generator on a fixture site (`tests/fixtures/site/`), and that no string a neutral copy must not carry is in the pages.

## How production is built

The deploy workflow (`.github/workflows/deploy.yml`):

1. checks out the private repository on the same branch name (`main` builds `main`, `dev` builds `dev`) with a read-only deploy key (`SITE_DEPLOY_KEY`) into `site-layer/`, without keeping credentials in the git configuration;
2. runs the public tests and then the site's own tests (`APP_ROOT=. SITE_ROOT=site-layer node --test site-layer/tests/*.test.mjs`);
3. builds with `SITE_DIR=site-layer`;
4. deploys and verifies the result.

If step 1 fails, the job fails and the live site stays as it is. The built site is not uploaded as an artifact, a release asset or a log. `tests/workflows.test.mjs` fails on `pull_request_target`, on an artifact of `dist`, on a workflow that prints the key and on any workflow other than the deploy using it. Forks receive no secrets because no workflow uses a trigger that would give them any.

## The deploy key

A read-only deploy key on the private repository, whose private half is the secret `SITE_DEPLOY_KEY` of this repository. To rotate it: make a new ed25519 pair in a temporary folder, add the public half as a read-only deploy key on the private repository, replace the secret, check that the next deploy fetches, remove the old deploy key, and destroy the local files. Nothing about it is written down here beyond this.

## Snapshots

`docs/evidence/split/runkit-baseline.json` is the neutral build and is checked for everyone (`npm run snapshot:check`).

`docs/evidence/split/site-baseline.json` is the site build as it was when the pages moved out of this repository. With the site layer at its first commit (`5d6d0b3`) checked out, `SITE_DIR=<site> npm run snapshot:check:site` reports no differences: the move changed no byte of what privatelocal.chat serves. It is evidence of that move and not a standing gate, because a gate would tie every page edit in one repository to a baseline edit in the other; a later page edit is expected to differ from it.

## What is public anyway

The pages and their history were in this repository until the move, and the history is not rewritten: moving them stops new publication and does not remove the past.
