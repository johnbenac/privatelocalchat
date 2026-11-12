# Running a copy of the app

Private Local Chat is a static app: files and a few headers. Anything that serves files and sends the headers below can host it. Everything a person does with it stays in their browser, so running a copy never holds anyone's chats, documents or settings.

## What you build

One build (`npm run build`, then the folder `dist/`) comes in three kinds, chosen with `TARGET` (`scripts/targets.mjs`):

| Target | What it is | When |
| --- | --- | --- |
| `app` | the app and nothing else: no Help, About or other page, and the app draws no link to one | a release for people who bring their own pages |
| `runkit` | the app and a neutral Help and About (`run-kit/`) | the default: a clone, a fork, a contributor's machine |
| `site` | the app and the pages of a site directory (`SITE_DIR`, `docs/SITE-LAYER.md`) | privatelocal.chat is built this way |

With `TARGET` unset, `SITE_DIR` unset means `runkit` and `SITE_DIR` set means `site`. `TARGET=app` or `runkit` together with `SITE_DIR` is refused, and so is `TARGET=site` without it. The version the app shows says `release` for `app` and `runkit` builds made on `main`, `local` otherwise, and never `production` or `development`: those are the names of privatelocal.chat's own sites. `RELEASE_VERSION=1.2.3` makes an `app` or `runkit` build say it was released as that version, in `version.json` and in Settings ("Private Local Chat 1.2.3 · build abc1234 (release)"); the release job sets it. Without it a build says the version of `package.json`, and the `site` target refuses it.

A build for downloading never carries our development tooling (the telemetry receiver, the development tools, the diagnostics hooks). It belongs to the `site` target on the `dev` branch; asking for `app` or `runkit` on `dev` stops with a message.

A test (`tests/neutrality.test.mjs`, rules in `tests/neutrality.config.json`, scan in `scripts/neutrality.mjs`) builds `app` and `runkit` and scans every text file of the output for what is ours: our domain, the organisations that make the app, the maintainer's account and infrastructure, analytics hosts, links to our pages, and hosts the app does not fetch models from. Each place where one of these is meant to be (the default model source, the project's repository, the libraries' own text) is listed with its reason, an entry that nothing uses fails the test, and every host an output names must be in the network inventory or listed. Another app can reuse the test with its own config.

## Run it on this computer

```sh
npm ci
npm run build          # a neutral copy in dist/
node scripts/serve.mjs # http://127.0.0.1:18171
```

`scripts/serve.mjs` takes `--dir DIR`, `--host H` and `--port N` (and `SERVE_DIR`, `HOST`, `PORT`). The folder defaults to `./app` if there is one (the release layout: `app/`, `serve.mjs`, `README.md` and the licence files side by side) and to `./dist` otherwise. It needs only Node. `node scripts/serve.mjs --help` (in a release, `node serve.mjs --help`, or `node plc.mjs --help` in an operator folder) lists every option, including the ones for an operator folder below.

- It applies the `_headers` file of the build it serves, so it sends exactly what the build declares. It refuses a folder that is not a build.
- It streams files and supports `HEAD`, `Range` and `If-None-Match`, so very large model files are no problem.
- It listens on 127.0.0.1. `--host 0.0.0.0` makes the copy reachable from the network and says so; see "Other devices" below.
- It **logs nothing about requests**. It prints one line when it starts.

## Run a downloaded release

Each release on GitHub carries `private-local-chat-<version>-app.zip` and `private-local-chat-<version>-runkit.zip` (the `app` and `runkit` targets above), `compat.json` and `SHA256SUMS`. Check the files first (`docs/RELEASING.md` says how), then:

```sh
unzip private-local-chat-<version>-runkit.zip
cd private-local-chat-<version>-runkit
node serve.mjs         # http://127.0.0.1:18171
```

The folder holds `app/` (the build), the tools (`serve.mjs`, `headers.mjs`, `plc.mjs`, `operator.mjs`, `overlay.mjs`, `zip.mjs` and `fetch-models.mjs`), `models.json` (every model file with its size and SHA-256), `README.md`, the licence documents, `SOURCE.txt` (the commit, the repository and the command that rebuilds `app/`) and `compat.json`. It needs Node.js 20 or newer and nothing else; `serve.mjs` finds `./app` by itself. To use another web server, serve `app/` with the headers in `app/_headers` (below). To keep your own settings, pages and models and to upgrade and roll back, install the release as an operator folder ("Run a copy as an operator", below).

