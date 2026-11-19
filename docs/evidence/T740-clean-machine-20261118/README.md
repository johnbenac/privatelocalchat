# T740: the clean-machine check on PLC's neutral release archives (2026-11-18)

The repeatable procedure of the delivery tooling (`selfhost/clean_machine_check.py`, delivery-tooling **1.5.0**, fetched to a scratch folder and verified against its published SHA-256
`3e77cda6...36c2`; not vendored into PLC) was run on PLC's two neutral release zips, built from this repository at the commit that adds this record:
`private-local-chat-2.0.0-runkit.zip` and `private-local-chat-2.0.0-app.zip`. Inputs: PLC's rules (`tests/neutrality-rules.json`, Brand's 0.3.2), PLC's exceptions (`neutrality-exceptions.json`),
the brand asset hashes (`tests/brand-asset-hashes.json`), and the zip's own `serve.mjs` as the serve command (`node {dir}/../serve.mjs --dir {dir} --port {port}`).

Result: **both pass every step that ran**: safe unpack, the scan over the build and the wrapper (nested roots left out), the attribution check at the top of the zip and in `app/`, the attribution check on the archive,
and a loopback serve of every path asked (runkit: `/`, `/help/` and `/about/` from `run-kit/site.json` read as a name-to-path object, and `/NOTICE.md`, `/attribution.json`, `/LICENSE`, `/version.json`,
`/manifest.webmanifest`, `/sw.js`: 9 paths; app: `/` and the same six: 7 paths). `scan_archive` is recorded as skipped by the tool because the build is wrapped (its files were scanned in `scan_folder`).

The earlier run with 1.4.0 (the same day) failed on this layout for the reasons recorded in the T740 note; 1.5.0 fixes them (devops, with PLC's `--skip`).

Limits: one machine, one run per archive, loopback only; the serve step checks that each path answers 200, it does not check the response headers, run the application, or fetch a model; the scans do not prove that
the vendored libraries' fallback address is never requested (no request log yet); this is not the independent check (T746, taskboard). Files here: `result-runkit.json`, `result-app.json`.

## The same check on the PUBLISHED archives, release v0.78.0 (2026-11-19)

Taskboard found that the archives above were built locally and that the published v0.77.0 predates the exceptions and the self-hosting page, so a release was cut through the normal path
(`feat(release): ship the self-hosting page ...`, commit 1da8226; tag v0.78.0, the checksums of the release verified with `sha256sum -c SHA256SUMS`: all three files OK). The check of delivery-tooling **1.6.0**
(fetched to a scratch folder, SHA-256 d17eaef7...a886 verified) was run on the two zips as downloaded from the GitHub release, with the repository's rules, exceptions and brand hashes, and a serve command per target as
the procedure says (the zip's own `node {dir}/../serve.mjs` for the runkit zip, the default static server for the app zip):

- `published-v0.78.0-runkit.json`: unpack (251 files), scan, attribution at the top and in app/, attribution on the archive, and a loopback serve of 9 paths all PASS.
- `published-v0.78.0-app.json`: the same, 7 paths, all PASS.

zip SHA-256 (as downloaded): e0902a7bbe401288... and 49250d09045d092b... (the full values are in the release's SHA256SUMS).
Limits as above: one machine, loopback only, status codes and not headers, not the independent check (taskboard's T746). `run-kit/site.json` is not in a zip (the manifest is baked into the page), so the pages were named with --path.
