// The operator's tools: install, upgrade, roll back, check and prune the releases of one operator root (docs/RUN-IT.md).
//
// The root is a folder the operator chooses. Everything here stays inside it:
//   current.json                 which release is live (written by a temporary file and one rename); it is the truth
//   current                      a symlink to releases/<release>, a convenience for other web servers (best effort)
//   plc.mjs                      the launcher, which hands over to the installed release's serve.mjs
//   releases/<version>-<target>/ one unpacked release each (app/, serve.mjs, compat.json, ...)
//   config/, pages/, models/     the operator's own; no command here writes into them except the READMEs a first install adds
//
// The tool that is installed does the installing: serve.mjs of a release calls these functions (--upgrade, --rollback, --check, --prune).
// Needs only Node.js and the files beside it (zip.mjs, headers.mjs).
//
// An installed release changes only by the held build folders and releases/index.json that carryHeldBuilds adds to its app/. That is how a tab that
// runs an earlier build keeps its files across an upgrade or a rollback (docs/UPGRADE-BEHAVIOUR.md); nothing else of an installed release is ever rewritten.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {extractZip} from './zip.mjs';
import {HEADER_RULES, parsePagesHeaders} from './headers.mjs';

export const CURRENT_FORMAT = 'plc-current/1';
export const COMPAT_FORMAT = 'plc-compat/1';
export const LAUNCHER_FORMAT = 1;
export const DEFAULT_KEEP_BUILDS = 4; // builds held at once: the current one and the three before it, as on the deployed site
export const DEFAULT_KEEP_RELEASES = 3;
const RELEASE_LIST_URL = 'https://api.github.com/repos/johnbenac/privatelocalchat/releases/latest';
const OWN_PAGES = ['help', 'about', 'privacy', 'updates'];
const HEX40 = /^[0-9a-f]{40}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

/** A refusal: the message says what is wrong and what to do. The command line prints it without a stack. */
export class Refusal extends Error { constructor(message) { super(message); this.name = 'Refusal'; } }
const refuse = (message) => { throw new Refusal(message); };

// ---- small helpers ------------------------------------------------------------------------------------------------------------------------------------
const exists = (p) => { try { fs.lstatSync(p); return true; } catch { return false; } };
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };
const sha256Of = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const short = (commit) => String(commit).slice(0, 7);
const rmrf = (p) => fs.rmSync(p, {recursive: true, force: true});
const unsafePath = (p) => typeof p !== 'string' || !p || p.startsWith('/') || p.includes('\\') || p.includes('\0') || p.split('/').some((s) => s === '..' || s === '');

/** A path made of parts under `root`; anything that resolves outside it is a bug in this file, and stops here. */
function at(root, ...parts) {
  const p = path.resolve(root, ...parts);
  if (p !== root && !p.startsWith(root + path.sep)) throw new Error(`Internal error: ${p} is outside ${root}`);
  return p;
}

let counter = 0;
/** Writes a file by writing a temporary file in the same folder and renaming it over, so a reader sees the old file or the new one and never half of one. */
function writeAtomic(file, data, mode) {
  const tmp = `${file}.tmp-${process.pid}-${++counter}`;
  try {
    fs.writeFileSync(tmp, data, mode === undefined ? undefined : {mode});
    fs.renameSync(tmp, file);
  } catch (error) { rmrf(tmp); throw error; }
}

function readJson(file, label) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { refuse(`${label} is missing. This is not a complete release: download it again.`); }
  try { return JSON.parse(text); } catch (error) { refuse(`${label} is not valid JSON (${error.message}).`); }
}

/** Orders X.Y.Z versions, with an optional -prerelease: a prerelease sorts below the same version without one. Returns a number below, equal to or above 0. */
export function compareVersions(a, b) {
  const pa = VERSION_RE.exec(String(a)), pb = VERSION_RE.exec(String(b));
  if (!pa || !pb) throw new Error(`"${!pa ? a : b}" is not a version such as 1.2.3`);
  for (let i = 1; i <= 3; i++) { const d = Number(pa[i]) - Number(pb[i]); if (d) return d < 0 ? -1 : 1; }
  if (pa[4] === undefined && pb[4] === undefined) return 0;
  if (pa[4] === undefined) return 1;
  if (pb[4] === undefined) return -1;
  const x = pa[4].split('.'), y = pb[4].split('.');
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    if (x[i] === y[i]) continue;
    const nx = /^\d+$/.test(x[i]), ny = /^\d+$/.test(y[i]);
    if (nx && ny) return Number(x[i]) < Number(y[i]) ? -1 : 1;
    if (nx !== ny) return nx ? -1 : 1;
    return x[i] < y[i] ? -1 : 1;
  }
  return x.length === y.length ? 0 : x.length < y.length ? -1 : 1;
}

/** { version, target } for `<version>-<target>`, or null. */
export function parseRelease(name) {
  const m = /^(.+)-(app|runkit)$/.exec(String(name));
  return m && VERSION_RE.test(m[1]) ? {version: m[1], target: m[2]} : null;
}
const parseFolderName = (name) => { const m = /^private-local-chat-(.+)$/.exec(name); return m ? parseRelease(m[1]) : null; };

// ---- the current record and the layout --------------------------------------------------------------------------------------------------------------------
/** current.json exists and cannot be trusted. Only upgrade recovers from it (it moves the file aside); everything else refuses with this advice. */
class UnusableCurrent extends Error {
  constructor(file, why, root) {
    super(`${file} cannot be used: ${why}. Install a release again to recover: unpack a release and run "node serve.mjs --upgrade . --root ${root}" from it (docs/RUN-IT.md). The damaged file is moved aside, not deleted.`);
    this.name = 'UnusableCurrent';
    this.file = file;
    this.why = why;
  }
}

