// Compaction after a permanent delete (docs/VAULT-COMPACTION-ON-DELETE.md).
// Deleting a chat destroys its key (key.destroy), but the sealed key record stays in the stored log until the vault is compacted. This module is what makes that happen, soon and safely:
// a short debounce after the delete, a retry with back-off when the vault refuses (busy, stale session...), never while locked or read-only, and a small plain marker (a timestamp, no content)
// so that a page that was closed or killed between the delete and the compaction finishes it at the next unlock. Pure: the clock, the timers, the marker and the vault store are all passed in.
//
// createCompactionScheduler({ store, marker, timers, now, debounceMs, maxWaitMs, resumeMs, backoffMs, maxAttempts, onEvent })
//   store   { vaultSession, readOnly, fence(), isCurrent(fence), flush() }  (the page's app storage)
//   marker  { read() -> string|null, write(text), clear() }  one plain, classified key holding { v: 1, pending: true, since }
//   timers  { set(fn, ms) -> id, clear(id) }
// -> { removalQueued(), attached(), detached(), idle(), state() }

export const DEBOUNCE_MS = 3000;          // after the LAST delete; a burst of deletes is compacted once
export const MAX_WAIT_MS = 30_000;        // a steady stream of deletes cannot postpone compaction longer than this
export const RESUME_MS = 5000;            // after an unlock: let the page finish starting first
export const BACKOFF_MS = Object.freeze([2000, 5000, 15_000, 60_000, 300_000]); // between refused attempts; the last step repeats
export const MAX_ATTEMPTS = 8;            // then it stops for this unlock (the marker stays; the next unlock starts again)
const RETRY = new Set(["busy", "stale-session", "session-changed", "typed-hold", "needs-reconcile"]); // the vault's own temporary refusals; any other failure of the store is retried too
const STOP = new Set(["locked", "unsupported-event", "typed-unreadable"]);                          // not temporary: nothing to retry in this session

const parse = (text) => { try { const v = JSON.parse(text); return v && v.v === 1 && v.pending === true ? v : null; } catch { return null; } };

export function createCompactionScheduler({ store, marker, timers = { set: (fn, ms) => globalThis.setTimeout(fn, ms), clear: (id) => globalThis.clearTimeout(id) }, now = () => Date.now(),
  debounceMs = DEBOUNCE_MS, maxWaitMs = MAX_WAIT_MS, resumeMs = RESUME_MS, backoffMs = BACKOFF_MS, maxAttempts = MAX_ATTEMPTS, onEvent = () => {} } = {}) {
  let timer = null, running = null, firstAt = null, attempts = 0, generation = 0, status = "idle";
  const tell = (name, detail = {}) => { status = name; try { onEvent({ name, ...detail }); } catch { /* a listener must not stop the scheduler */ } };
  const pending = () => { try { return parse(marker.read()) !== null; } catch { return false; } };
  const readyToCompact = () => { const s = store.vaultSession; return Boolean(s) && !s.locked && !store.readOnly; };
  const cancel = () => { if (timer !== null) { timers.clear(timer); timer = null; } };
  const arm = (ms) => { cancel(); timer = timers.set(() => { timer = null; run(); }, Math.max(0, ms)); };

  async function attempt() {
    if (!pending()) return "clean";
    if (!readyToCompact()) return "paused";                // locked, read-only or no vault: the marker stays and the next unlock finishes it
    const mine = generation, fence = store.fence();
    // what was queued before this moment is stored first, so the compaction sees it; anything that arrives later bumps `generation` and is compacted by the next round
    try { await store.flush(); } catch { /* a failed write is reported by the page; compaction is still safe */ }
    if (!readyToCompact() || !store.isCurrent(fence)) return "paused";
    const session = store.vaultSession;
    try { await session.compact({ guard: () => store.isCurrent(fence) && !store.readOnly }); }
    catch (error) {
      const code = error?.code;
      if (code === "locked" || (code === "session-changed" && !readyToCompact())) return "paused";
      if (STOP.has(code)) return { stop: code };
      return { retry: code || "failed" };
    }
    if (generation !== mine) return "again";               // another delete was queued while this ran: the marker stays for the next round
    marker.clear();
    return "done";
  }

  async function run() {
    if (running) { return running; }
    running = (async () => {
      let out;
      try { out = await attempt(); } catch { out = { retry: "failed" }; }
      if (out === "done") { attempts = 0; firstAt = null; tell("compacted"); }
      else if (out === "clean") { attempts = 0; firstAt = null; status = "idle"; }
      else if (out === "paused") { tell("paused"); }
      else if (out === "again") { attempts = 0; firstAt = now(); arm(debounceMs); }
      else if (out.stop) { tell("blocked", { reason: out.stop }); }
      else {
        attempts += 1;
        if (attempts >= maxAttempts) { tell("gave-up", { reason: out.retry, attempts }); }
        else { const wait = backoffMs[Math.min(attempts - 1, backoffMs.length - 1)]; tell("retrying", { reason: out.retry, attempts, waitMs: wait }); arm(wait); }
      }
    })().finally(() => { running = null; });
    return running;
  }

  return {
    /** A chat (or document) and its key are being removed: mark it pending NOW (before the removal is stored, so a crash cannot lose it) and compact after the debounce. */
    removalQueued() {
      generation += 1; attempts = 0;
      try { if (!pending()) marker.write(JSON.stringify({ v: 1, pending: true, since: now() })); } catch { /* the marker is a convenience for the next unlock; the in-memory timer still runs */ }
      if (firstAt === null) firstAt = now();
      if (!readyToCompact()) return;                       // only a session that can write queues a removal; if there is none the next attach resumes
      if (running) return;                                 // the running round sees the new generation and schedules the next one itself
      arm(Math.min(debounceMs, Math.max(0, firstAt + maxWaitMs - now())));
    },
    /** A vault session was attached (boot or unlock): finish a compaction a closed page left pending. */
    attached() { attempts = 0; firstAt = null; if (pending() && readyToCompact()) arm(resumeMs); },
    /** The vault was locked or detached: nothing may run; the marker (if any) stays for the next unlock. */
    detached() { cancel(); firstAt = null; attempts = 0; },
    /** Resolves when no attempt is running (tests, and a page that wants to wait before closing). */
    async idle() { while (running) await running; },
    state() { return { status, pending: pending(), attempts, armed: timer !== null, running: running !== null }; }
  };
}
