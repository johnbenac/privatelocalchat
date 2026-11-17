// Stage 2 of the voice choice (docs/VOICE-ENGINE-PLAN.md): a fraction-of-a-second compute benchmark that needs no download.
// It runs in a Web Worker so the page never stalls, and does a dot-product workload (the inner loop of neural-network inference)
// in a hand-assembled WebAssembly module, with a typed-array JS loop when WebAssembly is missing. Lower ms is faster.
// The result feeds runtime/voice-pick.mjs as `probe: {ms}`.

export const PROBE_N = 4096;          // floats per vector (16 KB each; both fit in one 64 KB wasm page)
export const PROBE_REPS = 30000;      // dot products per timed chunk
export const PROBE_CHUNKS = 5;        // timed chunks; the median is scaled to the whole workload
export const PROBE_TIMEOUT_MS = 4000; // a device slower than this reports this value and the worker is terminated

/** Hand-assembled wasm: (func (param n reps i32) (result f32)) summing reps dot products of two f32 vectors, 4 accumulators. */
export function buildDotModule() {
  const u = (n) => { const o = []; do { let b = n & 0x7f; n >>>= 7; if (n) b |= 0x80; o.push(b); } while (n); return o; };
  const vec = (items) => [...u(items.length), ...items.flat()];
  const section = (id, body) => [id, ...u(body.length), ...body];
  const OFF_B = 16384;
  const lg = (i) => [0x20, ...u(i)], ls = (i) => [0x21, ...u(i)];
  const i32c = (v) => [0x41, ...u(v)]; // small non-negative constants only (all below 64)
  const [N, REPS, I, R, P, A0] = [0, 1, 2, 3, 4, 5];
  const body = [];
  body.push(0x02, 0x40, 0x03, 0x40);                          // block $done  loop $outer
  body.push(...lg(R), ...lg(REPS), 0x4f, 0x0d, 1);            // if r >= reps break $done
  body.push(...i32c(0), ...ls(I));
  body.push(0x02, 0x40, 0x03, 0x40);                          // block $ib  loop $il
  body.push(...lg(I), ...lg(N), 0x4f, 0x0d, 1);               // if i >= n break $ib
  body.push(...lg(I), ...i32c(2), 0x74, ...ls(P));            // p = i << 2
  for (let k = 0; k < 4; k++) {
    body.push(...lg(A0 + k), ...lg(P), 0x2a, 2, ...u(4 * k), ...lg(P), 0x2a, 2, ...u(OFF_B + 4 * k), 0x94, 0x92, ...ls(A0 + k));
  }
  body.push(...lg(I), ...i32c(4), 0x6a, ...ls(I), 0x0c, 0);   // i += 4; continue $il
  body.push(0x0b, 0x0b);                                      // end loop, end block $ib
  body.push(...lg(R), ...i32c(1), 0x6a, ...ls(R), 0x0c, 0);   // r++; continue $outer
  body.push(0x0b, 0x0b);                                      // end loop, end block $done
  body.push(...lg(A0), ...lg(A0 + 1), 0x92, ...lg(A0 + 2), 0x92, ...lg(A0 + 3), 0x92, 0x0b);
  const fn = [...vec([[3, 0x7f], [4, 0x7d]]), ...body];       // locals: 3 x i32 (i, r, p), 4 x f32 (accumulators)
  const bytes = [0x00, 0x61, 0x73, 0x6d, 1, 0, 0, 0,
    ...section(1, vec([[0x60, 2, 0x7f, 0x7f, 1, 0x7d]])),
    ...section(3, vec([[0]])),
    ...section(5, vec([[0, 1]])),                              // memory: min 1 page
    ...section(7, vec([[3, 0x64, 0x6f, 0x74, 0x00, 0], [3, 0x6d, 0x65, 0x6d, 0x02, 0]])), // exports "dot", "mem"
    ...section(10, vec([[...u(fn.length), ...fn]]))];
  return new Uint8Array(bytes);
}

/** Self-contained (it is stringified into the worker). Returns {ms, backend}. */
export function measureKernel(wasmBytes, n, reps, chunks, now) {
  let run, backend;
  try {
    if (typeof WebAssembly === 'undefined' || !wasmBytes) throw new Error('no wasm');
    const inst = new WebAssembly.Instance(new WebAssembly.Module(wasmBytes), {});
    const f = new Float32Array(inst.exports.mem.buffer);
    for (let i = 0; i < n; i++) { f[i] = ((i % 7) - 3) * 0.01; f[4096 + i] = ((i % 5) - 2) * 0.01; }
    run = (r) => inst.exports.dot(n, r);
    backend = 'wasm';
  } catch (e) {
    const a = new Float32Array(n), b = new Float32Array(n);
    for (let i = 0; i < n; i++) { a[i] = ((i % 7) - 3) * 0.01; b[i] = ((i % 5) - 2) * 0.01; }
    run = (r) => {
      let s0 = 0, s1 = 0, s2 = 0, s3 = 0;
      for (let k = 0; k < r; k++) for (let i = 0; i < n; i += 4) { s0 += a[i] * b[i]; s1 += a[i + 1] * b[i + 1]; s2 += a[i + 2] * b[i + 2]; s3 += a[i + 3] * b[i + 3]; }
      return s0 + s1 + s2 + s3;
    };
    backend = 'js';
  }
  let sink = run(Math.max(1, reps >> 4)); // warm-up, so the engine has compiled the loop before timing
  const times = [];
  for (let c = 0; c < chunks; c++) { const t = now(); sink += run(reps); times.push(now() - t); }
  times.sort((x, y) => x - y);
  return { ms: Math.round(times[times.length >> 1] * chunks * 10) / 10, backend, sink: Number.isFinite(sink) };
}

