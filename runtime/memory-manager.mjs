// Logical memory management for every model that can sit in memory (chat model, voice, matching/embedding models, later image and OCR models).
//
// There are exactly two behaviours, chosen by the person in Settings, and nothing in between:
//   "keep"           the app tries to do whatever is asked, even if that is too much for the device; it says what is happening and, if it fails, why.
//   "one-at-a-time"  before a model is used, every other model is unloaded (their files stay on the device) and waits for one that is busy to finish.
//                    Models load again, lazily, the next time they are used. This costs time and gives the model in use the whole device.
// There is no automatic or predictive mode: the manager never guesses what will fit.
//
// The manager never loads anything. Each model kind keeps its own loading, progress and error handling and registers a "resident":
//   { id, kind, label (string | () => string), state() -> "unloaded"|"loading"|"loaded"|"busy"|"unloading"|"faulted",
//     unload() -> Promise, isBusy() -> boolean, estimateBytes?() -> number|null}
// There are no exceptions: whichever model is about to be used makes every other model unload, however small it is.
// A model asks for the device with `acquire(id)`, holds the lease while it works and calls `lease.release()` when done.
import { appLocal } from "../chat/vault/vault-store.mjs";

export const MEMORY_KEY = "plc.modelMemory.v1";
/** The key this switch used to share with the assistant's memory items (`plc.memory.v1`), which each overwrote. Read once to carry the choice over; never written. */
export const OLD_SHARED_KEY = "plc.memory.v1";
export const POLICIES = Object.freeze(["keep", "one-at-a-time"]);

export function createMemoryManager({ storage = appLocal, wait = (ms) => new Promise((r) => setTimeout(r, ms)), now = () => Date.now(), pollMs = 100 } = {}) {
  const residents = new Map();           // id -> resident
  const leases = new Map();              // id -> count
  const listeners = new Set();
  let record = read();
  let activity = null;                   // { text, at } while a swap or a wait is happening
  let queue = Promise.resolve();         // acquisitions are ordered, so two models never unload each other

  function read() {
    for (const key of [MEMORY_KEY, OLD_SHARED_KEY]) try { const r = JSON.parse(storage?.getItem(key)); if (r && typeof r === "object") return { policy: POLICIES.includes(r.policy) ? r.policy : "keep", offerDeclined: Boolean(r.offerDeclined) }; } catch { /* unreadable: defaults */ }
    return { policy: "keep", offerDeclined: false };
  }
  function save() { try { storage?.setItem(MEMORY_KEY, JSON.stringify(record)); } catch { /* private mode: the choice lasts this page only */ } }
  const labelOf = (r) => (typeof r.label === "function" ? r.label() : r.label) || r.id;
  const stateOf = (r) => { try { return r.state(); } catch { return "unloaded"; } };
  const busyOf = (r) => (leases.get(r.id) || 0) > 0 || Boolean(r.isBusy?.());
  const inMemory = (r) => { const s = stateOf(r); return s === "loaded" || s === "loading" || s === "busy" || s === "faulted"; };
  function emit() { const snap = api.snapshot(); for (const f of listeners) { try { f(snap); } catch { /* a listener must not break the flow */ } } }
  function say(text) { activity = text ? { text, at: now() } : null; emit(); }

  const api = {
    get policy() { return record.policy; },
    get offerDeclined() { return record.offerDeclined; },
    setPolicy(policy) { if (!POLICIES.includes(policy)) throw new Error("unknown memory policy: " + policy); record.policy = policy; save(); emit(); },
    declineOffer() { record.offerDeclined = true; save(); emit(); },

    /** A model kind announces itself. Returns a function that removes it. Registering again with the same id replaces the earlier one. */
    register(resident) {
      if (!resident?.id || typeof resident.state !== "function" || typeof resident.unload !== "function") throw new Error("a resident needs an id, state() and unload()");
      residents.set(resident.id, resident); emit();
      return () => { if (residents.get(resident.id) === resident) { residents.delete(resident.id); emit(); } };
    },
    /** A model kind calls this when its state changed on its own (it finished loading, was idle-unloaded, ...), so the cues follow. */
    notify() { emit(); },

    snapshot() {
      return {
        policy: record.policy, offerDeclined: record.offerDeclined, activity,
        residents: [...residents.values()].map((r) => ({ id: r.id, kind: r.kind || r.id, label: labelOf(r), state: stateOf(r), busy: busyOf(r), estimateBytes: r.estimateBytes?.() ?? null })),
      };
    },
    subscribe(f) { listeners.add(f); return () => listeners.delete(f); },

    /**
     * A model is about to be used. Under "one-at-a-time" every other model that is in memory is unloaded first (a busy one is waited for). Under "keep"
     * this only records the lease. Resolves to a lease; call `lease.release()` when the work is finished. `signal` stops a wait.
     */
    acquire(id, { reason = "", signal } = {}) {
      const me = residents.get(id);
      const take = () => { leases.set(id, (leases.get(id) || 0) + 1); let done = false; emit(); return { release() { if (done) return; done = true; leases.set(id, Math.max(0, (leases.get(id) || 1) - 1)); emit(); } }; };
      if (record.policy !== "one-at-a-time" || !me) return Promise.resolve(take());
      const run = queue.then(async () => {
        const tried = new Set();           // a model that stays loaded after its unload is not asked again: the app goes on and tries
        for (;;) {
          signal?.throwIfAborted?.();
          const others = [...residents.values()].filter((r) => r.id !== id && inMemory(r) && !tried.has(r.id));
          if (!others.length) break;
          const busy = others.filter((r) => busyOf(r));
          for (const r of others.filter((x) => !busyOf(x))) {
            tried.add(r.id);
            say("Unloading " + labelOf(r) + " to make room for " + labelOf(me) + "…");
            try { await r.unload(); } catch { /* it is stopped anyway */ }
            emit();
          }
          if (busy.length) { say("Waiting for " + busy.map(labelOf).join(", ") + " to finish before " + labelOf(me) + " can use the device…"); await wait(pollMs); }
        }
        say(null);
        return take();
      });
      queue = run.then(() => undefined, () => undefined);
      return run.finally(() => { if (activity) say(null); });
    },

    /** Unload everything that is in memory and not busy (the "Unload all" button). Files stay. */
    async unloadAll() {
      let n = 0;
      for (const r of [...residents.values()]) {
        if (!inMemory(r) || busyOf(r)) continue;
        try { await r.unload(); n++; } catch { /* stopped anyway */ }
      }
      emit(); return n;
    },
    async unload(id) {
      const r = residents.get(id); if (!r || !inMemory(r) || busyOf(r)) return false;
      try { await r.unload(); } catch { /* stopped anyway */ }
      emit(); return true;
    },
  };
  return api;
}
