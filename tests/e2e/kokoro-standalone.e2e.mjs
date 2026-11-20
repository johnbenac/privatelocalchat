// The standalone Kokoro engine package (ops/voice/standalone, docs/VOICE-STANDALONE.md) in a real browser, with the REAL worker and the REAL pinned Kokoro files:
//   * on a page with NO cross-origin isolation (no COOP/COEP headers; crossOriginIsolated false, no SharedArrayBuffer),
//   * under the strict policy  default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self' https://cdn.aiofourown.com  and no policy violation,
//   * the three voices (af_heart, am_michael, af_alloy) installed together, the speech sample-for-sample the SAME as Private Local Chat's own engine made (the fingerprints below),
//   * a corrupted, a truncated, an over-long and a missing download is REFUSED, nothing is cached for it and no worker is started, and the same engine then loads the good set,
//   * the page with no crypto.subtle (the engine's JavaScript SHA-256), cancel in the middle of a speak, unload.
// Needs the network (the model files come from the shared CDN, once, and are held in memory by the test's own proxy for the tamper cases) and a Chromium that Playwright can start.
//   node scripts/e2e.mjs kokoro-standalone        (builds the package first: needs `npm ci --ignore-scripts` in ops/voice; KOKORO_PKG=<folder> uses a built package instead)
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const ok = (n) => console.log('PASS ' + n);
const fail = (m) => { throw new Error('E2E assertion failed: ' + m); };
const assert = (c, m) => { if (!c) fail(m); };
const PORT = 18700 + Number(process.env.E2E_PORT_OFFSET || 0);
const CDN = 'https://cdn.aiofourown.com';
const CSP = "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self' " + CDN + "; style-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'";
// the audio of "Hello! This is a short sample of the voice." made by Private Local Chat's own engine (isolated page, four threads): the SHA-256 of the 16-bit PCM
const EXPECTED = { af_heart: 'dfcda64768800f559c023a6f689f9191f683cc945b54d21afc9d6cba99cd0e5f', am_michael: 'fb4d153cb79ae078b4cfc52e800dfa458b1dc8fa807d95d298009dd163e2b685', af_alloy: '37ac6c1d16db4318116d6838297577b52ee0655aed04c0f86dcbd5644fa8ee85' };
const SENTENCE = 'Hello! This is a short sample of the voice.';

// ---- the package ----
let pkg = process.env.KOKORO_PKG, builtHere = false;
if (!pkg) {
  pkg = fs.mkdtempSync(path.join(os.tmpdir(), 'kokoro-pkg-')); builtHere = true;
  const r = spawnSync('node', [path.join(ROOT, 'ops/voice/standalone/build.mjs'), pkg], { encoding: 'utf8' });
  if (r.status !== 0) { console.error(r.stderr || r.stdout); fail('the package did not build (run npm ci --ignore-scripts in ops/voice first)'); }
}
const filesJson = JSON.parse(fs.readFileSync(path.join(pkg, 'kokoro-files.json'), 'utf8'));
assert(filesJson.files.filter((f) => f.role === 'voice').map((f) => f.path.split('/').pop()).sort().join() === 'af_alloy.bin,af_heart.bin,am_michael.bin', 'the default list holds exactly the three voices');

