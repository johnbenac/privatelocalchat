# Moving the Private Local Chat development service and its sites off /srv

Written and carried out 2026-11-15 for board task 164, on the machine `centroid`. It follows
`/cosmoshot/cyberplanetary-forge/docs/SERVICE-MOVES.md` (the plan layout) and `docs/CLONE-STANDARD.md` there. The owner's
definition of the migration: "all the stuff is at the new place, and none of the stuff is at the old place."

Section "What was done" at the end records what differed from the plan. The old folders are untouched and still hold the
old files; they are deleted only from the owner's list.

## What runs, and what each old folder was

Three folders under `/srv` held an earlier Private Local Chat than the one this repository publishes: an April 2026 "integration
kit" tree (Vite, React, a telemetry harness, a benchmark area). The product (`main` here) is not deployed on this machine at
all (Cloudflare Pages serves it), so what runs on `centroid` is only this older tree's development tooling.

| Old folder | What it is | What ran from it |
| --- | --- | --- |
| `/srv/privatelocalchat` (3.4 GB) | the integration kit: source (1.8 MB, 168 files), `dist/` (built, 1.1 GB), `public/` (staged runtimes and model files, 1.1 GB), `bench/` (154 MB), `node_modules/` (0.9 GB), `data/dev-harness/` (189 MB of telemetry the service wrote) | `privatelocalchat-dev-harness.service` (a Node program on 127.0.0.1:4319, user `caddy`); Caddy hosts `privatelocalchat.benac.dev` (the built app, plus `/api/dev-harness/*` to the service) and `privatelocalchat-bench.benac.dev` (bench pages, the staged runtimes and the models) |
| `/srv/privatelocal` (316 KB) | six static files and icons, byte-identical to `/srv/privatelocalchat/site/` | Caddy host `privatelocal.benac.dev` |
| `/srv/privatelocalchat-model-archive` (3.3 GB) | 31 split model files (Granite 4.0 H 1B, LFM2.5 2.6B, Qwen3.5 2B) | nothing |

## Every place that names the old paths

Live host (all moved, none left):

* `/etc/systemd/system/privatelocalchat-dev-harness.service` lines 9, 13, 14 (`WorkingDirectory`, `DATA_DIR`, `ExecStart`).
* `/etc/caddy/sites/10-static/privatelocal.caddy` (1 line), `privatelocalchat.caddy` (1 line), `privatelocalchat-bench.caddy` (6 lines).
* No crontab, `/usr/local/bin`, `/usr/local/sbin`, sudoers, CoreDNS file or Kubernetes object (checked with
  `kubectl get pv,pods,cm,deploy,sts,ds,cronjob -A -o json`, no `hostPath` and no text names them). `speech-privatelocal.caddy` names a
  different host (`speech.privatelocal.chat`) and no folder. No process other than the service read these folders.

Tracked files (tracked, as `git grep` finds them on 2026-11-15):

* `/cosmoshot/aiofourown` `docs/HANDOVER-closeout-2026-11-13.md` (5 lines): a dated record. Left.
* `/cosmoshot/tools` `projects.json:38` (the prefix `/srv/privatelocal`, so old Claude sessions still match), `keeper/README.md:34`,
  `keeper/tests/test_keeper.py:44`, `mem/tests/test_cosmo_mem.py:334,341`: the session-name rule that task 163 removes after
  the re-homing. Left for 163.
* `/cosmoshot/sonalon` (read-only, not edited): `tools/places/verify_bungalow_fixture_lighting.mjs:41` defaults the Playwright module to
  `/srv/privatelocalchat/node_modules/playwright/index.mjs` (the environment variable `PLAYWRIGHT_MODULE` overrides it; the clone
  `/cosmoshot/privatelocalchat/node_modules/playwright` holds one). This is the one live dependency on the old tree that is not a
  service: the folder `node_modules` must not be deleted until Sonalon's owner changes that default. Other Sonalon lines name the
  older `/srv/privatelocalchat-public` in comments and notices (not these folders).
* `/cosmoshot/concepts` `development/EXPANSION-BRIEF.md` (1 line, read-only, listed only).
* This repository: `docs/HOUSING.md` (updated in the same change) and, on the private branch `private/dev-harness`, the kit's own
  documents and scripts (`CLAUDE.md`, `README.md`, `SOURCE_OFFER.txt`, `deploy.sh`, `ops/*`, `harness/` before the fix): the April record, kept as it was.
