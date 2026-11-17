# Encryption at rest: everything the person keeps is sealed, saved as it happens, and tested that way

This is a **living plan**, the same shape as `docs/OFFLINE-PLAN.md` and `docs/RESTRUCTURE-PLAN.md`: where we are, where we are going, the order, and a log that is updated as we learn. It does not have to be right at the start; each phase ends by correcting this page. `docs/ARCHITECTURE.md` stays the description of how the app is put together now; anything this plan adds (a folder, an event, a window global) goes there too.

Proposed 2026-11-04; made a living plan the same day. **Status: built and tested through Phase 5.3 (2026-11-04): the vault, the migration, the unlock screen, two tabs, auto-lock, failure messages and the passkey flow all work and are covered by `npm test` and the browser tests. The owner ran the real checks on the iPhone 15 Pro (Face ID) and the Galaxy S8+ (screen-lock passkey) and both worked, and decided encryption is never the default (6.1). The plan is complete.** The decisions marked **(owner)** below were answered with the recommendations under "Open questions".

## Goal

Everything the person creates or chooses is stored encrypted on the device and readable only after they enter their passphrase. Every prompt,
every reply (while it streams) and every settings change is sealed and written as soon as the app has it, so closing the tab, a crash or the
phone killing the page loses at most about a second of a streaming reply and nothing else.

**The owner wants to unlock with their face (Face ID on iPhone, Touch ID on Mac).** That is a goal, not an optional extra: a passkey with the WebAuthn PRF extension releases a secret from the device's secure hardware after Face ID, and that secret wraps the vault key (Phase 5). The passphrase stays as the fallback and the recovery. **Nobody's physical face is needed until the very last step**: everything before it is built and proven with a virtual authenticator and automated tests; the single real-Face-ID check on the owner's phone is the final step of Phase 5 (5.4).

Not encrypted (by design): the app itself (HTML/JS/CSS, service worker cache), model weights and runtimes in OPFS, and the few bytes the
lock screen needs before unlock (see "Readable before unlock").

## What this does not protect against

Say these plainly in the UI and in `docs/`; they are the honest limits.

1. **Whoever serves the app.** It is a web app: a changed `index.html` could read the passphrase or the decrypted chats. (Owner already knows.)
2. **The running browser.** Once unlocked, chats are plaintext in page memory; the browser, extensions with page access, and anything that can
   read the process's memory or swap can see them.
3. **Offline guessing of a weak passphrase.** With a copy of the browser's files, an attacker can try passphrases as fast as their hardware
   allows. PBKDF2 slows each guess; it cannot save a short passphrase. The Face ID / Touch ID passkey (Phase 5) helps here: the secret comes from the device's secure hardware, so copied files alone are not enough.
4. **Metadata.** The number, sizes and write times of records show roughly how much and when the person chats. Which models are downloaded is
   visible from OPFS. Padding (Phase 4) reduces the size signal; nothing hides the timing.
5. **Flash remanence.** Deleted or overwritten bytes may stay physically on flash. Per-chat keys (crypto-shredding) are the answer for data
   written after this ships; plaintext written *before* migration may survive on the device regardless.
6. **A forgotten passphrase.** There is no recovery and there must not be one. Encrypted backups (`chat/transfer/backups.mjs`) are the safety net.

## Principles

- **One commit per piece, pushed to `main` and `dev`; tick and date the step here; keep `ARCHITECTURE.md` true.** `tests/encryption-plan.test.mjs` protects this page the way `tests/architecture-doc.test.mjs` protects the architecture page (see "Automation").
- **Measure before changing.** Each phase starts with the test that shows the problem or the property, then the change. The pure logic (keys, log, reducer) has no DOM and is tested in `node --test`; the app is tested the way a person uses it.
- **Nothing is trusted that was not checked by reading it back.** Migration verifies by decrypting and comparing before it deletes anything. The first release never deletes the plaintext copy on its own (see the log of phase 2 when it is written).
- **An unencrypted mode keeps working** until the owner decides otherwise: the formats `CLAUDE.md` says to preserve (`chatThreads`, `chatConfig`, `chatModels`) are still what the app reads and writes when the vault is off.
- **Say the limits plainly.** The "What this does not protect against" list is shown in the app and kept true; the app never says "secure" without saying what it does not cover.
- **Device safety (from `docs/OFFLINE-PLAN.md`, unchanged):** do not clear user data on a device; read only the tab this work opened; one automation session per phone; never commit device identifiers or credentials. Test passphrases and test chats are synthetic.
- **No person is needed until the end.** Phases 0 to 5.3 are proven by tests and virtual authenticators. The owner's face is asked for once, in step 5.4, after everything else is green. Do not ask for a face (or a phone in hand) earlier.
- **Nothing in production that is only for testing.** Test hooks stay inside the `DEV_DIAGNOSTICS` markers or `dev-tools/`.

## Hardware targets (what is actually tested on)