/** The record that says which release is live, with the folders it names; null when there is none; throws a plain error when it exists and cannot be trusted. */
export function readCurrent(root) {
  root = path.resolve(root);
  const file = at(root, 'current.json');
  if (!exists(file)) return null;
  const bad = (why) => new UnusableCurrent(file, why, root);
  let record;
  try { record = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) { throw bad('it is not valid JSON (' + error.message + ')'); }
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw bad('it is not an object');
  if (record.format !== CURRENT_FORMAT) throw bad(`its format is not "${CURRENT_FORMAT}"`);
  const parsed = typeof record.release === 'string' ? parseRelease(record.release) : null;
  if (!parsed) throw bad('"release" is not <version>-<target>');
  if (record.version !== parsed.version || record.target !== parsed.target) throw bad('"version" and "target" disagree with "release"');
  if (typeof record.commit !== 'string' || !HEX40.test(record.commit)) throw bad('"commit" is not a full commit hash');
  if (record.previous !== null && !(typeof record.previous === 'string' && parseRelease(record.previous))) throw bad('"previous" is neither null nor a release name');
  if (typeof record.switchedAt !== 'string' || Number.isNaN(Date.parse(record.switchedAt))) throw bad('"switchedAt" is not a time');
  const releaseDir = at(root, 'releases', record.release);
  if (!isDir(releaseDir)) throw bad(`the release folder releases/${record.release} does not exist`);
  return {...record, releaseDir, appDir: path.join(releaseDir, 'app')};
}

/** The installed releases: folders of releases/ named <version>-<target> that hold a valid app/version.json, oldest version first. */
export function installedReleases(root) {
  root = path.resolve(root);
  const dir = at(root, 'releases');
  if (!isDir(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    if (!entry.isDirectory()) continue;
    const parsed = parseRelease(entry.name);
    if (!parsed) continue;
    let info;
    try { info = JSON.parse(fs.readFileSync(path.join(dir, entry.name, 'app', 'version.json'), 'utf8')); } catch { continue; }
    if (!info || info.version !== parsed.version || typeof info.commit !== 'string' || !HEX40.test(info.commit)) continue;
    const releaseDir = path.join(dir, entry.name);
    out.push({release: entry.name, ...parsed, commit: info.commit, releaseDir, appDir: path.join(releaseDir, 'app')});
  }
  return out.sort((a, b) => compareVersions(a.version, b.version) || (a.release < b.release ? -1 : a.release > b.release ? 1 : 0));
}

const READMES = {
  config: 'Your settings go here. Nothing in this folder is written by an upgrade.\n\n  app-config.json   where the app gets its model files (see docs/APP-CONFIG.md in the project)\n  site.json         the links to your pages, and the identity of your site (see docs/SITE-LINKS.md)\n',
  pages: 'Your own pages go here, one folder each: pages/<name>/index.html is served at /<name>/, with anything the page uses beside it.\nA name the app itself uses (releases, brand, sw.js, models, ...) is refused by --check and ignored when serving, except help, about, privacy and updates, which you may replace.\nNothing in this folder is written by an upgrade.\n',
  models: 'Model files go here, as <name>/<revision>/<file>. Fetch them with fetch-models.mjs (next to serve.mjs in a release).\nThey are served at /models/. Nothing in this folder is written by an upgrade.\n'
};

function ensureLayout(root, log) {
  fs.mkdirSync(root, {recursive: true});
  for (const name of ['releases', 'config', 'pages', 'models']) {
    const dir = at(root, name);
    if (isDir(dir)) continue;
    fs.mkdirSync(dir);
    if (READMES[name]) fs.writeFileSync(path.join(dir, 'README.txt'), READMES[name]);
    log(`Made ${name}/`);
  }
}

function removeLeftovers(root, log) {
  const releases = at(root, 'releases');
  if (isDir(releases)) for (const name of fs.readdirSync(releases)) if (name.startsWith('.incoming-')) { rmrf(path.join(releases, name)); log(`Removed ${name}, left by a run that stopped.`); }
  if (isDir(root)) for (const name of fs.readdirSync(root)) if (/^(current\.json|current|plc\.mjs)\.tmp-/.test(name)) rmrf(path.join(root, name));
}

// ---- builds: release.json, held builds, headers ------------------------------------------------------------------------------------------------------------
function readManifest(dir) {
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'release.json'), 'utf8'));
  if (!manifest || typeof manifest.commit !== 'string' || !Array.isArray(manifest.files)) throw new Error('release.json does not list files');
  for (const f of manifest.files) {
    if (!f || unsafePath(f.path)) throw new Error(`release.json names a path that is not allowed: ${JSON.stringify(f && f.path)}`);
    if (!Number.isInteger(f.bytes) || f.bytes < 0 || typeof f.sha256 !== 'string' || !HEX64.test(f.sha256)) throw new Error(`release.json has no size or checksum for ${f.path}`);
  }
  return manifest;
}

/** Problems of one build folder app/releases/<commit>: every file of its release.json must exist, with its size and SHA-256. */
function verifyBuild(appDir, commit, {limit = 10} = {}) {
  const dir = path.join(appDir, 'releases', commit);
  const label = short(commit);
  if (!HEX40.test(commit)) return [`${commit} is not a commit`];
  if (!isDir(dir)) return [`build ${label}: its folder app/releases/${commit} is missing`];
  let manifest;
  try { manifest = readManifest(dir); } catch (error) { return [`build ${label}: ${error.code === 'ENOENT' ? 'release.json is missing' : error.message}`]; }
  if (manifest.commit !== commit) return [`build ${label}: its release.json is for another commit`];
  const problems = [];
  for (const f of manifest.files) {
    const file = path.join(dir, ...f.path.split('/'));
    let info;
    try { info = fs.lstatSync(file); } catch { problems.push(`build ${label}: ${f.path} is missing`); continue; }
    if (!info.isFile()) { problems.push(`build ${label}: ${f.path} is not a plain file`); continue; }
    if (info.size !== f.bytes) { problems.push(`build ${label}: ${f.path} has a different size (${info.size}, expected ${f.bytes})`); continue; }
    if (sha256Of(fs.readFileSync(file)) !== f.sha256) problems.push(`build ${label}: ${f.path} has changed (its SHA-256 differs)`);
  }
  return problems.length > limit ? [...problems.slice(0, limit), `build ${label}: ${problems.length - limit} more files have problems`] : problems;
}

