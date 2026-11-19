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
