# Running Private Local Chat yourself

Private Local Chat is a chat that runs language models in your browser, on your device, or talks to a model service you choose. Everything you create in it (chats, settings, saved presets, downloaded models) stays in your browser's storage on the device you use; a copy you run holds no one's data.

This page is the short version. `RUN-IT.md` (in the source repository's `docs/`) has every command and option, and `DATA-HANDLING.md` says exactly what the app keeps and sends.

## What you need

- **Kind:** static files, served by any web server. One small Node.js tool (`serve.mjs`) is included if you do not have one.
- **Headers a host must send:** `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` on every response (the page must be cross-origin isolated so on-device models can use threads), and `Cache-Control: no-cache` on `/sw.js`, `/build-info.js` and `/version.json` (so a copy learns about a newer build). The build writes them to `app/_headers`; `node headers.mjs nginx` or `node headers.mjs caddy` prints them for those servers.
- **Browser features:** a secure context (`https://`, or `http://localhost` on the same computer), service workers, WebAssembly; WebGPU for the largest model. A phone served over plain `http://` on your network loads the page but not the on-device features.
- **Node.js or other tools:** Node.js 20 or newer to run `serve.mjs` and the operator tools; Node.js 22 to build from source. Nothing else. No database, no account, no service.
- **Disk, memory and bandwidth:** the app itself is about 85 MB. Models are downloaded by each person's browser (from 0.1 GB for the smallest to about 10 GB for the default) unless you host them yourself; a full set is about 14 GB.

## Unpack it, or build it

From a release archive (`private-local-chat-<version>-app.zip` or `-runkit.zip`; `runkit` adds a neutral Help and About page):

    sha256sum -c SHA256SUMS
    unzip private-local-chat-<version>-runkit.zip
    cd private-local-chat-<version>-runkit
    node serve.mjs            # then open http://127.0.0.1:18171

From the source, in a clone of `github.com/johnbenac/privatelocalchat`:

    npm ci
    npm run build             # a neutral copy in dist/
    node scripts/serve.mjs

`dist/` (or `app/` in a release) has `index.html` at the top, `NOTICE.md` and `attribution.json` beside it, and the build's own files under `releases/<commit>/`.

## Run it

On this computer: `node serve.mjs`. For other people: serve the `app/` folder with any static server and the headers above behind `https`, or run `node serve.mjs --host 127.0.0.1 --port 18171` behind a reverse proxy that passes those headers on. To update, replace the folder with a newer release; `node plc.mjs` and the operator tools (see `RUN-IT.md`) install, upgrade, roll back and check a copy and keep your settings, pages and model files beside it. People who have the app open keep the build they started on until they choose to reload.

## What it contacts, and what points at our infrastructure

| Contacts | When | Default | How to change it or turn it off |
| --- | --- | --- | --- |
| the model files (and the voice and search-model files) | when a person presses Install for a model, a voice or memory search | the project's file host, `https://cdn.aiofourown.com/models/` | set `modelSources` in `config/app-config.json` and build, or put that file in the operator folder's `config/`; fetch the files yourself with `node fetch-models.mjs` and serve them from `/models/` (`docs/APP-CONFIG.md`). Every model and voice file is checked against a size and SHA-256 pinned in the app, whatever the source |
| a model service the person chose | only if a person enters its address and key and picks it | none | nothing is contacted unless a person chooses it |
| the project's public release list at `api.github.com` | only when you run `node plc.mjs --check --online` | off | do not run it |

- By its code the app contacts nothing else. A browser run that lists every request while a model and a voice load is not yet done, so this is not proven by a log.
- The app sends no analytics and no usage data. It keeps chats, settings and downloaded files in the person's browser; a model service receives the messages and context of a request only if the person chose it.
- If a copy hosts its own model files, they must have the same names and checksums as the pins in `models.json` (every model file with its size and SHA-256), and the host must send the headers above and support `Range` requests.

## Licence: what you must do if you change it and run it for others

Private Local Chat is licensed under AGPL-3.0-only; the text is in `LICENSE`.

- Running an unmodified copy for yourself or for others needs nothing more than keeping the notices (below).
- If you modify it and let other people use your modified version over a network, section 13 requires you to offer those people the source of your modified version, for example with a link on the page to where it is published. Keep the licence and the attribution block.
- Third-party components keep their own licences, listed in `THIRD-PARTY-NOTICES.md`.

## Attribution

The build holds `NOTICE.md` and `attribution.json`, written together from one record (name, version, the full 40-character commit, SPDX licence, source address); the neutral About and Help pages show the same record. Leave them in place: they say what you are running and where its source is. A build you make from your own checkout writes the commit of your checkout; you may add your own text after the block, never change or remove it.

## Not included

No tests and no git history: a release archive holds the built app, the tools and the documents. `SOURCE.txt` says where the complete source is and the command that rebuilds `app/` from it.
