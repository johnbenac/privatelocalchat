# Rich character packages (review, phase A)

Board task T222, phase A: the pure, bounded reader and structured preview for a producer package (Cosmogenitor T415 authored profile bundle,
`cosmogenitor/bundle/0`). **Nothing here writes, admits, shows a UI or claims a runtime.** The local writer is phase B, `docs/CHARACTER-STORE.md` (store, lock, concurrency and
crash tests); the review UI and browser, vault and temporary-chat proof are still to do. The simple `{id,name,prompt}` preset (`#preset=`,
`docs/PRESET-IMPORT.md`) is a different, unchanged route; a package is never reduced to it.

## API (`chat/characters/character-package.mjs`)

| Function | Does |
| --- | --- |
| `checkPackageFileSize(size)` | the chosen file's size, before it is read |
| `reviewCharacterPackageFile(text, options)` | file route: bounds, then the producer's full validation, then the candidate |
| `readCharacterFragment(hash)` / `reviewCharacterPackageFragment(hash, options)` | `#character=<base64url>` link route; `null` when the address holds no package |
| `encodeCharacterFragment(text)` | builds such a link (senders, tests) |

Result: `{ ok: true, candidate }` or `{ ok: false, code, message, errors? }`; a refusal never carries a partial candidate.
Options: `purpose` (`fresh` default, `copy`, `update` + `targetIndividualId`), `subjectId` (needed when the package does not select exactly one
subject), `crypto` (Web Crypto; the global by default), and the trusted local adapters `openExternal` + `hasherFactory` for external bytes.

## Limits (checked before any JSON or byte work)

* **File:** 1,399,128 bytes (the producer's own bound: 1 MiB metadata + 256 KiB inline bytes as base64 + slack); checked as a file size, then as string
  length and UTF-8 bytes. Producer fixed limits apply inside (256 records per collection, 64 aspects per subject, 64 KiB per inline asset, 256 KiB inline total,
  8192 characters per prose field).
* **Fragment:** the whole fragment is measured first (at most 65,536 + 512 characters when it names `character=`; a long fragment that does not name it is
  somebody else's and is left alone), then the value (65,536 base64url characters = 48 KiB decoded). A fragment carries **metadata only**: any asset that is not
  `missing`, or that carries data, refuses. A name-only package (Pip, about 15 KB) fits; Neri and Bex, whose bytes are inline, do not. Bytes never travel in an address.
* No URL is ever fetched. External bytes are read only through the caller's `openExternal` and hashed through the caller's `hasherFactory`; without them refuses `external-bytes`.
  The stream is read once: while the producer verifies it, bounded copies of exactly those chunks are kept (a source that reuses its buffer cannot change them) and the second
  producer pass reads the kept bytes. A resource is `verified-external` only when `resourceBytes(hash)` returns them (`retained: true`).

## What is verified (by the vendored producer code, not by advertised versions or hashes)

Safe JSON with duplicate-key refusal, exact envelope fields, the bundle root hash, byte size and SHA-256 of every inline/external asset, the record manifest and
dependency closure, protected definitions compared whole with the shipped ones (a weakened schema with a recomputed root refuses `profile-version`), declared
value versions, authored semantics (audiences, derivations, conditions, undeclared media), and the receiving projection, which reopens and reverifies the package.

## The candidate

`candidate` is deeply frozen, memory only (`persisted: false`, `admissionReady: false`, `runtimeReady: false`):

* `transport` (format, root, visibility, audience, selection, size), `subject`, `design` (design id, revision, author and the producer's candidate id: **unverified source claims**),
* `preview.name` / `preview.instructions`: the producer's plain projection, checked with the simple importer's text rules,
* `capabilities`: `text` (ready), and per owner `lore` (T429), `guidance` (T442, with the declared adapters), `prepared` (T455), `presentation` (T444), `media` (T456),
  `evidence` (T428/T418) and `other` (unknown optional meanings): `retained-structured` with `executionReady: false`, or `absent`,
* `structured.<capability>`: the exact aspect values, claims and scope, usable later; **never appended to the prompt**,
* `omissions`: the producer's named optional omissions, unchanged; `resources` (status `verified-inline`/`verified-external`/`missing`, required, text/media preview);
  `resourceBytes(hash)` returns a copy of verified bytes,
* `unverifiedSourceClaims`: evidence entries with their individual/run/participant assertions, always `verified: false`, `authority: 'none'`,
* `package`: the verified content (dependency subjects included), definitions, receipts and support report,
* `source`: the complete verified original transport as plain JSON (`{ format, root, envelope, bytes }`: the bundle envelope with its record and asset manifests, minus inline data, and every retained
  resource's exact bytes in base64); `reopenCharacterSource(source, { subjectId })` verifies it again through the producer validators and `bundleTextFromSource` rebuilds the bundle text,
* `individual`: `individualId: null`. A local id is made by the local store at admission; no source id, name, design id, preset id or hash selects a life.

## Refusals (all before any partial result)

Required aspect or profile this version does not consume (`required-aspect`, `required-profile`), required bytes missing (`missing-resource`), unknown or
incompatible versions or definitions, byte/root mismatch, malformed/oversized/deep/duplicate-key input, unknown fields, and any purpose other than `fresh`, `copy`
and `update` (`continue`, attach, host movement, report-memory, archive restore: `purpose`, refused before the package is read). Optional unsupported meanings
are named omissions, not errors.

## Vendored producer code

`chat/characters/vendor/t415/` holds eight pure modules (authored profile, definitions, T15 content, bundles, consumer projections, content schema, providers)
copied byte-exact from the accepted T415 source `de5e9231730cc2b0d3a6725d006a5d3d48878fd0`; `SOURCE.json` records source path, size and SHA-256 of each, and of the fixtures in
`tests/fixtures/characters/` (the three real bundles, their content sources, definitions, the original CC0 resources and the producer's receiving fixtures).
`tests/character-package.test.mjs` fails when any file differs. The source repository has no licence file; its fixture resources are CC0-1.0 (`resources/NOTICE.md`).
The modules mention another receiver's vocabulary (`sonalon:`): it is a scoped entry in
`tests/neutrality.config.json` and `docs/evidence/split/network-origins.json`.

## Tests

`node --test tests/character-package.test.mjs`: all three real bundles against the producer's receiving fixtures; structured retention and byte retention;
byte, root, definition and version tamper; false required capabilities; missing required/optional bytes; external adapters; purposes; bounds and unsafe input;
fragment route; no network, storage or eval. No shared state is written, so no concurrency test belongs to this phase.
