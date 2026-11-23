# Rich character store (T222 phase B)

Board task T222, phase B: the conflict-safe store for admitted rich characters (`chat/characters/character-store.mjs`). It consumes the reviewed packages of
`docs/CHARACTER-PACKAGE.md`. The page wiring and the review and library UI are in `docs/CHARACTER-UI.md`; this page is the store's contract.

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

## The write scope (required, T1290)

A persistent store changes nothing unless the page gives it `runWriteScope(fn, { guard })`: without it every change refuses with `no-durable-scope` (there is no fallback to `storage.setItem`). The page makes it with `createCharacterWriteScope({ storage: appLocal, vault: vaultApp, withWriteMode, key })` from `chat/characters/write-scope.mjs` (pure; the storage, vault handle and the vault's `withWriteMode` are injected) and passes it to `createCharactersUi`. `fn(mode)` gets `mode.readDurable(keys)` (a fresh read) and `mode.putKV(key, expectedRaw, nextRaw, { operationId })`, which answers with a receipt `committed`, `not-written` or `unknown`; the store acknowledges a change only for a `committed` receipt whose `observed` is exactly the bytes sent.

* **Vault on** (`vault.active`): the encrypted write mode of `chat/vault/vault-store.mjs`. It needs the unlocked session, the exclusive writer lease and the attached adapter. A read-only tab, a blocked (newer format) or held key, or a missing exclusive lease is refused BEFORE the callback runs (the error codes `read-only`, `blocked`, `held`, `no-exclusive`, which the store reports as `write-refused`, nothing written); a locked or replaced session is refused by the write mode itself (`session-changed`). The caller's guard is composed into the vault's authority check. The plain path is never used while the vault is on.
* **Vault off**: a checked compare-and-swap on `appLocal` (the browser's own storage). `putKV` compares `expectedRaw` with a fresh read (a different value is never overwritten: `unknown`, with what is there), writes, reads back, and answers `committed` only when the read-back is exactly what was sent. A thrown write (quota) is `not-written` (`write-failed`); a value unchanged after the write (refused, read-only) is `not-written` (`refused`); another writer's value or an unreadable read-back is `unknown`. The same refusals for a blocked, held or read-only key apply. The Web Lock `plc-characters` orders writers across tabs; the compare-and-swap catches a writer that got past it.

Tests: `tests/character-write-scope.test.mjs` (both paths, the store on top of them, 20-repeat parallel-actor concurrency with stated invariants and a control that loses updates without the compare-and-swap, abrupt recovery) and the page wiring case in `tests/character-ui-lifecycle.test.mjs`.

## Temporary chats

`createTemporaryCharacterStore({ scope })` uses memory-only storage and a first-in first-out lock for that tab, bound to the session scope. Nothing reaches browser storage or the vault; the scope changing during
validation or before the write refuses the admission.

## Tests

* `tests/character-package-external.test.mjs`: genuine Neri `exportAuthored` external bytes retained; wrong/truncated/oversized/extra/missing/unreadable streams; buffer reuse; read-once consistency; JSON round trip and tamper of the serialised source.
* `tests/character-store.test.mjs`: the operations above on real bundles, forged preparations, lock/read-only/busy, malformed/newer/unreadable data, quota/refused/lying storage, temporary chats, parallel admissions in one tab.
* `tests/character-store-crash.test.mjs` (+ `tests/helpers/character-crash-actor.mjs`): real processes, 4–16 actors, 20 repeats of each scenario, SIGKILL at three write boundaries, negative controls. Invariants and the exact simulated/real split are at the top of the file. The "no locks" control does not depend on timing: its actors stop at their first fresh read of the stored state (all holding the same base), the test releases one and waits to see it acknowledged, then releases one that still holds the old base, so the lost acknowledged update happens in every repeat (the store and its locks are untouched; only that control's actor waits).

## Bounds and lifetime (added with the UI)

* Stored text over 4,000,000 characters is never parsed; more than 64 records is refused before any record is examined; a stored source is checked (counts, each size against the producer's limits, the base64 text against its declared size, the bytes against the asset byte manifest) before any base64 is decoded, in `checkStoredRecord` and `reopenCharacterSource` alike.
* A revision counter at `Number.MAX_SAFE_INTEGER` still reads, but every change refuses with `exhausted` before any write (admission, update, copy and removal).
* A temporary store is bound to its session when it is made: once the scope moves, every read and every new operation refuses with `scope-changed`, its memory is dropped and it never comes back, even if the scope's old value reappears. A store may also be given `isLocked()` (the vault is locked): it refuses with `locked` before and inside the shared write lock.
* The initiating session is fenced inside the lock. `commit(preparation, { fence })` and `remove(target, { fence })` take the caller's own `fence()` ("my session is no longer the one I began in": the UI passes its lifecycle epoch, normal or temporary session and vault state). It is asked before the work, after the asynchronous validation and again inside the lock in the same synchronous step as the stored-state check, so an action that was waiting for the lock when the person moved to a temporary chat, left and came back, or locked and unlocked the vault refuses with `scope-changed` and writes nothing. A fence that throws or answers anything but `false` counts as moved; a fence that is not a function is refused (`target`). Without a fence nothing changes. `tests/character-store-fence.test.mjs` and the Save/copy/remove cases of `tests/character-ui-lifecycle.test.mjs` pin it.
* The key `plc.characters.v1` is now classified (`key-classes.mjs`, the storage inventory, `DATA-HANDLING.md`) and owned by `chat/characters/characters-ui.mjs`.

## Not done (nothing here claims it)

* The writer-generated data snapshot for `plc.characters.v1` (`tests/data-fixtures.test.mjs` fails until the combined T418/T222 capture exists) and the final combined snapshot.
* Extended real-browser qualification of races (many tabs, abrupt tab death), delayed-hash lock races and older/newer-format banners for this key.
* Rich backup/transfer (T428) is unimplemented and the full backup promises nothing about these records. No runtime, presentation, media or prepared execution (T442/T444/T455/T456).
