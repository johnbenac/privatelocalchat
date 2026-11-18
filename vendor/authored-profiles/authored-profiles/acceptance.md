# T415 receiving and independent-verification ledger

Recorded 16 November 2026 after all three actual final reports existed and agreed.
Reviewed publication: **e1baa84b82640c071f891f530a551dfa2436ee6a**,
tree `178c711f1c8bfe8c6e0deead31880cbf610a3660`.
Reviewed implementation: **b0bbd6d3996b12742c5e6bef503c4453f2447a23**.
Its publication changes only the receiving request. This ledger publishes review
evidence and bounded documentary status pointers; it preserves all reviewed
implementation, definitions, examples, resources, fixtures, tests and CLI bytes.

Cosmogenitor owns the authored producer contract; receivers retain admission and
implementation authority. **Root retains independent publication verification,
T415 closure and final downstream readiness updates.** T415 remains in progress
at this publication. Closure follows checked publication and recorded autonomous
verification, with no new human approval gate. This is no runtime/public release.

## Prerequisites and start checkpoint

T15 and T412 were DONE before T415 implementation started. The fresh T415 board
read confirms both dependencies. T412 was independently accepted at publication
`ec099c7dabc5c1be99bb936aee482cc9769805f8`, reviewed implementation
`17b0a6e840e6372c7f5ce5eb4b5bf00b062449eb`, index 1.0.2; see
[`../continuity/acceptance.md`](../continuity/acceptance.md). Its ledger's pending
closure sentence is historical: root subsequently closed T412 before launching
T415 at 16:00 EST. T412 or planning agreement is not T415 receiving acceptance.

Ledger executor checkpoint, 2026-11-16 17:08 EST: isolated normal clone
`/var/lib/cosmoshot/relay/executor/t415-authored-profiles-20261116/checkout`,
main at exact e1baa84, tracked clean, with only pre-existing untracked hook configs
`.commitlintrc.cjs` and `.gitlint`. Read-only configuration inspection returned
`file:.git/config false` for rebase.autoStash. Ordinary pristine `git pull --rebase`
returned `Already up to date.` and HEAD stayed exact. No configuration change,
stash, reset, force operation or original dirty-worktree operation was used here.
Fresh complete board response and start checkpoint are retained under
`/var/lib/cosmoshot/relay/executor/t415-acceptance-ledger-20261116-b/` as
`board-start.md` and `start-checkpoint.md`.

## Actual review roles and exact reports

All three reports independently agree on exact e1baa84 / b0bbd6d with no blocking
producer correction. These complete reports are copied verbatim, not rewritten
as executor or owner approval. Original-path and copy SHA-256 values are identical.

| Role and actual disposition | Published complete report | Original report path | SHA-256 |
| --- | --- | --- | --- |
| Independent Cosmogenitor content-contract reviewer, Codex: agree at authored-profile, packaging, pure validation and producer-receiving fixture scope | [cosmogenitor.md](reviews/cosmogenitor.md) | `/cosmoshot/cosmogenitor/docs/reviews/t415-final-independent-review-20261116.md` | `273ad8fe8b2d178ae3d869cb95d91c448af45d7308225cc7e3b2a430ecf58a11` |
| Independent PLC receiving-domain reviewer, Codex agent `/root/consumer_handoff`: agreement at producer contract / receiving-domain boundary | [plc.md](reviews/plc.md) | `/cosmoshot/cosmogenitor/docs/reviews/t415-plc-independent-receiving-review-20261116.md` | `5f29399b377120ebbc024925852ebd95828a0a326be67a3a440b042907a92e5a` |
| Owning Sonalon session `01a1e16e-af17-7872-9380-64671234130a`, Codex: agreement at exact producer-contract scope | [sonalon.md](reviews/sonalon.md) | `/var/lib/cosmoshot/sonalon-discovery-20261116/t415-sonalon-final-receiving-review.md` | `e3850267932ac33034e0502d5d1fb13f98a6a28783a3aa2e89699a6e2ea4223b` |

