# Opening a discovery resource in PLC: plan and contract request

Board: PLC T461 (objective O147), with aiofourown's T452 (done, format 2 version 0.1.0) and T481 (the discovery application). Written 2026-11-18 by the PLC team. A request to read and answer: the
questions are numbered and each has PLC's proposed answer; "agreed" or a correction is enough.

## What exists

- **T452** (accepted): a discovery snapshot lists `resources[]` with `content.version`, `content.media_type`, `content.bytes`, `content.sha256`, `content.url` (the exact bytes at a public https address),
  `rights.license`, compatibility claims and an `inspect` page. One family is released, `preset-candidate`. Receiver `plc` has routes `file` and `link` (exist) and `listing-file` (**not released**: "carries the
  listing's version, size and SHA-256 to the review and refuses a mismatch"). Nothing in discovery fetches, imports or executes.
- **PLC today** (T465, T444, T706): a plain preset file is reviewed and added through **Import preset…** (at most 32,768 bytes; a `#preset=` link at most 12,544 characters); a character package is previewed through
  **Preview character package…** (a file of at most 2 MiB) and can be added as a preset with its look. PLC never fetches a file by itself: no listing is in hand, so it checks nothing against a listing.

## What PLC proposes to build (T461), the `listing-file` route

A discovery page for a resource offers two things: the exact download link (T452 `content.url`), and **Open in Private Local Chat**, a link to the app's address with a fragment that **describes** the file and never
carries it:

    https://<app address>/#resource=<base64url, UTF-8, no padding, of one JSON object>
    { "v": 1, "family": "preset-candidate", "title": "…", "version": "1.0.0", "bytes": 149, "sha256": "<64 lower-case hex>", "license": "CC0-1.0", "page": "https://…/inspect" }

1. **Navigation never imports.** Opening the link shows a box: where it came from, the title, version, size, SHA-256 (first and last characters), licence and the page it came from, and the words "download the file
   from that page, then choose it here". Nothing is added, fetched or changed by opening it.
2. **The person chooses the downloaded file** with a file chooser inside that box. PLC reads it with the same bounds as its own file route (size is checked on the file before it is read), then checks **size equals
   `bytes`, SHA-256 equals `sha256`** (lower-case hex of the file's exact bytes). Any difference is refused whole with a plain message and nothing is added. Then the family's own reader runs (a preset file goes to PLC's
   preset review box, with a line saying it matched the listing; a package goes to the preview), and only **Add** adds anything.
3. **PLC never fetches `content.url`.** The download is the person's browser's. (PLC's network inventory and the CDN's CORS rules stay as they are.)
4. **Bounds.** The fragment is measured before it is parsed: more than 2,048 characters naming `resource=` is refused too long. Exactly these keys, no others; `v` is 1; `family` is a released family;
   `title` at most 120, `license` at most 120, `version` as T452's pattern, `bytes` an integer within the family's maximum, `sha256` exactly 64 lower-case hex characters, `page` an https address without credentials,
   port, fragment or secret-looking query. Anything else, or an unknown version or family, is refused and nothing is changed. Two `resource=` values in one address are refused as ambiguous.
5. **Families.** `preset-candidate` first (file at most 32,768 bytes, then PLC's preset rules). A presentation package becomes a family only when T452 releases it (a new family needs a new T452 version); PLC will
   take it with the 2 MiB bound and the preview first.
6. **The claim.** When this route is released PLC will state `plc / listing-file` as `declared`, and `tested` only with an evidence address of PLC's own.

## Questions, with PLC's proposed answers

1. **The fragment.** Are these the fields a listing page can fill from one T452 resource entry without inventing anything? *Proposed: yes: `family`, `title`, `content.version`, `content.bytes`, `content.sha256`, `rights.license`, `inspect`.*
2. **Who builds the link.** T481's page generator, from the entry, with the canonical JSON key order and base64url without padding; PLC publishes a tiny encoder (`encodeResourceFragment`, as it did for `#preset=`) and fixtures
   (valid, each refusal, oversize) that T481 can run its generator against. *Proposed: yes.*
3. **The app address.** Which address does a page use for PLC? *Proposed: the PLC address the site manifest (`site.json`) names; a copy of the app made by someone else is not assumed, and a page may offer no PLC link.*
4. **Immutability.** The same `(project, id, content.version)` always names the same `sha256` (T452 rule), so a reader that sees a different hash for a version it already opened treats it as a mismatch. *Proposed: agreed; PLC checks only what the link says.*
5. **First real resource.** Cosmogenitor names it (T460/T432); PLC needs one plain preset file and, later, one package to run the real route against. *Proposed: Cosmogenitor's lantern-keeper preset first.*
6. **Where a person ends up if the file does not match.** *Proposed: the box says what differed (size or hash), keeps the listing's details visible, and offers choosing another file; it never says the file is "bad", only that it is not the one listed.*

## What PLC does not claim

No PLC code reads `#resource=` yet; nothing here is a date. The route needs T481's links to be useful, and T481 needs this answer to build them. Browser checks will be recorded separately from fixtures, without any offline test (John's decision: those are T726 to T729).
