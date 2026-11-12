# Everyday chat features

What the chat experience does beyond running a model, where each part lives, what is stored where, and what it deliberately does not do. Source of truth for behaviour is the tests named below.

## Voice picker

A **voice menu** beside the model menu in the composer (and Settings > Voice, which shows the same list) chooses how answers are read aloud: the **system voice** (built in, the default), **Kitten** (28 MB) or **Kokoro** (97 MB). Both downloadable voices are English, work offline and have Apache-2.0 models; the program that runs them contains eSpeak NG (GPL-3.0, see `THIRD-PARTY-NOTICES.md`).

* **Choosing a voice that is not downloaded downloads it at once**, like choosing a language model: the pill shows "Connecting…", "Downloading 42%", "Testing…", then the voice is selected and a sample plays. The download uses the same worker-based OPFS writer as the models, with a connect timeout, a stall timeout that retries, and Cancel.
* **Everyone can choose any voice on any device**, including iPhone, iPad and old Android phones. Device measurements only give advice ("Recommended for this device", "May be slow on this device"). A voice that reads slower than speech is kept and the person is told how slow it is.
* **Failures are explained and never lock anyone out.** The menu shows the reason. Trying the same voice again asks for one confirmation ("this already failed: …") and then goes ahead, as many times as the person likes. If a voice fails while reading, that reply is read by the system voice and the choice stays; two failures in a row return to the system voice with a message.
* **The chosen voice is used everywhere the app speaks:** Listen, voice calls and Roberta.
* **What is on the device** is listed with sizes and a total; each downloaded voice has Remove (it deletes the files and the cached program). More than one voice may be kept.
* **If the page was killed** while a voice was downloading or reading (usually the browser running out of memory) the next start says so, cleans up the half-made files and goes back to the system voice, keeping the downloaded voice.
* Code: `chat/voice/voice-choice.mjs` (controller), `chat/shell/shell.mjs` (pill, menu, Settings), `chat/voice/voice-engine.mjs` and `chat/voice/voice-kokoro.mjs`/`voice-kitten.mjs` (engines), `runtime/voice-pick.mjs` (advice only). Plan and evidence: `docs/VOICE-ENGINE-PLAN.md`, `docs/evidence/voice/`.

## What is here

