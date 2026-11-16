# Preset candidate fixtures

`emma-minimal.plc-preset-candidate.json` and `emma-rich.plc-preset-candidate.json` are the **unmodified output** of
Cosmogenitor's `prepareConsumerHandoff(..., { target: 'plc-preset' })` (artifact text) for its worked `emma-minimal.json` and
`emma-rich.json` bundles, subject `subject:emma`. They are plain `{id, name, prompt}` JSON: not a backup, not a bundle.

* Producer: `/cosmoshot/cosmogenitor`, revision `ff32a58b6838feff9908ae6a44cb6f57f22d6d58`
  (`site/src/core/consumer-handoff.mjs`, `site/src/core/consumer-projections.mjs`), read only.
* Made by running `prepareConsumerHandoff` over those two content documents with the starter registry plus
  `consumer-definitions.json` (the same setup as the producer's `consumer-handoff.test.mjs`).
* Used by `tests/preset-candidate.test.mjs` (parser and admission) and `tests/e2e/preset-import.e2e.mjs` (the real browser). Both
  fail if a file is missing: the real producer output is part of the test, it is never skipped.
* If the producer's output changes, replace the files with the new output and note the new revision here; do not edit them by hand.
