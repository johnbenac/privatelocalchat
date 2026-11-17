// Rich characters: many real tabs of one browser profile (plain storage, one origin, one Web Lock "plc-characters") change the saved characters at the same moment, through the visible
// controls only (Import character… and Save, Update, Make a copy, Remove). Actors are released together. Invariants, checked after every round:
//   no lost update   the saved count and the store's revision are exactly what the successful visible actions add up to
//   no duplicates    one double-clicked Save makes one character; every reference and admission id is unique
//   no corruption    the stored text always parses and every record is whole
//   no torn read     a reader tab sampling storage during the writes never sees a revision go backwards or text that does not parse
//   conflicts shown  two updates of one chosen version: exactly one winner, the other is told it changed and keeps its proposal
//   no deadlock      a tab that holds the lock and is closed (tab teardown) lets the waiting Save finish; a lock held past the wait is reported as busy, nothing is written
// Tab closure here is the browser tearing a page down. It is NOT a killed process, a crashed renderer or a power loss: that proof is tests/character-store-crash.test.mjs (real SIGKILL).
//   node scripts/e2e.mjs character-concurrency      PLC_CONC_REPEATS=20 (default) rounds; PLC_LIFECYCLE_EVIDENCE a folder for the JSON
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { launch, assert } from './harness.mjs';
import { newProfileDir } from './profile-root.mjs';

const ok = (n) => console.log('PASS ' + n);
const fx = new URL('../fixtures/characters/', import.meta.url);
const bundles = Object.fromEntries(['minimal', 'neri', 'bex'].map((n) => [n, readFileSync(new URL(`examples/${n}.bundle.json`, fx), 'utf8')]));
const REPEATS = Number(process.env.PLC_CONC_REPEATS || 20);
const evidenceDir = process.env.PLC_LIFECYCLE_EVIDENCE || null;
const evidence = { suite: 'character-concurrency', scope: 'real browser tabs of one plain-storage profile, visible writers; tab closure is not SIGKILL/renderer/power loss', repeats: REPEATS, rounds: [], extra: {} };

const h = await launch({ port: 18681, profileDir: newProfileDir('character-concurrency') });
const { context } = h; const origin = h.origin;
const KEY = 'plc.characters.v1';
const ready = async (p) => { await p.waitForSelector('#messageInput'); await p.waitForFunction(() => window.__plcBooted === true && Boolean(window.plcShell), null, { timeout: 30000 }); await p.waitForFunction(() => !document.querySelector('#messageInput').disabled); };
const state = (p) => p.evaluate((k) => { const t = localStorage.getItem(k); const j = JSON.parse(t || '{"revision":0,"records":[]}'); return { revision: j.revision, records: j.records.map((r) => ({ id: r.individualId, v: r.recordVersion, name: r.preview.name, adm: r.admissions, whole: Boolean(r.source && r.preview && r.capabilities) })) }; }, KEY);
const openInstructions = async (p) => { if (!await p.locator('#systemPromptInput').isVisible()) { await p.click('#shellPlus'); await p.click('.shell-pop .shell-pop-row:has-text("Instructions for this chat")'); } await p.waitForSelector('#importCharacterBtn', { state: 'visible' }); };
const startReview = async (p, name, content) => { await openInstructions(p); const [chooser] = await Promise.all([p.waitForEvent('filechooser'), p.click('#importCharacterBtn')]); await chooser.setFiles({ name, mimeType: 'application/json', buffer: Buffer.from(content) }); await p.waitForSelector('.app-dialog:has-text("Review character")'); };
const primary = (p) => p.locator('.app-dialog .dialog-actions .primary');
const gone = (p, ms = 30000) => p.waitForFunction(() => !document.querySelector('.app-dialog'), null, { timeout: ms });
const status = (p) => p.locator('.app-dialog .char-status').innerText().catch(() => '');
const cancel = async (p) => { await p.locator('.app-dialog button:has-text("Cancel")').first().click(); await gone(p); };
const openLibrary = async (p) => { await openInstructions(p); await p.click('#savedCharactersBtn'); await p.waitForSelector('.app-dialog:has-text("Saved characters")'); await p.waitForSelector('.char-item, .char-library .muted'); };
const closeLibrary = async (p) => { await p.locator('.app-dialog button:has-text("Done")').click(); await gone(p); };
const removeStep = async (p, id) => { await p.locator(`.char-item[data-individual="${id}"] button:has-text("Remove")`).click(); await p.waitForSelector('.app-dialog:has-text("Remove saved character")'); };
const confirmRemove = (p) => p.locator('.app-dialog:has-text("Remove saved character") button:has-text("Remove")').click();

