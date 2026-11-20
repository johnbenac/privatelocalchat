// The standalone Kokoro engine's main-thread side (ops/voice/standalone/engine.mjs, docs/VOICE-STANDALONE.md): the pinned file list, the download with its size and SHA-256 checks BEFORE
// anything is used, the cache of verified files, the protocol with the worker, cancel, and parallel use. The worker and the network are fakes here; the real worker, the real model and the
// strict page policy are in tests/e2e/kokoro-standalone.e2e.mjs. Negative controls: each guard is broken once in a copy of the engine and a test must fail. Synthetic data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createKokoroEngine as realEngine, validateFiles, sha256Hex, KokoroEngineError } from '../ops/voice/standalone/engine.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hex = (b) => crypto.createHash('sha256').update(b).digest('hex');
const BASE = 'https://cdn.example/models/k/1/';

// ---- a small synthetic file set ----
const body = (n, seed) => Uint8Array.from({ length: n }, (_, i) => (i * 31 + seed) & 255);
const CONTENT = {
  'onnx/model_quantized.onnx': body(4096, 1), 'tokenizer.json': new TextEncoder().encode('{"model":{"vocab":{}}}'), 'tokenizer_config.json': new TextEncoder().encode('{}'),
  'config.json': new TextEncoder().encode('{"a":1}'), 'voices/af_heart.bin': body(2048, 2), 'voices/am_michael.bin': body(2048, 3), 'voices/af_alloy.bin': body(2048, 4)
};
const roleOf = (p) => (p.startsWith('voices/') ? 'voice' : p.startsWith('onnx/') ? 'model' : p.replace('.json', ''));
const FILES = Object.entries(CONTENT).map(([p, b]) => ({ path: p, role: roleOf(p), bytes: b.length, sha256: hex(b) }));

// ---- fakes ----
function fakeNetwork({ tamper = {}, truncate = {}, extend = {}, status = {}, lieLength = {}, throwOn = {} } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    const p = url.slice(BASE.length); calls.push(p);
    if (options?.signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    if (throwOn[p]) throw new Error('connection refused');
    if (status[p]) return new Response('nope', { status: status[p] });
    let b = Uint8Array.from(CONTENT[p]);
    if (tamper[p]) b[tamper[p] - 1] ^= 1;
    if (truncate[p]) b = b.slice(0, b.length - truncate[p]);
    if (extend[p]) b = Uint8Array.from([...b, ...new Uint8Array(extend[p])]);
    const headers = { 'content-length': String(lieLength[p] ?? b.length) };
    return new Response(b, { status: 200, headers });
  };
  return { fetchImpl, calls };
}
class FakeWorker {
  static instances = [];
  constructor(url, options) { this.url = url; this.options = options; this.log = []; this.terminated = false; FakeWorker.instances.push(this); }
  postMessage(msg, transfer) { this.log.push({ msg, transfer }); queueMicrotask(() => this.handle(msg)); }
  terminate() { this.terminated = true; }
  reply(payload) { this.onmessage({ data: payload }); }
  handle(msg) {
    if (msg.op === 'load') return this.reply({ id: msg.id, ok: true, voices: Object.keys(msg.voices), loadMs: 5 });
    if (msg.op === 'unload') return this.reply({ id: msg.id, ok: true });
    if (msg.op === 'speak') {
      const parts = msg.text.split('. ').filter(Boolean); this.speaking = msg.id;
      (async () => {
        let n = 0;
        for (const [index, text] of parts.entries()) {
          await new Promise((r) => setTimeout(r, 5));
          if (this.cancelled?.has(msg.id)) break;
          this.reply({ id: msg.id, event: 'chunk', samples: new Float32Array(240).fill(index + 1), index, count: parts.length, text, ipa: 'p' + index }); n += 1;
        }
        this.reply({ id: msg.id, ok: true, chunks: n, samples: n * 240, synthMs: 10, firstAudioMs: 5, sampleRate: 24000, cancelled: Boolean(this.cancelled?.has(msg.id)) });
      })();
    }
    if (msg.op === 'cancel') (this.cancelled ??= new Set()).add(msg.target);
  }
}
const memoryCache = () => { const m = new Map(); return { m, puts: [], deletes: [], async get(u) { return m.get(u) ?? null; }, async put(u, b) { this.puts.push(u); m.set(u, b); }, async delete(u) { this.deletes.push(u); m.delete(u); } }; };
function make({ network = fakeNetwork(), cache = memoryCache(), createKokoroEngine = realEngine, subtle = 'auto' } = {}) {
  FakeWorker.instances = [];
  const engine = createKokoroEngine({ workerUrl: 'https://page.example/worker-kokoro-standalone.js', fetchImpl: network.fetchImpl, WorkerImpl: FakeWorker, cache, subtle });
  return { engine, network, cache, worker: () => FakeWorker.instances[0] };
}
const rejectsWith = async (promise, code) => assert.rejects(promise, (e) => e instanceof Error && e.code === code, 'expected ' + code);

