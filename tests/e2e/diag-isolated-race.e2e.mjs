// T418 F DIAGNOSTIC (not part of npm test, not a qualification): the six real writer paths of encounters-concurrency.e2e.mjs + one reading tab, run
//   DIAG_SETUP=live   the ORIGINAL setup: the fixture is written by a live app tab (raw localStorage seed while seven app documents, i.e. writers, exist), then every tab reloads
//   DIAG_SETUP=inert  every app document of all six writers and the reader is first navigated to an inert SAME-origin page (fulfilled by the test, no app script, so no writer exists), the fixture
//                     is seeded there, every inert page is checked to SEE it, and only then does each tab really goto the app and pass the boot barrier (no SPA fallback: the route never reaches the server)
//   DIAG_VARIANT=i    the app exactly as built from this checkout (durable coordination record, chat/encounters/coordination.mjs, in real IndexedDB)
//   DIAG_VARIANT=u    the unprotected CONTROL: the same build except that ONE module, chat/encounters/ledger-store.mjs, is served with its `unsafeNoCoordination` default switched on (test-only route; the served
//                     body hash is logged). Before the T418 store-safety pass this setup lost acknowledged messages (F, inert/D: 9 of 20 repeats).
// Actors, invariants and the whole-list negative control are the ones of encounters-concurrency.e2e.mjs (checks copied, not weakened). The only difference: a failed check is RECORDED for its repeat
// (first failing check) and the run goes on, so all 20 repeats are compared instead of stopping at the first. Section 3 (the lock path) is not repeated here.
// Instrumentation (init script in every page, no IPC, nothing awaited inside the critical section): navigator.locks.request is wrapped so the grant and release of every lock are stamped with
// performance.timeOrigin+performance.now() and Date.now(); inside a hold of `plc-encounters` the raw chatThreads/ledger values at grant and at release, and every read, successful write
// (setItem), successful removal (removeItem) AND attempted-but-failed write of those two keys, are kept (references only; hashing and parsing happen in node afterwards). Reads are classified by call
// site: a read made by chat/encounters/coordination.mjs is a DIGEST PEEK, every other read is a DECISION READ (the one the transaction acts on); only decision reads decide `staleFirstRead`.
// Clocks: every stamp has an epoch-comparable performance clock and Date.now; each page's measured resolution (smallest nonzero step of each clock) is recorded and a near tie (gap smaller than the
// coarser resolution, or the two clocks disagreeing by more than their resolution) is counted as ORDER-AMBIGUOUS, not as ordered. The wrapper adds a few microtasks around the callback and two
// synchronous localStorage reads at grant and release: it can only shift timing.
// env: DIAG_OUT (folder for traces and summary), DIAG_REPEATS (20), E2E_PORT_OFFSET, PLC_E2E_PROFILE_ROOT.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { launch } from './harness.mjs';
import { newProfileDir } from './profile-root.mjs';
import { legacyEventId } from '../../chat/encounters/records.mjs';
const SETUP = process.env.DIAG_SETUP || 'live', VARIANT = process.env.DIAG_VARIANT || 'e';
if (!['live', 'inert'].includes(SETUP) || !['i', 'u'].includes(VARIANT)) throw new Error('DIAG_SETUP live|inert, DIAG_VARIANT i|u');
const REPEATS = Number(process.env.DIAG_REPEATS || 20), OUT = process.env.DIAG_OUT; if (!OUT) throw new Error('DIAG_OUT is required');
mkdirSync(OUT, { recursive: true });
const sha = (b) => createHash('sha256').update(b).digest('hex');
class Check extends Error {}
const chk = (cond, msg) => { if (!cond) throw new Check(msg); };
const LEDGER = 'plc.encounters.v1', LOCK = 'plc-encounters';

const h = await launch({ port: 18527, profileDir: newProfileDir('diag-' + SETUP + '-' + VARIANT) });
const { context, origin } = h;

