# T708 / T444: the first real export from Cosmogenitor's tool (T432), run end to end

Cosmogenitor's export tool (cosmogenitor main 5e233cd459c45a51de70807d8e33409ac9f898d7) produced two packages: `harbour-clerk.bundle.json` (58,815 bytes, SHA-256 a21761eb...d3e7, one character with a look)
and `harbour-clerk-missing-portrait.bundle.json` (57,707 bytes, SHA-256 2a798203...289b, the required portrait withheld). `run.mjs` opens both in a real Chromium against a build of this repository's
tree at the commit that adds this record (a local build with the test's own fake provider, not production): preview, "Add as a preset with this look", choosing the preset, a conversation, and the refusal path.
`result.json` is the recorded output (the hashes in it are of the files actually read).

Result: all six checks passed: the preview names Harbour Clerk and offers the look and adds nothing; Add keeps one preset with its look (folio, sea, reduced motion, portrait 818 bytes and background 2,647 bytes, both PNG, CC0-1.0);
choosing the preset draws the strip with both pictures; a reply panel follows the sea palette; the withheld-portrait export keeps the character as a plain preset and keeps no look; nothing left the page; no page errors.

Limits: one run, Chromium, a script drove it, local build and not the live site, not Safari or a phone, no person used it, no offline test. The files were read from Cosmogenitor's machine path, not from a published address.
