const FAULT = __FAULT__;
const base = location.origin + '/releases/' + window.APP_BUILD.commit + '/';
const { tierFiles } = await import(base + 'runtime/providers/catalog.mjs');
const files = tierFiles('default', undefined, 'q4f16_1');
const code = `
const faultOn = ${JSON.stringify(FAULT)};
let dropped = 0;
const realOpen = caches.open.bind(caches);
caches.open = async (name) => {
  const c = await realOpen(name);
  if (!faultOn || name !== 'webllm/config') return c;
  return new Proxy(c, { get(t, p) {
    if (p === 'put') return async (req, res) => {
      const u = req.url || String(req);
      if (dropped === 0 && /mlc-chat-config\\.json$/.test(u)) { dropped++; await res.arrayBuffer(); return; }
      return t.put(req, res);
    };
    const v = t[p]; return typeof v === 'function' ? v.bind(t) : v;
  } });
};
self.onmessage = async (e) => {
  const { files, base } = e.data;
  const events = []; const t0 = Date.now();
  try {
    const { storageOps } = await import(base + 'runtime/providers/adapters/webllm.mjs');
    const r = await storageOps.install({ files }, { onProgress: (p) => {
      if (p.refetchMissing || p.retryAttempt) events.push({ t: Date.now() - t0, refetch: p.refetchMissing || null, retryAttempt: p.retryAttempt || null });
      self.postMessage({ progress: { bytes: p.bytesDone, files: p.filesDone } });
    } });
    self.postMessage({ result: { ok: r.ok, state: r.state, fetchedBytes: r.fetchedBytes, keptBytes: r.keptBytes, filesFetched: r.filesFetched, refetched: r.refetched }, events, dropped, ms: Date.now() - t0 });
  } catch (err) {
    self.postMessage({ error: String(err && err.message || err), name: err && err.name, code: err && err.code, detail: err && err.detail, events, dropped, ms: Date.now() - t0 });
  }
};`;
window.__r = { started: Date.now(), progress: null, final: null, fault: FAULT, total: files.reduce((n, f) => n + f.bytes, 0), nfiles: files.length };
const w = new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })), { type: 'module' });
w.onmessage = (e) => { if (e.data.progress) window.__r.progress = e.data.progress; else window.__r.final = e.data; };
w.onerror = (e) => { window.__r.final = { error: 'worker error: ' + (e.message || e.type), name: 'WorkerError' }; };
w.postMessage({ files, base });
return { started: true, files: files.length, total: window.__r.total, fault: FAULT };
