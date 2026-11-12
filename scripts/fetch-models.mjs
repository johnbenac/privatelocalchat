#!/usr/bin/env node
// Downloads the model files a copy needs onto its own disk, so the copy can run from its own host.
//
//   node fetch-models.mjs (--tier a,b,... | --all) [--voices] [--embedding]
//       [--from <base>] [--dir <folder>] [--root <operator root>] [--manifest <file>]
//       [--dry-run] [--deep] [--use-local]
//
// It needs only Node.js 20 or newer. The list of files, each with its size and SHA-256, is models.json beside this script.
// Nothing is written until a file has the pinned size and hash; it never deletes a file that is not in the list.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MARGIN = 256 * 1024 * 1024;
const PARALLEL = 3;
const RETRIES = 2;
const LOCAL_CONFIG = '{ "format": "plc-app-config/1", "modelSources": [ { "id": "this-host", "label": "This computer", "base": "/models/" } ] }\n';

class Refusal extends Error {}
const refuse = (message) => { throw new Refusal(message); };
const mib = (n) => (n / 1048576).toFixed(1) + ' MiB';

// Test hook only: FETCH_MODELS_FREE_BYTES fixes the free space the tool believes it has (tests use it to lower it).
// Nothing else reads it, and it cannot make a copy of the tool skip the check.
async function freeBytes(folder) {
  const hook = process.env.FETCH_MODELS_FREE_BYTES;
  if (hook !== undefined && /^\d+$/.test(hook)) return Number(hook);
  let at = path.resolve(folder);
  while (!fs.existsSync(at)) { const up = path.dirname(at); if (up === at) break; at = up; }
  const s = await fsp.statfs(at);
  return Number(s.bavail) * Number(s.bsize);
}

function parseArgs(argv) {
  const o = {tiers: [], all: false, voices: false, embedding: false, dryRun: false, deep: false, useLocal: false};
  const value = (i, name) => { if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) refuse(name + ' needs a value.'); return argv[i + 1]; };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--all') o.all = true;
    else if (a === '--voices') o.voices = true;
    else if (a === '--embedding') o.embedding = true;
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--deep') o.deep = true;
    else if (a === '--use-local') o.useLocal = true;
    else if (a === '--tier') o.tiers.push(...value(i++, a).split(',').map((s) => s.trim()).filter(Boolean));
    else if (a === '--from') o.from = value(i++, a);
    else if (a === '--dir') o.dir = value(i++, a);
    else if (a === '--root') o.root = value(i++, a);
    else if (a === '--manifest') o.manifest = value(i++, a);
    else if (a === '--help' || a === '-h') o.help = true;
    else refuse('Unknown option ' + a + '. Run with --help to see the options.');
  }
  return o;
}

const HELP = `Usage: node fetch-models.mjs (--tier a,b,... | --all) [--voices] [--embedding]
         [--from <base>] [--dir <folder>] [--root <operator root>] [--manifest <file>]
         [--dry-run] [--deep] [--use-local]

  --tier a,b   fetch these tiers (see models.json for their names)
  --all        every tier, all voices and the embedding files (a full copy is about 14 GB)
  --voices     add all voices;  --embedding  add the embedding files
  --from BASE  where to fetch from: an https address ending in /  (http only for this computer)
  --dir DIR    where the files go (default ./models);  --root R  means R/models
  --manifest   the list of files (default models.json beside this script)
  --dry-run    print the plan and stop;  --deep  also check the hash of files already present
  --use-local  after a successful run with --root, create R/config/app-config.json so the copy serves its own models`;

function isLocalHost(url) { return url.hostname === 'localhost' || url.hostname === '127.0.0.1'; }

