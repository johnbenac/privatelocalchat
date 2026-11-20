// The helpers behind tests/e2e/vault-transition.e2e.mjs, tested directly with real inputs: exact old/new source archives and real builds, the exact Neri resource
// assertion (with corruptions it must reject), owned scratch, and 4, 8 and 16 independent actors repeated 20 times.
// This tests the HARNESS. It does not run a browser, the vault or the lifecycle, and a pass here is not a recovery or lease qualification of the application.
// The two real builds need a clean committed checkout (the harness refuses otherwise); the dirty-refusal cases use a SYNTHETIC fixture repository in scratch, labelled as such.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { oldRevAvailable } from './helpers/vault-transition-rig.mjs';
import {
  commitInfo, assertCleanCheckout, allocateScratchChild, cleanupOwnedChild, archiveCommit, buildArchive, readBuildIdentity, assertBuildIdentity,
  neriExpectedResources, assertNeriResources, producerNeriRecord, runScratchActors,
  allocateEvidenceReport, writeEvidenceReport, runEvidenceActors,
} from './e2e/vault-transition-support.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OLD_REV = '0b0ef27530a25e9d218ecae5460066162b07a6da';
const REPEATS = Number(process.env.PLC_CONC_REPEATS || 20);
const sha = (d) => createHash('sha256').update(d).digest('hex');
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

// One owned scratch child for the whole file, under the supplied parent (or the ignored work/ folder). Only this child is ever removed.
const base = allocateScratchChild(process.env.PLC_TRANSITION_SCRATCH || path.join(ROOT, 'work', 'transition-scratch'), 'harness-test');
const sub = (name) => { const d = path.join(base.dir, name); fs.mkdirSync(d, { recursive: true }); return d; };
test.after(() => { cleanupOwnedChild(base); });

// ---- owned scratch ---------------------------------------------------------------------------------------------------------------------------
test('scratch: a child is owned, unique and cleaned only by its token; the parent and a foreign sentinel survive every refusal', () => {
  const parent = sub('scratch-parent'); const sentinel = path.join(parent, 'OTHER-OWNER-SENTINEL'); fs.writeFileSync(sentinel, 'not ours');
  const a = allocateScratchChild(parent, 'a'), b = allocateScratchChild(parent, 'b');
  assert.notEqual(a.dir, b.dir); assert.notEqual(a.token, b.token); assert.equal(path.dirname(a.dir), fs.realpathSync(parent));
  assert.throws(() => cleanupOwnedChild({ dir: a.dir, token: b.token, parent }), /ownership/, 'another owner token');
  assert.throws(() => cleanupOwnedChild({ dir: a.dir, token: '', parent }), /ownership/, 'empty token');
  assert.throws(() => cleanupOwnedChild({ dir: parent, token: a.token, parent }), /ownership/, 'the parent itself');
  assert.throws(() => cleanupOwnedChild({ dir: sentinel, token: a.token, parent }), /ownership/, 'a foreign file');
  const foreignDir = path.join(parent, 'someone-elses'); fs.mkdirSync(foreignDir); fs.writeFileSync(path.join(foreignDir, 'x'), '1');
  assert.throws(() => cleanupOwnedChild({ dir: foreignDir, token: a.token, parent }), /ownership/, 'a folder this harness did not allocate');
  const link = path.join(parent, 'plc-transition-link'); fs.symlinkSync(b.dir, link);
  assert.throws(() => cleanupOwnedChild({ dir: link, token: b.token, parent }), /ownership/, 'a symbolic link to an owned child');
  const nested = path.join(a.dir, 'deeper'); fs.mkdirSync(nested);
  assert.throws(() => cleanupOwnedChild({ dir: nested, token: a.token, parent }), /ownership/, 'not a direct child');
  assert.ok(fs.existsSync(a.dir) && fs.existsSync(b.dir) && fs.existsSync(sentinel) && fs.existsSync(foreignDir) && fs.existsSync(parent), 'every refusal removed nothing');
  assert.equal(cleanupOwnedChild(a), true); assert.ok(!fs.existsSync(a.dir)); assert.ok(fs.existsSync(b.dir), 'the sibling is untouched');
  assert.equal(cleanupOwnedChild(a), false, 'a second cleanup is a no-op');
  assert.equal(cleanupOwnedChild(b), true);
  assert.equal(fs.readFileSync(sentinel, 'utf8'), 'not ours');
});

