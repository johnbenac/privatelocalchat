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

`scripts/serve.mjs` takes `--dir DIR`, `--host H` and `--port N` (and `SERVE_DIR`, `HOST`, `PORT`). The folder defaults to `./app` if there is one (the release layout: `app/`, `serve.mjs`, `README.md` and the licence files side by side) and to `./dist` otherwise. It needs only Node.

- It applies the `_headers` file of the build it serves, so it sends exactly what the build declares. It refuses a folder that is not a build.
- It streams files and supports `HEAD`, `Range` and `If-None-Match`, so very large model files are no problem.
- It listens on 127.0.0.1. `--host 0.0.0.0` makes the copy reachable from the network and says so; see "Other devices" below.
- It **logs nothing about requests**. It prints one line when it starts.

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

By default the model files come from the project's content delivery network (`app-config.json`). To use your own source, set it in `config/app-config.json` and build (`docs/APP-CONFIG.md`). Every file is checked against the size and SHA-256 pinned in the app, whichever source it comes from.

## Upgrading

Download or build the newer version and replace the files; the app finds out by itself (`docs/UPGRADE-BEHAVIOUR.md`) and offers the new build in a notice. Chats and settings live in each person's browser and are not touched by replacing files (`docs/DATA-COMPATIBILITY.md`). A tool that unpacks releases side by side and switches between them (`--upgrade`, `--rollback`) comes in a later stage.