## Other devices, and why https

The app's on-device features need the browser to treat the page as a *secure context*: `https://` anywhere, or `http://localhost` and `http://127.0.0.1` on the same computer. A copy served as plain `http://192.168.x.y:18171` to a phone loads, but the browser will not enable what the models and the offline copy need. Put `https` in front of it (a reverse proxy with a certificate, or a host that provides one).

## Headers a host must send

They are written once, in `scripts/headers.mjs`, and the build writes them to `_headers` (the format Cloudflare Pages, Netlify and others read). For a server configured by hand:

```sh
node scripts/headers.mjs nginx   # for an nginx server block
node scripts/headers.mjs caddy   # for a Caddy site block
node scripts/headers.mjs pages   # the _headers file itself
```

| Headers | Why |
| --- | --- |
| `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`, on every response | make the page cross-origin isolated, which the on-device model threads need. Without them the app cannot run a model on this device |
| `Cache-Control: no-cache` on `/sw.js`, `/build-info.js` and `/version.json` | they are how a copy learns that a newer build exists. If a cache answers for them, the copy never updates |
| `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` | the browser takes files for what they are, and sends no more than the site's address with outgoing requests |
| content types for `/LICENSE` and `/THIRD-PARTY-NOTICES.md`, a one-hour cache for `/sitemap.xml` and `/updates/rss.xml` | the licence documents open in the browser; the sitemap and feed are cheap to cache |

Serve `.wasm` as `application/wasm` and `.mjs` as `application/javascript`, and send a `404` for paths that do not exist.

Check the headers on the address people use, not only on the host you deploy to: a CDN or a zone setting can rewrite `Cache-Control` and undo a rule. Cloudflare's *Browser Cache TTL* does this to `/sw.js` unless it is set to *Respect Existing Headers* (`docs/TECHNICAL-DEBT.md`, item 57). `curl -sI https://your.domain/sw.js` should say `cache-control: no-cache`.

## Where the models come from

By default the model files come from the project's content delivery network (`app-config.json`). To use your own source, set it in `config/app-config.json` and build (`docs/APP-CONFIG.md`), or, for a release copy that `serve.mjs` serves from an operator folder, put the file in that folder's `config/` (below). Every file is checked against the size and SHA-256 pinned in the app, whichever source it comes from.

## Run a copy as an operator

The sections below are for a person who runs a copy for others, or for themselves over a long time, from a release zip. The tools need only Node.js 20 or newer. They install a release, keep your own settings, pages and model files beside it, upgrade, go back and check. They are not for a clone of the source: with a clone you use `git pull` and the build (`docs/APP-CONFIG.md` for settings).

In the commands below `/srv/plc` is the operator folder. Use any folder you like. The tools make it if it does not exist and never write outside it.

### The operator folder

```
/srv/plc/
  plc.mjs                      the launcher: the one file you run
  current.json                 which release is live (the truth; do not edit it)
  current/                     a link to the live release, for other web servers (made where the system allows it)
  releases/<version>-<target>/ one unpacked release each
  config/app-config.json      yours: where the model files come from
  config/site.json             yours: the links to your pages, and who you are
  pages/<name>/index.html      yours: your own pages
  models/<name>/<revision>/…   yours: model files, fetched with fetch-models.mjs
```

`config/`, `pages/` and `models/` are yours. No upgrade, rollback or prune writes into them. The only things the tools put there are a short `README.txt` in each folder when they make it, the model files `fetch-models.mjs` fetches, and `config/app-config.json` when you ask for `--use-local` and it does not exist yet.

Everything in `releases/` belongs to the tools. A release folder never changes after it is installed, except that an upgrade or a rollback adds the held builds described below.

### The first install

Check the download first (`docs/RELEASING.md`), then unpack the zip and install from the unpacked folder:

