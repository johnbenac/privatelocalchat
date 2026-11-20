# Message handoff: a person's message reaches a running resident, and her speech may come back

Sonalon-owned contract, version 0, board task T379 (design only). Receiving side: Private Local Chat (PLC) T33, T443 and the
T427 adapter. Implementation: Sonalon T30 and T427. This directory holds the contract (this file), `schema/message-handoff.schema.json`
(JSON Schema 2020-12), `fixtures/F01` to `F13` and the checker `tests/message-handoff-contract.test.mjs`.

Nothing here is built into a resident. No model is called, nothing is released. The contract says what crosses the boundary and what
is refused. It never says what a resident decides, says or when (decisions 78 to 80 in `plan/DECISIONS.md`; `AGENTS.md`): a message
delivered is not a reply, and no receipt, timeout or error turns silence into a failure.

## 1. Scope of the first slice

- **First slice: an active browser resident**: a page is open and the resident is running in it.
- **Own-computer runtime**: later, after T267 (a shipping headless host; T250 was a scripted Node run, not one). The contract is
  host-independent, so it does not change when that host exists.
- **A closed tab is a stopped resident.** It answers `unavailable` (when anything can answer at all). It is never "queued as if alive",
  and no replacement persona answers for her (PLC T443 says the same).
- A reply is optional. A message delivered is not a promise of a reply.

## 2. Transport independence and the honest status of bindings

The domain contract is the set of messages in section 5 to 9. A **binding** carries them. The contract never names one.

| Binding | Status |
|---|---|
| In-process (a function call between a sender and an endpoint in one process) | Exists only as the reference endpoint inside the test. It proves the rules and the fixtures. It is not in `fabric/` or `public/`. |
| Own-computer endpoint (a process on 127.0.0.1 that sends CORS and CORP headers; PLC is served with COOP same-origin and COEP require-corp, so it needs both) | **Chosen to be built first** (PLC answer to S3). Needs T267. Does not exist. |
| Rendezvous or relay both sides connect out to | Later and independent. Needs the selected T421 and T787 interface. Does not exist. |

A browser page cannot listen on a port, and with COOP same-origin a PLC page cannot reach into another tab, so a browser-tab endpoint
is not claimed. Sonalon invents no login, relay or inference API. The one real prerequisite for T30 and T427 is therefore: **own-computer
endpoint after T267**; hosted bindings consume the platform's own interfaces when they exist.

## 3. Identities and addressing

- **Resident address** = `{ individualId, host: { kind, address } }` plus the **encounter id** carried on every message. `host.kind` is
  `in-process`, `own-computer` or `relay`.
- **Encounter**: PLC's `enc:<threadId>`, or `enc:ext:<id>` for a receiver's own encounter with no local chat. Its life is the chat's; a
  cleared history starts a new epoch.
- **Sender** = PLC's participant record `{ id, kind, name, standing, individualId | null, holders? }`, copied unchanged, plus optional
  `aliases` (labels the sender knows the participant by). Default PLC participant ids are per chat and are not stable across chats.
- **Mapping to Sonalon**: `(participant.id, individualId)` maps to one Sonalon `partyId`, with the aliases kept as aliases. Two
  participants with equal names are two parties. PLC keeps Sonalon's `partyId` as an opaque label on the participant.
- **`individualId` is supplied by a trusted caller and is never proof of anything.** It is stored, never inferred, never used to admit.
- **One external human per encounter is enough for the first slice** (T443): the only human on PLC's side is the person using the
  device (`p:<thread>:person`, kind `human`); PLC's assistant participant is not sent. Several humans per encounter is a later PLC
  profile (O49) and needs T417; it is not a prerequisite of T443.
- Today's code has a single visitor party (`VISITOR` in `fabric/world/visitor.mjs:17`, `partyOf` in `fabric/spine/identity.mjs:114`).
  The durable participant-to-party mapping, aliases and several external participants in one world are T417 (later profile, section 14).
- The participant record is PLC's own and may carry more fields (`encounter`, `origin`, others). **The endpoint ignores unknown fields**,
  as PLC keeps unknown fields too; the schema allows them on the participant and the message.

## 4. How a message enters the resident

A message enters as a **world event from a named party in an encounter**, never into her mind and never as an operator edit.

- The real path today for a visitor's words: the page sends a `human-input` frame (`fabric/world/world.mjs:1693` `handleHumanInput`,
  kind `message`). `handleHumanMessage` (`world.mjs:2001`) records a speech phenomenon and, for each live hearer, emits a scene event
  with `heard` data (`world.mjs:2045`). `heardData` (`world.mjs:484`) is `{ speaker, partyId, words, modality: "speech", from }`, the
  `partyId` coming from the world's party map (`partyIdOf`, `world.mjs:471`).
