import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'fetch-models.mjs');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const bytes = (n, seed) => Buffer.from(Array.from({length: n}, (_, i) => (i * 31 + seed) & 255));

const FILES = {
  'alpha/r1/a.bin': bytes(3000, 1),
  'alpha/r1/big.bin': bytes(300000, 2), // bigger than the 64 KiB the test server streams with
  'alpha/r1/c.json': bytes(1500, 3),
  'beta/r1/b.bin': bytes(2500, 4),
  'beta/r1/b2.bin': bytes(900, 5),
  'voice1/r1/v.onnx': bytes(4000, 6),
};
const entry = (p) => ({path: p, bytes: FILES[p].length, sha256: sha(FILES[p])});
const MANIFEST = {
  format: 'plc-models/1', root: 'https://host/models/',
  tiers: {alpha: ['alpha/r1/a.bin', 'alpha/r1/big.bin', 'alpha/r1/c.json'].map(entry), beta: ['beta/r1/b.bin', 'beta/r1/b2.bin'].map(entry)},
  voices: {v1: [entry('voice1/r1/v.onnx')]},
  embedding: [],
};

function startServer() {
  const s = {log: [], wrong: new Set(), ignoreRange: new Set(), cutOnce: new Set(), inflight: 0, maxInflight: 0, delay: 0};
  s.server = http.createServer(async (req, res) => {
    const rel = decodeURIComponent(req.url.replace(/^\/m\//, ''));
    s.log.push({path: rel, range: req.headers.range || null, ua: req.headers['user-agent'], cookie: req.headers.cookie || null});
    let body = FILES[rel];
    if (!body) { res.writeHead(404); res.end(); return; }
    if (s.wrong.has(rel)) body = Buffer.from(body).fill(7);
    s.inflight++; s.maxInflight = Math.max(s.maxInflight, s.inflight);
    res.on('close', () => { s.inflight--; });
    let start = 0;
    const m = /^bytes=(\d+)-/.exec(req.headers.range || '');
    if (m && !s.ignoreRange.has(rel)) { start = Number(m[1]); res.writeHead(206, {'Content-Range': `bytes ${start}-${body.length - 1}/${body.length}`, 'Content-Length': body.length - start}); }
    else res.writeHead(200, {'Content-Length': body.length});
    if (m && s.ignoreRange.has(rel)) start = 0;
    const cut = s.cutOnce.has(rel);
    if (cut) s.cutOnce.delete(rel);
    for (let at = start; at < body.length; at += 65536) {
      if (s.delay) await new Promise((r) => setTimeout(r, s.delay));
      if (cut && at >= start + 131072) { await new Promise((r) => setTimeout(r, 50)); res.destroy(); return; }
      res.write(body.subarray(at, Math.min(at + 65536, body.length)));
    }
    res.end();
  });
  return new Promise((resolve) => s.server.listen(0, '127.0.0.1', () => { s.base = `http://127.0.0.1:${s.server.address().port}/m/`; resolve(s); }));
}

function run(args, {env = {}, script = SCRIPT} = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...args], {env: {...process.env, ...env}, cwd: os.tmpdir()});
    let out = '', err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', (code) => resolve({code, out, err, all: out + err}));
  });
}

async function setup(t, manifest = MANIFEST) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'fetch-models-test-'));
  const server = await startServer();
  t.after(() => { server.server.close(); server.server.closeAllConnections?.(); fs.rmSync(scratch, {recursive: true, force: true}); });
  const manifestFile = path.join(scratch, 'models.json');
  fs.writeFileSync(manifestFile, JSON.stringify(manifest));
  const dest = path.join(scratch, 'out');
  const args = (...more) => ['--manifest', manifestFile, '--from', server.base, '--dir', dest, ...more];
  return {scratch, server, manifestFile, dest, args};
}
const listAll = (d) => fs.existsSync(d) ? fs.readdirSync(d, {recursive: true}).filter((f) => fs.statSync(path.join(d, f)).isFile()).sort() : [];

