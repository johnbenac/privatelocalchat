// The threads variant of the standalone Kokoro package (ops/voice/standalone --variant threads) in a real browser, with the REAL worker and the REAL pinned files:
//   * on a cross-origin isolated page (COOP same-origin, COEP require-corp, CORP same-origin) under the strict policy
//     default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self' https://cdn.aiofourown.com   (NO blob: in worker-src)
//   * threads 4 uses more than one thread (engine.status().threads), threads 1 uses one, and a page that is NOT isolated gets one thread whatever it asks
//   * firstChunkSplit cuts the first chunk at a comma and the first sound comes sooner; with it off the chunks are the same as without the variant
//   * no policy violation anywhere. Needs the network (model files from the shared CDN) and a Chromium that Playwright can start.
//   node tests/e2e/kokoro-threads.e2e.mjs      (builds both packages first: needs `npm ci --ignore-scripts` in ops/voice; KOKORO_THREADS_PKG=<folder> uses a built variant instead)
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const ok = (n) => console.log('PASS ' + n); const assert = (c, m) => { if (!c) throw new Error('E2E assertion failed: ' + m); };
let pkg = process.env.KOKORO_THREADS_PKG;
if (!pkg) { pkg = fs.mkdtempSync(path.join(os.tmpdir(), 'kokoro-threads-')); const r = spawnSync('node', [path.join(ROOT, 'ops/voice/standalone/build.mjs'), pkg, '--variant', 'threads', '--voices', 'af_heart'], { encoding: 'utf8' }); if (r.status !== 0) { console.error(r.stderr || r.stdout); throw new Error('the variant did not build'); } }
const filesJson = JSON.parse(fs.readFileSync(path.join(pkg, 'kokoro-files.json'), 'utf8'));
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self' https://cdn.aiofourown.com; style-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'";
const ISOLATION = { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp', 'Cross-Origin-Resource-Policy': 'same-origin' };
const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.html': 'text/html' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x'); const isolated = !url.searchParams.has('plain'); const headers = { 'Content-Security-Policy': CSP, 'Cache-Control': 'no-store', ...(isolated ? ISOLATION : {}) };
  if (url.pathname === '/') { res.writeHead(200, { ...headers, 'Content-Type': 'text/html' }); return res.end('<!doctype html><meta charset="utf-8"><p>test</p>'); }
  const p = path.join(pkg, url.pathname.slice(1)); if (!p.startsWith(pkg) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404, headers); return res.end('no'); }
  res.writeHead(200, { ...headers, 'Content-Type': MIME[path.extname(p)] || 'text/plain' }); res.end(fs.readFileSync(p));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r)); const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch(); const violations = [];
const SENT = "That's a really good question, and honestly, the answer depends on what you care about most right now.";
async function run(query, threads, firstChunkSplit) {
  const context = await browser.newContext(); const page = await context.newPage();
  page.on('console', (m) => { if (/content security policy|refused to|violat|cross-origin/i.test(m.text())) violations.push(query + ' ' + m.text()); }); page.on('pageerror', (e) => violations.push('pageerror ' + e));
  await page.goto(origin + '/' + query);
  const r = await page.evaluate(async ({ threads, split, sent }) => {
    const m = await import('/kokoro-engine.mjs'); const e = m.createKokoroEngine({ workerUrl: new URL('/worker-kokoro-standalone-threads.js', location.href).href });
    const list = await (await fetch('/kokoro-files.json')).json(); e.init({ base: list.base, files: list.files }); const loaded = await e.load({ threads });
    const chunks = []; const t0 = performance.now(); let first = null;
    const s = await e.speak(sent, { voice: 'af_heart', speed: 1, firstChunkSplit: split, onChunk: (c) => { if (first === null) first = performance.now() - t0; chunks.push({ text: c.text, n: c.samples.length, index: c.index, count: c.count, ipa: c.ipa }); } });
    const out = { isolated: self.crossOriginIsolated, status: e.status().threads, loadedThreads: loaded.threads, chunks, firstMs: Math.round(first), synthMs: Math.round(s.synthMs), audioSeconds: s.audioSeconds, hc: navigator.hardwareConcurrency }; await e.unload(); return out;
  }, { threads, split: firstChunkSplit, sent: SENT });
  await context.close(); return r;
}
try {
  const one = await run('', 1, undefined); assert(one.isolated && one.status === 1 && one.loadedThreads === 1 && one.chunks.length === 1, 'threads 1 on an isolated page: one thread, one chunk: ' + JSON.stringify({ ...one, chunks: one.chunks.length }));
  ok('threads 1 (the default) uses one thread and the sentence is one chunk');
  const four = await run('', 4, undefined); const want = Math.min(4, four.hc);
  assert(four.isolated && four.status === want && four.loadedThreads === want, 'threads 4 on an isolated page uses min(4, cores)=' + want + ' threads, got ' + four.status);
  console.log('INFO one thread: synth ' + one.synthMs + ' ms for ' + one.audioSeconds.toFixed(2) + ' s of audio; ' + four.status + ' threads: synth ' + four.synthMs + ' ms for ' + four.audioSeconds.toFixed(2) + ' s (host cores ' + four.hc + ', loaded)');
  assert(Math.abs(four.audioSeconds - one.audioSeconds) < 0.05, 'the threaded audio is as long as the one-thread audio (' + four.audioSeconds + ' vs ' + one.audioSeconds + ')');
  ok('threads 4 on an isolated page uses ' + want + ' threads without blob: in worker-src, and speaks the same length of audio');
  const plain = await run('?plain=1', 4, undefined); assert(!plain.isolated && plain.status === 1, 'a page that is not isolated gets one thread whatever it asks: ' + plain.status); ok('a page that is not isolated gets one thread even when it asks for four');
  const split = await run('', 1, { minChars: 20 }); assert(split.chunks.length === 2 && split.chunks[0].text.endsWith(',') && split.chunks[0].count === 2 && split.chunks[1].index === 1, 'the first chunk is cut at a comma: ' + JSON.stringify(split.chunks.map((c) => c.text)));
  assert(split.firstMs < one.firstMs, 'the first sound comes sooner with the split (' + split.firstMs + ' ms against ' + one.firstMs + ' ms)');
  assert(Math.abs(split.audioSeconds - one.audioSeconds) < 1, 'the whole sentence still has about the same length of audio');
  console.log('INFO first sound: ' + one.firstMs + ' ms whole sentence; ' + split.firstMs + ' ms with the first chunk cut at the comma (' + split.chunks[0].text + ')');
  ok('firstChunkSplit cuts the first chunk at a comma and the first sound comes sooner');
  const off = await run('', 1, { minChars: 0 }); assert(off.chunks.length === 1, 'minChars 0 means off'); ok('minChars 0 leaves the chunks as they were');
  assert(violations.length === 0, 'policy violations: ' + violations.join(' | '));
  ok('no policy violation or page error in any scenario (cross-origin isolated page, strict policy, no blob: workers)');
} finally { await browser.close(); server.close(); if (!process.env.KOKORO_THREADS_PKG) fs.rmSync(pkg, { recursive: true, force: true }); }