// ---- commits, timestamps, clean checkouts (SYNTHETIC fixture repository: used only for these refusal tests, never as an old/new build identity) ----------------
test('git: real commit time and id; missing or wrong commits fail; a dirty checkout is refused (synthetic fixture repo)', () => {
  // The real old revision is only in a clone WITH history (the deploy checkout is shallow). Without it this part did NOT run: say so loudly, and fail under PLC_REQUIRE_OLD_REV.
  if (oldRevAvailable()) { const real = commitInfo(ROOT, OLD_REV); assert.equal(real.sha, OLD_REV); assert.equal(String(real.epoch), git(ROOT, 'show', '-s', '--format=%ct', OLD_REV)); }
  else if (process.env.PLC_REQUIRE_OLD_REV) throw new Error('the old revision ' + OLD_REV.slice(0, 8) + ' is not in this clone (PLC_REQUIRE_OLD_REV is set: this is a failure, not a skip)');
  else process.stderr.write('WARNING: the old revision ' + OLD_REV.slice(0, 8) + ' is not in this clone, so the real-commit part of this test did NOT run\n');
  assert.throws(() => commitInfo(ROOT, 'f'.repeat(40)), /not a commit/);
  assert.throws(() => commitInfo(ROOT, 'no-such-ref'), /not a commit/);
  assert.throws(() => commitInfo(ROOT, ''), /needs a revision/);
  const repo = sub('synthetic-fixture-repo'); // SYNTHETIC: a throwaway repository to exercise the dirty refusal without touching the candidate
  git(repo, 'init', '-q'); fs.writeFileSync(path.join(repo, 'a.txt'), '1');
  git(repo, 'add', '-A'); // also the files this machine's git template writes into every new repository
  git(repo, '-c', 'user.name=fixture', '-c', 'user.email=fixture-host', 'commit', '-q', '-m', 'fixture: one file', '--no-verify');
  if (git(repo, 'status', '--porcelain')) { // this machine's git hooks write helper files at commit time: commit them too, so the fixture starts clean
    git(repo, 'add', '-A'); git(repo, '-c', 'user.name=fixture', '-c', 'user.email=fixture-host', 'commit', '-q', '-m', 'fixture: hook files', '--no-verify');
  }
  assertCleanCheckout(repo);
  fs.writeFileSync(path.join(repo, 'a.txt'), '2'); assert.throws(() => assertCleanCheckout(repo), /not clean/, 'modified tracked file');
  fs.writeFileSync(path.join(repo, 'a.txt'), '1'); assertCleanCheckout(repo); // (restored by hand: this machine's git hooks also write files on checkout)
  fs.writeFileSync(path.join(repo, 'new.txt'), 'x'); assert.throws(() => assertCleanCheckout(repo), /not clean/, 'untracked file');
  assert.equal(fs.readFileSync(path.join(repo, 'new.txt'), 'utf8'), 'x', 'refusal left the dirty file as it was');
});

test('archive: git archive of a real commit, no .git, byte for byte what git holds; a non-commit or a full-id mismatch is refused', () => {
  const dest = path.join(sub('archive'), 'old');
  const archiveSha = archiveCommit(ROOT, OLD_REV, dest);
  assert.match(archiveSha, /^[0-9a-f]{64}$/); assert.ok(!fs.existsSync(path.join(dest, '.git')));
  const blob = git(ROOT, 'rev-parse', OLD_REV + ':chat/vault/key-classes.mjs');
  assert.equal(git(ROOT, 'hash-object', path.join(dest, 'chat/vault/key-classes.mjs')), blob, 'key-classes.mjs equals the committed blob');
  assert.throws(() => archiveCommit(ROOT, OLD_REV, dest), /not empty/, 'never into a used folder');
  assert.throws(() => archiveCommit(ROOT, 'HEAD', path.join(sub('archive'), 'x')), /full commit id/);
});

