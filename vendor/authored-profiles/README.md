# authored-profiles

Version **1.1.0**. License **AGPL-3.0-only** (see `LICENSE`).

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
import {openAuthored, projectPLCPreset} from 'authored-profiles/neutral';
```

`package.json` `exports`:

| Specifier | File |
| --- | --- |
| `authored-profiles` | `index.mjs` |
| `authored-profiles/authored-profiles` | `authored-profiles/index.mjs` |
| `authored-profiles/neutral` | `neutral/index.mjs` (new in 1.1.0) |
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

**`authored-profiles/neutral`** exports: `LIMITS`, `DEFINITIONS`, `parseDefinitions`, `loadRegistry`,
`validateAuthored`, `openAuthored`, `projectPLCPreset`. See the next section.

The authored-profiles contract itself (`PROFILE.md`, `MAPPINGS.md`, `acceptance.md`, examples, fixtures,
resources) is under `authored-profiles/`; start with `authored-profiles/README.md`.

## The neutral entry

`authored-profiles/neutral` is for a consumer that must carry **nothing of other projects**: a copy of it
may be handed to others, so none of its files may name a sibling project, an organisation, an operator's
host or any web address. Its import closure is a small set of files (list them with
`node scripts/neutral-closure.mjs`):

```
authored-profiles/authored-engine.mjs   authored-profiles/authored-util.mjs   authored-profiles/definitions.mjs
neutral/index.mjs   src/core/bundle-engine.mjs   src/core/content-engine.mjs
src/core/content-schema.neutral.mjs   src/core/plc-projection.mjs   src/core/projection-kit.mjs
src/core/providers.mjs
```

What it exports, with the same behaviour and signatures as the main entries:

- `openAuthored(input, options)`: open and validate an authored bundle or package (a JSON string or the
  parsed object): bounded size, duplicate keys, safe JSON, dependency closure, exact bytes, the neutral
  `authored:*` definitions and their rules. Throws `BundleError` or `ContentError` on a refusal.
- `projectPLCPreset(document, registry, options)`: a plain preset `{id, name, prompt}` from a character's own
  text, with a report of what was mapped, omitted or missing.
- `parseDefinitions`, `loadRegistry`, `validateAuthored`, `LIMITS`, `DEFINITIONS`: the pieces `openAuthored`
  is made of, for callers that load definitions or validate a document themselves.

What it leaves out: `exportAuthored`, `exportBundle` and the other writers (a bundle written by it would
differ from the main entry's, see below), `receivingFixture`, the receiver projections and the receiver
aspect definitions (`RECEIVING_DEFINITIONS`). Those stay in the main entries, whose behaviour is unchanged.

**What it does with receiver aspects (`sonalon:*`).** The neutral modules cannot name them and have no
definition of them. A `sonalon:*` aspect is therefore treated like any other aspect that is not one of the
neutral definitions, exactly as the main entry's `openAuthored` treats it, and never crashes: if the bundle
does not carry its definition, the bundle is opened with `support.supported === false` (and
`support.executionReady === false` when the aspect is `required`) and an `unsupported-definition` entry for
each, and `projectPLCPreset` refuses a document whose required aspect is not loaded (`unsupported-required`,
`value: null`). If the bundle carries the definition itself, the aspect is transported and not interpreted;
`projectPLCPreset` lists it as `unmapped-aspect` in `report.omitted` and copies nothing from it. The neutral
entry cannot refuse such a bundle by name; a consumer that wants to refuse every aspect it does not know
checks `candidate.document` against the definitions it accepts.

**The schema.** `content/content.schema.json` carries a `$schema` annotation that is a web address. The
validator never reads it (`validateSchema` treats it as a known annotation and only follows local `$ref`s), so
the neutral closure uses `src/core/content-schema.neutral.mjs`, generated by
`scripts/print-neutral-content-schema.mjs` as the same schema without `$schema` (its `$id` is a `urn:`). The
neutral entry accepts a registry whose schema is that schema with or without the annotation, so every bundle
of this package opens unchanged; any other difference in the schema is refused as before. A test regenerates
the module and compares it byte for byte.

**How to vendor only the neutral closure.** Copy exactly the files that `node scripts/neutral-closure.mjs`
prints, keeping their relative paths, into the consumer's tree, and import `neutral/index.mjs`. Nothing else
is needed: `LICENSE` and the docs are not modules and are carried by the consumer separately. To check the
copy, run `node --test tests authored-profiles` in a full release, which scans the closure with the
neutrality rules of Private Local Chat (a copy embedded in `tests/neutral.test.mjs`).

### Changes in 1.1.0

Added the `authored-profiles/neutral` entry point and `scripts/neutral-closure.mjs`,
`scripts/print-neutral-content-schema.mjs` and `tests/neutral.test.mjs`. To make a closure without any
receiver content possible, the code of `content.mjs`, `bundles.mjs`, `consumer-projections.mjs` and
`authored.mjs` was split: the shared code moved into `content-engine.mjs`, `bundle-engine.mjs`,
`projection-kit.mjs`, `plc-projection.mjs`, `authored-engine.mjs` and `authored-util.mjs`, which take the
schema as a parameter, and the original modules bind the published schema and keep their exports and behaviour
exactly. A comment in `providers.mjs` no longer names a downstream project. The two existing entry points are
unchanged for existing consumers.

## Layout

- `index.mjs`, `authored-profiles/index.mjs`, `neutral/index.mjs`: the three entry points.
- `src/core/`: `content.mjs`, `content-schema.mjs`, `bundles.mjs`, `consumer-projections.mjs` (the main
  entry's modules, bound to the published schema) over `content-engine.mjs`, `bundle-engine.mjs`,
  `projection-kit.mjs`, `plc-projection.mjs`, `content-schema.neutral.mjs`; `providers.mjs` (`bundles` use its
  receipt validator; it is not a public entry point).
- `content/`: `content.schema.json` (source of `content-schema.mjs`), `starter-registry.json`,
  `examples/`, `bundles/`.
- `scripts/print-content-schema.mjs`: prints `content-schema.mjs` from the JSON schema; a test checks they match.
- `scripts/print-neutral-content-schema.mjs`: prints `content-schema.neutral.mjs`; `scripts/neutral-closure.mjs`:
  lists the neutral entry's import closure.
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