function readIndex(appDir) {
  const index = JSON.parse(fs.readFileSync(path.join(appDir, 'releases', 'index.json'), 'utf8'));
  if (!index || typeof index.current !== 'string' || !HEX40.test(index.current) || !Array.isArray(index.retained) || !index.retained.every((c) => typeof c === 'string' && HEX40.test(c))) throw new Error('it does not name its builds');
  return index;
}

/** The builds an app folder holds as current or retained, current first. Falls back to the build of version.json when there is no usable index. */
function heldCommits(appDir) {
  try { const index = readIndex(appDir); return [index.current, ...index.retained.filter((c) => c !== index.current)]; } catch { /* below */ }
  try { const info = JSON.parse(fs.readFileSync(path.join(appDir, 'version.json'), 'utf8')); return HEX40.test(info.commit) ? [info.commit] : []; } catch { return []; }
}

function checkHeaders(appDir) {
  let rules;
  try { rules = parsePagesHeaders(fs.readFileSync(path.join(appDir, '_headers'), 'utf8')); } catch (error) { return [`_headers cannot be read: ${error.code === 'ENOENT' ? 'the file is missing' : error.message}`]; }
  const problems = [];
  for (const rule of HEADER_RULES) {
    const given = rules.filter((r) => r.path === rule.path);
    for (const [name, value] of rule.headers) {
      if (!given.some((r) => r.headers.some(([k, v]) => k.toLowerCase() === name.toLowerCase() && v === value))) problems.push(`_headers lacks "${name}: ${value}" for ${rule.path}`);
    }
  }
  return problems;
}

/** Every file of an app folder's current build and held builds against their release.json, and its headers. Used by --check and before any switch. */
function checkApp(appDir, commit) {
  const problems = [];
  let info;
  try { info = JSON.parse(fs.readFileSync(path.join(appDir, 'version.json'), 'utf8')); } catch { return ['app/version.json is missing or not valid JSON']; }
  if (info.commit !== commit) problems.push(`app/version.json says commit ${short(info.commit)}, not ${short(commit)}`);
  let held = [commit];
  try {
    const index = readIndex(appDir);
    if (index.current !== commit) problems.push(`app/releases/index.json says the current build is ${short(index.current)}, not ${short(commit)}`);
    held = [commit, ...index.retained.filter((c) => c !== commit)];
  } catch (error) { problems.push(`app/releases/index.json cannot be used: ${error.code === 'ENOENT' ? 'it is missing' : error.message}`); }
  for (const c of held) problems.push(...verifyBuild(appDir, c));
  problems.push(...checkHeaders(appDir));
  return problems;
}

const listProblems = (problems) => problems.map((p) => '  - ' + p).join('\n');

// ---- carrying held builds forward --------------------------------------------------------------------------------------------------------------------------
/** Copies a build folder from `src` to `dest`, file by file as release.json lists them, checking each one. Throws when anything is wrong; the caller removes `dest`. */
function copyBuild(src, dest, commit) {
  const manifest = readManifest(src);
  if (manifest.commit !== commit) throw new Error('its release.json is for another commit');
  fs.mkdirSync(dest, {recursive: true});
  for (const f of manifest.files) {
    const from = path.join(src, ...f.path.split('/'));
    let info;
    try { info = fs.lstatSync(from); } catch { throw new Error(`${f.path} is missing`); }
    if (!info.isFile()) throw new Error(`${f.path} is not a plain file`);
    const bytes = fs.readFileSync(from);
    if (bytes.length !== f.bytes) throw new Error(`${f.path} has a different size`);
    if (sha256Of(bytes) !== f.sha256) throw new Error(`${f.path} has changed (its SHA-256 differs)`);
    const to = path.join(dest, ...f.path.split('/'));
    fs.mkdirSync(path.dirname(to), {recursive: true});
    fs.writeFileSync(to, bytes);
  }
  fs.copyFileSync(path.join(src, 'release.json'), path.join(dest, 'release.json'));
}

/**
 * Copies the builds held by `fromApp` (its current one and its retained ones) into `toApp/releases/`, each verified against its release.json, and writes
 * `toApp/releases/index.json` ({ current: toCommit, retained }). A build that fails is left out and said so. The same function serves upgrade and rollback.
 * @returns {{kept: string[], left_out: {commit: string, reason: string}[]}} `kept` is the retained list as written.
 */
