// Scans a build (or the unpacked folder of a release) for anything that is ours and has no business in a copy someone else runs.
//
//   node scripts/neutrality.mjs <config.json> <folder>...      prints the problems and exits 1 if there are any
//
// The rules are data (tests/neutrality.config.json), so another app can reuse the scan with its own file:
// - `strings`: patterns that must not appear in any text file of the output (our domain, organisation names, analytics hosts, our page paths as links).
// - `allowed`: the places where one of those strings is meant to be, each with its paths and its reason. An entry that nothing uses is itself a problem,
//   so the list cannot grow quietly or outlive what it explained.
// - `hosts`: every host an output names (http(s) and ws(s) addresses) must be in the network inventory (scripts/network-inventory.mjs) or in `allowedHosts`
//   with its paths and its reason (a licence text, the shipped default model source).
// - `skipPaths`: globs for files that are not scanned.
// Files that contain a NUL byte near their start are binary and are not scanned. Paths are relative to the folder, with `/`. Globs: `*` is within one
// folder, `**` crosses folders.
import {readdir, readFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const HOST = /\b(?:https?|wss?):\/\/([A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?)(?::\d+)?/g;

export function globToRegExp(glob) {
  let source = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') { if (glob[i + 1] === '*') { source += '.*'; i++; if (glob[i + 1] === '/') i++; } else source += '[^/]*'; }
    else source += c.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp('^' + source + '$');
}
const matchesAny = (globs, file) => (globs || []).some((g) => globToRegExp(g).test(file));

export async function loadConfig(file) {
  const config = JSON.parse(await readFile(file, 'utf8'));
  if (config.format !== 'plc-neutrality/1') throw new Error(file + ' is not a neutrality config (format plc-neutrality/1)');
  for (const s of config.strings) { try { new RegExp(s.pattern, s.flags || ''); } catch (error) { throw new Error('String "' + s.id + '": ' + error.message); } }
  const ids = new Set(config.strings.map((s) => s.id));
  for (const a of config.allowed || []) if (!ids.has(a.string)) throw new Error('An allowed entry names the unknown string "' + a.string + '"');
  for (const a of [...(config.allowed || []), ...(config.allowedHosts || [])]) if (!a.why || !a.paths?.length) throw new Error('Every allowed entry needs paths and a reason: ' + JSON.stringify(a).slice(0, 120));
  return config;
}

/** The hosts the network inventory knows (the app's own source and its vendored libraries). */
export async function inventoryHosts(file) {
  const inventory = JSON.parse(await readFile(file, 'utf8'));
  return new Set([...Object.keys(inventory.appHosts), ...Object.keys(inventory.vendorHosts)]);
}

async function* textFiles(root, skip) {
  async function* walk(dir) {
    for (const entry of (await readdir(dir, {withFileTypes: true})).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { yield* walk(full); continue; }
      if (!entry.isFile()) continue;
      const rel = path.relative(root, full).split(path.sep).join('/');
      if (matchesAny(skip, rel)) continue;
      const bytes = await readFile(full);
      if (bytes.subarray(0, 8192).includes(0)) continue; // binary
      yield {rel, text: bytes.toString('utf8')};
    }
  }
  yield* walk(root);
}

/**
 * Scans one folder. Returns what it found; `evaluate` turns the findings of all folders into problems.
 * { files, hits: [{file, string, match}], allowedUsed: Set(index), hostsUsed: Set(index), unknownHosts: [{file, host}] }
 */
export async function scanDirectory(root, config, knownHosts) {
  const result = {root, files: 0, hits: [], allowedUsed: new Set(), hostsUsed: new Set(), unknownHosts: []};
  const patterns = config.strings.map((s) => ({id: s.id, re: new RegExp(s.pattern, (s.flags || '').replace('g', '') + 'g')}));
  for await (const {rel, text} of textFiles(root, config.skipPaths)) {
    result.files++;
    for (const {id, re} of patterns) {
      for (const m of text.matchAll(re)) {
        const index = (config.allowed || []).findIndex((a) => a.string === id && matchesAny(a.paths, rel));
        if (index >= 0) result.allowedUsed.add(index);
        else result.hits.push({file: rel, string: id, match: m[0]});
      }
    }
    for (const m of text.matchAll(HOST)) {
      const host = m[1].toLowerCase();
      if (knownHosts.has(host)) continue;
      const index = (config.allowedHosts || []).findIndex((a) => a.hosts.includes(host) && matchesAny(a.paths, rel));
      if (index >= 0) result.hostsUsed.add(index);
      else result.unknownHosts.push({file: rel, host});
    }
  }
  return result;
}

/** The problems in the findings of all the folders scanned, as readable lines. Nothing scanned is a problem too. */
export function evaluate(results, config) {
  const problems = [];
  const unique = (list) => [...new Set(list)];
  for (const r of results) {
    if (r.files === 0) problems.push(r.root + ': no text files were scanned');
    for (const line of unique(r.hits.map((h) => `${h.file}: "${h.match}" matches the string "${h.string}"`))) problems.push(r.root + ' ' + line);
    for (const line of unique(r.unknownHosts.map((h) => `${h.file}: names ${h.host}, which is not in the network inventory or the allowed hosts`))) problems.push(r.root + ' ' + line);
  }
  const used = (key) => new Set(results.flatMap((r) => [...r[key]]));
  const allowedUsed = used('allowedUsed'), hostsUsed = used('hostsUsed');
  (config.allowed || []).forEach((a, i) => { if (!allowedUsed.has(i)) problems.push(`allowed entry ${i} (${a.string}: ${a.paths.join(', ')}) is not used by anything scanned; remove it`); });
  (config.allowedHosts || []).forEach((a, i) => { if (!hostsUsed.has(i)) problems.push(`allowed hosts entry ${i} (${a.hosts.join(', ')}: ${a.paths.join(', ')}) is not used by anything scanned; remove it`); });
  return problems;
}

async function cli(args) {
  const [configFile, ...folders] = args;
  if (!configFile || !folders.length) { console.error('Usage: node scripts/neutrality.mjs <config.json> <folder>...'); return 2; }
  const config = await loadConfig(configFile);
  const known = await inventoryHosts(config.inventory);
  const results = [];
  for (const folder of folders) results.push(await scanDirectory(path.resolve(folder), config, known));
  const problems = evaluate(results, config);
  console.log(problems.length ? problems.join('\n') : `Nothing of ours in ${results.reduce((n, r) => n + r.files, 0)} text files.`);
  return problems.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) process.exitCode = await cli(process.argv.slice(2));
