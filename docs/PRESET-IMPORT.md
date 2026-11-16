# Importing a preset candidate

Board task T465. A **preset candidate** is the small plain JSON that Cosmogenitor's `prepareConsumerHandoff(..., { target: 'plc-preset' })`
produces: `{ "id", "name", "prompt" }`. The summary is already part of `prompt`. It is authored instructions only: not a backup, not a character
bundle, not a memory, and it carries no conversation, runtime authority or key. This page says how Private Local Chat receives it.
Rich character packages are a separate, later receiver (T222) that can reuse the reading and admission code below; nothing here declares it done.

## How a person uses it

1. **Instructions for this chat** (the "+" menu) has **Import preset…** next to **Save as preset**. Choose a `.json` file, or open a preset link (below).
2. A **Review preset** box shows the name (editable) and the instructions exactly as they will be saved (read-only text). It says nothing has been
   added yet and that the preset is not applied to any chat. Opening a file or a link never adds anything by itself.
3. **Add preset** creates one new local preset with a new id. **Cancel**, Escape or closing the box writes nothing.
4. The person chooses the new preset in a chat by hand, like any other. Importing never changes the open chat and never changes a chat that already exists.

If the saved presets cannot be used, the box says why in its status line and **Add preset** is disabled (see "When presets cannot be changed").

## What is accepted

Exactly three fields, as JSON text:

| Field | Rule |
| --- | --- |
| `name` | text, required, one line, 1 to 120 characters after trimming |
| `prompt` | text, required, not blank, at most 8,000 characters; kept exactly as sent (no trimming) |
| `id` | text, optional, at most 200 characters. Only shown as "where it came from". It is **never** this device's id and never overwrites anything |