export function carryHeldBuilds({fromApp, toApp, toCommit, keep = DEFAULT_KEEP_BUILDS, log = () => {}, afterCopy = () => {}}) {
  const limit = Math.max(keep - 1, 0);
  const releases = path.join(toApp, 'releases');
  fs.mkdirSync(releases, {recursive: true});
  const carried = [], leftOut = [];
  for (const commit of heldCommits(fromApp)) {
    if (commit === toCommit || carried.includes(commit)) continue;
    if (carried.length >= limit) { leftOut.push({commit, reason: `more than ${keep} builds would be held`}); continue; }
    const dest = path.join(releases, commit);
    if (isDir(dest) && !verifyBuild(toApp, commit).length) { carried.push(commit); continue; } // already there and sound
    const tmp = path.join(releases, '.tmp-' + commit);
    rmrf(tmp);
    try {
      copyBuild(path.join(fromApp, 'releases', commit), tmp, commit);
      rmrf(dest); // an unsound folder of that name is replaced by the verified copy
      fs.renameSync(tmp, dest);
    } catch (error) {
      rmrf(tmp);
      const reason = error.code === 'ENOENT' ? 'its folder is missing' : error.message;
      leftOut.push({commit, reason});
      log(`Left out build ${short(commit)}: ${reason}.`);
      continue;
    }
    carried.push(commit);
    log(`Kept build ${short(commit)}.`);
    afterCopy(commit);
  }
  // builds the target already holds and lists itself (a rollback into a release that kept some), after the carried ones: the oldest go first when there are too many
  let own = [];
  try { own = readIndex(toApp).retained; } catch { /* no usable index of its own */ }
  const retained = [...carried];
  for (const commit of own) {
    if (commit === toCommit || retained.includes(commit)) continue;
    if (verifyBuild(toApp, commit).length) { log(`Dropped build ${short(commit)} from the list: its files are not sound.`); continue; }
    retained.push(commit);
  }
  while (retained.length > limit) { const dropped = retained.pop(); leftOut.push({commit: dropped, reason: `more than ${keep} builds would be held`}); }
  writeAtomic(path.join(releases, 'index.json'), JSON.stringify({current: toCommit, retained}) + '\n');
  return {kept: retained, left_out: leftOut};
}

// ---- the switch ---------------------------------------------------------------------------------------------------------------------------------------------
const launcherFormatOf = (text) => { const m = /^\/\/ launcher-format: (\d+)/.exec(text); return m ? Number(m[1]) : 0; };

function installLauncher(root, releaseDir, log) {
  const src = path.join(releaseDir, 'plc.mjs');
  if (!isFile(src)) { log('This release has no plc.mjs, so the launcher is not changed.'); return; }
  const bytes = fs.readFileSync(src);
  const dst = at(root, 'plc.mjs');
  if (isFile(dst) && launcherFormatOf(fs.readFileSync(dst, 'utf8')) >= launcherFormatOf(bytes.toString('utf8'))) return;
  writeAtomic(dst, bytes, 0o755);
  log('Wrote plc.mjs, the launcher: node plc.mjs runs the installed release.');
}

function linkCurrent(root, release) {
  const tmp = at(root, `current.tmp-${process.pid}-${++counter}`);
  try { fs.symlinkSync(path.join('releases', release), tmp); fs.renameSync(tmp, at(root, 'current')); } catch { rmrf(tmp); /* a convenience only: current.json is the truth */ }
}

function switchTo({root, entering, previous, call, log}) {
  call('switch-before');
  const record = {format: CURRENT_FORMAT, release: entering.release, version: entering.version, target: entering.target, commit: entering.commit, previous, switchedAt: new Date().toISOString()};
  writeAtomic(at(root, 'current.json'), JSON.stringify(record, null, 1) + '\n');
  call('switch-after');
  linkCurrent(root, entering.release);
  installLauncher(root, entering.releaseDir, log);
}

const entering = (release, commit, releaseDir) => ({release, ...parseRelease(release), commit, releaseDir});

/** Renames the damaged current.json to current.json.unusable-<UTC time>, with -2, -3... when that name exists. Never deletes it. */
function moveAside(root, damaged, log) {
  const stamp = new Date().toISOString().replace(/\.\d+Z$/, 'Z').replace(/[-:]/g, '');
  const base = `current.json.unusable-${stamp}`;
  let name = base;
  for (let i = 2; exists(at(root, name)); i++) name = `${base}-${i}`;
  fs.renameSync(damaged.file, at(root, name));
  log(`${damaged.file} cannot be used: ${damaged.why}. It was moved aside as ${name} (nothing is deleted); this install makes the first release live again.`);
}

function finish(root, log, result, compat) {
  if (compat && typeof compat.stepBack === 'string') log(`Stepping back: ${compat.stepBack}.`);
  log('If the server is running, restart it to use this release\'s serve.mjs; the files it serves change at once.');
  return result;
}

// ---- upgrade ------------------------------------------------------------------------------------------------------------------------------------------------
function parseSums(text, name) {
  for (const line of text.split(/\r?\n/)) {
    const m = /^([0-9a-fA-F]{64}) [ *](.+)$/.exec(line);
    if (m && m[2] === name) return m[1].toLowerCase();
  }
  return null;
}

function resolveSource(source, sha256, log) {
  const file = path.resolve(source);
  let info;
  try { info = fs.statSync(file); } catch { refuse(`${source} does not exist. Give the release zip, or the folder you unpacked it into.`); }
  if (info.isDirectory()) {
    if (!parseFolderName(path.basename(file))) refuse(`The folder is called "${path.basename(file)}", but an unpacked release is called private-local-chat-<version>-<app|runkit>. Use the folder as it was unpacked.`);
    return {kind: 'folder', dir: file, name: path.basename(file)};
  }
  const name = path.basename(file);
  let expected = null;
  if (sha256 !== undefined && sha256 !== null) {
    expected = String(sha256).trim().toLowerCase();
    if (!HEX64.test(expected)) refuse('--sha256 must be the 64 hexadecimal digits of the zip\'s SHA-256.');
  } else {
    const sums = path.join(path.dirname(file), 'SHA256SUMS');
    if (isFile(sums)) expected = parseSums(fs.readFileSync(sums, 'utf8'), name);
    if (!expected) refuse(`${name} has no checksum to compare with. Put the release's SHA256SUMS file in the same folder as the zip, or pass --sha256 <the 64 digits from the release page>. To check a download yourself run "sha256sum -c SHA256SUMS" in that folder (docs/RELEASING.md in the project).`);
  }
  const actual = sha256Of(fs.readFileSync(file));
  if (actual !== expected) refuse(`${name} does not match its checksum (expected ${expected}, got ${actual}). The download is damaged or is not the release it claims to be: download it again.`);
  log(`Checked ${name} against its SHA-256.`);
  return {kind: 'zip', file, name};
}

