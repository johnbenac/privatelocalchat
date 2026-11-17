# Restructure plan: from one big page to features you can read one at a time

This is the **plan**: where we are, where we are going, and the order. `docs/ARCHITECTURE.md` is the other half: it says how the app is put together *now* and stays short. When a step here is finished, tick it, date it, and make sure the architecture page still tells the truth (a test checks the folders and the events).

Started 2026-11-03. Last updated 2026-11-03. **All nine steps are done and the size target is met** (see the notes under each).

## Where we need to be

- `index.html` is boot and the glue that creates feature modules. Target: **under about 1,500 lines**, down from 6,013 on 2026-11-03. **Met: 1,167 lines** (2026-11-03). The last 1,095 lines were the page's inline `<style>`, now `chat/page.css`.
- Every feature is a module built as `createX(host)`: it gets what it needs as arguments, lists them in a header comment, and does not look things up in the page. `chat/call/call.mjs` is the pattern.
- Features take part in each other's moments only through the event list in `chat/events.mjs`.
- `chat/` has one folder per feature. New code goes in the folder of its feature.
- Logic lives in pure modules (no DOM) with unit tests; each feature has one smoke e2e, not a pile of them.

## How to take one feature out (the recipe)

1. Find the block in `index.html` (the `// ----` headings mark them) and list everything it uses from the page.
2. Make `chat/<feature>/<name>.mjs` exporting `createX(host)`; put the block in it; replace each page variable with a `host` member and write them in the header comment.
3. In `index.html` create it with `createX({ ... })`; replace outside uses with what it returns; connect it to others through `events.on(...)`.
4. A test hook for development builds stays **inside the page's** `DEV_DIAGNOSTICS` markers and reaches the module through `host` (files other than the page are not stripped; a build test fails if a marker ships).
5. Run `npm test` and `npm run e2e -- <the area>`; tick the step below; update `ARCHITECTURE.md` if a folder, event or global changed.
6. One commit per feature, pushed to `main` and `dev`.

## Done

- [x] Lock and the not-locked reminder: `chat/lock/` (52d9792, 2026-11-03)
- [x] Dialogs: `chat/dialogs.mjs` (52d9792)
- [x] Voice call screen: `chat/call/` (88bca9f); its test hook moved out of production (2c4d4b3)
- [x] Model services (memory manager, shared embedder, voice choice): `chat/models/services.mjs` (316afc9)
- [x] The six hook arrays replaced by the event list: `chat/events.mjs` (d29d4e2)
- [x] `chat/` grouped into feature folders, 37 files moved (2ff23cc)
- [x] Architecture page, and `npm run e2e -- <name>` so only the area touched is run (52d9792, a6e1470)

## To do, in order

Step 3 depends on step 4 (the transfer glue is mostly the provider settings), so 4 is done before 3. The order puts the pieces with the clearest edges first and the chat core and its state last, because everything else leans on them. Sizes are approximate lines of `index.html` on 2026-11-03.

- [x] **1. `chat/shell/` stops reaching into the page** (2026-11-03): the page hands `createShell(app)` named `app.parts` (the controls the shell moves or watches), `app.models`, `app.dialogs`, `app.build` and `app.lock`; the shell asks for a part by name and a name the page did not provide is an error. No `window.*` page globals and no page lookups by id remain in `chat/shell/`.
- [x] **2. Documents** (2026-11-03): attach, read, cite, the library, sources under an answer in `chat/documents/documents-ui.mjs`; save-as-file and the draft editor in `chat/documents/drafts.mjs`. `index.html` 5,456 -> 5,214 lines.
- [x] **3. Sharing, transfer glue, URL parameters** (2026-11-03): `chat/transfer/transfer-glue.mjs` (the app object the transfer dialogs get, a settings link or file opened here, the address parameters). `index.html` 3,373 -> 3,243 lines.
- [x] **4. Provider endpoint and model refresh, history and settings import/export, clear history and settings** (2026-11-03): `chat/provider/provider-settings.mjs` owns `config`, the model list, the saved tokens, the theme, the endpoint form, model refresh, clear settings and applying imported settings (the page reads it as `provider.config` / `provider.models`); pure and unit-tested pieces beside it (`endpoint-tokens.mjs`, `endpoint-urls.mjs`, `endpoint-options.mjs`); history export, import and clear in `chat/history/history-io.mjs`. `index.html` 4,476 -> 3,373 lines.
- [x] **5. Conversation list** (2026-11-03): `chat/list/conversation-list.mjs` owns the list, projects (folders), the view filter and a conversation's menu. `index.html` 4,632 -> 4,476 lines. The search results block stays with the page until step 9 (it is chat-core navigation).
- [x] **6. Preferences, presets, memory, exact tools** (2026-11-03): `chat/assistant/assistant.mjs`. `index.html` 5,025 -> 4,864 lines.
- [x] **7. Speech, dictation and voice notes** (2026-11-03): `chat/voice/voice-ui.mjs` holds the speech services, Listen, dictation, the Dictate and Voice call buttons and voice notes with the recorder. `index.html` 5,214 -> 5,025 lines.
- [x] **8. Roberta glue, context meter, storage and backups** (2026-11-03): `chat/roberta/roberta-glue.mjs`, `chat/context/context-ui.mjs`, `chat/storage/storage-ui.mjs`, `chat/transfer/backups.mjs`. `index.html` 4,864 -> 4,632 lines.
- [x] **9. The chat core and the config, token and thread state around it** (2026-11-03, in four slices under `chat/core/`): the page's own furniture (toast, About modal, sidebar, popup menus) in `chat/core/page-chrome.mjs` (`index.html` 3,243 -> 2,998); the messages on screen in `chat/core/messages-view.mjs` (2,998 -> 2,749); sending, streaming and the bubble buttons in `chat/core/sender.mjs` (2,749 -> 2,493); the conversations and the chat's readiness in `chat/core/thread-state.mjs` (2,493 -> 2,262). What is left in the page is boot (`init`), the wiring that creates the modules, the composer and prefs glue, and the event listeners. Each slice gets the same test pass as the others.

## Not part of this plan

- A framework, a bundler or TypeScript. The static, no-build shape is a strength.
- Rewriting working features. Each step moves code; it should not change what the app does. If a move exposes a bug (the start-up "Downloading 0%" did), fix it in the same commit and say so.
- Real-device checks, privacy and help-label drift tests: tracked in `docs/TECHNICAL-DEBT.md`.