PLC's owning agent explicitly routed the new T415 audit to another independent
receiver reviewer because its bounded T34/T465 goal excluded that audit. The
actual PLC report is independently authored receiving-domain review, commissioned
by the Cosmogenitor orchestrator. It is **not** main PLC agent personal signoff,
PLC owning-team implementation acceptance or T465 acceptance. Sonalon's owning
review is separate actual agreement. No all-owner implementation claim follows.

Root's complete audit is
`/cosmoshot/cosmogenitor/docs/reviews/t415-root-completion-audit-20261116.md`.
Fresh T415 notes record routing at 16:43 EST, actual Sonalon agreement at 16:43 EST
(root identifies note 2084), and all final report hashes/roles at 16:51 EST.
The live authoritative status is [T415](https://cosmoshot.benac.dev/#task=415).

## Active completion-goal requirement matrix

Paths in this table are relative to this directory. The completion goal is accepted
T412 followed by T415's rich authored producer profile and actual fixture reviews;
the broader application/release roadmap remains separately owned.

| Requirement | Inspectable evidence | Verified scope and remaining boundary |
| --- | --- | --- |
| Accepted prerequisite then accountable delivery | T412 acceptance/pins above; T415 assignment and executor/verification notes | T412 closed before T415 started; Cosmogenitor owns producer delivery, root closes after verification |
| Preserve extensible content and independent local/default use | `authored.mjs`, `definitions.mjs`, `definitions.v1.json`; actual T15 registry/export/import APIs; custom festival definitions | Seven versioned optional aspects using existing mechanisms; local files/defaults/custom resources share loaders, no account/service/model dependency or workflow migration |
| Character design, contextual lore and generative guidance | `PROFILE.md`, Neri/Bex sources, tests | Explicit author/design/revision; contextual eligibility, priority, insertion and budget; instructions/examples with declared model-independent adapters, no fixed model catalogue |
| Prepared interaction and reusable presentation | Prepared/presentation definitions, Bex variants and transitions, tests | Finite data-only variables/conditions/states/media/exits, checked references and alternatives; no package script/app authority or compelled resident choice |
| Media dependencies, purpose, size and declared rights | `resources/manifest.json`, `resources/NOTICE.md`, typed links, validator and fixed bundles | Required/optional bytes and bounded standard/custom rights; original CC0 chart/card/non-speech tone; verified bytes establish neither license title nor generated media quality |
| Attributed seeds/reports and narrower derivation | Evidence definition, Neri seed, Bex synthetic report/derivative, ordinary `reported` roundtrip/negative tests | Source/occurrence/individual/run/participant/audience are distinct unverified assertions; no firsthand/authenticated authority or automatic memory/history insertion |
| Stable individual differs from design/preset/revision/hash | Explicit Sonalon metadata mapping; pinned schema and two-create test | Two distinct fresh receiver IDs retain design ID; local subject, asset hash and preset ID supply no living identity or continuation authority |
| Exactly one minimal plus two contrasting rich packages | `examples/{minimal,neri,bex}.content.json` and actual `.bundle.json` outputs | Pip name-only; Neri archival contextual fiction; Bex theatrical prepared puzzles/custom profile. Records 1/6/2; verified assets 0/2/1. Existing Emma is only an integration control |
| Actual packaging, closure and exact byte evidence | Complete fixed bundle equality/import/re-export tests, resource manifest, CLI | Dependency records, roots and inline hashes/sizes/content checked; missing source metadata differs from verified transported bytes; hashes authenticate no author or history |
| Meaningful bounds and untrusted-input refusal | Safe JSON/depth/size/accessor checks; definition parser and negative fixtures/tests | Duplicate/unsafe/oversized/malformed/trailing/wrapper-breakout data refuse; trusted adapters and callbacks are not package code |
| Required/optional/version/capability semantics | Recursive protected inheritance, complete receiving-definition snapshot, correction tests | Same-version schema substitution cannot establish compatibility; required unsupported meanings refuse before callbacks/results, optional meanings are named omissions |
| Preserve dependency graph through optional omission | Private validated projection aliases; expression/context/typed-link actual-bundle regressions | IDs/values/scopes/claims/links survive while incompatible consumed meanings are inert; input bundle/registry unchanged |
| Privacy, audience and purpose refusal | Public/private/redaction/opaque transport tests; `fixtures/receiving-cases.json` and `negative-cases.json` | Known private paths/nonpublic audiences and opaque public meanings refuse. Only fresh-design projection supported; archive/report admission/attach/host continuation refuse. No universal prose-secret detector or cognitive privacy claim |
| Actual PLC fixture review | Verbatim PLC report; exact three-field candidates and pinned restore helper | Independent domain agreement: exact `{id,name,prompt}`, retained prompts/fresh local IDs, named rich omissions. File/fragment bounds independent without truncation; browser/vault/storage/T465 acceptance separate |
| Actual Sonalon fixture review | Verbatim owning report; three null incomplete candidates; Emma+optional T415 real bundle/schema/create integration | Owning agreement: missing authoring stays missing; optional omissions named, required guidance refuses before callback; no invented psychology/history or T28 admission/runtime delivery |
| Valid/missing/corrupt/unknown/optional/false-claim evidence | Required 70-test entry point, actual receiver helpers, negative/per-target fixture matrices, three-bundle CLI | Concrete bounded mechanical checks, zero skips; no model generation, actual conversation, browser/XR or environmental qualification inferred |
| Independent reviews and verification | Three copied reports; root completion audit; actual route receipt verification | Root recorded 12 PASS/0 WARN/0 FAIL including 70 tests/3 bundles; independent Cosmo rechecked early defects and all 33 namespace files; no blocking correction remains |
| Publication and documentary status | This ledger, exact reports, bounded README/PROFILE/request pointers; all other tracked bytes compared to e1baa84 | Private origin publication only; root independently checks publication, reconciles downstream readiness and closes T415; no public application/release claim |
| Stateful/concurrency discipline | Pure validator/projection implementation; no new production writer | No concurrency test needed for this change; receiver writers still owe parallel-actor and abrupt-recovery evidence, stated invariants and 20 repeats |

## Corrective chain and resolved findings

Initial implementation `d22475feefd113de544705ed18b2e37a77a6d354`, published
`055bf26d8b6bdfed0ab39adb4bdc11002da4e913`, was held. Earlier candidate
`82d1f92` / implementation `95f519d` was also never accepted. Root's first final
verifier reported 6 PASS/0 WARN/2 FAIL: the specified test and CLI entry points
were absent. Green interim suites did not waive those failures or receiving review.

Correction `cf1dc474c9935e187f00386f235b0d8d8301eed0` / request
`00f16a68ac812ea4c8f44a26b555a0dd81233c1d` addressed bounded standard/custom
declared licensing, attribution negatives/derivation checks, inherited protected
profiles/declared aspects, consumed-definition compatibility, dependency-preserving
optional omission, actual optional-T415 Emma integration and the required entry points.
Ordinary reported standing already existed in the late initial source; it was
tested/clarified rather than invented by the ledger. Public opaque refusal,
prepared integrity and source/design assertion limits were explicitly retained.

Root's actual malformed-definition probe required another correction: one complete
standalone JSON value before duplicate-aware parsing, with sibling/trailing/wrapper
breakout refusal and legitimate escaped strings. Implementation
`7ea43df29200bba5e82cb4c4a851386339a875b3`, request publication
`c6cd4ac541dd752f02071ae90e7296abc0a89dca`, passed root's 14/0/0 verifier.
PLC then confirmed the remaining route bug: a valid 2400-emoji file was refused
solely by unconditional fragment limits. Final b0bbd6d / e1baa84 selects file by
default and applies fragment limits only to that route, with no truncation and
atomic refusal before callbacks. Actual bundle tests cover UTF-8/base64url bounds,
both routes, unknown routes, invalid fields/file sizes and nonmutation.

The final independent reports rechecked these actual paths and request no further
producer correction. The prior route executor's inherited global autoStash=true
caused an implicit stash/reapply; root checked its empty remaining stash list,
clean aligned source and five-file scope. The original dirty worktree was unused.
The first ledger attempt stopped at sandbox-denied git configuration without docs
changes or publication. Root configured only this isolated clone; this retry verified
that local setting read-only and pulled pristine. These process facts remain recorded.

## Nonblocking followup and receiving implementation work

Independent Cosmo found whitespace-only attribution strings structurally accepted:
schemas require nonempty bounded strings, not nonblank/source-resolved external IDs.
This is an input-quality limitation, not authenticated real-event acceptance. Root
recorded explicit followup homes on **T433 and T429**. Their receiving/input profiles
must decide rejection rules without silently rewriting IDs. It is nonblocking at
this asserted transport scope; no schema/code change or new acceptance is implied.

T465's simple preset file/fragment implementation remains independent. The reviewed
T465-c guidance parser hash is
`db7f4705b8ab56ccae7262cd4f5a848fc9cc890cc9be22d7bab94e6c6b42abe9`.
Producer bounds cover numeric route compatibility, not all receiving text rules
(the provisional reader also rejects controls/bidi and multiline names). Its later
doc hash in the PLC review differs from the earlier request's historical guidance
snapshot; neither is silently repinned here. PLC's independent pure parser/admission
probe is additional review evidence, not a new executable producer dependency or
browser/persistence/vault acceptance.

**T222** retains rich PLC selection/preview/omission consent/capability admission;
**T28** retains Sonalon browser admission/persistence/runtime proof; **T26** retains
integrated portable admission proof. T428/T429 and owning attribution/cognition/
lifecycle tasks retain actual report use, temporary persistence, attachment and live
continuity. Authoring UI, prepared execution, presentation/media rendering and model
quality remain owning followups. Receiving readiness/runtimeReady stay false; valid
transport and helper shape acceptance do not deliver cognition, conversation or VR.

## Verification provenance

Root's recorded final route `cosmo-verify` result is **12 PASS, 0 WARN, 0 FAIL**,
including 70 tests and three exact bundles. This ledger executor did not rerun
cosmo-verify or claim the correction/route executors' 134 foundation/continuity
regressions and 31 source pins as fresh root executions. PLC independently ran
70 authored + 74 foundation + 60 continuity checks, CLI and 31 pins. Cosmo and
Sonalon each independently ran the 70-test entry point and actual three-bundle CLI;
their reports carry exact timings, source stability and scoped outcomes.

This ledger executor runs only the required unchanged-code checks:

```text
node --test contracts/authored-profiles/tests/authored-profiles.test.mjs
node contracts/authored-profiles/validate-examples.mjs
```

Fresh ledger-executor results: 70 PASS, 0 FAIL, 0 SKIP (5915.176525 ms); CLI
exit 0 with all three exact reviewed roots, 1/6/2 records and 0/2/1 verified assets,
admissionReady:false/runtimeReady:false throughout. Final publication HEAD is
retained in the executor handback and final
T415 note, avoiding a self-referential commit pin. All three complete reports are
byte-compared to originals and their SHA-256 values above. Every other tracked file
is compared against exact e1baa84, with only this ledger, reviews and bounded
README/PROFILE/request doc changes permitted. No source pins are refreshed.
The exhaustive byte comparison passed for 10,734 other tracked files. Staged
`git diff --check` reports only an existing blank line at EOF in the verbatim
Cosmogenitor report (line 170); it is preserved to keep the exact authored bytes.
No model/service, browser, storage, runtime, deployment, credentials or foreign
source operation is part of this ledger publication.