test('a full fetch of one tier writes verified files and nothing else', async (t) => {
  const c = await setup(t);
  const r = await run(c.args('--tier', 'alpha'));
  assert.equal(r.code, 0, r.all);
  for (const e of MANIFEST.tiers.alpha) assert.deepEqual(fs.readFileSync(path.join(c.dest, e.path)), FILES[e.path]);
  assert.deepEqual(listAll(c.dest), ['alpha/r1/a.bin', 'alpha/r1/big.bin', 'alpha/r1/c.json']);
  assert.ok(c.server.log.every((l) => l.path.startsWith('alpha/')), 'no request for another tier');
  assert.ok(c.server.log.every((l) => l.ua === 'fetch-models' && l.cookie === null));
  assert.match(r.out, /3 fetched, 0 skipped, 0 failed/);
});

test('--voices and --all add voices; an empty embedding list is said and not an error', async (t) => {
  const c = await setup(t);
  let r = await run(c.args('--tier', 'beta', '--voices', '--embedding'));
  assert.equal(r.code, 0, r.all);
  assert.deepEqual(listAll(c.dest), ['beta/r1/b.bin', 'beta/r1/b2.bin', 'voice1/r1/v.onnx']);
  assert.match(r.all, /embedding list in the manifest is empty/);
  r = await run(c.args('--all'));
  assert.equal(r.code, 0, r.all);
  assert.equal(listAll(c.dest).length, 6);
});

test('nothing named: refused with no request', async (t) => {
  const c = await setup(t);
  const r = await run(c.args());
  assert.notEqual(r.code, 0);
  assert.match(r.all, /name a tier with --tier.*or use --all/);
  assert.equal(c.server.log.length, 0);
  assert.ok(!fs.existsSync(c.dest));
});

test('an unknown tier is refused and the known ones are listed', async (t) => {
  const c = await setup(t);
  const r = await run(c.args('--tier', 'alpha,nope'));
  assert.notEqual(r.code, 0);
  assert.match(r.all, /Unknown tier "nope".*alpha, beta/);
  assert.equal(c.server.log.length, 0);
});

test('manifest refusals', async (t) => {
  const good = entry('alpha/r1/a.bin');
  const withEntry = (e) => ({...MANIFEST, tiers: {alpha: [e]}});
  const cases = [
    ['not format plc-models/1', {...MANIFEST, format: 'plc-models/2'}, /not format plc-models\/1/],
    ['absolute path', withEntry({...good, path: '/etc/x'}), /absolute path/],
    ['dot-dot path', withEntry({...good, path: 'a/../../x'}), /"\.\."/],
    ['backslash path', withEntry({...good, path: 'a\\b'}), /backslash/],
    ['negative size', withEntry({...good, bytes: -1}), /size/],
    ['fractional size', withEntry({...good, bytes: 1.5}), /size/],
    ['short sha256', withEntry({...good, sha256: 'abc'}), /64 hex digits/],
    ['non-hex sha256', withEntry({...good, sha256: 'z'.repeat(64)}), /64 hex digits/],
  ];
  for (const [name, manifest, pattern] of cases) {
    const c = await setup(t, manifest);
    const r = await run(c.args('--tier', 'alpha'));
    assert.notEqual(r.code, 0, name);
    assert.match(r.all, pattern, name);
    assert.equal(c.server.log.length, 0, name);
    assert.ok(!fs.existsSync(c.dest) && !fs.existsSync(path.join(c.scratch, 'x')), name);
  }
  // A bad entry in a tier that is not asked for still stops the run: all of the manifest is checked first.
  const c = await setup(t, {...MANIFEST, tiers: {...MANIFEST.tiers, bad: [{...good, path: '../x'}]}});
  assert.notEqual((await run(c.args('--tier', 'alpha'))).code, 0);
  // Missing and not JSON.
  const m = await setup(t);
  let r = await run(['--manifest', path.join(m.scratch, 'none.json'), '--from', m.server.base, '--tier', 'alpha']);
  assert.notEqual(r.code, 0); assert.match(r.all, /missing/);
  fs.writeFileSync(m.manifestFile, 'not json');
  r = await run(m.args('--tier', 'alpha'));
  assert.notEqual(r.code, 0); assert.match(r.all, /not JSON/);
});

