// What the person can do with their vault: turn it on (encrypting what is already saved), lock it, change the passphrase, add a passkey, turn it off.
// The Settings dialogs in chat/lock/lock.mjs call this; it has no DOM of its own. createVaultControl({ app, adapter, realLocal, realSession, docs, events, reload }).
import { createVault, VaultError, DEFAULT_ITERATIONS } from "./vault.mjs";
import { createIndexedDbAdapter } from "./vault-db.mjs";
import { VAULT_MARKER, parseMarker, createAndMigrate, removeVerifiedPlaintext, inspectPlaintext, reconcileRaw, plaintextRemains, restorePlaintext, claimWriter } from "./vault-store.mjs";
import { REGISTRY_KEY, parseRegistry, findNewer } from "./data-formats.mjs";

const changed = () => new VaultError("session-changed", "The vault was locked or replaced while this was running, so it was stopped before it changed anything more. Nothing was lost; try again.");
/** Multi-step migration, cleanup and turning off need a writer that nobody else can be: a real Web Lock held by this tab. A read-only tab, or no Web Locks at all, refuses before touching anything. */
const needExclusive = (app, what) => {
  if (app.readOnly) throw new VaultError("read-only", "This app is open in another tab, so " + what + " is not done here.");
  if (!app.exclusive) throw new VaultError("no-exclusive", "This browser cannot guarantee that only this tab is changing the encrypted vault (no Web Locks), so " + what + " is not done here. Your saved data is untouched.");
};