// ---- served-module log (and the test-only variant) ----------------------------------------------------------------------------------------
const served = { url: null, requests: 0, bodies: {} };
await context.route('**/chat/encounters/ledger-store.mjs', async (route) => {
  served.requests++; served.url = route.request().url();
  let body, from;
  const r = await route.fetch(); body = await r.body(); from = 'build output as served';
  if (VARIANT === 'u') { const t = body.toString('utf8'); const t2 = t.replace('unsafeNoCoordination = false', 'unsafeNoCoordination = true'); if (t === t2) throw new Error('control: the unsafeNoCoordination default was not found in the served module'); body = Buffer.from(t2); from = 'build output with unsafeNoCoordination = true (control)'; }
  const s = sha(body); served.bodies[s] = { bytes: body.length, from, n: (served.bodies[s]?.n || 0) + 1 };
  await route.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'cache-control': 'no-store', 'cross-origin-resource-policy': 'same-origin' }, body });
});
const INERT = '/__t418_inert__.html';
await context.route(origin + INERT, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>inert</title><p>inert same-origin page: no app script, no writer</p>' }));

// ---- lock/storage trace (init script, every page and document) -------------------------------------------------------------------------------
await context.addInitScript(({ LOCK, WATCH }) => {
  if (window.__lockTraceInstalled) return; window.__lockTraceInstalled = true; window.__lockTrace = [];
  const stamp = () => ({ p: performance.timeOrigin + performance.now(), d: Date.now() });
  const gi = Storage.prototype.getItem, si = Storage.prototype.setItem, ri = Storage.prototype.removeItem; let cur = null;
  const res = (f) => { let min = Infinity, last = f(); for (let i = 0; i < 20000; i++) { const v = f(); if (v > last && v - last < min) min = v - last; if (v > last) last = v; } return min === Infinity ? null : min; };
  window.__clockRes = { perfMs: res(() => performance.now()), dateMs: res(() => Date.now()) };
  const snap = () => { const o = {}; for (const k of WATCH) { try { o[k] = gi.call(localStorage, k); } catch { o[k] = '<unreadable>'; } } return o; };
  Storage.prototype.getItem = function (k) { const v = gi.call(this, k); if (cur && this === localStorage && WATCH.includes(k)) cur.reads.push({ k, at: stamp(), v, kind: /coordination\.mjs/.test(new Error().stack || '') ? 'peek' : 'decision' }); return v; };
  Storage.prototype.setItem = function (k, v) { const rec = cur && this === localStorage && WATCH.includes(k) ? { k, op: 'set', at: stamp(), v: String(v), ok: null } : null; if (rec) cur.writes.push(rec); try { const r = si.call(this, k, v); if (rec) rec.ok = true; return r; } catch (e) { if (rec) { rec.ok = false; rec.err = String(e && e.name); } throw e; } };
  Storage.prototype.removeItem = function (k) { const rec = cur && this === localStorage && WATCH.includes(k) ? { k, op: 'remove', at: stamp(), v: null, ok: null } : null; if (rec) cur.writes.push(rec); try { const r = ri.call(this, k); if (rec) rec.ok = true; return r; } catch (e) { if (rec) { rec.ok = false; rec.err = String(e && e.name); } throw e; } };
  const locks = navigator.locks; if (!locks || !locks.request) return; const orig = locks.request.bind(locks);
  locks.request = function (name, a, b) {
    const withOpts = typeof a !== 'function', opts = withOpts ? a : undefined, cb = withOpts ? b : a; const nm = String(name);
    if (typeof cb !== 'function') return orig.apply(null, arguments);
    const rec = { name: nm, mode: (opts && opts.mode) || 'exclusive', reqAt: stamp(), reads: [], writes: [] }; window.__lockTrace.push(rec);
    const mine = nm === LOCK;
    const wrapped = async (lock) => { rec.grantAt = stamp(); if (mine) { rec.grantSnap = snap(); cur = rec; } try { return await cb(lock); } finally { rec.doneAt = stamp(); if (mine) { rec.releaseSnap = snap(); cur = null; } } };
    return withOpts ? orig(name, opts, wrapped) : orig(name, wrapped);
  };
}, { LOCK, WATCH: ['chatThreads', LEDGER] });
const collect = async (pages, labels) => Promise.all(pages.map(async (p, i) => ({ tab: labels[i], clock: await p.evaluate(() => ({ perf: performance.timeOrigin + performance.now(), date: Date.now(), timeOrigin: performance.timeOrigin, res: window.__clockRes })).then((c) => ({ ...c, node: Date.now() })), trace: await p.evaluate(() => { const t = window.__lockTrace; window.__lockTrace = []; return t; }) })));
const resetTraces = (pages) => Promise.all(pages.map((p) => p.evaluate(() => { window.__lockTrace = []; })));

// ---- analysis of one repeat's traces: ordering (with measured clock resolution), and what each hold DECIDED on versus what the earlier holds had stored -------------
const dig = (s) => (s == null ? 'null' : s.length + ':' + sha(s).slice(0, 12));
let TOL = 0.2;                                           // ms: the coarser measured clock resolution (set from the pages before the first analysis)
function analyse(collected) {
  const holds = [];
  for (const { tab, trace } of collected) for (const r of trace) if (r.name === LOCK && r.grantAt) holds.push({ tab, ...r });
  holds.sort((a, b) => a.grantAt.p - b.grantAt.p);
  const stored = {}; const rows = []; let prev = null;
  for (const hd of holds) {
    const gapP = prev?.doneAt ? hd.grantAt.p - prev.doneAt.p : null, gapD = prev?.doneAt ? hd.grantAt.d - prev.doneAt.d : null;
    const row = { tab: hd.tab, grant: hd.grantAt.p, release: hd.doneAt?.p ?? null, heldMs: hd.doneAt ? +(hd.doneAt.p - hd.grantAt.p).toFixed(3) : null, gapFromPrevReleaseMs: gapP == null ? null : +gapP.toFixed(3), gapDateNowMs: gapD, keys: {} };
    // exclusive holds cannot overlap: a negative gap, a gap below the measured resolution (near tie), or the two clocks disagreeing by more than their resolution cannot be called ordered
    row.orderAmbiguous = gapP != null && (gapP < 0 || gapP < TOL || Math.abs(gapP - gapD) > Math.max(TOL, 1.5));
    row.negativeGap = gapP != null && gapP < 0;
    for (const k of ['chatThreads', LEDGER]) {
      const want = stored[k]; const g = hd.grantSnap?.[k] ?? null;
      const decisions = hd.reads.filter((x) => x.k === k && x.kind === 'decision'), peeks = hd.reads.filter((x) => x.k === k && x.kind === 'peek'), first = decisions[0];
      const w = hd.writes.filter((x) => x.k === k);
      row.keys[k] = { expected: want === undefined ? 'unknown' : dig(want), atGrant: dig(g), firstDecisionRead: first ? dig(first.v) : 'none', firstDecisionAfterGrantMs: first ? +(first.at.p - hd.grantAt.p).toFixed(3) : null, decisionReads: decisions.length, digestPeeks: peeks.length,
        staleAtGrant: want !== undefined && g !== want, staleFirstDecisionRead: want !== undefined && first ? first.v !== want : false,
        peekStaleFirst: want !== undefined && peeks[0] ? peeks[0].v !== want : false, writesOk: w.filter((x) => x.op === 'set' && x.ok === true).length, writesFailedAttempts: w.filter((x) => x.ok === false).length, writesUnfinished: w.filter((x) => x.ok === null).length, removalsOk: w.filter((x) => x.op === 'remove' && x.ok === true).length };
    }
    for (const w of hd.writes) if (w.ok === true) stored[w.k] = w.op === 'remove' ? null : w.v;   // only SUCCESSFUL writes and removals change the expected value
    rows.push(row); prev = hd;
  }
  return { holds: rows, raw: holds.map((hd) => ({ tab: hd.tab, grantSnap: hd.grantSnap, releaseSnap: hd.releaseSnap, reads: hd.reads.map((x) => ({ k: x.k, p: x.at.p, kind: x.kind, v: x.v })), writes: hd.writes.map((x) => ({ k: x.k, op: x.op, ok: x.ok, err: x.err, p: x.at.p, v: x.v })) })) };
}
const agg = { repeats: 0, holds: 0, staleAtGrant: 0, staleFirstDecisionRead: 0, peekStaleFirst: 0, orderAmbiguous: 0, nearTie: 0, negativeGap: 0, minGapMs: null, failedWrites: 0, failedRepeatsWithStaleDecisionRead: 0, failedRepeats: 0, clockResolution: null, toleranceMs: null };
function account(section, r, analysis, failed) {
  agg.repeats++; let sf = 0;
  for (const row of analysis.holds) { agg.holds++; if (row.orderAmbiguous) agg.orderAmbiguous++; if (row.negativeGap) agg.negativeGap++; if (row.gapFromPrevReleaseMs != null && row.gapFromPrevReleaseMs >= 0 && row.gapFromPrevReleaseMs < TOL) agg.nearTie++;
    if (row.gapFromPrevReleaseMs != null && (agg.minGapMs == null || row.gapFromPrevReleaseMs < agg.minGapMs)) agg.minGapMs = row.gapFromPrevReleaseMs;
    for (const k of Object.values(row.keys)) { agg.failedWrites += k.writesFailedAttempts; if (k.staleAtGrant) agg.staleAtGrant++; if (k.peekStaleFirst) agg.peekStaleFirst++; if (k.staleFirstDecisionRead) { agg.staleFirstDecisionRead++; sf++; } } }
  if (failed) { agg.failedRepeats++; if (sf) agg.failedRepeatsWithStaleDecisionRead++; }
  writeFileSync(`${OUT}/trace-${section}-${String(r).padStart(2, '0')}.json`, JSON.stringify({ setup: SETUP, variant: VARIANT, section, repeat: r, failed: failed || null, toleranceMs: TOL, ...analysis }));
}
const measureClocks = async (pages) => { const res = await Promise.all(pages.map((p) => p.evaluate(() => window.__clockRes))); const worst = Math.max(...res.map((x) => Math.max(x?.perfMs ?? 0, x?.dateMs ?? 0, 0))); agg.clockResolution = res; TOL = Math.max(0.1, worst >= 1 ? 1 : worst * 2); agg.toleranceMs = TOL; };

// ---- the original test's helpers (unchanged except where marked) ------------------------------------------------------------------------------
const ready = async (page) => { await page.waitForSelector('#messageInput'); await page.waitForFunction(() => window.__plcBooted === true && Boolean(window.plcShell), null, { timeout: 20000 }); await page.waitForFunction(() => !document.querySelector('#messageInput').disabled); };
const within = (promise, ms, what) => Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Check('no deadlock: ' + what + ' did not finish in ' + ms + ' ms')), ms))]);
const newTab = async () => { const p = await context.newPage(); p.on('pageerror', (e) => h.errors.push(e.message));
  await p.addInitScript(({ endpoint }) => { if (!sessionStorage.getItem('chatConfig')) sessionStorage.setItem('chatConfig', JSON.stringify({ endpoint, token: '', model: 'fake-model', theme: 'light' })); if (!sessionStorage.getItem('chatModels')) sessionStorage.setItem('chatModels', JSON.stringify(['fake-model'])); }, { endpoint: `http://127.0.0.1:${h.api.port}/v1` });
  await p.goto(origin + '/'); await ready(p); return p; };
