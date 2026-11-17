# Data compatibility

Everything a person keeps in Private Local Chat lives in their browser, per address: chats, projects, memory, presets, drafts, settings, documents and the optional encrypted vault. This is how that data stays intact when the app changes, on privatelocal.chat, where browsers fetch new builds without asking, and in a copy someone hosts and upgrades themselves.

## Where the formats are

- **`chat/vault/key-classes.mjs`** gives every storage key a `format`: the highest format of that key's value this version reads and writes. A key named `...vN` has format N. This table is the code twin of the inventory.
- **`docs/evidence/encryption/storage-inventory.json`** lists every key and database with its class, owner, `format` and `since` (the first release that used it). `tests/storage-inventory.test.mjs` fails if the table, the inventory and the source disagree.
- **`plc.formats.v1`** is a small plain record in each browser: the highest format of each store that any version has used there. A starting version brings it up to date and never lowers it.
- **`plc-docs`** (the document database) carries its IndexedDB version as `DB_FORMAT` in `chat/documents/doc-store.mjs`, and **`plc-vault`** carries `VAULT_FORMAT` in `chat/vault/vault.mjs`.

## Changing a stored format

1. **Two releases.** Release N reads both the old and the new format, writes the new one, and keeps the old one readable. Release N+1 may stop writing the old format, and the old format stays readable for at least a stated number of releases. Because of this, stepping back one release always works.
2. **A store may move to a new key name** (`plc.memory.v1` to `plc.memory.v2`) instead of changing in place. The older keys of that family then count as superseded for any version that does not know the new name.
3. **A migration** writes the new form beside the old one, reads it back to confirm it, and only then switches. It is safe to interrupt and safe to run again. It never deletes the previous form until the new one has been read back and used successfully.
4. **Raise the number** in `key-classes.mjs` and the inventory (and `DB_FORMAT` or `VAULT_FORMAT` where those change), add the migration and its tests, and capture a snapshot from a build that writes the new format (below).

## Newer data is left alone

When a browser holds data from a newer version than the one running, that version:
- reads it as before,
- never writes to it or removes it (`createAppStorage` refuses writes, removals and `clear` for those keys, and the vault copy is read-only too),
- says so once, in plain words, with the option to reload for the newest version, and points to Settings, Storage and backups for a copy,
- leaves every other store working normally.

It decides this from the record `plc.formats.v1` and from the keys present (a key named for a higher version of a known store). A document database created by a newer version raises a `VersionError`, which is handled the same way. `chat/vault/data-formats.mjs` holds the logic, `chat/vault/format-guard-ui.mjs` the message, and `tests/e2e/format-guard.e2e.mjs` proves it in a browser.

## Data from every release: the snapshot suite

`tests/fixtures/data/` holds one folder per snapshot, numbered from `001`, named `NNN-<release>-<commit>`. Each has:
- `meta.json`: the release, the commit, the app build, and the format of every key as the capturing build understood it,
- `plain.json` and `vault.json`: everything the browser held after the real release was used (local and session storage, and every IndexedDB database with its schema and records), plus what the app itself read back (`expected`). The vault snapshot is the same person with the encrypted vault on; its passphrase is in the file.

`tests/e2e/data-upgrade.e2e.mjs` restores each snapshot, oldest first, into a fresh browser, starts the build under test (unlocking the vault where there is one), and checks that:
- every chat, project, memory item, preset, draft, setting and document is there (new fields never matter; missing or changed content always does),
- no store was blocked as newer and no page error was reported,
- the content does not change by itself after start,
- the app can write (a memory item is added), restart, and still shows the old content and the new item.

Other tests keep the set honest (`tests/data-fixtures.test.mjs`): the folders are numbered without gaps, a vault snapshot holds nothing readable, no snapshot holds an API key, every format the code supports was written by some snapshot, and the newest snapshot is at most 15 releases behind the newest release (checked where git tags are present).

### Capturing a snapshot

```sh
node scripts/data-snapshot.mjs capture                                   # the checked-out commit (release from git describe)
node scripts/data-snapshot.mjs capture --release v0.57.0 --commit <full sha> --out tests/fixtures/data   # an extracted release tree, with no .git
```

The script uses the real app through its interface: two chats (one with an attached document), a project, a pinned chat, a memory item, a preset, personal instructions and an unsent draft, then turns the vault on. It also checks that what the app reads back does not change across a reload. Run it on the commit that becomes a release, or on an extracted release tree (copy `scripts/data-snapshot.mjs` and `tests/data/lib.mjs` into it), and commit the folder it writes.

A snapshot is needed when a stored format changes (the format-coverage test fails until one exists from a build that writes it) and at least every 15 releases.

## A newer store, an older vault, then the newer build again

A store this build keeps (a user or setting key in `key-classes.mjs`) is unknown to an older build. If a person on the newer build writes it unencrypted, then opens an older build and turns the vault on there, the older build encrypts only the keys it knows: the newer store stays unencrypted in the browser's own storage. Back on the newer build the vault is on, so the key is read only from the vault and would look empty, and the old "Remove the unencrypted copy" cleanup would delete the only copy. What this build does (`chat/vault/vault.mjs`, `vault-store.mjs`, `vault-control.mjs`; tests `tests/vault-transition-history.test.mjs` (the focused one), `tests/vault-transition.test.mjs`, `tests/vault-transition-concurrency.test.mjs`, `tests/e2e/vault-transition.e2e.mjs`):

