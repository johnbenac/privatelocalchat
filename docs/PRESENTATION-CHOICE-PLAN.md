# Choosing, keeping and showing a character presentation: plan

Board task T706 (objective O133). Written 2026-11-18 by the PLC team after the preview shipped (T444, `docs/CHARACTER-PACKAGE-PREVIEW.md`). This is the design note T706 asks for: what is decided,
what is built in which release, and what is not claimed. Nothing in this note is built yet. The agreed contract and Cosmogenitor's answers are in
`docs/contracts/character-presentation/contract-request.md`.

## What the person gets

From the preview box, **Use this look** on a character whose presentation is usable: the person picks a preset to attach it to (or creates one from the character's plain text through the existing
**Import preset** review), may **turn off the picture, the background, the layout or the palette** one at a time, and may **disable** it altogether. In a chat that uses that preset, the conversation
header and the agent's messages are drawn from that choice; without a preset, a disabled look or an unusable one, they are drawn exactly as today. **Remove look** deletes it and every byte of it.

## Decisions (mine to take, from what the rules and the code already say)

1. **One record per preset, in one new key.** `plc.presentations.v1` (class `user`, format 1), through `appLocal`, so the encrypted vault, a read-only tab, the format guard and "newer data is
   left alone" apply without new machinery. The record is keyed by the preset id, which is the attachment T706 and the contract ask for. A preset that is deleted takes its record with it, under the same lock.
2. **The pictures' bytes live inside the record** (base64), not in a second database. The package gives inline bytes only: at most 64 KiB each and 256 KiB in total (T415), PLC never fetches an external
   one. A record is therefore at most about 350 KB, written whole or not at all, and "remove leaves nothing behind" is one key. The cost is the browser's storage quota, so the number of kept looks is
   bounded (8) and the preview says so plainly when it is reached. If real use shows this is too small, a second store is a later, separate format change.
3. **The record holds what the view model produced, not the package.** Layout and palette names (closed lists), the pictures with their text alternative, author and licence, the choice flags, and where it
   came from (character id, package revision, the package's root hash). Nothing from a package is kept that PLC does not display. Everything read back is checked again against the closed lists and
   the picture bounds before use, so a damaged or hand-edited record gives the default look and a named reason, never an error screen.
4. **Writes go through one writer path, under a Web Lock, as presets do** (`plc-presentations`; read afresh, one synchronous change, write, read back, release; no Web Locks means no write and a plain
   message). It reuses the shape of `chat/assistant/preset-store.mjs` and its tests, not a new idea.
5. **One renderer for the default and for an imported look.** The default look becomes the "neutral" description the view model already returns. The header strip and the agent's message bubbles are drawn from a
   description by one function; with no record the description is neutral and the drawing is today's drawing. The controls that say who is speaking, stop, leave, host and privacy are not part of what it draws.
6. **Scope.** Subject scope applies to that agent's messages and the header; context scope (a scene) is read and kept but only its palette and background are used, behind the header strip, never behind the
   message text (text stays on a solid panel, so contrast never depends on a picture).
7. **Backups.** A full backup carries the records beside the presets (same section, so restore goes through the preset lock and the same checks). A settings file carries none. A history file carries none.

## Two releases (docs/DATA-COMPATIBILITY.md)

- **Release A (invisible).** The key and its format in `chat/vault/key-classes.mjs` and the storage inventory; the store module and its tests; the reader that turns a record into a description;
  backup and restore of the records; the format guard knowing the key. No screen can create a record yet, so nothing is written. A browser that goes back from A to an earlier build loses nothing.
- **Release B (the choice).** "Use this look", the override and disable controls, the header and message rendering, Remove look. B writes the key. An A build that meets B's data reads it and never rewrites it.
- **Snapshot.** A real-app data snapshot from a build that writes the key (`scripts/data-snapshot.mjs`, extended to attach a look to a preset) is captured at B and `tests/e2e/data-upgrade.e2e.mjs` loads it.

## Tests T706 requires, and where they go

- Parallel actors on a scratch copy (several writers attaching, changing and removing looks, with preset deletes in between), 20 repeats, stated invariants: no record without a preset, every record whole,
  nothing acknowledged lost, a stale editor told and writing nothing.
- Abrupt recovery: the writer killed (SIGKILL) while holding the lock, before and after its rename, as `tests/preset-crash.test.mjs` does, 20 repeats per kill point, with its controls that must fail.
- Real browser (recorded apart from fixtures): keyboard, focus, 320 px reflow, reduced motion, 4.5:1 contrast and text alternatives on the header and message rendering; removing a look leaves no key and no
  picture address; PLC's own controls are unchanged (the existing `shell`, `assistant`, `chat-core` and `mobile` suites still pass); a temporary chat never keeps a look; the vault on and off.

## Not claimed

- No look is applied to a chat that has no preset; a look is never applied to a person's own messages or to the controls.
- No audio, document or external picture is used. No package can change a colour, a font, script, or what a control does.
- iPhone and Safari checks of the new rendering are not part of the first release and will be recorded separately when run.
- Discovery of presentation resources (T461) and acceptance by the taskboard (T708) are not part of this task.

## Open, to settle while building (not for anyone to decide for me)

- The exact bound on the number of kept looks (8 is a starting value, measured against the quota with the real packages).
- Whether the header strip shows the picture or only the palette on narrow screens (decided by the 320 px check, not by taste).