export function createVaultControl({ app, adapter = null, realLocal = globalThis.localStorage, realSession = globalThis.sessionStorage, docs, events = null, reload = () => location.reload(), iterations = DEFAULT_ITERATIONS, dropDocsDb = defaultDropDocsDb, now = () => Date.now(), locks = undefined } = {}) {
  const store = () => (adapter ||= createIndexedDbAdapter());
  // One claim attempt. A page that just gave the lock back, or a read-only page's temporary waiter request, can hold it for an instant, so a refusal is tried again a few times before it is believed.
  const claimOnce = async () => {
    let claim = await claimWriter(locks ? { locks } : {});
    for (let i = 0; i < 4 && !claim.writer && claim.supported; i++) { await new Promise((r) => setTimeout(r, 50)); claim = await claimWriter(locks ? { locks } : {}); }
    return claim;
  };
  const marker = () => { try { return parseMarker(realLocal.getItem(VAULT_MARKER)); } catch { return {}; } };
  const writeMarker = (patch) => { try { realLocal.setItem(VAULT_MARKER, JSON.stringify({ ...marker(), ...patch })); } catch { /* the marker is an optimisation */ } };
  const emit = (name, ...args) => { try { events?.emit(name, ...args); } catch { /* a listener must not stop this */ } };

  const api = {
    get supported() { return Boolean(globalThis.indexedDB) && Boolean(globalThis.crypto?.subtle); },
    get active() { return app.active; },
    get autoMinutes() { return Number(marker().autoMinutes) || 0; },
    get lockOnHide() { return Boolean(marker().lockOnHide); },
    setLockOnHide(on) { writeMarker({ lockOnHide: Boolean(on) }); },
    get readOnly() { return app.readOnly; },
    setAutoMinutes(minutes) { writeMarker({ autoMinutes: Number(minutes) || 0 }); },
    get rememberKeys() { return app.rememberKeys; },
    setRememberKeys(on) { app.setRememberKeys(on); },
    get stats() { return app.stats; },
    get header() { return app.vaultSession?.header || null; },
    /** What is still readable in the browser's own storage after turning the vault on. */
    plaintextRemaining() { return plaintextRemains(realLocal, realSession); },

    /** Encrypt everything that is saved now with this passphrase, check it by reading it back, and start using the vault. The unencrypted copy stays until `removePlaintext`. */
    async enable(passphrase, { autoMinutes = 0 } = {}) {
      if (app.active) throw new VaultError("exists", "The vault is already on.");
      if (!api.supported) throw new VaultError("unsupported", "This browser cannot keep an encrypted vault.");
      // One scoped transition (overlap with turning off, cleanup or retry is refused as busy). It starts from an INACTIVE app and captures that epoch: if anything attaches or detaches while it waits,
      // it stops before it persists anything more and gives back only the claim it made itself.
      return app.transition("enable", async (fence) => {
        const same = () => !app.active && app.epoch === fence.epoch;
        if (!same()) throw changed();
        // The real writer claim comes BEFORE any vault is created: another tab that owns it makes this refuse with nothing written, and no Web Locks means no new multi-step migration here.
        let claim = await claimOnce();
        let kept = false;
        try {
          if (!claim.writer) throw new VaultError("read-only", "This app is open in another tab, so turning encryption on is not done here.");
          if (!claim.supported) throw new VaultError("no-exclusive", "This browser cannot guarantee that only this tab is changing the encrypted vault (no Web Locks), so turning encryption on is not done here. Your saved data is untouched.");
          if (!same()) throw changed();
          const documents = docs ? await docs.all() : [];
          if (!same()) throw changed();
          // The guard is the LIVE lease plus the inactive lifecycle captured at the start: it is asked where each record (header, every append, the marker) is actually written, so a stale enable stores nothing more.
          const guard = () => same() && claim.owned === true;
          const result = await createAndMigrate({ passphrase, adapter: store(), realLocal, realSession, documents, iterations, autoMinutes, guard });
          if (!same()) { try { result.session.lock(); } catch { /* the replacement owns the vault now: nothing of it is touched */ } throw changed(); }
          app.attach(result.session, { writer: true, lease: claim }); kept = true;
        } finally { if (!kept) await claim.release(); } // only THIS action's own handle; a refused or unsupported claim releases nothing
        try { await globalThis.navigator?.storage?.persist?.(); } catch { /* the browser decides; asking makes it less likely to clear the vault under storage pressure */ }
        emit("vault:unlocked", { fresh: true });
        return { remaining: api.plaintextRemaining() };
      });
    },
    /** What start-up found: { recovered, verified, conflicts, stale, held, blocked, unreadable, failed } (chat/vault/vault-store.mjs reconcileRaw), or null with the vault off. */
    get recovery() { return app.recovery; },
    /** Each unencrypted copy that is still stored, checked against the STORED vault: [{ key, kind, status }] with status equal | conflict | sole | stale | unreadable | blocked. */
    async plaintextReport() {
      if (!app.active) return [];
      return (await inspectPlaintext({ session: app.vaultSession, adapter: store(), realLocal, realSession })).map(({ raw, ...rest }) => rest);
    },
    /**
     * Delete the unencrypted copies the stored vault verifiably holds, and the old screen-lock record. Call only after the person confirmed. Anything else is kept and listed:
     * -> { removed: [key], kept: [{ key, reason }] }. discardDiffering (a second confirmation) also removes copies that differ from, or are stale against, the encrypted value.
     */
    async removePlaintext({ discardDiffering = false } = {}) {
      if (!app.active) throw new VaultError("inactive", "The vault is not on.");
      needExclusive(app, "removing the unencrypted copy");
      return app.transition("cleanup", async (fence) => {
        const result = await removeVerifiedPlaintext({ session: fence.session, adapter: store(), realLocal, realSession, discardDiffering, writer: true, exclusive: true, fence: () => app.isCurrent(fence) });
        if (app.isCurrent(fence)) await dropDocsDb(); // after a lock or a swap the replacement session decides; the old document database is only dropped by the action that still owns the vault
        return result;
      });
    },
    /**
     * Try again to move unencrypted values that were only held. Judged against the STORED vault read back fresh (never memory); a key whose history is ambiguous stays held. Needs the exclusive writer
     * (a read-only tab or a browser without Web Locks refuses and changes nothing). Two overlapping calls share one run; a cleanup or turning off running refuses it as busy. Never removes anything.
     */
    async retryRecovery() {
      if (!app.active) return null;
      needExclusive(app, "saving the unencrypted items");
      return app.transition("retry", async (fence) => {
        await app.flush();
        if (!app.isCurrent(fence)) throw changed();
        const report = await reconcileRaw({ session: fence.session, adapter: store(), realLocal, writer: true, exclusive: true, fence: () => app.isCurrent(fence) });
        if (!app.isCurrent(fence)) throw changed();
        app.adopt(report.recovered); app.setHeld(report.held, report.heldValues); app.setRecovery(report);
        return report;
      }, { coalesce: true });
    },

    /** Lock now: finish writing, forget the key, and reload so nothing the page built from the data survives. */
    async lockNow() {
      if (!app.active) return;
      await app.flush().catch(() => {});
      app.vaultSession.lock(); app.detach();
      emit("vault:locked");
      reload();
    },
    async changePassphrase(current, next) { await app.vaultSession.changePassphrase(current, next, { iterations }); },

    /**
     * Turn the vault off: check the passphrase, write everything back as plain storage holds it, then remove the vault.
     * An unencrypted copy that differs from the encrypted value is never overwritten by default: the call throws code "conflict" (keys listed) and changes nothing. The SEPARATE, explicit
     * choice { replaceDiffering: true } (the person was told those items are replaced for good) replaces exactly the differing text that was seen; it never touches a value the vault does not
     * hold, an unreadable list or a newer-format value, and a raw value that changed after it was checked still refuses.
     */
    async disable(passphrase, { replaceDiffering = false } = {}) {
      if (!app.active) return;
      needExclusive(app, "turning encryption off"); // before the adapter, the raw storage, the marker or the documents are touched
      return app.transition("disable", async (fence) => {
        const lease = app.lease; // THIS page's own writer-lock handle, captured with the fence: the only lock this action may ever release (never looked up again, never another page's)
        const current = () => { if (!app.isCurrent(fence)) throw changed(); };
        await createVault({ adapter: store() }).unlock(passphrase).then((s) => s.lock()); // throws bad-passphrase
        current();
        await app.flush(); current();
        // Writing the encrypted values back overwrites the plain copy. A raw value EQUAL to the stored one is simply replaced by the newer live one. A raw value that DIFFERS is never replaced
        // by default, whatever the key is called (there is no key-name exception: nothing here knows why a differing copy exists, and it could be the only record of something the person
        // wrote). Only the separate explicit choice replaces those, naming exactly the text that was seen. Everything else that restoring would overwrite is kept and refuses: a newer-format
        // value, an unreadable list, and any raw value that changed after it was checked.
        const entries = await inspectPlaintext({ session: fence.session, adapter: store(), realLocal, realSession }); current();
        const allow = { local: {}, session: {} };
        for (const e of entries) if (e.status === "equal" || (replaceDiffering && e.status === "conflict")) allow[e.kind][e.key] = e.raw;
        // documents: read until what was read is what the vault holds now (a document saved during the wait must not be lost)
        let documents = null;
        for (let attempt = 0; attempt < 4 && !documents; attempt++) {
          const read = app.docsBackend ? await app.docsBackend.all() : []; current();
          await app.flush(); current();
          const live = fence.session.state.docs, same = read.length === live.size && read.every((d) => JSON.stringify(live.get(String(d.id))) === JSON.stringify(d));
          if (same) documents = read;
        }
        if (!documents) throw new VaultError("busy", "Documents kept changing, so encryption was not turned off. Try again.");
        // From here to the detach nothing is awaited: the raw values are compared again NOW, and nothing is written unless every one of them is still what was checked.
        current();
        let blockedNow = [];
        try { const keys = []; for (let i = 0; i < realLocal.length; i++) keys.push(realLocal.key(i)); blockedNow = findNewer({ registry: parseRegistry(realLocal.getItem(REGISTRY_KEY)), storedKeys: keys }).blocked; } catch { /* unreadable storage: nothing newer is known */ }
        const snapshot = app.snapshot();
        restorePlaintext(snapshot, realLocal, realSession, { allow, blocked: blockedNow }); // throws conflict with the keys, writing nothing
        app.detach();
        // Our own detach changed the lifecycle counter, so the fence captured at the start can never hold again. Note the counter that THIS detach produced and require it to stay: if anything
        // attached a session while a document was being written (a replacement), this action stops before it clears the replacement's vault or its marker.
        const detachedEpoch = app.epoch, stillOurs = () => !app.active && app.epoch === detachedEpoch;
        const afterDetach = () => { if (!stillOurs()) throw changed(); };
        try {
          for (const d of documents) { await docs.put(d); afterDetach(); }
          afterDetach();
          await store().clear({ guard: stillOurs }); // checked again by the adapter after ITS open / at its transaction's activity
          afterDetach();
          try { realLocal.removeItem(VAULT_MARKER); } catch { /* ignore */ }
        } catch (error) {
          // The vault is not off: do not leave the page treating a protected origin as plain. If nothing replaced us, the stored vault is still there and our lock is still ours, the SAME session is
          // attached again with the SAME handle. What was already written (the plain copies, any documents) is not rolled back, and a replacement session is never touched.
          if (stillOurs() && lease?.owned && !fence.session.locked) {
            let header = null; try { header = await store().readHeader(); } catch { header = null; }
            if (header && stillOurs()) app.attach(fence.session, { writer: true, lease });
          }
          throw error;
        }
        // Everything is durable and the epoch is still ours: now, and only now, give back this page's own writer lock, and wait until it is physically free (another page can take it at once).
        if (lease) await lease.release();
        emit("vault:locked", { off: true });
      });
    },
    /** Make a passkey a second way in. `make` comes from chat/vault/passkey.mjs. */
    async addPasskey(make) { const wrap = await make({ dekBytes: app.vaultSession.dekBytes(), wrapWithSecret: createVault({ adapter: store() }).wrapWithSecret }); await app.vaultSession.addWrap(wrap); return wrap; },
    async removePasskey(id) { await app.vaultSession.removeWrap(id); },
    get passkeys() { return (app.vaultSession?.header?.wraps || []).filter((w) => w.type === "passkey"); }
  };
  return api;
}

async function defaultDropDocsDb() {
  await new Promise((resolve) => { try { const q = globalThis.indexedDB.deleteDatabase("plc-docs"); q.onsuccess = q.onerror = q.onblocked = () => resolve(); } catch { resolve(); } });
}
