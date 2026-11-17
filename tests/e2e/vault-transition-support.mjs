// Support for tests/e2e/vault-transition.e2e.mjs: exact old/new source archives, honest builds, an exact resource assertion and owned scratch.
// Imported by the canonical suite and by tests/vault-transition-harness.test.mjs. Importing this file starts nothing and loads no browser.
// Run as a child process (`node vault-transition-support.mjs --actor ...`) it is one independent actor of the scratch-isolation test.
import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomBytes, webcrypto } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const FULL_SHA = /^[0-9a-f]{40}$/;
const OWNER_FILE = '.plc-owner.json';
const OWNED_PREFIX = 'plc-transition-';

// ---- git: real commits, real timestamps, clean checkouts ---------------------------------------------------------------------------
const git = (repo, args, opts = {}) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'], ...opts });

/** The full commit id of `rev` in `repo` and its committer time in seconds, as `git show --format=%ct` prints it. Throws for a rev that is not a real commit. */
export function commitInfo(repo, rev) {
  if (typeof rev !== 'string' || !rev) throw new Error('commitInfo needs a revision');
  let sha;
  try { sha = git(repo, ['rev-parse', '--verify', rev + '^{commit}']).trim(); } catch { throw new Error('not a commit in this repository: ' + rev); }
  if (!FULL_SHA.test(sha)) throw new Error('unexpected commit id for ' + rev);
  const epoch = git(repo, ['show', '-s', '--format=%ct', sha]).trim();
  if (!/^\d+$/.test(epoch)) throw new Error('unexpected commit time for ' + rev);
  return { sha, epoch: Number(epoch) };
}

/** The checkout we build the NEW side from must be clean: an archive of a commit that the working tree has moved away from would be a different build. */
export function assertCleanCheckout(repo) {
  const dirty = git(repo, ['status', '--porcelain', '--untracked-files=normal']).trim();
  if (dirty) throw new Error('refusing to prepare from a checkout that is not clean:\n' + dirty.split('\n').slice(0, 10).join('\n'));
}

// ---- scratch that one process owns --------------------------------------------------------------------------------------------------
/** A new, empty child of `parent` made with mkdtemp, with an owner file naming a random token. Never touches the parent or any sibling. */
export function allocateScratchChild(parent, label = 'work') {
  if (!parent) throw new Error('allocateScratchChild needs a parent folder');
  fs.mkdirSync(parent, { recursive: true });
  const dir = fs.mkdtempSync(path.join(parent, OWNED_PREFIX + String(label).replace(/[^a-z0-9-]/gi, '-') + '-'));
  const token = randomBytes(16).toString('hex');
  fs.writeFileSync(path.join(dir, OWNER_FILE), JSON.stringify({ token, pid: process.pid, label }) + '\n', { flag: 'wx' });
  return { dir, token, parent: fs.realpathSync(parent) };
}

/** Removes `dir` only when it is a real (not linked) direct child of `parent`, made by allocateScratchChild, and carries exactly `token`. Anything else is refused untouched. */
export function cleanupOwnedChild({ dir, token, parent }) {
  const lst = fs.lstatSync(dir, { throwIfNoEntry: false });
  if (!lst) return false; // already gone: nothing to remove
  if (lst.isSymbolicLink() || !lst.isDirectory()) throw new Error('ownership: not a plain owned folder: ' + dir);
  let real;
  try { real = fs.realpathSync(dir); } catch (e) { if (e.code === 'ENOENT') return false; throw e; } // removed by its owner a moment ago
  if (path.dirname(real) !== fs.realpathSync(parent)) throw new Error('ownership: not a direct child of the supplied parent: ' + dir);
  if (!path.basename(dir).startsWith(OWNED_PREFIX)) throw new Error('ownership: not a folder this harness allocates: ' + dir);
  let owner;
  try { owner = JSON.parse(fs.readFileSync(path.join(dir, OWNER_FILE), 'utf8')); } catch { throw new Error('ownership: no owner file in ' + dir); }
  if (typeof token !== 'string' || !token || owner.token !== token) throw new Error('ownership: the token does not match, not removing ' + dir);
  fs.rmSync(dir, { recursive: true, force: true });
  return true;
}

// ---- exact source archives and real builds -----------------------------------------------------------------------------------------
/** `git archive` of exactly `sha` into the new empty folder `dest`. The archive has no .git. Returns the sha256 of the tar. */
export function archiveCommit(repo, sha, dest) {
  if (!FULL_SHA.test(sha)) throw new Error('archiveCommit needs a full commit id');
  fs.mkdirSync(dest, { recursive: true });
  if (fs.readdirSync(dest).length) throw new Error('archive destination is not empty: ' + dest);
  const tar = execFileSync('git', ['archive', '--format=tar', sha], { cwd: repo, maxBuffer: 1 << 29 });
  execFileSync('tar', ['-xf', '-', '-C', dest], { input: tar });
  if (fs.existsSync(path.join(dest, '.git'))) throw new Error('an exported source tree must not contain .git');
  return sha256(tar);
}

