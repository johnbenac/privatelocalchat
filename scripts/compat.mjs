#!/usr/bin/env node
// compat.json: what a build reads and writes, produced from the code and never written by hand (docs/RELEASING.md, docs/DATA-COMPATIBILITY.md).
//
//   node scripts/compat.mjs [--version X.Y.Z] [--commit SHA] [--out FILE]       prints it (or writes it to FILE)
//
//   { "format": "plc-compat/1", "version", "commit",
//     "storedFormats": { key: n },     every key a browser keeps across visits: the key table of chat/vault/key-classes.mjs, without the session-only and test keys
//     "databases": { "plc-docs": n, "plc-vault": n },
//     "fileFormats": { name: { "writes": n, "reads": [..] } },       chat/transfer/file-formats.mjs
//     "snapshots": [releases whose saved data this build is tested to open],      tests/fixtures/data
//     "upgradesFrom": { "oldest", "note" },
//     "stepBack": "..." }
//
// `oldest` is the oldest data snapshot's release, because that is the oldest data the Data upgrade suite opens.
import {readFileSync, readdirSync, existsSync} from 'node:fs';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const FORMAT = 'plc-compat/1';
/** The classes of key that are not kept across visits (a session's scratch space, and keys only tests write). */
export const NOT_KEPT = Object.freeze(['transient', 'test']);
export const STEP_BACK = 'to the previous release: it leaves data of a newer format untouched (docs/DATA-COMPATIBILITY.md)';

/** The releases (without the leading v) of the data snapshots in `dir`, oldest first. */
export function snapshotReleases(dir = path.join(root, 'tests/fixtures/data')) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, {withFileTypes: true}).filter((e) => e.isDirectory()).map((e) => e.name).sort()
    .map((name) => String(JSON.parse(readFileSync(path.join(dir, name, 'meta.json'), 'utf8')).release).replace(/^v/, ''));
}

const sortedObject = (entries) => Object.fromEntries(entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

/**
 * Builds the record. The tables can be passed in (the tests do, to prove the result follows them); by default they are the ones the app uses.
 * @returns the compat object
 */
export async function buildCompat({version, commit, keyClasses, fileFormats, docsFormat, vaultFormat, snapshots} = {}) {
  keyClasses ??= (await import('../chat/vault/key-classes.mjs')).KEY_CLASSES;
  fileFormats ??= (await import('../chat/transfer/file-formats.mjs')).FILE_FORMATS;
  docsFormat ??= (await import('../chat/documents/doc-store.mjs')).DB_FORMAT;
  vaultFormat ??= Number(/^plc-vault\/(\d+)$/.exec((await import('../chat/vault/vault.mjs')).VAULT_FORMAT)[1]);
  snapshots ??= snapshotReleases();
  version ??= JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  if (!snapshots.length) throw new Error('There is no data snapshot: a build with no tested data cannot say what it upgrades from');
  return {
    format: FORMAT,
    version,
    commit: commit ?? null,
    storedFormats: sortedObject(Object.entries(keyClasses).filter(([, v]) => !NOT_KEPT.includes(v.class)).map(([k, v]) => [k, v.format])),
    databases: {'plc-docs': docsFormat, 'plc-vault': vaultFormat},
    fileFormats: sortedObject(Object.entries(fileFormats).map(([name, f]) => {
      const first = f.first ?? 1;
      return [name, {writes: f.current, reads: Array.from({length: f.current - first + 1}, (_, i) => first + i)}];
    })),
    snapshots,
    upgradesFrom: {oldest: snapshots[0], note: 'older versions are not tested: upgrade through a release in this range'},
    stepBack: STEP_BACK
  };
}

export const toJson = (compat) => JSON.stringify(compat, null, 1) + '\n';

async function cli(args) {
  const opt = (name) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : undefined; };
  const text = toJson(await buildCompat({version: opt('version'), commit: opt('commit')}));
  if (opt('out')) writeFileSync(opt('out'), text); else process.stdout.write(text);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  cli(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (error) => { console.error(error.message); process.exitCode = 1; });
}
