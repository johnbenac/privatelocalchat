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

## Release gate

The Release workflow starts after a production deploy. Before it tags anything it waits for the **Data upgrade** workflow (`.github/workflows/data-upgrade.yml`, which runs the two browser suites on every push to `main` and `dev` and every pull request) to pass for the same commit. A failure or a missing run means no release.

## Commands

```sh
node tests/e2e/data-upgrade.e2e.mjs     # every snapshot into the current build
node tests/e2e/format-guard.e2e.mjs     # newer data is left alone
node --test tests/data-formats.test.mjs tests/data-fixtures.test.mjs
node scripts/data-snapshot.mjs capture  # a new snapshot
```