| Area | Behaviour | Code |
|---|---|---|
| Answers | Safe Markdown (headings, lists, tables, code, links). Generated HTML is shown as text; images are never fetched; only `http(s)` and `mailto` links are clickable. Answers stream into the message itself in local and API mode. | `chat/markdown.mjs`, `chat/stream.mjs` |
| Message controls | Copy answer / code block, edit a prompt and resend (with Undo), retry a failed request in place, regenerate (earlier answers kept as versions), continue a stopped / cut-off / failed answer, leave a message out of what the model sees. | `index.html` (`runReply`, `createMessageEl`) |
| Safety of routing | Every reply is bound to the conversation and message that asked for it, so switching chats mid-answer is safe. Drafts are kept per conversation and survive reloads. | `runReply`, `persistDraftNow` |
| Interruptions | Stop, a failed engine, a dropped connection, a closed or discarded page all keep what was written and say so on the message. | `chat/threads.mjs` (`normalizeMessage`), `local-models.js` |
| Finding work | Search opens from the sidebar magnifier or Ctrl/Cmd+K and blends the words typed with matching by meaning (the small on-device model, loaded on first use; words-only until it is ready), with filters for date, project, archived or deleted, pinned, files, who wrote it, and words vs meaning (`chat/shell/hybrid-search.mjs`, over `chat/search.mjs`). The chat list is grouped by date. Also: recent-first ordering; derived titles; pin, archive, Trash with Undo, temporary chats, projects with shared instructions, duplicate and branch. | `chat/search.mjs`, `chat/threads.mjs` |
| Importing | Preview first; merge by default, replace only when chosen. Also reads ChatGPT and Claude data exports (the `.zip` or `conversations.json`). | `chat/transfer/foreign-import.mjs`, `chat/transfer/zip.mjs` |
| Documents | Attach text, Markdown, CSV, code and text-based PDF files (PDF.js, on this device). Short files go to the model whole; long ones are searched (BM25) and cited by number and page. A document library applies to all chats or one project. Pictures go to API providers only. | `chat/documents/documents.mjs`, `chat/documents/retrieval.mjs`, `chat/documents/pdf.mjs`, `chat/documents/doc-store.mjs` |
| Outputs | Save an answer as `.md` / `.txt`, a table as CSV, a code block as a file; edit longer drafts in a side editor and ask the assistant to revise them. | `chat/transfer/exports.mjs` |
| Personalisation | Standing instructions, assistant presets, an explicit and editable memory (never used in temporary chats). | `index.html` (assistant block) |
| Exact answers | Arithmetic, unit conversion and date questions are computed by a small parser (no `eval`). `/calc`, `/convert`, `/date` answer immediately; the same questions inside normal messages are computed and handed to the model as given. | `chat/tools.mjs` |
| Sharing and transfer | Share (public address only), Transfer settings (versioned link, QR or file; API token optionally encrypted with a password you choose) and Transfer chats and backups (reviewed file exports and protected backups) are three separate flows with their own dialogs; Help & about opens a compact sheet of public pages. See `docs/SHARING-AND-TRANSFER.md`. | `chat/transfer/product-share.mjs`, `chat/transfer/settings-transfer.mjs`, `chat/transfer/transfer-ui.mjs`, `chat/transfer/qr.mjs` |
| Speech | Read-aloud, dictation and voice conversation use the browser's own speech services (Apple's on an iPhone). **Dictation** writes into the composer; sending (or switching chats) aborts the recogniser, so late words never reach the next message, and typing while dictating is kept. **Voice call** (the round waveform button in the composer; it swaps for Send once you type) is speech-to-speech and is built to feel like a phone call: it rings ("Calling…") while the microphone is opened by the same tap, connects with a running m:ss timer, shows Mute, Skip and End call as round buttons, shows "On hold" when the app goes to the background and a "Call ended" summary with the call's length when it ends, can play quiet ring, pick-up and hang-up tones (Memory & preferences > Voice calls), and fills the screen on a phone. Underneath it listens, sends after a pause, speaks the reply sentence by sentence while it is still being written, then listens again; tapping the orb sends now or interrupts, the microphone is off while the app speaks (no echo), muting and the background pause it, the screen stays awake, Escape ends it, and the model is told to answer in short spoken sentences without Markdown or code (code is skipped with a spoken note). The call screen says what it is waiting on (model downloading with a percent, loading, or not downloaded) and that answers are written by an AI model; a spoken reply that has not finished after 20 s plus 90 ms per character is skipped and shown as text. A microphone failure is explained (blocked for this site vs. a browser that would not let the page use speech recognition just now) and the controls always stay available so the person can fix the setting and tap again; nothing is hidden or remembered after a failure. | `chat/voice/speech.mjs`, `chat/voice/voice.mjs`, `index.html` (speech block) |
| Voice call screen | The call shows what is happening: the orb moves differently for listening (slow swell), thinking (turning dashed ring), writing the reply (quick amber pulses), preparing the voice (violet shimmer, status "Preparing the voice…") and speaking (green ripples, only once sound really starts). Two chips show the chat model and the voice with their memory state (loaded, loading…, unloaded, downloading, failed). The call's messages are listed with older ones more transparent. A spoken reply whose sound never starts is given up on after a while: the call says "The spoken reply stalled … shown as text instead", keeps the text on screen and goes back to listening. A voice falling back to the system voice is reported on the call screen too. | `chat/voice/voice.mjs` (phases), `chat/voice/speech.mjs` (`onAudio`), `index.html` (call UI), `chat/brand.css`, `tests/e2e/voice-call-ui.e2e.mjs` |
| App lock and the not-locked reminder | With a passcode the app opens on a closed padlock and a passphrase field (any passphrase is allowed, even one character; wrong tries back off). With no passcode it opens on a short reminder instead: "This app is not locked", an open padlock button ("Add a passcode") inside a ring that unfills counterclockwise over 2.5 s, "Continue without a passcode", "Don't remind me again" (stored as `plc.lockSplash.v1` = `off`; Settings > Security turns it back on) and a disclaimer that a passcode is not strong protection and device security should be used too. Doing nothing continues into the app. Adding a passcode locks the app at once and shows the closed padlock. | `index.html` (lock code), `chat/chat.css`, `tests/e2e/lock-splash.e2e.mjs`, `tests/e2e/device.e2e.mjs` |
| Brand and layout | PrivateLocal.Chat identity from the brand packet (`brand/`, `chat/brand.css`): wordmark, tokens, light/dark, an "On this device" / "Connected" line in every chat header. See **App layout** below. Phones get finger-sized targets, a tap-to-reveal action row and Enter-adds-a-line; desktops get hover actions and Enter-sends. Enter behaviour lives in Memory & preferences. | `chat/brand.css`, `chat/icons.mjs` |
| Device readiness | Downloaded / Loaded / Ready for offline use are shown separately in Settings > Models; each model row has one button for the next step (Download, Load, Unload, Cancel, Try again). Repair, restart, removal and diagnostics are under Details and repair. Unload frees the model from memory and keeps the download. | `chat/shell/models-page.mjs`, `chat/models/models-view.mjs`, `local-models.js` |
| Context | A meter shows how full the model's window is. Older messages can be condensed into a summary that replaces them *in what the model sees only*; the saved conversation is never shortened. | `chat/context.mjs` |
| Storage and backups | One screen for models, conversations, attachments, the library, browser persistence and the last backup, with a backup reminder. Encrypted full backups (PBKDF2-SHA-256, AES-256-GCM). | `chat/crypto.mjs`, `index.html` |
| App lock | A passphrase screen over the app, auto-lock when idle or away, throttled retries. | `chat/crypto.mjs` |

