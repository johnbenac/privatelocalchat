# Delivery: a neutral app, an attribution block and the shared tooling

Board T740, objective O165; the contract is `/cosmoshot/tools/docs/DELIVERY-CONTRACT-DRAFT.md`. This is how Private Local Chat follows it. The split of the app from the branded site layer is `docs/SITE-LAYER.md`
and the three build targets are `docs/RUN-IT.md`; this page covers what was added: the attribution block and the shared scan.

## What every build says about itself

`scripts/build.mjs` writes, for every target, `NOTICE.md` and `attribution.json` at the root of the output, with the generator of the shared tooling (`tools/delivery-tooling/attribution/attribution.py`):

    # Private Local Chat 2.0.0
    from ai of our own
    Built from commit <40 hex>
    Licence: AGPL-3.0-only
    Source: https://forge.aiofourown.com/programme/privatelocalchat

It comes from the build's own data (the version, the full commit). No setting renames the app or removes it. `LICENSE` ships beside it. The same record is a paragraph in the neutral About and Help pages (between
`<!--attribution-->` markers in `run-kit/pages/`); a site layer's own pages may carry it their way. A release zip's `SOURCE.txt` starts with the same block (our own words about rebuilding follow it) and
`attribution.json` sits beside it. The source address is the repository root on the programme forge, which is valid for every commit; a release may name its per-release source archive instead.

## What is scanned and with what

| Input | Where | Owner |
| --- | --- | --- |
| the engine and the attribution check | `tools/delivery-tooling/` (vendored, read-only, pinned in `vendor.lock.json`) | devops publishes; PLC owns the scan engine and the manifest validator |
| the shared rules | `tests/neutrality-rules.json` (a pinned copy of `/cosmoshot/brand/delivery/neutrality-rules.json`; the run prints its version) | Brand |
| this application's exceptions | `neutrality-exceptions.json` | PLC; Brand reads user-visible ones |
| brand asset hashes | `tests/brand-asset-hashes.json` (the SHA-256 of every file in Brand's packet manifests, so a renamed logo is found) | Brand's packets |
| the host check (optional plug-in) | `docs/evidence/split/network-origins.json` | PLC |

`scripts/delivery-scan.mjs` wires them together for `tests/neutrality.test.mjs` and `scripts/release-hooks.mjs`. Nothing reads outside the repository.

To scan by hand: `node tools/delivery-tooling/scan/neutrality.mjs --rules tests/neutrality-rules.json --exceptions neutrality-exceptions.json --manifests "$PWD/tests/brand-asset-hashes.json" dist`.

## The self-hosting page and the clean-machine check

`docs/SELF-HOSTING.md` is PLC's filled-in copy of the delivery tooling's self-hosting template, one page, and it ships in every release archive. The clean-machine check of the tooling
(`selfhost/clean_machine_check.py`, delivery-tooling 1.4.0) was run on PLC's release archive on 2026-11-18: on a tar of the build folder `app/` the unpack, both attribution checks and the loopback serve of nine paths
pass; the scan step reports only the six exceptions that cover files at the archive's top level (a release zip has the build inside `app/` beside tools and documents), and on the whole zip the check cannot
yet match PLC's layout (the build is one folder down). PLC's own test scans the build and the zip's top level together, which is why it passes (`tests/neutrality.test.mjs`).

## Refreshing a pinned input

- **The tooling**: devops publishes a new version; replace `tools/delivery-tooling/` with its files and run `vendor_check.py pin` (`/cosmoshot/tools/docs/VENDORING.md`); re-run the tests.
- **The rules**: copy Brand's file over `tests/neutrality-rules.json`, read the diff with Brand, fix what the new rules find (or add an exception with a reason), re-run the tests.
- **The brand hashes**: regenerate `tests/brand-asset-hashes.json` from the packet manifests when Brand publishes a packet.

## What is still to prove

The vendored WebLLM and wllama libraries and the embedding worker name a fallback address on a third-party host (`cdn.jsdelivr.net`). By the code it is not reached (the app always gives the wasm location itself), and the
exceptions say so; a browser run that lists every request host while the matching model and a voice load is still to be added, and until it exists the exceptions say "not proven".