// ---- two real builds ------------------------------------------------------------------------------------------------------------------------------
test('real builds: exact old release and clean current HEAD, real commit times, served identity read from the build outputs', () => {
  assertCleanCheckout(ROOT); // the candidate must be committed: the NEW side is an archive of HEAD, not of a dirty tree
  const work = sub('builds'); const nodeModules = path.join(ROOT, 'node_modules');
  const old = buildArchive({ repo: ROOT, rev: OLD_REV, workDir: work, name: 'old', nodeModules });
  const cur = buildArchive({ repo: ROOT, rev: 'HEAD', workDir: work, name: 'new', nodeModules });
  const head = git(ROOT, 'rev-parse', 'HEAD');
  assert.equal(old.sha, OLD_REV); assert.equal(cur.sha, head); assert.notEqual(old.sha, cur.sha);
  assert.equal(String(old.epoch), git(ROOT, 'show', '-s', '--format=%ct', OLD_REV)); assert.equal(String(cur.epoch), git(ROOT, 'show', '-s', '--format=%ct', 'HEAD'));
  for (const b of [old, cur]) {
    assert.equal(b.version.commit, b.sha); assert.deepEqual(b.appBuild, b.version);
    assert.equal(b.version.builtAt, new Date(b.epoch * 1000).toISOString());
    assert.ok(fs.existsSync(path.join(b.dir, 'dist', 'releases', b.sha, 'release.json')), 'release path');
    assert.ok(fs.existsSync(path.join(b.dir, 'dist', 'releases', b.sha, 'chat/vault/vault-store.mjs')));
    assert.ok(!fs.existsSync(path.join(b.dir, '.git')), 'no .git in the exported source');
    assert.ok(!fs.existsSync(path.join(b.dir, 'dist', '.git')));
  }
  assert.notEqual(old.archiveSha256, cur.archiveSha256);
  assert.notEqual(old.versionJsonSha256, cur.versionJsonSha256);
  assert.equal(git(ROOT, 'hash-object', path.join(cur.dir, 'tests/vault-transition-harness.test.mjs')), git(ROOT, 'rev-parse', 'HEAD:tests/vault-transition-harness.test.mjs'), 'the current archive contains the committed harness');
  // the build identity checks fail on a wrong commit and a wrong time, and on a missing release folder
  const id = readBuildIdentity(cur.dir);
  assert.throws(() => assertBuildIdentity(id, { commit: OLD_REV, epoch: cur.epoch }));
  assert.throws(() => assertBuildIdentity(id, { commit: cur.sha, epoch: cur.epoch + 1 }));
  assert.throws(() => assertBuildIdentity({ ...id, releaseDirExists: false }, { commit: cur.sha, epoch: cur.epoch }));
  assert.throws(() => assertBuildIdentity({ ...id, appBuild: { ...id.appBuild, commit: OLD_REV } }, { commit: cur.sha, epoch: cur.epoch }));
  const out = process.env.PLC_HARNESS_RESULTS;
  const record = (b) => ({ name: b.name, commit: b.sha, epoch: b.epoch, archiveSha256: b.archiveSha256, versionJsonSha256: b.versionJsonSha256, keyClassesSha256: b.keyClassesSha256, version: b.version, appBuild: b.appBuild, node: process.version });
  if (out) { fs.mkdirSync(out, { recursive: true }); for (const b of [old, cur]) fs.writeFileSync(path.join(out, `build-${b.name}.json`), JSON.stringify(record(b), null, 2) + '\n'); }
});

