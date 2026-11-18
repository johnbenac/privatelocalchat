# Opening a resource from a discovery page

Board task T461 (objective O147), with aiofourown's T452 (discovery format 2, version 0.1.0) and T481 (the discovery application). The agreed contract is `docs/contracts/discovery-opening/contract-request.md`
(aiofourown answered 2026-11-18: all six questions agreed, one correction about long entries, one addition about the claim).

## What a person sees

A discovery page lists a resource (today only a plain character preset) with its exact download link and, when the entry's claim for receiver `plc` route `listing-file` is `declared` or `tested`,
an **Open in Private Local Chat** link. Opening that link in PLC:

1. shows **Open a resource from a discovery page**: name, kind, version, size, a short form of the SHA-256, licence and the page it came from. It says nothing has been added and that PLC does not download the file for you.
2. The person downloads the file from that page and presses **Choose the downloaded file…**. PLC checks, in this order, that the file's size equals the listed size (before reading it) and that the SHA-256 of its exact bytes equals the
   listed one. A difference is refused in the box with what differed ("This file is N bytes, but the listing says M" or "the right size but a different checksum"), never calling the file bad, and the box offers another file.
3. A match goes to PLC's own **Review preset** box ("Read from a file from a discovery listing", "This file matches the listing: version …"). Only **Add preset** adds anything.

Nothing is fetched by PLC: not the file, not the page. The address is not changed. A link that is too long, names two resources, has an unknown field, an unreleased family or a page that is not a plain https address is refused once, with
nothing changed. Preset links (`#preset=…`) and ordinary addresses are unaffected.

## The link

`https://<app address>/#resource=<base64url of {v,family,title,version,bytes,sha256,license,page}>`, exactly those keys in that order, compact JSON, UTF-8, no padding, at most 2,048 characters of value (a page whose entry would not fit
leaves the link out and keeps the download link; it never cuts a field). Lengths count UTF-16 code units, like PLC's preset limits. `chat/assistant/resource-link.mjs` reads, checks and encodes it (`readResourceFragment`,
`checkResource`, `encodeResourceFragment`, `checkResourceFile`); `chat/assistant/resource-open.mjs` is the box.

## For the page generator (T481)

`tests/fixtures/discovery-opening/cases.json` has 63 cases made by `tests/helpers/make-resource-cases.mjs` (valid ones with the resource they are built from and the exact fragment; each refusal with its code; links that must be left out). A test fails if the file differs from the
generator, and aiofourown's generator tests run against a copy pinned by PLC's commit. PLC's encoder is `encodeResourceFragment` in `chat/assistant/resource-link.mjs`.

## Tests

`tests/resource-link.test.mjs` (every case, the encoder, the file check, page addresses; five deliberate breakages each fail it) and, in a real browser, `node scripts/e2e.mjs resource-open` (the box shows what the link describes and fetches nothing; a short file and a same-size file with other content are refused with what differed;
the right file reaches the preset review and only Add adds; six kinds of bad link give one message and change nothing; preset links and ordinary addresses are unchanged). The real preset used is Cosmogenitor's producer output (`tests/fixtures/presets/`).
No offline test is part of this (John's decision: T726 to T729).

## Not done

- Presentation packages are not a family of the discovery format yet; when T452 releases it, the same route takes it with the 2 MiB bound and the preview first.
- The live claim: PLC tells Cosmogenitor to move `plc / listing-file` from `not-released` to `declared` once this is live; the page shows the link only then.
- Nothing links to PLC from a real discovery page until T481 builds the pages and Cosmogenitor's public inspect pages exist.