```sh
unzip private-local-chat-<version>-runkit.zip
cd private-local-chat-<version>-runkit
node serve.mjs --upgrade . --root /srv/plc
```

You can also give the zip itself: `node serve.mjs --upgrade ../private-local-chat-<version>-runkit.zip --root /srv/plc`. A zip needs its checksum: the release's `SHA256SUMS` in the same folder as the zip, or `--sha256 <the 64 digits>` from the release page. Without either, the tool refuses:

```
private-local-chat-<version>-runkit.zip has no checksum to compare with. Put the release's SHA256SUMS file in the same folder as the zip, or pass --sha256 <the 64 digits from the release page>. ...
```

A folder is taken as you unpacked it (it must still be called `private-local-chat-<version>-<app|runkit>`).

The first install prints, in short:

```
Made releases/
Made config/
Made pages/
Made models/
Wrote plc.mjs, the launcher: node plc.mjs runs the installed release.
Installed <version>-runkit (commit abc1234).
```

Choose `app` or `runkit` once. `runkit` carries a neutral Help and About; `app` carries no page at all (the targets are explained above).

Only a release that carries these tools can be installed this way: it has `plc.mjs`, `operator.mjs` and the files beside them. A release from before that cannot be installed with them. Run it the old way (above) or take a newer one.

### Start the server

```sh
node /srv/plc/plc.mjs                  # http://127.0.0.1:18171
node /srv/plc/plc.mjs --port 8080
node /srv/plc/plc.mjs --host 0.0.0.0   # reachable from the network: put https in front of it
```

`plc.mjs` hands over to the `serve.mjs` of the live release, so `--host` and `--port` mean what they mean in "Run it on this computer". It prints `Live release: <version>-<target>` and then the address. Do not give it `--root`: it always works on its own folder and says so if you do.

The server reads `current.json` on every request. An upgrade or a rollback changes what it serves at the next request, with no restart. A restart is still needed to run the new release's own `serve.mjs`; the tool says so.

### Upgrade

Download the newer release and its `SHA256SUMS`, check them (`docs/RELEASING.md`), then:

```sh
node /srv/plc/plc.mjs --upgrade private-local-chat-<new-version>-runkit.zip
```

(or from an unpacked newer folder: `node serve.mjs --upgrade . --root /srv/plc`). The tool checks the zip against its checksum, unpacks it beside the others, checks every file of the new build and its headers, and only then switches, in one step. If it stops at any point before the switch (an error, a power cut), the release that was live is untouched, and the next command removes what was left over.

It prints what it did and one line from the release's `compat.json` about going back. Installing the release that is already live does nothing and says so.

**What it refuses.** Each refusal says what is wrong and what to do:

- the target changes (the `app` zip over a `runkit` install, or the reverse), because their pages differ;
- the version goes down: "`<release>` is older than the installed `<release>`. To go back use --rollback; to install an older release anyway add --force.";
- the installed version is older than the release's `upgradesFrom.oldest` (in its `compat.json`; it is the oldest release whose saved data the release is tested to open): "`<release>` can only be installed over version 0.56.1 or newer, and 0.0.1 is installed. Install a release between them first … or add --force …";
- no checksum, or a zip that does not match its checksum;
- a release whose files do not match its own `release.json`, or whose `_headers` lacks a rule of `headers.mjs`. Nothing is changed; download it again;
- a folder or zip that is not a release as it was published (names that disagree, files missing), and a zip that is not safe to unpack (paths that leave the folder, links, too many or too large entries).

`--force` overrides three of these: a change of target, a lower version and a version older than `upgradesFrom.oldest`. It overrides nothing else.

**Open tabs keep working.** A tab runs the build it started on and loads that build's files from `/releases/<commit>/…` for as long as it is open. Before the switch the tool copies the build folders that open tabs may still be using (the current build and the ones it held, four at once) from the release being left into the release being entered, and checks each file against its `release.json`. A folder that fails its checks is left out, and the tool says so. It does the same on a rollback, so going back does not delete the files of a build someone is running. A tab is offered the new build by the notice described in `docs/UPGRADE-BEHAVIOUR.md`; chats and settings live in each person's browser and are not touched (`docs/DATA-COMPATIBILITY.md`).

