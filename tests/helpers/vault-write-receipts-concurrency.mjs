// Concurrency helper for vault-write-receipts tests.
// Runs parallel actors on a scratch copy with stated invariants, repeated 20 times.
// This file is the actor process for the concurrency test.
import fs from 'node:fs';
import readline from 'node:readline';
import { createAppStorage, memoryStorage, createWriteMode, RECEIPT } from '../chat/vault/vault-store.mjs';
import { createVault } from '../chat/vault/vault.mjs';
import { createMemoryAdapter } from '../chat/vault/vault-db.mjs';

const cfg = JSON.parse(process.argv[2]);
const say = (m) => fs.writeSync(1, JSON.stringify(m) + '\n');

const realLocal = memoryStorage(cfg.initial?.local);
const realSession = memoryStorage(cfg.initial?.session);
const adapter = createMemoryAdapter();
const store = createAppStorage({ realLocal, realSession });
const vault = createVault({ adapter });

const lines = readline.createInterface({ input: process.stdin });
let goSeen = false;
let result = null;

lines.on('line', async (line) => {
  if (goSeen) { if (line === 'exit') process.exit(0); return; }
  goSeen = true;

  try {
    const session = await vault.create('pw', { iterations: 1000 });
    store.attach(session, { writer: true, adapter });

    const mode = createWriteMode(store, { feature: cfg.feature || 'conc', guard: () => true });

    if (cfg.action === 'write') {
      result = await mode.putKV(cfg.key, cfg.expectedRaw || null, cfg.value, { operationId: cfg.operationId || 'actor-' + cfg.pid });
    } else if (cfg.action === 'read') {
      result = await mode.readDurable([cfg.key]);
    } else if (cfg.action === 'threads') {
      result = await mode.putThreads(cfg.expectedRaw || '[]', cfg.value, { operationId: cfg.operationId || 'actor-' + cfg.pid });
    }

    say({ t: 'result', pid: process.pid, ...result });
  } catch (error) {
    say({ t: 'error', pid: process.pid, code: error.code, message: error.message });
  }
});
