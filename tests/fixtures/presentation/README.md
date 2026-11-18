# Real character presentation packages (Cosmogenitor T432, first output)

Copied on 2026-11-18 from Cosmogenitor's repository, folder `contracts/character-presentation/` (their main at `8891fecd`; read from a copy of
that folder). They are the first two T432 packages, hand-assembled with their T415 validator, not made by an authoring tool (none exists yet).
Images are CC0-1.0; the text is AGPL-3.0-only.

| File | SHA-256 | Purpose |
| --- | --- | --- |
| `lantern-keeper.bundle.json` | `abdd97d2270a05fa5ab30998c6050fb920e614271fb1215901ff0079b7c08ae4` | valid; folio and sea; portrait and background inline; an optional prepared-audio chime and an extra aspect PLC cannot use |
| `ferry-clerk.bundle.json` | `edf015dada5d58a598ba4d7d4a42f51e6bdfa486300058ad63cdcc920a44e985` | dialogue and dusk; one REQUIRED portrait whose entry has its hash and size but status `missing` and no bytes |

Used by `tests/presentation-real-packages.test.mjs`. Do not edit these files: take a new copy from Cosmogenitor and update the hashes here.