## App layout

The layout follows the familiar chat-app pattern so someone who uses one daily can use this on sight. It lives in `chat/shell/` and `chat/shell.css` and is mounted by `index.html`; it moves the existing controls rather than replacing them (ids and behaviour are unchanged).

| Place | What is there |
|---|---|
| Icon rail (desktop) | Chats, Library, Explore ("..." menu: Memory & preferences, Storage & backups, Transfer, Help & about, Share; each can be pinned to the rail), and the "This device" menu (Settings, Memory, Help, Share). Hidden on phones, where the same items are rows in the drawer. |
| Panel | Wordmark, search, collapse; New chat; Roberta as a pinned agent (her page has a Call button); Projects with "+"; chats grouped Pinned / Today / Yesterday / Previous 7 days / Previous 30 days / Older. Archived and Recently deleted are reached from Settings > Data controls. |
| Header | Chat title (click to rename), where replies run, Temporary chat toggle, "..." chat menu (rename, pin, archive, move, export, delete, branch). |
| Composer | "+" menu (files, library, project, instructions, voice note), model pill (on-device models, connected models, Manage models), dictation mic, voice button or Send. |
| Settings page | General, Personalization, Models, Data controls, Security, Roberta & voice, Library, About. The model and API forms and the import/export flows are the original elements, moved here. |
| Empty chat | A centered greeting with the composer in the middle. |

Entries come from a registry (`chat/shell/registry.mjs`): adding a rail item, Explore item or "+" item is one `register()` call. `tests/e2e/shell.e2e.mjs` covers the layout and every other e2e suite drives it.

## On-device models

| Model | Download | Where it runs | Notes |
|---|---|---|---|
| Qwen3.5-2B (Q4_0) | 1.20 GB | GPU with shader-f16, or the processor | The starting model on phones and small devices. |
| Qwen3.5-9B (WebLLM) | about 5.6 GB | GPU only | Chosen automatically on capable desktops. |
| LFM2.5-2.6B (Q3_K_M, Liquid) | 1.37 GB | GPU with shader-f16, or the processor | Chosen by the person. 8,192-token window. LFM Open License v1.0. |
| Granite 4.0 H 1B (Q4_K_M, IBM) | 0.90 GB | GPU with shader-f16, or the processor | Chosen by the person. Smallest download. 8,192-token window. Apache-2.0. |

