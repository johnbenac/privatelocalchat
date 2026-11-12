#!/usr/bin/env node
// Packs a release: one zip per target a person can download (docs/RELEASING.md).
//
//   node scripts/package-release.mjs --target app|runkit --version 0.64.0 [--commit SHA] [--out DIR] [--time EPOCH_SECONDS]
//   node scripts/package-release.mjs sums DIR [FILE...]       write DIR/SHA256SUMS in the format `sha256sum -c` reads
//
// The zip private-local-chat-<version>-<target>.zip holds one folder, private-local-chat-<version>-<target>/:
//   app/              the output of the target, exactly (TARGET=<target> RELEASE_VERSION=<version>)
//   serve.mjs, headers.mjs, zip.mjs ...   the tools (RELEASE_TOOLS below); they need only Node.js
//   models.json       every model file the app can download, with size and SHA-256 (scripts/models-manifest.mjs)
//   README.md         how to run the folder
//   LICENSE, THIRD-PARTY-NOTICES.md
//   SOURCE.txt        where the source of this exact build is, and how to rebuild it
//   compat.json       what this build reads and writes (scripts/compat.mjs), when that script exists
//
// The zip is deterministic: entries sorted by name, times fixed to the commit's time, fixed modes, no extra fields, written here with node:zlib and no zip program.
// The same commit gives the same bytes on the same Node and zlib; another zlib may compress to different bytes with the same contents.
import {execFileSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync} from 'node:fs';
import {readdir, readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {deflateRawSync, crc32} from 'node:zlib';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildModelsManifest, modelsManifestText} from './models-manifest.mjs';

export const REPOSITORY = 'https://github.com/johnbenac/privatelocalchat';
export const TARGETS = ['app', 'runkit'];
// The files under scripts/ that are copied into the zip root, one name per line. They run with only Node.js. serve.mjs is the one that is run directly.
export const RELEASE_TOOLS = [
  'serve.mjs',
  'headers.mjs',
  'zip.mjs',
  'fetch-models.mjs',
  'operator.mjs',
  'overlay.mjs',
  'plc.mjs'
];
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

export const folderName = (version, target) => `private-local-chat-${version}-${target}`;
export const zipName = (version, target) => folderName(version, target) + '.zip';