/** Copies a folder of plain files and folders; a link or special file is refused. */
function copyTree(src, dst) {
  fs.mkdirSync(dst, {recursive: true});
  for (const entry of fs.readdirSync(src, {withFileTypes: true})) {
    const from = path.join(src, entry.name), to = path.join(dst, entry.name);
    if (entry.isDirectory()) copyTree(from, to);
    else if (entry.isFile()) fs.copyFileSync(from, to);
    else refuse(`${from} is a link or a special file. A release holds only files and folders: unpack it again from its zip.`);
  }
}

/**
 * Installs a release (a zip with its checksum, or an unpacked folder) into the root and makes it the live one. A root with no current.json is a first install.
 * `hooks` are test fault points: functions keyed by step name (start, extract, verify, carry, carry-copy, check, rename, switch-before, switch-after), each called just after
 * that step; one that throws stands for a process that died there. The command line never sets them.
 */
export async function upgrade({root, source, sha256, force = false, hooks = {}, log = () => {}} = {}) {
  if (!root) refuse('upgrade needs the operator folder (--root).');
  if (!source) refuse('upgrade needs a release: a zip file or an unpacked release folder.');
  root = path.resolve(root);
  if (exists(root) && !isDir(root)) refuse(`${root} is not a folder. Choose a folder that does not exist yet, or an operator folder.`);
  let current = null, damaged = null;
  try { current = readCurrent(root); } catch (error) { if (!(error instanceof UnusableCurrent)) throw error; damaged = error; }
  const call = (name, release) => hooks[name]?.({root, release});
  removeLeftovers(root, log);
  const src = resolveSource(source, sha256, log);
  if (src.kind === 'folder' && (root === src.dir || root.startsWith(src.dir + path.sep) || src.dir.startsWith(root + path.sep + 'releases' + path.sep + '.incoming-'))) {
    refuse(`The operator folder ${root} is inside the release folder ${src.dir}. Choose a folder outside it, such as /srv/plc.`);
  }
  ensureLayout(root, log);
  const guess = parseFolderName(src.name.replace(/\.zip$/, ''));
  call('start', guess ? `${guess.version}-${guess.target}` : null);

  const incoming = at(root, 'releases', `.incoming-${guess ? `${guess.version}-${guess.target}` : 'release'}-${process.pid}-${++counter}`);
  try {
    // 2. extract
    if (src.kind === 'zip') {
      try { extractZip(src.file, incoming); } catch (error) { rmrf(incoming); refuse(`${src.name} cannot be installed: ${error.message}`); }
    } else copyTree(src.dir, path.join(incoming, src.name));
    const tops = fs.readdirSync(incoming);
    const innerName = tops[0];
    const named = tops.length === 1 ? parseFolderName(innerName) : null;
    if (!named || !fs.lstatSync(path.join(incoming, innerName)).isDirectory()) refuse(`${src.name} must hold exactly one folder, private-local-chat-<version>-<app|runkit>, and nothing beside it${tops.length ? ` (it holds: ${tops.join(', ')})` : ''}.`);
    const inner = path.join(incoming, innerName);
    const {version, target} = named;
    const release = `${version}-${target}`;
    call('extract', release);

    // 3. verify
    const info = readJson(path.join(inner, 'app', 'version.json'), 'app/version.json');
    if (info.version !== version) refuse(`The folder is named for version ${version}, but its app/version.json says ${info.version}. This is not a release as it was published: download it again.`);
    const commit = info.commit;
    if (typeof commit !== 'string' || !HEX40.test(commit)) refuse('app/version.json does not name a commit. This is not a release as it was published: download it again.');
    const compat = readJson(path.join(inner, 'compat.json'), 'compat.json');
    if (compat.format !== COMPAT_FORMAT) refuse(`compat.json has format ${JSON.stringify(compat.format)}, not "${COMPAT_FORMAT}". This tool does not read it: use the serve.mjs of a newer release.`);
    if (compat.version !== version || compat.commit !== commit) refuse('compat.json names another version or commit than app/version.json. This is not a release as it was published: download it again.');
    if (!isFile(path.join(inner, 'app', 'releases', commit, 'release.json'))) refuse(`app/releases/${commit}/release.json is missing. This is not a complete release: download it again.`);
    if (!isFile(path.join(inner, 'serve.mjs'))) refuse('serve.mjs is missing from the release, so nothing could run it: download it again.');
    const dest = at(root, 'releases', release);
    // a damaged record is treated as a first install; the newest installed release stands in for it as the source of the builds that open tabs still use
    let heldFrom = current ? current.appDir : null;
    if (damaged) {
      const newest = installedReleases(root).at(-1);
      if (newest && newest.release !== release) { heldFrom = newest.appDir; log(`The held builds for tabs that are still open come from ${newest.release}, the newest installed release.`); }
    }
    let resume = false;
    if (exists(dest)) {
      let held = null;
      try { held = JSON.parse(fs.readFileSync(path.join(dest, 'app', 'version.json'), 'utf8')).commit; } catch { /* unreadable */ }
      if (held !== commit) refuse(`releases/${release} is already installed with another build (${held ? short(held) : 'one that cannot be read'}, not ${short(commit)}). A version is published once: if this is a different build, take the release that carries a new version; if releases/${release} is damaged, remove that folder (it is not the live one) and run this again.`);
      if (current?.release === release) {
        log(`${release} is already installed and live (commit ${short(commit)}): nothing to do.`);
        linkCurrent(root, release);
        installLauncher(root, current.releaseDir, log);
        rmrf(incoming);
        return {changed: false, release, previous: current.previous, kept: heldCommits(current.appDir).slice(1), left_out: []};
      }
      resume = true;
    }
    if (current && !force) {
      if (current.target !== target) refuse(`This is the ${target} release, and ${current.release} (the ${current.target} one) is installed. Their pages differ, so the tool does not switch between them by itself. Install the ${current.target} release, or add --force if you mean it.`);
      if (compareVersions(version, current.version) < 0) refuse(`${release} is older than the installed ${current.release}. To go back use --rollback; to install an older release anyway add --force.`);
      const oldest = compat.upgradesFrom?.oldest;
      if (typeof oldest === 'string' && VERSION_RE.test(oldest) && compareVersions(current.version, oldest) < 0) refuse(`${release} can only be installed over version ${oldest} or newer, and ${current.version} is installed. Install a release between them first (${oldest} or a later one that is older than ${version}), then this one; or add --force if you accept the risk to the saved data.`);
    }
    call('verify', release);

    let entered, kept, leftOut;
    if (resume) {
      // a run that stopped after the folder rename: prove the folder, finish the carry-over, switch
      log(`${release} is installed but was never made live: checking it and finishing the switch.`);
      const problems = checkApp(path.join(dest, 'app'), commit);
      if (problems.length) refuse(`releases/${release} is installed but does not check out:\n${listProblems(problems)}\nIt was not switched to. Remove that folder (it is not the live one) and run this again.`);
      call('check', release);
      if (heldFrom) ({kept, left_out: leftOut} = carryHeldBuilds({fromApp: heldFrom, toApp: path.join(dest, 'app'), toCommit: commit, log, afterCopy: () => call('carry-copy', release)}));
      else [kept, leftOut] = [heldCommits(path.join(dest, 'app')).slice(1), []];
      call('carry', release);
      entered = entering(release, commit, dest);
    } else {
      // 4. carry
      if (heldFrom) ({kept, left_out: leftOut} = carryHeldBuilds({fromApp: heldFrom, toApp: path.join(inner, 'app'), toCommit: commit, log, afterCopy: () => call('carry-copy', release)}));
      else [kept, leftOut] = [[], []];
      call('carry', release);
      // 5. check
      const problems = checkApp(path.join(inner, 'app'), commit);
      if (problems.length) refuse(`${release} does not check out, so nothing was changed:\n${listProblems(problems)}\nDownload the release again.`);
      call('check', release);
      // 6. rename
      if (exists(dest)) refuse(`releases/${release} appeared while this ran. Run the command again.`);
      fs.renameSync(inner, dest);
      call('rename', release);
      entered = entering(release, commit, dest);
    }
    // 7. switch; the damaged record is moved aside only now, so a refusal before this point changes nothing
    if (damaged) moveAside(root, damaged, log);
    const previous = current ? current.release : null;
    switchTo({root, entering: entered, previous, call: (name) => call(name, release), log});
    rmrf(incoming);
    log(`Installed ${release} (commit ${short(commit)})${previous ? `; the one before it, ${previous}, is kept for --rollback` : ''}.`);
    if (kept.length) log(`Held builds of earlier releases, for tabs that are still open: ${kept.map(short).join(', ')}.`);
    return finish(root, log, {changed: true, release, previous, kept, left_out: leftOut}, compat);
  } catch (error) {
    if (error instanceof Refusal) rmrf(incoming); // a refusal changed nothing; a crash leaves the folder for the next run to remove
    throw error;
  }
}

