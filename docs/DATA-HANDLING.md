# Data handling

This document states the facts about what the app keeps in the browser and what it sends over the network. It is for someone who runs a copy of the app and has to write their own notice to the people who use it. It speaks for the code, not for any operator, and it is kept true by tests wherever a test can do that.

Two tables in it are generated from inventories that tests keep equal to the source: the storage table in section 1 and the host table in section 2. Do not edit between their markers; run `node scripts/data-handling.mjs write` and `npm run data-handling:check` says whether they are current.

## 1. What is kept in the browser

This section says, by kind of data, where the app keeps it in the browser and for how long. The generated table after it lists every key, database and device store; it is not repeated here.

The app has no server side. Everything the app itself keeps is in the browser of the person using it. A browser keeps its storage apart for each address, so a second browser, a second device, or the same browser at another address (`localhost` and a network name, say) has its own copy and sees none of this. The assistant says the same: each browser and each device keeps its own, and nobody else holds a copy.

### Chats and what goes with them

- **Saved chats** are one list in local storage (`chatThreads`), rewritten whole on every save. Beside it are the id of the open chat, the unsent text of each chat (`plc.drafts.v1`), folders (called projects on some screens) and pinned items.
- **Deleting a chat** moves it to Trash. It does not erase it. A chat in Trash stays whole in `chatThreads` (and so in the vault, if the vault is on), and the chat history file and a backup still include it. It stays for 30 days or until the person chooses "Delete permanently" on it, whichever comes first. A chat that has been in Trash for more than 30 days is dropped from the list when the app starts (the stored list is rewritten at the next save); nothing removes it while the app stays open. Only a permanent delete, or that drop, removes a single chat from storage (what that means with the vault on is in section 3).
- **A temporary chat** is kept in memory only. The chat itself is not written to storage, not put in the chat history file or in a backup, and is forgotten when the page is closed or reloaded. Files attached in it are also kept in memory only, and memory is not used in it. Two small things about it are written down all the same: the text in its message box, which is saved in `plc.drafts.v1` like the unsent text of any chat, and the id of the open chat (`plc.activeThread.v1`). The app removes an entry of `plc.drafts.v1` only when the message box of that chat is emptied; no code removes it when a chat is deleted or forgotten.
- **Unsent text across an update.** When the page reloads to apply an update, the text in the composer is held in session storage (`plc.draft`) for that one reload.

### Documents

Files attached to a chat or added to the document library are kept in the IndexedDB database `plc-docs`. For each file the app keeps its name and size, the text it extracted, and that text cut into passages, not the original file. A picture is kept as encoded image data. Pictures can only be attached when a connected provider is in use.

### Memory, presets, preferences and settings

- Memory items and custom presets are each a local storage key. So are the preferences (standing instructions, how Enter sends, the time of the last export), the choice between on-device and a connected provider, the chosen on-device model and the chosen voice.
- The provider settings are in session storage: the endpoint, the model, the format and the theme (`chatConfig`), the provider's model list (`chatModels`) and the API keys (`chatEndpointTokens`).

### The API key

A provider's API key is held in two places: `chatEndpointTokens` holds one key per exact destination (address, path and query), and `chatConfig` also holds the key of the endpoint in use. Where those two are, and how long the key lasts, depends on the vault (section 3):

- **Vault off.** Both are in session storage, and the key is stored as it is, not encrypted. The app does not remove it when the tab is closed; ending session storage is left to the browser. Browsers normally drop it when the tab or window is closed, but a browser may keep it and give it back when a closed tab is reopened or a session is restored. That is the browser's behaviour, and the app cannot prevent it. The key may therefore outlast the tab.
- **Vault on, "Remember my API keys" on.** This setting is on by default (`rememberKeys` starts true). The key is not written to session storage. Both places are kept in the vault, sealed, so the key outlasts the tab and the browser's restart, and is there again after the vault is unlocked. A key that was in session storage before the vault was turned on stays there, unencrypted, until the person removes the unencrypted copy (section 3).
- **Vault on, "Remember my API keys" off.** The key is not written to session storage and `chatEndpointTokens` is not stored. The stored copy of `chatConfig` has its key blanked. The key is held in the memory of the page and is lost when the page is reloaded or closed, or when the vault is locked (locking reloads the page).

A key is sent only to the destination it was saved for. The one exception is a prompt, "Copy your API key?", that appears when the person chooses a new endpoint that has no saved key while a key is in use: it offers to copy the current key to the new endpoint. If the person answers yes, the key is saved for that endpoint and sent to it. The prompt is asked once for each new destination until the page is reloaded. If the person does not answer yes, no key is saved for the new destination and none is sent to it.

"Transfer settings" puts the key in the link, QR code or settings file only if the person ticks the box for it, and then only encrypted under a password they choose (section 2g). A key received that way is saved like a typed one, in the place that fits the cases above. The chat history file and the backup carry no API key and no provider settings.

The "copy" button beside the key field writes the key, as plain text, to the system clipboard (section 2k).

### Model and voice files, and the offline copy

