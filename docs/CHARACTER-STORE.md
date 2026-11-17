# Rich character store (T222 phase B)

Board task T222, phase B: the conflict-safe store for admitted rich characters (`chat/characters/character-store.mjs`). It consumes the reviewed packages of
`docs/CHARACTER-PACKAGE.md`. **This phase is the store only**: no review UI, no page wiring, no browser, vault or temporary-chat proof, no snapshot and no
runtime. Those are the following phase and are listed under "Not done".

## What is stored

One JSON value, owned by the key the wiring page passes in (`plc.characters.v1`, format 1, Web Lock `plc-characters`, through `appLocal`):

```
{ format: 1, revision: <integer, +1 per write>, records: [ record ] }
```

A record is plain JSON (no functions, no `Uint8Array`):

| Field | Meaning |
| --- | --- |
| `individualId` | `individual:<crypto uuid>`, made here; the only identity this app gives it |
| `recordVersion` | 1, +1 for each update of this record (the compare-and-set value) |
| `origin` | `{ purpose: 'fresh' \| 'copy', admissionId, route, copiedFrom? }` |
| `admissions` | the last 16 admission ids that created or changed it (idempotency) |
| `createdAt`, `updatedAt`, `lastUpdate?` | clock of the injected `now` |
| `preview` | `{ name, instructions }`: the producer's plain projection |
| `subject`, `design`, `transport` | what the package said (design/revision/candidate ids are **unverified source claims**) |
| `capabilities`, `structured` | lore, guidance, prepared, presentation, media, evidence, other: exact aspect values, `executionReady: false` |
| `omissions`, `resources`, `unverifiedSourceClaims` | named optional omissions; resource status/size/preview; evidence assertions (`verified:false`, `authority:'none'`) |
| `source` | **the verified original transport**: `{ format, root, envelope, bytes }` |

`source.envelope` is the bundle exactly as received minus inline `data`: format, selection, visibility, audience, `content`, `definitions`, `receipts`,
the **record manifest** (`records`), the **asset byte manifest** (`assets`: hash, size, status inline/external/missing) and `root`. `source.bytes` holds the exact verified
bytes of every retained resource (base64), whether they arrived inline or through the receiver's local stream. The old candidate `package` is the same
data (`envelope.content/definitions/receipts`) and is not stored twice. `reopenCharacterSource` / `store.open(id)` rebuild a bundle from it and run the producer validators again (root,
bytes, definitions, closure, authored semantics); nothing is trusted because it was stored.

External bytes are retained **while they are verified**: the producer streams the receiver's own opener through its hasher; the wrapper keeps bounded
copies of exactly those chunks, never fetches any address, and runs the second producer pass on the kept bytes (an independent Web Crypto digest). A resource is `verified-*`
only when its exact bytes are held (`retained: true`).

## Identity

* `fresh` and an explicit `copy` each make a new opaque `individual:<uuid>` from the injected `crypto.randomUUID`, independent of design id, revision, root hash, subject id, preset id and name. The same package
  admitted twice is two characters. A copy is a new authored character whose `origin.copiedFrom` records design lineage only; it is not a continuing life.
* `update` names ONE existing record (`target: { individualId, recordVersion }` as the person chose it) and keeps its `individualId`. Nothing the package claims selects it.
* Purposes that continue, attach, move or restore a life refuse (`purpose`).
* No participant/encounter key, no shared registry, no import of T418 modules. Admission never registers a conversation participant or grants runtime authority.

## Operations (all through one lock)

`prepare(input)` is asynchronous and private: it runs the producer validation (and, for a copy, reopens the chosen record) outside the lock and returns a frozen **preparation**.
`commit(preparation)` accepts only a preparation this store made (a forged or foreign object, or a candidate, is `unknown-preparation`). It re-verifies the held source through the producer
validators once more, then takes the lock and, **inside it, synchronously**: reads the stored state fresh, checks the target record/version or the already-applied admission, applies the change,
writes, reads back. `remove({ individualId, recordVersion })` is the same shape.

| Outcome | When |
| --- | --- |
| `admitted` / `updated` / `copied` / `removed` | written and read back |
| `already-admitted` / `already-applied` | the same preparation was committed before (double callback, retry after an uncertain crash): nothing written |
| `already-absent` | remove of a record that is gone: nothing written |
| `stale` (+`currentVersion`) / `gone` | the chosen record changed or disappeared: nothing written, one winner |
| `unsupported`, `read-only`, `busy` | no Web Locks, read-only tab, lock not granted within `waitMs`: **no write, no fallback** |
| `unreadable`, `malformed`, `newer` | stored value unreadable, not a valid state, or a newer format: left exactly as it was |
| `too-large` | more than 64 records or 4,000,000 characters (2,500,000 per record): nothing written |
| `write-failed`, `write-refused`, `changed` | storage threw (quota); storage kept the old value (blocked/read-only); another writer's value is there: **reported, never put back** |
| `scope-changed` | a bound session scope moved between prepare, verification and commit |

Idempotency is by `admissionId`, persisted on the record. A new preparation of the same package is a new, deliberate admission. An unreadable or newer store is never repaired or migrated here.

## Temporary chats

`createTemporaryCharacterStore({ scope })` uses memory-only storage and a first-in first-out lock for that tab, bound to the session scope. Nothing reaches browser storage or the vault; the scope changing during
validation or before the write refuses the admission.

## Tests

* `tests/character-package-external.test.mjs`: genuine Neri `exportAuthored` external bytes retained; wrong/truncated/oversized/extra/missing/unreadable streams; buffer reuse; read-once consistency; JSON round trip and tamper of the serialised source.
* `tests/character-store.test.mjs`: the operations above on real bundles, forged preparations, lock/read-only/busy, malformed/newer/unreadable data, quota/refused/lying storage, temporary chats, parallel admissions in one tab.
* `tests/character-store-crash.test.mjs` (+ `tests/helpers/character-crash-actor.mjs`): real processes, 4–16 actors, 20 repeats of each scenario, SIGKILL at three write boundaries, negative controls. Invariants and the exact simulated/real split are at the top of the file.

## Not done (the following phase; nothing here claims it)

* The key is **not classified yet**: `key-classes.mjs`, `storage-inventory.json`, `DATA-HANDLING.md`, the format guard and a writer-generated data snapshot (`tests/data-fixtures.test.mjs` fails for a classified key no snapshot wrote, and a snapshot must come from the real writer, so it is not faked) land with the page wiring. The store takes its key as a parameter for this reason, so no unclassified key literal ships in app source.
* Review UI, explicit-admission dialog, library/detail view, real browser admission and whole-page reload, plain and encrypted-vault targets, vault lock/unlock, real Web Locks in tabs, temporary chat in a browser, newer-format banner.
* Rich backup/transfer (T428) is unimplemented and the full backup promises nothing about these records. No runtime, presentation, media or prepared execution (T442/T444/T455/T456).
