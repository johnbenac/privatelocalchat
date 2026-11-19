# Context composer (T429, first slice)

What it is: a pure function that decides what ONE receiving individual may be told, from the conversation records (`docs/ENCOUNTERS.md`) and the other inputs below, **before** anything is retrieved, embedded, summarised or sent to a provider. Code: `chat/context/composer.mjs` (pure), `chat/context/receiver-context.mjs` (gathers the inputs from the page), `chat/context/attribution.mjs` (reported handles). T442 consumes it.

What it is not: a resident, a scheduler, a hosted service, authentication, or a store. It **persists nothing**: every request is derived afresh from the records and the inputs; there is no cache and no shared state, so there is nothing to recover. It is used only when a request is made for a receiver other than the conversation's default assistant (`runReply(id, { receiver })` / `buildInferenceMessages(thread, index, mode, { receiver })`); ordinary chat takes the old path unchanged (byte-identical, `tests/context-composer-sender.test.mjs`).

## Inputs and their scope

| Input | Admitted for a receiver when |
|---|---|
| Admitted design and lore | its `individualId` is the receiver's own (never by name, preset or design id); a participant with no individual gets none |
| Transcript (originals) | the event the transcript shows has an audience that includes the receiver (`encounter`, or a list holding its participant id) and an allowed standing |
| Lines with no record (legacy) | policy `legacyTranscript` (default `exclude`: they have no recorded audience, so a receiver is not told them; the person may choose `include`, and they are then shown as standing `legacy`, attributed to nobody) |
| Scoped reports (events not in the transcript; package evidence) | audience includes the receiver; package handles name a participant only through the person's explicit `handleMap` |
| Documents | attached: only if the carrying message is permitted; otherwise a document is the person's own unless it names an audience |
| Summary | every message it stands on (`[0, upTo)`) is permitted, its own audience (if any) includes the receiver, and it is not stale |
| Private interpretation | an event addressed to the receiver alone; same rule as any event, labelled scope `private` |
| Preferences and memory (legacy global) | personal scope: **off** for a receiver unless the person's policy turns them on; never in a temporary chat; never attributed to an individual; never "all-agent knowledge" |

## The order (filter before use)

1. **Admit**: audience, scope, standing, text present. 2. **Derivation**: an item with `derivedFrom` needs every input permitted and present, to a fixed point (a derived item never outlives its permitted inputs). 3. **Precedence**: a permitted correction (`corrects`, `supersedes`) replaces what it corrects; a correction the receiver may not see changes nothing for it, and a correction whose original is hidden carries no pointer to it (`correctsHidden`). 4. **Stages** (`embed`, `retrieve`, `summarize`, injected) are handed **only** the survivors and cannot add an item they were not handed. 5. **Projection** to the provider view (`view`, `options`) and the ordered `items`.

An item failing 1-3 never reaches 4 or 5. `excluded` lists only id, kind and reason (never text) and is for the host, not the provider.

Order of items: design/lore, preferences, memory, summary, documents, reports/events (by clock), transcript. Provider roles are projections: what others say reaches the receiver as `user`, its own words as `assistant`.

## Provenance on every item

`provenance`: `source`, `eventId`/`documentId`/`messageId`, `scope`, `audience`, `standing`, `attributedTo` (a label with `authenticated: false`, or null), `derivedFrom`, `corrects`, `edited`, `inputsDigest`; plus `reason` (why included). Nothing here is verified identity.

## Edited summaries and invalidation

A summary is derived, never original. A person's edit keeps it derived with `standing: edited-by-person`. It carries a digest of its inputs (`inputsDigestOf`); when the inputs or the audience change it is marked stale (`stale[]`) and not used: its permitted inputs stand on their own, or a `summarize` stage recomputes it from the permitted inputs only (`standing: recomputed`, `replacedEdited: true`: the person's edit is not silently kept on text it no longer describes). A summary saved before digests existed is `legacy-summary`, valid only while every input is permitted. The stored summary format is **unchanged** (a format change needs two releases, `docs/DATA-COMPATIBILITY.md`): the digest is computed on use; writing it back is future work.

## Reported attribution (the T415 follow-up)

The producer schema accepts a whitespace-only `individual`, `run`, `participant`, `source`, `occurrence` or audience member ("bounded non-empty string"). At **local admission and in the review words** (`attribution.mjs`, `character-describe.mjs`): a named handle is kept and shown exactly as supplied (never trimmed or rewritten, never authenticated); a blank one is shown as `(unnamed)`, names nobody, can never match a participant even if a map has an entry for it, and a report with no named audience member is not usable as scoped. The candidate, its stored record and `candidate.source` (the lossless transport, same root) are **not** changed.

## Limits (stated, not hidden)

* No resident or real provider was run: the tests use a stand-in provider that records the messages array it is handed, and synthetic data. No browser evidence yet.
* Not wired: documents from the real store (the page passes none for a receiver), admitted design/lore from the character store, package reports and a person-facing control for the sharing policy. The composer accepts them; the page does not yet gather them. Until it does, a receiver gets no design, lore, documents or reports from the page.
* The policy (what personal inputs a receiver may see) has no screen yet; the default is the safe one (nothing personal).
* Records are not in backups or transfers (T428); a restored chat is legacy.
* Retrieval and embedding of real documents is not re-run per receiver here; the stages are the seam.
