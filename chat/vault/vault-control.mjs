// What the person can do with their vault: turn it on (encrypting what is already saved), lock it, change the passphrase, add a passkey, turn it off.
// The Settings dialogs in chat/lock/lock.mjs call this; it has no DOM of its own. createVaultControl({ app, adapter, realLocal, realSession, docs, events, reload }).
import { createVault, VaultError, DEFAULT_ITERATIONS } from "./vault.mjs";
import { createIndexedDbAdapter } from "./vault-db.mjs";
import { VAULT_MARKER, parseMarker, createAndMigrate, removePlaintext, plaintextRemains, restorePlaintext, claimWriter } from "./vault-store.mjs";

export function createVaultControl({ app, adapter = null, realLocal = globalThis.localStorage, realSession = globalThis.sessionStorage, docs, events = null, reload = () => location.reload(), iterations = DEFAULT_ITERATIONS, dropDocsDb = defaultDropDocsDb, now = () => Date.now() } = {}) {
  const store = () => (adapter ||= createIndexedDbAdapter());
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
      const documents = docs ? await docs.all() : [];
      const result = await createAndMigrate({ passphrase, adapter: store(), realLocal, realSession, documents, iterations, autoMinutes });
      const claim = await claimWriter();
      app.attach(result.session, { writer: claim.writer });
      try { await globalThis.navigator?.storage?.persist?.(); } catch { /* the browser decides; asking makes it less likely to clear the vault under storage pressure */ }
      emit("vault:unlocked", { fresh: true });
      return { remaining: api.plaintextRemaining() };
    },
    /** Delete the unencrypted copy (and the old screen-lock record). Call only after the person confirmed. */
    async removePlaintext() { const removed = removePlaintext(realLocal, realSession); await dropDocsDb(); return removed; },

    /** Lock now: finish writing, forget the key, and reload so nothing the page built from the data survives. */
    async lockNow() {
      if (!app.active) return;
      await app.flush().catch(() => {});
      app.vaultSession.lock(); app.detach();
      emit("vault:locked");
      reload();
    },
    async changePassphrase(current, next) { await app.vaultSession.changePassphrase(current, next, { iterations }); },

    /** Turn the vault off: check the passphrase, write everything back as plain storage holds it, then remove the vault. */
    async disable(passphrase) {
      if (!app.active) return;
      await createVault({ adapter: store() }).unlock(passphrase).then((s) => s.lock()); // throws bad-passphrase
      await app.flush();
      const snapshot = app.snapshot(), documents = app.docsBackend ? await app.docsBackend.all() : [];
      app.detach();
      restorePlaintext(snapshot, realLocal, realSession);
      for (const d of documents) await docs.put(d);
      await store().clear();
      try { realLocal.removeItem(VAULT_MARKER); } catch { /* ignore */ }
      emit("vault:locked", { off: true });
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
