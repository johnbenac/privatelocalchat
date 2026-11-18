// The neutrality scan: what a neutral build (an application without our brand layer) must not carry and must carry (contract O165, board T736).
// Moved here from Private Local Chat's scripts/neutrality.mjs; the rules are Brand's shared file (neutrality-rules/1, frozen) and each application brings its own
// exceptions file (neutrality-exceptions/1). No dependencies; Node 22. The one implementation of the narrow attribution exemption is attribution/attribution.py, which this CALLS.
//
//   node scan/neutrality.mjs --rules RULES.json --exceptions EXCEPTIONS.json [--no-attribution] [--manifests GLOB]... [--archive FILE] [DIR]...
//
// An exception may carry `match`, a regex that the TOKEN around each individual match must satisfy (the run of characters around it that are not whitespace, quotes, angle brackets or parentheses),
// so it covers one specific string and every other match, even on the same line of a minified file, is judged on its own token and still fails.
// Exit codes: 0 nothing to fix, 1 problems, 2 bad input. Warnings (rule severity "warn") are printed and never fail. Every exception with an `until` is listed at the end of every run.
import {readdir, readFile, mkdtemp, rm, access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath, pathToFileURL} from 'node:url';

export const RULES_FORMAT = 'neutrality-rules/1';
export const EXCEPTIONS_FORMAT = 'neutrality-exceptions/1';
const HOST = /\b(?:https?|wss?):\/\/([A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?)(?::\d+)?/g;
const DEFAULT_ATTRIBUTION = fileURLToPath(new URL('../attribution/attribution.py', import.meta.url));
const MAX_UNTIL_DAYS = 90;

// ---- globs ---------------------------------------------------------------------------------------------------------------------------------------
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
const baseName = (file) => file.slice(file.lastIndexOf('/') + 1);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const today = (now) => new Date(now).toISOString().slice(0, 10);

// ---- loading and checking the two files --------------------------------------------------------------------------------------------------------
export async function loadRules(file) {
  const rules = JSON.parse(await readFile(file, 'utf8'));
  if (rules.format !== RULES_FORMAT) throw new Error(`${file} is not a shared rule file (format ${RULES_FORMAT}); it says ${JSON.stringify(rules.format)}`);
  if (typeof rules.version !== 'string' || !rules.version) throw new Error(`${file} has no version`);
  const ids = new Set();
  for (const s of rules.strings || []) {
    try { new RegExp(s.pattern, s.flags || ''); } catch (error) { throw new Error(`Rule "${s.id}": ${error.message}`); }
    if (!['fail', 'warn'].includes(s.severity) || !['all', 'visible'].includes(s.scope)) throw new Error(`Rule "${s.id}" needs severity fail|warn and scope all|visible`);
    if (ids.has(s.id)) throw new Error(`Rule "${s.id}" is listed twice`);
    ids.add(s.id);
  }
  return rules;
}

/** Checks an exceptions object and returns its problems (an empty list means fine). `now` is injectable for tests. */
export function checkExceptions(ex, rules, now = Date.now()) {
  const problems = [];
  if (!ex || ex.format !== EXCEPTIONS_FORMAT) return [`the exceptions file must have format ${EXCEPTIONS_FORMAT}`];
  if (typeof ex.application !== 'string' || !ex.application.trim()) problems.push('application (the application\'s own name) is required');
  for (const p of ex.productNames || []) { try { new RegExp(p, 'i'); } catch (error) { problems.push(`productNames: ${p}: ${error.message}`); } }
  const ids = new Set((rules.strings || []).map((s) => s.id)); ids.add('brand-asset'); ids.add('brand-asset-name');
  const limit = now + MAX_UNTIL_DAYS * 86400000;
  (ex.exceptions || []).forEach((e, i) => {
    const at = `exceptions[${i}] (${e?.rule})`;
    if (!ids.has(e.rule)) problems.push(`${at}: "${e.rule}" is not a rule of the shared file`);
    if (!Array.isArray(e.paths) || !e.paths.length) problems.push(`${at}: paths are required`);
    if (typeof e.why !== 'string' || !e.why.trim()) problems.push(`${at}: why is required`);
    if (e.userVisible !== undefined && typeof e.userVisible !== 'boolean') problems.push(`${at}: userVisible must be true or false`);
    if (e.match !== undefined) { try { new RegExp(e.match); } catch (error) { problems.push(`${at}: match is not a valid regular expression: ${error.message}`); } }
    if (e.until !== undefined) {
      const u = e.until;
      if (!u || typeof u !== 'object' || !/^T\d+$/.test(u.task || '') || !/^\d{4}-\d{2}-\d{2}$/.test(u.by || '') || Number.isNaN(Date.parse(u.by))) problems.push(`${at}: until needs both a task (T123) and a date (YYYY-MM-DD)`);
      else if (Date.parse(u.by) > limit) problems.push(`${at}: until.by ${u.by} is more than ${MAX_UNTIL_DAYS} days ahead`);
    }
  });
  (ex.allowedHosts || []).forEach((a, i) => {
    if (!Array.isArray(a.hosts) || !a.hosts.length || !Array.isArray(a.paths) || !a.paths.length || !a.why) problems.push(`allowedHosts[${i}]: hosts, paths and why are required`);
  });
  return problems;
}

export async function loadExceptions(file, rules, now = Date.now()) {
  const ex = JSON.parse(await readFile(file, 'utf8'));
  const problems = checkExceptions(ex, rules, now);
  if (problems.length) throw new Error(`${file}:\n  ` + problems.join('\n  '));
  return ex;
}

// ---- what a person reads ---------------------------------------------------------------------------------------------------------------------------
const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
const WHOLE_FILE = ['*.md', '*.txt', 'README*', 'NOTICE*', 'CHANGELOG*', 'SOURCE.txt'];
const NEVER_VISIBLE = ['LICENSE*', 'COPYING*', 'THIRD-PARTY*', '*.LEGAL.txt', 'licenses/**', 'vendor/**', 'node_modules/**', '*.map', '**/LICENSE*', '**/COPYING*', '**/THIRD-PARTY*', '**/*.LEGAL.txt', '**/licenses/**', '**/vendor/**', '**/node_modules/**'];
const ATTRS = ['alt', 'title', 'aria-label', 'aria-description', 'placeholder'];
const META_KEYS = ['description', 'og:title', 'og:description', 'og:image:alt', 'twitter:title', 'twitter:description'];

/** 'html' | 'manifest' | 'whole' | null: whether the file is text a person reads. */
export function visibleKind(rel, visibleFiles = []) {
  if (matchesAny(NEVER_VISIBLE, rel) || rel.endsWith('.map')) return null;
  if (/\.html?$/i.test(rel)) return 'html';
  if (/\.webmanifest$/i.test(rel) || baseName(rel) === 'manifest.json') return 'manifest';
  if (matchesAny(visibleFiles, rel)) return 'whole';
  const b = baseName(rel);
  if (WHOLE_FILE.some((g) => globToRegExp(g).test(b))) return 'whole';
  return null;
}

function attrsOf(tag) {
  const out = {};
  for (const m of tag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) out[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? '');
  return out;
}
function jsonLdStrings(value, out) {
  if (Array.isArray(value)) value.forEach((v) => jsonLdStrings(v, out));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) {
    if (['name', 'headline', 'description', 'alternateName'].includes(k) && typeof v === 'string') out.push(v); else jsonLdStrings(v, out);
  }
}
/** The text of a file that a person reads, one piece per line. */
export function visibleText(kind, text) {
  if (kind === 'whole') return text;
  if (kind === 'manifest') {
    try { const j = JSON.parse(text); return ['name', 'short_name', 'description'].map((k) => (typeof j[k] === 'string' ? j[k] : '')).filter(Boolean).join('\n'); } catch { return ''; }
  }
  const pieces = [];
  for (const m of text.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) { try { jsonLdStrings(JSON.parse(m[1]), pieces); } catch { /* not json: nothing visible */ } }
  const body = text.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ');
  for (const m of body.matchAll(/<([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*)>/g)) {
    const tag = m[1].toLowerCase(), a = attrsOf(m[2]);
    for (const k of ATTRS) if (a[k]) pieces.push(a[k]);
    if ((tag === 'button' || (tag === 'input' && ['submit', 'button', 'reset'].includes((a.type || '').toLowerCase()))) && a.value) pieces.push(a.value);
    if (tag === 'meta' && a.content && (META_KEYS.includes((a.name || '').toLowerCase()) || META_KEYS.includes((a.property || '').toLowerCase()))) pieces.push(a.content);
  }
  pieces.push(decode(body.replace(/<[^>]*>/g, '\n')));
  return pieces.join('\n');
}

// ---- the attribution region ------------------------------------------------------------------------------------------------------------------------
const FROM_LINE = 'from ai of our own';
/** Returns the text spans of the attribution region(s) in a file, as plain text, so they can be exempted and compared with attribution.json. */
export function attributionRegions(rel, text) {
  const spans = [];
  if (/\.html?$/i.test(rel)) {
    for (const m of text.matchAll(/<!--attribution-->([\s\S]*?)<!--\/attribution-->/g)) spans.push({raw: m[0], text: decode(m[1].replace(/<[^>]*>/g, '\n'))});
    for (const m of text.matchAll(/<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*\bclass\s*=\s*"[^"]*\battribution\b[^"]*"[^>]*>([\s\S]*?)<\/\1\s*>/g)) spans.push({raw: m[0], text: decode(m[2].replace(/<[^>]*>/g, '\n'))});
  } else {
    const lines = text.split('\n');
    const start = lines.findIndex((l) => l.trim() === FROM_LINE);
    if (start >= 0) {
      for (let end = start + 1; end < Math.min(lines.length, start + 9); end++) {
        if (/^\s*Source:/.test(lines[end])) { const block = lines.slice(start, end + 1).join('\n'); const title = start > 0 ? lines[start - 1] : ''; spans.push({raw: block, text: title + '\n' + block}); break; } // the title line (name and version) is the line above the from-line
      }
    }
  }
  return spans;
}

// ---- walking ---------------------------------------------------------------------------------------------------------------------------------------
async function* files(root, skip) {
  async function* walk(dir) {
    for (const entry of (await readdir(dir, {withFileTypes: true})).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { yield* walk(full); continue; }
      if (!entry.isFile()) continue;
      const rel = path.relative(root, full).split(path.sep).join('/');
      if (matchesAny(skip, rel)) continue;
      yield {rel, full};
    }
  }
  yield* walk(root);
}

async function expandGlob(pattern) {
  const parts = pattern.split('/'); let bases = ['/'];
  for (const part of parts.filter(Boolean)) {
    const next = [];
    for (const base of bases) {
      if (!part.includes('*')) { next.push(path.join(base, part)); continue; }
      try { for (const e of await readdir(base)) if (globToRegExp(part).test(e)) next.push(path.join(base, e)); } catch { /* no such folder */ }
    }
    bases = next;
  }
  const found = []; for (const b of bases) { try { await access(b); found.push(b); } catch { /* absent */ } }
  return found;
}
/** The SHA-256 of every brand asset the packet manifests list: Map(hash -> path). */
export async function loadBrandHashes(manifestGlobs) {
  const map = new Map(); let manifests = 0;
  for (const g of manifestGlobs) for (const file of await expandGlob(g)) {
    manifests++;
    const j = JSON.parse(await readFile(file, 'utf8'));
    for (const f of j.files || []) if (typeof f.sha256 === 'string' && /^[0-9a-f]{64}$/.test(f.sha256)) map.set(f.sha256, `${path.basename(path.dirname(file))}/${f.path}`);
  }
  return {map, manifests};
}

function runAttribution(target, {script, python}) {
  const r = spawnSync(python, [script, 'check', target], {encoding: 'utf8', timeout: 120000});
  if (r.error) return {ok: false, message: `could not run ${script}: ${r.error.message}`};
  return {ok: r.status === 0, message: ((r.stdout || '') + (r.stderr || '')).trim().slice(0, 600)};
}

/** The token that contains one match: the maximal run of characters around it that are not whitespace, quotes, angle brackets or parentheses (for a URL, the whole URL). */
const TOKEN_BREAK = /[\s"'`<>()]/;
export function tokenAround(text, index, length) {
  let from = index, to = index + length;
  while (from > 0 && !TOKEN_BREAK.test(text[from - 1])) from--;
  while (to < text.length && !TOKEN_BREAK.test(text[to])) to++;
  return text.slice(from, to).slice(0, 4000);
}

// ---- the scan --------------------------------------------------------------------------------------------------------------------------------------
/**
 * scan({roots, rules, exceptions, ...}) -> { rulesVersion, files, problems, warnings, until }
 *   roots: folders (unpack an archive first, or use `archive` in the command line)
 *   requireAttribution (default true): the positive checks of the rule file's mustContain, with attribution.py (`attributionScript`, `python`)
 *   manifests: globs of brand packet manifests (default: the rule file's binaryAssets.manifestGlobs); `brandHashes` overrides (tests)
 *   knownHosts: a Set of hosts the application knows (the optional host plug-in). Without it no host is checked.
 *   skipPaths: globs not scanned.  now: the clock, for tests.
 */
export async function scan({roots, rules, exceptions, requireAttribution = true, attributionScript = DEFAULT_ATTRIBUTION, python = '/usr/bin/python3', manifests, brandHashes, knownHosts = null, skipPaths = [], now = Date.now()}) {
  const out = {rulesVersion: rules.version, files: 0, problems: [], warnings: [], until: []};
  const problems = (exceptions && checkExceptions(exceptions, rules, now)) || [];
  if (problems.length) { out.problems.push(...problems.map((p) => 'exceptions file: ' + p)); return out; }
  const ex = exceptions.exceptions || [];
  const used = new Set(), hostsUsed = new Set();
  const productNames = (exceptions.productNames || []).map((p) => new RegExp(p, 'gi'));
  const sevOf = new Map(rules.strings.map((s) => [s.id, s.severity]));
  const compiled = rules.strings.map((s) => ({...s, re: new RegExp(s.pattern, (s.flags || '').replace(/g/g, '') + 'g')}));
  const exemptRegion = new Set(rules.attributionExemption?.exemptRules || ['family-name', 'our-hosts']);
  const regionFiles = new Set(rules.attributionExemption?.paths || rules.attributionPaths || []);
  const recordFiles = new Set(['NOTICE.md', 'SOURCE.txt', 'attribution.json']); // the narrow exemption in these three is attribution.py's
  const visibleFiles = exceptions.visibleFiles || [];
  const ba = rules.binaryAssets;
  let hashes = brandHashes;
  if (!hashes && ba) {
    const loaded = await loadBrandHashes(manifests || ba.manifestGlobs || []);
    if (!loaded.manifests) out.problems.push('no brand packet manifests were found, so brand assets cannot be matched by hash (give --manifests, or --no-binary-assets)');
    hashes = loaded.map;
  }
  const seen = new Set();
  const report = (root, rel, id, match, kind, token = match) => {
    const index = ex.findIndex((e) => e.rule === id && matchesAny(e.paths, rel) && (e.match === undefined || new RegExp(e.match).test(token)));
    if (index >= 0) {
      used.add(index);
      if (id === 'other-app-names' && kind && !ex[index].userVisible) {
        const msg = `${root} ${rel}: "${match}" names another project in text a person reads; its exception needs userVisible: true and a reason Brand reads`;
        if (!seen.has(msg)) { seen.add(msg); out.problems.push(msg); }
      }
      return;
    }
    const msg = `${root} ${rel}: "${match}" matches the rule "${id}"`;
    if (seen.has(msg)) return; seen.add(msg);
    (sevOf.get(id) === 'warn' || id === 'brand-asset-name' ? out.warnings : out.problems).push(msg);
  };
  for (const root of roots) {
    const before = out.files;
    const regionsByFile = {}; let record = null;
    for await (const {rel, full} of files(root, skipPaths)) {
      const bytes = await readFile(full);
      out.files++;
      const ext = path.extname(rel).toLowerCase();
      if (ba && hashes && (ba.extensions || []).includes(ext)) {
        const known = hashes.get(sha256(bytes));
        if (known) report(root, rel, 'brand-asset', `identical to the brand asset ${known}`, null);
        else if ((ba.pathNames || []).includes(baseName(rel))) report(root, rel, 'brand-asset-name', `a file named like a brand asset (${baseName(rel)})`, null);
      }
      if (bytes.subarray(0, 8192).includes(0)) continue; // binary: not read as text
      let text = bytes.toString('utf8');
      if (rel === 'attribution.json') { try { record = JSON.parse(text); } catch { out.problems.push(`${root} attribution.json is not valid JSON`); } }
      const kind = visibleKind(rel, visibleFiles);
      const spans = regionFiles.has(rel) && !recordFiles.has(rel) ? attributionRegions(rel, text) : [];
      if (spans.length) regionsByFile[rel] = spans;
      for (const s of compiled) {
        let subject;
        if (s.scope === 'visible') { if (!kind) continue; subject = visibleText(kind, text); } else subject = text;
        if (s.id === 'other-app-names') for (const p of productNames) subject = subject.replace(p, ' ');
        if (exemptRegion.has(s.id)) {
          if (recordFiles.has(rel)) continue;
          for (const span of spans) subject = subject.replace(span.raw, ' ');
        }
        for (const m of subject.matchAll(s.re)) report(root, rel, s.id, m[0], s.scope === 'visible' || kind ? kind : null, tokenAround(subject, m.index, m[0].length));
      }
      if (knownHosts) for (const m of text.matchAll(HOST)) {
        const host = m[1].toLowerCase();
        if (knownHosts.has(host)) continue;
        const index = (exceptions.allowedHosts || []).findIndex((a) => a.hosts.includes(host) && matchesAny(a.paths, rel));
        if (index >= 0) hostsUsed.add(index);
        else { const msg = `${root} ${rel}: names ${host}, which the application does not know and no allowed host lists`; if (!seen.has(msg)) { seen.add(msg); out.problems.push(msg); } }
      }
    }
    if (out.files === before) out.problems.push(`${root}: no files were scanned`);
    // the region must say what attribution.json says
    for (const [rel, spans] of Object.entries(regionsByFile)) {
      if (!record) { out.problems.push(`${root} ${rel}: has an attribution region but the build has no attribution.json to compare it with`); continue; }
      for (const span of spans) for (const k of ['name', 'version', 'commit', 'licence', 'source']) if (!String(span.text).includes(String(record[k] ?? '\u0000'))) out.problems.push(`${root} ${rel}: the attribution region does not say the ${k} that attribution.json says`);
    }
    if (requireAttribution) await mustContain(root, rules, out, {attributionScript, python});
  }
  ex.forEach((e, i) => {
    if (!used.has(i)) out.problems.push(`exception ${i} (${e.rule}: ${e.paths.join(', ')}) matches nothing that was scanned; remove it`);
    if (e.until) {
      const expired = e.until.by < today(now);
      out.until.push(`${e.rule} ${e.paths.join(', ')} until ${e.until.task} by ${e.until.by}${expired ? ' (EXPIRED)' : ''}${used.has(i) ? '' : ' (matches nothing)'}`);
      if (expired) out.problems.push(`exception ${i} (${e.rule}: ${e.paths.join(', ')}) expired on ${e.until.by} (${e.until.task})`);
    }
  });
  if (knownHosts) (exceptions.allowedHosts || []).forEach((a, i) => { if (!hostsUsed.has(i)) out.problems.push(`allowed hosts entry ${i} (${a.hosts.join(', ')}) matches nothing that was scanned; remove it`); });
  return out;
}

async function mustContain(root, rules, out, {attributionScript, python}) {
  const read = async (rel) => { try { return await readFile(path.join(root, rel), 'utf8'); } catch { return null; } };
  for (const spec of rules.mustContain || []) {
    if (spec.checks) {
      let found = null; for (const rel of spec.paths) { const t = await read(rel); if (t !== null) { found = {rel, t}; break; } }
      if (!found) { out.problems.push(`${root}: none of ${spec.paths.join(', ')} exists (${spec.id})`); continue; }
      for (const c of spec.checks) if (!new RegExp(c.pattern, c.flags || '').test(found.t)) out.problems.push(`${root} ${found.rel}: ${c.id} is missing or wrong (${c.why})`);
    } else if (spec.requiredJsonFields) {
      const t = await read(spec.paths[0]);
      if (t === null) { out.problems.push(`${root}: ${spec.paths[0]} is missing (${spec.id})`); continue; }
      try { const j = JSON.parse(t); for (const f of spec.requiredJsonFields) if (typeof j[f] !== 'string' || !j[f].trim()) out.problems.push(`${root} ${spec.paths[0]}: field ${f} is missing`); } catch { out.problems.push(`${root} ${spec.paths[0]} is not valid JSON`); }
    } else if (spec.pathsIfExist) {
      for (const rel of spec.pathsIfExist) { const t = await read(rel); if (t !== null && !new RegExp(spec.pattern).test(t)) out.problems.push(`${root} ${rel}: the attribution block is missing (${spec.id})`); }
    } else if (spec.paths) {
      let any = false; for (const rel of spec.paths) if ((await read(rel)) !== null) any = true;
      if (!any) out.problems.push(`${root}: ${spec.paths.join(' or ')} is missing (${spec.id})`);
    }
  }
  try { await access(attributionScript); } catch { out.problems.push(`${root}: ${attributionScript} is missing, so the attribution cannot be checked (a missing check is a failure)`); return; }
  const r = runAttribution(root, {script: attributionScript, python});
  if (!r.ok) out.problems.push(`${root}: attribution check failed: ${r.message}`);
}

// ---- archives and the command line ----------------------------------------------------------------------------------------------------------------
export async function unpack(archive, tmpRoot = os.tmpdir()) {
  const dir = await mkdtemp(path.join(tmpRoot, 'neutrality-'));
  const isZip = /\.zip$/i.test(archive);
  const r = isZip ? spawnSync('unzip', ['-q', archive, '-d', dir]) : spawnSync('tar', ['-xf', archive, '-C', dir]);
  if (r.status !== 0) { await rm(dir, {recursive: true, force: true}); throw new Error(`could not unpack ${archive}: ${String(r.stderr || '').slice(0, 200)}`); }
  return dir;
}

export function format(result) {
  const lines = [`rules ${RULES_FORMAT} version ${result.rulesVersion}; ${result.files} files scanned`];
  for (const w of result.warnings) lines.push('warning: ' + w);
  for (const p of result.problems) lines.push('PROBLEM: ' + p);
  if (result.until.length) { lines.push('temporary exceptions (until):'); for (const u of result.until) lines.push('  ' + u); }
  lines.push(result.problems.length ? `${result.problems.length} problem(s), ${result.warnings.length} warning(s)` : `Nothing to fix (${result.warnings.length} warning(s)).`);
  return lines.join('\n');
}

async function cli(argv) {
  const opts = {manifests: [], roots: [], archives: [], requireAttribution: true, binary: true}, a = [...argv];
  while (a.length) {
    const k = a.shift();
    if (k === '--rules') opts.rules = a.shift(); else if (k === '--exceptions') opts.exceptions = a.shift();
    else if (k === '--no-attribution') opts.requireAttribution = false; else if (k === '--no-binary-assets') opts.binary = false;
    else if (k === '--manifests') opts.manifests.push(a.shift()); else if (k === '--archive') opts.archives.push(a.shift());
    else if (k === '--tmp') opts.tmp = a.shift(); else if (k === '--hosts-inventory') opts.inventory = a.shift(); else if (k === '--hosts-keys') opts.keys = a.shift().split(',');
    else if (k.startsWith('--')) { console.error('Unknown option ' + k); return 2; } else opts.roots.push(k);
  }
  if (!opts.rules || !opts.exceptions || !(opts.roots.length || opts.archives.length)) { console.error('Usage: node scan/neutrality.mjs --rules RULES.json --exceptions EXCEPTIONS.json [--no-attribution] [--no-binary-assets] [--manifests GLOB] [--hosts-inventory FILE --hosts-keys a,b] [--tmp DIR] [--archive FILE] [DIR]...'); return 2; }
  let rules, exceptions; try { rules = await loadRules(opts.rules); exceptions = await loadExceptions(opts.exceptions, rules); } catch (error) { console.error(error.message); return 2; }
  if (!opts.binary) rules = {...rules, binaryAssets: undefined};
  let knownHosts = null;
  if (opts.inventory) { const inv = JSON.parse(await readFile(opts.inventory, 'utf8')); knownHosts = new Set((opts.keys || []).flatMap((k) => Object.keys(inv[k] || {}))); }
  const temp = [], roots = opts.roots.map((r) => path.resolve(r));
  try {
    for (const archive of opts.archives) { const dir = await unpack(path.resolve(archive), opts.tmp); temp.push(dir); roots.push(dir); }
    const result = await scan({roots, rules, exceptions, requireAttribution: opts.requireAttribution, manifests: opts.manifests.length ? opts.manifests : undefined, knownHosts});
    console.log(format(result));
    return result.problems.length ? 1 : 0;
  } finally { for (const d of temp) await rm(d, {recursive: true, force: true}); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) process.exitCode = await cli(process.argv.slice(2));