- The mind turns that into a percept (`fabric/mind/core/perception.mjs:10-18`: `kind: "speech"`, `words`, `designation`, `partyId`).
  The mind never receives input directly and never decides admission: a mind requests, the world decides.
- The endpoint therefore maps an accepted message to that same world input, with the sender's party. T427 builds this; it adds no
  second path into the mind.

## 5. The message

One JSON object (`message` in the schema). Required unless marked optional.

| Field | Meaning |
|---|---|
| `kind` | `"message"` |
| `id` | The attempt-group UUID, chosen by the sender and **reused unchanged on every retry**. It is the dedupe key. It is not `occ.id`. |
| `encounter` | Encounter id (section 3). |
| `to` | Resident address (section 3). |
| `from.participant` | PLC participant record. `from.aliases` optional. |
| `occ` | `{ source, id, digest }`. `occ.source` and `occ.id` name the original occurrence in PLC's record (a different thing from the message `id`). `digest` = `"sha256:"` plus the hex SHA-256 of the words (UTF-8; PLC's `digestOf`). |
| `words` | The words, at least one code point. |
| `audience` | `{ kind: "encounter" }` or `{ kind: "participants", participants: [ids] }`. Separate from the words. |
| `expression` | How the sender expressed it (for example `typed`). Separate from the words. |
| `after` | An array of message ids this one follows (causation); empty for none. In v0 at most one id (PLC sends one); the array form may grow. PLC sends one chat's messages in order and never sets `after` to a refused message. |
| `corrects` | Optional. The id of an earlier message this one corrects (section 8). |
| `sentAt` | Optional. The sender's clock; informative, never a cutoff. |

**What the digest covers (decided, PLC answer to S4):** the words only. Audience and expression are separate fields. So "the same
message, retried" means the same id with the same digest, audience and expression. A repeated id with any of those different is a
**collision**, refused as `malformed`, never treated as a retry (F10). An edit then resend is a new message with a new id (F11).

## 6. Five delivery states, five receipts

Each state is a separate `receipt` (`state`, `messageId`, `encounter`). They are never collapsed into one "delivered".

| State | Means | PLC shows a person | Returned and recorded |
|---|---|---|---|
| `accepted` | The endpoint took the message into its log | yes (sent) | yes |
| `delivered` | The running world has it; the receipt carries `worldSeq`, its place in what she perceives | yes (delivered, or `unavailable` instead) | yes |
| `exposed` | It is in her context | no | yes |
| `interpreted` | Her mind took it up. This says nothing about what she then did | no | yes |
| `persisted` | The exchange is in her record | no | yes |

"Said" is not a receipt. Her speech is observed only as reply events (section 9), if she speaks. The endpoint returns all five;
PLC decides what to show. States are reached in this order, each once.

## 7. Duplicates, retries and uncertain outcomes

- A repeated id with identical content returns the **original outcome** (the receipts as first issued, `worldSeq` unchanged) and
  mutates nothing (F02).
- An uncertain outcome (the answer was lost) is resolved by sending a `status-query` for the id. The `status` answer has `known` and
  the states reached. `known: true` means do not resend. `known: false` means the endpoint never recorded the id, so sending the same
  message again unchanged is safe (F03).
- Refusals are not recorded. A message refused as `unavailable` and sent again later with the same id is a first acceptance (F05).
- **Reorder is allowed.** Messages may arrive in any order. The world's clock and causation decide what she perceives and when: a
  message whose `after` is not yet delivered stays `accepted`, and is delivered, with its own `worldSeq`, once its predecessor is (F04).
  The sender's `sentAt` is never used to order.
- **Held messages say so.** The `accepted` receipt of a held message, and the `status` answer for it while it is held, carry
  `waitingFor: <predecessor id>` (F12). A message whose predecessor was **refused** is itself refused, class `malformed`, reason
  `predecessor-refused`, and is never held (F13). A message already held when its predecessor is later refused stays held and visible
  through `waitingFor`; the sender resolves it by sending the predecessor again or a new message.
- Resending unchanged is safe even while an earlier attempt is still in flight, because the same id is one acceptance (the concurrency
  rule below; T427 owes the parallel test).
- Concurrent submissions of one id must behave as one acceptance. The in-process reference is sequential; T427 owes the
  parallel-actor test (skill `concurrency`).

## 8. Refusals, revocation and corrections

A `refusal` has a `class`, the `messageId` (or null if unreadable) and a short `reason`. Classes:

| Class | When |
|---|---|
| `unavailable` | No resident is running (a closed tab, a stopped host). Also for a status query. Not queued (F05). |
| `not-admitted` | Wrong resident, or the participant is not admitted to this encounter. The admission mechanism is outside this contract. |
| `revoked` | The participant's link was revoked and the message is past the cutoff (F06). |
| `malformed` | Does not match the schema, the digest does not cover the words, or the id collides with different content (F07, F10). |
| `over-limit` | More code points than the endpoint's limit (F07). |

