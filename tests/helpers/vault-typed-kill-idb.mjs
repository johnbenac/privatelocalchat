// T894: ACTUAL browser proof that the typed engine survives a writer that is killed by the operating system. Run:
//   node tests/helpers/vault-typed-kill-idb.mjs --media /media/Vivarium/<dedicated folder> --repeat 20 [--contenders 3] [--out evidence.json]
//   (on a machine without /media/Vivarium, a folder named /var/lib/cosmoshot/scratch-plc-* is accepted instead)
//
// Real Chromium, a dedicated persistent profile, real IndexedDB through the app's real chat/vault/vault-db.mjs, the app's real chat/vault/vault.mjs (both served unmodified from this checkout by
// an owned ephemeral-port server), and real Web Locks. Synthetic data only. For each repeat and each kill point:
//   1. a WRITER tab takes the vault's writer Web Lock (held for the life of its process), unlocks a fresh vault and starts the engine's own commit (P1, P2, P3) with the real IndexedDB adapter;
//   2. the only wrapper is around the adapter's replaceLog: once the real projection call number K has COMPLETED in IndexedDB (K=1: the P1 pending marker is durable; K=2: the P2 header+log
//      transaction is durable, before the engine reads it back), the tab tells this script and then never answers. So it is "between the P2 commit and its readback" in the engine's own order;
//   3. this script sees that an OBSERVER tab cannot take the lock (it is really held), finds the writer tab's RENDERER PROCESS (the one new renderer of the browser's process tree after the writer
//      tab opened) and sends it SIGKILL from the operating system, then checks that process is gone, that the writer tab crashed and that the observer tab is still alive;
//   4. the observer takes the Web Lock within seconds (the browser released a dead tab's lock: observed, not slept), reads the stored state in a FRESH unlock and checks it is exactly what the kill
//      point leaves; other CONTENDER tabs that read the base before the kill try to commit now and must be refused (stale or pending), writing nothing;
//   5. a fresh session's reconcileChatProjection abandons the P1-only marker (nothing committed) or settles the verified P2 (committed, P3 written), leaving no pending marker, no damaged
//      record and contiguous unique seqs; and the next commit from a fresh base succeeds (liveness).
// Control: with the SAME wrapper and no kill, the commit completes and the state differs from the kill states (the kill mattered).
// NOT proven here: Safari and Firefox (other lock and IndexedDB implementations), an operating system other than the one running this, power loss and a disk that lies about durability, a killed
// BROWSER process (only the tab's renderer is killed), several writers dying at once.
// --sabotage no-settle-p2 | no-abandon-p1 serves a deliberately weakened engine: the matching kill point MUST then fail (negative controls: exit status 0 only if it did).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { chromium } = createRequire(import.meta.url)('playwright');
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : fallback; };
const EXECUTABLE = arg('--executable', process.env.PLC_CHROMIUM || '');   // a Chromium binary to use instead of the one this Playwright version downloads (a machine with another revision)
const MEDIA = arg('--media'), REPEAT = Number(arg('--repeat', '20')), CONTENDERS = Number(arg('--contenders', '3')), OUT = arg('--out', ''), SABOTAGE = arg('--sabotage', '');
if (!MEDIA || !(MEDIA.startsWith('/media/Vivarium/') || MEDIA.startsWith('/var/lib/cosmoshot/scratch-plc-'))) { console.error('--media must name a dedicated folder under /media/Vivarium/ (or /var/lib/cosmoshot/scratch-plc-*)'); process.exit(2); }
fs.mkdirSync(MEDIA, { recursive: true });
const profile = fs.mkdtempSync(path.join(MEDIA, 'kill-profile-'));
const SABOTAGES = {
  'no-settle-p2': ['if (c && c.id === P && c.baseRevision === X && index.revision === c.revision && projectionConsistent(snap.state, index)) {', 'if (false) {'],
  'no-abandon-p1': ['if (!(c && c.id === P) && index.revision === X && projectionConsistent(snap.state, index)) {', 'if (false) {']
};
const source = (name) => {
  let text = fs.readFileSync(path.join(ROOT, 'chat', 'vault', name), 'utf8');
  if (SABOTAGE && name === 'vault.mjs') { const [from, to] = SABOTAGES[SABOTAGE] || []; assert.ok(from && text.includes(from), 'sabotage target not found: ' + SABOTAGE); text = text.replace(from, to); }
  return text;
};
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/') { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><title>typed kill</title>'); return; }
  if (!url.pathname.startsWith('/chat/vault/') || !url.pathname.endsWith('.mjs') || url.pathname.includes('..')) { res.statusCode = 404; res.end(); return; }
  try { res.setHeader('content-type', 'text/javascript'); res.end(source(url.pathname.slice('/chat/vault/'.length))); } catch { res.statusCode = 404; res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = 'http://127.0.0.1:' + server.address().port;
const context = await chromium.launchPersistentContext(profile, { headless: true, ...(EXECUTABLE ? { executablePath: EXECUTABLE } : {}) });

// ---- the browser's process tree ---------------------------------------------------------------------------------------------------------------------------------------------------------
const ps = () => execFileSync('ps', ['-eo', 'pid=,ppid=,args='], { encoding: 'utf8', maxBuffer: 1 << 26 }).split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const m = l.match(/^(\d+)\s+(\d+)\s+(.*)$/); return m ? { pid: +m[1], ppid: +m[2], args: m[3] } : null; }).filter(Boolean);
const browserPid = () => { const p = ps().find((x) => x.args.includes('--user-data-dir=' + profile) && !x.args.includes('--type=')); assert.ok(p, 'the browser process was not found'); return p.pid; };
const renderers = () => { const table = ps(), root = browserPid(), seen = new Set([root]); let grew = true; while (grew) { grew = false; for (const p of table) if (!seen.has(p.pid) && seen.has(p.ppid)) { seen.add(p.pid); grew = true; } } return new Set(table.filter((p) => seen.has(p.pid) && p.args.includes('--type=renderer')).map((p) => p.pid)); };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const until = async (fn, ms, what) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error('timed out waiting for ' + what); await new Promise((r) => setTimeout(r, 50)); } };