// ---- rollback -----------------------------------------------------------------------------------------------------------------------------------------------
/** Goes back to the previous release, or to `to` (a version, <version>-<target>, or an installed release folder name). Needs no checksum and no --force. */
export async function rollback({root, to, hooks = {}, log = () => {}} = {}) {
  if (!root) refuse('rollback needs the operator folder (--root).');
  root = path.resolve(root);
  const current = readCurrent(root);
  if (!current) refuse(`Nothing is installed in ${root}, so there is nothing to roll back.`);
  removeLeftovers(root, log);
  const installed = installedReleases(root);
  let wanted = to;
  if (wanted === undefined || wanted === null) {
    if (!current.previous) refuse(`${current.release} is the only release that was ever live here, so there is nothing to go back to. Name a release with --rollback <version> (installed: ${installed.map((r) => r.release).join(', ')}).`);
    wanted = current.previous;
  }
  let match = installed.filter((r) => r.release === wanted);
  if (!match.length) match = installed.filter((r) => r.version === wanted);
  if (!match.length) refuse(`${wanted} is not installed. Installed: ${installed.map((r) => r.release).join(', ') || 'nothing'}. Install it first with --upgrade ... --force.`);
  if (match.length > 1) refuse(`Version ${wanted} is installed for more than one target (${match.map((r) => r.release).join(', ')}). Name one of them in full.`);
  const target = match[0];
  if (target.release === current.release) refuse(`${target.release} is the release that is live already. Name an earlier one with --rollback <version>.`);
  const call = (name) => hooks[name]?.({root, release: target.release});
  call('start');
  call('verify');
  const problems = checkApp(target.appDir, target.commit);
  if (problems.length) refuse(`${target.release} does not check out, so it was not switched to:\n${listProblems(problems)}`);
  call('check');
  const {kept, left_out: leftOut} = carryHeldBuilds({fromApp: current.appDir, toApp: target.appDir, toCommit: target.commit, log, afterCopy: () => call('carry-copy')});
  call('carry');
  switchTo({root, entering: entering(target.release, target.commit, target.releaseDir), previous: current.release, call, log});
  log(`Rolled back from ${current.release} to ${target.release} (commit ${short(target.commit)}).`);
  if (kept.length) log(`Held builds, for tabs that are still open: ${kept.map(short).join(', ')}.`);
  return finish(root, log, {changed: true, release: target.release, previous: current.release, kept, left_out: leftOut}, null);
}