test('--dry-run prints the plan and writes and requests nothing', async (t) => {
  const c = await setup(t);
  const r = await run(c.args('--tier', 'alpha', '--dry-run'));
  assert.equal(r.code, 0, r.all);
  assert.match(r.out, /tier alpha: 3 files/);
  assert.match(r.out, /Total to fetch: 3 files/);
  assert.equal(c.server.log.length, 0);
  assert.ok(!fs.existsSync(c.dest));
});

test('resume: a .part is continued with a Range request', async (t) => {
  const c = await setup(t);
  const rel = 'alpha/r1/big.bin';
  fs.mkdirSync(path.dirname(path.join(c.dest, rel)), {recursive: true});
  fs.writeFileSync(path.join(c.dest, rel + '.part'), FILES[rel].subarray(0, 150000));
  const r = await run(c.args('--tier', 'alpha'));
  assert.equal(r.code, 0, r.all);
  assert.equal(c.server.log.find((l) => l.path === rel).range, 'bytes=150000-');
  assert.deepEqual(fs.readFileSync(path.join(c.dest, rel)), FILES[rel]);
  assert.deepEqual(listAll(c.dest).filter((f) => f.endsWith('.part')), []);
});

test('a server that answers 200 to a Range request: the file is started again and right', async (t) => {
  const c = await setup(t);
  const rel = 'alpha/r1/big.bin';
  c.server.ignoreRange.add(rel);
  fs.mkdirSync(path.dirname(path.join(c.dest, rel)), {recursive: true});
  fs.writeFileSync(path.join(c.dest, rel + '.part'), FILES[rel].subarray(0, 100000));
  const r = await run(c.args('--tier', 'alpha'));
  assert.equal(r.code, 0, r.all);
  assert.deepEqual(fs.readFileSync(path.join(c.dest, rel)), FILES[rel]);
});

test('a .part larger than the pinned size is started again', async (t) => {
  const c = await setup(t);
  const rel = 'alpha/r1/a.bin';
  fs.mkdirSync(path.dirname(path.join(c.dest, rel)), {recursive: true});
  fs.writeFileSync(path.join(c.dest, rel + '.part'), Buffer.alloc(FILES[rel].length + 10, 9));
  const r = await run(c.args('--tier', 'alpha'));
  assert.equal(r.code, 0, r.all);
  assert.equal(c.server.log.find((l) => l.path === rel).range, null);
  assert.deepEqual(fs.readFileSync(path.join(c.dest, rel)), FILES[rel]);
});

test('a response cut short is retried and resumed', async (t) => {
  const c = await setup(t);
  const rel = 'alpha/r1/big.bin';
  c.server.cutOnce.add(rel);
  const r = await run(c.args('--tier', 'alpha'));
  assert.equal(r.code, 0, r.all);
  const calls = c.server.log.filter((l) => l.path === rel);
  assert.ok(calls.length >= 2 && calls.some((l) => l.range), JSON.stringify(calls));
  assert.deepEqual(fs.readFileSync(path.join(c.dest, rel)), FILES[rel]);
});

test('wrong bytes are refused and deleted; a second run with the server fixed completes', async (t) => {
  const c = await setup(t);
  const bad = 'alpha/r1/a.bin';
  c.server.wrong.add(bad);
  let r = await run(c.args('--tier', 'alpha'));
  assert.notEqual(r.code, 0);
  assert.match(r.all, /refused: wrong bytes/);
  assert.match(r.all, /1 failed/);
  assert.ok(!fs.existsSync(path.join(c.dest, bad)) && !fs.existsSync(path.join(c.dest, bad + '.part')));
  assert.deepEqual(fs.readFileSync(path.join(c.dest, 'alpha/r1/c.json')), FILES['alpha/r1/c.json']);
  c.server.wrong.clear();
  c.server.log.length = 0;
  r = await run(c.args('--tier', 'alpha'));
  assert.equal(r.code, 0, r.all);
  assert.deepEqual(c.server.log.map((l) => l.path), [bad], 'only the missing file is requested');
  assert.deepEqual(fs.readFileSync(path.join(c.dest, bad)), FILES[bad]);
});

