// Turning the vault on: what is reported AFTER the encrypted copy is durable (finalization), and what an interrupted setup says.
// Two corrections on top of the writer lease: (1) an enable whose attached session was locked, detached, replaced or re-attached while the browser's
// advisory storage.persist() was awaited reports neither success nor vault:unlocked; (2) an interruption after setup data may already be stored says so
// honestly (it never claims "not written" / "nothing changed" / "try again"), and keeps the original unencrypted data, the stored header and records.
import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryAdapter } from "../chat/vault/vault-db.mjs";
import { createVault } from "../chat/vault/vault.mjs";
import { createAppStorage } from "../chat/vault/vault-store.mjs";
import { createVaultControl } from "../chat/vault/vault-control.mjs";

globalThis.indexedDB ||= {};
const storage = (threads = "[]") => { const m = new Map([["chatThreads", threads]]); return { get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
// One real-looking Web Lock: a second request while it is owned is refused (ifAvailable gives null).
const locks = (taken = false) => { let owned = taken; return { request: async (name, opts, cb) => { if (owned) return cb(null); owned = true; try { return await cb({ name }); } finally { owned = false; } } }; };
const setPersist = (fn) => Object.defineProperty(globalThis, "navigator", { configurable: true, value: { storage: { persist: fn } } });
const gate = () => { let hit, release; const entered = new Promise((r) => (hit = r)), open = new Promise((r) => (release = r)); return { entered, open, hit, release }; };
const FALSE_CLAIMS = /not written|nothing changed|nothing was lost|try again|before it changed anything/i;
function rig({ adapter = createMemoryAdapter(), lockImpl = locks(), threads = "[]" } = {}) {
  const realLocal = storage(threads), realSession = storage(), app = createAppStorage({ realLocal, realSession }), events = [];
  const control = createVaultControl({ app, adapter, realLocal, realSession, locks: lockImpl, iterations: 1000, docs: { all: async () => [], put: async () => {} }, events: { emit: (name, detail) => events.push({ name, detail }) } });
  return { realLocal, realSession, app, events, control, adapter };
}
const reached = (g, what) => Promise.race([g.entered, new Promise((_, rej) => setTimeout(() => rej(new Error("boundary never reached: " + what)), 5000).unref())]);
const settle = (p) => p.then(() => ({ ok: true }), (e) => ({ ok: false, code: e.code, message: String(e.message) }));
const assertHonestPartial = (result) => {
  assert.equal(result.ok, false); assert.equal(result.code, "session-changed");
  assert.doesNotMatch(result.message, FALSE_CLAIMS);
  assert.match(result.message, /interrupted/i); assert.match(result.message, /(may|might) already (be )?(saved|stored)/i); assert.match(result.message, /original unencrypted data was kept/i);
};

test("unchanged positive: an enable nobody disturbs succeeds, attaches, emits vault:unlocked once", async () => {
  setPersist(async () => true);
  const r = rig();
  const out = await settle(r.control.enable("synthetic"));
  assert.equal(out.ok, true); assert.equal(r.app.active, true);
  assert.deepEqual(r.events, [{ name: "vault:unlocked", detail: { fresh: true } }]);
  assert.equal(r.realLocal.getItem("chatThreads"), "[]");
  await r.app.lease?.release();
});

test("lock + detach while storage.persist is awaited: no success, no vault:unlocked, stored data stays", async () => {
  const g = gate(); setPersist(async () => { g.hit(); await g.open; return true; });
  const r = rig(); const p = settle(r.control.enable("synthetic"));
  await reached(g, "gate"); const captured = r.app.vaultSession, lease = r.app.lease, stored = (await r.adapter.readLog()).length;
  captured.lock(); r.app.detach(); g.release();
  const out = await p;
  assertHonestPartial(out);
  assert.deepEqual(r.events, []); assert.equal(r.app.active, false);
  assert.equal((await r.adapter.readLog()).length, stored, "no extra stale mutation"); assert.ok(await r.adapter.readHeader(), "legitimately committed header stays");
  assert.equal(r.realLocal.getItem("chatThreads"), "[]", "original unencrypted data kept");
  await lease.release();
});

test("replacement session during persist: no success or event for the old attach; the replacement is untouched", async () => {
  const g = gate(); setPersist(async () => { g.hit(); await g.open; return true; });
  const r = rig(); const p = settle(r.control.enable("synthetic"));
  await reached(g, "gate"); const lease = r.app.lease;
  const replacement = await createVault({ adapter: createMemoryAdapter() }).create("other", { iterations: 1000 });
  r.app.detach(); r.app.attach(replacement, { writer: true, lease: null });
  const epoch = r.app.epoch; g.release();
  const out = await p;
  assertHonestPartial(out);
  assert.deepEqual(r.events, []); assert.equal(r.app.vaultSession, replacement); assert.equal(replacement.locked, false); assert.equal(r.app.epoch, epoch);
  await lease.release();
});

test("same session object detached and attached again (new epoch): the old completion publishes nothing", async () => {
  const g = gate(); setPersist(async () => { g.hit(); await g.open; return true; });
  const r = rig(); const p = settle(r.control.enable("synthetic"));
  await reached(g, "gate"); const captured = r.app.vaultSession, lease = r.app.lease;
  r.app.detach(); r.app.attach(captured, { writer: true, lease });
  g.release();
  const out = await p;
  assertHonestPartial(out);
  assert.deepEqual(r.events, []); assert.equal(r.app.vaultSession, captured, "the re-attached session is not locked or replaced by the stale completion"); assert.equal(captured.locked, false);
  await lease.release();
});

test("lease lost during persist (writer lock given back): no success, no event", async () => {
  const g = gate(); setPersist(async () => { g.hit(); await g.open; return true; });
  const r = rig(); const p = settle(r.control.enable("synthetic"));
  await reached(g, "gate"); await r.app.lease.release(); g.release();
  const out = await p;
  assertHonestPartial(out); assert.deepEqual(r.events, []);
});

test("header committed, then the lifecycle changes before create returns: honest partial message, header kept, raw intact", async () => {
  setPersist(async () => true);
  const base = createMemoryAdapter(), g = gate();
  const adapter = { ...base, writeHeader: async (...a) => { const x = await base.writeHeader(...a); g.hit(); await g.open; return x; } };
  const r = rig({ adapter }); const p = settle(r.control.enable("synthetic"));
  await reached(g, "gate"); r.app.detach(); g.release();
  const out = await p;
  assertHonestPartial(out);
  assert.ok(await base.readHeader(), "the header was durable before the change and remains"); assert.equal((await base.readLog()).length, 0);
  assert.equal(r.realLocal.getItem("plc.vault.v1"), null); assert.equal(r.realLocal.getItem("chatThreads"), "[]"); assert.equal(r.app.active, false); assert.deepEqual(r.events, []);
});

test("later append interrupted after earlier records are durable: honest partial message, records kept", async () => {
  setPersist(async () => true);
  const threads = JSON.stringify([{ id: "t1", title: "one", messages: [] }, { id: "t2", title: "two", messages: [] }]);
  const base = createMemoryAdapter(), g = gate(); let n = 0;
  const adapter = { ...base, append: async (...a) => { const x = await base.append(...a); if (++n === 2) { g.hit(); await g.open; } return x; } };
  const r = rig({ adapter, threads }); const p = settle(r.control.enable("synthetic"));
  await reached(g, "second append"); const durable = (await base.readLog()).length; assert.ok(durable >= 2, "two real records are durable at the boundary"); r.app.detach(); g.release();
  const out = await p;
  assertHonestPartial(out);
  assert.equal((await base.readLog()).length, durable, "no append after the change"); assert.ok(await base.readHeader());
  assert.equal(r.realLocal.getItem("chatThreads"), threads); assert.deepEqual(r.events, []);
});

test("lock only (no detach) while storage.persist is awaited: no success, no vault:unlocked, nothing else touched", async () => {
  const g = gate(); setPersist(async () => { g.hit(); await g.open; return true; });
  const r = rig(); const p = settle(r.control.enable("synthetic"));
  await reached(g, "persist"); const captured = r.app.vaultSession, lease = r.app.lease, stored = (await r.adapter.readLog()).length;
  captured.lock(); g.release();
  const out = await p;
  assertHonestPartial(out);
  assert.deepEqual(r.events, []); assert.equal((await r.adapter.readLog()).length, stored); assert.ok(await r.adapter.readHeader());
  assert.equal(r.realLocal.getItem("chatThreads"), "[]");
  await lease.release();
});

test("refusals before any write keep their truthful wording: no exclusive writer, read-only tab", async () => {
  setPersist(async () => true);
  const a = rig({ lockImpl: {} }); const noex = await settle(a.control.enable("synthetic"));
  assert.equal(noex.code, "no-exclusive"); assert.match(noex.message, /untouched/); assert.equal(await a.adapter.readHeader(), null); assert.equal(a.app.active, false);
  const b = rig({ lockImpl: locks(true) }); const ro = await settle(b.control.enable("synthetic"));
  assert.equal(ro.code, "read-only"); assert.doesNotMatch(ro.message, /interrupted|already be saved/i); assert.equal(await b.adapter.readHeader(), null);
});