LFM2.5 and Granite are never picked for someone: the app starts with Qwen3.5. Pick them from the model menu next to the message box (or Settings > Models). Each is a catalogue tier (`runtime/providers/catalog.mjs`): files pinned by SHA-256, resumable download with stall recovery, deep verify and repair, and its own sampling settings.

**Storage and unloading.** Switching models starts a fresh engine, so the previous model's memory is returned at once; the downloaded files stay. Settings > Models lists every model with its size on this device, with **Unload** (free memory, keep the download) and **Remove** (delete the files) per model and a total, and Storage & backups has the same Remove buttons. `window.localModels.inspectAll()` and `removeTier(tier)` do the same from code.

**Measured 2026-11-02** with `work/check-new-models.mjs` against the dev site in headless Chromium with no GPU (the processor path, single thread): Granite 4.0 H 1B downloaded 901 MB in about 90 s, loaded in 6.7 s, answered "What is the capital of France?" correctly, and removing it freed exactly 901 MB; LFM2.5-2.6B downloaded 1,367 MB in about 140 s, loaded in 6.8 s, answered correctly, and removal freed 1,367 MB. Processor speed was about 3 tokens/s for Granite and 1.3 for LFM2.5, with a first answer after about 9 s and 15 s. GPU and iPhone speed and memory use are not measured yet (see TECHNICAL-DEBT 39). Evidence: `docs/evidence/model-*-cdn-check.json`.

## Controls that cannot be used are not shown

No button is ever shown disabled. If an action is unavailable (a model already downloaded, nothing to free, no speech recognition, pictures with an on-device model) the control is hidden instead, and in-flight work uses `aria-busy`. `tests/e2e/mobile.e2e.mjs` fails if a visible button is disabled.

## First message, no setup

Sending a message (or pressing the welcome button) is all it takes. `runtime/prepare.mjs` picks a model for the device (`runtime/auto-tier.mjs`: phones and tablets get the 2B model, a capable desktop gets the 9B model, an installed or explicitly chosen model always wins), downloads it, loads it, and the message is answered automatically. While that happens the reply bubble (or the welcome screen) shows a progress card: stage, percent, size, time left, and one reassuring paragraph. There is no confirmation dialog; the size is stated on the card, and on a desktop there is a "use the smaller model" link. Stop during setup removes the empty reply but leaves the question; a failed download says why and Retry does not duplicate the message. `tests/e2e/firstrun.e2e.mjs` drives this with a scripted model bridge, since headless browsers have no GPU.

**No graphics card? The processor runs it.** On-device chat no longer needs WebGPU. When the browser has no usable GPU (no WebGPU, no adapter, only a software renderer, or no 16-bit shaders on a small device), the same Qwen3.5-2B model and the same downloaded files run on the processor through WebAssembly (`n_gpu_layers: 0`, nothing offloaded; `runtime/auto-tier.mjs` `pickTier` / `lightBackend`, `runtime/providers/catalog.mjs` `loadConfigFor(..., { backend: "cpu" })`). It is slower, and the app says so on the setup card, the status line and the Advanced panel (with what to try to get the card working). It is not offered on iPhone or iPad (the browser kills a page that holds that much memory, see `docs/IPHONE-INVESTIGATION.md`), without WebAssembly SIMD, or on devices reporting under 4 GB. The larger 9B model still needs a GPU. This is a placement of the same model, not a silent switch to another one: `window.localModels.backend` and the model host state (`backend.light`) always say which is in use. The runtime is single-threaded (no multi-thread build is vendored), so a faster processor build is a possible later improvement. `tests/e2e/cpu.e2e.mjs` proves the path in a browser with no adapter using a tiny fixture model (`tests/fixtures/tiny-llama.gguf`, random weights).

**Stalled downloads.** `runtime/download-recovery.mjs` watches the byte count: if nothing arrives for two minutes (a phone that sat at 64% for a quarter of an hour) the transfer is abandoned and restarted, a wedged host is restarted too, and the shards already saved are reused rather than fetched again. The card says "The download stalled. Restarting it now".

## Stale copies and failed starts

