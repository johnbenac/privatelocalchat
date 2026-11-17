import test from 'node:test';
import assert from 'node:assert/strict';
import { runComputeProbe, buildDotModule, measureKernel } from '../chat/voice/voice-probe.mjs';

test('the hand-assembled wasm module is valid and computes a dot product', () => {
  const bytes = buildDotModule();
  assert.ok(WebAssembly.validate(bytes));
  const inst = new WebAssembly.Instance(new WebAssembly.Module(bytes), {});
  const f = new Float32Array(inst.exports.mem.buffer);
  for (let i = 0; i < 8; i++) { f[i] = i + 1; f[4096 + i] = 2; }
  assert.equal(inst.exports.dot(8, 1), 72);
  assert.equal(inst.exports.dot(8, 3), 216);
  assert.equal(inst.exports.dot(8, 0), 0);
});

test('measureKernel works with wasm and falls back to a JS loop without it', () => {
  const clock = () => performance.now();
  const w = measureKernel(buildDotModule(), 256, 50, 3, clock);
  const j = measureKernel(null, 256, 50, 3, clock);
  assert.equal(w.backend, 'wasm');
  assert.equal(j.backend, 'js');
  for (const r of [w, j]) { assert.ok(Number.isFinite(r.ms) && r.ms >= 0); assert.ok(r.sink); }
});

// A fake worker that answers through the real kernel, like the Blob worker does.
const kernelWorker = (reply) => () => {
  const w = { terminated: false, terminate() { this.terminated = true; }, postMessage(d) { setImmediate(() => w.onmessage({ data: reply(d) })); } };
  return w;
};

test('runComputeProbe returns the worker measurement and terminates the worker', async () => {
  let made;
  const factory = () => (made = kernelWorker((d) => ({ ok: true, ...measureKernel(d.wasm, 256, 20, 2, () => performance.now()) }))());
  const r = await runComputeProbe({ workerFactory: factory });
  assert.ok(Number.isFinite(r.ms) && r.ms >= 0);
  assert.equal(r.backend, 'wasm');
  assert.ok(made.terminated);
});

test('the result is normalised so a slower device reports a larger ms', async () => {
  const run = (ms) => runComputeProbe({ workerFactory: kernelWorker(() => ({ ok: true, ms, backend: 'wasm' })) });
  const [fast, slow] = [await run(100), await run(900)];
  assert.ok(fast.ms < slow.ms);
});

test('a worker that never answers times out with the cap, not a hang', async () => {
  let t = 0;
  const w = { terminated: false, terminate() { this.terminated = true; }, postMessage() {} };
  const r = await runComputeProbe({ workerFactory: () => w, timeoutMs: 80, now: () => (t += 40) });
  assert.deepEqual(r, { ms: 80, backend: 'unknown', samples: [], timedOut: true });
  assert.ok(w.terminated);
});

test('a result above the cap is clamped to the cap', async () => {
  const r = await runComputeProbe({ timeoutMs: 500, workerFactory: kernelWorker(() => ({ ok: true, ms: 9999, backend: 'js' })) });
  assert.equal(r.ms, 500);
});

test('worker creation failure, worker error and a bad reply all give the cap and never reject', async () => {
  assert.equal((await runComputeProbe({ timeoutMs: 700, workerFactory: () => { throw new Error('no Worker'); } })).ms, 700);
  const errW = () => ({ terminate() {}, postMessage() { setImmediate(() => errW.w.onerror({ message: 'boom' })); } });
  const w = errW(); errW.w = w;
  assert.equal((await runComputeProbe({ timeoutMs: 700, workerFactory: () => w })).ms, 700);
  assert.equal((await runComputeProbe({ timeoutMs: 700, workerFactory: kernelWorker(() => ({ ok: false, error: 'x' })) })).ms, 700);
});

test('one call measures three times and reports the median with the samples', async () => {
  const seq = [300, 100, 200]; let made = 0;
  const factory = () => kernelWorker(() => ({ ok: true, ms: seq[made++], backend: 'wasm' }))();
  const r = await runComputeProbe({ workerFactory: factory });
  assert.equal(made, 3);
  assert.deepEqual(r, { ms: 200, backend: 'wasm', samples: [300, 100, 200] });
});

test('one outlier run does not move the median (the S8+ swung 2x between runs)', async () => {
  const seq = [140, 4000, 150]; let made = 0;
  const r = await runComputeProbe({ timeoutMs: 20000, workerFactory: () => kernelWorker(() => ({ ok: true, ms: seq[made++], backend: 'wasm' }))() });
  assert.equal(r.ms, 150);
});

test('a slow device stops early so the whole call stays inside the hard timeout', async () => {
  let made = 0, t = 0;
  const r = await runComputeProbe({ timeoutMs: 4000, now: () => t, workerFactory: () => kernelWorker(() => { made++; t += 1900; return { ok: true, ms: 1900, backend: 'wasm' }; })() });
  assert.equal(made, 1, 'a 1,900 ms run leaves no room for a second one');
  assert.deepEqual(r.samples, [1900]); assert.equal(r.ms, 1900);
});

test('a run that fails after good runs keeps the good ones; a first-run failure reports the cap', async () => {
  const replies = [{ ok: true, ms: 120, backend: 'wasm' }, { ok: false, error: 'x' }]; let n = 0;
  const r = await runComputeProbe({ workerFactory: () => kernelWorker(() => replies[n++])() });
  assert.deepEqual(r, { ms: 120, backend: 'wasm', samples: [120] });
  const bad = await runComputeProbe({ timeoutMs: 700, workerFactory: kernelWorker(() => ({ ok: false, error: 'x' })) });
  assert.equal(bad.ms, 700); assert.equal(bad.error, 'x'); assert.deepEqual(bad.samples, []);
});