// ---- page-side code ----------------------------------------------------------------------------------------------------------------------------------------------------------------------
const PRELUDE = `
const { createIndexedDbAdapter } = await import('/chat/vault/vault-db.mjs');
const { createVault } = await import('/chat/vault/vault.mjs');
const V = (E) => ({ format: 1, encounter: { id: E, thread: 't1' }, participants: { p1: { id: 'p1', encounter: E, label: 'secret ' + E } }, events: { ev1: { id: 'ev1', encounter: E, text: 'secret words' } }, holders: { [E + '\\u0000h1']: 'p1' } });
const plan = (base, E, rev) => ({ base, operationId: 'op-' + E, threads: { put: [], create: [], remove: [], order: undefined }, encounters: { put: [{ id: E, owner: { type: 'thread', id: 't1' }, value: V(E) }], remove: [] }, standalone: { create: [], destroy: [] }, logical: { v: 1, rev, epoch: 1 } });
const G = () => true;
const stateOf = async (name) => {
  const adapter = createIndexedDbAdapter({ name }); const s = await createVault({ adapter }).unlock('pw');
  const index = JSON.parse(s.state.kv.get('meta/encounters.index.v1') || 'null'), log = await adapter.readLog(), header = await adapter.readHeader(); const seqs = log.map((r) => r.seq);
  return { header: header.format, pending: index ? index.pending : null, committed: index ? index.committed : null, entities: [...s.state.encounters.keys()].sort(), damaged: s.damaged.length, seqsUnique: new Set(seqs).size === seqs.length, seqsContiguous: seqs.every((q, i) => q === seqs[0] + i), records: log.length };
};
`;
const inPage = (page, body) => page.evaluate(`(async () => { ${PRELUDE}\n${body}\n})()`);
const newPage = async (expose) => { const page = await context.newPage(); if (expose) for (const [k, f] of Object.entries(expose)) await page.exposeFunction(k, f); await page.goto(origin + '/'); return page; };

