# Receiving matrix

These fixtures describe producer contract compatibility, not installed importers.
`fixtures/*.receiving.json` are complete fixed outputs for each target, including
exact prompts, resource statuses and named omissions/missing sections. Tests compare
every field, not only a validator boolean. `receiving-cases.json` is an executable
16-case per-target matrix for missing resources, required support and four refused
purposes. Unknown required aspects and dependency requirements have separate tests.

| Source / purpose | PLC current subset | Sonalon checked spine target |
| --- | --- | --- |
| Pip, name only | Exact name and labelled authored prompt; no dossier required | Missing identity premise, voice and explicit receiver sections; null candidate |
| Neri, lore/archival fiction | Common premise/motive/contradiction/manner/sample map to prompt; lore, prepared, evidence, media, presentation retained with omissions | Missing voice and receiver sections; no dispositions, home, routines or history invented |
| Bex, prepared puzzle host | Common premise/manner/sample map to prompt; custom festival aspect/profile and rich material retained with omissions | Missing voice and receiver sections; no fabricated psychology to satisfy schema |
| Required prepared or festival profile | Refuse before projection/validator callback | Refuse before projection/validator callback |
| Missing required Neri bytes | Metadata transport valid; receiving candidate refused | Metadata transport valid; receiving candidate refused |
| Missing optional Bex cue | Explicit omission, plain text remains a candidate | Explicit omission plus existing missing authoring report |
| Fresh design | Candidate for explicit fresh local preset creation; receiver generates ID | Only a complete explicitly authored design can create a fresh resident; examples here are partial |
| Archive as new / copy | Unsupported here; no silently reused individual or backup restore | Existing T412 archive profile is a distinct new paused copy with exclusions; this authored boundary does not implement it |
| Report offering | Synthetic entries are transported, never inserted into memories | Unsupported cognitive admission; report is not firsthand memory |
| Attach / host movement / continuation | Refused; preset ID, name, hash and source report grant no authority | Refused; lifecycle, fencing, instance/run/body/participant authority belong to receiver |

The positive Sonalon **integration** uses the already committed T15 Emma rich source,
read without adding a fourth default package. `receiving.test.mjs` changes its explicit
`sonalon:design-metadata.designId` to `design:t415-mapping-control`, designVersion
to `4.2.0`, adds explicitly optional T415 guidance/profile, exports and opens the
actual T15 bundle, calls `receivingFixture` with the real pinned runtime schema,
checks named omissions, and creates two fresh in-memory
records with distinct receiver IDs. It is labelled a control, not a fourth new
example or proof that Neri/Bex are Sonalon-complete.
Its required-guidance variant refuses before the schema callback or any candidate.

## Explicit mappings and ownership

| Field | Mapping / limitation |
| --- | --- |
| Content subject ID | Authored design subject; no conversion to individual/run/participant/body/account/CP signer |
| authored:identity-v1 designId/revision | Portable authored design attribution, retained as data; not a receiving resident ID |
| PLC candidate ID | Existing `cosmogenitor:subject:*` projection metadata; real backup helper replaces with a fresh local ID |
| PLC name / prompt | Existing common-content projection only; summary composed into prompt; exact value fixtures supplied |
| Sonalon designId/designVersion/schemaVersion | Only explicit `sonalon:design-metadata` supplies these; no guessed subject-ID conversion |
| Sonalon authored identity/voice | Common label/premise/voice fields plus explicit receiver identity metadata/voice sections |
| Sonalon remaining authored/start | Explicit `sonalon:authored-sections` and `sonalon:start`; required missing content reported rather than filled |
| Report individual/run/participant | Source assertions with separate fields; never receiving identities, authenticated persons or ambient authority |
| Asset hash | SHA-256 of exact supplied resource bytes; not individual identity, author authentication or licence verification |

T465 remains independently in progress at the fresh board read. Its changing
uncommitted parser/store/UI are not accepted dependencies or silently imported.
The executable PLC evidence uses the accepted, exact-byte `createBackups` helper
with an in-memory host and checks all three prompts/IDs; it does not manufacture a
backup file or exercise vault/browser persistence. T222 owns rich admission; T428
identity persistence; T429 authorized context; T444 presentation; T455 prepared
execution; T456 media playback. Sonalon owns T28 and lifecycle/cognition/runtime.

`receiving-sources.json` pins four actual helper/schema files. Tests refuse changed
bytes or missing sources instead of skipping. Sonalon target is the retained
continuity-review spine checkout at the recorded revision, not a claim about main
or a later release. Runtime schema helper acceptance is not Ajv CLI/browser/XR proof.

No callback, fixture acceptance or bundle hash makes `admissionReady` or
`runtimeReady` true. A trusted caller may supply a real synchronous receiver shape
validator and get `shapeAccepted`; admission remains a receiver transaction and
requires explicit review, resource staging, authorization and lifecycle support.

## Exact producer capability boundary

Both targets support only `fresh-design`. `archive-as-new`, `reported-experience`,
`attach-existing`, `move-authoritative-host` and every other purpose refuse. The
only interpreted profile is the exact accepted `profile:character` version `0`.
PLC consumes exact T15 version `0` definitions `core:identity`, `core:dossier`,
`core:communication`. Sonalon consumes exact T15 version `0` `core:identity`,
`core:voice`, `core:communication`, `sonalon:design-metadata`,
`sonalon:authored-sections`, `sonalon:voice-sections`, `sonalon:start`.
`receiving-definitions.mjs` records these semantic contracts and tests compare them
with accepted repository sources. Same-version substitution is unsupported too.
Any other profile/aspect is retained and named as an optional omission or refuses
if required, including inherited required profiles and dependency subjects.

Authored v1 guidance declares `plain-text-v1` or `role-messages-v1`; neither
receiver implements these rich adapters here. Lore, prepared states, presentation,
media and evidence are likewise transported, never executed or cognitively admitted.
Verified required resource bytes are prerequisites; verified bytes do not imply
playback, disclosure authorization or licensing acceptance.

PLC T465-c limits remain **provisional contract evidence**, pending an accepted
owner pointer: name 120, prompt 8000, id 200 JavaScript string.length code units; JSON file 32768 UTF-8
bytes; unpadded base64url UTF-8 JSON fragment value 12288 characters. The provisional
whole-fragment envelope allows 12544 characters, including the `preset=` key and
other parameters; this producer supplies only the candidate, no extra parameters.
`receivingFixture` defaults to `route: 'file'`, checking field and file bounds
independently of fragment length. Select `route: 'fragment'` to additionally check
the unpadded base64url value length (`ceil(4 * UTF8Bytes / 3)`) and canonical
`preset=` envelope (excluding `#`). No extra parameters are supplied or URL fetched.
A file-valid Unicode candidate remains available when fragment selection refuses;
unknown routes refuse explicitly. Incompatible selected routes refuse before the
validator callback, without truncation. These are bounded compatibility checks,
not full receiver text validation or admission. Sonalon has no fragment route here.
All three normal outputs equal the old T15
`{id,name,prompt}` projection exactly; summary is already in prompt. This is no
claim that a current T465 implementation is accepted or that rich T222 is delivered.