// ---- prune --------------------------------------------------------------------------------------------------------------------------------------------------
/** Removes the oldest installed releases until at most `keep` remain, never the live one or the one before it, and never a folder that is not an installed release. */
export async function prune({root, keep = DEFAULT_KEEP_RELEASES, log = () => {}} = {}) {
  if (!root) refuse('prune needs the operator folder (--root).');
  if (!Number.isInteger(keep) || keep < 1) refuse('--keep must be a whole number of releases, 1 or more. The live release is always kept.');
  root = path.resolve(root);
  const current = readCurrent(root);
  if (!current) refuse(`Nothing is installed in ${root}.`);
  removeLeftovers(root, log);
  const installed = installedReleases(root);
  let count = installed.length;
  const removed = [];
  for (const r of installed) { // oldest first
    if (count <= keep) break;
    if (r.release === current.release || r.release === current.previous) continue;
    const info = fs.lstatSync(r.releaseDir);
    if (!info.isDirectory()) continue;
    rmrf(at(root, 'releases', r.release));
    removed.push(r.release);
    count--;
    log(`Removed ${r.release}.`);
  }
  if (!removed.length) log('Nothing to remove.');
  if (count > keep) log(`${count} releases remain: the live one and the one before it are never removed.`);
  return {removed, kept: installedReleases(root).map((r) => r.release)};
}

// ---- check --------------------------------------------------------------------------------------------------------------------------------------------------
async function importFrom(appDir, commit, file) {
  const target = path.join(appDir, 'releases', commit, ...file.split('/'));
  if (!isFile(target)) return null;
  return import(pathToFileURL(target).href);
}

async function checkOperatorFiles(root, current, problems, notes) {
  for (const [name, validator, module, file] of [['app-config.json', 'checkAppConfig', 'runtime/config/app-config.mjs'], ['site.json', 'checkSiteJson', 'chat/site/site-links.mjs']].map(([n, v, m]) => [n, v, m, at(root, 'config', n)])) {
    if (!exists(file)) continue;
    let raw;
    try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) { problems.push(`config/${name} is not valid JSON (${error.message})`); continue; }
    let mod;
    try { mod = await importFrom(current.appDir, current.commit, module); } catch (error) { problems.push(`config/${name} cannot be checked: the release's own ${module} does not load (${error.message})`); continue; }
    if (!mod || typeof mod[validator] !== 'function') { problems.push(`config/${name} cannot be checked: this release has no ${module}`); continue; }
    const found = mod[validator](raw);
    for (const p of found) problems.push(`config/${name}: ${p}`);
    if (found.length) continue;
    if (name === 'app-config.json') notes.push(`Model files will come from ${raw.modelSources.map((s) => `${s.label} (${s.base})`).join(', ')}, as config/app-config.json says.`);
    else {
      const pages = Object.entries(raw.pages || {}).map(([k, v]) => `${k} -> ${v}`);
      notes.push(`Links will be those of config/site.json: ${pages.length ? pages.join(', ') : 'no pages'}${raw.site ? `; the site is ${raw.site.url}` : '; no site identity'}.`);
    }
  }
  if (!exists(at(root, 'config', 'app-config.json'))) notes.push('Model files will come from the source this release ships (no config/app-config.json).');
  if (!exists(at(root, 'config', 'site.json'))) notes.push('Links will be those this release ships (no config/site.json).');
}

function checkPages(root, current, problems, notes) {
  const dir = at(root, 'pages');
  if (!isDir(dir)) return;
  const taken = new Set([...fs.readdirSync(current.appDir), 'models']);
  const pages = fs.readdirSync(dir, {withFileTypes: true}).filter((e) => e.isDirectory() && !e.name.startsWith('.') && isFile(path.join(dir, e.name, 'index.html'))).map((e) => e.name).sort();
  for (const name of pages) {
    if (taken.has(name) && !OWN_PAGES.includes(name)) problems.push(`pages/${name} has the name of "${name}" in the release, so the server ignores it. Rename the folder.`);
  }
  notes.push(pages.length ? `Pages: ${pages.join(', ')}.` : 'No pages of your own.');
}

function checkModels(root, current, deep, problems, notes) {
  const manifestFile = path.join(current.releaseDir, 'models.json');
  if (!isFile(manifestFile)) return;
  const modelsDir = at(root, 'models');
  if (!isDir(modelsDir)) { notes.push('No models/ folder: no model files are held here.'); return; }
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')); } catch (error) { problems.push(`models.json cannot be read (${error.message})`); return; }
  const groups = [...Object.entries(manifest.tiers || {}), ...Object.entries(manifest.voices || {}).map(([id, files]) => ['voice ' + id, files])];
  for (const [name, files] of groups) {
    if (!Array.isArray(files)) continue;
    let present = 0;
    for (const f of files) {
      if (unsafePath(f.path)) { problems.push(`models.json names a path that is not allowed: ${JSON.stringify(f.path)}`); continue; }
      const file = path.join(modelsDir, ...f.path.split('/'));
      let info;
      try { info = fs.lstatSync(file); } catch { continue; }
      if (!info.isFile() || info.size !== f.bytes) continue;
      if (deep && sha256Of(fs.readFileSync(file)) !== f.sha256) { problems.push(`models/${f.path} has the right size but its SHA-256 differs: delete it and fetch it again`); continue; }
      present++;
    }
    notes.push(`Models, ${name}: ${present} of ${files.length} files present${deep ? ' and verified' : ' with the right size'}.`);
  }
}

