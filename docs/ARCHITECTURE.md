# How this app is put together

A static, no-framework browser app: one HTML page, ES modules, no build step for the code itself (`scripts/build.mjs` only copies, versions and checksums). This page is how the app is put together **now**; `docs/RESTRUCTURE-PLAN.md` is where it is going and what is left. This page says where things live and how they talk, so a new feature has an obvious place. Written 2026-11-03 and kept in step with the code: since then the lock, dialogs, voice call and model services have been taken out of `index.html`, the hook arrays became one event list, and `chat/` was grouped into feature folders.

## Three layers

1. **Pure modules** (no DOM, everything the browser provides is passed in). They read on their own and are unit-tested in plain Node.
   `chat/voice/voice.mjs` (call turn-taking), `chat/voice/voice-choice.mjs` (voice picker), `runtime/memory-manager.mjs`, `chat/models/models-view.mjs`, `runtime/download-recovery.mjs`, `chat/roberta/intent-router.mjs`, `chat/provider/endpoint-tokens.mjs`, `chat/provider/endpoint-urls.mjs`, `chat/provider/endpoint-options.mjs`, `chat/provider/api-formats.mjs` (request, stream and model-list logic for Chat Completions, Responses and Anthropic Messages), `chat/connection/connection.mjs` (online/offline state and the sentence for each refusal), `chat/connection/offline-facts.mjs` (what the checklist is built from), `chat/connection/private-mode.mjs` (a guess whether the window is private, from what it refuses), `chat/core/toast-timing.mjs` (how long a toast stays), `runtime/offline-readiness.mjs` (the offline checklist), `chat/markdown.mjs`, `chat/crypto.mjs`, the provider layer in `runtime/providers/`.
2. **Feature modules** (own the DOM of one feature). Each is a `createX({...everything it needs...})` function that the page calls once; it returns a small object. They receive what they need as arguments instead of reaching into the page's variables. `chat/shell/` rearranges the page's own controls, so it is handed them by name (`app.parts`, with `app.models`, `app.dialogs`, `app.build`, `app.lock`) and asking for a part the page did not provide is an error.
   `chat/lock/lock.mjs` (app lock and the not-locked reminder), `chat/documents/documents-ui.mjs` (attach, read, cite, the library) and `chat/documents/drafts.mjs` (save as a file, the draft editor), `chat/assistant/assistant.mjs` (preferences, presets, memory, exact tools), `chat/voice/voice-ui.mjs` (speech services, Listen, dictation, the Dictate and Voice call buttons, voice notes), `chat/call/call.mjs` (the voice call screen: orb, status, model chips, message list, stall notice), `chat/models/services.mjs` (the memory manager, the shared embedding model and the voice choice, created once), `chat/dialogs.mjs` (modal dialogs), `chat/shell/` (rail, panel, Settings, pickers, search overlay), `chat/transfer/transfer-ui.mjs` (the dialogs) and `chat/transfer/transfer-glue.mjs` (what they are given, settings links and files, the address parameters), `chat/roberta/roberta-ui.mjs`, `chat/models/memory-offer.mjs`, `chat/roberta/roberta-glue.mjs` (Roberta's page wiring), `chat/context/context-ui.mjs` (context meter, summary divider), `chat/core/page-chrome.mjs` (toast, About, sidebar, popup menus), `chat/core/messages-view.mjs` (the messages on screen: bubbles, scrolling, the start screen, the setup card), `chat/core/sender.mjs` (sending, streaming a reply, a bubble's own buttons), `chat/core/thread-state.mjs` (load, save, create, select, rename, export a conversation; whether the chat can send), `chat/provider/provider-settings.mjs` (endpoint, saved tokens, model list and refresh, theme, clear and import settings: they share one `config`), `chat/history/history-io.mjs` (history export, import, clear), `chat/list/conversation-list.mjs` (the list, projects, a conversation's menu), `chat/storage/storage-ui.mjs` (Storage screen, backup reminder), `chat/transfer/backups.mjs` (protected backups), `chat/connection/connection-glue.mjs` (the connection state, the offline checklist's facts and its fixes; read as `plcApp.offline` by the shell: the connection pill `chat/shell/connection-pill.mjs` and Settings > Models > Ready for offline use `chat/shell/offline-section.mjs`, both drawn with `chat/shell/offline-checklist.mjs`). `chat/events.mjs` (the event list) is shared plumbing for all of them.