let runNo = 0;
async function once(point, { kill }) {
  const name = 'plc-tk-' + process.pid + '-' + (++runNo), lock = 'plc-vault-writer-' + name;
  const out = { point, kill, repeat: runNo };
  const observer = await newPage();
  // contenders read the same base the writer will start from, then wait: they race it after it died
  const makeVault = await inPage(observer, `
    const a = createIndexedDbAdapter({ name: ${JSON.stringify(name)} }); const s = await createVault({ adapter: a }).create('pw', { iterations: 1000 });
    await s.putThread('t1', { id: 't1', title: 'one', messages: [{ role: 'user', content: 'synthetic transcript' }] }); await s.setKv('l/chatThreads.order', '["t1"]'); s.lock(); return true;`);
  assert.equal(makeVault, true);
  const contenders = [];
  for (let i = 0; i < CONTENDERS; i++) { const c = await newPage(); await inPage(c, `window.__s = await createVault({ adapter: createIndexedDbAdapter({ name: ${JSON.stringify(name)} }) }).unlock('pw'); window.__r = await window.__s.readChatProjection({ guard: G }); return true;`); contenders.push(c); }
  let reachedResolve; const reached = new Promise((r) => { reachedResolve = r; });
  const before = renderers();
  const writer = await newPage({ __reached: (p) => { reachedResolve(p); } });
  const K = point === 'after-P1' ? 1 : 2;
  const crashed = new Promise((r) => writer.once('crash', () => r(true)));
  await inPage(writer, `
    const real = createIndexedDbAdapter({ name: ${JSON.stringify(name)} }); let n = 0;
    const wrapped = { ...real, async replaceLog(a) { if (!a.expected) return real.replaceLog(a); n += 1; const done = await real.replaceLog(a); if (n === ${K}) { await window.__reached('P' + n); ${kill ? 'await new Promise(() => {});' : ''} } return done; } };
    const session = await createVault({ adapter: wrapped }).unlock('pw');
    const r = await session.readChatProjection({ guard: G });
    await new Promise((res) => navigator.locks.request(${JSON.stringify(lock)}, () => { res(); return new Promise(() => {}); }));   // the writer lease: held until this process dies
    window.__commit = session.commitChatProjection(plan(r.base, 'E1', 1), { guard: G });   // NOT awaited
    return true;`);
  const where = await Promise.race([reached, new Promise((_, rej) => setTimeout(() => rej(new Error('the writer never reached the kill point')), 30000))]);
  out.reached = where;
  const heldBefore = await inPage(observer, `return await navigator.locks.request(${JSON.stringify(lock)}, { ifAvailable: true }, (l) => !!l);`);
  out.lockHeldBeforeKill = heldBefore === false;
  assert.equal(heldBefore, false, 'the writer lock must be held while the writer is alive');
  if (kill) {
    const after = renderers(), fresh = [...after].filter((p) => !before.has(p));
    assert.equal(fresh.length, 1, 'expected exactly one new renderer process for the writer tab, found ' + fresh.length + ' (' + fresh.join(',') + ')');
    const pid = fresh[0]; out.killedPid = pid;
    process.kill(pid, 'SIGKILL');
    await until(() => !alive(pid), 10000, 'the killed renderer to disappear');
    // the writer tab must be DEAD: Playwright's `crash` event, or the tab no longer answers a trivial evaluate (the event is not delivered by every Chromium build)
    const dead = await until(async () => { if (await Promise.race([crashed, Promise.resolve(false)])) return 'crash-event'; try { const r = await Promise.race([writer.evaluate(() => 1), new Promise((res) => setTimeout(() => res('no-answer'), 1500))]); return r === 'no-answer' ? 'no-answer' : false; } catch { return 'evaluate-failed'; } }, 15000, 'the writer tab to be dead');
    out.writerDeath = dead;
    assert.equal(await observer.evaluate(() => 1 + 1), 2, 'the observer tab must be alive: only the writer tab was killed');
    out.takenAfterKill = await until(async () => (await inPage(observer, `return await navigator.locks.request(${JSON.stringify(lock)}, { ifAvailable: true }, (l) => !!l);`)) === true, 15000, 'the dead tab\'s Web Lock to be released');
  } else {
    await until(async () => { const s = await inPage(observer, `return await stateOf(${JSON.stringify(name)});`); return s.pending === null && s.entities.includes('E1'); }, 15000, 'the un-killed commit to finish');
  }
  // what the point leaves, read in a FRESH unlock
  out.stored = await inPage(observer, `return await stateOf(${JSON.stringify(name)});`);
  const s = out.stored;
  assert.equal(s.damaged, 0, 'damaged records'); assert.equal(s.seqsUnique, true); assert.equal(s.seqsContiguous, true);
  if (kill && point === 'after-P1') { assert.ok(s.pending, 'P1: the pending marker is durable'); assert.equal(s.committed, null); assert.deepEqual(s.entities, []); assert.equal(s.header, 'plc-vault/1'); }
  if (kill && point === 'after-P2') { assert.ok(s.pending, 'P2: P3 never ran, so the marker is still there'); assert.ok(s.committed && s.committed.id === s.pending.id, 'P2: the committed receipt matches the pending marker'); assert.deepEqual(s.entities, ['E1']); assert.equal(s.header, 'plc-vault/2'); }
  if (!kill) { assert.equal(s.pending, null); assert.deepEqual(s.entities, ['E1']); }
  if (kill) {
    // contenders that read the base before the writer started: refused, nothing written
    const logBefore = s.records;
    for (const c of contenders) {
      const r = await inPage(c, `const r = await window.__s.commitChatProjection(plan(window.__r.base, 'EC', 1), { guard: G }); return { status: r.status, reason: r.reason || null };`);
      assert.equal(r.status, 'not-written', 'a contender must be refused while a dead writer\'s marker stands: ' + JSON.stringify(r)); assert.ok(['stale-base', 'pending'].includes(r.reason), 'unexpected refusal reason ' + r.reason);
    }
    assert.equal((await inPage(observer, `return await stateOf(${JSON.stringify(name)});`)).records, logBefore, 'the refusals wrote nothing');
    // a fresh session reconciles
    const rec = await inPage(observer, `
      const adapter = createIndexedDbAdapter({ name: ${JSON.stringify(name)} }); const s = await createVault({ adapter }).unlock('pw');
      const r = await s.reconcileChatProjection({ guard: G }); return { status: r.status, reason: r.reason || null };`);
    out.reconcile = rec;
    assert.equal(rec.status, point === 'after-P1' ? 'abandoned' : 'committed', 'reconcile after ' + point + ': ' + JSON.stringify(rec));
    const settled = await inPage(observer, `return await stateOf(${JSON.stringify(name)});`);
    assert.equal(settled.pending, null, 'no pending marker after reconcile'); assert.equal(settled.damaged, 0); assert.equal(settled.seqsUnique, true); assert.equal(settled.seqsContiguous, true);
    assert.deepEqual(settled.entities, point === 'after-P1' ? [] : ['E1']);
    assert.equal(settled.header, point === 'after-P1' ? 'plc-vault/1' : 'plc-vault/2');
    out.settled = settled;
    // liveness: the next commit from a fresh base wins
    const next = await inPage(observer, `
      const s = await createVault({ adapter: createIndexedDbAdapter({ name: ${JSON.stringify(name)} }) }).unlock('pw'); const r = await s.readChatProjection({ guard: G });
      const c = await s.commitChatProjection(plan(r.base, 'E2', 2), { guard: G }); return { status: c.status, reason: c.reason || null };`);
    assert.equal(next.status, 'committed', 'liveness: ' + JSON.stringify(next));
    assert.deepEqual((await inPage(observer, `return await stateOf(${JSON.stringify(name)});`)).entities.sort(), point === 'after-P1' ? ['E2'] : ['E1', 'E2']);
  }
  for (const p of [observer, writer, ...contenders]) { try { await p.close(); } catch { /* crashed */ } }
  return out;
}