// the pool of tabs: one page per actor, all in one browser profile
const POOL = 16;
const pages = [h.page];
for (let i = 1; i < POOL; i++) { const p = await context.newPage(); await p.goto(origin + '/'); pages.push(p); }
for (const p of pages) await ready(p);

// reader: samples storage from tab 0 during writes
let sampling = false; const samples = { n: 0, parseFailures: 0, backwards: 0, last: 0 };
const startReader = () => { sampling = true; (async () => { while (sampling) { try { const s = await state(pages[0]); samples.n++; if (s.revision < samples.last) samples.backwards++; samples.last = Math.max(samples.last, s.revision); } catch { samples.parseFailures++; } await pages[0].waitForTimeout(25); } })(); };
const stopReader = () => { sampling = false; };

const check = async (label, expect) => {
  const s = await state(pages[0]);
  const ids = s.records.map((r) => r.id); const adm = s.records.flatMap((r) => r.adm);
  assert(new Set(ids).size === ids.length, label + ': every reference is unique');
  assert(new Set(adm).size === adm.length, label + ': every admission id appears once (no duplicate admission)');
  assert(s.records.every((r) => r.whole), label + ': every record is whole');
  assert(s.records.length === expect.count, label + ': saved count is ' + expect.count + ' but ' + s.records.length);
  assert(s.revision === expect.revision, label + ': revision is ' + expect.revision + ' (every successful visible write counted once) but ' + s.revision);
  return s;
};