| Target | Used for | Notes |
|---|---|---|
| This machine, Chromium | every push: unit tests, browser tests, the virtual authenticator | the only target that runs without a person |
| The Veriton (Linux, DGX Spark class) | unlock timing and a real-browser run of the vault tests on a second Linux machine | browser reached as in the Vulkan/GPU work; it may be busy with other jobs, so check before using it and never stop what it is running |
| Mac Safari (macOS 26.7) | unlock timing, passkey support, Touch ID optional in 5.4 | reached over SSH; driven in a window of its own |
| iPhone 15 Pro (iOS) | unlock timing, passkey support, and the one real Face ID check (5.4) | **the only iOS device in this plan**; the iPhone 11 Pro is out until the owner says it is back |
| Galaxy S8+ (Android) | unlock timing on the slowest phone (decides the iteration count), passkey support with the phone's own screen lock | reached as in the tiny-models work |

Not targets: Windows, other Linux desktops, other iPhones. The iPhone 11 Pro returns to the list only when the owner says so.

## What is stored today (survey)

The machine-checked version of this table is `docs/evidence/encryption/storage-inventory.json` (every key, its class and its owner); this prose table is the readable summary. The inventory found things the first survey missed: pinned items (`plc.shell.pins.v1`), the chosen on-device model (`plc.models.v1`), the connect-or-local mode (`plc.inferenceMode.v1`), the pending download (`plc.downloadIntent.v1`), and that **`plc.memory.v1` was written by two different features** (see the log, 2026-11-04).

| Where | Key / store | Contents | Owner |
|---|---|---|---|
| localStorage | `chatThreads` | every saved chat (titles, system prompts, messages), whole list rewritten on each save | `chat/core/thread-state.mjs` |
| localStorage | `plc.activeThread.v1` | id of the open chat | `index.html` |
| localStorage | `plc.drafts.v1` | unsent composer text per chat | `index.html` |
| localStorage | `plc.prefs.v1` | preferences (theme etc.) | `index.html` |
| localStorage | `plc.folders.v1`, `plc.presets.v1` | folders, prompt presets | `chat/shell/registry.mjs` area |
| localStorage | `plc.memory.v1` | "One model at a time" switch | `runtime/memory-manager.mjs` |
| localStorage | `plc.voice.v2` | chosen voice and voice settings | `chat/voice/` |
| localStorage | `plc.shell.collapsed`, `plc.offlineHint.v1`, `plc.lockSplash.v1`, `plc.speechInputUnusable` | UI state | shell, connection, lock |
| localStorage | `plc.lock.v1` | lock verifier (PBKDF2 → AES-GCM of a constant) and auto-lock minutes | `chat/lock/lock.mjs`, `chat/crypto.mjs` |
| sessionStorage | `chatConfig`, `chatModels`, `chatEndpointTokens` | provider config, model list, **API keys** | `chat/provider/provider-settings.mjs` |
| sessionStorage | `plc.draft`, `plc.pendingToken.v1`, `promoDismissed` | transient | various |
| IndexedDB | `plc-docs` / `docs` | attached and library documents | `chat/documents/doc-store.mjs` |
| memory only | search index | keyword + embedding index of chats | `chat/shell/hybrid-search.mjs` |
| OPFS / Cache Storage | models, runtimes, app shell | not user data | `runtime/`, `scripts/service-worker.js` |

Already in place: `chat/crypto.mjs` (WebCrypto PBKDF2-SHA-256, 600 000 iterations → AES-256-GCM, authenticated metadata) used by backups,
settings transfer and the lock verifier. The lock (`chat/lock/lock.mjs`) is a screen lock only and says so.

Every new key added to the app must be classified in this table (user data → vault; UI-before-unlock → plain). A test enforces it (Phase 3).

## Design

### Keys

- **Passphrase key (KEK):** PBKDF2-SHA-256 over the NFKC passphrase, random 16-byte salt, iterations stored with it (start at 600 000; measure
  on a mid-range phone and keep unlock under ~1 s). Used only to unwrap the vault key.
- **Vault key (DEK):** random AES-256-GCM key, created once. Stored only wrapped (AES-KW or AES-GCM) by the KEK. After unlock it is imported
  as a **non-extractable** `CryptoKey` and held in memory; it is never in storage in the clear. Changing the passphrase re-wraps the DEK
  only; no data is re-encrypted.
- **Per-chat keys:** each chat gets its own random key, stored (wrapped by the DEK) inside the vault's key table. Deleting a chat deletes its
  key, so its old records become unreadable even if their bytes linger (crypto-shredding). Documents get per-document keys the same way.
- **Face ID / Touch ID key (Phase 5, a goal):** a passkey with the WebAuthn PRF extension yields a secret from the device's secure hardware; the DEK can
  be wrapped by it as a second (or required) factor. Stolen files alone are then useless.

The lock verifier in `plc.lock.v1` is replaced by the wrapped DEK: a passphrase is right exactly when the DEK unwraps.

