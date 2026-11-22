# Previewing a character package

Board task T444 (objective O133). A **character package** is a Cosmogenitor `cosmogenitor/bundle/0` file made with the authored-profiles definitions
(owner: Cosmogenitor; the shared validator is `vendor/authored-profiles`, package `authored-profiles` 1.2.0, pinned in `vendor.lock.json`; the app loads only its neutral entry, see "Which builds have it"). This page says what PLC does with one.
Nothing here stores, applies or sends anything: choosing a look and keeping it in conversations is a later task (T706).

## How a person uses it

1. **Instructions for this chat** (the "+" menu) has **Preview character package…** next to **Import preset…**. Choose a `.json` file.
2. The **Preview character package** box says it is only a preview, then shows each character in the package: a card drawn in the package's layout (`dialogue` or `folio`) and palette
   (`dusk`, `paper` or `sea`), its picture and background if the package has them, who made each picture and under what licence, and every part that was **not** used and why.
3. **Show with the app's own look instead** shows the same card in PLC's default look and back. Close, Escape or ✕ closes the box and releases the pictures.
4. A package that cannot be opened (a changed byte, not a package, too large) gives one plain message and shows nothing.

A package whose look cannot be used (for example a required picture with no bytes) is still opened: the character is listed, its look is not used, and the box says why.

## What a package can and cannot do

- It supplies a **layout name**, a **palette name**, text, and pictures. PLC maps the names to its own rules in `chat/chat.css` (`.pkg-card[data-palette=…]`, `[data-layout=…]`) with its own
  colours, contrast and focus; the message sits on a solid panel so a background picture can never lower its contrast (`tests/presentation-style.test.mjs` checks every palette at 4.5:1).
- It supplies **no** CSS, HTML, colour, font, script, code, tool, memory access or network authority. Every string from a package is written to the page as text (`textContent`).
- Pictures are PNG, WebP or JPEG, at most 1 MiB each (SVG is never shown). Their bytes are drawn only after the shared validator checked them against their SHA-256 **and** they have the size
  the record states. The pictures are shown through temporary `blob:` addresses that are released when the box closes. Backgrounds are hidden from assistive technology (PLC policy: v1 has
  no decorative flag) and their text description is shown in the list. Audio and documents are named as not used. Aspects PLC does not read are listed by name, not hidden.
- The controls that say who is speaking (human, agent, guest), stop, leave, revoke and the host and privacy controls are not drawn by the preview at all.
- One changed byte anywhere in the package refuses the whole package (the validator checks every inline byte). A file over 2 MiB is refused before it is read as a package.

## Where the code is

| Piece | File |
| --- | --- |
| Look of one character from presentation and media values | `chat/presentation/view-model.mjs` (pure) |
| Open a package through the validator and describe each character | `chat/presentation/open-bundle.mjs` (pure; the validator is passed in) |
| Plain-language sentences for every reason | `chat/presentation/explain.mjs` (every reason code has one: `tests/presentation-explain.test.mjs`) |
| The box | `chat/presentation/preview.mjs` |
| The validator loader (the neutral entry of the vendored package) | `chat/presentation/reader.mjs` |
| Wiring | `chat/assistant/assistant.mjs`, `index.html` (`#previewCharacterBtn`) |
| Styles | `chat/chat.css` (the "Character package preview" block) |

## Which builds have it

Every build has it, a copy made for others included. A copy made for others must carry nothing of ours (`tests/neutrality.test.mjs`), and the first version of the shared validator (authored-profiles 1.0.0) named
other projects and web addresses in its code, so for a while only our own deployment shipped it. authored-profiles **1.1.0** (Cosmogenitor, 2026-11-18) adds a **neutral entry** (`neutral/index.mjs`) whose
ten-file import closure names none of them: PLC vendors the package whole in `vendor/authored-profiles/` (read-only, pinned in `vendor.lock.json`), loads only the neutral entry (`chat/presentation/reader.mjs`),
and `scripts/build.mjs` ships exactly those ten files in every target. `tests/presentation-build.test.mjs` computes the closure from the imports and fails when the build ships more, fewer or different files, or
anything of the package's tests, examples, documents or licence file; the neutrality test scans the built output. The package's own licence text is not shipped separately: the AGPL text is in the copy's `LICENSE`.
The neutral entry opens, validates and projects a plain preset; it cannot write a bundle (`exportAuthored` is not in it), and a package whose aspects PLC does not use is still opened, with those aspects listed as unused.

## Tests

- `tests/presentation-view-model.test.mjs`, `presentation-real-packages.test.mjs`, `presentation-open-bundle.test.mjs`, `presentation-explain.test.mjs`, `presentation-style.test.mjs`, `presentation-build.test.mjs`.
- `tests/fixtures/presentation/` holds Cosmogenitor's first two real packages (`lantern-keeper`, valid with an audio element and an extra aspect PLC cannot use; `ferry-clerk`, a required portrait with no
  bytes), with their hashes in the README there. They were hand-assembled with the owner's validator, not made by an authoring tool (none exists yet).
- Browser: `node scripts/e2e.mjs presentation-preview`: the preview of both packages, attribution, the own-look toggle, contrast, 320 px reflow, reduced motion, keyboard and focus,
  released picture addresses, nothing stored or sent, a second package not stacked, and refusals (a changed byte, not a package, a plain preset, too large, edited text).