- Model files are kept on the device, not in the storage keys: the default (largest) model in the browser's Cache Storage, the smaller on-device models in the origin private file system (OPFS), with Cache Storage as the fallback where a browser cannot open OPFS.
- Voice files are kept in OPFS.
- The small matching model (about 24 MB, used to search by meaning and by the assistant) is kept in Cache Storage. The vectors it computes are held in memory only.
- The offline copy of the app is made by the service worker and kept in Cache Storage, one cache per build (named `plc-shell-` and the build's commit). It keeps the cache of the build before and of any build an open tab still runs, and deletes older ones.
- These files are keyed by the address they were downloaded from, so a copy that changes its model source downloads again.
- The app asks the browser to protect the downloaded models from clearing when the person asks for it (for example "Keep models" in Settings) and when the vault is turned on.

### Files the person saves

The chat history file, a protected backup and a settings file are made in the browser and handed to the browser's download. The app keeps no copy of them and does not know where they go. The only trace is the time of the last export, kept in the preferences, which drives the backup reminder. The chat history file and a backup include the chats in Trash, but not temporary chats. The chat history file is readable by anyone who has it. A protected backup is encrypted under a password the person chooses. A settings file holds the endpoint, the model and the theme, and an API key only as described above.

### What clearing site data removes

Browsers offer to clear the site data of an address. In current browsers that removes local storage, session storage, IndexedDB, Cache Storage and OPFS for the address, which is everything in the table below and the downloaded models. That is the browser's behaviour, not the app's, and the app cannot prevent it. Settings tells the person that browsers can clear site data and that a backup is the only copy that survives it. When the app updates itself it removes only its own saved copies of the app (section 2e).

<!-- data-handling:storage:start -->
<!-- Generated by `node scripts/data-handling.mjs write` from docs/evidence/encryption/storage-inventory.json. Do not edit by hand. -->

| Class | What it means |
| --- | --- |
| `device` | model files, runtimes and the saved app: not user data, not encrypted |
| `plain` | needed before unlock or about the device and the app, not about the person: stays readable |
| `setting` | a choice the person made that does not reveal content (voice, switches, model choice): goes into the vault with the rest |
| `test` | read only by a development or test hook: never shipped to production |
| `transient` | lives for one tab or one step and is removed: must still never hold plaintext user content once the vault is on |
| `user` | what the person wrote or chose to keep (chats, drafts, memory, documents, API keys): goes into the vault |
| `vault` | the encrypted store itself: nothing in it is readable without the passphrase |

**Keys in local and session storage (31)**

| Key | Where | Class | What it holds | Format | First release |
| --- | --- | --- | --- | --- | --- |
| `chatConfig` | session storage | `user` | provider endpoint, model, theme and the API key in use (with the vault on, the stored copy has the key blanked unless keys are remembered; with it off the key is stored as it is) | 1 | v0.0.0 |
| `chatEndpointTokens` | session storage | `user` | API keys, one per endpoint | 1 | v0.4.0 |
| `chatModels` | session storage | `setting` | the provider's model list | 1 | v0.0.0 |
| `chatThreads` | local storage | `user` | every saved chat, rewritten whole on each save | 1 | v0.0.0 |
| `plc.activeThread.v1` | local storage | `user` | which chat is open (an id) | 1 | v0.6.0 |
| `plc.downloadIntent.v1` | local storage | `plain` | a model download that should resume; about the device, not the person | 1 | v0.6.0 |
| `plc.draft` | session storage | `transient` | composer text kept across the page reload that applies an update | 1 | v0.6.0 |
| `plc.drafts.v1` | local storage | `user` | unsent composer text per chat | 1 | v0.8.0 |
| `plc.folders.v1` | local storage | `user` | folder names and which chats are in them | 1 | v0.8.0 |
| `plc.formats.v1` | local storage | `plain` | the highest format of each store any version has written here, so an older version leaves newer data alone | 1 | v0.57.0 |
| `plc.inferenceMode.v1` | local storage | `setting` | on this device or a connected provider | 1 | v0.6.0 |
| `plc.lock.v1` | local storage | `plain` | lock verifier and auto-lock minutes; replaced by the vault header | 1 | v0.8.0 |
| `plc.lockSplash.v1` | local storage | `plain` | the not-locked reminder is on or off | 1 | v0.33.0 |
| `plc.memory.v1` | local storage | `user` | memory items. It was shared with the model-memory switch until 2026-11-04, which overwrote it | 1 | v0.8.0 |
| `plc.modelMemory.v1` | local storage | `setting` | One model at a time, and whether the offer was declined | 1 | v0.47.0 |
| `plc.modelSourceNotice.v1` | local storage | `plain` | the model-source notice was shown | 1 | v0.61.0 |
| `plc.models.v1` | local storage | `setting` | which on-device model is chosen | 1 | v0.6.0 |
| `plc.offlineHint.v1` | local storage | `plain` | the offline hint was shown | 1 | v0.37.0 |
| `plc.pendingToken.v1` | session storage | `transient` | a settings link waiting for the person's choice | 1 | v0.13.0 |
| `plc.prefs.v1` | local storage | `setting` | composer preferences; the theme is the one value the lock screen would like to read | 1 | v0.8.0 |
| `plc.presets.v1` | local storage | `user` | the person's own prompt presets | 1 | v0.8.0 |
| `plc.shell.collapsed` | local storage | `plain` | side panel open or closed | 1 | v0.15.0 |
| `plc.shell.pins.v1` | local storage | `user` | pinned items; may name chats | 1 | v0.15.0 |
| `plc.speechInputUnusable` | local storage | `plain` | this browser's speech input did not work | 1 | v0.11.0 |
| `plc.test.voice` | local storage | `test` | development hook, stripped from production | 1 | v0.19.0 |
| `plc.theme.v1` | local storage | `plain` | the resolved theme (light or dark), so the unlock screen matches it before anything is unlocked | 1 | v0.47.0 |
| `plc.update.tried` | session storage | `plain` | an update reload was already tried | 1 | v0.11.0 |
| `plc.vault.v1` | local storage | `plain` | says a vault exists (and its auto-lock minutes, whether it locks when the page is hidden, and when it was made), so the page can paint the locked state before IndexedDB answers | 1 | v0.47.0 |
| `plc.voice.v1` | local storage | `setting` | the older voice record, read once and migrated | 1 | v0.19.0 |
| `plc.voice.v2` | local storage | `setting` | chosen voice and its settings | 2 | v0.23.0 |
| `promoDismissed` | session storage | `plain` | the banner was closed | 1 | v0.3.1 |

**Databases (2)**

| Name | Where | Class | What it holds | Format | First release |
| --- | --- | --- | --- | --- | --- |
| `plc-docs` | indexedDB | `user` | attached and library documents | 1 | v0.8.0 |
| `plc-vault` | indexedDB | `vault` | the encrypted header and log | 1 | v0.47.0 |

**Device stores (3)**

| Name | Class | Written by |
| --- | --- | --- |
| Cache Storage: the saved app and, where OPFS cannot be used, model files | `device` | scripts/service-worker.js, runtime/providers/cache-api-backend.mjs |
| OPFS model and voice files | `device` | runtime/providers/, chat/voice/voice-engine.mjs |
| throw-away IndexedDB probe databases | `plain` | chat/connection/connection-glue.mjs, chat/connection/private-mode.mjs |

35 source files read or write browser storage; the list is in `files.list` of docs/evidence/encryption/storage-inventory.json.
<!-- data-handling:storage:end -->

## 2. What the app sends over the network

What the app sends depends on the mode the person is in. This section goes mode by mode. In all of them the requests the app's own code makes are of three kinds only: to the host that serves the copy (its own files and `/version.json`), to the configured model source (downloads), and, in connected provider mode only, to the provider the person chose. The app has no code that sends a report, a count, an error log or a measurement of use to anyone. Speech services belong to the browser, not the app (section 2c).

### a. On-device text chat

- A message typed in on-device mode goes to a model running in a web worker on this device. Nothing typed, attached or remembered leaves the device. Files are read and cut into passages on the device.
- **The connection check.** The app finds out whether it is online by asking the host that served it for `/version.json`, with a time in the query so that the saved copy is skipped. It does this about 2.5 seconds after start-up, when the page comes back to the front or the window gets focus, when the browser reports that it is online again, every 5 minutes while the page is open (not while it is in the background), and every 15 seconds while the app thinks it is offline. The answer's content is not used; only whether an answer came. No other address is asked. For the operator this means every open copy makes a request to the host about every 5 minutes, which appears in whatever the host logs.
- **The matching model.** In every mode, search by meaning and the assistant use a small model (about 24 MB). It is downloaded from the model source the first time it is needed, unless the browser has data saver on, and then runs on the device. The sentences it is given are not sent anywhere.

### b. A connected provider

- **When.** Only when the person has chosen "Connected provider". The app never switches to a provider on its own: every change of mode in the code is made by a button the person presses, a failed on-device model gives an error and not a request to a provider, and a request cannot be made without an endpoint and a model the person set. The mode is remembered in the browser; with no mode saved, a tab that already has a provider endpoint in session storage starts in provider mode, and otherwise the app starts on-device.
- **What a reply request carries.** One POST to the provider's address, with the person's own API key, if there is one, in the header that the provider's API format uses: `Authorization: Bearer` by default, `api-key` for Azure, `x-api-key` for the Anthropic format (and for any provider entry whose key style says so). The Anthropic format also sends `anthropic-version` and `anthropic-dangerous-direct-browser-access: true`, the header Anthropic requires before it lets a browser call it with the person's own key. The body holds the model name and the conversation, made of:
  - the chat's own instructions (its system prompt or preset), the instructions of the folder the chat is in, and the person's standing preferences;
  - memory items (up to 40 items and 2,000 characters), unless the chat is temporary or the memory switch is off;
  - a summary of the earlier part of a long chat, if one was made;
  - the earlier messages of the chat, the person's and the assistant's, except those the person left out of context and, once a summary stands in for the older part, the messages it covers;
  - the text of files attached to the chat, whole or as the passages that fit, and passages of the documents in the library of the chat's folder;
  - pictures attached to a message, as encoded image data;
  - the results of the exact tools (calculations) that the app worked out for a message.

  During a voice call a short style instruction is added as well. For the Responses format the request also says `store: false`, so the provider is asked not to keep it. If a provider answers 400 or 422 the same request is sent again without streaming.
- **What it does not carry.** Other chats, the settings, the vault, the memory of a temporary chat, files of other folders, and any key saved for another destination.
- **The model list.** In provider mode the app also asks the provider for its list of models (a GET, with the key if there is one for that address). It does so:
  - **at start-up**, with no action by the person: when the page starts in provider mode with an endpoint set and no model list stored (`chatModels`). The request goes to the saved endpoint with the saved key, before the person does anything. It happens, for example, when an earlier request for the list failed, since only a list that arrived is stored. It does not happen when a model list is already stored, or when the page starts in on-device mode;
  - when the person picks or types an endpoint (about 1.6 seconds after typing stops);
  - when the key or the API format is changed;
  - when settings are received by transfer;
  - when the person presses "Refresh model list";
  - after the person answers the "Copy your API key?" prompt (section 1), when the choice of endpoint asked for a list.

  Typing an address therefore sends a request to that address.
- **Summarize earlier messages.** This is a button (under the message box when the conversation is nearly full, and under a reply that ran out of room). In provider mode it sends the provider one request for each piece of the earlier conversation (the person's and the assistant's earlier messages that are not left out of context, cut into pieces), with a fixed instruction and the summary made so far. The answer is stored as the chat's summary and is then sent in later reply requests (above). It does not carry memory, the folder's instructions or files. It is made by the same code as a reply, so a provider that answers 400 or 422 gets it again without streaming. In on-device mode the summary is made on the device and sends nothing.
- **Who.** The providers the app lists are in the hosts table below; a host named there is contacted only if the person chooses it. A custom address can be any web address, including a program on the person's own computer or network (the list offers Ollama, LM Studio, llama.cpp and vLLM on `localhost`). The provider's own terms and prices apply, and what it keeps is for the provider to say.

### c. Voice

- **Dictation and voice calls** listen with the browser's speech recognition. The app starts it and receives the words; the audio goes wherever the browser sends it. Depending on the browser that can be the browser maker's server; the app cannot tell. The app does not record or store audio: its only other use of the microphone is a permission test that stops at once. The long voice message feature keeps the words and the time it took, not the sound.
- **Reading aloud** uses either an on-device voice (Kokoro or Kitten, downloaded as in section d, and run in the browser; the text stays on the device) or the browser's own voices. The app lists voices that run on the device first, but may use any voice the browser offers; whether such a voice sends the text to a service is the browser's choice.
- What a call sends to a model is the same as in section a or b.

### d. Downloads of models, voices and the matching model

- **From where.** Model, voice and matching-model files come from the first source in the copy's model configuration (`runtime/config/app-config.mjs`, `docs/APP-CONFIG.md`) and from no other address. The shipped default source is the project's content delivery network, at the host `assets.privatelocal.chat` under the path `/models/`, labelled "Private Local Chat project CDN". A copy built or served with its own `config/app-config.json` uses that source instead; the list replaces the shipped one whole, and only its first entry is used. A source may be a path on the copy's own host.
- **What the source sees.** That a download was asked for, from which address and at what time, as any web host does, and nothing typed. The requests carry no chat content. The model-source notice says this once, before the first model download, on a copy that uses the shipped source and names no site of its own in its manifest; a copy with its own source shows no notice, and Settings tells the person that the source is set by whoever runs the copy.
- **Kept on the device,** keyed by the address they came from (section 1).
- **Checked or not.** Every model file and voice file has a size and a SHA-256 pinned in the app. A download whose bytes differ is refused before it is stored, whatever the source, and "Verify / repair" in Settings checks files already stored. The matching model is the exception: its files and the WebAssembly runtime that runs them are not verified by the app. The code pins no size or hash for them. Their folder name is content-addressed (a folder called memory, then 16 hex digits taken from a hash of every file's path and hash), so a changed byte at the project's network is a new path; but a source an operator chose can serve other bytes at that path and the app does not notice. `docs/APP-CONFIG.md` says the embedding set is checked against pinned hashes; the code does not do that. `fetch-models.mjs` cannot fetch the set either, because `models.json` lists no files for it.

### e. Updates

- The page asks its own host for `/version.json` (not from a cache) when it opens, when the page returns to the front after at least 5 minutes, and when a voice fails to start or to download and the app wants to know whether the build it runs is old. If the answer names a different build, the app acts as follows. The first time this happens in a tab, when the page has just opened, it removes its saved copy of the app (the `plc-shell-` caches and the service worker) and reloads once. In every later check while the page is open it only shows a notice with a Reload button, and keeps unsent text across the reload. It does not reload by itself.
- The browser fetches `/sw.js` from the host on its own schedule to look for a new service worker. A new service worker downloads the app's files from the host and saves them.
- The page itself does not ask for `/releases/index.json`. That file lists the builds the host holds; the operator tools and the deploy scripts read it, and the service worker sees to it that it is never answered from the saved copy.
- Nothing is reported to anyone: the host learns only that its own files were requested.

### f. Page counting

The app has no page counting, no analytics and no tracking script, and its pages load no script from another address. A host may add its own count at its edge (a rule in its proxy or CDN); that is the host's to state, and the app can say so about a host only when the site manifest says `countsPageLoads` (section 5).

### g. The settings transfer link and QR code

- **What travels.** The endpoint, the model and the theme, and nothing else, in a link of the form `address#settings=` followed by the Base64URL text of a small JSON object. The same JSON is what a settings file holds. The link is made on the device; the QR code is drawn on the device; no service is asked to make either.
- **The API key** travels only if the person ticks "Include API token". It is then encrypted with a password the person chooses (PBKDF2-SHA-256, 600,000 rounds, AES-256-GCM, with the endpoint, model and theme bound to it). The app accepts any password, including a short or blank one. The password is not in the link; the person has to pass it on separately.
- **Who can read it.** The endpoint, the model and the theme are readable by anyone who has the link, the QR code or the file. The browser does not send the part of an address after `#` to the host. After reading a link, the app removes it from the address bar.
- **Where it opens.** The link's address is the address of the copy that made it, so opening it loads that copy and applies the settings there. A received key is attached only to the destination it was made for.
- **Older links.** Links made by earlier versions put the settings, and even the key, in the query string, in plain text. This version still reads such links but never makes them. A query string is sent to the host and may be logged there.
- If the person uses the device's share sheet to send the link, where it goes is the person's choice.

### h. Sharing the app

The "Share" entries (in the Explore list, in a menu and in Settings) appear only when the site manifest has a `site` identity with a public address. What is shared is fixed: that address, the name and one sentence of description. It is never built from the current address, a chat, settings or a key. A copy with no `site` identity has no Share entries, and the dialog would say that there is nothing to share.

### i. What the app does not do

- **No account.** There is no sign-in, no registration, and nothing is sent to an account service.
- **No cookies from the app.** The app's own code never reads or writes a cookie. One library bundled with the on-device model runtime has a fallback that would write a cookie for its log level if local storage were unavailable; it runs in the model worker, which has no document, so it does nothing there. A host may set cookies of its own.
- **No third-party scripts.** The page loads scripts and styles from its own host only, and the headers the build declares include `Cross-Origin-Embedder-Policy: require-corp`, which makes a browser refuse cross-origin files that do not agree to being embedded. A host named in the source is contacted only if the person chooses it as a provider or follows a link to it (next section).
- **Links out.** The app has links to the provider websites, to the project's repository and to documentation. A link is followed only when the person clicks it, opens in a new tab, and the browser sends the other site no more than the origin of this copy (scheme, host and port; `Referrer-Policy: strict-origin-when-cross-origin`).
- **Links in a model's replies.** A reply can contain links to any site; only `http`, `https` and `mailto` links are made clickable. One opens in a new tab with `noopener noreferrer nofollow`, so the other site gets no referrer from the browser. An image in a reply is not fetched: it is drawn as a text link, "Image: ...", that the person may open. The address of a link in a reply is the model's to choose, not the app's.
- **No development tooling.** The development diagnostics (a receiver that uploads state events) are built only for the project's own development site. A build for downloading cannot carry them, and `app` and `runkit` builds are refused on the development branch.

### j. Copy link with the current title, system prompt and prompt

The chat menu has "Copy link with current title/system/prompt". It writes a link to the system clipboard (or shows it in a box to copy). The link is the address of this copy followed by a query string that holds the title of the open chat, its system prompt and the text in the message box, if each is not empty (`?title=...&system=...&prompt=...`). The link is made on the device and nothing is sent when it is made. Opening it, wherever the person pastes it, sends that query string to the host that serves the copy, and a host may log it; unlike the settings link of section g, nothing in it is after a `#`, and none of it is encrypted. The app reads these values on opening a link and starts a new chat from them. The link does not carry an API key.

### k. What the browser and the clipboard do

- **Spell-check.** The message box (`#messageInput`) does not set `spellcheck="false"`. Only the API key field and the password boxes of the transfer dialogs do; no other box in the app's own files sets it. Whether text typed in a box with spell-check on is sent to a spell-check service is up to the browser, and some browsers do send it. The app cannot tell which.
- **The clipboard.** The app writes to it when the person presses a copy button: the copy button of the API key field writes the key, as plain text; "Copy link ..." writes the link of section j; other copy buttons write what they name (a message, a settings link). For the key and for the link, if the clipboard cannot be written, the app shows the text in a box to copy by hand. The app does not clear the clipboard afterwards. Nothing in the app reads the clipboard; pasting into a box is the browser's.

### Hosts the app's files name

Some names in the table below are not destinations at all. `api.example.com` is placeholder text in an input field of `index.html`; `example.org` appears in a comment of `chat/site/site-links.mjs`, and `host` in a message of that file that shows the shape `https://host/`; `schema.org` is the context name of the page's descriptive data, and `www.w3.org` is an XML namespace name in SVG files and in code that draws icons. `plc-model-files.invalid` is an internal label (a made-up address under a top-level domain that cannot exist) that the on-device model storage uses as a key in Cache Storage; it is never requested. `localhost` is the stand-in for relative addresses in the address-handling code, and also the address of the local servers in the provider list. All of these are placeholders or internal labels and are never contacted by the app, except `localhost` when the person chooses a local server. `github.com` and the documentation and console sites in the provider list are pages the person may open by clicking a link; the app does not request them. The second table names hosts that appear only inside vendored libraries, as defaults or in comments; the app gives those libraries its own addresses for the files it needs, and `tests/model-urls.test.mjs` checks that every model address the app requests is under the configured source.

<!-- data-handling:hosts:start -->
<!-- Generated by `node scripts/data-handling.mjs write` from docs/evidence/split/network-origins.json. Do not edit by hand. -->

A host named in the source is not a host the app contacts: the provider list and the documentation links name hosts that are only used when a person chooses them.

**Hosts named by the app's own files (71)**

| Host | Files that name it |
| --- | --- |
| `ai-gateway.vercel.sh` | `chat/provider/endpoint-options.mjs` |
| `ai.google.dev` | `chat/provider/endpoint-options.mjs` |
| `aistudio.google.com` | `chat/provider/endpoint-options.mjs` |
| `api-docs.deepseek.com` | `chat/provider/endpoint-options.mjs` |
| `api.anthropic.com` | `chat/provider/endpoint-options.mjs` |
| `api.cerebras.ai` | `chat/provider/endpoint-options.mjs` |
| `api.cohere.ai` | `chat/provider/endpoint-options.mjs` |
| `api.deepinfra.com` | `chat/provider/endpoint-options.mjs` |
| `api.deepseek.com` | `chat/provider/endpoint-options.mjs` |
| `api.example.com` | `index.html` |
| `api.fireworks.ai` | `chat/provider/endpoint-options.mjs` |
| `api.groq.com` | `chat/provider/endpoint-options.mjs` |
| `api.hyperbolic.xyz` | `chat/provider/endpoint-options.mjs` |
| `api.mistral.ai` | `chat/provider/endpoint-options.mjs` |
| `api.moonshot.ai` | `chat/provider/endpoint-options.mjs` |
| `api.openai.com` | `chat/provider/endpoint-options.mjs` |
| `api.perplexity.ai` | `chat/provider/endpoint-options.mjs` |
| `api.scaleway.ai` | `chat/provider/endpoint-options.mjs` |
| `api.together.ai` | `chat/provider/endpoint-options.mjs` |
| `api.together.xyz` | `chat/provider/endpoint-options.mjs` |
| `api.tokenfactory.nebius.com` | `chat/provider/endpoint-options.mjs` |
| `api.x.ai` | `chat/provider/endpoint-options.mjs` |
| `api.z.ai` | `chat/provider/endpoint-options.mjs` |
| `app.fireworks.ai` | `chat/provider/endpoint-options.mjs` |
| `app.hyperbolic.ai` | `chat/provider/endpoint-options.mjs` |
| `bailian.console.alibabacloud.com` | `chat/provider/endpoint-options.mjs` |
| `cloud.cerebras.ai` | `chat/provider/endpoint-options.mjs` |
| `console.groq.com` | `chat/provider/endpoint-options.mjs` |
| `console.mistral.ai` | `chat/provider/endpoint-options.mjs` |
| `console.scaleway.com` | `chat/provider/endpoint-options.mjs` |
| `console.x.ai` | `chat/provider/endpoint-options.mjs` |
| `dashboard.cohere.com` | `chat/provider/endpoint-options.mjs` |
| `dashscope-intl.aliyuncs.com` | `chat/provider/endpoint-options.mjs` |
| `deepinfra.com` | `chat/provider/endpoint-options.mjs` |
| `developers.cloudflare.com` | `chat/provider/endpoint-options.mjs` |
| `docs.cohere.com` | `chat/provider/endpoint-options.mjs` |
| `docs.fireworks.ai` | `chat/provider/endpoint-options.mjs` |
| `docs.hyperbolic.xyz` | `chat/provider/endpoint-options.mjs` |
| `docs.mistral.ai` | `chat/provider/endpoint-options.mjs` |
| `docs.ollama.com` | `chat/provider/endpoint-options.mjs` |
| `docs.perplexity.ai` | `chat/provider/endpoint-options.mjs` |
| `docs.together.ai` | `chat/provider/endpoint-options.mjs` |
| `docs.tokenfactory.nebius.com` | `chat/provider/endpoint-options.mjs` |
| `docs.vllm.ai` | `chat/provider/endpoint-options.mjs` |
| `docs.x.ai` | `chat/provider/endpoint-options.mjs` |
| `docs.z.ai` | `chat/provider/endpoint-options.mjs` |
| `example.org` | `chat/site/site-links.mjs` |
| `gateway.ai.cloudflare.com` | `chat/provider/endpoint-options.mjs` |
| `generativelanguage.googleapis.com` | `chat/provider/endpoint-options.mjs` |
| `github.com` | `chat/provider/endpoint-options.mjs`, `chat/shell/shell.mjs`, `index.html` |
| `host` | `chat/site/site-links.mjs` |
| `huggingface.co` | `chat/provider/endpoint-options.mjs` |
| `inference-docs.cerebras.ai` | `chat/provider/endpoint-options.mjs` |
| `learn.microsoft.com` | `chat/provider/endpoint-options.mjs` |
| `lmstudio.ai` | `chat/provider/endpoint-options.mjs` |
| `localhost` | `chat/provider/endpoint-options.mjs`, `chat/provider/endpoint-tokens.mjs`, `chat/provider/endpoint-urls.mjs` |
| `openrouter.ai` | `chat/provider/endpoint-options.mjs` |
| `platform.claude.com` | `chat/provider/endpoint-options.mjs` |
| `platform.deepseek.com` | `chat/provider/endpoint-options.mjs` |
| `platform.kimi.ai` | `chat/provider/endpoint-options.mjs` |
| `platform.openai.com` | `chat/provider/endpoint-options.mjs` |
| `plc-model-files.invalid` | `runtime/providers/cache-api-backend.mjs` |
| `router.huggingface.co` | `chat/provider/endpoint-options.mjs` |
| `schema.org` | `index.html` |
| `tokenfactory.nebius.com` | `chat/provider/endpoint-options.mjs` |
| `vercel.com` | `chat/provider/endpoint-options.mjs` |
| `www.alibabacloud.com` | `chat/provider/endpoint-options.mjs` |
| `www.perplexity.ai` | `chat/provider/endpoint-options.mjs` |
| `www.scaleway.com` | `chat/provider/endpoint-options.mjs` |
| `www.w3.org` | `brand/favicon.svg`, `brand/mark-dark.svg`, `brand/mark-light.svg`, `brand/wordmark-dark.svg`, `brand/wordmark-light.svg`, `chat/call/call.mjs`, `chat/icons.mjs`, `chat/lock/lock.mjs`, `chat/lock/padlock.mjs`, `index.html` |
| `z.ai` | `chat/provider/endpoint-options.mjs` |

**Hosts named only inside vendored libraries (22)**

| Host | Files that name it |
| --- | --- |
| `bugzil.la` | `runtime/providers/vendor/noble-hashes/2.4.0/utils.js` |
| `caniuse.com` | `runtime/providers/vendor/noble-hashes/2.4.0/utils.js` |
| `cdn.jsdelivr.net` | `chat/vendor/embedding/worker.js`, `runtime/providers/vendor/wllama/v1q/wllama.js` |
| `developer.chrome.com` | `runtime/providers/vendor/webllm/web-llm-0.2.86.js` |
| `developer.mozilla.org` | `chat/vendor/embedding/worker.js` |
| `eprint.iacr.org` | `runtime/providers/vendor/noble-hashes/2.4.0/sha2.js` |
| `gist.github.com` | `chat/vendor/embedding/worker.js` |
| `github.com` | `chat/vendor/embedding/worker.js`, `chat/vendor/voice/worker-kokoro.js`, `chat/vendor/voice/worker.js`, `runtime/providers/vendor/noble-hashes/2.4.0/provenance.json`, `runtime/providers/vendor/webllm/web-llm-0.2.86.js`, `runtime/providers/vendor/wllama/v1q/wllama.js` |
| `huggingface.co` | `chat/vendor/embedding/worker.js`, `runtime/providers/vendor/webllm/web-llm-0.2.86.js`, `runtime/providers/vendor/wllama/v1q/wllama.js` |
| `jackpordi.com` | `runtime/providers/vendor/webllm/web-llm-0.2.86.js` |
| `localhost` | `runtime/providers/vendor/wllama/v1q/wllama.js` |
| `ns.adobe.com` | `chat/vendor/pdfjs/pdf.worker.min.mjs` |
| `nvlpubs.nist.gov` | `runtime/providers/vendor/noble-hashes/2.4.0/sha2.js` |
| `raw.githubusercontent.com` | `runtime/providers/vendor/webllm/web-llm-0.2.86.js` |
| `registry.npmjs.org` | `runtime/providers/vendor/noble-hashes/2.4.0/provenance.json` |
| `web.dev` | `chat/vendor/embedding/worker.js`, `chat/vendor/voice/worker-kokoro.js`, `chat/vendor/voice/worker.js` |
| `webgpureport.org` | `runtime/providers/vendor/webllm/web-llm-0.2.86.js` |
| `www.apache.org` | `chat/vendor/pdfjs/pdf.min.mjs`, `chat/vendor/pdfjs/pdf.worker.min.mjs`, `runtime/providers/vendor/webllm/web-llm-0.2.86.js` |
| `www.linkedin.com` | `runtime/providers/vendor/webllm/web-llm-0.2.86.js` |
| `www.rfc-editor.org` | `runtime/providers/vendor/noble-hashes/2.4.0/sha2.js` |
| `www.w3.org` | `chat/vendor/pdfjs/pdf.min.mjs`, `chat/vendor/pdfjs/pdf.worker.min.mjs`, `chat/vendor/qrcode.js`, `runtime/providers/vendor/webllm/web-llm-0.2.86.js` |
| `www.xfa.org` | `chat/vendor/pdfjs/pdf.worker.min.mjs` |

**Paths the app fetches from its own origin (1)**

| Path | Files that fetch it |
| --- | --- |
| `/version.json` | `chat/voice/voice-choice.mjs`, `index.html` |
<!-- data-handling:hosts:end -->

## 3. What the vault protects

The vault is optional and is off unless the person turns it on. The design is in `docs/ENCRYPTION-AT-REST-PLAN.md` and the code in `chat/vault/`. A person turns it on in the dialog that adds a passcode, with the box "Also encrypt everything this app saves", which starts unticked and is disabled in a browser that cannot keep a vault (it needs IndexedDB and WebCrypto). With the vault off nothing in the browser is encrypted.

### What it encrypts

The key table in `chat/vault/key-classes.mjs` gives every storage key a class. The classes `user`, `setting` and `transient` go into the vault when it is on; `plain` and `test` keys and the device stores do not. In plain words, the vault holds:

- saved chats, each sealed under a key of its own, and documents, each under a key of its own;
- memory, presets, drafts, folders, pins and preferences;
- the choices of mode, model and voice;
- the provider settings and the API keys (the keys only if "Remember my API keys" is on);
- the short-lived items of a tab (the unsent text kept across an update, a settings link waiting for its password).

What is stored is sealed with AES-256-GCM. Settings are sealed under a random vault key, and each chat and document under a key of its own that the vault key seals. A key derived from the passphrase (PBKDF2-SHA-256, 600,000 rounds) wraps the vault key. Each record is padded to a multiple of 1 KB before sealing, so the length of a short message is not visible. Deleting a chat permanently destroys its key in the app's view (next paragraph); moving it to Trash does not.

**What deleting does with the vault on.** Moving a chat to Trash only marks it; the chat and its key stay in the vault for up to 30 days (section 1). When the chat is removed for good (the person chooses "Delete permanently", or the app drops it at start-up after 30 days in Trash), the vault appends a record that deletes the chat and a record that destroys its key, and the app no longer holds that key. The older records stay in the vault's log, including the sealed record that holds the chat's key and the sealed copies of the chat. The code that rewrites the log without them (compaction, `session.compact()`) exists, but nothing in the app calls it; `docs/ENCRYPTION-AT-REST-PLAN.md` says it is not yet run automatically. So a deleted chat's bytes remain in the browser's storage, sealed under a key that is itself still in the log, until compaction is run. With the vault off, deleting for good rewrites the saved list without the chat, and the old bytes may survive on the storage medium (see "Leftover bytes").

### What it leaves readable

- **The `plain` keys** in the table in section 1: the theme, the marker that says a vault exists (`plc.vault.v1`, which also holds the auto-lock minutes, the setting "lock when the page is hidden" and the time the vault was made), the format registry, the state of the side panel, the flags that a notice was shown, a model download that should resume, and the other keys with class `plain`.
- **The device stores:** model files, voice files and the saved copy of the app.
- **The vault's own header and log:** the format and creation time; the wrapped vault key and what is needed to unwrap it (for a passkey also its credential id, label, address and date); and for each record a sequence number, the id of its key (which carries the id of a chat or document) and sealed bytes.
- **The old unencrypted copy,** until it is removed. Turning the vault on does not delete what was saved before. The app offers to remove it, and the person can do it later in Settings. Until then it is readable by anyone with access to the browser's storage.

### How it unlocks

- **A passphrase,** of at least one character, chosen by the person. The app does not judge it.
- **Face ID, Touch ID or the device's screen lock,** where the browser supports passkeys with the WebAuthn PRF extension and the person turns it on in Settings. The passkey adds a second way to unwrap the vault key, beside the passphrase, which stays. If the browser returns no PRF secret, the app refuses and says so; it does not treat a recognised face as a key. A passkey belongs to one web address. Apple and Google sync passkeys through their own accounts, so it may be present on more than one device.
- **Locking.** "Lock now" forgets the key and reloads the page. The person can choose to lock after 1, 5 or 15 minutes away, and to lock when the page is hidden. Only one tab writes to the vault at a time; another tab opened on it can read and says that it cannot save.

### What it does not protect against

- **Whoever serves the app.** A page changed by the host could read the passphrase or the unlocked chats. The app's note says so. For an operator this is the main point of this list.
- **An unlocked page.** Once unlocked, chats are plaintext in the memory of the page. The browser, extensions with access to the page, and anything that can read the process's memory can see them.
- **Guessing a weak passphrase** from a copy of the browser's files. Key derivation slows each guess; it cannot save a short passphrase.
- **Metadata.** The number and times of records, their sizes (rounded to 1 KB), the ids of chats and documents, and which models are downloaded stay visible.
- **Leftover bytes.** The records of a chat that was deleted, until the log is compacted (above). Plaintext written before the vault was turned on, or before an unencrypted copy was removed, may survive on the storage medium.
- **What is sent to a provider.** A request to a connected provider carries the conversation in plain text (section 2b). The vault protects what is stored, not what is sent.
- **A lost passphrase.** The code has no recovery and no reset. The unlock screen says so, and its "Forgot the passphrase?" path erases the chats, documents, memory and settings kept in this browser, after two explicit steps, and keeps the downloaded models. A passkey is a second way in, not a recovery; if both the passphrase and the passkey are lost, nothing can open the vault. A protected backup (encrypted under its own password) is the safety net.

### The app lock and the lock reminder are separate

- **The app lock** without the vault (`plc.lock.v1`) is a passphrase screen over the app. It hides chats on screen and does not encrypt what the browser stores. The app says in Settings that it keeps casual snoopers out and is not strong protection. With the vault on, the lock is the vault's.
- **The lock reminder** (`plc.lockSplash.v1`) is a short screen with an open padlock that is shown at start when no passcode is set. It has a button to add a passcode and can be turned off. It stores one flag and protects nothing.

## 4. What the server and the operator tools log or contact

This section is about the Node.js programs that ship beside the app in a release: `serve.mjs`, `plc.mjs`, `operator.mjs`, `overlay.mjs`, `fetch-models.mjs`, `headers.mjs` and `zip.mjs`. In a clone of the repository they are in `scripts/`. They are not the app and are not loaded by it.

### The server (`scripts/serve.mjs`)

- **It logs nothing about requests.** No address, time, header, agent or count is written anywhere. It answers `GET` and `HEAD` from files on disk and refuses other methods.
- **What it does print.** One line at start (`Serving <folder> at http://<host>:<port>`; for an operator folder, also `Live release: <release>` first). When it is started without `--root` on a host other than the local computer, it adds a warning that the copy is reachable from the network and needs https for other devices; with `--root` that warning is not printed. For an operator folder it also writes a line to standard error when a file of the operator's (`config/app-config.json`, `config/site.json`) is changed to something it cannot use. Those lines name files, never requests.
- **It makes no outgoing connection.** It listens (on `127.0.0.1` unless told otherwise) and reads files. It sets no cookie. It sends the headers that the build declared in `_headers`.

### The operator tools

- **Upgrade, rollback, check and prune** read and write local files inside the operator folder, and upgrade reads the zip or unpacked release it is given. Without `--online` none of them opens a network connection. They keep no log; what they leave behind is the operator folder itself (`current.json`, the release folders, the launcher).
- **`--check --online`** is the only request about releases. It sends one GET to `https://api.github.com/repos/johnbenac/privatelocalchat/releases/latest`, the public release record of the project's repository, with the user agent `private-local-chat-check` and a 15 second limit. It reads the version name from the answer and prints whether a newer release exists. It runs only when asked, never by itself and never from the app. GitHub sees the address and time of the request, as any web host does.
- **`fetch-models.mjs`** contacts only the model source it is told to use: `--from`, else the first source of `config/app-config.json` under `--root`, else the source written into the shipped page. The address must be https (http only for `localhost` or `127.0.0.1`). It refuses redirects, sends no credentials, and sends the user agent `fetch-models` and, to continue a part-finished file, a `Range` header. Nothing else identifies the person or the copy. It writes each download to a file with the ending `.part` and moves it into place only when its size and SHA-256 match `models.json`. A download that ends with other bytes is deleted and nothing is put in place. A download that stops early keeps its `.part` file so that the next run continues it (with a `Range` header). A file already in place whose size is right is left alone without a hash check, unless `--deep` is given. It cannot fetch the matching model's files, because `models.json` lists none for it.
- **`plc.mjs`** only starts the `serve.mjs` of the live release on the same computer.

Nothing in these programs reports anything to the project.

What the operator's own web server, proxy or host logs when it serves a copy is theirs to say; see section 5.

## 5. What you decide yourself

These are the decisions the code cannot make for whoever runs a copy. Each one belongs in the notice you write for the people who use your copy. This document gives facts about the code. It is not legal advice, and following it does not make a copy comply with any law.

1. **What your web server, proxy and host log, and for how long.** The code gives them requests to log: every page load, the app's files, `/sw.js`, `/version.json` about every 5 minutes for each open copy (section 2a), update checks (section 2e), and the model downloads if your host is the model source. Say what you record (addresses, times, browser names), who can read it, and how long you keep it. A settings link made by an older version has its settings, and possibly a key, in the query string, which reaches your log (section 2g). So does a link made with "Copy link with current title/system/prompt", whose query string holds a chat title, a system prompt and unsent message text (section 2j).
2. **Which model source you use, and who runs it.** The shipped default is the project's content delivery network. If you keep it, the first model download shows the notice, and that host sees that downloads are requested. If you set your own source (`config/app-config.json`, `docs/APP-CONFIG.md`), you are that host to your users: you decide what it logs, and you must serve the right bytes. The app checks model and voice files against pinned hashes whatever the source. It does not check the matching model's files (section 2d); and `fetch-models.mjs` cannot fetch them, so a source you run from your own disk must be given that set by hand.
3. **Any analytics, counting or other script you add.** The app has none. If you add a count at your edge or a script in a page of yours, say so. The assistant says that your host "counts page loads without cookies" only when the `site` block of your `config/site.json` sets `countsPageLoads` to true. Set it only if that is true, and take it out when it stops being true.
4. **Where your privacy notice lives and how it is linked.** A copy with no privacy page draws no link to one. Put your page at `pages/privacy/index.html` in the operator folder and name it under `pages` in `config/site.json` (`docs/RUN-IT.md`, `docs/SITE-LINKS.md`). Behind another web server, build the copy with your own site manifest instead. The same file names the help, about and updates pages.
5. **Who people contact.** The shipped Help page (`run-kit/pages/help/index.html`) and the Settings screen send people to the project's public GitHub issues, not to you. Say who to contact for your copy, and replace the Help and About pages if you want them to say it.
6. **How you tell people about updates.** On a copy whose manifest names no site, Settings tells a person that the copy is updated by whoever hosts it; every copy shows a notice when a newer build is on your host. When you upgrade, whether you keep an updates page and what it says are yours to decide.
7. **Whether you offer connected providers, and what you say about them.** The provider list is part of the app, and the configuration files in `docs/RUN-IT.md` do not change it. Anything a person sends to a provider goes under that provider's terms (section 2b). Say what your copy offers, and that you are not the provider.
8. **What you say about voice.** Dictation, voice calls and the browser's own voices use the browser's speech services, and in some browsers those are run by the browser maker (section 2c). The app does not record or store audio.
9. **Whether your copy is served over https.** On any address other than the local computer, browsers enable the features the app needs only over https (`docs/RUN-IT.md`). Without it, the app's files and the requests in section 2 that go to your host are also readable on the way.

## 6. Where each statement comes from

Each row gives a statement of sections 1 to 4 in a few words, the file whose code makes it true, and a name or a short piece of text that appears in that file. `tests/data-handling-references.test.mjs` checks that every file written in backticks in this document exists, and that every file and symbol in this table exists and is found in the file. It checks that the place is there, not that the sentence is still true of it: when you change the code in one of these places, read the row.

Statements that something does not happen (no cookie, no beacon, no WebSocket, no script from another address, no analytics, no request other than the ones listed) cannot be tied to a name in a file. They were checked by searching the source for `document.cookie`, `sendBeacon`, `WebSocket`, `XMLHttpRequest`, `EventSource` and for script and style references to other addresses, and for every call of `fetch`. `scripts/network-inventory.mjs` fails when a host or a path fetched from the app's own origin appears that `docs/evidence/split/network-origins.json` does not list, which catches a new address but not a new use of a listed one.

The app's own statements about data are not in this document. They are listed in a register, `docs/evidence/data-statements.json`: the assistant's `privacy.cloud`, `privacy.storage`, `privacy.provider` and `privacy.account` answers, the notes in Settings about storage and the vault, the note on the unlock screen, and the model-source notice. A test finds a new assistant answer by its id and fails until it is registered. It cannot find a new free-text note written elsewhere, so for those the register is kept by hand. This document and the register have to be read together whenever either changes.

| Statement | File | Symbol or text |
| --- | --- | --- |
| Saved chats are one list in local storage, written whole | `chat/core/thread-state.mjs` | `THREAD_KEY` |
| A temporary chat is never written to the saved list of chats | `chat/core/thread-state.mjs` | `!t.temporary` |
| The text typed in a temporary chat is saved in plc.drafts.v1 like any draft | `index.html` | `DRAFTS_KEY` |
| A draft is removed only when the message box of that chat is emptied | `index.html` | `delete drafts[threadId]` |
| The id of the open chat, a temporary one too, is written to storage | `chat/core/thread-state.mjs` | `ACTIVE_THREAD_KEY, id` |
| A temporary chat's files are kept in memory only | `chat/documents/doc-store.mjs` | `memory.set(doc.id, doc)` |
| Memory is not used in a temporary chat | `chat/assistant/assistant.mjs` | `!thread.temporary` |
| The chat history file leaves out temporary chats and nothing else, so Trash is included | `chat/history/history-io.mjs` | `!t.temporary` |
| A backup leaves out temporary chats and nothing else, so Trash is included | `chat/transfer/backups.mjs` | `!t.temporary` |
| Deleting a chat moves it to Trash by setting a time | `chat/list/conversation-list.mjs` | `thread.deletedAt = Date.now()` |
| Only Delete permanently removes a chat from the list | `chat/list/conversation-list.mjs` | `deleteForever` |
| A chat stays in Trash for 30 days | `chat/threads.mjs` | `TRASH_DAYS = 30` |
| Chats past 30 days in Trash are dropped when the chats are loaded | `chat/core/thread-state.mjs` | `purgeExpired` |
| Unsent text is held in session storage across an update reload | `local-models.js` | `plc.draft` |
| Documents are kept in the IndexedDB database plc-docs | `chat/documents/doc-store.mjs` | `plc-docs` |
| A document keeps its extracted text and passages, not the original file | `chat/documents/documents.mjs` | `buildDocument` |
| Pictures can only be attached with a connected provider | `chat/documents/documents-ui.mjs` | `Pictures can only go to an API provider` |
| Provider settings are written to session storage | `chat/provider/provider-settings.mjs` | `writeJson(appSession, CONFIG_KEY, config)` |
| API keys are kept per exact destination | `chat/provider/endpoint-tokens.mjs` | `canonicalize` |
| A new endpoint without a saved key offers to copy the current key to it | `chat/provider/provider-settings.mjs` | `Copy your API key?` |
| The key is copied and saved for the new endpoint only if the person agrees | `chat/provider/provider-settings.mjs` | `endpointForToken: nextEndpoint` |
| With the vault on, vaulted session keys are not written to session storage | `chat/vault/vault-store.mjs` | `if (!vaulted(key)) return real.setItem(key, value);` |
| With Remember my API keys off, the endpoint keys are held in memory only | `chat/vault/vault-store.mjs` | `memoryOnly.add("chatEndpointTokens")` |
| The copy button of the key field writes the key to the clipboard | `chat/provider/provider-settings.mjs` | `Token copied to clipboard` |
| The key field turns spell-check off | `index.html` | `spellcheck="false"` |
| The transfer password boxes turn spell-check off | `chat/transfer/transfer-ui.mjs` | `input.spellcheck = false` |
| The key of the endpoint in use is also in the stored settings, blanked when keys are not remembered | `chat/vault/vault-store.mjs` | `withoutToken` |
| Keys are remembered by default; off means memory only | `chat/vault/vault-store.mjs` | `let rememberKeys = true` |
| The vault setting is named Remember my API keys | `chat/lock/lock.mjs` | `Remember my API keys` |
| A key travels in a transfer only if the person includes it | `chat/transfer/settings-transfer.mjs` | `includeToken` |
| A received key is saved like a typed one | `chat/transfer/transfer-ui.mjs` | `app.tokens.set` |
| The default model is kept in Cache Storage | `runtime/providers/catalog.mjs` | `webllm/model` |
| The smaller models are kept in OPFS, with Cache Storage as the fallback | `runtime/providers/adapters/wllama.mjs` | `CACHE_API_NAME` |
| Voice files are kept in OPFS | `chat/voice/voice-engine.mjs` | `getDirectory` |
| The matching model's files are kept in Cache Storage | `chat/embedding/embedding-saved.mjs` | `embeddingSaved` |
| The matching model's vectors are kept in memory only | `chat/shell/hybrid-search.mjs` | `kept in memory only` |
| The offline copy is one cache per build; older ones are deleted | `scripts/service-worker.js` | `plc-shell-` |
| The app asks the browser to keep the models when the person asks | `runtime/providers/model-host.mjs` | `requestPersist` |
| Turning the vault on asks the browser to keep the data | `chat/vault/vault-control.mjs` | `persist` |
| The time of the last export is kept for the backup reminder | `chat/history/history-io.mjs` | `lastExportAt` |
| The chat history file is readable and holds no credentials | `chat/transfer/transfer-ui.mjs` | `None. The file is readable.` |
| A protected backup is encrypted under the person's password | `chat/transfer/transfer-glue.mjs` | `createProtectedBackup` |
| A backup holds chats, folders, memory, presets and preferences, not provider settings | `chat/transfer/backups.mjs` | `buildBackup` |
| Settings says that browsers can clear site data | `chat/storage/storage-ui.mjs` | `Browsers can clear site data` |
| An update deletes only the app's saved copy | `index.html` | `clearSavedCopy` |
| The assistant says each browser and device keeps its own data | `chat/roberta/ivr-content.mjs` | `Each browser and each device keeps its own` |
| On-device chat runs in a worker on the device | `chat/core/sender.mjs` | `window.localModels.generate` |
| The connection check asks the copy's own host for /version.json | `chat/connection/connection-glue.mjs` | `?probe=` |
| The connection check repeats every 5 minutes | `chat/connection/connection-glue.mjs` | `300000` |
| The matching model is not downloaded when data saver is on | `chat/embedding/embedder.mjs` | `SAVE_DATA_REASON` |
| The matching model embeds on the device and sends nothing | `chat/embedding/embedder.mjs` | `It generates nothing and sends nothing` |
| The mode is changed by the person, from a saved choice or a saved endpoint | `local-models.js` | `existingApi` |
| Choosing a provider in the model pages is a button | `chat/shell/models-page.mjs` | `setMode("api")` |
| A request needs an endpoint and a model; there is no fallback to a provider | `chat/core/sender.mjs` | `Endpoint is not configured.` |
| A reply request is a POST to the provider with the conversation | `chat/provider/api-formats.mjs` | `buildApiRequest` |
| The key goes in the provider's header | `chat/provider/api-formats.mjs` | `x-api-key` |
| Azure sends the key in the api-key header | `chat/provider/api-formats.mjs` | `headers["api-key"]` |
| The Anthropic format adds the browser-access header | `chat/provider/api-formats.mjs` | `anthropic-dangerous-direct-browser-access` |
| Standing preferences and memory are added to the instructions | `chat/assistant/assistant.mjs` | `standing preferences` |
| Memory is limited to 40 items | `chat/assistant/assistant.mjs` | `lines.length >= 40` |
| The folder's instructions are added | `chat/list/conversation-list.mjs` | `selectedFolderInstructions` |
| A summary stands in for the older part of a chat | `conversation-messages.mjs` | `Summary of the earlier part` |
| Summarize earlier messages is a button and sends the earlier messages through the same request code | `chat/context/context-ui.mjs` | `summaryPrompt(summary, plan.pieces[i])` |
| The summary request carries the earlier messages in pieces and the summary so far | `chat/context.mjs` | `Summary so far:` |
| Messages left out of context are not sent | `chat/threads.mjs` | `!m.excluded` |
| Attached files and library documents are sent as text or passages | `chat/documents/documents-ui.mjs` | `planContext` |
| The library of the chat's folder is included | `chat/documents/documents-ui.mjs` | `libraryFor` |
| Pictures are sent as image data | `chat/documents/documents-ui.mjs` | `image_url` |
| The results of exact tools are sent with the message | `conversation-messages.mjs` | `Exact result computed by the app` |
| A voice call adds a style instruction | `chat/call/call.mjs` | `VOICE_STYLE` |
| The Responses format asks the provider not to keep the request | `chat/provider/api-formats.mjs` | `store: false` |
| A provider that rejects streaming gets the request again without it | `chat/core/sender.mjs` | `response.status === 422` |
| The model list is requested only in provider mode | `chat/provider/provider-settings.mjs` | `window.localModels?.mode !== "api"` |
| The model list is requested 1.6 seconds after typing stops | `chat/provider/provider-settings.mjs` | `1600` |
| The model list is requested at start-up when there is an endpoint and no stored list | `index.html` | `!provider.models.length && provider.config.endpoint` |
| A model list that arrived is stored, so a failed request leaves none | `chat/provider/provider-settings.mjs` | `storeModels(ids)` |
| Local servers are offered in the provider list | `chat/provider/endpoint-options.mjs` | `http://localhost:11434/v1` |
| Copy link puts the title, system prompt and message text in the query string | `chat/core/thread-state.mjs` | `params.set('prompt', prompt)` |
| Copy link is a menu entry of a chat | `chat/list/conversation-list.mjs` | `Copy link with current title/system/prompt` |
| Opening such a link starts a chat from the query values | `chat/transfer/transfer-glue.mjs` | `parseUrlParams` |
| Links in a model's replies open in a new tab without a referrer | `chat/markdown.mjs` | `noopener noreferrer nofollow` |
| Images in a model's replies are not fetched | `chat/markdown.mjs` | `never fetched` |
| Dictation uses the browser's speech recognition | `chat/voice/speech.mjs` | `startDictation` |
| A voice call listens with the same dictation | `chat/call/call.mjs` | `speechMod.startDictation` |
| The app does not record audio | `chat/voice/voice-recorder.mjs` | `the AUDIO is never recorded or stored` |
| The microphone is used only for a permission test | `chat/voice/speech.mjs` | `probeMicrophone` |
| Reading aloud lists on-device voices first and may use any browser voice | `chat/voice/speech.mjs` | `localService` |
| Voice files are checked against a pinned size and SHA-256 | `chat/voice/voice-engine.mjs` | `hash-mismatch` |
| Voice files come from the configured model source | `chat/voice/voice-manifest.mjs` | `appConfig().modelRoot()` |
| Model files come from the first configured source | `runtime/config/app-config.mjs` | `sources[0]` |
| The shipped default source is the project's content delivery network | `app-config.json` | `assets.privatelocal.chat` |
| The source notice is shown once, on the shipped source, on a copy with no site | `chat/models/source-notice.mjs` | `noticeApplies` |
| The source notice says the host sees that a download is requested | `chat/models/source-notice.mjs` | `sees that a download is requested` |
| The notice comes before a model install | `local-models.js` | `beforeInstall` |
| Settings says a custom source is set by whoever runs the copy | `chat/shell/models-page.mjs` | `set by whoever runs this copy` |
| Downloaded model files are refused on a size or SHA-256 mismatch (WebLLM) | `runtime/providers/adapters/webllm.mjs` | `checksum mismatch` |
| Downloaded model files are refused on a size or SHA-256 mismatch (wllama) | `runtime/providers/adapters/wllama.mjs` | `checksum mismatch` |
| Every model install checks hashes | `runtime/providers/model-host.mjs` | `verifyHash: true` |
| The matching model's folder name is content-addressed and no hash is pinned | `chat/embedding/embedding-config.mjs` | `EMBEDDING_ASSET_VERSION` |
| The matching model's files come from the configured source | `chat/vendor/embedding/worker.js` | `remotePathTemplate` |
| The fetch tool has no file list for the matching model | `scripts/models-manifest.mjs` | `embedding: []` |
| The page asks for /version.json without a cache when it opens | `index.html` | `/version.json?check=` |
| The page checks again after 5 minutes away | `index.html` | `300000` |
| A newly opened page with an old saved copy clears it and reloads once | `index.html` | `updateNow` |
| Otherwise a new build is offered with a Reload button | `index.html` | `A new version of Private Local Chat is ready` |
| Unsent text is kept across the reload | `index.html` | `plcUpdateGuard` |
| A voice that fails to start asks whether the build is old | `chat/voice/voice-choice.mjs` | `outdated` |
| The page registers the service worker | `local-models.js` | `serviceWorker.register` |
| The service worker never answers /releases/index.json from its cache | `scripts/service-worker.js` | `/releases/index.json` |
| The service worker does not handle requests to other origins | `scripts/service-worker.js` | `url.origin!==location.origin` |
| The assistant says the app has no analytics or tracking scripts | `chat/roberta/ivr-content.mjs` | `no analytics or tracking scripts` |
| The assistant says there is no account | `chat/roberta/ivr-content.mjs` | `no Private Local Chat account` |
| The host-counts-page-loads sentence comes from the site manifest | `chat/site/site-links.mjs` | `countsPageLoads` |
| The settings transfer carries only endpoint, model and theme | `chat/transfer/settings-transfer.mjs` | `pickSettings` |
| A transferred key is encrypted with PBKDF2 and AES-GCM | `chat/transfer/settings-transfer.mjs` | `PBKDF2_ITERATIONS` |
| Any transfer password is accepted | `chat/transfer/transfer-ui.mjs` | `short or blank password` |
| A transfer link opens the copy that made it | `chat/transfer/settings-transfer.mjs` | `transferOrigin` |
| A key is attached only to the destination it was made for | `chat/transfer/settings-transfer.mjs` | `tokenBelongsTo` |
| Older query-string links are still read, never made | `chat/transfer/settings-transfer.mjs` | `readLegacyQuery` |
| The link is taken out of the address bar after reading | `chat/transfer/transfer-glue.mjs` | `clearTransferFromAddress` |
| Share entries appear only with a site identity | `chat/shell/shell.mjs` | `siteLinks().site` |
| The shared content is fixed | `chat/transfer/product-share.mjs` | `shareData` |
| A copy with no site identity has nothing to share | `chat/transfer/transfer-ui.mjs` | `names no public address` |
| The cookie fallback of a bundled library cannot run in the model worker | `runtime/providers/vendor/webllm/web-llm-0.2.86.js` | `Use session cookie as fallback` |
| The model runtime runs in a worker | `runtime/providers/host.worker.mjs` | `lazyAdapter` |
| The build declares Cross-Origin-Embedder-Policy | `scripts/headers.mjs` | `Cross-Origin-Embedder-Policy` |
| The build declares the referrer policy | `scripts/headers.mjs` | `strict-origin-when-cross-origin` |
| Development diagnostics are built only for the development site | `scripts/targets.mjs` | `devTooling` |
| Development diagnostics are cut out of other builds | `scripts/build.mjs` | `DEV_DIAGNOSTICS_START` |
| The vault is off unless ticked | `chat/lock/lock.mjs` | `encBox.checked = false` |
| The vault needs IndexedDB and WebCrypto | `chat/vault/vault-control.mjs` | `get supported` |
| The vault covers the user, setting and transient classes | `chat/vault/key-classes.mjs` | `VAULTED_CLASSES` |
| The vault seals with AES-256-GCM | `chat/vault/vault.mjs` | `AES-256-GCM` |
| Records are padded to 1 KB | `chat/vault/vault.mjs` | `PAD_BUCKET` |
| A chat removed from the saved list is deleted from the vault | `chat/vault/vault-store.mjs` | `session.delThread(id)` |
| Deleting a chat for good appends a record that destroys its key | `chat/vault/vault.mjs` | `key.destroy` |
| The vault can rewrite its log without old records, and the app does not call it | `chat/vault/vault.mjs` | `compact:` |
| The vault marker also holds lock-on-hide | `chat/vault/vault-control.mjs` | `writeMarker({ lockOnHide` |
| The unencrypted copy stays until removed | `chat/vault/vault-control.mjs` | `removePlaintext` |
| The app offers to remove the unencrypted copy | `chat/lock/lock.mjs` | `Remove the unencrypted copy?` |
| The vault header and key ids are readable | `chat/vault/vault.mjs` | `readable and not secret` |
| Face ID or a screen lock needs the PRF extension and is refused without it | `chat/vault/passkey.mjs` | `no-prf` |
| A passkey belongs to one address | `chat/vault/passkey.mjs` | `rpId` |
| The person can lock after a time away | `chat/lock/lock.mjs` | `After 5 minutes away` |
| The person can lock on leaving the tab | `chat/vault/vault-control.mjs` | `setLockOnHide` |
| Lock now forgets the key and reloads | `chat/vault/vault-control.mjs` | `lockNow` |
| Only one tab writes to the vault | `chat/vault/vault-store.mjs` | `claimWriter` |
| The app states what the vault does not protect against | `chat/lock/lock.mjs` | `ENCRYPT_NOTE` |
| A forgotten passphrase cannot be recovered | `chat/vault/unlock-screen.mjs` | `There is no way to recover a forgotten passphrase` |
| The erase path keeps downloaded models | `chat/vault/unlock-screen.mjs` | `Downloaded models are kept` |
| The app lock without the vault is a screen lock only | `chat/lock/lock.mjs` | `it does not encrypt what the browser stores` |
| The lock reminder is one flag | `chat/lock/lock.mjs` | `SPLASH_KEY` |
| The server logs nothing about requests | `scripts/serve.mjs` | `It logs nothing about requests` |
| The server answers GET and HEAD only | `scripts/serve.mjs` | `Method not allowed` |
| The server prints a start line | `scripts/serve.mjs` | `Serving ${shown}` |
| A reachable-from-the-network warning is printed without --root | `scripts/serve.mjs` | `This copy is reachable from the network` |
| An operator folder prints the live release | `scripts/operator.mjs` | `Live release:` |
| Operator-file problems go to standard error | `scripts/overlay.mjs` | `process.stderr.write` |
| Only --check --online touches the network | `scripts/operator.mjs` | `nothing else here touches the network` |
| The online check asks the project's public release record | `scripts/operator.mjs` | `RELEASE_LIST_URL` |
| The online check names itself in the user agent | `scripts/operator.mjs` | `private-local-chat-check` |
| The online check reads only the version name | `scripts/operator.mjs` | `tag_name` |
| The fetch tool refuses redirects and sends no credentials | `scripts/fetch-models.mjs` | `redirect: 'error'` |
| The fetch tool names itself in the user agent | `scripts/fetch-models.mjs` | `'User-Agent': 'fetch-models'` |
| The fetch tool keeps a file only when size and SHA-256 match | `scripts/fetch-models.mjs` | `refused: wrong bytes` |
| The fetch tool downloads to a .part file, deleted when its bytes are wrong | `scripts/fetch-models.mjs` | `file + '.part'` |
| The fetch tool contacts one source | `scripts/fetch-models.mjs` | `resolveSource` |
| The launcher only starts the live release's server | `scripts/plc.mjs` | `spawn` |