test('build refuses: a commit that does not exist, and an export that already holds a repository', () => {
  const work = sub('refusals');
  assert.throws(() => buildArchive({ repo: ROOT, rev: 'f'.repeat(40), workDir: work, name: 'ghost' }), /not a commit/);
  assert.ok(!fs.existsSync(path.join(work, 'ghost-src')), 'nothing was exported for a missing commit');
  // a build whose source lacks a required file fails instead of reporting an identity (a missing resource): the archive is tampered after export
  const dir = path.join(work, 'tampered'); archiveCommit(ROOT, OLD_REV, dir); fs.rmSync(path.join(dir, 'ops/native/production-runtime.json'));
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(dir, 'node_modules'));
  assert.throws(() => execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: dir, env: { ...process.env, DEPLOY_BRANCH: 'local', GITHUB_SHA: OLD_REV, SOURCE_DATE_EPOCH: '1' }, stdio: 'pipe' }), 'a build with a missing pinned resource fails');
  assert.ok(!fs.existsSync(path.join(dir, 'dist', 'version.json')), 'and writes no identity');
});

// ---- the exact Neri resource assertion -------------------------------------------------------------------------------------------------------------
test('resources: the real producer record passes against independently read fixture bytes (array entries by SHA-256, exact base64 and Buffer)', async () => {
  const rec = await producerNeriRecord();
  assert.ok(Array.isArray(rec.source.bytes) && rec.source.bytes.length === 2);
  const want = neriExpectedResources();
  assert.equal(want.size, 2);
  for (const [hash, exp] of want) { assert.equal(sha(exp.bytes), hash); assert.ok(exp.bytes.length > 0); }
  assert.equal(want.get([...want.keys()].find((h) => want.get(h).file.endsWith('chart.png'))).bytes.subarray(1, 4).toString(), 'PNG', 'the chart is a real PNG');
  await assertNeriResources(JSON.parse(JSON.stringify(rec)));
});

test('resources: every corruption is rejected (missing, wrong, truncated, duplicate, ambiguous, extra, object map, size-only and name-only shapes)', async () => {
  const good = await producerNeriRecord(); const clone = () => JSON.parse(JSON.stringify(good));
  const rejects = async (name, mutate) => { const r = clone(); mutate(r); await assert.rejects(() => assertNeriResources(r, { expected: good }), undefined, name); };
  await rejects('missing entry', (r) => { r.source.bytes.pop(); });
  await rejects('no entries', (r) => { r.source.bytes = []; });
  await rejects('wrong bytes', (r) => { r.source.bytes[0].data = r.source.bytes[0].data.slice(0, -4) + 'AAAA'; });
  await rejects('truncated data', (r) => { r.source.bytes[1].data = r.source.bytes[1].data.slice(0, r.source.bytes[1].data.length - 8); });
  await rejects('truncated and size adjusted', (r) => { const b = r.source.bytes[1]; b.data = b.data.slice(0, 40); b.size = Buffer.from(b.data, 'base64').length; });
  await rejects('wrong recorded size', (r) => { r.source.bytes[0].size += 1; });
  await rejects('duplicate entry', (r) => { r.source.bytes.push(structuredClone(r.source.bytes[0])); });
  await rejects('ambiguous: same hash, different data', (r) => { const d = structuredClone(r.source.bytes[0]); d.data = 'AAAA'; r.source.bytes.push(d); });
  await rejects('extra unknown entry', (r) => { r.source.bytes.push({ hash: 'sha256:' + '0'.repeat(64), size: 1, data: 'AA==' }); });
  await rejects('swapped data between entries', (r) => { const [a, b] = r.source.bytes; [a.data, b.data] = [b.data, a.data]; });
  await rejects('object map instead of array', (r) => { r.source.bytes = Object.fromEntries(r.source.bytes.map((b) => [b.hash, b.data])); });
  await rejects('name/size metadata only', (r) => { r.source.bytes = [{ name: 'chart.png', size: 9000 }, { name: 'tide-card.txt', size: 9000 }]; });
  await rejects('hash only, no bytes', (r) => { for (const b of r.source.bytes) delete b.data; });
  await rejects('different package root', (r) => { r.source.root = 'sha256:' + '1'.repeat(64); });
  await rejects('structured projection changed', (r) => { r.structured.lore = []; });
  await rejects('envelope changed', (r) => { r.source.envelope.assets[0].size += 1; });
  // a long record that merely mentions "chart" or is large is no proof: the old weak surrogate would have accepted this
  const weak = clone(); weak.source.bytes = [{ hash: 'x', size: 1, data: 'chart'.repeat(2000) }];
  assert.ok(JSON.stringify(weak).includes('chart') && JSON.stringify(weak).length > 5000, 'precondition: the weak surrogate would pass');
  await assert.rejects(() => assertNeriResources(weak, { expected: good }));
  await assert.rejects(() => assertNeriResources(null, { expected: good }));
  // the fixture side is independent: a changed fixture file makes the genuine record fail
  const alt = sub('alt-fixtures'); fs.cpSync(new URL('./fixtures/characters/', import.meta.url), alt, { recursive: true });
  fs.writeFileSync(path.join(alt, 'resources/tide-card.txt'), 'edited card\n');
  await assert.rejects(() => assertNeriResources(clone(), { fixtures: new URL('file://' + alt + '/'), expected: good }));
});

