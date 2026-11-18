# delivery-tooling

The shared tooling for delivering an application without our branding (objective O165, board task T736). The contract it implements is
`/cosmoshot/tools/docs/DELIVERY-CONTRACT-DRAFT.md` (the merged answers of twelve teams on board task T735).

What is here, what is planned, and who owns it:

| Part | Owner | Status |
| --- | --- | --- |
| The attribution generator (`attribution/attribution.py`: `NOTICE.md` and `attribution.json` from a build's metadata, in Brand's exact format, plus a `check` for the positive scan rule) | devops | built, 17 tests (concurrency at 20 repeats); Brand reads a sample |
| The deploy document (invariants for joining a private layer: read-only key, no artifact of the built site, public tests then the layer's tests) | devops | planned |
| The neutrality scan engine and the shared rule file (Brand maintains layers B and C) | PLC (engine), Brand (rules) | engine built (`scan/neutrality.mjs`, tests in `scan/tests/`), reads Brand's `neutrality-rules/1` and each application's `neutrality-exceptions/1`; the shared rule file itself joins the package when Brand and devops agree (it is read from `/cosmoshot/brand/delivery/` for now) |
| The site-layer manifest validator and the check that every asset a page names exists | PLC | built (`validator/site-manifest.mjs`, tests in `validator/tests/`): manifest check parameterised by format and page names, the asset check, and "no layer means no address"; the page generator stays in PLC |

It is published as one versioned generic package on the forge registry (`forge_package.py`) and vendored read-only by each application
with `vendor_check` (`/cosmoshot/tools/docs/VENDORING.md`).

Licence: AGPL-3.0-only (as PLC and model-runtime), see `LICENSE`.

## Tests

Node parts (no dependencies, Node 22): `node --test scan/tests/ validator/tests/`. Python part: `/usr/bin/python3 -m unittest discover -s attribution/tests -v`.

## The scan, in short

`node scan/neutrality.mjs --rules RULES.json --exceptions EXCEPTIONS.json [--no-binary-assets] [--no-attribution] [--archive FILE] [DIR]...` scans folders (or an unpacked
release archive) with Brand's shared rules and the application's exceptions file, then CALLS `attribution/attribution.py check` for the attribution (a missing script is a failure).
An exception may carry `match` (a regex the TOKEN around each individual match must satisfy: the run of characters around it that are not whitespace, quotes, angle brackets or parentheses) to cover one specific string; every other match, even on the same line, still fails. Exit 0 nothing to fix, 1 problems, 2 bad input. Warnings print and never fail. It prints the rule file's version and lists every exception with an `until` at the end.
The host check is an optional plug-in (`--hosts-inventory FILE --hosts-keys a,b`): without it no host is checked. An archive is unpacked into a temporary folder
(`--tmp DIR`; the default is the system temporary folder, which is memory-backed on some machines) and removed afterwards.