const t0 = Date.now();
try {
  // base: one target character everybody may update or copy
  await startReview(pages[0], 'tide.json', bundles.minimal); await primary(pages[0]).click(); await gone(pages[0]);
  let s = await check('base', { count: 1, revision: 1 });
  const target = s.records[0].id; let expected = { count: 1, revision: 1 };
  startReader();

  for (let r = 1; r <= REPEATS; r++) {
    const N = r % 5 === 0 ? 16 : r % 2 ? 8 : 4; const round = { r, actors: N, phases: {} }; const started = Date.now();
    const actors = pages.slice(0, N);

    // phase 1: N tabs each add a different package at the same moment
    const files = actors.map((_, i) => (i % 2 ? ['bex-' + r + '-' + i + '.json', bundles.bex] : ['pip-' + r + '-' + i + '.json', bundles.minimal]));
    await Promise.all(actors.map((p, i) => startReview(p, ...files[i])));
    await Promise.all(actors.map((p) => primary(p).click()));
    await Promise.all(actors.map((p) => gone(p)));
    expected = { count: expected.count + N, revision: expected.revision + N };
    s = await check('r' + r + ' add', expected); round.phases.add = { saved: N };
    const added = s.records.filter((x) => x.id !== target).map((x) => x.id);

    // phase 2: two tabs update the same chosen version: one winner, one told it changed, proposal kept
    const [A, B] = [pages[0], pages[1]];
    await Promise.all([A, B].map((p, i) => startReview(p, 'upd-' + r + '-' + i + '.json', i ? bundles.minimal : bundles.bex)));
    await Promise.all([A, B].map(async (p) => { await p.check('#charPurposeUpdate'); await p.selectOption('#charUpdateTarget', target); }));
    await Promise.all([A, B].map((p) => primary(p).click()));
    await Promise.all([A, B].map((p) => p.waitForFunction(() => !document.querySelector('.app-dialog') || /changed since you chose it/.test(document.querySelector('.app-dialog .char-status')?.textContent || ''), null, { timeout: 30000 })));
    const closed = await Promise.all([A, B].map((p) => p.locator('.app-dialog').count().then((c) => c === 0)));
    assert(closed.filter(Boolean).length === 1, 'r' + r + ' stale: exactly one of two updates won: ' + closed);
    const loser = closed[0] ? B : A; const said = await status(loser);
    assert(/changed since you chose it/.test(said), 'r' + r + ' stale: the other one is told so (' + said + ')');
    assert(await loser.locator('.app-dialog:has-text("Review character")').count() === 1, 'r' + r + ' stale: its proposal stays open');
    await cancel(loser);
    expected = { count: expected.count, revision: expected.revision + 1 };
    s = await check('r' + r + ' stale', expected); round.phases.stale = { winner: closed[0] ? 'A' : 'B', message: said.slice(0, 80) };

    // phase 3: a double click on Save makes one character
    await startReview(pages[2], 'dbl-' + r + '.json', bundles.minimal);
    await primary(pages[2]).click({ clickCount: 2, delay: 10 }); await gone(pages[2]);
    expected = { count: expected.count + 1, revision: expected.revision + 1 };
    s = await check('r' + r + ' double click', expected); round.phases.doubleClick = { saved: 1 };
    const dbl = s.records.filter((x) => x.id !== target && !added.includes(x.id)).map((x) => x.id);
    assert(dbl.length === 1, 'r' + r + ': the double click left exactly one new character');

    // phase 4: N tabs remove the character each added while one tab copies the target; all at once
    const copier = pages[N < POOL ? N : 0]; const removers = actors;
    await Promise.all(removers.map((p) => openLibrary(p)));
    if (copier !== pages[0] && !removers.includes(copier)) await openLibrary(copier);
    await Promise.all(removers.map((p, i) => removeStep(p, added[i])));
    const copyLibrary = removers.includes(copier) ? null : copier;
    await Promise.all([...removers.map((p) => confirmRemove(p)), copyLibrary ? copyLibrary.locator(`.char-item[data-individual="${target}"] button:has-text("Make a copy")`).click() : Promise.resolve()]);
    // Every one of these writes finished when the stored REVISION has counted all of them: the count alone passes through the wanted value in the middle (all removals done, the copy not yet landed).
    expected = { count: expected.count - N + (copyLibrary ? 1 : 0), revision: expected.revision + N + (copyLibrary ? 1 : 0) };
    await pages[0].waitForFunction(([k, want]) => JSON.parse(localStorage.getItem(k)).revision === want, [KEY, expected.revision], { timeout: 30000 });
    s = await check('r' + r + ' remove/copy', expected); round.phases.removeAndCopy = { removed: N, copied: copyLibrary ? 1 : 0 };
    await Promise.all([...removers, ...(copyLibrary ? [copyLibrary] : [])].map(async (p) => { await p.locator('.app-dialog button:has-text("Done")').click(); await gone(p); }));

    // phase 5: tab teardown: a tab holds the lock; a Save waits behind it; the tab is closed; the Save completes once
    const holder = await context.newPage(); await holder.goto(origin + '/version.json');
    await holder.evaluate(() => new Promise((res) => { navigator.locks.request('plc-characters', () => new Promise(() => {})); const t = setInterval(async () => { const q = await navigator.locks.query(); if (q.held.some((x) => x.name === 'plc-characters')) { clearInterval(t); res(); } }, 10); }));
    await startReview(pages[3], 'held-' + r + '.json', bundles.minimal);
    await primary(pages[3]).click();
    await pages[3].waitForFunction(() => /Saving…/.test(document.querySelector('.app-dialog .char-status')?.textContent || ''));
    // the Save is really queued at the lock (the browser reports a pending request for it), not merely given time to have written
    await pages[3].waitForFunction(async () => (await navigator.locks.query()).pending.some((x) => x.name === 'plc-characters'), null, { timeout: 30000 });
    assert((await state(pages[0])).records.length === expected.count, 'r' + r + ' held: nothing is written while another tab holds the lock');
    await holder.close(); // the browser tears the tab down; the lock is released with it
    await gone(pages[3]);
    expected = { count: expected.count + 1, revision: expected.revision + 1 };
    s = await check('r' + r + ' teardown', expected); round.phases.teardown = { saved: 1 };

    // phase 6: remove what is left of this round (the copy, the double-click one, the teardown one) from three tabs together
    const extra = s.records.filter((x) => x.id !== target).map((x) => x.id);
    const cleaners = pages.slice(0, extra.length);
    await Promise.all(cleaners.map((p) => openLibrary(p)));
    await Promise.all(cleaners.map((p, i) => removeStep(p, extra[i])));
    await Promise.all(cleaners.map((p) => confirmRemove(p)));
    expected = { count: 1, revision: expected.revision + extra.length };
    await pages[0].waitForFunction(([k, want]) => JSON.parse(localStorage.getItem(k)).revision === want, [KEY, expected.revision], { timeout: 30000 });
    await Promise.all(cleaners.map(async (p) => { await p.locator('.app-dialog button:has-text("Done")').click(); await gone(p); }));
    await check('r' + r + ' clean', expected); round.phases.cleanup = { removed: extra.length };
    round.ms = Date.now() - started; round.revision = expected.revision; evidence.rounds.push(round);
    console.log('  round ' + r + '/' + REPEATS + ' ok: ' + N + ' actors, revision ' + expected.revision + ', ' + round.ms + ' ms');
  }
  stopReader();
  evidence.reader = { ...samples };
  assert(samples.parseFailures === 0 && samples.backwards === 0 && samples.n > 20, 'the reader tab never saw unparsable text or a revision going backwards: ' + JSON.stringify(samples));
  ok('actors 4/8/16 x ' + REPEATS + ' rounds: distinct adds, stale update pair, double click, remove+copy, tab teardown behind a held lock; no loss, duplicate, corruption, torn read or deadlock');

  // a lock held longer than the wait: the Save is refused as busy, nothing is written, the proposal is kept, and works once the holder is gone
  const holder = await context.newPage(); await holder.goto(origin + '/version.json');
  await holder.evaluate(() => new Promise((res) => { navigator.locks.request('plc-characters', () => new Promise(() => {})); const t = setInterval(async () => { const q = await navigator.locks.query(); if (q.held.some((x) => x.name === 'plc-characters')) { clearInterval(t); res(); } }, 10); }));
  await startReview(pages[4], 'busy.json', bundles.minimal); const before = await pages[4].evaluate((k) => localStorage.getItem(k), KEY);
  await primary(pages[4]).click();
  await pages[4].waitForFunction(() => /Another tab is changing saved characters/.test(document.querySelector('.app-dialog .char-status')?.textContent || ''), null, { timeout: 30000 });
  assert(await pages[4].evaluate((k) => localStorage.getItem(k), KEY) === before, 'busy: nothing was written');
  assert(await pages[4].locator('.app-dialog:has-text("Review character")').count() === 1, 'busy: the proposal stays open');
  await holder.close(); await primary(pages[4]).click(); await gone(pages[4]);
  assert((await state(pages[0])).records.length === 2, 'busy: the retry saved exactly one');
  evidence.extra.busyRefusal = { waitMs: 10000, outcome: 'refused as busy, retained, retry saved once' };
  ok('a lock held past the wait refuses as busy with nothing written; the retained proposal saves once the holder is gone');

  evidence.totalMs = Date.now() - t0;
  assert(h.errors.length === 0, 'no page errors: ' + h.errors.join(' | '));
  console.log('character-concurrency e2e: ok');
} catch (e) { stopReader(); console.error(e); process.exitCode = 1; }
finally {
  if (evidenceDir) { mkdirSync(evidenceDir, { recursive: true }); writeFileSync(evidenceDir + '/character-concurrency-evidence.json', JSON.stringify(evidence, null, 2)); }
  await h.close();
}