### Storage: an append-only encrypted log in IndexedDB

New database `plc-vault` with object stores:

- `header` (one row, plaintext): `{ format: "plc-vault/1", kdf, iterations, salt, wrappedDek, deviceWrap?, createdAt }`.
- `log` (keyPath `seq`, auto-increment): `{ seq, keyId, iv, data }`. `data` is AES-GCM ciphertext of one event; the AAD is
  `"plc-vault/1|" + seq + "|" + keyId`, so records cannot be moved, swapped between chats or replayed at another position.
- There is no separate snapshots store. Compaction (below) rewrites the live state as fresh records in the same log, so deleting a chat can still destroy the key that sealed it.

Why IndexedDB, not localStorage: WebCrypto is asynchronous and localStorage writes are synchronous (so encrypt-then-store needs async storage
anyway), localStorage is capped around 5 MB, and IndexedDB gives transactions with a completion event.

Event types (plaintext inside the ciphertext, versioned). Built (2026-11-04) at the granularity the app already saves at, a whole chat at a time, not message by message: a write of one chat of a heavy user took under 1 ms in the measurement (`tests/vault-perf.test.mjs`), so the finer events would only add replay work.

```
kv.set {k, v} / kv.del {k}              // every former localStorage / sessionStorage key the inventory calls user, setting or transient (k = "l/" or "s/" + the old key)
thread.put {id, thread} / thread.del {id}   // one chat, sealed with that chat's own key; deleting destroys the key
doc.put {id, doc} / doc.del {id}        // one document, sealed with its own key
key.put {id, raw} / key.destroy {id}    // per-chat and per-document keys, sealed by the vault key
```

The order of the chat list is its own `kv` record, so a reorder does not rewrite any chat. The in-memory state after unlock is the replay of the log; the rest of the app keeps working on that in-memory state exactly as it does now (`chat/vault/vault-store.mjs` serves `appLocal` / `appSession` from it), and only the persistence layer changed. Documents are held in memory while unlocked (a trade made for simplicity; a very large library costs memory).

### Durability: "saved as soon as the app has it"

- Each event is one IndexedDB `readwrite` transaction opened with `{ durability: "strict" }` where supported. The write counts as saved on
  `oncomplete`; the UI does not show anything as saved before that.
- The page already saves the chat when a prompt is sent (before the request goes out) and about every 800 ms while a reply streams (`chat/core/sender.mjs`). Each of those saves is one `thread.put`; a burst of saves of the same key is coalesced to the latest value with one write in flight (`createAppStorage`), so a streaming reply is stored about as often as the page saves it. A page killed mid-reply keeps what was written (`tests/e2e/vault.e2e.mjs`).
- Writes are serialised through one queue per tab, so ordering is the order of events. Encryption happens in the page (`crypto.subtle` is
  fast enough for chat-sized records); no plaintext is ever handed to storage.

### Compaction

`session.compact()` rewrites the live state as fresh records (new sequence numbers, each sealed with its own key) and drops every older record in one adapter call, so it is all or nothing. Superseded saves, deleted chats and destroyed keys disappear. 500 chats and 10,000 messages compact in about half a second in node (`tests/vault-perf.test.mjs`). It is not yet run automatically; a threshold is a later tuning step.

### Two tabs

Only one tab may write: the first holds a Web Lock (`plc-vault-writer`) for as long as it lives; another tab opens the vault **read-only**, keeps its changes on screen only, says once that they are not saved, and is told (over a `BroadcastChannel`, "seq N is new") when the writer stored something or closed. It does not take over by itself: it asks the person to reload, because its copy of the state may be stale. Without Web Locks the vault is still safe: two writers cannot both store the same sequence number, the second is refused as a conflict and reported. (`claimWriter` in `chat/vault/vault-store.mjs`, `tests/vault-store.test.mjs`, `tests/e2e/vault.e2e.mjs`.)

### Lock and unlock

- Unlock: derive KEK → unwrap DEK → read the log → build state → mount the app. Until then the app shows only the lock screen; no user
  data is in memory.
- Lock (button, auto-lock minutes from the existing lock, optionally on hide): drop the DEK reference, clear in-memory state, reload the page
  (the only reliable way to drop everything the page built from the data). The person is warned if a reply is still streaming.
- The current lock feature becomes this: "Lock with a passphrase" now means "encrypt with a passphrase". There is no unencrypted lock.
- **(owner)** Is a passphrase required for everyone, or is the vault opt-in (with plaintext storage as today when off)? Recommendation: opt-in
  first (Phase 1–3), make it the default later; an unencrypted mode must keep working for people who choose it.

### Readable before unlock

Only what the lock screen needs: `header`, the theme (so the lock screen is not a white flash in dark mode) and the lock-screen layout flags.
**(owner)** Accept theme as plaintext, or show a neutral lock screen and encrypt theme too? Recommendation: keep theme plain; it reveals
nothing about the person's chats.

### Search, voice, models