**The server's own file changes on restart.** The running server keeps the `serve.mjs` it started with. It serves the new release's files at once, but the new `serve.mjs` runs only after you restart the server.

### Roll back

```sh
node /srv/plc/plc.mjs --rollback              # the release before the live one
node /srv/plc/plc.mjs --rollback 0.0.1        # a named installed release (a version, or <version>-<target>)
```

It checks the release first, carries the held builds across, and switches. It needs no checksum and no `--force`. Saved data stays readable by the older release: a version that finds data in a newer format leaves it untouched (`docs/DATA-COMPATIBILITY.md`). The `compat.json` of the release says what stepping back means for that release.

With one release only, it refuses:

```
0.0.1-runkit is the only release that was ever live here, so there is nothing to go back to. Name a release with --rollback <version> (installed: 0.0.1-runkit).
```

It also refuses a release that is not installed (it lists the installed ones) and the one that is live already.

### Check

```sh
node /srv/plc/plc.mjs --check [--deep] [--online]
```

It prints `PROBLEM:` lines, `note:` lines and a last line, `Healthy.` or `Not healthy: N problems.`. The exit status is 0 only when the copy is healthy, so a script can use it. It checks:

- every file of the live build and of each held build against its `release.json`, and that `_headers` carries every rule of `headers.mjs`;
- that `config/app-config.json` and `config/site.json`, if you have them, parse and pass the live release's own checks, and what model source and links they give;
- your pages, and any page whose name the release already uses (it is ignored when serving: rename the folder);
- for `models/`, how many files of each tier and voice are present with the right size. `--deep` also reads every file and checks its SHA-256, which takes a while for a full set;
- leftover `.incoming-*` folders of a run that stopped (the next command removes them).

`--online` is the only thing that asks the network anything about releases. It makes one request for the project's public release list and says whether a newer release exists. It never runs by itself, never runs from the app, and sends nothing about your copy beyond what any request carries. If the request fails it says so and the copy is still healthy.

### Prune

Each installed release is a full copy of the app, so they add up. Nothing deletes one until you ask:

```sh
node /srv/plc/plc.mjs --prune [--keep 3]
```

It removes the oldest installed releases until at most `--keep` remain (3 if you do not say). It never removes the live release or the one before it, so the count can stay above `--keep`; it says so. It touches nothing but folders of `releases/`.

### Your settings

Two files in `config/` change what the page says. Both replace the shipped value whole, as a build does.

- `config/app-config.json`: where the model files come from (`docs/APP-CONFIG.md`).
- `config/site.json`: which pages exist and where they are, and who the site is (`docs/SITE-LINKS.md`).

`serve.mjs` applies them when it serves the page (`/` and `/index.html`): it checks each file with the live release's own validator and puts the result into the page in memory. Nothing is written into the release, so its checksums stay true, and an upgrade needs nothing from you. Changes show on the next load of the page, with no restart.

An invalid file stops the server at start, with the reason:

```
/srv/plc/config/site.json cannot be used: it is not valid JSON (...).
Fix it or remove it, then start again (docs/APP-CONFIG.md, docs/SITE-LINKS.md).
```

While the server runs, a file that becomes invalid is ignored with one line on standard error, and the last good one stays in use:

```
config/site.json was changed but cannot be used, so the last good one stays in use: it is not valid JSON (...).
```

`--check` reports the same problem, so run it after you edit.

### Your pages

A file at `pages/<name>/index.html` is served at `/<name>/`, with anything the page uses beside it. Your file is served before the release's own. You can add `privacy`, or replace the neutral `help` and `about`. Link to them with `config/site.json`; the app draws a link only for a page that file names.

A name that the release already uses at its top level (`releases`, `brand`, `sw.js`, `models` and so on) is ignored when serving and reported by `--check`, except the project's page names `help`, `about`, `privacy` and `updates`.

Pages work online. They are not saved for offline use: offline, the app's saved copy does not know them, so their paths open the app.

### Fetch models and run from your own disk

By default the model files come from the source the release ships. To serve them yourself, fetch them into `models/` with `fetch-models.mjs`, which sits beside `serve.mjs` in a release (so in `/srv/plc/releases/<release>/`):

