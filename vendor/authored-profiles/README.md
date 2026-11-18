# authored-profiles

Version **1.0.0**. License **AGPL-3.0-only** (see `LICENSE`).

One versioned, self-contained package holding two things that Cosmogenitor owns and that Private Local
Chat (PLC) and other consumers must not copy or re-implement:

1. **The content-bundle consumer**: parse, validate, import and export of `cosmogenitor/content/0`
   documents and `cosmogenitor/bundle/0` bundles, plus the pure consumer projections (PLC preset,
   Sonalon design, Sonalon place).
2. **The authored-profiles extension**: the `authored:*` aspect and profile definitions, the authored
   validator, packaged export/open of authored bundles, and the receiving-fixture projections.

It is **pure and writes nothing**: no files, no network, no storage, no timers, no shared state. Callers
bring bytes in and take results out. Because it writes no shared state it ships no concurrency test.
Node `^20.19.0 || >=22.0.0`; no dependencies; no install step.

## Entry points

```js
import {parseContent, createRegistry, exportBundle, parseBundle, projectPLCPreset} from 'authored-profiles';
import {loadRegistry, validateAuthored, exportAuthored, openAuthored} from 'authored-profiles/authored-profiles';
```

`package.json` `exports`:

| Specifier | File |
| --- | --- |
| `authored-profiles` | `index.mjs` |
| `authored-profiles/authored-profiles` | `authored-profiles/index.mjs` |
| `authored-profiles/content/*.json` | the content schema, starter registry, examples and bundle fixtures |
| `authored-profiles/package.json` | the manifest |

**`authored-profiles`** exports: `CONTENT_FORMAT`, `REGISTRY_FORMAT`, `ContentError`, `checkJSON`,
`validateSchema`, `createRegistry`, `registerDefinitions`, `validateContent`, `validateContentRecords`,
`validateContentRecordChanges`, `parseContent`, `parseContentJSON`, `CONTENT_SCHEMA`, `BUNDLE_FORMAT`,
`DEFAULT_BUNDLE_LIMITS`, `BundleError`, `validatePortableContent`, `selectContent`, `sha256Bytes`,
`exportBundle`, `importBundle`, `parseBundle`, `projectPLCPreset`, `projectSonalonDesign`,
`projectSonalonPlace`.

**`authored-profiles/authored-profiles`** exports: `LIMITS`, `PLC_PROVISIONAL_LIMITS`, `DEFINITIONS`,
`RECEIVING_DEFINITIONS`, `parseDefinitions`, `loadRegistry`, `validateAuthored`, `exportAuthored`,
`openAuthored`, `receivingFixture`.

The authored-profiles contract itself (`PROFILE.md`, `MAPPINGS.md`, `acceptance.md`, examples, fixtures,
resources) is under `authored-profiles/`; start with `authored-profiles/README.md`.

## Layout

- `index.mjs`, `authored-profiles/index.mjs`: the two entry points.
- `src/core/`: `content.mjs`, `content-schema.mjs`, `bundles.mjs`, `consumer-projections.mjs`,
  `providers.mjs` (`bundles.mjs` uses its receipt validator; it is not a public entry point).
- `content/`: `content.schema.json` (source of `content-schema.mjs`), `starter-registry.json`,
  `examples/`, `bundles/`.
- `scripts/print-content-schema.mjs`: prints `content-schema.mjs` from the JSON schema; a test checks they match.
- `authored-profiles/`: the extension, its contract documents, examples, fixtures and tests.
- `tests/core/`: tests of the content, bundle, projection and provider modules.

## Tests

```sh
node --test
```

No dependencies, no network, no Cosmogenitor tree. The release archive ships the tests so a consumer can
run them in its vendored copy. Receiver cross-checks that read the live Sonalon and PLC trees (pinned in
`authored-profiles/receiving-sources.json`) are an optional lane: they run only with
`AUTHORED_PROFILES_RECEIVERS=1` and the pinned paths present, otherwise they are reported as skipped.

## Vendoring

A consumer takes the released archive for an exact version, verifies its SHA-256, unpacks it to a
folder it treats as read-only (for example `vendor/authored-profiles/`), and imports from it. Run
`node --test` in that folder to check the copy. To update, replace the whole folder with a newer
release; never patch it in place.

## Consumers

PLC and Cosmogenitor vendor this package read-only and never edit it. A fix or change is made here,
released as a new version, and re-vendored by each consumer.

## Provenance

The history of the files was extracted from the Cosmogenitor repository (`contracts/authored-profiles`
and the `site/src/core` content modules) with `git filter-repo`; the renames are:
`contracts/authored-profiles/` to `authored-profiles/`, `site/src/core/` to `src/core/`,
`site/content/` to `content/`, `site/tests/` to `tests/core/`, `site/scripts/` to `scripts/`.
