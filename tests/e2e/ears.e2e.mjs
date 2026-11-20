// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { gzipSync } from "node:zlib";

const { chromium } = createRequire(new URL("../../package.json", import.meta.url))("playwright");
const [pkg, models, fixtures] = process.argv.slice(2);
if (!pkg || !models || !fixtures) throw new Error("Usage: ears.e2e.mjs <package> <models> <WAV fixtures>");
const manifest = JSON.parse(await fs.readFile(path.join(pkg, "ears-files.json"), "utf8"));
const clips = ["s2-c0", "s4-c0"];
const references = new Map((await fs.readFile(path.join(fixtures, "chunks.jsonl"), "utf8"))
  .trim().split("\n").map((line) => {
    const { name, text } = JSON.parse(line);
    return [name, text];
  }));
const csp = "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'";
const timeout = 240_000; // Shared host with other jobs.

function resampleWav(wav) {
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.equal(wav.toString("ascii", 8, 12), "WAVE");
  let pcm;
  let format;
  for (let offset = 12; offset + 8 <= wav.length;) {
    const name = wav.toString("ascii", offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);
    const data = wav.subarray(offset + 8, offset + 8 + size);
    if (name === "fmt ") format = data;
    if (name === "data") pcm = data;
    offset += 8 + size + (size % 2);
  }
  assert.equal(format.readUInt16LE(0), 1);
  assert.equal(format.readUInt16LE(2), 1);
  assert.equal(format.readUInt32LE(4), 24_000);
  assert.equal(format.readUInt16LE(14), 16);
  const input = Float32Array.from({ length: pcm.length / 2 }, (_, i) => pcm.readInt16LE(i * 2) / 32768);
  // Windowed sinc low-pass for the 24-to-16 kHz conversion.
  const cutoff = 7600 / 24000;
  const radius = 16;
  return Float32Array.from({ length: Math.floor(input.length * 2 / 3) }, (_, i) => {
    const position = i * 1.5;
    let sample = 0, weightSum = 0;
    for (let j = Math.ceil(position - radius); j <= Math.floor(position + radius); j++) {
      const distance = j - position;
      const sinc = distance === 0 ? 2 * cutoff : Math.sin(2 * Math.PI * cutoff * distance) / (Math.PI * distance);
      const weight = sinc * (0.5 + 0.5 * Math.cos(Math.PI * distance / radius));
      sample += (input[j] ?? 0) * weight;
      weightSum += weight;
    }
    return sample / weightSum;
  });
}

