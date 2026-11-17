// Runs the compute probe and the storage check in real headless Chromium; OPFS must hold the same files afterwards.
import { readFile } from 'node:fs/promises';
import { launch, assert } from './harness.mjs';

const h = await launch({ port: 18291 });
try {
  const { page } = h;
  // the modules are imported from Blob URLs built from the source files, so the test does not depend on the release path
  const src = async (f) => readFile(new URL('../../chat/' + f, import.meta.url), 'utf8');
  const vp = { code: await src('voice/voice-probe.mjs') }, sc = { code: await src('storage-check.mjs') };
  const opfsBytes = () => page.evaluate(async () => {
    const root = await navigator.storage.getDirectory(); let n = 0, size = 0; const names = [];
    for await (const [nm, hd] of root.entries()) { if (hd.kind !== 'file') continue; n++; names.push(nm); size += (await hd.getFile()).size; }
    return { n, size, names };
  });
  const before = await opfsBytes();

  const probes = await page.evaluate(async (url) => {
    const { runComputeProbe } = await import(URL.createObjectURL(new Blob([url.code], { type: 'text/javascript' })));
    const out = [];
    for (let i = 0; i < 3; i++) { const t = performance.now(); const r = await runComputeProbe(); out.push({ ...r, wallMs: Math.round(performance.now() - t) }); }
    return out;
  }, vp);
  console.log('probe results', JSON.stringify(probes));
  for (const p of probes) {
    assert(Number.isFinite(p.ms) && p.ms > 0, 'probe ms finite'); assert(!p.timedOut && !p.error, 'probe did not time out');
    assert(Array.isArray(p.samples) && p.samples.length === 3, 'one call took three samples');
    assert([...p.samples].sort((a, b) => a - b)[1] === p.ms, 'the result is the median of the samples');
    assert(p.wallMs < 4000, 'the three samples fit well inside the hard timeout: ' + p.wallMs + ' ms');
  }

  const noWasm = await page.evaluate(async (url) => {
    const { runComputeProbe, measureKernel } = await import(URL.createObjectURL(new Blob([url.code], { type: 'text/javascript' })));
    return { page: await runComputeProbe(), js: measureKernel(null, 4096, 30000, 5, () => performance.now()) };
  }, vp);
  console.log('js fallback', JSON.stringify(noWasm.js));
  assert(noWasm.js.backend === 'js' && Number.isFinite(noWasm.js.ms), 'js fallback works');

  const chk = await page.evaluate(async (url) => {
    const { checkStorage, TEMP_PREFIX } = await import(URL.createObjectURL(new Blob([url.code], { type: 'text/javascript' })));
    // an aborted earlier run: a stale temporary file that must be cleaned up
    const root = await navigator.storage.getDirectory();
    const stale = await (await root.getFileHandle(TEMP_PREFIX + 'stale', { create: true })).createWritable();
    await stale.write(new Uint8Array(1024)); await stale.close();
    return checkStorage({ bytes: 16 * 1024 * 1024 });
  }, sc);
  console.log('storage check', JSON.stringify(chk));
  assert(chk.writeOk === true, 'writeOk true');
  assert(Number.isFinite(chk.usage) && Number.isFinite(chk.quota), 'estimate numbers');
  const after = await opfsBytes();
  assert(after.n === before.n && after.size === before.size, `OPFS back to baseline (${JSON.stringify(before)} vs ${JSON.stringify(after)})`);

  const big = await page.evaluate(async (url) => {
    const { checkStorage } = await import(URL.createObjectURL(new Blob([url.code], { type: 'text/javascript' })));
    const real = await navigator.storage.getDirectory();
    // the real OPFS, but the quota "runs out" after 12 MB of writes
    const root = { entries: () => real.entries(), removeEntry: (n) => real.removeEntry(n), getFileHandle: async (n, o) => {
      const h = await real.getFileHandle(n, o);
      return { createWritable: async () => { const w = await h.createWritable(); let total = 0;
        return { write: async (c) => { total += c.byteLength; if (total > 12 * 1024 * 1024) throw new DOMException('full', 'QuotaExceededError'); return w.write(c); }, close: () => w.close(), abort: () => w.abort() }; } };
    } };
    return checkStorage({ bytes: 20 * 1024 * 1024, storage: { estimate: () => navigator.storage.estimate(), getDirectory: async () => root } });
  }, sc);
  console.log('quota error midway', JSON.stringify(big));
  assert(big.writeOk === false, 'a write beyond the quota fails');
  const end = await opfsBytes();
  assert(end.n === before.n && end.size === before.size, 'no files left after a failed write');
  assert(h.errors.length === 0, 'no page errors: ' + h.errors.join('; '));
  console.log('voice-measure e2e passed');
} finally { await h.close(); }