function checkBase(base, where) {
  if (typeof base !== 'string' || !base) refuse(where + ' gives no model source address.');
  if (base.startsWith('/')) refuse(where + ' names a path on this host (' + base + '), which is this copy\'s own disk. Use --from <base> to say where to fetch from.');
  let url;
  try { url = new URL(base); } catch { refuse(where + ' is not an address: ' + base); }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocalHost(url))) refuse(where + ' must be an https address (http is allowed only for localhost or 127.0.0.1): ' + base);
  if (!base.endsWith('/')) refuse(where + ' must end in /: ' + base);
  if (url.username || url.password) refuse(where + ' must not carry a user name or password.');
  return url.href;
}

function checkEntry(e, where) {
  if (!e || typeof e !== 'object') refuse('The manifest has an entry that is not an object (' + where + ').');
  const p = e.path;
  if (typeof p !== 'string' || !p) refuse('The manifest has an entry without a path (' + where + ').');
  if (p.startsWith('/') || /^[A-Za-z]:/.test(p)) refuse('The manifest has an absolute path: ' + p);
  if (p.includes('\\')) refuse('The manifest has a path with a backslash: ' + p);
  if (p.split('/').some((s) => s === '..' || s === '.' || s === '')) refuse('The manifest has a path with ".." or an empty part: ' + p);
  if (!Number.isSafeInteger(e.bytes) || e.bytes < 0) refuse('The manifest gives a size that is not a whole number of bytes, zero or more, for ' + p);
  if (typeof e.sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(e.sha256)) refuse('The manifest gives a sha256 that is not 64 hex digits for ' + p);
  return {path: p, bytes: e.bytes, sha256: e.sha256.toLowerCase()};
}

async function loadManifest(file) {
  let text;
  try { text = await fsp.readFile(file, 'utf8'); } catch { refuse('The manifest ' + file + ' is missing or cannot be read. Use --manifest <file> to name it.'); }
  let m;
  try { m = JSON.parse(text); } catch { refuse('The manifest ' + file + ' is not JSON.'); }
  if (!m || typeof m !== 'object' || m.format !== 'plc-models/1') refuse('The manifest ' + file + ' is not format plc-models/1.');
  const list = (v, where) => { if (!Array.isArray(v)) refuse('The manifest has no list for ' + where + '.'); return v.map((e) => checkEntry(e, where)); };
  const group = (v, where) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) refuse('The manifest has no "' + where + '" object.');
    return Object.fromEntries(Object.entries(v).map(([k, l]) => [k, list(l, where + ' ' + k)]));
  };
  const out = {tiers: group(m.tiers, 'tiers'), voices: group(m.voices ?? {}, 'voices'), embedding: list(m.embedding ?? [], 'embedding')};
  const seen = new Map();
  for (const l of [...Object.values(out.tiers), ...Object.values(out.voices), out.embedding]) for (const e of l) {
    const o = seen.get(e.path);
    if (o && (o.bytes !== e.bytes || o.sha256 !== e.sha256)) refuse('The manifest lists ' + e.path + ' twice with different pins.');
    seen.set(e.path, e);
  }
  return out;
}

async function readJson(file) { return JSON.parse(await fsp.readFile(file, 'utf8')); }

async function resolveSource(o) {
  if (o.from) return checkBase(o.from, '--from');
  if (o.root) {
    const file = path.join(path.resolve(o.root), 'config', 'app-config.json');
    if (fs.existsSync(file)) {
      let c;
      try { c = await readJson(file); } catch { refuse(file + ' is not valid JSON. Fix it or use --from <base>.'); }
      return checkBase(c?.modelSources?.[0]?.base, file);
    }
  }
  const page = path.join(HERE, 'app', 'index.html');
  if (!fs.existsSync(page)) refuse('There is no shipped page (app/index.html) beside this script to read the model source from. Use --from <base>.');
  const html = await fsp.readFile(page, 'utf8');
  const at = html.indexOf('window.APP_CONFIG=');
  const end = at < 0 ? -1 : html.indexOf(';</script>', at);
  if (end < 0) refuse(page + ' carries no model source. Use --from <base>.');
  let c;
  try { c = JSON.parse(html.slice(at + 'window.APP_CONFIG='.length, end)); } catch { refuse('The model source in ' + page + ' cannot be read. Use --from <base>.'); }
  return checkBase(c?.modelSources?.[0]?.base, page);
}

