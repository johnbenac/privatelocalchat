const REPEATS = __REPEATS__;
const SYNTH = 'http://127.0.0.1:18596';
const base = location.origin + '/releases/' + window.APP_BUILD.commit + '/';
const files = await (await fetch(SYNTH + '/synth/manifest.json', { cache: 'no-store' })).json();
const code = `
self.onmessage = async (e) => {
  const { files, base } = e.data;
  const events = []; const t0 = Date.now();
  try {
    const { storageOps } = await import(base + 'runtime/providers/adapters/webllm.mjs');
    const r = await storageOps.install({ files }, { onProgress: (p) => {
      if (p.refetchMissing || p.retryAttempt) events.push({ refetch: p.refetchMissing || null, retryAttempt: p.retryAttempt || null, detail: p.refetchDetail || null });
    } });
    self.postMessage({ ok: r.ok, state: r.state, refetched: r.refetched, filesFetched: r.filesFetched, fetchedBytes: r.fetchedBytes, refetchDetail: r.refetchDetail, events, ms: Date.now() - t0 });
  } catch (err) {
    self.postMessage({ ok: false, error: String(err && err.message || err), name: err && err.name, code: err && err.code, detail: err && err.detail, events, ms: Date.now() - t0 });
  }
};`;
const w = new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })), { type: 'module' });
window.__s = { started: Date.now(), total: files.reduce((n, f) => n + f.bytes, 0), nfiles: files.length, results: [], done: false };
const once = () => new Promise((res) => { w.onmessage = (e) => res(e.data); w.postMessage({ files, base }); });
(async () => {
  for (let i = 0; i < REPEATS; i++) {
    for (const n of ['webllm/model', 'webllm/config', 'webllm/wasm']) await caches.delete(n);
    const r = await once();
    window.__s.results.push({ i, ...r });
  }
  window.__s.done = true;
})();
return { started: true, repeats: REPEATS, files: files.length, total: window.__s.total };