function wordErrors(expected, actual) {
  const words = (text) => text.toLowerCase().match(/[a-z0-9]+(?:'[a-z]+)*/g) ?? [];
  const reference = words(expected);
  const spoken = words(actual);
  let previous = [0, ...spoken.map((_, index) => index + 1)];
  for (const [index, word] of reference.entries()) {
    const row = [index + 1];
    for (const [j, heard] of spoken.entries()) {
      row.push(Math.min(row[j] + 1, previous[j + 1] + 1, previous[j] + Number(word !== heard)));
    }
    previous = row;
  }
  return { edits: previous.at(-1), words: reference.length };
}

async function runBrowser(clips) {
  const violations = [];
  document.addEventListener("securitypolicyviolation", (event) => violations.push(event.violatedDirective));
  const { createEarsEngine } = await import("/package/ears-engine.mjs");
  const manifest = await fetch("/package/ears-files.json").then((response) => response.json());
  const engine = createEarsEngine({ workerUrl: "/package/worker-ears-standalone.js" });
  const initial = engine.init({ base: new URL("/model/", location.href).href, files: manifest.files });
  let progress;
  const load = await engine.load({ onProgress: (value) => { progress = value; } });
  const results = [];
  for (const name of clips) {
    const buffer = await fetch("/fixture/" + name).then((response) => response.arrayBuffer());
    results.push(await engine.transcribe(new Float32Array(buffer)));
  }
  const cached = (await (await caches.open("ears-engine-v1")).keys()).length;
  engine.unload();
  const unloaded = engine.status();
  await engine.load();
  engine.unload();
  return { initial, load, progress, results, cached, unloaded, violations, isolated: crossOriginIsolated };
}

const responses = new Map();
function serve(url, body, type, headers = {}) {
  assert.ok(Buffer.byteLength(body) <= 24 * 1024 * 1024, url);
  responses.set(url, { body, type, headers });
}
serve("/", "<!doctype html><title>Ears browser test</title><script type=module src=/run.mjs></script>", "text/html");
serve("/run.mjs", `(${runBrowser})(${JSON.stringify(clips)}).then(
  (value) => { globalThis.result = { value }; },
  (error) => { globalThis.result = { error: String(error.stack || error) }; }
);`, "text/javascript");
for (const file of manifest.files) {
  const bytes = await fs.readFile(path.join(models, file.path));
  const encoded = bytes.length > 24 * 1024 * 1024;
  serve("/model/" + file.path, encoded ? gzipSync(bytes) : bytes, "application/octet-stream", {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Expose-Headers": "Content-Encoding",
    ...(encoded ? { "Content-Encoding": "gzip" } : {}),
  });
}
for (const [name, type] of [
  ["ears-engine.mjs", "text/javascript"], ["worker-ears-standalone.js", "text/javascript"],
  ["ears-files.json", "application/json"], ["ort-wasm-simd-threaded.wasm", "application/wasm"],
]) serve("/package/" + name, await fs.readFile(path.join(pkg, name)), type);
for (const name of clips) {
  const samples = resampleWav(await fs.readFile(path.join(fixtures, name + ".wav")));
  serve("/fixture/" + name, Buffer.from(samples.buffer), "application/octet-stream");
}
const requests = new Map();
const unexpected = [];
const server = http.createServer((request, response) => {
  requests.set(request.url, (requests.get(request.url) ?? 0) + 1);
  const spec = responses.get(request.url);
  if (!spec) {
    if (request.url !== "/favicon.ico") unexpected.push(request.url);
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, {
    "Content-Type": spec.type, "Content-Length": Buffer.byteLength(spec.body),
    "Content-Security-Policy": csp, "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store",
    ...spec.headers,
  }).end(spec.body);
});
await new Promise((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
const origin = "http://127.0.0.1:" + server.address().port;
let browser;
try {
  browser = await chromium.launch({ timeout });
  const page = await browser.newPage();
  const errors = [];
  const workers = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (/content security policy|refused to/i.test(message.text())) errors.push(message.text());
  });
  page.on("worker", (worker) => workers.push(worker.url()));
  page.on("request", (request) => {
    if (!request.url().startsWith(origin + "/")) unexpected.push(request.url());
  });
  await page.goto(origin, { timeout });
  await page.waitForFunction(() => globalThis.result, null, { timeout });
  const { value, error } = await page.evaluate(() => globalThis.result);
  assert.ok(!error, error);
  assert.equal(value.isolated, false);
  assert.equal(value.load.threads, 1);
  assert.deepEqual(value.progress, { bytesDone: value.initial.totalBytes, bytesTotal: value.initial.totalBytes });
  assert.deepEqual(value.unloaded, { state: "initialised", totalBytes: value.initial.totalBytes, threads: 0 });
  assert.equal(value.cached, manifest.files.length + 1);
  assert.equal(workers.length, 2);
  assert.ok(workers.every((url) => url === origin + "/package/worker-ears-standalone.js"));
  for (const { path } of manifest.files) assert.equal(requests.get("/model/" + path), 1, path);
  assert.equal(requests.get("/package/ort-wasm-simd-threaded.wasm"), 1);
  assert.deepEqual(unexpected, []);
  assert.deepEqual(errors, []);
  assert.deepEqual(value.violations, []);

  let totalWords = 0, totalEdits = 0;
  console.log(`Load ${value.load.loadMs.toFixed(1)} ms, 1 thread`);
  for (const [index, result] of value.results.entries()) {
    const name = clips[index];
    const { edits, words } = wordErrors(references.get(name), result.text);
    assert.ok(words > 0 && result.text.length > 0);
    assert.equal(result.text, result.text.trim());
    console.log(`${name}: ${result.ms.toFixed(1)} ms, WER ${(100 * edits / words).toFixed(1)}% (${edits}/${words}), ${JSON.stringify(result.text)}`);
    totalWords += words;
    totalEdits += edits;
  }
  console.log(`Combined WER ${(100 * totalEdits / totalWords).toFixed(1)}% (${totalEdits}/${totalWords})`);
  assert.ok(totalEdits / totalWords <= 0.25, "combined WER exceeds 25%");
  console.log("PASS Chromium: 2 utterances, strict CSP, no isolation, verified cache reload");
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