async function sha256File(file) {
  const h = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) h.update(chunk);
  return h.digest('hex');
}

const statOrNull = async (f) => { try { return await fsp.stat(f); } catch { return null; } };

// Joins a manifest path to the destination and refuses anything that lands outside it.
function within(dest, rel) {
  const full = path.resolve(dest, ...rel.split('/'));
  if (full !== dest && !full.startsWith(dest + path.sep)) refuse('The manifest path ' + rel + ' would leave the destination.');
  return full;
}

class Retryable extends Error {}

async function download(url, file, e) {
  const part = file + '.part';
  await fsp.mkdir(path.dirname(file), {recursive: true});
  for (let attempt = 0; ; attempt++) {
    try { return await attemptOnce(url, part, e); } catch (error) {
      if (!(error instanceof Retryable) || attempt >= RETRIES) throw error;
    }
  }
}

async function attemptOnce(url, part, e) {
  let have = (await statOrNull(part))?.size ?? 0;
  if (have > e.bytes) { await fsp.rm(part, {force: true}); have = 0; }
  if (have < e.bytes || e.bytes === 0) {
    const headers = {'User-Agent': 'fetch-models'};
    if (have > 0) headers.Range = 'bytes=' + have + '-';
    let res;
    try { res = await fetch(url, {headers, redirect: 'error', credentials: 'omit'}); } catch (error) { throw new Retryable('network error: ' + (error.cause?.code || error.message)); }
    let flags = 'a';
    if (res.status === 206 && have > 0) {
      const m = /^bytes (\d+)-/.exec(res.headers.get('content-range') || '');
      if (!m || Number(m[1]) !== have) { await res.body?.cancel(); await fsp.rm(part, {force: true}); throw new Retryable('the server answered a different range'); }
    } else if (res.status === 200) {
      flags = 'w';
    } else {
      await res.body?.cancel();
      const msg = 'the server answered ' + res.status;
      if (res.status >= 500) throw new Retryable(msg);
      throw new Error(msg);
    }
    const out = fs.createWriteStream(part, {flags});
    try {
      for await (const chunk of res.body) { if (!out.write(chunk)) await new Promise((r) => out.once('drain', r)); }
    } catch (error) {
      await new Promise((r) => out.end(r));
      throw new Retryable('network error: ' + (error.cause?.code || error.message));
    }
    await new Promise((resolve, reject) => { out.once('error', reject); out.end(resolve); });
  }
  const size = (await fsp.stat(part)).size;
  if (size < e.bytes) throw new Retryable('the download stopped after ' + size + ' of ' + e.bytes + ' bytes');
  if (size > e.bytes || (await sha256File(part)) !== e.sha256) { await fsp.rm(part, {force: true}); throw new Error('refused: wrong bytes'); }
  return part;
}