* Claude session folders named `-srv-privatelocal` and `-srv-privatelocalchat` (task 163 and the keeper's name rule).

## The target layout

`STATE=/var/lib/cosmoshot/privatelocalchat` (root:root 0755; same volume as `/srv`, 171 GB free; no part is a link except `current`).

```
STATE/releases/<commit>/harness/dev-harness-server.mjs   the program, read-only, from commit <commit> of
                                                         origin branch private/dev-harness (git archive of integration-kit/harness)
STATE/releases/<commit>/RELEASE                          the commit, branch and path it came from
STATE/current -> releases/<commit>                       the selection the unit runs
STATE/data/dev-harness/                                  state the service writes (caddy:caddy)
STATE/www/app/                                           the built app (was dist/)         privatelocalchat.benac.dev
STATE/www/bench/                                         the bench pages (was bench/)      privatelocalchat-bench.benac.dev
STATE/www/assets/{ort,wllama,transformers-ort,models,fixtures}/   (was public/...)          privatelocalchat-bench.benac.dev
STATE/www/privatelocal/                                  the six static files (was /srv/privatelocal)  privatelocal.benac.dev
```

Where each kind of thing lives, by the owner's rule:

* Source: the group, `cosmoshot/privatelocalchat`, branch `private/dev-harness` (orphan, group only, folder `integration-kit/`; why it is
  not on `main`: `integration-kit/HOUSING.md` on that branch).
* Service state: `STATE/data` (the telemetry), with a second copy of the telemetry on both disks.
* Bulk files: `/cosmoshot/store/privatelocalchat/{model-archive,served-models,dev-harness-data,pre-move-20261115}` and the same on
  `/media/Vivarium/cosmoshot/privatelocalchat/` (mode 700; each has `FILES` and `SHA256SUMS`, verified with `sha256sum -c` on both disks).
* Served copies (`www/`) are rebuildable output and staged runtimes: their source is the branch (`npm install`, `npm run build`),
  their models are in `served-models/`.

## The steps

0. Before. All must hold or stop:
   1. The unit is `active`; its old copy and the three Caddy site files are saved (`cp -p`) in the scratch folder and in
      `/cosmoshot/store/privatelocalchat/pre-move-20261115/` and its Vivarium twin.
   2. The source is on the group's branch and the harness program tested: on a scratch port it listens, accepts an event and
      writes under `DATA_DIR`, and with `DATA_DIR` unset it writes under its working folder (not under `/srv`).
   3. The unique large files have two verified copies (model archive, served models, telemetry).
   4. The before set of URLs is fetched twice and is stable (`probe.py`: status, sha256 of the body, size and the security
      headers for 188 URLs through the local Caddy with the real host names). Two directory listings (`/lib/`, `/experiments/`)
      differ in their hash between two identical fetches (the listing embeds a per-request value), so they are compared by status and size.
1. Install the release: `git archive <commit> integration-kit/harness | tar -x --strip-components=1` into
   `STATE/releases/<commit>`, files 0444, `RELEASE` written, `current` pointed at it with `ln -sfn` and `mv -T`. The blob hash
   of the program equals the commit's.
2. Copy the served trees and the state with `nice -n 15 ionice -c2 -n7 rsync -a` (service and sites still on the old
   paths): `dist` to `www/app`, `bench` to `www/bench`, `public/{ort,wllama,transformers-ort,models,fixtures}` to `www/assets`,
   `/srv/privatelocal` to `www/privatelocal`, `data/dev-harness` to `STATE/data/dev-harness`; `chown -R caddy:caddy STATE/data`.
   Check each with `diff -rq` (content, not only names).
3. Stage the four edited files (only the path lines change: 3 in the unit, 8 in the Caddy files) and compare each to the old
   copy with `diff`; `systemd-analyze verify` the unit.
4. Cut over:
   1. Install the three Caddy files and `caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile` (the documented way,
      `/srv/praxes/patterns/new-subdomain-checklist.md`: validate, then `systemctl reload caddy`). If it is not "Valid configuration",
      copy the three saved files back and stop.
   2. `systemctl stop privatelocalchat-dev-harness`; `rsync -a --delete` the telemetry once more (the last delta);
      install the new unit; `systemctl daemon-reload`; `systemctl start privatelocalchat-dev-harness`; wait for
      `127.0.0.1:4319/healthz` to answer 200.
   3. `systemctl reload caddy` (never restart: a reload keeps every open connection).
5. Check after: fetch the same 188 URLs and compare with the before file; `systemctl show` names `STATE`; the process's `cwd` is under
   `STATE`; no open file under `/srv/privatelocal*`; one event posted through the public host lands in `STATE/data` and the old
   telemetry files do not change in size.
6. Soak, then delete the old folders from the owner's list (see "What can be deleted").

Downtime: the harness receiver (`/api/dev-harness/*`) is down from `stop` to the first healthz answer, about 2 seconds; the static
sites are not interrupted (a reload is graceful). The harness is development tooling used from a phone during an investigation
that is closed (the data was last written on 2026-11-14 21:12); an event sent in the window is lost.

Riskiest step: 4.1, a Caddy site file that validates but fails to serve (a wrong `root`, or a folder `caddy` cannot read). It is
caught by the after-fetch of all 188 URLs, and undone by copying the three saved files back and `systemctl reload caddy`. The
second risk is the unit not starting on the new path (a `status=226/NAMESPACE` or `203/EXEC`): it is caught by the healthz wait,
and undone by restoring the saved unit.

Rollback, at any point before the old folders are deleted: `install -m 0644` the three saved Caddy files and the saved unit
back, `systemctl daemon-reload`, `systemctl reload caddy`, `systemctl restart privatelocalchat-dev-harness`. The old folders were
not written to, except that between the cutover and a rollback the new `STATE/data` may hold telemetry the old one does not;
copy it back with `rsync -a STATE/data/dev-harness/ /srv/privatelocalchat/data/dev-harness/` first.

What would have stopped the move (conditions checked first): a change to code that cannot be tested (none: the program was
run on a scratch port); no copy of the old unit or Caddy files (made); more than a minute of downtime (about 2 seconds);
no way to prove equivalence (the URL comparison below).

## What was done (2026-11-15, board task 164)

Carried out by the executor on `centroid` between 10:09 and 10:20 EST, following the steps above.

* **Source** is on `origin` branch `private/dev-harness`, commits `2f47a81` (the import, 185 files, nothing edited) and `a9f0806`
  (the harness default data folder no longer names `/srv`). The release installed is `a9f08067d7fda9c1fbe6b9be815ee94a41709e24`.
  `main` is unchanged apart from this document and `docs/HOUSING.md`.
* **Second copies**, each verified on both disks with `sha256sum -c` and an equal file list: `model-archive` (31 files, 3.47 GB),
  `served-models/{public-models (28 files), bench-test-models (3), bench-whisper-models (2)}`, `dev-harness-data` (2 files, 189 MB),
  `pre-move-20261115` (the old unit and three Caddy files). `dist/models` is hash-identical to `public/models`, so it needed no
  further copy. Vivarium kept more than 300 GB free (323 GB after the copies).
* **Downtime** measured from `systemctl stop` to the first answer of `healthz`: 1.7 seconds. The sites were never down.
* **Before and after**, 188 URLs through Caddy with the real host names (each fetch went to 127.0.0.1:443 with the host
  name in the request and in the TLS server name): 185 answered 200 and 3 answered 404 (the same three before and after).
  Status, sha256 of the body, size and the headers (content type, cache control, the three cross-origin headers, HSTS,
  frame, content-type-options, referrer and permissions policy, CSP) are identical for 185 of them. The other three are dynamic and are
  compared by status and size: the two directory listings of the bench host (200, same size; they differ between two fetches
  before the move as well) and `/api/dev-harness/status` on both hosts (200; the body names the data path and the counters, so it is
  27 bytes longer). The single-page fallback (an unknown path on the app host) returns the same `index.html`.
* **State**: an event posted through `https://privatelocalchat.benac.dev/api/dev-harness/events` grew the new telemetry files by 101 and 412
  bytes and left the old ones at 66,560,483 and 131,214,966 bytes. The process runs with `cwd` and data under `STATE`, from the unit
  `ExecStart=/usr/bin/node STATE/current/harness/dev-harness-server.mjs`.
* **Differs from the plan**: nothing in the steps; one fix to the plan itself: the first idea was to bring the kit into `main` under
  a folder, but it breaks two of `main`'s tests (they scan the whole tree for storage use), so the source went to an orphan branch.
* **Not done, by instruction**: nothing under `/srv` was deleted or edited, and no marker file was left in them.

## What can be deleted, and why it is safe

After the owner's word (and, for the last row, a change in Sonalon):

| Old path | Size | Safe because |
| --- | --- | --- |
| `/srv/privatelocal` | 316 KB | served from `STATE/www/privatelocal` (identical files); it is also `site/` of the kit, which is on the branch |
| `/srv/privatelocalchat-model-archive` | 3.3 GB | two verified copies (store and Vivarium); nothing reads it |
| `/srv/privatelocalchat` except `node_modules/` | 2.5 GB | source on the branch; `dist`, `bench`, `public` copied to `STATE/www`; models in `served-models`; telemetry in `STATE/data` and two other copies |
| `/srv/privatelocalchat/node_modules` | 0.9 GB | rebuildable with `npm install` from the branch's `package-lock.json`; BUT Sonalon's `tools/places/verify_bungalow_fixture_lighting.mjs` defaults to it (override `PLAYWRIGHT_MODULE`); do it when that default is changed |

Because the old folder is one directory, deleting it whole needs Sonalon's default changed first or accepted as broken (the
override works without it).

## What was not determined

* Whether anything outside this machine (a phone's saved home-screen page) still opens `privatelocalchat.benac.dev`: the host
  and its content are unchanged, so it would work either way.
* Who still uses the bench host or the harness: no request log was read for this.
