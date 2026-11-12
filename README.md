# Private Local Chat

Chat with Qwen3.5 on your device, or explicitly choose an OpenAI-compatible API provider. Conversations remain in the browser's existing `chatThreads` storage; API settings retain the existing session-storage format.

- Production: https://privatelocal.chat — `main` branch
- Development: https://dev.privatelocal.chat — `dev` branch
- Models: https://assets.privatelocal.chat/models/catalog.json
- Feedback: https://github.com/johnbenac/privatelocalchat/issues/new/choose

Choose **On this device**, select a model, press **Download model**. The download retries automatically and loads the model when complete. After reopening a completed session, use **Load model** to load its saved files. The smaller Qwen3.5-2B download is about 1.20 GB. Qwen3.5-9B is about 5.06 GB and requires substantially more GPU memory. Model size is separate from working memory. Both runtimes require WebGPU, and the 2B runtime also requires shader-f16; supported browser/device combinations must be confirmed by the release acceptance checks.

The downloader checks pinned SHA-256 hashes, retains complete files when interrupted, and supports explicit repair. Models and the app shell can be stored for offline use. Browser storage can be evicted; export important chats. Local mode never falls back to an API. Selecting API mode sends conversation context to the provider you configure.

## Development

Node.js 22 or later:

```sh
npm ci
npm test
npm run build
node scripts/serve.mjs
```

Open http://127.0.0.1:18171. Build output is `dist/`; it contains no credentials or private chat data. A build with no setup is a complete app with neutral Help and About pages (`run-kit/`); the pages of privatelocal.chat are a separate, private site layer that the deploy adds (`docs/SITE-LAYER.md`). The app shows its environment, version, and full deployed commit via `version.json`.

See [everyday chat features](docs/CHAT-FEATURES.md) for rendered answers, message controls, search, documents, memory, speech, storage and backups, and `npm run e2e` for the browser tests.

See the [maintainer handoff](docs/MAINTAINER-HANDOFF.md), [operations](docs/OPERATIONS.md), [runtime provenance](docs/RUNTIMES.md), and [release acceptance](docs/ACCEPTANCE.md). How the app, the site layer and a copy you host fit together: [the site layer](docs/SITE-LAYER.md), [links to pages](docs/SITE-LINKS.md), [running a copy and the headers it needs](docs/RUN-IT.md), [configuration and model sources](docs/APP-CONFIG.md), [upgrades](docs/UPGRADE-BEHAVIOUR.md), and [data](docs/DATA-COMPATIBILITY.md) and [file](docs/FILE-COMPATIBILITY.md) compatibility.

The [living iPhone investigation plan](docs/IPHONE-INVESTIGATION.md) records the current reliability evidence, next experiment, decision criteria, and results log. Update it as the investigation progresses.
