# Keeping a character's look

Board task T706 (objective O133). After the preview (`docs/CHARACTER-PACKAGE-PREVIEW.md`), a person can keep the look of a Cosmogenitor character for a preset and see it in the conversation.
The plan and its reasons are in `docs/PRESENTATION-CHOICE-PLAN.md`; this page says what is built.

## How a person uses it

1. **Instructions for this chat > Preview character package…**, choose a package. For each character the preview now has **Add as a preset with this look…** (or **Add as a preset…** when the package's look
   cannot be used). It closes the preview and opens PLC's own **Review preset** box with the character's plain text, the name editable, and a line saying the look is kept with the preset too.
2. Only **Add preset** adds anything. The preset is a new preset with a new id, like an imported one; then the look is kept for that id ("Look kept for …"). Cancel keeps and adds nothing.
3. In a chat that uses that preset (**Preset** picker) a **strip** appears under the header (the picture, the character's name and the background), the **agent's message panels** use the palette, and
   **Instructions for this chat** shows **Character look** with checkboxes: use the look in this chat; and Picture, Background, Layout, Palette one at a time; the layout, palette and picture credits; and **Remove look**.
4. **Backups carry looks.** A full backup (`plc-backup/1`, protected) has an optional `looks` section, `{ preset id: record }`, for the person's own presets that have a look that can be used. Restoring gives each restored preset a new id, so a look follows its preset through the id the restore gave it (`chat/presentation/backup-looks.mjs`); a preset the person already had (same name) is skipped and never given a look; a look that is not in the expected shape, or beyond the 8 kept, is not kept, and the rest of the backup is restored. A backup from before looks existed has no section and restores as it always did; an older build restoring a newer backup ignores the section. The settings file and the history file carry no looks.
5. Turning the whole look off, or a part off, keeps the rest and the record; turning it back on restores exactly what was chosen. **Remove look** deletes the record and every picture. **Deleting the preset deletes its look.**

## What is stored, and the guarantees

- One local storage key, `plc.presentations.v1` (class `user`, format 1): a map from preset id to a record (`chat/presentation/record.mjs`): layout and palette NAMES (closed lists), the pictures as base64 with their
  text alternative, author, licence, media type, size and SHA-256, the person's choices, and where it came from. At most 8 looks (`MAX_KEPT`), each at most about 350 KB (T415's inline caps). Through `appLocal`, so the encrypted
  vault, a read-only tab and "newer data is left alone" apply (`docs/DATA-HANDLING.md`).
- Every read checks the record again (`checkRecord`): anything damaged, hand-edited or written by a newer version shows the default look and is **left exactly as stored**; the store carries such entries through every write
  untouched and never overwrites a newer version's entry.
- Every change takes the Web Lock `plc-presentations`, reads afresh, changes, writes and reads back; with no Web Locks nothing is written. 7 parallel actors with one SIGKILLed at three points, 20 repeats each, and three
  controls that must fail, are in `tests/presentation-crash.test.mjs`.
- The conversation styling touches only the new strip and the agent's message panels (`tests/presentation-style.test.mjs` fails on any rule for the person's message, the composer or a control); the message sits on a solid
  panel and everything inside it takes the panel's text colour, so a picture, a link or a code block cannot lower contrast (4.5:1 checked for every palette). No animation.
- A package supplies no CSS, HTML, colour, font or script and no authority; the pictures were verified against their SHA-256 when the package was opened.

## Not done yet (said plainly)

- A kept look's pictures are not re-hashed on every read, only checked for form and size (`verifyRecordHashes` exists for the renderer to use).
- Not tested: a real keyboard, 320 px reflow and iPhone in real Safari (the real-browser suite is Chromium).

## Tests

`tests/presentation-record.test.mjs`, `presentation-store.test.mjs`, `presentation-keeper.test.mjs`, `presentation-backup-looks.test.mjs`, `presentation-crash.test.mjs`, `presentation-style.test.mjs`, and in a real browser `node scripts/e2e.mjs character-look`
(package to preset to look, the strip, contrast inside a restyled reply with a link and code, whole and per-part controls, keyboard, reload, a damaged and a newer record, Remove look, deleting the preset, a package whose look is refused) and `node scripts/e2e.mjs character-look-backup` (a protected backup made through the interface and opened with the app's own crypto: the `looks` section names the preset id and nothing is readable outside; a fresh browser gets the look back under the preset's new id and shows it; a preset the person already had is untouched; an invalid look and a backup from before looks are restored without a look and without an error).