// ---- scratch isolation: independent actors, repeated -----------------------------------------------------------------------------------------------
const checkRound = (parent, round, actors) => {
  const reports = round.reports; const where = `${actors} actors`;
  assert.equal(reports.length, actors);
  assert.ok(reports.every((r) => r.code === 0 && r.errors.length === 0), where + ': actor errors ' + JSON.stringify(reports.filter((r) => r.errors.length || r.code !== 0)));
  assert.equal(new Set(reports.map((r) => r.dir)).size, actors, where + ': no shared path reuse');
  assert.equal(new Set(reports.map((r) => r.token)).size, actors, where + ': distinct owners');
  for (const kind of ['old', 'new']) assert.equal(new Set(reports.map((r) => r.finalDigests[kind])).size, actors, where + `: ${kind} witnesses are distinct, none duplicated or lost`);
  assert.ok(reports.every((r) => r.lost === 0), where + ': no lost witness');
  assert.ok(reports.every((r) => r.torn === 0), where + ': no torn observation');
  assert.ok(reports.every((r) => r.foreignAllowed === 0), where + ': no foreign deletion allowed');
  assert.ok(reports.every((r) => r.cleaned === true), where + ': each actor cleaned its own child');
  assert.ok(reports.every((r) => r.siblingsSeen >= actors - 1), where + ': every actor read every sibling\'s witnesses while they were rewritten: ' + reports.map((r) => r.siblingsSeen));
  assert.ok(reports.every((r) => r.reads >= 2 * (actors - 1) * 12), where + ': every actor read every sibling on every one of its 12 rounds: ' + reports.map((r) => r.reads));
  const left = fs.readdirSync(parent).filter((n) => n !== 'SENTINEL');
  assert.deepEqual(left, [], where + ': only the sentinel is left in the parent: ' + left);
  assert.equal(fs.readFileSync(path.join(parent, 'SENTINEL'), 'utf8'), 'other owner', where + ': sentinel intact');
};
for (const actors of [4, 8, 16]) {
  test(`scratch isolation: ${actors} independent actor processes released together, ${REPEATS} repeats`, { timeout: 300000 }, async () => {
    const parent = sub(`actors-${actors}`); fs.writeFileSync(path.join(parent, 'SENTINEL'), 'other owner');
    let foreignRefusals = 0;
    for (let i = 0; i < REPEATS; i++) {
      const round = await runScratchActors({ parent, actors });
      checkRound(parent, round, actors); foreignRefusals += round.reports.reduce((n, r) => n + r.foreignRefused, 0);
    }
    assert.ok(foreignRefusals > 0, 'foreign cleanups were really attempted and refused');
  });
}