// ---- the zip format ---------------------------------------------------------------------------------------------------------------------------------
const dosTime = (epoch) => {
  const d = new Date(Math.max(epoch, 315532800) * 1000); // not before 1980
  return {time: (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | (d.getUTCSeconds() >> 1), date: ((d.getUTCFullYear() - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate()};
};

/** A zip of `entries` [{name, data: Buffer, mode}], sorted by name, with every time set to `epoch`. No zip64: the sizes are far below 4 GB. */
export function makeZip(entries, epoch) {
  const sorted = [...entries].sort((a, b) => Buffer.compare(Buffer.from(a.name), Buffer.from(b.name)));
  if (sorted.length >= 0xffff) throw new Error('Too many files for a plain zip');
  const {time, date} = dosTime(epoch);
  const parts = [], central = [];
  let offset = 0;
  for (const entry of sorted) {
    if (entry.data.length >= 0xffffffff) throw new Error(entry.name + ' is too large for a plain zip');
    const name = Buffer.from(entry.name, 'utf8');
    const deflated = entry.data.length ? deflateRawSync(entry.data, {level: 9}) : entry.data;
    const stored = entry.data.length === 0 || deflated.length >= entry.data.length;
    const body = stored ? entry.data : deflated, method = stored ? 0 : 8;
    const crc = crc32(entry.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10); local.writeUInt16LE(date, 12); local.writeUInt32LE(crc, 14); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
    const head = Buffer.alloc(46);
    head.writeUInt32LE(0x02014b50, 0); head.writeUInt16LE((3 << 8) | 20, 4); head.writeUInt16LE(20, 6); head.writeUInt16LE(0x0800, 8); head.writeUInt16LE(method, 10);
    head.writeUInt16LE(time, 12); head.writeUInt16LE(date, 14); head.writeUInt32LE(crc, 16); head.writeUInt32LE(body.length, 20); head.writeUInt32LE(entry.data.length, 24);
    head.writeUInt16LE(name.length, 28); head.writeUInt16LE(0, 30); head.writeUInt16LE(0, 32); head.writeUInt16LE(0, 34); head.writeUInt16LE(0, 36);
    head.writeUInt32LE(((0o100000 | entry.mode) << 16) >>> 0, 38); head.writeUInt32LE(offset, 42);
    central.push(head, name);
    parts.push(local, name, body);
    offset += 30 + name.length + body.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(sorted.length, 8); end.writeUInt16LE(sorted.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, directory, end]);
}

// ---- the texts ---------------------------------------------------------------------------------------------------------------------------------------
export function readmeText({version, target}) {
  const pages = target === 'runkit' ? 'It includes a Help page and an About page that make no claims about who runs it. Edit run-kit pages in the source if you want your own.' : 'It is the app and nothing else: no Help, About or other page, and the app draws no link to one.';
  return `# Private Local Chat ${version} (${target})

This folder is a copy of Private Local Chat that you run yourself. Everything a person does with it stays in their browser, so running a copy never holds anyone's chats, documents or settings. ${pages}

You need Node.js 20 or newer and nothing else.

## Try it at once

    node serve.mjs

Then open http://127.0.0.1:18171 in a browser. \`node serve.mjs --port 8080\` changes the port. The server logs nothing about requests. Nothing is installed and nothing outside this folder is written.

## Install it as an operator folder

To keep your own settings, pages and model files, and to upgrade and go back later, install this release into a folder of your own (here /srv/plc; it is made if it does not exist):

    node serve.mjs --upgrade . --root /srv/plc

The folder keeps every release you install, and \`config/\`, \`pages/\` and \`models/\` that an upgrade never touches. From then on you run the launcher it holds, not this folder:

    node /srv/plc/plc.mjs                      start the server
    node /srv/plc/plc.mjs --upgrade NEW.zip    install a newer release (SHA256SUMS beside the zip)
    node /srv/plc/plc.mjs --rollback           go back to the release before
    node /srv/plc/plc.mjs --check              say whether the folder is healthy

An upgrade or a rollback does not break a browser tab that is open. Restart the server afterwards so that it runs the new release's own server file.

## The full guide

The project's docs/RUN-IT.md has all of it: settings (\`config/app-config.json\`, \`config/site.json\`), your own pages, fetching model files to run from your own disk (\`fetch-models.mjs\`), \`--prune\`, running under a service manager, and how to check a download. This folder has no docs folder; for the project, see SOURCE.txt.

## What this does not cover

- Your settings and pages apply only when this folder's \`serve.mjs\` (or plc.mjs) serves the copy. Behind another web server, \`app/\` is served as shipped: serve it with the headers in \`app/_headers\`.
- Your own pages are not saved for offline use: offline, their addresses open the app.
- These tools are for release zips. If you run a clone of the source, use git and the build.
- A release from before these tools existed cannot be installed with them.

## Other devices

The app's on-device features need a secure context: https, or http://localhost on the same computer. To use a copy from a phone, put https in front of it (a reverse proxy with a certificate, or a host that provides one). \`node serve.mjs --host 0.0.0.0\` makes the copy reachable from the network.

## Licence and source

Private Local Chat is free software under the GNU General Public License. \`LICENSE\` is the licence text, \`THIRD-PARTY-NOTICES.md\` lists the components and their licences, and \`SOURCE.txt\` says where the source of this exact build is and how to rebuild it.
`;
}

export function sourceText({version, target, commit, epoch}) {
  return `Source of Private Local Chat ${version} (${target})

Release:        v${version}
Commit:         ${commit}
Repository:     ${REPOSITORY}
Source archive: ${REPOSITORY}/archive/refs/tags/v${version}.tar.gz

The complete corresponding source of every GPL-covered part of this folder is that repository, which also contains the script that rebuilds the voice worker (ops/voice/, docs/VOICE-RUNTIME.md). THIRD-PARTY-NOTICES.md lists the components and their licences.

To rebuild app/ from the source (Node.js 20 or newer):

    git clone ${REPOSITORY}.git && cd privatelocalchat
    git checkout ${commit}
    npm ci
    TARGET=${target} RELEASE_VERSION=${version} DEPLOY_BRANCH=main GITHUB_SHA=${commit} SOURCE_DATE_EPOCH=${epoch} npm run build

The files are then in dist/ and are the files of app/.
`;
}

// ---- building and packing -----------------------------------------------------------------------------------------------------------------------------
async function filesOf(dir) {
  const files = [];
  async function walk(d) {
    for (const entry of await readdir(d, {withFileTypes: true})) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) files.push({rel: path.relative(dir, full).split(path.sep).join('/'), data: await readFile(full)});
    }
  }
  await walk(dir);
  return files;
}

const git = (...args) => execFileSync('git', args, {cwd: root, encoding: 'utf8'}).trim();

/** Builds `target` as the release `version` of `commit` (the commit checked out) and returns the entries of its folder. */
export async function releaseEntries({target, version, commit, epoch, workDir = root}) {
  const holder = mkdtempSync(path.join(workDir, '.tmp-release-')); // inside the repository, which is where the build writes (a test passes its own folder)
  try {
    const env = {...process.env};
    for (const key of ['TARGET', 'SITE_DIR', 'DEPLOY_BRANCH', 'GITHUB_REF_NAME', 'SITE_JSON_PATH', 'RELEASE_VERSION', 'APP_CONFIG_OVERRIDE']) delete env[key];
    execFileSync('node', ['scripts/build.mjs'], {cwd: root, stdio: 'pipe', env: {...env, TARGET: target, RELEASE_VERSION: version, DEPLOY_BRANCH: 'main', GITHUB_SHA: commit, SOURCE_DATE_EPOCH: String(epoch), BUILD_OUT_DIR: path.relative(root, holder)}});
    const folder = folderName(version, target);
    const entries = (await filesOf(holder)).map((f) => ({name: `${folder}/app/${f.rel}`, data: f.data, mode: 0o644}));
    const add = (name, data, mode = 0o644) => entries.push({name: `${folder}/${name}`, data: Buffer.isBuffer(data) ? data : Buffer.from(data), mode});
    for (const tool of RELEASE_TOOLS) add(tool, readFileSync(path.join(root, 'scripts', tool)), tool === 'serve.mjs' ? 0o755 : 0o644);
    add('README.md', readmeText({version, target}));
    add('LICENSE', readFileSync(path.join(root, 'LICENSE')));
    add('THIRD-PARTY-NOTICES.md', readFileSync(path.join(root, 'THIRD-PARTY-NOTICES.md')));
    add('SOURCE.txt', sourceText({version, target, commit, epoch}));
    add('models.json', modelsManifestText(await buildModelsManifest()));
    if (existsSync(path.join(root, 'scripts/compat.mjs'))) {
      const compat = execFileSync('node', ['scripts/compat.mjs', '--version', version, '--commit', commit], {cwd: root, encoding: 'utf8'});
      add('compat.json', compat);
    }
    return entries;
  } finally { rmSync(holder, {recursive: true, force: true}); }
}

/** Writes DIR/<zip> for one target and returns its path. */
export async function packageRelease({target, version, commit, outDir, epoch, workDir}) {
  if (!TARGETS.includes(target)) throw new Error(`--target must be one of ${TARGETS.join(', ')}`);
  if (!VERSION.test(version || '')) throw new Error('--version must be a version such as 1.2.3');
  const head = git('rev-parse', 'HEAD');
  commit ||= head;
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error('--commit must be a full commit hash');
  if (commit !== head) throw new Error(`The working tree is at ${head}, not at ${commit}: check out the commit to release first`);
  epoch ??= Number(git('show', '-s', '--format=%ct', commit));
  const zip = makeZip(await releaseEntries({target, version, commit, epoch, workDir}), epoch);
  mkdirSync(outDir, {recursive: true});
  const file = path.join(outDir, zipName(version, target));
  writeFileSync(file, zip);
  return file;
}

/** DIR/SHA256SUMS for the files named (default: every zip and compat.json in DIR), in the format `sha256sum -c` reads. */
export async function writeSums(dir, names) {
  const present = (await readdir(dir)).filter((n) => /\.zip$/.test(n) || n === 'compat.json');
  const list = (names?.length ? names : present).slice().sort();
  if (!list.length) throw new Error('Nothing to list in ' + dir);
  const lines = list.map((n) => `${createHash('sha256').update(readFileSync(path.join(dir, n))).digest('hex')}  ${n}`);
  writeFileSync(path.join(dir, 'SHA256SUMS'), lines.join('\n') + '\n');
  return lines;
}

async function cli(args) {
  if (args[0] === 'sums') {
    if (!args[1]) { console.error('Usage: package-release.mjs sums DIR [FILE...]'); return 2; }
    for (const line of await writeSums(args[1], args.slice(2))) console.log(line);
    return 0;
  }
  const opt = (name) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : undefined; };
  if (!opt('target') || !opt('version')) { console.error('Usage: package-release.mjs --target app|runkit --version X.Y.Z [--commit SHA] [--out DIR] [--time EPOCH]'); return 2; }
  const file = await packageRelease({target: opt('target'), version: opt('version'), commit: opt('commit'), outDir: path.resolve(opt('out') || 'release-assets'), epoch: opt('time') === undefined ? undefined : Number(opt('time'))});
  console.log(file);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  cli(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (error) => { console.error(error.message); process.exitCode = 1; });
}
