// One actor process (one 'tab') of tests/vault-typed-actors.test.mjs. It runs a COPY of chat/vault/vault.mjs (the parent builds the copy, so a deliberately broken engine can be raced the same
// way) over the SHARED folder adapter of tests/helpers/vault-typed-adapter.mjs. Configuration is one JSON argument; the parent writes one JSON command per line to stdin and reads one JSON
// reply per line from stdout. The race is released by a START FILE: every actor first answers `armed` (so the parent can see that all of them reached the barrier), then waits for the file.
//
//   open {dir}            unlock the vault in `dir` (a new session) and report the backend identity
//   read                  readChatProjection; remember the base; report a digest of the stored header+log and the owners it saw
//   arm {spec, startFile} answer `armed`, wait for startFile to exist, then run `spec` and report the outcome (see specs below)
//   reconcile             reconcileChatProjection under an always-true guard
//   exit
//
// specs: { kind: 'put', E, T, rev, op }          commit one encounter owned by thread T
//        { kind: 'removeWrong', E }              remove E naming an explicit WRONG owner generation (must be refused before P1)
//        { kind: 'reserved' }                    a generic append of an owned.put event (must be refused with `reserved`)
//        guardAfter: n                           the caller's guard answers true for its first n questions and false afterwards (a lifecycle that ended mid-commit)
import fs from 'node:fs';
import crypto from 'node:crypto';
import readline from 'node:readline';
import { pathToFileURL } from 'node:url';
import { fileProjectionAdapter } from './vault-typed-adapter.mjs';

const cfg = JSON.parse(process.argv[2]);
const say = (m) => fs.writeSync(1, JSON.stringify(m) + '\n');
const sleeper = new Int32Array(new SharedArrayBuffer(4));
const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((key) => [key, x[key]])) : x));
const digest = (v) => crypto.createHash('sha256').update(canon(v)).digest('hex');
const { createVault } = await import(pathToFileURL(cfg.vaultModule).href);

const V = (E, T) => ({ format: 1, encounter: { id: E, thread: T }, participants: { p1: { id: 'p1', encounter: E, label: 'secret ' + E } }, events: { ev1: { id: 'ev1', encounter: E, text: 'secret words' } }, holders: { [E + '\u0000h1']: 'p1' } });
const plan = (base, spec, over = {}) => ({ base, operationId: spec.op || ('op-' + process.pid), threads: { put: [], create: [], remove: [], order: undefined }, encounters: { put: [], remove: [] }, standalone: { create: [], destroy: [] }, logical: { v: 1, rev: spec.rev || 1, epoch: 1 }, ...over });
const guardFor = (spec) => { const counter = { asked: 0 }; const g = () => { counter.asked += 1; return spec.guardAfter == null || counter.asked <= spec.guardAfter; }; return { g, counter }; };

let adapter = null, session = null, base = null, seen = null;
const lines = readline.createInterface({ input: process.stdin });
lines.on('line', async (line) => {
  let m; try { m = JSON.parse(line); } catch { return; }
  try {
    if (m.cmd === 'exit') process.exit(0);
    if (m.cmd === 'open') {
      adapter = fileProjectionAdapter(m.dir, { lossy: Boolean(cfg.lossy) });
      session = await createVault({ adapter }).unlock('pw');
      say({ t: 'opened', pid: process.pid, backend: adapter.identity() });
    } else if (m.cmd === 'read') {
      const r = await session.readChatProjection({ guard: () => true });
      base = r.base; seen = r;
      say({ t: 'read', pid: process.pid, digest: digest({ header: await adapter.readHeader(), log: await adapter.readLog() }), encounters: r.encounters.map((e) => ({ id: e.id, owner: e.owner })), owners: r.owners });
    } else if (m.cmd === 'arm') {
      const spec = m.spec; say({ t: 'armed', pid: process.pid });
      while (!fs.existsSync(m.startFile)) Atomics.wait(sleeper, 0, 0, 1);
      const { g, counter } = guardFor(spec);
      const out = { t: 'result', pid: process.pid, kind: spec.kind };
      if (spec.kind === 'put') {
        const r = await session.commitChatProjection(plan(base, spec, { encounters: { put: [{ id: spec.E, owner: { type: 'thread', id: spec.T }, value: V(spec.E, spec.T) }], remove: [] } }), { guard: g });
        Object.assign(out, { status: r.status, reason: r.reason ?? null, revision: r.revision ?? null });
      } else if (spec.kind === 'removeWrong') {
        const e = seen.encounters.find((x) => x.id === spec.E);
        const r = await session.commitChatProjection(plan(base, spec, { encounters: { put: [], remove: [{ id: spec.E, owner: { ...(e ? e.owner : { type: 'thread', id: 't1' }), generation: 'X'.repeat(22) } }] } }), { guard: g });
        Object.assign(out, { status: r.status, reason: r.reason ?? null });
      } else if (spec.kind === 'reserved') {
        try { await session.append({ scope: 'dek', event: { t: 'owned.put', kind: 'encounter', id: spec.E || 'enc:x', owner: { type: 'thread', id: 't1', generation: null }, value: { format: 1 } } }); out.status = 'appended'; out.code = null; }
        catch (e) { out.status = 'refused'; out.code = e.code ?? String(e.message); }
      }
      out.guardAsked = counter.asked;
      say(out);
    } else if (m.cmd === 'reconcile') {
      const r = await session.reconcileChatProjection({ guard: () => true });
      say({ t: 'reconciled', pid: process.pid, result: JSON.parse(JSON.stringify(r)) });
    }
  } catch (error) { say({ t: 'error', pid: process.pid, cmd: m.cmd, error: String(error?.message || error), code: error?.code ?? null }); }
});
say({ t: 'ready', pid: process.pid });
