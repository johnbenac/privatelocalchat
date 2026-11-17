// One actor process of tests/vault-transition-concurrency.test.mjs. It runs the REAL (copied) chat/vault modules as one browser tab would: its own localStorage view (a shared folder), the
// shared vault (a shared folder), and Web Locks spoken to a broker in the parent that frees the lock when this process dies. At a chosen point the parent kills it with SIGKILL
// (this file only stands still there; it never kills itself). Configuration is one JSON argument; messages to the parent are JSON lines on stdout; the parent writes "go" to stdin.
import fs from 'node:fs';
import readline from 'node:readline';
import { loadModules, fileAdapter, fileStorage, brokerLocks } from './vault-transition-rig.mjs';

const cfg = JSON.parse(process.argv[2]);
const say = (m) => fs.writeSync(1, JSON.stringify(m) + '\n');
const sleeper = new Int32Array(new SharedArrayBuffer(4));
const pause = (ms) => Atomics.wait(sleeper, 0, 0, ms);
const counters = {};
function phase(name) { counters[name] = (counters[name] || 0) + 1; const full = name + ':' + counters[name]; if (cfg.killAt !== full) return; say({ t: 'phase', name: full, pid: process.pid }); pause(60000); say({ t: 'survived-the-wait', name: full }); process.exit(3); }

const local = fileStorage(cfg.localDir, { onBeforeRemove: () => phase('pre-remove'), onAfterRemove: () => phase('post-remove') });
const session = fileStorage(cfg.sessionDir);
const adapter = fileAdapter(cfg.vaultDir, { before: () => phase('pre-append'), after: () => phase('post-append') });
const locks = cfg.locks === 'none' ? undefined : brokerLocks(cfg.socket);
const mods = await loadModules({ store: cfg.store, control: cfg.control }, { local, session, locks });

const lines = readline.createInterface({ input: process.stdin });
say({ t: 'ready', pid: process.pid });
let goSeen = false;
lines.on('line', async (line) => {
  if (goSeen) { if (line === 'exit') process.exit(0); return; } // a tab stays open (and keeps its Web Lock) until told to go away
  goSeen = true;
  const out = { t: 'result', role: cfg.role, pid: process.pid };
  try {
    if (cfg.role === 'raw-writer') { // another tab changing a raw value while the others start
      pause(cfg.delayMs || 0); local.setItem(cfg.key, cfg.value); out.wrote = true;
    } else {
      const res = await mods.store.bootVault({ adapter, realLocal: local, ui: { unlock: async ({ vault }) => vault.unlock('pw') } });
      out.writer = res.writer; const rc = res.recovery || {}; out.recovery = { recovered: rc.recovered, held: rc.held, conflicts: rc.conflicts, verified: rc.verified, failed: rc.failed, stale: rc.stale };
      const store = mods.store.appLocal;
      out.reads = {}; for (const k of cfg.readKeys || []) out.reads[k] = store.getItem(k);
      out.nullReads = 0; out.torn = 0;
      for (let i = 0; i < (cfg.readLoops || 0); i++) { for (const k of cfg.readKeys || []) { const v = store.getItem(k); if (v == null) out.nullReads++; else if (v !== cfg.expected?.[k]) out.torn++; } await new Promise((r) => setImmediate(r)); }
      if (cfg.role === 'boot-cleanup') {
        const control = mods.control.createVaultControl({ app: mods.store.app, adapter, realLocal: local, realSession: session, dropDocsDb: async () => {} });
        try { const r = await control.removePlaintext({ discardDiffering: Boolean(cfg.discard) }); out.removed = r.removed; out.kept = r.kept; } catch (e) { out.cleanupError = e.code || String(e.message); }
      }
      if (cfg.role === 'boot-retry') { // the Security dialog's "try again" while other tabs do the same or clean up
        const control = mods.control.createVaultControl({ app: mods.store.app, adapter, realLocal: local, realSession: session, dropDocsDb: async () => {} });
        try { const r = await control.retryRecovery(); out.retry = { recovered: r.recovered, held: r.held }; } catch (e) { out.retryError = e.code || String(e.message); }
      }
      if (cfg.role === 'boot-write') { mods.store.appLocal.setItem('plc.prefs.v1', JSON.stringify({ writer: process.pid })); await mods.store.app.flush(); out.wrote = true; }
    }
  } catch (error) { out.error = String(error?.message || error); }
  say(out);
});