* **The evidence is the stored log, read back fresh.** A vault session exposes read-only replay evidence `history = { observedHistoryComplete, seenKvKeys }`, taken from the decoded records of the persisted log. `observedHistoryComplete` is true only for a non-empty log that starts at seq 1, is contiguous and has no unreadable record. `seenKvKeys` is every key any `kv.set` / `kv.del` of that log names. Compaction renumbers the log (it then starts after seq 1) and drops deleted keys, so a compacted, empty, gapped or damaged log proves nothing about absence. A marker's absence and the in-memory or unflushed state are never proof. No wire, event or database format changed.
* **Start-up reconciliation** runs inside `bootVault()`, after unlock and the writer claim and before any feature can read. Every decision is made against a fresh persisted replay, never against the session's memory. For each vaulted local key with an unencrypted value: *equal* to the vault is a verified duplicate; *different* is a conflict (both kept, the encrypted one is served, nothing is chosen for the person); *absent from the vault* is **stale** when it is a store every older reader migrates (`LEGACY_VAULT_KEYS`), is listed in `meta/recoveredKeys`, or is named by the stored history (it was encrypted and then deleted: it is never copied back, so deleting a character or encounter stays deleted). Otherwise it may be copied only when the whole history was observed and never names it (provably never encrypted); the copy goes through the one vault writer, the stored log is read back through the adapter with the raw vault key (a passkey unlock works, no passphrase is needed) and compared. The unencrypted copy is left in place.
* **Ambiguous means held, visibly.** A key that is absent from a compacted, empty, gapped or damaged history is *held* (`history-unproven`, `vault-damaged`), as is any key a read-only tab, a failed write, a read-back mismatch or a browser without an exclusive writer cannot copy (`read-only`, `no-exclusive-writer`, `write-failed`, `readback-mismatch`, `newer-format`, `readback-failed`). Reading a held key returns the unencrypted value (never null); writes, removals and `clear()` of it are refused (event `plc:vault-held-write`); cleanup never removes it. Retrying from Settings > Security cannot turn ambiguity into proof. A held key stays held until a start or retry that can prove it, or the person removes it by their own action outside this flow.
* **Only an exclusive writer changes anything in these multi-step transitions.** Copying a missing key, the recovery retry, cleanup and turning encryption off need the writer claim to be a real Web Lock (`claimWriter()` `supported: true`; `app.exclusive`). The fallback `{ writer: true, supported: false }` (no Web Locks) keeps ordinary vault use exactly as before, but these transitions refuse with `no-exclusive` and a read-only tab with `read-only`, before any adapter, raw-storage, marker or document write. The raw and encrypted values stay readable.
* **One transition at a time, and a fence.** Retry, cleanup and turning off run through `app.transition()`: two overlapping retries share one run; anything else that overlaps is refused as `busy`. Each captures the attached session and a lifecycle epoch (`app.fence()`, bumped by every attach and detach) and re-checks them after every await and before it changes anything: after a lock and unlock, or a session swap, even if the same session is attached again, the old action stops with `session-changed` and touches neither the replacement session, the raw storage nor the vault.
* **A retained stale plaintext copy is normal** (the person declined to remove it, then used the vault). A copy of a migrated store that differs because it was edited since stays quietly retained and the encrypted value stays in use; nothing is copied back and nothing is removed unasked.
* **Cleanup removes only verified duplicates.** "Remove the unencrypted copy" reads the stored vault back, compares each key, and removes a key only if it is equal and unchanged at the moment of removal (a copy that changed while the check ran is kept; a vault with unreadable stored parts verifies nothing). Everything else is kept and named. **"Permanently delete differing items…"** is a separate confirmation that says what it does: it deletes copies that differ from the encrypted value, and copies that are the only remaining item because the encrypted one was deleted or the copy is old. That is permanent deletion, listed as `discarded` (never as duplicate removal). A key the vault never held, an unreadable list and a newer-format value are never deleted. The old synchronous `removePlaintext(realLocal, realSession)` export now fails closed (it throws and removes nothing); `removeVerifiedPlaintext` is the only cleanup and needs `exclusive: true`.
* **Turning encryption off** needs the exclusive writer, checks the passphrase, reads the documents until they match the vault, then re-compares every raw value it would overwrite in the same synchronous step that writes them back (`restorePlaintext` refuses a value that differs from what was checked, a newer-format value, a differing copy of a newer store, an unreadable list). Held and unmatched raw values are left as they are. The long-standing rule is unchanged: a retained, since-edited copy of a migrated store is replaced by the live encrypted value.
* **Session keys** are never copied; they are compared at cleanup time, with the remember-keys rule (a token that is not remembered counts as matching).
* **Not claimed.** An older build cannot be made to encrypt a store it does not know, so the period it runs with the vault on leaves that store unencrypted. A future publication needs a reader/classification release before the writers are enabled by default (two-release rule above); that is publication staging, not done here. Rich backup/transfer (T428) is a separate task. The production key table does not yet list the two new stores (the task coordinators add them); the tests use a scratch copy of `chat/vault/` whose table has them. Browser, data-upgrade, file and preset qualification of this change is outstanding.

## Release gate

The Release workflow starts after a production deploy. Before it tags anything it waits for the **Data upgrade** workflow (`.github/workflows/data-upgrade.yml`, which runs the two browser suites on every push to `main` and `dev` and every pull request) to pass for the same commit. A failure or a missing run means no release.

## Commands

```sh
node tests/e2e/data-upgrade.e2e.mjs     # every snapshot into the current build
node tests/e2e/format-guard.e2e.mjs     # newer data is left alone
node --test tests/data-formats.test.mjs tests/data-fixtures.test.mjs
node scripts/data-snapshot.mjs capture  # a new snapshot
```