test(`scratch isolation: an owner killed with SIGKILL after allocation (4 actors, ${REPEATS} repeats): the others and the next allocation proceed, the abandoned child waits for explicit owner cleanup`, { timeout: 300000 }, async () => {
  const parent = sub('actors-crash'); fs.writeFileSync(path.join(parent, 'SENTINEL'), 'other owner');
  for (let i = 0; i < REPEATS; i++) {
    const round = await runScratchActors({ parent, actors: 4, crashOne: true });
    const dead = round.crashed; assert.equal(dead.signal, 'SIGKILL', 'the owner really died by SIGKILL');
    assert.ok(round.reports.every((r) => r.code === 0 && r.errors.length === 0 && r.lost === 0 && r.torn === 0 && r.foreignAllowed === 0 && r.cleaned === true), 'survivors finished clean: ' + JSON.stringify(round.reports));
    assert.ok(fs.existsSync(dead.dir), 'the abandoned child is retained, not reaped by others');
    assert.ok(JSON.parse(fs.readFileSync(path.join(dead.dir, 'old-source.json'), 'utf8')).actor === 'crash', 'its witness is intact');
    assert.deepEqual(fs.readdirSync(parent).filter((n) => n !== 'SENTINEL'), [path.basename(dead.dir)], 'only the abandoned child remains');
    const next = allocateScratchChild(parent, 'next'); assert.notEqual(next.dir, dead.dir, 'the next allocation proceeds in its own folder');
    assert.throws(() => cleanupOwnedChild({ dir: dead.dir, token: next.token, parent }), /ownership/, 'another process cannot clean the dead owner\'s child');
    assert.equal(cleanupOwnedChild(next), true);
    assert.ok(fs.existsSync(dead.dir)); assert.equal(cleanupOwnedChild({ dir: dead.dir, token: dead.token, parent }), true, 'explicit owner cleanup (the test is the owner)');
  }
  assert.equal(fs.readFileSync(path.join(parent, 'SENTINEL'), 'utf8'), 'other owner');
});

// ---- evidence reports must outlive the export child ----------------------------------------------------------------------------------------------
// These call the SAME helpers the canonical suite calls (allocateEvidenceReport, writeEvidenceReport, cleanupOwnedChild); no browser, vault or lifecycle is run.
const evidenceWorld = (name) => {
  const parent = sub(name); const sentinel = path.join(parent, 'OTHER-OWNER-SENTINEL'); fs.writeFileSync(sentinel, 'not ours');
  const sibling = allocateScratchChild(parent, 'sibling'); fs.writeFileSync(path.join(sibling.dir, 'keep'), 'sibling export');
  const owned = allocateScratchChild(parent, 'e2e'); fs.writeFileSync(path.join(owned.dir, 'export.txt'), 'transient export');
  return { parent, sentinel, sibling, owned };
};
const assertSurvived = (w, r, file, text) => {
  assert.equal(fs.readFileSync(file, 'utf8'), text, 'report holds exactly the bytes written');
  assert.notEqual(path.dirname(file), w.owned.dir, 'report is not inside the export child');
  assert.ok(!path.resolve(file).startsWith(w.owned.dir + path.sep), 'report path is outside the export child tree');
  assert.ok(!fs.existsSync(w.owned.dir), 'the export child is gone');
  assert.ok(fs.existsSync(w.parent) && fs.readFileSync(w.sentinel, 'utf8') === 'not ours', 'parent and foreign sentinel intact');
  assert.equal(fs.readFileSync(path.join(w.sibling.dir, 'keep'), 'utf8'), 'sibling export', 'sibling export intact');
};