- The search index is built in memory after unlock and never stored. If it is ever cached, it goes into the vault like any other event.
- Voice choice, the memory switch and model choice move into `setting.set`. Before unlock no voice or model is auto-loaded.
- Model files stay in OPFS, unencrypted. Which models are downloaded remains visible (limit 4).

### Backups and transfer

Encrypted backups keep their own format (`plc-encrypted-backup/1`) and their own passphrase prompt; a backup is made from the unlocked
in-memory state. Restore writes events into the vault. Plain (unencrypted) export stays possible but asks for confirmation through
`window.plcDialogs.confirm` and says the file is readable by anyone.

### Migration of existing data

On turning the vault on: read every plaintext key and `plc-docs`, write them as events into a new vault, verify by decrypting and comparing,
then delete the plaintext keys and the `plc-docs` database. Tell the person that copies written before encryption may remain on the device's
flash and that the only way to be sure is to clear the site's data after making an encrypted backup. Turning the vault off is the reverse and
asks for the passphrase and a confirmation.

## Code shape

- `chat/vault/vault.mjs` (pure, tested with `fake-indexeddb` or an in-memory adapter in `node --test`): keys, wrap/unwrap, append, read,
  compaction, events → state reducer.
- `chat/vault/vault-store.mjs`: the one storage interface the rest of the app uses (`get/set` for settings, thread and document operations).
  `thread-state.mjs`, `doc-store.mjs`, provider settings, voice, prefs and the memory switch call this instead of `localStorage`,
  `sessionStorage` or `indexedDB` directly. When the vault is off it is backed by today's plaintext keys, so the formats `CLAUDE.md` says to
  preserve keep working.
- `chat/lock/lock.mjs` becomes the vault's unlock/lock UI.
- New events in `chat/events.mjs` (`vault:unlocked`, `vault:locked`, `vault:write-failed`); update `docs/ARCHITECTURE.md` and
  `docs/RESTRUCTURE-PLAN.md` as the architecture test requires.

## Phases, in order

Each phase: write the failing test first, change, run `npm test` and `npm run e2e -- <area>`, tick and date here, update `ARCHITECTURE.md` if needed, commit, push both branches.

### Phase 0: learn what is true (no vault yet)

- [x] **0.1 Storage inventory and its guard** (2026-11-04, `docs/evidence/encryption/storage-inventory.json`, `tests/storage-inventory.test.mjs`). Every key, database and file that touches browser storage is listed with a class (user / setting / plain / transient / test / device) and an owner. A key the source uses that is not listed, a file that starts using storage, a listed key that is gone, a key named by a file that is not its owner, and a test-only key outside the page's markers all fail the test. This is the "every new key is classified" check that was planned for phase 3; it exists now so nothing new is added unclassified while the vault is built.
- [x] **0.2 One key, one owner** (2026-11-04, `tests/memory-manager.test.mjs`, `runtime/memory-manager.mjs`). The inventory showed that the model-memory switch and the assistant's memory items both wrote `plc.memory.v1`, each overwriting the other (the person's memory items could be erased by flipping "One model at a time"). The switch now has its own key, `plc.modelMemory.v1`, and reads the old one once to carry its choice over.
- [x] **0.3 Unlock time on real devices** (2026-11-04, `docs/evidence/encryption/kdf-timing.json`, `scripts/encryption-baseline.mjs`, `scripts/encryption-probe/`). PBKDF2-SHA-256 at 600,000 iterations, the median of five runs with a fresh salt each: **this machine (Chromium) about 100 ms, the Veriton (Firefox 155) 61 ms, Mac Safari 86 ms, Galaxy S8+ (Chrome 131) 831 ms**; at 1,000,000 iterations the S8+ takes 1.4 s. Decision: keep **600,000**, which keeps the slowest phone under a second; the iteration count is stored in the header, so a stronger setting for fast devices needs no format change. The same probe also records what each browser supports (`probe-*.json`). **The iPhone 15 Pro's number was not recorded** (the owner used the phone for 5.4 and did not read the line off the screen; it cannot change the decision, since the Galaxy S8+ is the slowest phone and sets the count). Earlier it was not measured by script because another project's Safari automation session holds that phone's inspector channel, and this plan's device-safety rule is one automation session per phone. Its unlock time is read from the app itself (Settings > Encryption shows "Unlocking with the passphrase took N seconds on this device") during the 5.4 session with the owner.
- [x] **0.4 Baseline sizes** (2026-11-04, `docs/evidence/encryption/baseline-centroid.json`, `scripts/encryption-baseline.mjs`). A heavy user, synthetic: 500 chats and 10,000 messages is **6.4 MB of JSON, more than the 5 MB a browser typically gives localStorage**, and serialising it takes about 16 to 25 ms on every save. So moving the chats into IndexedDB (one record per chat) also removes a limit a heavy user can hit today, not only adds encryption. Compaction thresholds are left to tuning: 1,000 records compact in half a second.
- [x] **0.5 Review this plan** (2026-11-04) with the results of 0.3 and 0.4. What changed: (1) events are per chat, not per message, and there are no snapshots (compaction rewrites the live state), both written into Design above; (2) 600,000 iterations stay; (3) the move to IndexedDB is also the fix for the 5 MB limit; (4) API keys are kept in the vault by default with a switch (question 6); (5) a tab that cannot hold the writer lock is read-only rather than taking over; (6) the page's own start-up check treats a waiting unlock screen as not a failed start. What did not change: the format, the keys, the phases.

