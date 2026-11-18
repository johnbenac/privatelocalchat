# Rich authored profiles v1

T415 delivered producer artifacts. See [PROFILE.md](PROFILE.md) for meanings, bounds and privacy;
[MAPPINGS.md](MAPPINGS.md) for exact receiving scope and [contract-request.md](contract-request.md)
for historical review questions/source corrections. [acceptance.md](acceptance.md)
records actual final independent Cosmogenitor and PLC receiving-domain reviews,
separate Sonalon owning agreement, exact report copies and requirement evidence for
publication e1baa84 / implementation b0bbd6d. PLC review is not PLC owning-team
implementation acceptance; T465 limits remain provisional guidance. Root checks
ledger publication before board closure/readiness updates; no human approval gate
or runtime/public release is claimed. T412 acceptance remains the prerequisite.

## Use

```js
import {loadRegistry, parseDefinitions, exportAuthored, openAuthored, receivingFixture}
  from './authored.mjs';
const registry = loadRegistry(parseDefinitions(starterRegistryText),
  parseDefinitions(authoredDefinitionText));
// Local custom resources use registerDefinitions(registry, parseDefinitions(text)).
// Source documents use the existing parseContent(text, registry) safe JSON reader.
const bundle = await exportAuthored(document, registry, {
  selection: {kind: 'subject', ids: ['subject:neri']},
  visibility: 'private', audience: ['my-devices'], byteMode: 'inline',
  readAsset: async hash => localBytes.get(hash)
});
const inspected = await openAuthored(JSON.stringify(bundle));
const plc = await receivingFixture(bundle, {target: 'plc', subjectId: 'subject:neri'});
// plc.value is an unadmitted plain preset candidate; omissions remain explicit.
// Default route is 'file'. Explicitly select 'fragment' to check link compatibility:
const linkCandidate = await receivingFixture(bundle, {
  target: 'plc', subjectId: 'subject:neri', route: 'fragment'
});
// A fragment refusal does not invalidate a successful file candidate.
```

Inputs to content/definition/bundle entry points are untrusted data. API options,
crypto and byte-reader implementations, and synchronous receiver validator
callbacks are trusted local adapters, never loaded from package data. Node callers
on hosts without global Web Crypto explicitly supply `crypto: webcrypto`. Definition
JSON and its runtime snapshot are equal by test. Known authored definitions cannot
be replaced with weaker schemas or newer versions; arbitrary custom namespaces
remain extensible. The module has no storage writer, clock, network or model API.

`validateAuthored(document, registry, {visibility})` returns content diagnostics plus
bounded authored semantic errors. `openAuthored` calls actual T15 parse/import first,
checks exact bytes, then authored semantics. Unsupported optional definitions remain
transported with support diagnostics. Required unknown transport may be inspected
with executionReady false; receiving projection refuses it atomically. A projection
reopens/reverifies its bundle so a caller cannot supply a forged verified-byte Map.

The limits in `LIMITS` are fixed guards for this authored encoding; caller options
cannot increase them. T15's larger independent library/export contract is unchanged.
External-byte verification uses explicit trusted local stream readers and hashing;
there is no URL resolution. This is not a durable filesystem archive writer.

PLC's provisional field limits use JavaScript string.length; its file limit uses
UTF-8 JSON bytes. Fragment selection adds unpadded base64url value and envelope
limits. Unknown routes refuse. Every incompatible selected route refuses before
the receiver validator callback; candidates are never truncated. See MAPPINGS.md
for exact units and the provisional owner-source boundary. No fragment route is
defined here for Sonalon.

## Exactly three new packages

| Source / real bundle | Authored contrast | Verified resources |
| --- | --- | --- |
| examples/minimal.content.json / minimal.bundle.json | Pip: genuinely partial, name only, zero aspects or assets | None |
| examples/neri.content.json / neri.bundle.json | Reflective archival fiction, uncertainty, selected contextual lore, private drafting, role-message guidance, restrained prepared offer, folio presentation, authored seed, relationship/place context | Original abstract 2x2 PNG chart and fictional text card; both required |
| examples/bex.content.json / bex.bundle.json | Theatrical mechanical puzzle host, offered conditional variants and generative exits, dialogue presentation, synthetic report/derived summary, unfamiliar festival profile/aspect | Optional 0.1-second synthetic 440 Hz WAV cue, no speech |

The source documents are content; the `.bundle.json` files are actual outputs of
the existing `exportBundle` implementation through `exportAuthored`, including
dependency closure, registry definitions, record/asset manifests, root hashes and
inline bytes. Tests reproduce exact complete bundles and import/re-export them.
Source availability is deliberately changed to missing in bundle metadata; byte
verification and eventual receiver placement remain distinct. All original fixture
material is synthetic/authored, never model output or private owner material.
`resources/manifest.json` records exact hashes/sizes and CC0 attribution. No portrait,
voice identity, model quality, actual encounter or real navigation asset is claimed.

T15's existing Emma fixture plus optional T415 data is used as an actual bundle
and receiving integration with the pinned Sonalon schema/create helper. It is
not copied into these packages and is not a fourth new authored example. These
three partial characters remain honestly incomplete for Sonalon. The rich portable
resources do not require every character to have a complete resident psychology.

## Verification

Run from repository root, without installing dependencies or starting services:

```sh
node --test authored-profiles/tests/authored.test.mjs
node --test authored-profiles/tests/corrections.test.mjs
node --test authored-profiles/tests/receiving.test.mjs
node authored-profiles/validate.mjs
node --test tests/core
node --test
```

(Paths are those of the standalone `authored-profiles` package. The continuity contract checks of the
original Cosmogenitor tree are not part of this package. Receiver cross-checks against the live Sonalon
and PLC trees are an optional lane, `AUTHORED_PROFILES_RECEIVERS=1`; see the package README.)

The standalone authored suite uses committed original/synthetic fixtures only.
The receiving suite fails rather than skips if its four pinned read-only owner
sources are absent/changed; it tests actual PLC prompt retention/fresh helper IDs,
Sonalon incomplete refusal, and accepted Emma plus optional T415 bundle integration
and required refusal. The original spec entry points `tests/authored-profiles.test.mjs`
and `validate-examples.mjs` execute these real tests and exact fixture checks. Owner
runtime/browser/storage/cognition tests are separate obligations. No new shared
state writer ships, so no concurrency/crash test is needed for this pure module.
Existing T15 storage and receiving owners retain their concurrency obligations.

Tests assert fixed bundle roots, full exact projections, byte digests/content,
dependency records, claims/audiences, privacy/redaction, definitions/versions,
invalid conditions/references, genuine import refusal, duplicate/unsafe/oversize
input, resource readiness, optional omissions, required refusal before callbacks,
no mutation and no network/eval. Validation cannot authenticate authors, history,
licence title, actual cognition or trust arbitrary prose. Bundle hashes establish
byte integrity, not real-world authenticity or continuation authority.