// ---- a server: the package, a page, and a proxy to the CDN with faults ----
const cdnCache = new Map();
async function fromCdn(p) {
  if (!cdnCache.has(p)) { const r = await fetch(filesJson.base + p); if (!r.ok) throw new Error('the CDN gave ' + r.status + ' for ' + p); cdnCache.set(p, new Uint8Array(await r.arrayBuffer())); }
  return cdnCache.get(p);
}
const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.html': 'text/html' };
const baseHeaders = { 'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' };   // no Cross-Origin-Opener-Policy, no Cross-Origin-Embedder-Policy
const FAULTS = {
  ok: (p, b) => b,
  badvoice: (p, b) => { if (p !== 'voices/am_michael.bin') return b; const c = Uint8Array.from(b); c[100] ^= 1; return c; },
  shortmodel: (p, b) => (p === 'onnx/model_quantized.onnx' ? b.slice(0, b.length - 1) : b),
  longtoken: (p, b) => (p === 'tokenizer.json' ? Uint8Array.from([...b, 32]) : b),
  missing: (p, b) => (p === 'voices/af_alloy.bin' ? null : b)
};
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x'); const send = (status, data, type, extra = {}) => { res.writeHead(status, { ...baseHeaders, 'Content-Type': type || 'text/plain', 'Content-Length': data.length, ...extra }); res.end(data); };
    if (url.pathname === '/') return send(200, '<!doctype html><meta charset="utf-8"><title>kokoro engine test</title><p>test page</p>', 'text/html');
    let m = /^\/files\/([a-z]+)\/(.+)$/.exec(url.pathname);
    if (m && FAULTS[m[1]]) { const body = FAULTS[m[1]](m[2], await fromCdn(m[2])); return body === null ? send(404, 'not found') : send(200, Buffer.from(body), 'application/octet-stream'); }
    m = /^\/pkg\/(.+)$/.exec(url.pathname);
    if (m && !m[1].includes('..') && fs.existsSync(path.join(pkg, m[1]))) return send(200, fs.readFileSync(path.join(pkg, m[1])), MIME[path.extname(m[1])] || 'application/octet-stream');
    return send(404, 'not found');
  } catch (error) { res.writeHead(500, baseHeaders); res.end(String(error)); }
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
const origin = `http://127.0.0.1:${PORT}`;
const browser = await chromium.launch();
const violations = [];
async function newPage() {
  const context = await browser.newContext(); const page = await context.newPage(); const workers = [];
  await page.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI)); });
  page.on('console', (m) => { if (/content security policy|refused to/i.test(m.text())) violations.push(m.text()); });
  page.on('pageerror', (e) => violations.push('pageerror ' + String(e).slice(0, 200)));
  page.on('worker', (w) => workers.push(w.url()));
  await page.goto(origin + '/');
  return { page, workers, context };
}
const inPage = (page, fn, arg) => page.evaluate(fn, arg);