// ---- run --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const results = []; const t0 = Date.now();
const check = async (name, fn) => { try { const detail = await fn(); results.push({ name, pass: true, detail }); console.log('PASS', name); } catch (error) { results.push({ name, pass: false, error: String(error.message).split('\n').slice(0, 4).join(' | ') }); console.log('FAIL', name, '::', String(error.message).split('\n')[0]); } };
await check('control: no kill, the same wrapper: the commit completes and leaves no pending marker', () => once('after-P2', { kill: false }));
for (let i = 1; i <= REPEAT; i++) {
  await check(`kill ${i}/${REPEAT} at P1 durable: pending marker only, contenders refused, reconcile abandons it, next commit wins`, () => once('after-P1', { kill: true }));
  await check(`kill ${i}/${REPEAT} at P2 durable (before the readback): reconcile settles the verified P2, contenders refused, next commit wins`, () => once('after-P2', { kill: true }));
}
await context.close(); server.close();
try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* best effort */ }
const failed = results.filter((r) => !r.pass), killRuns = results.filter((r) => r.detail && r.detail.kill);
const summary = { browser: 'chromium (playwright) ' + context.browser?.()?.version?.() , executable: EXECUTABLE || 'default', node: process.version, platform: process.platform, sabotage: SABOTAGE || null, checks: results.length, passed: results.length - failed.length, failed: failed.length, kills: killRuns.length, seconds: Math.round((Date.now() - t0) / 1000), failures: failed.slice(0, 6) };
console.log(JSON.stringify(summary));
if (OUT) fs.writeFileSync(OUT, JSON.stringify({ summary, results }, null, 1));
if (SABOTAGE) { const expected = SABOTAGE === 'no-settle-p2' ? 'at P2 durable' : 'at P1 durable'; const caught = failed.some((f) => f.name.includes(expected)); console.log(caught ? 'NEGATIVE CONTROL CAUGHT: ' + SABOTAGE : 'NEGATIVE CONTROL NOT CAUGHT: ' + SABOTAGE); process.exit(caught ? 0 : 1); }
process.exit(failed.length ? 1 : 0);