/**
 * One real build: archive `rev` of `repo` into `<workDir>/<name>-src`, build it with Node's scripts/build.mjs with GITHUB_SHA and SOURCE_DATE_EPOCH taken from that
 * real commit (no git repository in the export, no invented author, date or tag), and read back what the build wrote. Returns the identity the browser will report.
 */
export function buildArchive({ repo, rev, workDir, name, nodeModules, env = process.env, node = process.execPath }) {
  const { sha, epoch } = commitInfo(repo, rev);
  const dir = path.join(workDir, name + '-src');
  const archiveSha256 = archiveCommit(repo, sha, dir);
  if (nodeModules) fs.symlinkSync(nodeModules, path.join(dir, 'node_modules'));
  const buildEnv = { ...env, DEPLOY_BRANCH: 'local', GITHUB_SHA: sha, SOURCE_DATE_EPOCH: String(epoch) };
  execFileSync(node, ['scripts/build.mjs'], { cwd: dir, env: buildEnv, stdio: 'pipe', maxBuffer: 1 << 28 });
  const identity = readBuildIdentity(dir);
  assertBuildIdentity(identity, { commit: sha, epoch });
  assert.ok(!fs.existsSync(path.join(dir, '.git')), 'the build must not have created a git repository');
  return { name, dir, sha, epoch, archiveSha256, ...identity };
}

/** What a build wrote: dist/version.json, the APP_BUILD in dist/index.html and the release folder. */
export function readBuildIdentity(dir) {
  const dist = path.join(dir, 'dist');
  const version = JSON.parse(fs.readFileSync(path.join(dist, 'version.json'), 'utf8'));
  const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  const m = /window\.APP_BUILD=(\{.*?\});<\/script>/.exec(html);
  const appBuild = m ? JSON.parse(m[1]) : null;
  const releaseDir = path.join(dist, 'releases', String(version.commit));
  const index = fs.existsSync(path.join(dist, 'releases', 'index.json')) ? JSON.parse(fs.readFileSync(path.join(dist, 'releases', 'index.json'), 'utf8')) : null;
  return { version, appBuild, releaseDirExists: fs.existsSync(releaseDir), releaseIndex: index, versionJsonSha256: sha256(fs.readFileSync(path.join(dist, 'version.json'))), keyClassesSha256: fs.existsSync(path.join(releaseDir, 'chat/vault/key-classes.mjs')) ? sha256(fs.readFileSync(path.join(releaseDir, 'chat/vault/key-classes.mjs'))) : null };
}

/** The served identity must be exactly the real commit and its real time. A missing or different one is a failure, never a fallback. */
export function assertBuildIdentity(identity, { commit, epoch }) {
  assert.ok(FULL_SHA.test(commit), 'expected commit is a full id');
  assert.equal(identity.version.commit, commit, 'dist/version.json commit');
  assert.deepEqual(identity.appBuild, identity.version, 'window.APP_BUILD in index.html is exactly dist/version.json');
  assert.equal(identity.version.builtAt, new Date(epoch * 1000).toISOString(), 'builtAt is the real commit time');
  assert.equal(identity.releaseDirExists, true, 'dist/releases/<commit>/ exists');
  assert.equal(identity.releaseIndex?.current, commit, 'dist/releases/index.json names the commit');
}

// ---- the rich resource assertion ----------------------------------------------------------------------------------------------------
const FIXTURES = new URL('../fixtures/characters/', import.meta.url);
/** The independently read fixture bytes the Neri package must carry, keyed by the sha256 they really have. */
export function neriExpectedResources(fixtures = FIXTURES) {
  const out = new Map();
  for (const file of ['resources/tide-card.txt', 'resources/chart.png']) {
    const bytes = fs.readFileSync(new URL(file, fixtures));
    out.set(sha256(bytes), { file, bytes, base64: bytes.toString('base64') });
  }
  return out;
}
const bareHash = (h) => String(h).replace(/^sha256:/, '');

/**
 * Asserts the stored Neri record (the object an actual writer put under plc.characters.v1) carries EXACTLY the two fixture resources in its source.bytes ARRAY:
 * each found by its SHA-256 (one entry only), with the exact base64, the decoded bytes, the length and the hash all equal to the independently read fixture file.
 * An object map, a missing, wrong, truncated, duplicated, ambiguous or extra entry fails. Then the whole package must equal what the real producer and store
 * make of the fixture bundle: same root, same envelope, same structured projection.
 */