### Phase 1: the vault core (pure, no UI)

- [x] **1.1 Keys** (2026-11-04, `chat/vault/vault.mjs`, `tests/vault.test.mjs`). `chat/vault/vault.mjs`: passphrase to KEK, random DEK wrapped by it, per-chat and per-document keys wrapped by the DEK, passphrase change re-wraps only the DEK. Tests: right passphrase unwraps, wrong one fails, NFKC-equivalent passphrases agree, the DEK is imported non-extractable.
- [x] **1.2 The log** (2026-11-04, `tests/vault.test.mjs`, `tests/vault-perf.test.mjs`). Append with AAD `plc-vault/1|seq|keyId`, replay, snapshots, compaction. Tests: a changed byte, a swapped `seq`, a swapped `keyId`, a record moved to another chat, a replayed old record and a truncated log all fail to open or are reported; deleting a chat's key makes its records unreadable while the others still open.
- [x] **1.3 The reducer** (2026-11-04, `tests/vault.test.mjs`, `tests/vault-store.test.mjs`: the chat list comes back exactly as `chatThreads` has it). Events to state (`thread.*`, `message.*`, `doc.*`, `setting.set`). Test: replaying a corpus of synthetic, real-shaped chats gives exactly the state the app holds today (`chatThreads` shape), including partial replies and deletions.
- [x] **1.4 Storage adapter** (2026-11-04, `chat/vault/vault-db.mjs`; the memory twin runs the unit tests, the IndexedDB one runs in `tests/e2e/vault.e2e.mjs`). An IndexedDB adapter and an in-memory one behind one interface, so the same tests run on both; `durability: "strict"` where the browser has it, and a plain fallback that says so.

### Phase 2: chats and documents through the vault (opt-in)