Limits are checked before work is done: a file larger than 32 KB (checked on the file's size, before it is read), text longer than 32 KB in bytes
(before `JSON.parse`), and, for a link, the **whole fragment** (see below). Control characters (except tab and line breaks) and invisible direction
overrides are refused so the preview cannot read differently from what is stored.

**Refused whole, with a plain message, nothing changed:**

* not JSON, not one object, a missing or non-text field;
* any other field (`unknown-fields`, named in the message): a field this version does not understand might carry a meaning the sender needed, so
  nothing is silently dropped;
* a structured payload that looks like a backup or a richer package (`schema`, `format`, `records`, `subjects`, `threads`, `presets`, `design`, any
  unknown field holding an object...): `unsupported`;
* a field named like a credential or service address (`token`, `apiKey`, `secret`, `password`, `endpoint`, `authorization`, `cookie`...): `credential`.
  This is a check of field names only. **It is not a detector of secrets written into the instructions.**

No URL is fetched, nothing is executed, no model is started and nothing is generated. A preset is text.

## The link form

`https://<app address>/#preset=<base64url of the candidate JSON, UTF-8>` (no padding). Only the part after `#` is used, so it is never sent to a server.

* **Bound before work.** The whole fragment is measured first. A fragment that names `preset=` and is longer than 12,544 characters (the 12,288-character
  preset value plus 256 for the key and a few other parameters) is refused as too long **before** it is split into parameters, base64-decoded or parsed, however
  much unrelated text surrounds the preset. A fragment of any length that does not name `preset=` belongs to something else (a settings link, say) and is left alone.
* The decoded text gets the same limits and refusals as a file; two `preset=` values in one address are refused as ambiguous.
* When the page opens with such a link it shows the review box; the person still has to press Add. The app **does not change its own address** (the privacy page promises
  nothing inside the app is counted as a page view; `tests/no-address-change.test.mjs` allows only clearing a shared settings link), so the link stays in the address bar and a
  reload shows the same review again. It never adds anything on its own, so showing it twice is harmless; to stop seeing it, remove the fragment from the address.
* `encodePresetFragment()` in `chat/assistant/preset-candidate.mjs` builds one. There is no query-string form and no `https:` address that is fetched.

## Names, repeats and conflicts

A name is compared without case, spacing or width differences (Unicode NFKC), against the built-in presets and the person's own. An equal name, or the same
instructions again, is never silently replaced and never silently added: the box says what collides and its button becomes **Keep as a separate preset**.
The person can instead change the name in the box, or cancel. The check is repeated inside the lock when Add is pressed, so a preset that appeared in
another tab a moment earlier produces the same question rather than a silent duplicate.

## Storage, the lock and what happens without it

The record is still `plc.presets.v1` (a JSON list of `{id, name, prompt}`): no format change, so old data, backups, settings files and the format guard read as
before. It is written through `appLocal`, so with the vault on it is encrypted at rest and a read-only tab (another tab holds the vault writer lock) refuses
with "open in another tab" instead of silently not saving.

**One writer path.** Every change to the list goes through `chat/assistant/preset-store.mjs`: import, **Save as preset**, edit, delete, and the presets of a restored
full backup (`restorePresets` in `chat/assistant/assistant.mjs`, using `mergeBackupPresets`: the legacy rule is unchanged, a preset whose exact name is already one of
yours is skipped and each added one gets a new id). A change is: take the Web Lock `plc-presets` (shared by every tab of the browser profile; a dialog open in one tab
excludes nothing in another), read the stored list afresh, apply one synchronous change, write, read back, release. The browser frees the lock if a tab dies.
There is no whole-list writer left. Nothing rolls back: a write that cannot be confirmed is reported (`changed`, `write-failed`) and whatever is stored stays, so a
newer successful write by someone else is never overwritten by an old copy.

**Without Web Locks there is no write.** Script in one window is not an atomic step across windows, so a read-change-write there could silently lose another tab's
change. A browser without `navigator.locks` can still read and use saved presets; every change (import, save, edit, delete, restore) answers `unsupported`, says
"this browser cannot make preset changes safely when the app is open in more than one tab", and writes nothing. (Web Locks are in every browser that runs the app's
local models, in secure contexts.)

## When presets cannot be changed

`store.ready()` is asked when the review box opens, after each edit of the name and again at the click. The box then shows one of these and disables **Add preset**; the
stored bytes are never touched, and a manual **Save as preset** shows the same words:

| Situation | Code | What the person reads |
| --- | --- | --- |
| the browser refuses to read the key | `unreadable` | the saved presets could not be read and were left alone |
| stored text is not a list | `malformed` | the saved presets are not in a form this version can read and were left as they are |
| another tab holds the vault writer lock | `read-only` | the app is open in another tab |
| no Web Locks | `unsupported` | see above |

Other outcomes of a change: `busy` (another tab held the lock for ten seconds), `write-failed` (storage refused, for example full), `changed` (the read-back differs).

**Two editors of one preset.** The lock makes edits happen one at a time, but it cannot tell that the second editor was looking at an old copy. So the Edit dialog
(Memory & preferences > Assistant presets) carries the record it showed (`editPresetChange(expected, prompt)` in `preset-store.mjs`), and inside the lock that record is compared with
the one stored now (name and instructions). Same: the new instructions are saved. Different: nothing is written, the person is told that the preset was changed somewhere else and
the edit was not saved, the list shows the newer text, and the refused text is kept in memory so the next **Edit** of that preset opens with it, ready to apply to the newer record
or discard. Removed meanwhile: told, nothing written. Whoever commits first wins. This covers manual Edit only; delete and the other writers are unchanged, and no stored or file format changed.

## Tests

* `tests/preset-candidate.test.mjs`: parser, limits, the bounded fragment (including a million unrelated characters around a tiny preset), conflicts, admission,
  backup merge rule, and the two real Cosmogenitor outputs in `tests/fixtures/presets/` (the test fails if they are missing).
* `tests/preset-store.test.mjs`: the store (unreadable, malformed, read-only, full storage, no Web Locks, no rollback, a change that throws while holding the lock (an exception, not a process death), busy) and 8 parallel
  actors x 20 repeats including backup restores; 8 editors of one record x 20 repeats (one saved, the rest stale and writing nothing); the review box against an unreadable store.
* `tests/e2e/preset-import.e2e.mjs`: the visible flow with the real outputs, refusals, oversized fragment, unreadable/malformed/read-error stores, a tab without Web Locks,
  vault lock/unlock/reload, a read-only vault tab, no network or model request.
* `tests/e2e/preset-concurrency.e2e.mjs`: real tabs on one profile, 20 repeats each: 4 writing tabs and a reading tab (imports, manual changes, a restore), two tabs
  pressing Add together, two real Edit dialogs on one preset (one edit kept, the stale one told and its text kept for retry), an import against a manual save, an import against a real backup import, the lock as the actual path, a tab closed without unload handlers while holding the lock, a tab closed
  mid-write. Those two are tab **teardown** in a real browser (`page.close({ runBeforeUnload: false })`); they show the browser frees the lock and the others carry on, and are **not** a process kill.
* `tests/preset-crash.test.mjs` (helpers `tests/helpers/preset-crash-actor.mjs`, `preset-crash-broker.mjs`): the abrupt death. 7 separate Node processes run the app's real
  `preset-store.mjs` (4 adders, 2 editors of one preset, 1 victim), are released by a barrier, and the victim is stopped by `SIGKILL` to its process group at a chosen point: holding the lock
  before writing, with the temp file written but not renamed, or after the rename but before it could acknowledge. 20 repeats per kill point (60 deaths total; staged: the others are already queued when the holder dies;
  simultaneous: all released together). Checked: the victim ended by SIGKILL (no exit code) and its group is gone; the lock was freed by the death; the others finish and succeed; the list
  always parses (a reader polls throughout); every acknowledged add is present once; the victim's change is absent before the rename and present once after it; one editor saved and one told
  stale. Controls that must fail: no locks (lost updates), a lock a dead holder never frees (the others are stuck), a storage that writes in two parts (a torn file).
  **What is simulated:** no browser. localStorage is a file with temp-file-and-rename `setItem`, so whole-or-absent is a property of the *storage*, not of our code; Web Locks is a broker that
  frees the lock when the holder's connection closes, which is what the real-tab suite shows a browser doing. Power-loss durability is not tested.
  `PLC_CRASH_REPEATS`, `PLC_CRASH_SCRATCH_ROOT` (default the system temporary folder) and `PLC_CRASH_EVIDENCE_DIR` (writes `crash-evidence.json` and per-repeat logs) adjust a run.
* Browser suites keep their profile in a new folder under `PLC_E2E_PROFILE_ROOT` (default: the system temporary folder; this machine uses a dedicated folder on
  `/media/Vivarium`) and take their port from `E2E_PORT_OFFSET` (bases 18461 and 18462).
