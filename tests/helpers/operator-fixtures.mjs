// Small valid release folders, made without running the real build, for tests/operator.test.mjs. A test mutates them to make damaged releases.
import {mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, copyFileSync, readlinkSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {toPagesHeaders} from '../../scripts/headers.mjs';
import {buildCompat} from '../../scripts/compat.mjs';
import {makeZip, writeSums} from '../../scripts/package-release.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const TOOLS = ['serve.mjs', 'headers.mjs', 'zip.mjs', 'operator.mjs', 'plc.mjs'];
export const commitOf = (n) => String(n).padStart(2, '0').repeat(20); // a valid 40-digit hash, a different one per n
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export const scratchDir = (prefix = 'plc-operator-') => mkdtempSync(path.join(tmpdir(), prefix));
export const removeDir = (dir) => rmSync(dir, {recursive: true, force: true});

const write = (file, data) => { mkdirSync(path.dirname(file), {recursive: true}); writeFileSync(file, data); };

/** The files of one build folder app/releases/<commit>: they differ per commit, and the two modules the operator's checks load are the real ones. */
export function buildFiles(commit) {
  const real = (file) => readFileSync(path.join(repo, file));
  return {
    'assets/main.js': Buffer.from(`// build ${commit}\nexport const commit = '${commit}';\n`),
    'assets/data.bin': Buffer.from(Array.from({length: 600}, (_, i) => (i * 31 + commit.charCodeAt(0)) % 251)),
    'sub/dir/notes.txt': Buffer.from('notes of ' + commit + '\n'),
    'runtime/config/app-config.mjs': real('runtime/config/app-config.mjs'),
    'chat/site/site-links.mjs': real('chat/site/site-links.mjs')
  };
}

/** Writes app/releases/<commit>/ with its release.json (the shape scripts/build.mjs writes). */
export function writeBuild(appDir, commit) {
  const dir = path.join(appDir, 'releases', commit);
  const files = buildFiles(commit);
  const entries = Object.keys(files).sort().map((p) => { write(path.join(dir, p), files[p]); return {path: p, bytes: files[p].length, sha256: sha256(files[p])}; });
  write(path.join(dir, 'release.json'), JSON.stringify({commit, files: entries}, null, 1) + '\n');
}

/** private-local-chat-<version>-<target>/ under `dir`, with `held` as the commits of earlier builds the release already carries. Returns the folder. */
export async function makeRelease({dir, version, target = 'runkit', commit, held = []}) {
  const folder = path.join(dir, `private-local-chat-${version}-${target}`);
  const app = path.join(folder, 'app');
  write(path.join(app, 'index.html'), `<!doctype html><title>${version}</title>`);
  write(path.join(app, 'sw.js'), '// worker ' + commit);
  write(path.join(app, 'version.json'), JSON.stringify({version, commit, environment: 'release'}) + '\n');
  write(path.join(app, '_headers'), toPagesHeaders());
  write(path.join(app, 'manifest.webmanifest'), '{}');
  write(path.join(app, '404.html'), 'Not found');
  write(path.join(app, 'brand', 'mark.svg'), '<svg/>');
  if (target === 'runkit') write(path.join(app, 'help', 'index.html'), 'help');
  for (const c of [commit, ...held]) writeBuild(app, c);
  write(path.join(app, 'releases', 'index.json'), JSON.stringify({current: commit, retained: held}) + '\n');
  for (const tool of TOOLS) copyFileSync(path.join(repo, 'scripts', tool), path.join(folder, tool));
  const compat = await buildCompat({version, commit});
  compat.upgradesFrom.oldest = '0.0.1'; // the real oldest is the oldest data snapshot's release; a test that needs a stepping stone sets it
  write(path.join(folder, 'compat.json'), JSON.stringify(compat, null, 1) + '\n');
  write(path.join(folder, 'README.md'), 'A test release.\n');
  return folder;
}

/** Every file under `dir` as { relative path: sha256 }, to compare two states byte for byte. */
export function tree(dir) {
  const out = {};
  const walk = (d) => { for (const e of readdirSync(d, {withFileTypes: true})) { const p = path.join(d, e.name); const rel = path.relative(dir, p).split(path.sep).join('/'); if (e.isSymbolicLink()) out[rel] = 'link:' + readlinkSync(p); else if (e.isDirectory()) walk(p); else out[rel] = sha256(readFileSync(p)); } };
  walk(dir);
  return out;
}

/** Writes `zipPath` from a release folder, and a SHA256SUMS for it beside it. */
export async function zipRelease(folder, zipPath) {
  const top = path.basename(folder);
  const entries = [];
  const walk = (d) => { for (const e of readdirSync(d, {withFileTypes: true})) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else entries.push({name: `${top}/${path.relative(folder, p).split(path.sep).join('/')}`, data: readFileSync(p), mode: statSync(p).mode & 0o100 ? 0o755 : 0o644}); } };
  walk(folder);
  mkdirSync(path.dirname(zipPath), {recursive: true});
  writeFileSync(zipPath, makeZip(entries, 1762927272));
  await writeSums(path.dirname(zipPath), [path.basename(zipPath)]);
  return zipPath;
}