test('evidence: the default success report is unique, outside the export child and survives its cleanup', () => {
  const w = evidenceWorld('evidence-default-success');
  const r = allocateEvidenceReport({ parent: w.parent, label: 'e2e' });
  assert.equal(r.explicit, false); assert.ok(!fs.existsSync(r.path), 'nothing written yet');
  const written = writeEvidenceReport(r, { cases: { A: 1 }, sources: {} });
  assert.equal(written.file, r.path); assert.equal(written.sha256, sha(written.text)); assert.equal(written.bytes, Buffer.byteLength(written.text));
  assert.equal(cleanupOwnedChild(w.owned), true, 'the actual cleanup removed the own export child');
  assertSurvived(w, r, r.path, written.text);
  assert.ok(!fs.existsSync(r.failedPath), 'no failed report beside a success');
  assert.throws(() => writeEvidenceReport(r, { other: 1 }), /EEXIST/, 'a written report is never overwritten');
  assert.equal(fs.readFileSync(r.path, 'utf8'), written.text);
  assert.equal(cleanupOwnedChild(w.sibling), true); // never touched the report folder
  assert.ok(fs.existsSync(r.path));
  assert.throws(() => cleanupOwnedChild({ dir: r.dir, token: w.owned.token, parent: w.parent }), /ownership/, 'the report folder is not an owned export child and cannot be cleaned as one');
  assert.ok(fs.existsSync(r.path));
});

test('evidence: the default failure report (.failed) survives cleanup of the export child', () => {
  const w = evidenceWorld('evidence-default-failure');
  const r = allocateEvidenceReport({ parent: w.parent, label: 'e2e' });
  const written = writeEvidenceReport(r, { cases: { B: 'partial' }, sources: {} }, { failed: true });
  assert.equal(written.file, r.failedPath); assert.ok(written.file.endsWith('.failed'));
  assert.equal(cleanupOwnedChild(w.owned), true);
  assertSurvived(w, r, r.failedPath, written.text);
  assert.ok(!fs.existsSync(r.path), 'a failure never leaves a success-named report');
});

test('evidence: an explicit PLC_TRANSITION_EVIDENCE destination is used exactly, its parent is made and another owner\'s report is never overwritten', () => {
  const w = evidenceWorld('evidence-explicit');
  const dest = path.join(sub('evidence-explicit-dest'), 'made', 'later', 'report.json');
  const r = allocateEvidenceReport({ parent: w.parent, explicit: dest });
  assert.equal(r.explicit, true); assert.equal(r.path, dest); assert.equal(r.failedPath, dest + '.failed'); assert.ok(fs.existsSync(path.dirname(dest)), 'parent made');
  const written = writeEvidenceReport(r, { cases: {} });
  assert.equal(cleanupOwnedChild(w.owned), true);
  assertSurvived(w, r, dest, written.text);
  assert.deepEqual(fs.readdirSync(w.parent).filter((n) => n.startsWith('plc-evidence-')), [], 'an explicit destination allocates no default folder');
  // another owner's report at the destination (success or failed) refuses allocation and stays byte for byte
  assert.throws(() => allocateEvidenceReport({ parent: w.parent, explicit: dest }), /refusing to overwrite/);
  const foreign = path.join(path.dirname(dest), 'foreign.json.failed'); fs.writeFileSync(foreign, 'foreign report');
  assert.throws(() => allocateEvidenceReport({ parent: w.parent, explicit: path.join(path.dirname(dest), 'foreign.json') }), /refusing to overwrite/);
  assert.equal(fs.readFileSync(foreign, 'utf8'), 'foreign report'); assert.equal(fs.readFileSync(dest, 'utf8'), written.text);
  // a report appearing between allocation and write is not clobbered either
  const late = allocateEvidenceReport({ parent: w.parent, explicit: path.join(path.dirname(dest), 'late.json') });
  fs.writeFileSync(late.path, 'appeared later');
  assert.throws(() => writeEvidenceReport(late, { x: 1 }), /EEXIST/); assert.equal(fs.readFileSync(late.path, 'utf8'), 'appeared later');
  const failedExplicit = allocateEvidenceReport({ parent: w.parent, explicit: path.join(path.dirname(dest), 'bad.json') });
  assert.equal(writeEvidenceReport(failedExplicit, { x: 1 }, { failed: true }).file, path.join(path.dirname(dest), 'bad.json.failed'));
});