export async function assertNeriResources(record, { fixtures = FIXTURES, expected = null } = {}) {
  const want = neriExpectedResources(fixtures);
  const bytes = record?.source?.bytes;
  assert.ok(Array.isArray(bytes), 'record.source.bytes is an ARRAY (an object map is not the stored shape)');
  assert.equal(bytes.length, want.size, 'exactly the fixture resources: ' + bytes.length);
  const seen = new Set();
  for (const [hash, exp] of want) {
    const entries = bytes.filter((b) => b && bareHash(b.hash) === hash);
    assert.equal(entries.length, 1, `exactly one source.bytes entry for ${exp.file} (${hash}); found ${entries.length}`);
    const [entry] = entries;
    assert.equal(typeof entry.data, 'string', exp.file + ': data is base64 text');
    assert.equal(entry.data, exp.base64, exp.file + ': exact base64');
    const decoded = Buffer.from(entry.data, 'base64');
    assert.ok(decoded.equals(exp.bytes), exp.file + ': decoded Buffer equals the fixture file');
    assert.equal(decoded.length, exp.bytes.length, exp.file + ': decoded length');
    assert.equal(entry.size, exp.bytes.length, exp.file + ': recorded size');
    assert.equal(sha256(decoded), hash, exp.file + ': SHA-256 of the decoded bytes');
    seen.add(hash);
  }
  assert.equal(seen.size, bytes.length, 'no entry outside the fixture resources');
  const reference = expected || await producerNeriRecord(fixtures);
  assert.equal(record.source.root, reference.source.root, 'package root equals the real producer root');
  assert.deepEqual(record.source.envelope, reference.source.envelope, 'transport envelope equals the real producer envelope');
  assert.deepEqual(record.structured, reference.structured, 'structured projection equals the real producer projection');
  assert.equal(record.preview?.name, 'Neri');
}

/** The record the real validated producer and store prepare from the shipped Neri bundle (in memory; no vault, no browser). */
export async function producerNeriRecord(fixtures = FIXTURES) {
  const { createCharacterStore, createMemoryStorage, createMemoryLocks } = await import('../../chat/characters/character-store.mjs');
  const storage = createMemoryStorage();
  const store = createCharacterStore({ storage, key: 'plc.characters.v1', locks: createMemoryLocks(), crypto: webcrypto });
  const prepared = await store.prepare({ text: fs.readFileSync(new URL('examples/neri.bundle.json', fixtures), 'utf8') });
  assert.equal(prepared.ok, true, 'the real producer accepts the Neri bundle: ' + JSON.stringify(prepared));
  const committed = await store.commit(prepared.preparation);
  assert.equal(committed.ok, true, JSON.stringify(committed));
  return JSON.parse(storage.getItem('plc.characters.v1')).records[0];
}