- [x] **2.1 `chat/vault/vault-store.mjs`** (2026-11-04, `tests/vault-store.test.mjs`), the one storage interface; backed by today's plaintext keys when the vault is off, so nothing changes for people who do not turn it on.
- [x] **2.2 `thread-state.mjs` and `doc-store.mjs` use it** (2026-11-04, `chat/core/thread-state.mjs`, `chat/documents/doc-store.mjs`). The prompt is written before it goes to the model or the API; a streaming reply is checkpointed about once a second, on hide and on page hide; a killed page shows "reply interrupted" at the next unlock.
- [x] **2.3 Lock and unlock UI** (2026-11-04, `chat/vault/unlock-screen.mjs`, `chat/vault/vault-control.mjs`, `chat/lock/lock.mjs`) (`chat/lock/lock.mjs` becomes the vault's unlock); the not-locked reminder (`plc.lockSplash.v1`) is reconsidered; `vault:unlocked`, `vault:locked` and `vault:write-failed` join `chat/events.mjs`.
- [x] **2.4 Migration both ways** (2026-11-04, `tests/vault-control.test.mjs`) with read-back verification before any plaintext is removed; the person is told what flash may keep (limit 5).
- [x] **2.5 e2e** (2026-11-04, `tests/e2e/vault.e2e.mjs`). No plaintext at rest (marker scan), kill the page mid-reply, wrong passphrase, migration on and off, backup and restore round trip.

### Phase 3: every setting through the vault

- [x] **3.1 Move each `user` and `setting` key (2026-11-04, `chat/vault/key-classes.mjs`) of the inventory** (provider config and API keys, voice, prefs, folders, presets, drafts, memory, pins, model choice) behind the same interface. Decide first what happens to API keys, which today live only for the tab (open question 6).
- [x] **3.2 Flip the inventory guard** (2026-11-04, `tests/storage-inventory.test.mjs`) (`tests/storage-inventory.test.mjs`) from "classified" to "no `user` or `setting` key is read or written outside the vault interface"; the allow-list is the `plain`, `transient` and `test` classes.
- [x] **3.3 Transient keys** (2026-11-04, `tests/vault-store.test.mjs`) (`plc.draft`, `plc.pendingToken.v1`) never hold plaintext content while the vault is on.

### Phase 4: hardening

- [x] **4.1 Two tabs** (2026-11-04, `tests/vault-store.test.mjs`, `tests/e2e/vault.e2e.mjs`): Web Locks single writer, `BroadcastChannel` for "seq N is new"; the fallback without Web Locks refuses to write and says why.
- [x] **4.2 Record padding** (2026-11-04, `tests/vault.test.mjs`: records round up to 1 KB) and auto-lock (`Lock as soon as I leave this tab or app`, `tests/e2e/vault.e2e.mjs`) (open question 4) and auto-lock on hide (open question 3).
- [x] **4.3 Iteration count** (2026-11-04, `docs/evidence/encryption/kdf-timing.json`: 600,000 kept; the unlock time is shown in Settings so every device can report its own) chosen from 0.3 and measured again on the devices after the vault exists; evidence in `docs/evidence/encryption/`.
- [x] **4.4 Failure honesty** (2026-11-04, `index.html`, `tests/vault-store.test.mjs`: a failed write is reported and the queue goes on; a vault the browser cleared is announced; unreadable records are counted; the browser is asked to keep the storage; locking mid-reply asks first): a full disk, a write that fails, a browser that clears storage; each says what happened and what is safe.

### Phase 5: unlock with Face ID / Touch ID (a passkey with PRF as a second way to wrap the vault key)

The aim is that the person taps "Unlock", looks at the phone, and the vault opens. The passphrase keeps working beside it and stays the only way back if the passkey is lost. Built after the passphrase flow of Phases 1 to 4, because it is a second wrap of the same vault key, not a different vault.

- [x] **5.1 Learn what is true on the devices we have** (2026-11-04, `docs/evidence/encryption/probe-veriton-firefox155.json`, `probe-mac-safari.json`, `probe-galaxy-s8plus-chrome131.json`) (before writing the feature): does `navigator.credentials.create` with the PRF extension work, with the platform authenticator, on Mac Safari, the iPhone 15 Pro, the Galaxy S8+ (Android, its own browser lock) and Chromium on this machine and on the Veriton; does it work in an installed home-screen app as well as in a tab; what happens in a private window. Probe pages only, results in the three probe files and `passkey-galaxy-s8plus.md`. No face is needed to learn *support* where the browser reports it; where a real prompt is unavoidable, it is saved for 5.4 and the step says so. **Results so far:** the Veriton (Firefox 155) and Mac Safari report `extension:prf: true`; Safari also reports a platform passkey authenticator (`passkeyPlatformAuthenticator: true`) but no user-verifying one on that Mac (no Touch ID there), so on that Mac a passkey would rely on iCloud Keychain rather than a fingerprint. The Galaxy S8+ (Chrome 131) reports a user-verifying platform authenticator (`uvpaa: true`, its screen lock) but Chrome 131 has no `getClientCapabilities()`, so PRF there is only learned by trying (5.4 style, on the phone). IndexedDB accepts `durability: "strict"`, Web Locks and `BroadcastChannel` exist on all three. Chromium's virtual authenticator does implement PRF, which is what 5.3 uses. **Closed by the owner on the real phones (2026-11-04, `docs/evidence/encryption/faceid-iphone15pro.md`, `docs/evidence/encryption/passkey-galaxy-s8plus.md`):** Face ID worked on the iPhone 15 Pro and the screen-lock passkey worked on the Galaxy S8+, including unlocking with them.
- [x] **5.2 Pure logic, tested with no hardware** (2026-11-04, `chat/vault/passkey.mjs`, `tests/vault-passkey.test.mjs`). `chat/vault/passkey.mjs`: feature detection, the PRF salt per vault, HKDF of the PRF output to a wrapping key, wrap and unwrap of the vault key, multiple passkeys, removing one, every failure mapped to a plain sentence. Unit tests use a fake authenticator that returns deterministic PRF output.
- [x] **5.3 Browser tests with a virtual authenticator** (2026-11-04, `tests/e2e/vault-passkey.e2e.mjs`; Chromium's virtual authenticator does support PRF). Chromium's virtual platform authenticator (with user verification and PRF switched on) drives the whole flow in `tests/e2e/vault-passkey.e2e.mjs`: add a passkey, lock, unlock with it, remove it, unlock with the passphrase, a browser without PRF falls back with a clear message, a cancelled prompt leaves the vault locked. Safari-specific behaviour that Chromium cannot show is recorded in 5.1 and handled in code. No person is involved.
- [x] **5.4 The one real check: the owner's face, last** (2026-11-04, `docs/evidence/encryption/faceid-iphone15pro.md`: Face ID unlocked the vault on the iPhone 15 Pro; iOS asked for a username to file the saved passphrase under, which the passcode and unlock screens now answer with a fixed hidden name). On the iPhone 15 Pro (and the Mac if wanted), add the passkey, lock, unlock with Face ID, then lock and unlock with the passphrase. Done once, at the end, after everything above is green; the owner is asked for ten minutes then and not before. Evidence in `docs/evidence/encryption/faceid-iphone15pro.md`. **The ten minutes, when the owner is ready** (everything else is already green): on the iPhone 15 Pro open `https://dev.privatelocal.chat`, then Settings > Security > App lock and encryption > Set up; leave "Also encrypt everything" ticked, choose a throw-away passphrase, say yes to removing the unencrypted copy; open the same dialog again and tap "Turn on Face ID / Touch ID" (Safari may ask for Face ID twice: once to make the passkey, once to read the key); tap Lock now; on the unlock screen tap "Unlock with Face ID or Touch ID" and look at the phone; lock again and unlock by typing the passphrase, then open the dialog once more and note "Unlocking with the passphrase took N seconds" (that is the iPhone's 0.3 number). Then "Turn encryption off" to leave the phone as it was. The result, including any Safari wording that surprised us, goes in `docs/evidence/encryption/faceid-iphone15pro.md` and the log. The same ten minutes on the Galaxy S8+ gives its real PRF answer (5.1).

What the interface must say: the passkey is kept by the device's account (Apple passkeys sync through iCloud Keychain, so it is **not** bound to one phone); each site address has its own passkey, so `dev.privatelocal.chat` and `privatelocal.chat` do not share one; a lost passkey is recovered with the passphrase, and a lost passphrase with no passkey is not recoverable. A prompt that only checks the face and releases no key is not encryption and is never offered.

### Phase 6: default on (owner decision: no, opt-in only)

- [x] **6.1 Default-on: decided NO by the owner (2026-11-04).** Encryption is for people who want an extreme threat posture; asking everyone for a passphrase is friction. It stays opt-in: the passcode dialog offers "Also encrypt everything this app saves" **unticked**, and nothing is encrypted until someone ticks it. No first-run prompt, no default. (`chat/lock/lock.mjs`, `tests/e2e/vault.e2e.mjs` checks the box starts unticked.)

## Automation (the checks, so the plan cannot rot)

- `tests/encryption-plan.test.mjs`: this page keeps its phases, its status line and its log; a ticked step may only name files that exist; the tests named under this heading must exist; the inventory file named here must parse. The same drift protection `tests/offline-plan.test.mjs` and `tests/architecture-doc.test.mjs` give their pages.
- `tests/storage-inventory.test.mjs` (0.1, 3.2): every storage key and every file that uses browser storage is classified; one owner per key; **no user, setting or transient key is read or written through raw `localStorage` / `sessionStorage`**, only through the vault store.
- `tests/memory-manager.test.mjs` (0.2): the switch never touches the memory items' key.
- `tests/vault.test.mjs` (phase 1): keys, passphrase change, tamper detection (a changed byte, a swapped key id, a moved record, a replayed one), crypto-shredding, padding, compaction, the reducer.
- `tests/vault-store.test.mjs`, `tests/vault-control.test.mjs` (phases 2 to 4): the app storage over the vault (what goes where, coalesced writes, a failed write, API keys not remembered), migration and its read-back check, turning on and off, two tabs (the writer lock, read-only, the broadcast), the key table equals the inventory.
- `tests/vault-passkey.test.mjs` (5.2): the passkey flow with a fake authenticator (PRF at creation or on the second prompt, no PRF, cancelled, another address, removal).
- `tests/vault-perf.test.mjs` (phase 4): 500 chats and 10,000 messages store, unlock, rewrite one chat and compact within generous limits (a guard against an accidental quadratic step, not a promise about a phone).
- `tests/e2e/vault.e2e.mjs` and `tests/e2e/vault-passkey.e2e.mjs` (2.5, 5.3): the whole thing in a browser, on every push (`.github/workflows/vault-e2e.yml`): a marker string is written into a chat and then looked for in every `localStorage`, `sessionStorage` and IndexedDB record; unlock screen, wrong and changed passphrase, lock now, lock when I leave, a page killed mid-reply, a second tab, turning it off; the passkey with Chromium's virtual authenticator.
- `scripts/encryption-baseline.mjs` and `scripts/encryption-probe/`: the device probe (key-derivation time and what the browser supports); each run writes an evidence file under `docs/evidence/encryption/` that this page links.
- `docs/evidence/encryption/storage-inventory.json` is the one list of what the app keeps; `chat/vault/key-classes.mjs` is its code twin and a test keeps them equal.

## Open questions (my recommended answer in brackets; I will proceed on these unless told otherwise)

1. Opt-in first, or required for everyone from the start? [Opt-in. **Decided by the owner (2026-11-04): it stays opt-in; default-on is friction.**]
2. Theme readable before unlock? [Yes, plain: it reveals nothing about chats.]
3. Lock (and reload) when the app is hidden, or only after the idle timer? [Only after the idle timer by default, with "lock when I leave" as a choice.]
4. Pad record sizes (more storage, less leakage) or not? [Pad to 1 KB buckets; it is cheap and hides the length of short messages.]
5. Unlock with the owner's face (Face ID / Touch ID) through a passkey with PRF: [Yes, a goal. An added way to unlock beside the passphrase, never a replacement; built after the passphrase flow; everything automated first, the real face needed only for step 5.4 at the end.]
6. API keys are kept only for the tab today (`sessionStorage`). Should the vault keep them across sessions? [Yes, inside the vault only: unlocking is then the one step, and a key is never in plaintext on disk. Provide a "do not remember keys" switch.]
7. Should the first release ever delete the plaintext copy by itself after migrating? [No: it offers it, after the encrypted copy is read back and an encrypted backup exists.]

## Log (newest first; add a line with every finding)

* 2026-11-04: **6.1 decided: opt-in only, never the default** (owner). The "also encrypt" box in the passcode dialog now starts unticked. Also from the owner: the encryption dialogs did not use the app's visual language; they now use the Settings vocabulary (cards, rows with a label and description, pill buttons, sub-headings), and the unlock screen is a card in the same style.
* 2026-11-04: **5.1 closed: the passkey worked perfectly on the Galaxy S8+** (add, lock, unlock with the screen lock), so Chrome 131 there does support PRF. Only 6.1 (default-on, the owner's decision) is left.

* 2026-11-04: **5.4 done by the owner on the iPhone 15 Pro: Face ID unlocked the vault, lock and unlock worked.** Finding: iOS asked for a username to save the passphrase in the keychain (a password field with no username beside it); both passphrase screens now carry a fixed hidden name so it does not ask. Still open from this session: the iPhone's unlock-time number, and the Galaxy S8+ (its passkey answer, 5.1).

* 2026-11-04: pushed as `f3edf47` to `main` and `dev`; Release, Offline e2e, Voice e2e, the new Vault e2e workflow and both deploys all passed. **What is left is two steps that need the owner, not more building:** 5.4 (the real Face ID check, ten minutes on the iPhone 15 Pro, which also gives that phone's unlock time and the Galaxy S8+'s real PRF answer) and 6.1 (whether new installs are asked for a passphrase by default).
* 2026-11-04: **built, phases 1 to 5.3.** `chat/vault/` (vault, vault-db, vault-store, vault-control, key-classes, unlock-screen, passkey), the passcode dialog offers "also encrypt everything" (unticked: opt-in), Settings > Encryption (lock now, auto-lock, lock when I leave, remember API keys, change passphrase, Face ID / Touch ID, remove the unencrypted copy, turn off). 1,100+ unit tests and the vault browser tests pass. Found while building: (1) the page's start-up check called a waiting unlock screen "did not start properly" after 4 s: it now ignores a waiting vault and re-arms after unlocking (`window.__plcVaultLocked`); (2) `doc-store` kept its IndexedDB connection open, so deleting the old document database after migrating blocked forever: it now closes on `versionchange`; (3) an open `BroadcastChannel` at import time kept node's test process alive: the channel is only made in a page; (4) several browser tests assumed the app had drawn its shell by the time the page flagged itself started: the harness now waits for the shell too. On this box `tests/e2e/offline-variants.e2e.mjs` and `no-opfs.e2e.mjs` use ports (18401, 18431) that another project's services hold: run them with `E2E_PORT_OFFSET=7`; `offline-variants` fails the same way on the commit before this work ("no browser wording"), so that is not from the vault.
* 2026-11-04: device probe written (`scripts/encryption-probe/`: a page, a one-shot collector, runners for the Veriton and an Android phone on Boiler) and run on the Veriton, Mac Safari and the Galaxy S8+. Two things to remember: the Mac's Safari window the probe opened was closed from AppleScript but left an empty window shell in the list (harmless); the iPhone was not touched because another project's Safari bridge holds it.

* 2026-11-04: hardware targets fixed by the owner: add the Galaxy S8+ and the Veriton; the iPhone 11 Pro is out for now (unavailable), so the iPhone 15 Pro is the only iOS device in this plan. The S8+ is now the slowest phone for the iteration count.
* 2026-11-04: owner decision: the vault must open with Face ID, and their physical face is not needed until the end. Phase 5 rewritten (passkey with PRF; learn device support, pure logic, virtual-authenticator browser tests, one real Face ID check last); the words "device-bound" were wrong (Apple passkeys sync through iCloud Keychain) and are gone; question 5 answered yes.
* 2026-11-04: **found while writing the inventory: `plc.memory.v1` was shared by the assistant's memory items (`chat/assistant/assistant.mjs`) and the "One model at a time" switch (`runtime/memory-manager.mjs`).** Each rewrote the whole value, so flipping the switch could erase the person's memory items and saving a memory item reset the switch. Fixed: the switch has `plc.modelMemory.v1` and reads the old key once; `tests/memory-manager.test.mjs` and `tests/storage-inventory.test.mjs` now catch the class. Memory items already lost this way cannot be recovered.
* 2026-11-04: the first survey missed four keys (`plc.shell.pins.v1`, `plc.models.v1`, `plc.inferenceMode.v1`, `plc.downloadIntent.v1`); the inventory test would have caught them, which is why it came first.
* 2026-11-04: plan proposed (branch `claude/vigilant-ride-beaez6`) and made a living plan: phases with steps, an Automation section, recommended answers and this log.