const stored = (page) => page.evaluate((L) => ({ chat: JSON.parse(localStorage.getItem('chatThreads') || 'null'), ledger: JSON.parse(localStorage.getItem(L) || 'null') }), LEDGER);
const until = async (fn, what, ms = 20000) => { const end = Date.now() + ms; let last; while (Date.now() < end) { last = await fn(); if (last) return last; await new Promise((r) => setTimeout(r, 60)); } throw new Check('timed out waiting for ' + what); };
const msg = (id, role, content, extra = {}) => ({ id, role, content, at: 1, ...extra });
const seedThreads = () => [{ id: 'ct', title: 'Concurrent chat', systemPrompt: '', createdAt: 10, updatedAt: 10, messages: [msg('u1', 'user', 'seed question'), msg('a1', 'assistant', 'seed answer', { model: 'M' })] }, { id: 'ct2', title: 'Second chat', systemPrompt: '', createdAt: 9, updatedAt: 9, messages: [msg('n1', 'user', 'second chat question')] }];
const importFile = (r) => JSON.stringify({ format: 'plc-history/1', threads: [{ id: 'imp-' + r, title: 'Imported ' + r, created: 1, updated: 1, messages: [{ role: 'user', content: 'imported words ' + r }] }] });
const seedIn = (page) => page.evaluate(([L, list]) => { localStorage.setItem('chatThreads', JSON.stringify(list)); localStorage.removeItem(L); localStorage.removeItem('plc.activeThread.v1'); }, [LEDGER, seedThreads()]);
const want = JSON.stringify(seedThreads());
const sees = (p) => p.waitForFunction(([L, w]) => localStorage.getItem('chatThreads') === w && localStorage.getItem(L) === null, [LEDGER, want], { timeout: 10000 });
const reseedLive = async (pages) => {           // ORIGINAL setup (as committed in encounters-concurrency.e2e.mjs): live app tabs exist while the raw seed is written
  await seedIn(pages[0]);
  await within(Promise.all(pages.map(sees)), 15000, 'every tab to see the fixture');
  await within(Promise.all(pages.map(async (p) => { await p.reload(); await ready(p); await sees(p); })), 30000, 'the tabs to reload');
};
const reseedInert = async (pages) => {          // ISOLATED setup: no app document (so no app writer) exists while the seed is written
  await within(Promise.all(pages.map((p) => p.goto(origin + INERT, { waitUntil: 'load' }))), 30000, 'every tab to unload its app document');
  for (const p of pages) chk(await p.evaluate(() => !window.plcApp && !window.__plcBooted && location.pathname === '/__t418_inert__.html' && document.scripts.length === 0), 'inert page really has no app');
  await seedIn(pages[0]);
  await within(Promise.all(pages.map(sees)), 15000, 'every inert page to see the fixture');
  await within(Promise.all(pages.map(async (p) => { await p.goto(origin + '/', { waitUntil: 'load' }); await ready(p); await sees(p); })), 30000, 'the tabs to boot the app');
};
const reseed = SETUP === 'inert' ? reseedInert : reseedLive;
const open = (page, id) => page.locator('#threadList li[data-id="' + id + '"] .thread-name').click();
const toasts = (page) => page.evaluate(() => document.body.innerText);
const arm = (page, name, arg) => page.evaluate(({ name, arg }) => {
  window.__out = null;
  const idle = () => new Promise((r) => { const t = setInterval(() => { if (/^(Response complete\.|Response stopped|The response was interrupted)/.test(document.querySelector('#generationStatus').textContent) && !document.querySelector('#stopGeneration').offsetParent) { clearInterval(t); r(); } }, 20); });
  const refusedInWords = () => new Promise((r) => { const t = setInterval(() => { if (/was not saved|not saved|cleared in another tab|did not overwrite|could not be saved/i.test(document.body.innerText)) { clearInterval(t); r(); } }, 20); });
  const fresh = (L, pid) => { try { const l = JSON.parse(localStorage.getItem(L) || 'null'); return l ? Boolean(l.participants[pid]) : null; } catch { return 'unparseable'; } };
  const acts = {
    async send() { const i = document.querySelector('#messageInput'); i.value = arg.text; i.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('#sendBtn').click(); await new Promise((r) => setTimeout(r, 60)); const how = await Promise.race([idle().then(() => 'answered'), refusedInWords().then(() => 'refused')]); return { ok: true, how, selected: window.plcApp.currentThreadId() }; },
    async edit() { document.querySelector('.message.user [data-action="edit-message"]').click(); const ta = document.querySelector('.edit-box textarea'); ta.value = arg.text; [...document.querySelectorAll('.edit-box button')].find((b) => /Save and resend/.test(b.textContent)).click(); await new Promise((r) => setTimeout(r, 60)); const how = await Promise.race([idle().then(() => 'answered'), refusedInWords().then(() => 'refused')]); return { ok: true, how, selected: window.plcApp.currentThreadId() }; },
    async receive() { const e = window.plcApp.encounters, tid = window.plcApp.currentThreadId();
      const reg = await e.registerParticipant({ thread: tid, id: arg.participant, name: 'Remote', kind: 'human' }); const afterReg = fresh(arg.L, arg.participant);
      const r = await e.receive({ thread: tid, speaker: arg.participant, expression: 'external', modality: 'text', text: arg.text, occurrence: { source: 'surface:race', id: arg.occurrence }, transcript: true });
      return { ok: reg.ok && r.ok, code: r.code || reg.code || null, messageId: r.messageId, selected: tid, registration: { ok: reg.ok, code: reg.code || null, existing: Boolean(reg.existing) }, receive: { ok: r.ok, code: r.code || null }, participantStoredAfterRegistration: afterReg, participantStoredAfterReceive: fresh(arg.L, arg.participant) }; },
    async importNow() { [...document.querySelectorAll('.app-dialog button')].find((b) => /^Import$/.test(b.textContent.trim())).click(); await new Promise((r) => setTimeout(r, 300)); return { ok: true }; },
    async trash() { document.querySelector('#threadList li[data-id="ct2"] .thread-menu-btn').click(); [...document.querySelectorAll('.thread-menu button')].find((b) => b.querySelector('.btn-label')?.textContent === 'Delete').click(); await new Promise((r) => setTimeout(r, 200)); return { ok: true }; },
    async clear() { document.getElementById('clearHistoryBtn').click(); const end = Date.now() + 5000; let b; while (!(b = [...document.querySelectorAll('.app-dialog button')].find((x) => /Delete everything/.test(x.textContent))) && Date.now() < end) await new Promise((r) => setTimeout(r, 20)); if (!b) return { ok: false, code: 'no-dialog' }; b.click(); await new Promise((r) => setTimeout(r, 400)); return { ok: true }; },
  };
  window.__armed = new Promise((res) => { const c = new BroadcastChannel('t418-go'); c.onmessage = async () => { try { window.__out = await acts[name](); } catch (e) { window.__out = { ok: false, code: 'exception', message: String(e && e.message || e) }; } res(); }; window.__listening = true; });
}, { name, arg });
const release = async (pages) => { for (const p of pages) await within(p.waitForFunction(() => window.__listening === true), 10000, 'an actor to start listening'); await pages[0].evaluate(() => { const c = new BroadcastChannel('t418-go'); c.postMessage(1); c.close(); }); };
const finish = async (pages) => { await within(Promise.all(pages.map((p) => p.evaluate(() => window.__armed))), 40000, 'the actors'); return Promise.all(pages.map((p) => p.evaluate(() => { window.__listening = false; return window.__out; }))); };
const reader = (page) => page.evaluate((L) => { window.__stop = false; return (async () => { const seen = new Map(), vanished = [], stats = { reads: 0, torn: 0 };
  while (!window.__stop) { for (const key of ['chatThreads', L]) { const raw = localStorage.getItem(key); if (raw == null) continue; stats.reads++; let v; try { v = JSON.parse(raw); } catch { stats.torn++; continue; }
    if (key === 'chatThreads' && Array.isArray(v)) { const now = new Set(v.flatMap((t) => t.messages.map((m) => t.id + '/' + m.id))); for (const id of seen.keys()) if (!now.has(id)) vanished.push(id); for (const id of now) seen.set(id, 1); } }
    await new Promise((r) => setTimeout(r, 0)); }
  return { ...stats, vanished }; })(); }, LEDGER);
