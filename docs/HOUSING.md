# Housing: where the repository lives and how it was moved

This document says where the Private Local Chat repository lives, what a clone of it holds, what is kept out of git on purpose,
and how it was moved on 2026-11-13. A clone made from nothing can be made ready from it alone.

## The rule

The owner's rule for all his projects:

* The repository's `origin` is `gitlab.benac.dev/cosmoshot/NAME`. For this repository that is
  `ssh://git@gitlab.benac.dev:32224/cosmoshot/privatelocalchat.git`.
* Its working copy is `/cosmoshot/NAME`. For this repository that is `/cosmoshot/privatelocalchat`.
* GitHub is for publishing.
* A working copy is a fresh clone. It holds exactly what its repository holds.
* Anything deliberately kept out of git is written down here, and has a second copy.

The folder is never copied from one place to another. The repository is pushed to `origin`, and the working copy is cloned from it.

## The two remotes

| Remote | Address | Job |
| --- | --- | --- |
| `origin` | `ssh://git@gitlab.benac.dev:32224/cosmoshot/privatelocalchat.git` | The home. Every branch is pushed here. |
| `github` | `git@github.com:johnbenac/privatelocalchat.git` | Publishing. The deploy workflows in `.github/workflows/` run from there; `main` is privatelocal.chat and `dev` is dev.privatelocal.chat. |

On this machine `origin` is written `git@gitlab.benac.dev:cosmoshot/privatelocalchat.git`; `~/.ssh/config` gives that host the port
32224, so it is the same address. The GitHub remote was kept under the name `github`. This clone also has the setting
`url.git@github.com:.insteadOf https://github.com/` from the machine's git configuration.

## What is kept out of git on purpose

`.gitignore` holds `node_modules/`, `dist/`, `.wrangler/`, `.env`, `.env.*`, `work/`, `__pycache__/`, `*.py[cod]`,
`.claude/worktrees/`, `release-assets/` and `.tmp-*`. In a fresh clone made ready as below, `git status --ignored` shows only
`dist/` and `node_modules/`.

| What | Why | Second copy |
| --- | --- | --- |
| `node_modules/` | Made from `package-lock.json`. | None. `npm ci` makes it again. |
| `dist/` | Build output. | None. `npm run build` makes it again. |
| `.env`, `.wrangler/`, `release-assets/`, `.tmp-*`, caches | Credentials, local tool state and scratch. None existed in the clone when this was written. | None needed. |
| `work/`: the ignored working material of the old working copies (Python virtual environments, snapshots, evidence, research, shots, the banner work) | Large, messy or private. It is the record of runs and research, not the product. | The two archives below. |

### The second copy of 2026-11-13

| File | Size | Where |
| --- | --- | --- |
| `plc-work-ignored.tgz` | 397,788,950 bytes (about 380 MiB), 43,155 entries | `/cosmoshot/store/closeout-2026-11-13/` and `/media/Vivarium/closeout-2026-11-13/` (the two have the same size and the same checksum) |
| `plc-production-work-ignored.tgz` | 1,381 bytes, three small files under `work/` | `/cosmoshot/store/closeout-2026-11-13/` only |

`plc-work-ignored.tgz` holds the ignored `work/` of the old working copy. By the record of 2026-11-13 it contains an expired
self-signed test key; it is a test key and has no use. I listed the archives and did not unpack them, and I did not find the key by
file name in the listing, so that line is as recorded on 2026-11-13. The archives are not in a clone and are not to be unpacked into
one wholesale. To take one directory out of it, extract only that path into a new empty directory:

```bash
mkdir /var/tmp/plc-work && tar -xzf /cosmoshot/store/closeout-2026-11-13/plc-work-ignored.tgz -C /var/tmp/plc-work work/research
```

The commits that no branch of the old working copy reached are kept in `origin` under `refs/archive/old-working-copy/` (see the
checklist). They are not in a clone unless it fetches that namespace.

### The three folders under /srv: moved on 2026-11-15 (board task 164)

They held an earlier Private Local Chat (the April 2026 "integration kit"), not this repository's app. They are no longer
"not part of the move": `docs/SERVICE-MOVE.md` says what each was, what ran from them and where everything is now.

* The kit's source (168 files, no credential found) is in this repository's group copy on the private branch `private/dev-harness`
  (orphan, folder `integration-kit/`, group only; it is not on `main` or on GitHub, and `integration-kit/HOUSING.md` on that branch says why).