```sh
cd /srv/plc/releases/<release>
node fetch-models.mjs --tier nano --root /srv/plc --dry-run     # print the plan, download nothing
node fetch-models.mjs --tier nano,mini --root /srv/plc --use-local
```

It does nothing unless you name a tier or `--all`. Without one it says so and lists the tiers:

```
Refused: Nothing to fetch: name a tier with --tier (default, light, lfm, granite, mini, nano) or use --all. A full copy is about 14 GB.
```

The list of files comes from `models.json` in the release: every file with its size and SHA-256, the same pins the app checks. The sizes below are read from it (`--dry-run` shows them for what you name):

| Tier | Files | Size |
| --- | --- | --- |
| `default` | 262 | 10.1 GB |
| `light` | 13 | 1.2 GB |
| `lfm` | 6 | 1.4 GB |
| `granite` | 12 | 0.9 GB |
| `mini` | 1 | 0.2 GB |
| `nano` | 1 | 0.1 GB |

The voices are two more sets (`--voices`, about 0.1 GB together), and `--all` takes every tier and every voice: about 14 GB. `--tier` takes several names separated by commas.

Before it downloads it prints the number of files and bytes and checks that the disk has room (with a margin). It downloads three files at a time to `<file>.part`, continues a stopped download from where it stopped, checks size and SHA-256, and renames a file into place only when it is right. A file already there that is right is skipped (`--deep` checks its hash too); one that is wrong is replaced. It never deletes a file it does not know. A server that sends other bytes is refused. Run the same command again after any failure.

Where it fetches from: `--from <base>` if you give one (an `https://` address ending in `/`; `http://` only for `localhost` or `127.0.0.1`); otherwise the first source of your `config/app-config.json` if there is one; otherwise the source the release ships. It contacts only that source and nothing else.

`--use-local` (with `--root`) makes `config/app-config.json` with one source, `/models/` on this computer, but only if that file does not exist. If it does, the tool leaves it alone and prints the line to put in. After that the app asks your server for its models, and the server answers from `models/` (with `Range`, so large files are no trouble). Because the source is then `/models/`, a later fetch needs `--from <where to fetch from>`. `--check --deep` verifies what is on disk.

**What `fetch-models.mjs` does not fetch: the memory embedding set.** `models.json` has no file list for it: the code pins no files, sizes or hashes for it, so the tool cannot fetch it, and `--embedding` and `--all` print that its list is empty. A copy that serves its models from its own disk still downloads that set from its configured source the first time memory search is used. If that source is `/models/`, the files are not there and memory search does not work until you provide them.

### Run under a service manager

A systemd unit, as one example. Replace `plc` (the user) and `/srv/plc` with yours. The server listens on `127.0.0.1`; an https proxy in front of it makes the copy reachable (see "Other devices, and why https" above; the proxy must pass on the headers of `app/_headers` in the live release, which `serve.mjs` already sends).

```ini
[Unit]
Description=Private Local Chat
After=network.target

[Service]
User=plc
ExecStart=/usr/bin/node /srv/plc/plc.mjs --host 127.0.0.1 --port 18171
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

The user needs read and write on `/srv/plc` for upgrades, and only read for serving. After `--upgrade` or `--rollback`, restart the unit (`systemctl restart <unit>`).

### What is not covered

- **Another web server.** Your settings and pages apply only when `serve.mjs` serves the copy. Behind nginx or Caddy, `app/` of the live release is served as shipped: the shipped model source and no links of yours. To change that, rebuild from source (`docs/APP-CONFIG.md`). `/srv/plc/current/app` is the folder to point such a server at, where the system allows the link; after an upgrade it points to the new release.
- **Offline pages.** Your pages are not saved for offline use.
- **Clones.** The tools are for release zips. With a clone, use `git pull` and the build.
- **The memory embedding set.** `fetch-models.mjs` cannot fetch it (above).
- **Old releases.** A release from before the first one that carries these tools cannot be installed with them.
- **Logs.** The server logs nothing about requests, and the tools keep no record of what they did beyond `current.json`.
- **Updating the launcher** beyond what a release carries: an upgrade replaces `plc.mjs` only when the release has a newer launcher format.