/** The health of a root. `online` makes one request for the public release list; nothing else here touches the network. */
export async function check({root, deep = false, online = false, fetchImpl = globalThis.fetch, log = () => {}} = {}) {
  if (!root) refuse('check needs the operator folder (--root).');
  root = path.resolve(root);
  const problems = [], notes = [];
  const report = () => {
    log(`Checked ${root}`);
    for (const p of problems) log(`PROBLEM: ${p}`);
    for (const n of notes) log(`note: ${n}`);
    log(problems.length ? `Not healthy: ${problems.length} problem${problems.length === 1 ? '' : 's'}.` : 'Healthy.');
    return {ok: problems.length === 0, problems, notes};
  };
  let current;
  try { current = readCurrent(root); } catch (error) { problems.push(error.message); return report(); }
  if (!current) { problems.push(`Nothing is installed in ${root} (there is no current.json). Make the first install: node serve.mjs --upgrade <release folder or zip> --root ${root}`); return report(); }
  notes.push(`Live: ${current.release} (commit ${short(current.commit)})${current.previous ? `, before it ${current.previous}` : ''}.`);
  if (!installedReleases(root).some((r) => r.release === current.release)) problems.push(`releases/${current.release} is not a valid release (its app/version.json is missing or does not match).`);
  else for (const p of checkApp(current.appDir, current.commit)) problems.push(p);
  try {
    const link = at(root, 'current');
    if (fs.lstatSync(link).isSymbolicLink()) { if (path.resolve(root, fs.readlinkSync(link)) !== current.releaseDir) notes.push(`The "current" link points to ${fs.readlinkSync(link)}, not to the live release; current.json is what counts.`); }
    else notes.push('"current" is not a link; current.json is what counts.');
  } catch { /* no link: it is optional */ }
  await checkOperatorFiles(root, current, problems, notes);
  checkPages(root, current, problems, notes);
  checkModels(root, current, deep, problems, notes);
  const releases = at(root, 'releases');
  const left = fs.readdirSync(releases).filter((n) => n.startsWith('.incoming-'));
  if (left.length) notes.push(`Left by a run that stopped: ${left.join(', ')}. The next command removes them.`);
  if (online) {
    try {
      const response = await fetchImpl(RELEASE_LIST_URL, {headers: {'User-Agent': 'private-local-chat-check'}, signal: AbortSignal.timeout(15000)});
      if (!response.ok) throw new Error(`the release list answered ${response.status}`);
      const latest = String((await response.json()).tag_name || '').replace(/^v/, '');
      if (!VERSION_RE.test(latest)) throw new Error('the release list names no version');
      notes.push(compareVersions(latest, current.version) > 0 ? `A newer release exists: ${latest} (installed: ${current.version}).` : `This is the newest release (${current.version}).`);
    } catch (error) { notes.push(`Could not read the release list: ${error.message}. Nothing is wrong with this copy.`); }
  }
  return report();
}

// ---- the command line (serve.mjs hands over here when it is given one of these options) ----------------------------------------------------------------

function parseArgs(argv) {
  const o = {};
  const values = new Set(['--root', '--upgrade', '--sha256', '--keep', '--host', '--port', '--dir']);
  const flags = new Set(['--force', '--check', '--deep', '--online', '--prune']);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const key = a.replace(/^--/, '');
    if (!a.startsWith('--') || !(values.has(a) || flags.has(a) || a === '--rollback')) refuse(`${a} is not an option that goes with --root. See docs/RUN-IT.md.`);
    if (key in o) refuse(`${a} was given twice.`);
    if (flags.has(a)) o[key] = true;
    else if (a === '--rollback') o[key] = argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    else { if (argv[i + 1] === undefined || argv[i + 1].startsWith('--')) refuse(`${a} needs a value.`); o[key] = argv[++i]; }
  }
  return o;
}

/** Runs one command, or starts the server on the live release. Resolves the exit code, or null when a server was started. */
export async function runCli(argv, {startServer, stdout = (l) => console.log(l), stderr = (l) => console.error(l), env = process.env} = {}) {
  try {
    const o = parseArgs(argv);
    const commands = ['upgrade', 'rollback', 'check', 'prune'].filter((c) => c in o);
    if (commands.length > 1) refuse(`Use one command at a time; ${commands.map((c) => '--' + c).join(' and ')} were both given.`);
    if (!o.root) refuse('This needs --root <operator folder>, for example: node serve.mjs --upgrade . --root /srv/plc');
    const command = commands[0];
    if (command && ('host' in o || 'port' in o || 'dir' in o)) refuse(`--host, --port and --dir are for serving; they do not go with --${command}.`);
    if (!command && 'dir' in o) refuse('--dir does not go with --root: the folder served is the live release\'s app.');
    for (const [opt, owner] of [['sha256', 'upgrade'], ['force', 'upgrade'], ['deep', 'check'], ['online', 'check'], ['keep', 'prune']]) if (opt in o && command !== owner) refuse(`--${opt} goes with --${owner} only.`);
    if (command === 'upgrade') { if (o.upgrade === undefined) refuse('--upgrade needs a release: a zip file or an unpacked folder.'); await upgrade({root: o.root, source: o.upgrade, sha256: o.sha256, force: o.force === true, log: stdout}); return 0; }
    if (command === 'rollback') { await rollback({root: o.root, to: o.rollback === true ? undefined : o.rollback, log: stdout}); return 0; }
    if (command === 'check') return (await check({root: o.root, deep: o.deep === true, online: o.online === true, log: stdout})).ok ? 0 : 1;
    if (command === 'prune') {
      if ('keep' in o && !/^\d+$/.test(o.keep)) refuse('--keep must be a whole number of releases, 1 or more.');
      await prune({root: o.root, keep: 'keep' in o ? Number(o.keep) : DEFAULT_KEEP_RELEASES, log: stdout});
      return 0;
    }
    const current = readCurrent(o.root);
    if (!current) refuse(`Nothing is installed in ${path.resolve(o.root)}. Make the first install from an unpacked release: node serve.mjs --upgrade . --root ${path.resolve(o.root)}`);
    const port = Number(o.port || env.PORT || 18171);
    stdout(`Live release: ${current.release}`);
    await startServer({root: o.root, host: o.host || env.HOST || '127.0.0.1', port});
    return null;
  } catch (error) {
    stderr(error.message);
    return 1;
  }
}