* The development harness service and the three web sites run from `/var/lib/cosmoshot/privatelocalchat` (release of that branch,
  telemetry state, the served copies). Caddy and the unit name that folder, not `/srv`.
* The model files (`/srv/privatelocalchat-model-archive`, the served models and the telemetry) have two verified copies:
  `/cosmoshot/store/privatelocalchat/` and `/media/Vivarium/cosmoshot/privatelocalchat/` (mode 700, `FILES` and `SHA256SUMS` in each).
* The old folders were deleted from the owner's list on 2026-11-15, except `/srv/privatelocalchat/node_modules`, which stays
  because a Sonalon tool defaults to its Playwright (`PLAYWRIGHT_MODULE` overrides it; see `docs/SERVICE-MOVE.md`).

### Does the test suite need the working material?

No. `npm test` is `node --test tests/*.test.mjs`. It passed in a clone made from `origin` with nothing but `npm ci` (below), so it
reads nothing from `work/`.

## How a fresh clone is made ready

Node.js 22 or later, as the README says.

```bash
git clone ssh://git@gitlab.benac.dev:32224/cosmoshot/privatelocalchat.git /cosmoshot/privatelocalchat
cd /cosmoshot/privatelocalchat
git remote add github git@github.com:johnbenac/privatelocalchat.git
git config checkout.defaultRemote origin
npm ci
npm test
npm run build
```

`npm run e2e` runs the browser tests and needs Playwright's browsers; it is not part of the check. The private site layer
(`privatelocalchat-site`, see its own `docs/HOUSING.md`) is not needed to build or test the app; the deploy adds it.

The commit hooks of this machine's git template write `.commitlintrc.cjs` and `.gitlint`. In this repository both are tracked,
so a clone has them and they are not out of git.

Fresh-clone check, 2026-11-14: `git clone /cosmoshot/privatelocalchat` into a scratch directory, `npm ci` (43 packages), `npm test`
and `npm run build`. Result: 1,579 tests, 1,575 passed, 0 failed, 4 skipped. The build wrote 189 files. The scratch directory was
deleted. The session of 2026-11-13 recorded 1,575 tests passing; the same number passes here, with four more that skip.

## The move, as a checklist

- [x] A fresh clone was made from GitHub and pushed to the cosmoshot group on 2026-11-13. The group is `origin`; GitHub is kept as
  `github`. As recorded on 2026-11-13.
- [x] 47 commits that no branch reached in the old working copy are preserved in the group under `refs/archive/old-working-copy/`,
  as recorded on 2026-11-13. I found 24 such refs on `origin` (named by the first ten characters of the commit); I did not count the
  commits behind them.
- [x] The git notes refs were copied across. `origin` holds 106 refs under `refs/notes/`, and so does this clone.
- [x] `origin` holds 327 refs in all. A clone has `main` and the remote branches of both remotes.
- [x] In the fresh clone `npm ci`, the build and the tests pass (above).
- [x] The ignored working material of the old copies is in the second copy (above).
- [x] The three old working copies, `/srv/privatelocalchat-public`, `/srv/privatelocalchat-production` and
  `/srv/privatelocalchat-owner-release`, were deleted on 2026-11-13 after the owner closed the sessions in them. None exists now.
- [x] The banner graphics went to the repository `cosmoshot/aiofourown`, under `graphics/linkedin-banner/`. That directory exists
  in `/cosmoshot/aiofourown`.
- [x] The history of the Claude sessions of the old folder is resumable from this one: three sessions, hard-linked on 2026-11-14
  under `/root/.claude/projects/-cosmoshot-privatelocalchat/` (three `.jsonl` files, each with link count 2).

## After the move

* Work happens in `/cosmoshot/privatelocalchat`. Every branch is pushed to `origin`. `github` is for publishing.
* Another branch is worked on in a worktree under `.claude/worktrees/` (ignored by `.gitignore`).
* Deleted on 2026-11-13: the three old working copies named above.
* Kept: the second copy on both disks; the archive refs in `origin`. The three directories under `/srv` were moved on 2026-11-15
  (see above) and wait for the owner's deletion list.
* The order of work: everything that is not migration waits for board task 102 "All migrations complete", at
  https://cosmoshot.benac.dev, as recorded on 2026-11-13.