async function main(argv) {
  const o = parseArgs(argv);
  if (o.help) { console.log(HELP); return 0; }
  const manifest = await loadManifest(o.manifest ? path.resolve(o.manifest) : path.join(HERE, 'models.json'));
  const known = Object.keys(manifest.tiers);
  if (!o.all && !o.tiers.length) refuse('Nothing to fetch: name a tier with --tier (' + known.join(', ') + ') or use --all. A full copy is about 14 GB.');
  for (const t of o.tiers) if (!Object.hasOwn(manifest.tiers, t)) refuse('Unknown tier "' + t + '". The tiers are: ' + known.join(', ') + '.');
  if (o.useLocal && !o.root) refuse('--use-local needs --root <operator root>, the folder that holds config/.');

  const groups = [];
  for (const t of o.all ? known : o.tiers) groups.push(['tier ' + t, manifest.tiers[t]]);
  if (o.all || o.voices) for (const [id, l] of Object.entries(manifest.voices)) groups.push(['voice ' + id, l]);
  if (o.all || o.embedding) {
    if (!manifest.embedding.length) console.log('The embedding list in the manifest is empty; nothing to fetch for it.');
    else groups.push(['embedding', manifest.embedding]);
  }

  const dest = path.resolve(o.dir ?? (o.root ? path.join(o.root, 'models') : 'models'));
  const wanted = new Map();
  for (const [, l] of groups) for (const e of l) wanted.set(e.path, {...e, file: within(dest, e.path)});
  const base = await resolveSource(o);

  // What is already there.
  const todo = [];
  let skipped = 0;
  for (const e of wanted.values()) {
    const s = await statOrNull(e.file);
    let ok = !!s && s.isFile() && s.size === e.bytes;
    if (ok && o.deep) ok = (await sha256File(e.file)) === e.sha256;
    e.done = ok;
    if (ok) skipped++; else todo.push(e);
  }
  for (const [name, l] of groups) {
    const rest = l.filter((e) => !wanted.get(e.path).done);
    console.log(name + ': ' + l.length + ' files, ' + mib(l.reduce((n, e) => n + e.bytes, 0)) + '; to fetch ' + rest.length + ' files, ' + mib(rest.reduce((n, e) => n + e.bytes, 0)));
  }
  const need = todo.reduce((n, e) => n + e.bytes, 0);
  console.log('Total to fetch: ' + todo.length + ' files, ' + mib(need) + ' (' + skipped + ' already present). Into ' + dest + ' from ' + base);
  const free = await freeBytes(dest);
  if (free < need + MARGIN) refuse('Not enough free disk space in ' + dest + ': ' + free + ' bytes free, ' + need + ' bytes to fetch and ' + MARGIN + ' bytes kept spare. Free some space or use --dir to choose another disk.');
  if (o.dryRun) { console.log('Dry run: nothing was downloaded or written.'); return 0; }

  let fetched = 0, failed = 0, next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const e = todo[next++];
      try {
        const part = await download(base + e.path.split('/').map(encodeURIComponent).join('/'), e.file, e);
        await fsp.rename(part, e.file);
        fetched++;
        console.log('fetched ' + e.path + ' (' + mib(e.bytes) + ') [' + (fetched + failed) + '/' + todo.length + ']');
      } catch (error) {
        failed++;
        console.error('failed ' + e.path + ': ' + error.message + (error.message.startsWith('refused') ? '' : ' (the partial file is kept for the next run)'));
      }
    }
  };
  await Promise.all(Array.from({length: Math.min(PARALLEL, todo.length)}, worker));
  console.log('Summary: ' + fetched + ' fetched, ' + skipped + ' skipped, ' + failed + ' failed.');
  if (failed) return 1;

  const snippet = '{ "format": "plc-app-config/1", "modelSources": [ { "id": "this-host", "label": "This computer", "base": "/models/" } ] }';
  const configFile = o.root ? path.join(path.resolve(o.root), 'config', 'app-config.json') : null;
  if (o.useLocal) {
    if (fs.existsSync(configFile)) console.log(configFile + ' already exists and was left alone. To serve models from this computer, make its first model source:\n' + snippet);
    else { await fsp.mkdir(path.dirname(configFile), {recursive: true}); await fsp.writeFile(configFile, LOCAL_CONFIG); console.log('Created ' + configFile + ' so this copy serves models from its own disk.'); }
  } else {
    console.log('To serve these models from this computer, put this in config/app-config.json of the operator root (or run again with --root and --use-local):\n' + snippet);
  }
  return 0;
}

main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (error) => {
  if (error instanceof Refusal) console.error('Refused: ' + error.message);
  else console.error('Error: ' + (error?.stack || error));
  process.exitCode = 1;
});