test('skip, --deep and replace, and files that are not in the manifest are never touched', async (t) => {
  const c = await setup(t);
  const put = (rel, buf) => { fs.mkdirSync(path.dirname(path.join(c.dest, rel)), {recursive: true}); fs.writeFileSync(path.join(c.dest, rel), buf); };
  put('alpha/r1/a.bin', FILES['alpha/r1/a.bin']);                       // verified
  put('alpha/r1/c.json', Buffer.alloc(FILES['alpha/r1/c.json'].length, 1)); // right size, wrong bytes
  put('alpha/r1/big.bin', Buffer.alloc(10));                              // wrong size
  put('alpha/r1/stranger.txt', 'mine');
  put('other/x.bin', 'mine too');
  let r = await run(c.args('--tier', 'alpha'));
  assert.equal(r.code, 0, r.all);
  assert.deepEqual(c.server.log.map((l) => l.path), ['alpha/r1/big.bin'], 'a verified file and a same-size file are skipped');
  assert.deepEqual(fs.readFileSync(path.join(c.dest, 'alpha/r1/big.bin')), FILES['alpha/r1/big.bin']);
  assert.notDeepEqual(fs.readFileSync(path.join(c.dest, 'alpha/r1/c.json')), FILES['alpha/r1/c.json']);
  c.server.log.length = 0;
  r = await run(c.args('--tier', 'alpha', '--deep'));
  assert.equal(r.code, 0, r.all);
  assert.deepEqual(c.server.log.map((l) => l.path), ['alpha/r1/c.json'], '--deep replaces the one with wrong bytes only');
  assert.deepEqual(fs.readFileSync(path.join(c.dest, 'alpha/r1/c.json')), FILES['alpha/r1/c.json']);
  assert.equal(fs.readFileSync(path.join(c.dest, 'alpha/r1/stranger.txt'), 'utf8'), 'mine');
  assert.equal(fs.readFileSync(path.join(c.dest, 'other/x.bin'), 'utf8'), 'mine too');
});

test('too little free disk space is refused before any request', async (t) => {
  const c = await setup(t);
  const r = await run(c.args('--tier', 'alpha'), {env: {FETCH_MODELS_FREE_BYTES: '1000'}});
  assert.notEqual(r.code, 0);
  assert.match(r.all, /Not enough free disk space.*1000 bytes free/);
  assert.equal(c.server.log.length, 0);
  assert.deepEqual(listAll(c.dest), []);
});