**Revocation.** The person revokes in PLC (removes the link or ends the participant). PLC sends a `revocation` whose cutoff is the
**id of the last message the endpoint accepted**; wall-clock time alone is not a cutoff. Later messages from that participant are
refused `revoked`. History stays, and a retry of an accepted message at or before the cutoff still returns its original outcome. A
cutoff id the endpoint never recorded admits exactly that one id, once.

**Edit and resend.** An edited message is a new message: a new id, a new attempt group, with `corrects` naming the earlier id. The
earlier event is not rewritten or deleted (F11).

## 9. The reply path

Her speech is returned as **public-expression `reply` events**. Her private and composing streams never leave (F08).

- One event **per completed utterance** with the units inside (decided, PLC answer to S5). `causes` = the message id(s), `encounter` = the
  same encounter, `speaker.individualId`, `occ` with a digest over `delivered`, `audience`, `expression: "said"`.
- `delivered` is the text as delivered. `units` and `status` are as the body reports them (`fabric/world/world.mjs:629` `settleSpeech`;
  the `utterance` event at `world.mjs:689`; statuses `completed`, `interrupted`, `failed`, `unavailable`; the receiving side of
  `fabric/mind/core/speech-delivery.mjs`). An interrupted utterance is still one event: units as delivered, `status: "interrupted"`
  (the wire status stays `interrupted`; PLC adopts completed, interrupted, failed and unavailable as the body reports them). `intended` is present only if the body reports it, and is never invented. PLC shows the delivered
  text only.
- `causes` holds the message id. PLC records the sent message as its own event with `occ { source, id: <message id>, digest }`, so a reply's cause is resolved through `occ.id`; it is not stored as a foreign id in PLC's own causes. A reply is optional and never promised (F09). The contract has no timeout and no "expected reply".
- No replacement persona answers when she is unavailable.

## 10. What PLC must have

Receiving her speech into a PLC chat uses PLC's explicit-input receive, which needs PLC's record layer. That is **available when PLC's
records are** (the record layer is an unreleased candidate and is off while PLC's encrypted vault is on; T418, T540 to T542). This
contract does not assume it. **PLC can show nothing of this today**: T443 has not started, and there is no sender and no adapter.

## 11. Fixtures

`fixtures/F01` accept, `F02` duplicate, `F03` uncertain then resolved, `F04` reorder, `F05` closed tab, `F06` revoked, `F07` refused,
`F08` reply (completed and interrupted), `F09` no reply, `F10` collision, `F11` edit and resend, `F12` held then delivered, `F13` predecessor refused. Each is `{ fixture, title, note,
initial, steps }`; a step has a `direction` (`to-resident`, `from-resident`, `host`), a `note`, a wire `message` or a `host` event, and
for inputs an `expectedState`. Resident and place names in fixtures are neutral (`room-1`). PLC adds receiving fixtures in its own
repository when T443 starts and checks them against these.

## 12. The checker

`node --test tests/message-handoff-contract.test.mjs` validates every fixture against the schema, checks every digest, and replays each
fixture through a small reference endpoint (a pure function over an in-memory log, living only in the test) that must produce exactly
the receipts, refusals, replies and states the fixture expects. These are plumbing checks. No fixture or test requires a reply or any
words from her.

## 13. Non-goals

No Sonalon login, relay, account or inference API. No guaranteed reply, timing or content. No queue for a stopped resident. No remote
editing of her state, memory or history, and no operator or private-chat state edit made from a remote utterance. No transport choice.
No shared database with PLC. No group conversation between residents. No claim that a binding exists.

## 14. Readiness list for T30, T427 and T443

1. A real binding: **own-computer endpoint** first (needs T267), relay after (T421, T787). Neither exists.
2. T417 (later profile, not a prerequisite of T443's first slice): durable participant-to-party mapping and aliases, and several external humans per encounter (PLC's O49).
3. T427: the endpoint that maps an accepted message to the world's human-input path, with the persistent id log and the parallel-actor
   and abrupt-recovery tests.
4. T443 and PLC records: participant and encounter ids supplied as in section 3; the record layer for receiving her speech. The chain is: the PLC record layer is T860, then T429 and T442, with T418 gating shipping. T443 now depends on T267.
5. An admission mechanism for `not-admitted` (who may write to her), decided by the person who owns the resident.

## 15. Open questions

1. Which real binding is built first is decided as own-computer (S3), but its details (port, how the page of the person finds it)
   wait for T267.

Decided with PLC and written as rules above: S2 (contract and fixtures through an in-process binding, the real binding recorded as a
readiness item), S3 (own-computer first), S4 (digest over the words only; collision is `malformed`; edit is a new message), S5 (one reply
event per completed utterance, units inside).