try {
  // ---- 0. the policy is really enforced on this page: a request to an address outside connect-src is blocked, so 'no violation' below means something ----
  {
    const { page, context } = await newPage();
    const r = await inPage(page, async () => { let outcome = 'allowed'; try { await fetch('https://example.org/'); } catch { outcome = 'blocked'; } await new Promise((res) => setTimeout(res, 100)); return { outcome, csp: window.__csp }; });
    assert(r.outcome === 'blocked' && r.csp.some((v) => v.startsWith('connect-src')), 'the policy blocks an address outside connect-src: ' + JSON.stringify(r));
    violations.length = 0;   // that blocked request was the test's own, not the engine's
    ok('the strict policy is enforced on the test page (a request outside connect-src is blocked and reported)');
    await context.close();
  }

  // ---- 1. the real thing: the CDN, the strict policy, no isolation ----
  {
    const { page, workers } = await newPage();
    const env = await inPage(page, () => ({ isolated: crossOriginIsolated, sab: typeof SharedArrayBuffer, subtle: Boolean(crypto.subtle) }));
    assert(env.isolated === false && env.sab === 'undefined', 'the page is not cross-origin isolated: ' + JSON.stringify(env));
    const result = await inPage(page, async ({ base, files }) => {
      const { createKokoroEngine } = await import('/pkg/kokoro-engine.mjs');
      const engine = createKokoroEngine({ workerUrl: new URL('/pkg/worker-kokoro-standalone.js', location.href).href });
      engine.init({ base, files });
      let lastProgress = null; const t0 = performance.now();
      const loaded = await engine.load({ onProgress: (p) => { lastProgress = p; } });
      const out = { voices: loaded.voices, loadMs: Math.round(performance.now() - t0), progress: lastProgress, status: engine.status(), clips: {} };
      for (const voice of ['af_heart', 'am_michael', 'af_alloy']) {
        const chunks = []; const r = await engine.speak('Hello! This is a short sample of the voice.', { voice, onChunk: (c) => chunks.push({ n: c.samples.length, rate: c.sampleRate, text: c.text, ipa: c.ipa, index: c.index, count: c.count, samples: c.samples }) });
        const all = new Float32Array(chunks.reduce((n, c) => n + c.n, 0)); let o = 0; for (const c of chunks) { all.set(c.samples, o); o += c.n; }
        const pcm = new Int16Array(all.length); for (let i = 0; i < all.length; i++) { const v = Math.max(-1, Math.min(1, all[i])); pcm[i] = v < 0 ? v * 32768 : v * 32767; }
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', pcm.buffer)); out.clips[voice] = { hash: [...digest].map((b) => b.toString(16).padStart(2, '0')).join(''), chunks: chunks.length, rate: chunks[0]?.rate, ipa: chunks.map((c) => c.ipa), texts: chunks.map((c) => c.text), seconds: all.length / 24000, ms: Math.round(r.synthMs), first: r.firstAudioMs };
      }
      out.cached = (await caches.keys()).length;
      return out;
    }, { base: filesJson.base, files: filesJson.files });
    assert(result.voices.sort().join() === 'af_alloy,af_heart,am_michael', 'the three voices were loaded together: ' + result.voices);
    assert(result.progress.bytesDone === result.progress.bytesTotal, 'the progress reached the total');
    for (const [voice, expected] of Object.entries(EXPECTED)) {
      assert(result.clips[voice].hash === expected, `${voice}: the audio is not the audio of Private Local Chat's own engine (${result.clips[voice].hash})`);
      assert(result.clips[voice].rate === 24000 && result.clips[voice].chunks === 2 && result.clips[voice].ipa.every((p) => typeof p === 'string' && p.length > 0), `${voice}: chunks, rate and phonemes`);
    }
    assert(workers.length === 1 && workers[0].endsWith('/pkg/worker-kokoro-standalone.js'), 'exactly one same-origin worker started: ' + workers);
    assert(await inPage(page, () => window.__csp.length === 0), 'no policy violation seen by the page: ' + await inPage(page, () => window.__csp.join('|')));
    assert(result.cached >= 1, 'verified files were cached');
    console.log('   (install ' + result.loadMs + ' ms; af_heart ' + JSON.stringify(result.clips.af_heart.texts) + ' ' + result.clips.af_heart.seconds + ' s in ' + result.clips.af_heart.ms + ' ms, first audio ' + result.clips.af_heart.first + ' ms)');
    ok('on a page with NO cross-origin isolation, under the strict policy: the three voices load together and speak exactly as Private Local Chat\'s engine does');
    // a second load in the same browser context comes from the cache and is verified again
    const again = await inPage(page, async ({ base, files }) => {
      const { createKokoroEngine } = await import('/pkg/kokoro-engine.mjs');
      const engine = createKokoroEngine({ workerUrl: new URL('/pkg/worker-kokoro-standalone.js', location.href).href }); engine.init({ base, files });
      const t0 = performance.now(); const r = await engine.load(); await engine.unload(); return { fromCache: r.fromCache.length, ms: Math.round(performance.now() - t0), status: engine.status().state };
    }, { base: filesJson.base, files: filesJson.files });
    assert(again.fromCache === filesJson.files.length && again.status === 'initialised', 'the second load came entirely from the cache and unload ended it: ' + JSON.stringify(again));
    ok('a second load is served from the cache (every file checked again) and unload frees it');
    await page.context().close();
  }

  // ---- 2. refused downloads: a corrupted, a truncated, an over-long and a missing file ----
  for (const [fault, code, file] of [['badvoice', 'bad-hash', 'voices/am_michael.bin'], ['shortmodel', 'bad-size', 'onnx/model_quantized.onnx'], ['longtoken', 'bad-size', 'tokenizer.json'], ['missing', 'http-error', 'voices/af_alloy.bin']]) {
    const { page, workers, context } = await newPage();
    const r = await inPage(page, async ({ base, files }) => {
      const { createKokoroEngine } = await import('/pkg/kokoro-engine.mjs');
      const engine = createKokoroEngine({ workerUrl: new URL('/pkg/worker-kokoro-standalone.js', location.href).href }); engine.init({ base, files });
      let error = null; try { await engine.load(); } catch (e) { error = { code: e.code, path: e.path }; }
      const speakError = await engine.speak('Hi.').then(() => null, (e) => e.code);
      const cachedUrls = []; for (const name of await caches.keys()) for (const req of await (await caches.open(name)).keys()) cachedUrls.push(req.url);
      return { error, speakError, cachedUrls, state: engine.status().state };
    }, { base: origin + '/files/' + fault + '/', files: filesJson.files });
    assert(r.error && r.error.code === code && r.error.path === file, `${fault}: refused with ${code} for ${file}: ${JSON.stringify(r.error)}`);
    assert(workers.length === 0, `${fault}: no worker was started`);
    assert(!r.cachedUrls.some((u) => u.endsWith('/' + file)), `${fault}: the refused file was not cached`);
    assert(r.speakError === 'not-loaded' && r.state === 'initialised', `${fault}: nothing can speak after a refused load`);
    ok(`${fault}: refused with ${code} (${file}); no worker, nothing cached for it, nothing can speak`);
    await context.close();
  }

  // ---- 3. a page without crypto.subtle (a plain http address on a LAN): the JavaScript SHA-256 does the same job; and cancel ----
  {
    const { page } = await newPage();
    const r = await inPage(page, async ({ base, files }) => {
      const { createKokoroEngine } = await import('/pkg/kokoro-engine.mjs');
      const engine = createKokoroEngine({ workerUrl: new URL('/pkg/worker-kokoro-standalone.js', location.href).href, subtle: 'js', cache: null }); engine.init({ base, files });
      const t0 = performance.now(); const loaded = await engine.load(); const loadMs = Math.round(performance.now() - t0);
      const text = 'First sentence is here. Second sentence follows it. Third sentence goes on. Fourth sentence is the last one.';
      const got = []; const first = await engine.speak(text, { voice: 'af_heart', onChunk: (c) => { got.push(c.index); if (got.length === 1) engine.cancel(); } });
      const all = []; await engine.speak(text, { voice: 'af_heart', onChunk: (c) => all.push(c.index) });
      await engine.unload();
      return { sha: engine.status().sha256, voices: loaded.voices.length, loadMs, cancelledAfter: got.length, cancelled: first.cancelled, full: all.length, fromCache: loaded.fromCache.length };
    }, { base: filesJson.base, files: filesJson.files });
    assert(r.sha === 'js' && r.voices === 3 && r.fromCache === 0, 'the JavaScript SHA-256 path loaded the real set: ' + JSON.stringify(r));
    assert(r.cancelled === true && r.cancelledAfter < r.full && r.full === 4, 'cancel stopped the speak after the chunk in progress: ' + JSON.stringify(r));
    console.log('   (JavaScript SHA-256 install ' + r.loadMs + ' ms; cancelled after ' + r.cancelledAfter + ' of ' + r.full + ' chunks)');
    ok('no crypto.subtle: the JavaScript SHA-256 checks the real files; cancel stops a speak between chunks');
    await page.context().close();
  }
  assert(violations.length === 0, 'the console reported policy violations or page errors: ' + violations.join(' | '));
  ok('no policy violation and no page error in any scenario');
} finally {
  await browser.close(); server.close();
  if (builtHere) fs.rmSync(pkg, { recursive: true, force: true });
}