test('--from: a non-local http base is refused, an https base and a missing slash are judged by syntax', async (t) => {
  const c = await setup(t);
  const base = ['--manifest', c.manifestFile, '--dir', c.dest, '--tier', 'alpha', '--dry-run'];
  let r = await run([...base, '--from', 'http:' + '//example.org/m/']);
  assert.notEqual(r.code, 0); assert.match(r.all, /https address/);
  r = await run([...base, '--from', 'https:' + '//example.org/m']);
  assert.notEqual(r.code, 0); assert.match(r.all, /must end in \//);
  r = await run([...base, '--from', 'https:' + '//example.org/m/']);
  assert.equal(r.code, 0, r.all);
  assert.ok(!fs.existsSync(c.dest));
});

test('default source: the operator root config, then the shipped page', async (t) => {
  const c = await setup(t);
  const root = path.join(c.scratch, 'root');
  const conf = (base) => { fs.mkdirSync(path.join(root, 'config'), {recursive: true}); fs.writeFileSync(path.join(root, 'config', 'app-config.json'), JSON.stringify({format: 'plc-app-config/1', modelSources: [{id: 'x', label: 'x', base}]})); };
  const common = ['--manifest', c.manifestFile, '--root', root, '--tier', 'beta'];
  conf(c.server.base);
  let r = await run(common);
  assert.equal(r.code, 0, r.all);
  assert.deepEqual(listAll(path.join(root, 'models')), ['beta/r1/b.bin', 'beta/r1/b2.bin']);
  assert.ok(c.server.log.length === 2);
  conf('/models/');
  r = await run(common);
  assert.notEqual(r.code, 0); assert.match(r.all, /own disk.*--from/);
  fs.rmSync(path.join(root, 'config'), {recursive: true});
  fs.rmSync(path.join(root, 'models'), {recursive: true});
  // A copy of the script with no page beside it.
  const lone = path.join(c.scratch, 'lone'); fs.mkdirSync(lone);
  fs.copyFileSync(SCRIPT, path.join(lone, 'fetch-models.mjs'));
  r = await run(common.concat('--dry-run'), {script: path.join(lone, 'fetch-models.mjs')});
  assert.notEqual(r.code, 0); assert.match(r.all, /app\/index\.html.*--from/);
  // With the page, whose script carries the source.
  fs.mkdirSync(path.join(lone, 'app'));
  const cfg = {format: 'plc-app-config/1', modelSources: [{id: 'p', label: 'p', base: c.server.base}]};
  fs.writeFileSync(path.join(lone, 'app', 'index.html'), '<html><script>window.APP_CONFIG=' + JSON.stringify(cfg).replace(/</g, '\\u003c') + ';</script></html>');
  c.server.log.length = 0;
  r = await run(common, {script: path.join(lone, 'fetch-models.mjs')});
  assert.equal(r.code, 0, r.all);
  assert.equal(c.server.log.length, 2);
});

test('--use-local creates the config when absent, leaves an existing one alone, and needs --root', async (t) => {
  const c = await setup(t);
  const root = path.join(c.scratch, 'root');
  const file = path.join(root, 'config', 'app-config.json');
  const args = ['--manifest', c.manifestFile, '--from', c.server.base, '--root', root, '--tier', 'beta', '--use-local'];
  let r = await run(args);
  assert.equal(r.code, 0, r.all);
  assert.equal(fs.readFileSync(file, 'utf8'), '{ "format": "plc-app-config/1", "modelSources": [ { "id": "this-host", "label": "This computer", "base": "/models/" } ] }\n');
  const mine = '{"format":"plc-app-config/1","modelSources":[]}';
  fs.writeFileSync(file, mine);
  r = await run(args);
  assert.equal(r.code, 0, r.all);
  assert.equal(fs.readFileSync(file, 'utf8'), mine);
  assert.match(r.out, /already exists and was left alone/);
  assert.match(r.out, /"base": "\/models\/"/);
  r = await run(['--manifest', c.manifestFile, '--from', c.server.base, '--dir', c.dest, '--tier', 'beta', '--use-local']);
  assert.notEqual(r.code, 0); assert.match(r.all, /--use-local needs --root/);
  // Without --use-local the snippet is printed and no config is written.
  fs.rmSync(path.join(root, 'config'), {recursive: true});
  fs.rmSync(path.join(root, 'models'), {recursive: true});
  r = await run(args.slice(0, -1));
  assert.equal(r.code, 0, r.all);
  assert.ok(!fs.existsSync(file));
  assert.match(r.out, /"base": "\/models\/"/);
});

test('use-local is not applied when the run failed', async (t) => {
  const c = await setup(t);
  c.server.wrong.add('beta/r1/b.bin');
  const root = path.join(c.scratch, 'root');
  const r = await run(['--manifest', c.manifestFile, '--from', c.server.base, '--root', root, '--tier', 'beta', '--use-local']);
  assert.notEqual(r.code, 0);
  assert.ok(!fs.existsSync(path.join(root, 'config')));
});

test('no more than three requests are in flight at once', async (t) => {
  const many = {};
  const files = {};
  for (let i = 0; i < 8; i++) { const p = `many/r1/f${i}.bin`; files[p] = bytes(200000, 10 + i); many[p] = {path: p, bytes: files[p].length, sha256: sha(files[p])}; }
  Object.assign(FILES, files);
  t.after(() => { for (const p of Object.keys(files)) delete FILES[p]; });
  const c = await setup(t, {...MANIFEST, tiers: {many: Object.values(many)}});
  c.server.delay = 20;
  const r = await run(c.args('--tier', 'many'));
  assert.equal(r.code, 0, r.all);
  assert.ok(c.server.maxInflight >= 2 && c.server.maxInflight <= 3, 'max in flight: ' + c.server.maxInflight);
});