const workerSource = () => `${measureKernel.toString()}\nonmessage=(e)=>{const d=e.data;try{postMessage({ok:true,...measureKernel(d.wasm,d.n,d.reps,d.chunks,()=>performance.now())});}catch(err){postMessage({ok:false,error:String(err)});}};`;

/** Default factory: an inline Blob worker. Returns an object with postMessage, terminate and onmessage/onerror. */
export function blobWorkerFactory() {
  const url = URL.createObjectURL(new Blob([workerSource()], { type: 'text/javascript' }));
  const w = new Worker(url);
  const terminate = w.terminate.bind(w);
  w.terminate = () => { terminate(); URL.revokeObjectURL(url); };
  return w;
}

/** One measurement in a fresh worker. Never rejects; a failed or too-slow run reports timeoutMs. */
async function measureOnce({ workerFactory, now, timeoutMs }) {
  let worker;
  try { worker = workerFactory(); } catch (e) { return { ms: timeoutMs, backend: 'none', error: String(e?.message || e) }; }
  const started = now();
  return new Promise((resolve) => {
    let done = false, timer = null, hard = null;
    const finish = (r) => { if (done) return; done = true; clearInterval(timer); clearTimeout(hard); try { worker.terminate(); } catch {} resolve(r); };
    const timeout = () => finish({ ms: timeoutMs, backend: 'unknown', timedOut: true });
    hard = setTimeout(timeout, timeoutMs);
    timer = setInterval(() => { if (now() - started >= timeoutMs) timeout(); }, 50);
    worker.onmessage = (e) => {
      const d = e.data || {};
      if (d.ok && Number.isFinite(d.ms)) finish({ ms: Math.min(d.ms, timeoutMs), backend: d.backend });
      else finish({ ms: timeoutMs, backend: 'unknown', error: d.error || 'bad result' });
    };
    worker.onerror = (e) => finish({ ms: timeoutMs, backend: 'unknown', error: String(e?.message || 'worker error') });
    let wasm = null;
    try { if (typeof WebAssembly !== 'undefined') wasm = buildDotModule(); } catch {}
    try { worker.postMessage({ wasm, n: PROBE_N, reps: PROBE_REPS, chunks: PROBE_CHUNKS }); } catch (e) { finish({ ms: timeoutMs, backend: 'unknown', error: String(e?.message || e) }); }
  });
}

export const PROBE_RUNS = 3; // one call measures this many times and reports the median: one run swung 2x on the Galaxy S8+ (1,997 and 4,000 ms)

/**
 * The median of PROBE_RUNS measurements, each in its own worker, run one after the other. The hard timeout bounds the WHOLE call: once a run
 * times out, fails, or leaves too little of the budget for another one, the call stops and reports what it has.
 * @param {object} [o]
 * @param {() => object} [o.workerFactory]  returns a Worker-like {postMessage, terminate, onmessage, onerror}
 * @param {() => number} [o.now]            clock used for the timeout (default performance.now)
 * @param {number} [o.timeoutMs]
 * @param {number} [o.runs]
 * @returns {Promise<{ms:number, backend:string, samples:number[], timedOut?:boolean, error?:string}>} never rejects; a failed or too-slow probe reports timeoutMs
 */
export async function runComputeProbe({ workerFactory = blobWorkerFactory, now = () => performance.now(), timeoutMs = PROBE_TIMEOUT_MS, runs = PROBE_RUNS } = {}) {
  const started = now();
  const samples = [];
  let backend = 'unknown';
  for (let i = 0; i < runs; i++) {
    const left = i === 0 ? timeoutMs : timeoutMs - (now() - started);
    if (left <= 0) break;
    const r = await measureOnce({ workerFactory, now, timeoutMs: left });
    if (r.timedOut || r.error) {
      if (samples.length) break; // earlier good runs still count
      return { ms: timeoutMs, backend: r.backend, samples: [], ...(r.timedOut ? { timedOut: true } : {}), ...(r.error ? { error: r.error } : {}) };
    }
    backend = r.backend;
    samples.push(r.ms);
    if (now() - started + r.ms * 1.5 > timeoutMs) break; // not enough budget left for another run of this size
  }
  if (!samples.length) return { ms: timeoutMs, backend, samples, timedOut: true };
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const ms = sorted.length % 2 ? sorted[mid] : Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10;
  return { ms: Math.min(ms, timeoutMs), backend, samples };
}