3. **The host page**, `index.html`: boot, the chat core (threads, sending, streaming, rendering), and the glue that creates the feature modules and hands them what they need. It is still large (about 1,170 lines, most of it one script) and is being shrunk one feature at a time: **move a feature out by turning its block into `createX({...})`, passing in what it used from the page, and replacing outside uses with the returned object.** The lock, the dialogs and the voice call are the worked examples: `createCall(host)` in `chat/call/call.mjs` lists the page's capabilities it needs in its header comment, which is the pattern to copy.

   What is still in the page, in what order it comes out, and what is done: `docs/RESTRUCTURE-PLAN.md`.

## How features talk to each other

These are the official connection points; anything else is a bug waiting to happen.

**The event list, `chat/events.mjs`** (a feature adds a listener with `events.on(name, fn)`; the chat core and features fire events by name; a name that is not in the list is an error, so a typo fails at once). The table at the top of that file is the official list:

| Event | Fires | For |
|---|---|---|
| `thread:selected` | `emit(thread)` | a conversation was shown: stop speech, close the canvas, refresh presets |
| `send:before` | `emit()` | a message is being sent, before the composer is read (dictation stops here) |
| `send:intercept` | `intercept(text, thread)` | answer without the model; a listener returns `true` when it handled it (Roberta's slash commands) |
| `prompt:ready` | `emitAwait(message)` | a user message before it is kept or edited: exact tools rewrite it, the voice call marks it |
| `context:collect` | `collect(thread, view)` | add to what the model is told; each listener returns `{ preamble?, attachmentText?, sources? }` |
| `reply:start` / `reply:text` / `reply:end` | `emit(...)` | a reply began, grew (the voice call speaks it as it is written), finished |
| `connection:changed` | `emit(info)` | the app went offline, came back, or is online again (`info.state` is `online`, `offline` or `back`): the connection pill, offline-aware controls and the one-time hints |
| `vault:unlocked` / `vault:locked` / `vault:write-failed` | `emit(info)` | the encrypted vault was turned on or opened, was locked or turned off, or could not store a change (`info.message`): the lock button, the security dialog and a warning toast. Fired from the page, which turns the vault store's window events into these |

`emit` never lets one listener's error stop the others (it is logged); `emitAwait`, `collect` and `intercept` wait for each listener in turn and let errors through. `messageDecorators` and `messageActionHandlers` (extra buttons on a message) are separate, because they shape rendering rather than moments.

**Window globals** (each has one owner; modules outside the page use these instead of importing the page; the development-only `__plcDebug*` hooks are stripped from production builds):

| Global | Owner | Purpose |
|---|---|---|
| `plcApp` | `index.html` | the facade the shell uses: threads, open library/help/share, attach files, `loadVoice()`, `loadMemory()`, `getEmbedder()`, `lock`, `offline` (connection state, offline checklist, fixes), `openLockSettings()`... |
| `plcShell` | `chat/shell` | open Settings or search from outside |
| `plcDialogs` | `index.html` (set from `chat/dialogs.mjs`) | `confirm`, `alert`, `copyText` for modules that cannot be handed the dialogs |
| `localModels` | `local-models.js` | the chat model: state, `view`, actions (`ensureReady`, `freeMemory`, `setMode`, `saveRuntime`...), `offlineApp` (what the service worker reports about the saved app and runtime files; fires `offline-status` on the window) |
| `APP_BUILD` | `build-info.js` (written by the build) | the commit, version and environment of this copy of the app; the module location comes from it |
| `__plcBooted` | `index.html` | set when start-up finished; the head script's failure banner reads it |
| `plcMemoryReady`, `plcOneAtATime` | `index.html` (published from `chat/models/services.mjs`) | the memory manager promise, and a flag it keeps for `local-models.js` |

## Models and memory

Three kinds of model sit in memory: the chat model (`local-models.js` over `runtime/providers/`), downloaded voices (`chat/voice/voice-engine.mjs`, picked through `chat/voice/voice-choice.mjs`) and the small embedding model (`chat/embedding/embedder.mjs`). `runtime/memory-manager.mjs` is the one place that knows what is loaded; with "One model at a time" on it unloads the others before one is used. `chat/models/models-view.mjs` gives every model the same row shape and the same state words, which Settings > Models, both composer menus, the storage screen and the call screen's chips all use. See `docs/MODEL-MEMORY-PLAN.md` and `docs/MODEL-UI-PLAN.md`.

## Where things live

```
index.html              host page: boot, chat core, glue
local-models.js         the chat model controller (window.localModels)
conversation-messages.mjs  how a thread becomes the messages sent to a model
runtime/                model hosting, downloads, memory manager, voice advice
runtime/providers/      the on-device model runtimes (WebLLM, wllama) behind one client
chat/                   features, one folder each (below); the files left at the top are shared by several:
                        context, crypto, dialogs, events, icons, markdown, search, storage-check, stream, threads, tools, and the stylesheets (page.css is the page's own)
chat/voice/             speech, the voice engines (Kitten, Kokoro), voice choice, voice notes and recorder, playback, text preparation, voice-session logic
chat/call/              the voice call screen and its sounds
chat/assistant/         preferences, presets, memory and the exact-answer tools
chat/roberta/           the phone-menu robot: menu engine, content, intent router and its vectors, on-screen front desk
chat/embedding/         the small matching model (used by Roberta and by search): embedder, config, model description
chat/documents/         attachments: reading, storing (IndexedDB), PDF text, retrieval, images
chat/transfer/          moving things in and out: share, QR, settings transfer, other chatbots' exports, answer export, the public pages script
chat/models/            model services (memory manager, shared embedder, voice choice) and the one vocabulary for model rows
chat/lock/              the app lock and the not-locked reminder
chat/vault/             the encrypted vault: keys and the append-only log (vault.mjs), where it lives (vault-db.mjs), the one storage interface the app uses (vault-store.mjs: appLocal / appSession), which key is kept where (key-classes.mjs), the unlock screen. See docs/ENCRYPTION-AT-REST-PLAN.md
chat/history/           chat history in and out: export, import (with preview), clear
chat/core/              the chat core, in slices: the page's own furniture (toast, About, sidebar, popup menus) so far, and the messages on screen
chat/provider/          the connected provider: endpoint, token per destination, model list, theme, provider catalogue
chat/list/              the conversation list, its menus and projects
chat/context/           the context meter and the summary divider
chat/storage/           the Storage and backups screen and the backup reminder
chat/connection/        whether the app is online, and one sentence for everything that needs a connection
chat/shell/             the app shell: rail, panel, Settings page and pickers
runtime/config/         what the app is configured with: the model sources (docs/APP-CONFIG.md)
chat/site/              where the pages of the site that serves this copy are (the site manifest); the app links to our pages only through it
chat/vendor/            bundled third-party code (voice worker, embedding worker, pdf.js, qr)
ops/                    publishing and build tooling for models and workers (not shipped)
scripts/                the build, the local server, release verification, the e2e runner
run-kit/                the neutral Help and About that ship with the app (the pages of a site directory, docs/SITE-LAYER.md)
content/                data that describes the app and feeds the pages (known issues)
brand/                  logos and icons
tests/                  unit tests (fast) and tests/e2e (real browser)
docs/                   plans, evidence and procedures
```

A folder per feature. File names were kept when the files moved (`voice/voice-choice.mjs`), so searching for a file name still finds one file and the history follows the files. New code goes in the folder of its feature; a file used by several features stays at the top of `chat/`.

## Testing without ceremony

- **Always:** `npm test` (unit tests, about a minute). The pure modules are where the logic is, and these tests are cheap.
- **For the area you touched:** `npm run e2e -- <part of a suite name>` (for example `npm run e2e -- voice lock`). Suites run one at a time, because each builds `dist/` and two at once collide.
- **Before a release:** `npm run e2e` runs every suite (about ten minutes). CI runs the unit tests and the voice suites; the full browser sweep is a release check, not a per-change habit.
- **One smoke e2e per feature** is enough. Put logic in a pure module and test it there rather than through the browser.