// ---- SHA-256 and the file list ----
test('the JavaScript SHA-256 equals the real one, on every block boundary and for the standard vectors', () => {
  assert.equal(sha256Hex(new Uint8Array(0)), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(sha256Hex(new TextEncoder().encode('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(sha256Hex(new Uint8Array(1000000).fill(97)), 'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0');
  for (const n of [1, 54, 55, 56, 57, 63, 64, 65, 119, 120, 121, 127, 128, 129, 1000]) { const b = crypto.randomBytes(n); assert.equal(sha256Hex(b), hex(b), 'length ' + n); }
});
test('the file list: a good one is accepted and gives the voice ids and the total', () => {
  const v = validateFiles(BASE, FILES);
  assert.deepEqual(v.voices, ['af_heart', 'am_michael', 'af_alloy']); assert.equal(v.totalBytes, FILES.reduce((n, f) => n + f.bytes, 0)); assert.equal(v.base, BASE);
});
test('the file list: every kind of bad input is refused with a stable code', () => {
  const bad = (mutate) => { const f = FILES.map((x) => ({ ...x })); mutate(f); return f; };
  assert.throws(() => validateFiles('cdn/relative/', FILES), (e) => e.code === 'bad-config');
  assert.throws(() => validateFiles('https://cdn.example/no-slash', FILES), (e) => e.code === 'bad-config');
  assert.throws(() => validateFiles('https://cdn.example/a/?x=1', FILES), (e) => e.code === 'bad-config');
  assert.throws(() => validateFiles('javascript:alert(1)//', FILES), (e) => e.code === 'bad-config');
  for (const [name, mutate] of Object.entries({
    'a path that climbs': (f) => { f[1].path = '../tokenizer.json'; }, 'an absolute path': (f) => { f[1].path = '/etc/passwd'; }, 'a dotted segment': (f) => { f[1].path = 'a/./b.json'; },
    'an unknown role': (f) => { f[1].role = 'script'; }, 'a zero size': (f) => { f[1].bytes = 0; }, 'a fractional size': (f) => { f[1].bytes = 1.5; },
    'a short hash': (f) => { f[1].sha256 = 'abc'; }, 'an upper-case hash': (f) => { f[1].sha256 = f[1].sha256.toUpperCase(); }, 'a repeated path': (f) => { f.push({ ...f[1] }); },
    'no model': (f) => { f.splice(0, 1); }, 'no voice': (f) => f.splice(4, 3), 'two voices of one name': (f) => { f.push({ ...f[4], path: 'other/af_heart.bin' }); }
  })) assert.throws(() => validateFiles(BASE, bad(mutate)), (e) => e instanceof KokoroEngineError && e.code === 'bad-file-list', name);
  assert.throws(() => validateFiles(BASE, []), (e) => e.code === 'bad-file-list');
});

// ---- load: every file is checked before use ----
test('load fetches every file once, verifies it, caches only verified files, and hands the bytes to the worker with transfer', async () => {
  const t = make();
  assert.equal(t.engine.init({ base: BASE, files: FILES }).voices.length, 3);
  const progress = [];
  const r = await t.engine.load({ onProgress: (p) => progress.push(p.bytesDone) });
  assert.deepEqual(r.voices, ['af_heart', 'am_michael', 'af_alloy']);
  assert.deepEqual([...t.network.calls].sort(), FILES.map((f) => f.path).sort(), 'each file once');
  assert.equal(t.cache.puts.length, FILES.length);
  const load = t.worker().log.find((x) => x.msg.op === 'load');
  assert.ok(load.msg.model instanceof ArrayBuffer && load.msg.model.byteLength === 4096 || load.msg.model.byteLength === 0, 'the model is an ArrayBuffer'); // detached after transfer in a real worker
  assert.equal(load.msg.tokenizer, '{"model":{"vocab":{}}}'); assert.deepEqual(Object.keys(load.msg.voices), ['af_heart', 'am_michael', 'af_alloy']);
  assert.equal(load.transfer.length, 4, 'the model and the three voices are transferred, not copied');
  assert.ok(progress.at(-1) === t.engine.status().totalBytes && progress.every((v, i) => !i || v >= progress[i - 1]), 'progress grows to the total');
  assert.equal(t.worker().options.type, 'module'); assert.equal(t.engine.status().state, 'ready');
});
const REFUSALS = [
  ['a corrupted voice file (one bit)', { tamper: { 'voices/am_michael.bin': 100 } }, 'bad-hash', 'voices/am_michael.bin'],
  ['a corrupted model file (one bit)', { tamper: { 'onnx/model_quantized.onnx': 4000 } }, 'bad-hash', 'onnx/model_quantized.onnx'],
  ['a truncated model', { truncate: { 'onnx/model_quantized.onnx': 1 } }, 'bad-size', 'onnx/model_quantized.onnx'],
  ['a file that is too long', { extend: { 'tokenizer.json': 5 } }, 'bad-size', 'tokenizer.json'],
  ['a server that announces another length', { lieLength: { 'config.json': 9999 } }, 'bad-size', 'config.json'],
  ['an HTTP error', { status: { 'voices/af_alloy.bin': 404 } }, 'http-error', 'voices/af_alloy.bin'],
  ['a refused connection', { throwOn: { 'voices/af_heart.bin': true } }, 'network', 'voices/af_heart.bin']
];
for (const [name, faults, code, file] of REFUSALS) {
  test(`${name} is refused with ${code}: no worker is started, the bad file is not cached, and a later good load works`, async () => {
    const t = make({ network: fakeNetwork(faults) });
    t.engine.init({ base: BASE, files: FILES });
    await assert.rejects(() => t.engine.load(), (e) => e.code === code && e.path === file);
    assert.equal(FakeWorker.instances.length, 0, 'nothing reached a worker');
    assert.ok(!t.cache.puts.includes(BASE + file), 'the bad file was not cached');
    assert.equal(t.engine.status().state, 'initialised'); await rejectsWith(t.engine.speak('x'), 'not-loaded');
    const good = make({ network: fakeNetwork(), cache: t.cache }); good.engine.init({ base: BASE, files: FILES });   // a fresh network, the same cache: still works
    assert.equal((await good.engine.load()).voices.length, 3);
  });
}
test('a cached file is used only if it still passes both checks: a tampered cache entry is deleted and fetched again', async () => {
  const cache = memoryCache(); const first = make({ cache }); first.engine.init({ base: BASE, files: FILES }); await first.engine.load();
  const url = BASE + 'voices/af_heart.bin'; const tampered = Uint8Array.from(CONTENT['voices/af_heart.bin']); tampered[7] ^= 1; cache.m.set(url, tampered);
  const second = make({ cache, network: fakeNetwork() }); second.engine.init({ base: BASE, files: FILES });
  const r = await second.engine.load();
  assert.deepEqual(second.network.calls, ['voices/af_heart.bin'], 'only the tampered file was fetched again');
  assert.equal(r.fromCache.length, FILES.length - 1); assert.ok(cache.deletes.includes(url));
  assert.deepEqual([...cache.m.get(url)], [...CONTENT['voices/af_heart.bin']], 'the cache now holds the verified bytes');
});
test('the JavaScript SHA-256 path loads the same set (a page with no crypto.subtle)', async () => {
  const t = make({ subtle: 'js' }); t.engine.init({ base: BASE, files: FILES });
  assert.equal(t.engine.status().sha256, 'js'); assert.equal((await t.engine.load()).voices.length, 3);
  const bad = make({ subtle: 'js', network: fakeNetwork({ tamper: { 'config.json': 2 } }) }); bad.engine.init({ base: BASE, files: FILES });
  await rejectsWith(bad.engine.load(), 'bad-hash');
});
test('a load that is cancelled stops with aborted and starts no worker', async () => {
  const t = make(); t.engine.init({ base: BASE, files: FILES }); const ac = new AbortController(); ac.abort();
  await rejectsWith(t.engine.load({ signal: ac.signal }), 'aborted'); assert.equal(FakeWorker.instances.length, 0);
});
test('load before init, and a second load while one runs, are refused', async () => {
  const t = make(); await rejectsWith(t.engine.load(), 'bad-config');
  t.engine.init({ base: BASE, files: FILES }); const a = t.engine.load(); await rejectsWith(t.engine.load(), 'bad-config'); await a;
});

// ---- speak, cancel, unload, parallel use ----
test('speak gives the chunks in order with sample rate, text and ipa; an unknown voice and a speak before load are refused', async () => {
  const t = make(); t.engine.init({ base: BASE, files: FILES }); await rejectsWith(t.engine.speak('Hi.'), 'not-loaded'); await t.engine.load();
  const got = []; const r = await t.engine.speak('One. Two. Three.', { voice: 'af_alloy', speed: 1.1, onChunk: (c) => got.push(c) });
  assert.deepEqual(got.map((c) => [c.index, c.count, c.text, c.ipa, c.sampleRate, c.samples.length]), [[0, 3, 'One', 'p0', 24000, 240], [1, 3, 'Two', 'p1', 24000, 240], [2, 3, 'Three.', 'p2', 24000, 240]]);
  assert.equal(r.chunks, 3); assert.equal(r.audioSeconds, 720 / 24000);
  const sent = t.worker().log.filter((x) => x.msg.op === 'speak').at(-1).msg; assert.equal(sent.voice, 'af_alloy'); assert.equal(sent.speed, 1.1);
  await rejectsWith(t.engine.speak('Hi.', { voice: 'bf_emma' }), 'unknown-voice');
});
test('cancel (and an aborted signal) stops after the chunk in progress; the chunks already given stay given', async () => {
  const t = make(); t.engine.init({ base: BASE, files: FILES }); await t.engine.load();
  const got = []; const p = t.engine.speak('A. B. C. D. E. F.', { onChunk: (c) => { got.push(c.index); if (got.length === 2) t.engine.cancel(); } });
  const r = await p; assert.ok(r.cancelled, 'reported as cancelled'); assert.ok(got.length >= 2 && got.length < 6, 'stopped early: ' + got.length);
  const ac = new AbortController(); const got2 = []; const p2 = t.engine.speak('A. B. C. D. E. F.', { signal: ac.signal, onChunk: (c) => { got2.push(c.index); if (got2.length === 1) ac.abort(); } });
  const r2 = await p2; assert.ok(r2.cancelled && got2.length < 6);
});
test('two speaks at once keep their chunks apart (one worker, ids per request)', async () => {
  const t = make(); t.engine.init({ base: BASE, files: FILES }); await t.engine.load();
  const a = [], b = [];
  await Promise.all([t.engine.speak('a1. a2. a3.', { onChunk: (c) => a.push(c.text) }), t.engine.speak('b1. b2.', { onChunk: (c) => b.push(c.text) })]);
  assert.deepEqual(a, ['a1', 'a2', 'a3.']); assert.deepEqual(b, ['b1', 'b2.']);
});
test('unload ends the worker and frees the state; the engine can load again', async () => {
  const t = make(); t.engine.init({ base: BASE, files: FILES }); await t.engine.load(); const w = t.worker();
  await t.engine.unload(); assert.ok(w.terminated); assert.equal(t.engine.status().state, 'initialised'); await rejectsWith(t.engine.speak('x'), 'not-loaded');
  const again = await t.engine.load(); assert.equal(again.voices.length, 3); assert.equal(FakeWorker.instances.length, 2);
});
test('a worker that stops mid-speak rejects the speak with worker-failed', async () => {
  const t = make(); t.engine.init({ base: BASE, files: FILES }); await t.engine.load();
  const p = t.engine.speak('One. Two. Three.'); setTimeout(() => t.worker().onerror({ message: 'crashed' }), 8);
  await rejectsWith(p, 'worker-failed');
});
test('parallel loads of different engines share nothing but the cache; each ends with its own verified set', async () => {
  const cache = memoryCache(); const engines = Array.from({ length: 6 }, () => make({ cache }));
  for (const e of engines) e.engine.init({ base: BASE, files: FILES });
  const results = await Promise.all(engines.map((e) => e.engine.load()));
  assert.ok(results.every((r) => r.voices.length === 3));
  for (const f of FILES) assert.deepEqual([...cache.m.get(BASE + f.path)], [...CONTENT[f.path]], 'the cache holds only verified bytes: ' + f.path);
});

// ---- negative controls: break each guard once in a copy of the engine ----
const SOURCE = fs.readFileSync(path.join(ROOT, 'ops/voice/standalone/engine.mjs'), 'utf8');
async function broken(...pairs) {
  let source = SOURCE;
  for (let i = 0; i < pairs.length; i += 2) { assert.ok(source.includes(pairs[i]), 'the control transform applies: ' + pairs[i].slice(0, 50)); source = source.replace(pairs[i], pairs[i + 1]); }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kokoro-break-')); const file = path.join(dir, 'engine.mjs');
  fs.writeFileSync(file, source);
  try { return (await import(pathToFileURL(file).href + '?x=' + Math.random())).createKokoroEngine; } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
const loads = async (createKokoroEngine, faults) => { const t = make({ createKokoroEngine, network: fakeNetwork(faults) }); t.engine.init({ base: BASE, files: FILES }); try { await t.engine.load(); return 'loaded'; } catch (e) { return e.code; } };
test('control: without the SHA-256 check a corrupted file would be loaded', async () => {
  assert.equal(await loads(realEngine, { tamper: { 'voices/af_heart.bin': 9 } }), 'bad-hash');
  assert.equal(await loads(await broken('if ((await digestHex(out, sub)) !== file.sha256) throw', 'if (false) throw'), { tamper: { 'voices/af_heart.bin': 9 } }), 'loaded');
});
test('control: the size is guarded twice (the announced length and the bytes received) and the hash a third time: break them one by one', async () => {
  const fault = { truncate: { 'config.json': 1 } };
  assert.equal(await loads(realEngine, fault), 'bad-size');
  const noReceived = await broken('if (got !== file.bytes) throw', 'if (false) throw');
  assert.equal(await loads(noReceived, fault), 'bad-size', 'the announced length still refuses it');
  const noAnnounced = await broken('declared !== file.bytes) {', 'false) {');
  assert.equal(await loads(noAnnounced, fault), 'bad-size', 'the received count still refuses it');
  const neither = await broken('if (got !== file.bytes) throw', 'if (false) throw', 'declared !== file.bytes) {', 'false) {');
  assert.equal(await loads(neither, fault), 'bad-hash', 'with both size guards gone only the hash refuses a truncated file');
  const nothing = await broken('if (got !== file.bytes) throw', 'if (false) throw', 'declared !== file.bytes) {', 'false) {', 'if ((await digestHex(out, sub)) !== file.sha256) throw', 'if (false) throw');
  assert.equal(await loads(nothing, fault), 'loaded', 'with all three gone a truncated file loads: the guards are what stops it');
});
test('control: a cache that is not re-verified would serve tampered bytes', async () => {
  const cache = memoryCache(); const first = make({ cache }); first.engine.init({ base: BASE, files: FILES }); await first.engine.load();
  const url = BASE + 'voices/af_heart.bin'; const bad = Uint8Array.from(CONTENT['voices/af_heart.bin']); bad[3] ^= 1; cache.m.set(url, bad);
  const createKokoroEngine = await broken('if (hit && hit.length === file.bytes && (await digestHex(hit, sub)) === file.sha256)', 'if (hit)');
  const t = make({ cache, createKokoroEngine }); t.engine.init({ base: BASE, files: FILES }); await t.engine.load();
  assert.equal(t.network.calls.length, 0, 'the broken engine used the tampered cache entry without fetching');
});
test('control: a bad file must not be cached: caching before verifying would keep it', async () => {
  const createKokoroEngine = await broken('if ((await digestHex(out, sub)) !== file.sha256) throw fail("bad-hash", `${file.path}: the SHA-256 is not the pinned one, the file was refused`, { path: file.path });', 'try { await store.put(url, out); } catch {}');
  const t = make({ createKokoroEngine, network: fakeNetwork({ tamper: { 'voices/af_heart.bin': 9 } }) }); t.engine.init({ base: BASE, files: FILES }); await t.engine.load();
  assert.ok(t.cache.puts.length > 0);   // (the hash check is gone in this copy, so the point is shown by the next line: the real engine never gets here)
  assert.deepEqual([...t.cache.m.get(BASE + 'voices/af_heart.bin')].slice(0, 12), [...CONTENT['voices/af_heart.bin']].map((v, i) => (i === 8 ? v ^ 1 : v)).slice(0, 12), 'the corrupted bytes were cached by the broken copy');
});