test('evidence: the canonical suite allocates and writes its report only through the shared helpers (no report inside the export child)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'tests/e2e/vault-transition.e2e.mjs'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  assert.match(src, /allocateEvidenceReport\(\{ parent: owned\.parent, explicit: process\.env\.PLC_TRANSITION_EVIDENCE/);
  assert.match(src, /writeEvidenceReport\(report, evidence\)/); assert.match(src, /writeEvidenceReport\(report, evidence, \{ failed: true \}\)/);
  assert.ok(!/evidence\.json/.test(src), 'the canonical suite names no default report file itself');
  assert.ok(!/evidencePath/.test(src), 'the old in-child evidencePath is gone');
  assert.ok(!/writeFileSync\(evidence/.test(src));
  assert.ok(/cleanupOwnedChild\(owned\)/.test(src), 'cleanup of the owned export child remains');
});

for (const actors of [4, 8, 16]) {
  test(`evidence: ${actors} simultaneous callers allocate independent default reports that all survive cleanup, ${REPEATS} repeats`, { timeout: 300000 }, async () => {
    const parent = sub(`evidence-actors-${actors}`); fs.writeFileSync(path.join(parent, 'SENTINEL'), 'other owner');
    const kept = new Set();
    for (let i = 0; i < REPEATS; i++) {
      const reports = await runEvidenceActors({ parent, actors });
      const where = `${actors} actors round ${i}`;
      assert.equal(reports.length, actors);
      assert.ok(reports.every((r) => r.code === 0 && r.errors.length === 0 && r.cleaned === true), where + ': actor errors ' + JSON.stringify(reports.filter((r) => r.errors.length || r.code !== 0)));
      assert.equal(new Set(reports.map((r) => r.report)).size, actors, where + ': distinct report paths');
      for (const r of reports) {
        assert.ok(!kept.has(r.file), where + ': path never reused across rounds'); kept.add(r.file);
        const text = fs.readFileSync(r.file, 'utf8');
        assert.equal(sha(text), r.sha256, where + ': exact bytes, none overwritten or torn'); assert.equal(JSON.parse(text).actor, r.id);
        assert.ok(!fs.existsSync(r.child), where + ': export child gone');
        assert.equal(r.file.endsWith('.failed'), Number(r.id) % 2 === 1, where + ': success/failure naming kept');
      }
    }
    assert.equal(kept.size, actors * REPEATS);
    assert.equal(fs.readFileSync(path.join(parent, 'SENTINEL'), 'utf8'), 'other owner');
    const left = fs.readdirSync(parent).filter((n) => n !== 'SENTINEL');
    assert.equal(left.length, actors * REPEATS, 'only the retained report folders are left: ' + left.filter((n) => !n.startsWith('plc-evidence-')));
    assert.ok(left.every((n) => n.startsWith('plc-evidence-')));
  });
}

test('importing the support module starts no browser and no build', async () => {
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', "await import(new URL('./tests/e2e/vault-transition-support.mjs', 'file://' + process.cwd() + '/')); console.log('imported')"], { cwd: ROOT, encoding: 'utf8', timeout: 30000 });
  assert.equal(out.trim(), 'imported', 'the import prints nothing and exits');
  const text = fs.readFileSync(path.join(ROOT, 'tests/e2e/vault-transition-support.mjs'), 'utf8');
  assert.ok(!/playwright|chromium/.test(text.replace(/\/\/.*$/gm, '')), 'the support module never references a browser');
});
