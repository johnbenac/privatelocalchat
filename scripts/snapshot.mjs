#!/usr/bin/env node
// A reproducible snapshot of what the build produces, and a report of how two snapshots differ.
//
//   node scripts/snapshot.mjs build [--out FILE]            build the site target and write its manifest
//   node scripts/snapshot.mjs diff BASELINE [CURRENT]       compare a manifest with the current build (or another manifest)
//   node scripts/snapshot.mjs compare REV                   build REV and the current tree, then show every changed file
//
// `diff` and `compare` accept --allow GLOB (repeatable) for changes a stage intends; any other change exits 1.
// The builds run with a fixed commit, branch and clock (SOURCE_DATE_EPOCH), so identical sources give identical manifests.
import {mkdir, readFile, writeFile, readdir, rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync, spawnSync} from 'node:child_process';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

export const FORMAT = 'plc-snapshot/1';
// Each target is the environment its build runs in. Only the site is built today; more targets are added here.
export const TARGETS = {
  site: {GITHUB_SHA: '0'.repeat(40), DEPLOY_BRANCH: 'main', SOURCE_DATE_EPOCH: '0'}
};

/** Build `target` into `dir` (a folder inside the repository at `root`). */
export function buildTo(dir, {root = process.cwd(), target = 'site'} = {}) {
  if (!TARGETS[target]) throw new Error('Unknown target: ' + target);
  const out = path.resolve(root, dir);
  if (!out.startsWith(root + path.sep)) throw new Error('The snapshot folder must be inside the repository');
  execFileSync(process.execPath, ['scripts/build.mjs'], {cwd: root, env: {...process.env, ...TARGETS[target], BUILD_OUT_DIR: path.relative(root, out)}, stdio: 'pipe'});
  return out;
}

async function listFiles(dir) {
  const files = [];
  async function walk(d) {
    for (const entry of await readdir(d, {withFileTypes: true})) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) await walk(p); else files.push(p);
    }
  }
  await walk(dir);
  return files.sort();
}

/** The manifest of a build folder: every file with its size and sha256. */
export async function manifestOf(dir, target = 'site') {
  const files = {};
  for (const file of await listFiles(dir)) {
    const bytes = await readFile(file);
    files[path.relative(dir, file).split(path.sep).join('/')] = {bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')};
  }
  return {format: FORMAT, target, environment: TARGETS[target], fileCount: Object.keys(files).length, files};
}

const globToRegExp = (glob) => new RegExp('^' + glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*') + '$');

/** What changed between two manifests. Paths that match an --allow glob are reported as allowed. */
export function diffManifests(baseline, current, allow = []) {
  const allowed = allow.map(globToRegExp);
  const result = {added: [], removed: [], changed: [], allowed: []};
  const record = (kind, file) => (allowed.some((rx) => rx.test(file)) ? result.allowed : result[kind]).push(file);
  for (const file of Object.keys(current.files)) {
    if (!baseline.files[file]) record('added', file);
    else if (baseline.files[file].sha256 !== current.files[file].sha256) record('changed', file);
  }
  for (const file of Object.keys(baseline.files)) if (!current.files[file]) record('removed', file);
  for (const kind of Object.keys(result)) result[kind].sort();
  return result;
}

export const isClean = (result) => !result.added.length && !result.removed.length && !result.changed.length;

export function formatReport(result) {
  const lines = [];
  for (const [title, kind] of [['Added', 'added'], ['Removed', 'removed'], ['Changed', 'changed'], ['Changed, but allowed', 'allowed']]) {
    if (!result[kind].length) continue;
    lines.push(title + ' (' + result[kind].length + ')');
    for (const file of result[kind]) lines.push('  ' + file);
  }
  return lines.length ? lines.join('\n') : 'No differences.';
}

const TEXT = /\.(mjs|js|html|css|json|xml|txt|md|webmanifest|svg)$/;

function flags(args) {
  const out = {positional: [], allow: [], out: null};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--allow') out.allow.push(args[++i]);
    else if (args[i] === '--out') out.out = args[++i];
    else out.positional.push(args[i]);
  }
  return out;
}

async function cli(argv) {
  const [command, ...rest] = argv;
  const {positional, allow, out} = flags(rest);
  const root = process.cwd();
  if (command === 'build') {
    const dir = buildTo('work/snapshot/site');
    const manifest = await manifestOf(dir);
    if (out) await writeFile(out, JSON.stringify(manifest, null, 1) + '\n');
    console.log('Built the site target: ' + manifest.fileCount + ' files' + (out ? ', manifest written to ' + out : ''));
    return 0;
  }
  if (command === 'diff') {
    const baseline = JSON.parse(await readFile(positional[0], 'utf8'));
    const current = positional[1] ? JSON.parse(await readFile(positional[1], 'utf8')) : await manifestOf(buildTo('work/snapshot/site'));
    const result = diffManifests(baseline, current, allow);
    console.log(formatReport(result));
    return isClean(result) ? 0 : 1;
  }
  if (command === 'compare') {
    const rev = positional[0];
    if (!rev) throw new Error('Usage: snapshot.mjs compare REV');
    const tree = path.join(root, 'work/snapshot/rev');
    await rm(tree, {recursive: true, force: true});
    await mkdir(tree, {recursive: true});
    // git archive extracts the revision without a working tree or hooks, so nothing is registered with git.
    execFileSync('sh', ['-c', 'git archive "$0" | tar -x -C "$1"', rev, tree], {stdio: 'pipe'});
    try {
      if (!(await readFile(path.join(tree, 'scripts/build.mjs'), 'utf8')).includes('SOURCE_DATE_EPOCH')) throw new Error(rev + ' predates the reproducible build, so its output cannot be compared byte for byte.');
      const baseDir = buildTo('out', {root: tree});
      const currentDir = buildTo('work/snapshot/site');
      const result = diffManifests(await manifestOf(baseDir), await manifestOf(currentDir), allow);
      console.log(formatReport(result));
      for (const file of [...result.changed, ...result.allowed.filter((f) => !result.added.includes(f))]) {
        if (!TEXT.test(file) || !(await readFile(path.join(baseDir, file)).then(() => true, () => false))) continue;
        const diff = spawnSync('diff', ['-u', '--label', 'baseline/' + file, '--label', 'current/' + file, path.join(baseDir, file), path.join(currentDir, file)], {encoding: 'utf8'});
        const lines = (diff.stdout || '').split('\n');
        console.log('\n' + lines.slice(0, 60).join('\n') + (lines.length > 60 ? '\n... ' + (lines.length - 60) + ' more lines' : ''));
      }
      return isClean(result) ? 0 : 1;
    } finally {
      await rm(tree, {recursive: true, force: true});
    }
  }
  console.error('Usage: snapshot.mjs build [--out FILE] | diff BASELINE [CURRENT] [--allow GLOB] | compare REV [--allow GLOB]');
  return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await cli(process.argv.slice(2));
