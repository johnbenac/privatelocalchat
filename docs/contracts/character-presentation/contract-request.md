# Receiving character presentation in PLC: plan and contract request

Board: PLC T444 (objective O133) receives what Cosmogenitor T432 (objective O132) authors. T461 (discovery and opening) reuses
this receiver. Written 2026-11-18 by the PLC team. This is a request to read and answer, not a request for work: Cosmogenitor
is busy, so the questions are numbered and each has PLC's proposed answer; "agreed" or a correction is enough.

## What exists today (both sides)

- T415 (Cosmogenitor, done) defines two aspects inside `cosmogenitor/content/0` bundles: `authored:presentation-v1` ("app-owned
  layout and palette vocabulary with text alternatives; no CSS, HTML, scripts or influence over trusted app controls") and
  `authored:media-v1` (required/optional asset references with purpose, text alternative, attribution and licence). Examples:
  `contracts/authored-profiles/examples/neri.bundle.json` and `bex.bundle.json`; receiving fixtures beside them.
- PLC today receives only the plain `{id,name,prompt}` projection (T465, on `dev`: `chat/assistant/preset-*.mjs`, `docs/PRESET-IMPORT.md`)
  and names everything else as an omission, as `MAPPINGS.md` says. PLC draws no per-assistant presentation at all.

## What PLC will build (T444), in this order

1. A pure module (`chat/presentation/`) that turns the presentation and media aspects of an opened bundle into one normalized
   view model: layout id, palette tokens, portrait and background assets (verified bytes, text alternative, attribution,
   licence), or a named omission. No DOM, no storage. Tested against the neri and bex fixtures and negative cases.
2. A preview in PLC's own components: the person sees the character as it would appear, with the attribution and licence,
   and chooses to use it, overrides single parts, or disables it. Disabled or unsupported means PLC's current look.
3. Rendering in the conversation (header and agent messages) from the same view model that PLC's own default uses, so
   defaults and imports share one renderer.
4. Storage: a presentation record attached to a preset by the preset's id, through `appLocal` with a new classified key.
   A new storage format ships over two releases (PLC `docs/DATA-COMPATIBILITY.md`), so storage comes after 1 to 3 are agreed.

Fixed invariants (from T444 and PLC's own guarantees): a package grants no code, tool, memory or network authority; no CSS, HTML
or script is ever taken from a package; assets are checked against their SHA-256 before use; the controls that say who is
speaking (human, agent, guest), stop, leave, revoke and the host and privacy controls are drawn by PLC and cannot be altered
by a package; importing never changes standalone, vault or temporary-chat behaviour; keyboard, focus, reflow, reduced motion
and text alternatives are verified in a real browser, with fixtures and real browsers recorded separately.

## What PLC needs from T432 (questions with PLC's proposed answers)

1. **The closed vocabulary.** `authored:presentation-v1` names an app-owned layout and palette vocabulary. Which layout ids and
   palette tokens exist in v1, with their meanings and the fallback for an id PLC does not know? *Proposed: a closed list in
   T432's definitions, each with a one-line meaning and a "use PLC default" fallback; unknown optional ids are named omissions.*
2. **Asset formats and bounds.** Which image formats and maximum pixel size for portraits and backgrounds, and which byte caps?
   T415 allows inline 64 KiB each / 256 KiB total and external 1 MiB each / 4 MiB total. *Proposed: PNG, WebP and JPEG only (no
   SVG, because SVG can carry script and external references), at most 1024 pixels on the long side, within the T415 caps.*
3. **Attachment.** How does presentation attach to a character in a bundle with several subjects, and which subject is the
   speaker when a conversation has several agents? *Proposed: per subject through its aspect; PLC shows each agent's own
   presentation; a missing one means PLC's default for that agent.*
4. **Required versus optional.** Which parts may a package mark required? *Proposed: nothing in presentation is required for
   a conversation to work; a required missing asset refuses the presentation (not the character) and PLC falls back.*
5. **Text alternatives.** Is the text alternative mandatory for every portrait and background, and may it be empty for purely
   decorative backgrounds? *Proposed: mandatory for portraits, an explicit `decorative: true` for backgrounds that need none.*
6. **Real packages.** When will T432 produce its first real contrasting packages for PLC (T444 acceptance needs actual T432
   output, not fixtures)? Please include one with an unsupported optional element and one with a missing required asset.
7. **Versioning.** How does a v2 of the vocabulary arrive? *Proposed: new aspect ids with a `-v2` suffix, as T415 does, never
   a changed meaning under `-v1`.*
8. **Brand separation.** T432 says the application brand packet stays separate from a character's resources. Confirm that
   PLC's brand never comes from a package and that a package carries no PLC-specific names.

## What PLC does not claim

No presentation receiver exists in PLC yet. Nothing here is a schedule: T444 cannot be finished before T432 delivers real
packages, and the objective O133 is in the Undecided lane. This document and a first pure module with fixtures are what can
start now without waiting.
