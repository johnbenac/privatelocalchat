# Compaction after a permanent delete

Written 2026-11-22 (T896, decided in T966). Code: `chat/vault/compaction-scheduler.mjs`, wired in `chat/vault/vault-store.mjs`.
Tests: `tests/vault-compaction-scheduler.test.mjs`, `tests/vault-compaction-concurrency.test.mjs` (rig: `tests/helpers/compaction-rig.mjs`).

## The problem

Deleting a chat destroys its key (event `key.destroy`), so the chat's records can no longer be read (crypto-shredding). But the
sealed `key.put` record that holds the chat's key stays in the stored log, and so do the chat's old ciphertext records, until the
vault is compacted (`session.compact()` in `chat/vault/vault.mjs` rewrites the log from live state). Nothing in the app called
`compact()`, so "deleting a chat cryptographically deletes its derived records" was not true in production. Now it is.

## What triggers it

Every way a chat or document and its key leave the vault passes through the app storage in `vault-store.mjs`: "Delete permanently"
(`deleteForever`), the expiry of a chat in Trash, "Clear history", and a deleted document. They all end in `session.delThread` or
`session.delDoc`. The storage calls `removalQueued()` on the scheduler **synchronously, before the removal is queued**.

## What the scheduler does

1. **Marks first.** It writes the pending marker `plc.vaultCompaction.v1` (a plain, classified key: `{ v: 1, pending: true, since: <ms> }`,
   no chat content, no id, no title) before the removal is stored. A page killed at any point after that still has the marker.
2. **Debounce 3 s** after the last delete (a burst of deletes is one compaction), with a **maximum wait of 30 s** so a steady stream cannot postpone it.
3. **Flushes the page's own queued writes**, then calls `compact({ guard })`. The guard is true only while the same attached session (same fence) is current and this tab is the writer.
4. **Clears the marker only after a confirmed compaction**, and only if no further delete was queued meanwhile (a delete that arrives during a run is not covered by it: another round follows).

## When the vault refuses

`compact()` refuses with a `VaultError`; it never half-writes (one adapter call, all or nothing).

| Refusal | What happens |
|---|---|
| `busy`, `stale-session`, `session-changed` (session still current), `typed-hold`, `needs-reconcile`, any other store failure | retried after **2 s, 5 s, 15 s, 60 s, 300 s** (the last step repeats), **8 attempts** in all. It is never skipped: the marker stays. |
| attempts used up | event `gave-up`, the marker stays, the person is told (below); the next unlock starts again with a fresh session. A `stale-session` cannot heal in the same session ("unlock again"), which is why the next unlock is the cure. |
| `locked`, or the session was replaced | paused: nothing is written, the marker stays |
| `unsupported-event`, `typed-unreadable` (data from a newer version, or an unreadable typed index) | `blocked`: stops, the marker stays, nothing is dropped |

**Never** while the vault is locked, in a read-only tab (another tab holds the writer lock; only the writer compacts, and the
writer's own compaction fences against a stale view with the exact-bytes check inside `compact`), or while a typed operation is
pending (`typed-hold`). Locking cancels the timer.

## Crash and lock

The marker lives in the browser's plain storage, so it survives a kill, a reload and a lock. At the next unlock or boot
(`attach` of a session) a pending marker arms the compaction after 5 s (so the page finishes starting first). If the page died
before the delete reached the vault, the extra compaction is harmless (it rewrites live state unchanged).

## What the person sees

Nothing when it works. A deleted chat is already unreadable the moment it is deleted: its key is destroyed in memory and in the log.
If compaction cannot finish (it gave up, or the vault holds data from a newer version) a toast says: "A deleted chat is already
unreadable. Its leftover encrypted key will be removed the next time you unlock the app." If the vault is locked, nothing is done
until the next unlock, which finishes it. The marker only says that *a* deletion is waiting; it does not say which chat.

## Not covered

* The typed projection path (`commitChatProjection`) removes owners itself and is not called by the app yet; when a consumer wires it, it must call `removalQueued()` the same way.
* A plain, unencrypted vault-off setup has no keys to shred; nothing runs.
* The numbers (3 s, 30 s, the back-off, 8 attempts) are constants at the top of `compaction-scheduler.mjs` and arguments of `createCompactionScheduler`.
