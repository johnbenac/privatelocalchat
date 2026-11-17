# File compatibility

People keep files outside the browser: the chat history file, the passphrase-protected backup, the settings file or link. They are opened months later, in another browser, or in a self-hosted copy that runs a different version. The promise is the one made for stored data (`docs/DATA-COMPATIBILITY.md`): nothing the person saved is lost or misread because versions differ.

## The files

| File | Format | Written by |
| --- | --- | --- |
| `chat-history.json` | `plc-history/1`: `{ format, exportedAt, app, threads }` (before it, a bare list, still read) | Settings, Transfer chats, Export saved conversations |
| `*.encrypted.json` | `plc-encrypted-backup/1`, holding a `plc-backup/1` (chats, projects, memory, presets, preferences, optionally documents) | Protected backup |
| `private-local-chat-settings.json`, transfer links | `plc-settings-transfer/2` (`/1` was never written; earlier links and files are read as the legacy forms) | Transfer settings |

`chat/transfer/file-formats.mjs` is the table (`FILE_FORMATS`: the number this build writes, the first number ever written, and the name used in messages). A file names its format as `name/N`; the history file and the backup also name the build that wrote them (`app.version`, `app.commit`).

## The rules

1. **Every build reads every format any earlier build wrote, for good.** Unlike stored data, which may use a stepping stone, a file is kept for years. A reader for an old number is never removed.
2. **A file from a newer format is refused whole.** `refuseIfNewer` runs before anything else is judged, on the file, again on a backup after it is unlocked, and in the settings reader. The message is the same sentence for every kind of file: it was made by a newer version, nothing was changed, update the app and try again. It is never half-imported and never called "not a backup".
3. **Nothing is lost on the way in.** `normalizeThread` and `normalizeMessage` keep fields they do not know (plain data only, at most 40 fields and 20 KB per chat or message, never `__proto__`, `constructor` or `prototype`), so a chat that passed through a newer version, or a file made by one, comes out whole when it is saved or exported again. Fields the build handles itself are never overwritten by this.
4. **An import into something held read-only says so.** When the chats in the browser were written by a newer version (`docs/DATA-COMPATIBILITY.md`, "Newer data is left alone"), an import is refused with that reason; the extras of a backup (projects, memory, presets, preferences, documents) that a newer version owns are skipped and named.
5. **Reading a file never overwrites.** Import adds. Replacing all chats is a separate, confirmed choice that offers a backup first.

## Changing a file format

1. Add the new number to `FILE_FORMATS` and keep the reader for the old number.
2. Make the new build write the new number and `app`.
3. Capture a snapshot from the release that writes it (below) and commit it. `tests/file-fixtures.test.mjs` fails until every number from `first` to `current` was written by some snapshot. A number the code writes that no release has written yet is listed in `NOT_YET_RELEASED` in that test (today `plc-history/1`); the first snapshot of a release that writes it removes the entry, and the test fails until it does.
4. A snapshot is also needed at least every 15 releases.

## Snapshots

`tests/fixtures/files/<n>-<release>-<commit>/` holds the history file, the protected backup and the settings file as a real release wrote them, and `meta.json` (the formats, the passphrase `correct horse`, and the data snapshot they were made from, so the expected content is known). Capture with the real app in a real browser:

```
node scripts/file-snapshot.mjs capture [--release v0.57.0] [--commit <full sha>] [--out tests/fixtures/files] [--data <data snapshot>]
```

Run it on the commit that becomes a release, or on an extracted release tag (copy `scripts/file-snapshot.mjs`, `tests/data/` and `tests/fixtures/data/` into it and set `GITHUB_SHA` and `SOURCE_DATE_EPOCH` when it is not a git checkout).

## Tests

- `tests/file-formats.test.mjs`: format names and states, the refusal sentence, the history file, the settings reader, kept fields and their limits.
- `tests/file-fixtures.test.mjs`: the set is numbered, complete for every number the code reads, matches the data it was made from, holds nothing readable in the protected backup and no API key, and is at most 15 releases behind.
- `tests/e2e/file-import.e2e.mjs` (workflow **Data upgrade**, which the Release workflow waits for): each snapshot's three files opened through the app's own import in an empty browser with nothing missing; a wrong passphrase imports nothing; newer files are refused and nothing is written; this build's own export opens again with unknown fields kept; an import into chats held for a newer version is refused.