const stopReader = async (page, promise) => { await page.evaluate(() => { window.__stop = true; }); return within(promise, 10000, 'the reading tab'); };
const unique = (ids) => new Set(ids).size === ids.length;

const summary = { setup: SETUP, variant: VARIANT, repeats: REPEATS, startedAt: new Date().toISOString(), headCommit: null, sections: {} };
const labels = ['A', 'B', 'C', 'D', 'E', 'F', 'W'];
try {
  const main = h.page; await ready(main);
  const writers = []; for (let i = 0; i < 6; i++) writers.push(await newTab());
  const [A, B, C, D, E, F] = writers, watcher = main, all = [...writers, watcher];
  for (const p of all) chk(await p.evaluate(() => Boolean(navigator.locks && navigator.locks.request)), 'every tab has Web Locks');
  summary.servedAfterBoot = { ...served };
  await measureClocks(all);

  // 0. negative control: the whole-list write must lose acknowledged messages (so the invariants can fail)
  let lossy = 0, controlErrors = [];
  for (let r = 0; r < REPEATS; r++) {
    try {
      await reseed(all);
      const olds = [A, B, C, D].map((p, i) => p.evaluate(async ({ i }) => { const mine = JSON.parse(localStorage.getItem('chatThreads')); await new Promise((r) => { const c = new BroadcastChannel('t418-go'); c.onmessage = () => r(); window.__listening = true; });
        await new Promise((r) => setTimeout(r, Math.random() * 5)); mine[0].messages.push({ id: 'old-' + i, role: 'user', content: 'old ' + i, at: 2 }); localStorage.setItem('chatThreads', JSON.stringify(mine)); }, { i }));
      await release([A, B, C, D]); await within(Promise.all(olds), 10000, 'the control tabs');
      const t = (await stored(main)).chat.find((x) => x.id === 'ct'); if (t.messages.filter((m) => m.id.startsWith('old-')).length < 4) lossy++;
    } catch (e) { controlErrors.push({ r, message: String(e.message) }); }
  }
  summary.sections.control = { lossyReleases: lossy, of: REPEATS, errors: controlErrors, controlProvesSomething: lossy > 0 };
  console.log('control: whole-list write lost an acknowledged message in ' + lossy + ' of ' + REPEATS);

  // 1. the six real paths at once + reader
  const results = { pass: 0, fail: 0, failures: [] }; let conflictsSeen = 0;
  for (let r = 0; r < REPEATS; r++) {
    let failed = null, collected = null, watching = null;
    try {
      await reseed(all);
      await Promise.all([A, B, C, D].map((p) => open(p, 'ct'))); await open(E, 'ct'); await open(F, 'ct2');
      await E.setInputFiles('#importInput', { name: 'history.json', mimeType: 'application/json', buffer: Buffer.from(importFile(r)) }); await E.locator('.app-dialog:has-text("Import")').waitFor();
      watching = reader(watcher);
      await Promise.all([arm(A, 'send', { text: 'from A ' + r }), arm(B, 'send', { text: 'from B ' + r }), arm(C, 'edit', { text: 'edited by C ' + r }), arm(D, 'receive', { participant: 'p:d-' + r, text: 'received ' + r, occurrence: 'rx-' + r, L: LEDGER }), arm(E, 'importNow', {}), arm(F, 'trash', {})]);
      await resetTraces(all);
      await release(writers);
      const out = await finish(writers); const seen = await stopReader(watcher, watching); watching = null;
      collected = await collect(all, labels);
      const s = await until(async () => { const v = await stored(main); const t = v.chat?.find((x) => x.id === 'ct'); return v.ledger && !v.ledger.intent && t && t.messages.filter((m) => m.role === 'assistant' && /^Reply to: (from A|from B|edited by C)/.test(m.content)).length >= 3 && v; }, 'the writers to be stored (repeat ' + r + ')');
      const t = s.chat.find((x) => x.id === 'ct'), ids = t.messages.map((m) => m.id), L = s.ledger, ofMsg = (id) => Object.values(L.events).filter((e) => e.message === id);
      chk(out.every((o) => o?.ok), 'repeat ' + r + ': every actor was acknowledged: ' + JSON.stringify(out));
      chk(out[3].registration.ok && out[3].receive.ok && out[3].participantStoredAfterRegistration === true && out[3].participantStoredAfterReceive === true, 'repeat ' + r + ': the facade actor\'s registration and receive are each acknowledged and the participant was stored fresh after each step: ' + JSON.stringify(out[3]));
      chk(out.every((o, i) => i === 3 || i > 3 || o.how === 'answered') && out.slice(0, 3).every((o) => o.selected === 'ct'), 'repeat ' + r + ': the senders and the editor were answered (none refused) on the chat they had open: ' + JSON.stringify(out));
      chk(unique(ids), 'repeat ' + r + ': message ids unique ' + ids.join());
      for (const [who, text] of [['A', 'from A ' + r], ['B', 'from B ' + r]]) {
        const m = t.messages.filter((x) => x.role === 'user' && x.content === text); chk(m.length === 1, 'repeat ' + r + ': ' + who + '\'s message is stored once, found ' + m.length);
        const ev = ofMsg(m[0].id); chk(ev.length === 1 && ev[0].state === 'final' && ev[0].content.text === text && ev[0].standing === 'recorded', 'repeat ' + r + ': ' + who + '\'s message has one final event: ' + JSON.stringify(ev.map((e) => [e.state, e.standing])));
        const reply = t.messages.find((x) => x.role === 'assistant' && x.content === 'Reply to: ' + text); chk(reply && ofMsg(reply.id).length === 1 && ofMsg(reply.id)[0].content.text === 'Reply to: ' + text && ofMsg(reply.id)[0].expression === 'model', 'repeat ' + r + ': ' + who + '\'s answer is stored and recorded in full');
      }
      const u1 = t.messages.find((x) => x.id === 'u1'); chk(u1.content === 'edited by C ' + r, 'repeat ' + r + ': the edit is stored');
      const legacy = L.events[legacyEventId('ct', 'u1')], fix = ofMsg('u1').find((e) => e.standing === 'correction');
      chk(legacy && legacy.content.text === 'seed question' && legacy.standing === 'legacy' && fix && fix.corrects === legacy.id && fix.content.text === 'edited by C ' + r, 'repeat ' + r + ': the edit kept the legacy original under its stable id and corrected it');
      chk(!ids.includes('a1'), 'repeat ' + r + ': the edited prompt dropped the old answer (an explicit edit)');
      chk(t.messages.some((x) => x.role === 'assistant' && x.content === 'Reply to: edited by C ' + r), 'repeat ' + r + ': the answer to the edit is stored');
      const rx = t.messages.filter((x) => x.id === out[3].messageId); chk(rx.length === 1 && ofMsg(rx[0].id).length === 1 && ofMsg(rx[0].id)[0].expression === 'external' && ofMsg(rx[0].id)[0].speaker === 'p:d-' + r, 'repeat ' + r + ': the received message is stored once and attributed');
      const imp = s.chat.find((x) => x.id === 'imp-' + r); chk(imp && imp.messages.length === 1, 'repeat ' + r + ': the import is stored'); chk(Object.values(L.events).every((e) => e.thread !== 'imp-' + r) && L.encounters['enc:imp-' + r]?.origin === 'imported', 'repeat ' + r + ': the imported chat stays legacy (no event of its own)');
      chk(s.chat.find((x) => x.id === 'ct2')?.deletedAt != null, 'repeat ' + r + ': the delete (to Trash) is stored');
      for (const e of Object.values(L.events)) if (e.inTranscript && e.message) chk(s.chat.some((c) => c.messages.some((m) => m.id === e.message)), 'repeat ' + r + ': event ' + e.id + ' says in transcript but its message is not stored');
      chk(seen.torn === 0, 'repeat ' + r + ': the reading tab never saw torn state: ' + JSON.stringify(seen));
      chk(seen.vanished.every((v) => v === 'ct/a1'), 'repeat ' + r + ': nothing vanished from the transcript except the answer an edit dropped: ' + seen.vanished.join());
      for (const p of writers) { const text = await toasts(p); if (/did not overwrite|not saved|was not cleared|could not be saved/i.test(text)) conflictsSeen++; }
      results.pass++;
    } catch (e) { failed = String(e.message).slice(0, 600); results.fail++; results.failures.push({ r, message: failed }); if (watching) await stopReader(watcher, watching).catch(() => {}); collected = collected || await collect(all, labels).catch(() => null); }
    if (collected) account('positive', r, analyse(collected), failed);
    console.log('positive repeat ' + r + (failed ? ' FAIL ' + failed.slice(0, 160) : ' ok'));
  }
  results.conflictsToldInPlainRace = conflictsSeen; summary.sections.positive = results;

  // 2. Delete all chat history against senders and a facade receive
  const clr = { pass: 0, fail: 0, failures: [], refusedTold: 0 };
  for (let r = 0; r < REPEATS; r++) {
    let failed = null, collected = null, watching = null;
    try {
      await reseed(all);
      await Promise.all([A, B, C, D].map((p) => open(p, 'ct')));
      watching = reader(watcher);
      await Promise.all([arm(A, 'send', { text: 'before clear A ' + r }), arm(B, 'send', { text: 'before clear B ' + r }), arm(C, 'clear', {}), arm(D, 'receive', { participant: 'p:c-' + r, text: 'late ' + r, occurrence: 'late-' + r, L: LEDGER })]);
      await resetTraces(all);
      await release([A, B, C, D]);
      const out = await finish([A, B, C, D]); const seen = await stopReader(watcher, watching); watching = null;
      await new Promise((res) => setTimeout(res, 600));
      collected = await collect(all, labels);
      const s = await stored(main);
      chk(seen.torn === 0, 'clear repeat ' + r + ': no torn read');
      chk(s.ledger && s.ledger.epoch >= 1, 'clear repeat ' + r + ': the Clear took effect (epoch moved): ' + JSON.stringify(s.ledger && { epoch: s.ledger.epoch }));
      chk(!s.chat || s.chat.length === 0, 'clear repeat ' + r + ': no chat exists after Clear (nothing resurrected): ' + JSON.stringify((s.chat || []).map((t) => t.id)));
      chk(Object.keys(s.ledger.events).length === 0 && Object.keys(s.ledger.encounters).filter((k) => !k.startsWith('enc:ext:')).length === 0, 'clear repeat ' + r + ': no record exists after Clear');
      chk(!s.ledger.intent, 'clear repeat ' + r + ': no intent left');
      for (const [p, o, name] of [[A, out[0], 'A'], [B, out[1], 'B'], [D, out[3], 'D']]) {
        const last = await p.evaluate(() => window.plcApp.encounters.lastResult());
        if (last && !last.ok) {
          chk(last.code === 'stale', 'clear repeat ' + r + ': ' + name + ' was refused with an explicit code: ' + last.code);
          if (name === 'D') {   // the FACADE actor: its contract is an explicit error object (code + message) returned to the caller, not a toast (classification of F's 20/20 "D says so in words" failure)
            chk(/cleared in another tab/.test(last.message || ''), 'clear repeat ' + r + ': D\'s facade refusal carries the words in its explicit error: ' + last.message);
            clr.facadeExplicit = (clr.facadeExplicit || 0) + 1; clr.facadeWordsOnPage = (clr.facadeWordsOnPage || 0) + (/cleared in another tab/.test(await toasts(p)) ? 1 : 0);
          } else { chk(/cleared in another tab/.test(await toasts(p)), 'clear repeat ' + r + ': ' + name + ' says so in words (actual UI toast contract)'); clr.refusedTold++; }
        }
        if (name === 'D' && o && !o.ok) chk(['stale', 'no-such-conversation'].includes(o.code), 'clear repeat ' + r + ': the late receive was refused explicitly: ' + o.code);
      }
      clr.pass++;
    } catch (e) { failed = String(e.message).slice(0, 600); clr.fail++; clr.failures.push({ r, message: failed }); if (watching) await stopReader(watcher, watching).catch(() => {}); collected = collected || await collect(all, labels).catch(() => null); }
    if (collected) account('clear', r, analyse(collected), failed);
    console.log('clear repeat ' + r + (failed ? ' FAIL ' + failed.slice(0, 160) : ' ok'));
  }
  summary.sections.clear = clr;
  summary.pageErrors = h.errors.filter((e) => !/ResizeObserver|API responded with status 500|network error/.test(e));
} catch (e) { summary.fatal = String(e && e.stack || e).slice(0, 2000); console.error(e); process.exitCode = 1; }
finally {
  summary.served = served; summary.lockTrace = agg; summary.finishedAt = new Date().toISOString();
  writeFileSync(`${OUT}/summary.json`, JSON.stringify(summary, null, 1));
  console.log('SUMMARY ' + JSON.stringify({ setup: SETUP, variant: VARIANT, control: summary.sections.control && { lossy: summary.sections.control.lossyReleases }, positive: summary.sections.positive && { pass: summary.sections.positive.pass, fail: summary.sections.positive.fail }, clear: summary.sections.clear && { pass: summary.sections.clear.pass, fail: summary.sections.clear.fail }, lockTrace: agg, servedSha: Object.keys(served.bodies) }));
  await h.close();
  if (summary.sections.positive?.fail || summary.sections.clear?.fail) process.exitCode = 1;
}