The app ships a plain-JavaScript guard in `index.html`. When a page opens and `/version.json` names a newer build than the one running (an old saved copy), the saved service-worker copy is cleared and the page reloads once (a notice is shown instead if that already happened, so it can never loop). After that, while the app is open, it never reloads itself: when a newer build is published a notice at the bottom says so, with **Reload**, **Later** and, where the site has an Updates page, **What changed**; **Reload** asks first when a reply is being written, a model is downloading or loading, a recording or call is open, or a message is unsent, and keeps the unsent message (`docs/UPGRADE-BEHAVIOUR.md`). If the app does not finish starting, a banner says so with the build number and a way to fix it. The service worker (`scripts/service-worker.js`) requires only the small startup files to install and then takes over at once; the multi-megabyte model runtimes are cached afterwards, best effort, and as they are first used, so a phone that cannot finish a 36 MB install is no longer stuck on an old version. `/version.json` is always asked of the network, never answered from the saved copy.

A downloaded model loads by itself when the app opens or when on-device chat is chosen (`runtime/auto-load.mjs`), unless the person freed memory this session.

## Where data lives

| Data | Place |
|---|---|
| Conversations | `localStorage` `chatThreads` (temporary chats are never written) |
| Unsent drafts | `localStorage` `plc.drafts.v1` |
| Preferences, memory, presets, projects | `plc.prefs.v1`, `plc.memory.v1`, `plc.presets.v1`, `plc.folders.v1` |
| Attached files and the library | IndexedDB `plc-docs` (a temporary chat's files stay in memory) |
| Lock | `plc.lock.v1` (a salted verifier, never the passphrase) |

Everything stays in the browser. Documents are read, indexed and searched on the device; nothing is uploaded.

## Limits you should know about

* **Context window.** The bundled models run with a 4,096-token window shared by the conversation and the reply, so very long answers end when it is full (the message says so and offers Continue or a summary). Raising it costs memory, which matters most on iPhone. There is no sliding-window mode that drops old turns automatically.
* **The lock is a screen lock.** It stops casual access. It does not encrypt `localStorage` or IndexedDB, so someone with access to the browser's files can still read them. An encrypted backup is the protected copy. A forgotten passphrase cannot be recovered: the only way back in is to erase the app's data and restore a backup.
* **Pictures need a vision-capable API provider.** The on-device models here read text only, and the app says so instead of pretending.
* **Scanned PDFs** have no text to read and are refused with an explanation; OCR is not available offline yet.
* **Speech depends on the browser.** Some app web views (DuckDuckGo on iPhone, for one) expose speech recognition but never let a website use it; this cannot be tested from a desktop, so the app detects the failure and hides the controls. Dictation and voice conversation appear only where the browser has speech recognition, and may send audio to that browser's speech service (Apple's on iPhone). That is an accepted trade-off for an app that also lets people connect their own providers; it is not a claim that voice never leaves the device.
* **Exact-answer detection is conservative.** It acts on clear arithmetic, unit and date questions and ignores things that merely look like them (`2026-03-05`, `pages 10-20`).
* **Processor speed is unmeasured.** The processor path is verified to load and generate with a tiny test model; how many words per second Qwen3.5-2B manages on a given computer's processor has not been measured, so expect it to be slow.
* **Local performance is untested here.** Browser tests use a scripted provider, so response quality and speed on a real iPhone or WebGPU device still need the existing acceptance scripts.

## Tests

```sh
npm test            # unit tests for every pure module (Node)
npm run e2e         # browser tests: builds dist/, serves it, and drives it with Playwright against a scripted OpenAI-style server
```

`tests/e2e/fake-api.mjs` is an OpenAI-compatible server whose behaviour is chosen by the last prompt (`fail-once`, `fail-mid`, `length`, `slow`, `speak`, `speak-long`, `markdown`, citations when excerpts are present). Speech APIs are replaced by mocks in `assistant.e2e.mjs`, because a headless browser has no voices or recogniser.

## Adding to the chat

The inline script exposes a few hook lists so features do not need to edit the send path: `contextProviders` (add instructions or document text to the prompt), `messageDecorators` + `messageActionHandlers` (add a button to a message), `sendInterceptors` (answer a typed command without the model), `userMessageHooks`, `afterReplyHooks`, and `threadSelectedHooks`. New logic belongs in a pure module under `chat/` with a Node test, then wired in through one of these.
