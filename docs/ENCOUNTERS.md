# Conversation records (encounters, participants, events)

What this is: a local record of **who said what, to whom, in which conversation, and with what standing**, kept beside the chats. It is the common record foundation for later work (audience-safe context, several agents, hosted guests); it is not any of those. The chat transcript (`chatThreads`) keeps its format and stays the thing the person reads and exports.

What it is not: hosted invitation or guest authority, rich package admission, context composition (that reads these records: `docs/CONTEXT-COMPOSER.md`), agent scheduling, backup/transfer of the records (T428), or any service. Nothing here checks who a person is: a name, a preset id, a design id, a link holder or a claim in an imported file is a **label**, never a verified person.

## Where it lives

| What | Where |
|---|---|
| Records, pure rules | `chat/encounters/records.mjs` |
| What one tab changed, as a patch on the stored chats | `chat/encounters/thread-patch.mjs` |
| Events a change produces | `chat/encounters/thread-events.mjs` |
| The one locked writer of chats **and** records | `chat/encounters/thread-commit.mjs`, `chat/encounters/ledger-store.mjs` |
| The feature, the screen label and the facade | `chat/encounters/encounters.mjs` (`window.plcApp.encounters`) |
| Stored | appLocal key `plc.encounters.v1` (format 1, class user, so vaulted when the vault is on), Web Lock `plc-encounters` |

## Saving a conversation is one commit

Every ordinary writer (send, edit, regenerate, retry, continue, stop, branch, duplicate, rename, pin, trash, delete, import, assistant preset, canvas…) calls `saveThreads()`, which is now one commit in **one lock hold**:

1. take `plc-encounters`; read `chatThreads` and the ledger fresh; finish any interrupted earlier commit;
2. fence: a tab whose epoch is not the ledger's (Clear history happened elsewhere) writes nothing and says so;
3. apply this tab's **patch** (what it changed since it last synchronised) to the fresh stored chats: untouched chats and messages from other tabs are never overwritten; changing something another tab changed is an explicit per-chat conflict (not written, told once, retried on the next save); a chat deleted elsewhere does not come back;
4. derive the events from the fresh stored copy and the patched copy;
5. write the ledger **with an intent** (what is about to be written and how to undo the record changes), then `chatThreads`, then the ledger without the intent and with the records of removed chats swept.

A tab killed between the writes leaves the intent; the next lock holder (any commit, any facade call, or the start of a tab) recovers it before anything is read: if every intended chat is stored it rolls forward, otherwise the added records are undone. An interrupted Clear history is finished (forward).

**Refusals** (nothing in any shared key is written; the open chat and what the person typed stay as they are, so a retry is possible; every one is an explicit `{ ok: false, code }`):

| Case | Code |
|---|---|
| no Web Locks | `unsupported` (there is no unlocked fallback, for saving or for Clear history) |
| another tab owns writing (read-only) / chats held for a newer version | `read-only` / `blocked` |
| the ledger is malformed or unreadable (not a recognised newer store) | `malformed` / `unreadable` |
| the ledger intent could not be written (storage full) | `records-write-failed`: the paired chat change is **not** made |
| the intent's readback is not what was written | `unknown-outcome`: chats untouched, nothing is put back over the value found |
| `chatThreads` could not be written after the intent | `threads-write-failed`: the intent is undone **only while the ledger is still exactly the text just written**, otherwise it is left for the next lock holder |
| exhausted counter | `exhausted` (rev / epoch / seq at the largest safe integer) |
| the tab's view of the two stores is not shown to be the last committed state (another tab saved moments ago and the browser has not delivered it here yet, or an interrupted save this tab cannot judge) | `stale-view` / `recovery-unproven`: nothing is written, the text stays, retry (or reload for `recovery-unproven`) |
| the coordination record cannot be read, written or computed (no IndexedDB, a full disk, no secure page) / is from a newer version / is malformed | `coordination-unavailable` / `coordination-newer` / `coordination-malformed` / `coordination-conflict` |

**Freshness is proven, not waited out** (`chat/encounters/coordination.mjs`). The Web Lock orders the tabs but a tab's localStorage view can lag another renderer's write by milliseconds, and a compare-and-set on such a read erases that write. One small durable IndexedDB record (`plc-encounters-coord`: a generation, `stable`/`open`, and SHA-256 digests of the exact text of `chatThreads` and `plc.encounters.v1`, never any payload) says what the last complete hold left. A hold decides nothing until its own view has exactly those digests (bounded wait, then a refusal); before its first write it records the end state it is about to produce (`open`); at the end its own view becomes the new `stable` state, which is the acknowledgement point. A holder that dies leaves `open`; the next holder adopts it at once when its view already is the recorded end state, and otherwise only a document that started after the record and has seen an unchanged state for a settle period may judge the half-finished state (a tab opened before it refuses and asks for a reload). With the vault on no record is kept (one encrypted writer, synchronous in-memory storage), and the plain record is removed.

The one exception is a **recognised newer ledger** (`v` above this version): a distinct blocked store. Chats still save under the same lock as a patch (compare and set), attribution is unavailable (`recording: 'newer'`) and the ledger is not written at all; Clear history likewise only removes chats; an explicit transcript receive, which needs the ledger, is refused (`attribution-unavailable`). This is not a fallback for a missing lock or a full storage.