// ---- independent scratch actors ----------------------------------------------------------------------------------------------------------
// Each actor is its own process: it allocates its own child, writes distinct old/new source witnesses (large, self-digesting, replaced atomically), reads every
// sibling's witnesses while they are being rewritten, tries a foreign cleanup (which must be refused), then cleans only its own child.
const WITNESS_BYTES = 48 * 1024;
const witness = (actor, kind, seq) => {
  const body = Buffer.alloc(WITNESS_BYTES, `${actor}:${kind}:${seq};`);
  return JSON.stringify({ actor, kind, seq, digest: sha256(body), body: body.toString('latin1') });
};
const witnessOk = (text) => { try { const w = JSON.parse(text); return sha256(Buffer.from(w.body, 'latin1')) === w.digest && w.body.startsWith(`${w.actor}:${w.kind}:${w.seq};`); } catch { return false; } };
const writeAtomic = (file, text) => { const tmp = file + '.tmp'; fs.writeFileSync(tmp, text); fs.renameSync(tmp, file); };
const nap = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function actorMain([parent, id, startFile, mode, totalArg]) {
  const total = Number(totalArg || 0);
  const seen = new Set();
  const out = { id, errors: [], reads: 0, torn: 0, foreignRefused: 0, foreignAllowed: 0, lost: 0 };
  try {
    const child = allocateScratchChild(parent, 'actor' + id);
    Object.assign(out, { dir: child.dir, token: child.token });
    for (const kind of ['old', 'new']) writeAtomic(path.join(child.dir, kind + '-source.json'), witness(id, kind, 0));
    if (mode === 'hang') { process.stdout.write('READY ' + JSON.stringify(out) + '\n'); setInterval(() => {}, 1000); return; }
    process.stdout.write('READY ' + JSON.stringify(out) + '\n'); // allocated and witnessed: now wait, bounded, for the runner to release every actor together
    for (let i = 0; i < 4000 && !fs.existsSync(startFile); i++) nap(5);
    if (!fs.existsSync(startFile)) throw new Error('barrier: never released');
    for (let seq = 1; seq <= 12; seq++) {
      for (const kind of ['old', 'new']) writeAtomic(path.join(child.dir, kind + '-source.json'), witness(id, kind, seq));
      for (const sib of fs.readdirSync(parent)) {
        const dir = path.join(parent, sib);
        if (!sib.startsWith(OWNED_PREFIX) || dir === child.dir) continue;
        for (const kind of ['old', 'new']) {
          let text; try { text = fs.readFileSync(path.join(dir, kind + '-source.json'), 'utf8'); } catch { continue; } // a sibling may just have cleaned up
          out.reads++; seen.add(sib); if (!witnessOk(text)) out.torn++;
        }
        if (seq === 6) { // a foreign cleanup with my token must be refused and must not delete anything
          try { if (cleanupOwnedChild({ dir, token: child.token, parent })) out.foreignAllowed++; } catch (e) { if (/^ownership/.test(e.message)) out.foreignRefused++; else out.errors.push(e.message); }
        }
      }
      for (const kind of ['old', 'new']) { const text = fs.readFileSync(path.join(child.dir, kind + '-source.json'), 'utf8'); if (!witnessOk(text) || JSON.parse(text).seq !== seq) out.lost++; }
    }
    // nobody cleans up before everybody has finished writing and reading, so all actors' folders and witnesses really coexisted
    const controlDir = path.dirname(startFile); // the runner's own folder outlives every actor, so a finished marker cannot vanish with a cleaned-up child
    fs.writeFileSync(path.join(controlDir, 'finished-' + id), 'x');
    const finished = () => fs.readdirSync(controlDir).filter((n) => n.startsWith('finished-')).length;
    for (let i = 0; i < 4000 && finished() < total; i++) nap(5);
    if (finished() < total) throw new Error('barrier: only ' + finished() + ' of ' + total + ' actors finished');
    out.siblingsSeen = seen.size;
    out.finalDigests = Object.fromEntries(['old', 'new'].map((k) => [k, JSON.parse(fs.readFileSync(path.join(child.dir, k + '-source.json'), 'utf8')).digest]));
    out.cleaned = cleanupOwnedChild(child);
  } catch (e) { out.errors.push(String(e.stack || e)); }
  process.stdout.write('DONE ' + JSON.stringify(out) + '\n');
}

const parseLine = (text, tag) => { const line = text.split('\n').find((l) => l.startsWith(tag + ' ')); return line ? JSON.parse(line.slice(tag.length + 1)) : null; };
const runActor = (parent, id, startFile, mode, node, total) => {
  const p = spawn(node, [fileURLToPath(import.meta.url), '--actor', parent, String(id), startFile, mode || 'run', String(total || 0)], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = ''; p.stdout.on('data', (d) => { stdout += d; }); p.stderr.on('data', (d) => { stderr += d; });
  const done = new Promise((res) => p.on('exit', (code, signal) => res({ code, signal, stdout, stderr })));
  return { p, done, ready: () => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('actor never became ready')), 20000); const poll = () => { const r = parseLine(stdout, 'READY'); if (r) { clearTimeout(t); res(r); } else setTimeout(poll, 5); }; poll(); }) };
};

/**
 * `actors` independent processes released together against one supplied scratch parent. Returns each actor's report. With `crashOne`, a further actor allocates its child,
 * is killed with SIGKILL before the others are released, and its abandoned child is returned for explicit owner cleanup (never cleaned by the others).
 */
export async function runScratchActors({ parent, actors, crashOne = false, node = process.execPath, timeoutMs = 60000 }) {
  const control = allocateScratchChild(parent, 'control'); // the barrier file lives in the runner's own owned child
  const startFile = path.join(control.dir, 'go');
  let crashed = null; const live = [];
  const within = (promise, what) => Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout (deadlock?): ' + what)), timeoutMs).unref())]);
  try {
    const running = Array.from({ length: actors }, (_, i) => runActor(parent, i, startFile, 'run', node, actors)); live.push(...running);
    if (crashOne) {
      const victim = runActor(parent, 'crash', startFile, 'hang', node, actors); live.push(victim);
      const info = await within(victim.ready(), 'victim ready'); victim.p.kill('SIGKILL');
      const result = await within(victim.done, 'victim exit'); crashed = { ...info, signal: result.signal };
    }
    await within(Promise.all(running.map((r) => r.ready())), 'every actor ready'); // release only when ALL have allocated and written their first witnesses
    fs.writeFileSync(startFile, 'go');
    const results = await within(Promise.all(running.map((r) => r.done)), 'actors finishing');
    return { reports: results.map((r) => ({ code: r.code, stderr: r.stderr, ...(parseLine(r.stdout, 'DONE') || { errors: ['no DONE line'] }) })), crashed };
  } finally { for (const r of live) r.p.kill('SIGKILL'); cleanupOwnedChild(control); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv[2] === '--actor') actorMain(process.argv.slice(3));