**Stored state is validated, never repaired.** A current-format ledger whose recognised header (`v` ≥ 1, `rev`, `epoch` nonnegative safe integers), map containers (`encounters`, `participants`, `events`, `holders`) or record references (events point at an existing encounter and participant, `msgs` at an existing event, holders at a participant, positions and `seq` safe integers) are malformed is refused (`malformed`) and left byte for byte as it is; it is never normalised into an empty or reset ledger. Unknown fields of an otherwise valid ledger are kept. Counters are never normalised or wrapped.

**Recovery before use.** `encounters.prepare()` finishes an interrupted commit or Clear under the lock; the host awaits it **before** it reads `chatThreads`, then reads and calls `init()` with no await in between (`chat/core/thread-state.mjs` `loadThreads` does).

## Schema (format 1)

`ledger { v, rev, epoch, encounters, participants, events, holders, intent? }` — unknown fields are kept.

* **Identities are derived, sources are kept.** A compound identity (thread + message + version) is a sha-256 over the canonical JSON tuple, so `("a/b","c")` and `("a","b/c")` never meet and a very long old id stays bounded. The original thread and message ids are kept untruncated in each record's `thread`/`message` fields. An ordinary thread id (letters, digits, `.`, `_`, `-`, up to 128) keeps its readable `enc:<threadId>`; any other string becomes `enc:h:<digest>`; an external encounter is always `enc:ext:<handle>` (it can never equal a local one). Reuse of a stored record for a legacy message requires the exact thread, message, version and occurrence; anything else is refused (`legacy-id-collision`).
* **Encounter** `enc:<threadId>` (or `enc:ext:<id>` for a receiver's own encounter with no local chat): `thread`, `msgs` (message id → the event the transcript shows), `lineage` (a branch's messages → the events they were copied from), `origin` (`local` | `imported` | `explicit-input`).
* **Participant** `{ id, kind: human|agent|tool|unknown, name, standing, individualId|null, holders? }`. Defaults per chat have deterministic ids `p:<thread>:person` (this device's person, unverified) and `p:<thread>:assistant`. `individualId` is an opaque string a trusted caller **supplied**; it is stored unchanged, never inferred from a name, preset or design, never proof. Equal names are different participants. Registering an explicit id again with other data is refused (`participant-conflict`).
* **Holder** `holderRef → participant`: many link holders may stand for one participant (a shared or forwarded link). The reference is an opaque label, never a secret; an unmapped holder is nobody; moving a holder is refused.
* **Event** `{ id, encounter, thread, message, version, occ:{source,id,digest}, speaker, audience, expression, modality, standing, state, outcome, content:{text,digest}|null, inTranscript, authority, observed, clock, corrects?, supersedes?, derivedFrom?, causes? }`
  * `expression`: `person | model | prepared | tool | external`. Provider roles (`user`/`assistant`) and screen labels are projections of this.
  * `content.text` is the **complete** source text for every expression (no preview, no cap, no truncation); `text: null` means the source supplied none (supplied audio) and stays null. Text derived from audio is a **separate** `derived-text` event with `derivedFrom` and an audience that cannot be wider than the original's. `inTranscript` only says whether the local chat currently shows the message.
  * `outcome` is the **original** outcome (`complete|stopped|failed|length|interrupted|received`), never rewritten; a continuation, revision, correction or retry is a new event pointing at the earlier one. `sourceOutcome` keeps a source's own word for it.
  * identity of an occurrence is `source + id + digest`: the same again is a duplicate (nothing written), the same source+id with other bytes is an explicit `occurrence-conflict`, equal text under another id is another event.
  * order: `clock {domain, position}`; one domain is ordered by position (a nonnegative safe integer, or absent to use the conversation's own order; anything else is refused `bad-clock`), several domains are offered only as receipt order and labelled so.
* **Legacy**: a message stored before the ledger knew it has no event and projects under the stable id `legacyEventId(thread, message)` (`ev:legacy:<digest>`) with no individual and no authority. If it is first rewritten, exactly that id is written down (`standing: legacy`, `observed: false`, `authority: none`, with the original text read from the stored copy in the same lock hold) and the correction points at it. Imported chats and their messages are legacy; nothing in an imported file (speaker names, roles, ids, `individualId`) is read as attribution. A branch inherits the attribution of the messages it copied.
* **Temporary chats**: never stored and never in the ledger; their records live in memory for the page's life.

## The facade (`window.plcApp.encounters`)

App-internal, for a later receiver (T429/T442/T458). `registerParticipant`, `mapHolder`, `resolveHolder`, `openEncounter`, `receive` (`transcript: true` also shows the message in the chat, stored in the same commit; a refused one never enters the transcript; a **replay** of an occurrence already held returns the original receipt with `duplicate: true` and changes neither store, decided inside the lock before any line is appended; the same occurrence with other bytes is an `occurrence-conflict` with no mutation; a distinct occurrence with equal bytes is a distinct event), `project`, `participants`, `events`, `order`, `summary`. It stores what a trusted caller supplies and checks only the rules above. It starts no service and schedules nothing.

## Limits (stated, not hidden)

* The ledger is not in history exports, protected backups or settings files, and a restored backup does not restore it: restored chats are legacy (T428 owns carrying it).
* Another tab's new chats appear after a reload; its changes to chats this tab did not touch are never lost.
* Where Web Locks are missing, saving and Clear history are refused (`unsupported`); the chats stay readable. The host's messages for refusals (and sender/import/clear results) are the later UI pass.
* Turning the vault on/off migrates the key with the others; it is not an ordinary writer.
* Evidence of attribution of real inference (a resident's words) is not provided here: the browser suites use a fixture provider, which qualifies the record pathways only.
