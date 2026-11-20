// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createEarsEngine, EarsEngineError, MODEL_PATHS } from "../ops/voice/ears/engine.mjs";
import { logMel } from "../ops/voice/ears/whisper.mjs";

const base = "https://cdn.example/models/whisper/";
const bodies = MODEL_PATHS.map((_, i) => Uint8Array.of(i, i + 1, i + 2));
const files = MODEL_PATHS.map((path, i) => ({
  path, bytes: bodies[i].length, sha256: createHash("sha256").update(bodies[i]).digest("hex"),
}));
const audio = new Float32Array(4800);
const expectCode = (code) => (error) => error instanceof EarsEngineError && error.code === code;

function cacheFixture() {
  const data = new Map();
  return { data, async get(url) { return data.get(url); }, async put(url, bytes) { data.set(url, bytes); } };
}

function setup({ cache = cacheFixture(), fault, subtle } = {}) {
  const workers = [];
  const calls = [];
  class Worker {
    constructor(url, options) {
      assert.equal(options.type, "module");
      this.messages = [];
      workers.push(this);
    }
    postMessage(message, transfer) {
      this.messages.push(structuredClone(message, { transfer }));
      if (message.op === "load") queueMicrotask(() => this.reply(message.id, { threads: 1 }));
    }
    reply(id, fields = { text: "  hello world  ", ms: 12 }) {
      this.onmessage({ data: { id, ok: true, ...fields } });
    }
    terminate() { this.terminated = true; }
  }
  const engine = createEarsEngine({
    workerUrl: "https://page.example/worker.js", WorkerImpl: Worker, cache, subtle,
    fetchImpl: async (url, options) => {
      calls.push(url);
      assert.equal(options.credentials, "omit");
      assert.equal(options.redirect, "error");
      const index = files.findIndex(({ path }) => base + path === url);
      assert.ok(index >= 0);
      if (index === 0 && fault) return fault(bodies[index]);
      return new Response(bodies[index], { headers: { "content-length": "3" } });
    },
  });
  return { engine, calls, cache, workers, worker: () => workers.at(-1) };
}

test("init validates the complete, unique file list without I/O", () => {
  const { engine, calls, workers } = setup();
  assert.throws(() => engine.init({ base: base + "?q=1", files }), expectCode("bad-config"));
  for (const pins of [
    files.slice(1),
    [files[1], ...files.slice(1)],
    [{ ...files[0], path: "../config.json" }, ...files.slice(1)],
    [{ ...files[0], sha256: "no" }, ...files.slice(1)],
    [{ ...files[0], bytes: 0 }, ...files.slice(1)],
  ]) assert.throws(() => engine.init({ base, files: pins }), expectCode("bad-file-list"));
  assert.deepEqual(engine.init({ base, files }), { ok: true, totalBytes: 36, files: 12 });
  assert.deepEqual([calls.length, workers.length], [0, 0]);
});

test("load verifies and transfers all files and reports progress and threads", async () => {
  const { engine, calls, worker } = setup({ subtle: "js" });
  engine.init({ base, files });
  const progress = [];
  const result = await engine.load({ threads: 4, onProgress: (value) => progress.push(value) });
  assert.equal(result.ok, true);
  assert.equal(result.threads, 1);
  assert.ok(result.loadMs >= 0);
  assert.equal(calls.length, files.length);
  assert.deepEqual(progress.at(-1), { bytesDone: 36, bytesTotal: 36 });
  assert.deepEqual(engine.status(), { state: "ready", totalBytes: 36, threads: 1 });
  for (const [i, path] of MODEL_PATHS.entries()) {
    assert.deepEqual(new Uint8Array(worker().messages[0].files[path]), bodies[i]);
  }
  const pending = engine.transcribe(audio);
  const sent = worker().messages.at(-1);
  assert.equal(sent.samples.length, 4800);
  assert.equal(audio.length, 4800);
  worker().reply(sent.id);
  assert.deepEqual(await pending, { text: "hello world", ms: 12 });
});

for (const [name, code, fault] of [
  ["wrong declared size", "bad-size", (body) => new Response(body, { headers: { "content-length": "4" } })],
  ["wrong hash", "bad-hash", () => new Response(Uint8Array.of(9, 9, 9))],
  ["truncated stream", "bad-size", (body) => new Response(body.subarray(0, 2))],
  ["oversized stream", "bad-size", () => new Response(Uint8Array.of(1, 2, 3, 4))],
  ["non-success HTTP response", "http-error", () => new Response(null, { status: 404 })],
  ["network failure", "network", () => { throw new Error("offline"); }],
]) {
  test(`refuses ${name} before starting the worker or caching the file`, async () => {
    const { engine, workers, cache } = setup({ fault });
    engine.init({ base, files });
    await assert.rejects(engine.load(), expectCode(code));
    assert.equal(workers.length, 0);
    assert.equal(cache.data.size, 0);
    assert.equal(engine.status().state, "initialised");
  });
}

test("corrupt cached bytes are verified again and replaced", async () => {
  const { engine, calls, cache } = setup();
  const url = base + files[0].path;
  engine.init({ base, files });
  await engine.load();
  engine.unload();
  calls.length = 0;
  cache.data.set(url, Uint8Array.of(0, 0, 0));
  await engine.load();
  assert.deepEqual(calls, [url]);
  assert.deepEqual(cache.data.get(url), bodies[0]);
});

test("explicit cancel and AbortSignal discard late worker replies", async () => {
  const { engine, worker } = setup();
  engine.init({ base, files });
  await engine.load();
  for (const mode of ["cancel", "signal"]) {
    const controller = new AbortController();
    const result = engine.transcribe(audio, { signal: controller.signal });
    const { id } = worker().messages.at(-1);
    if (mode === "cancel") engine.cancel();
    else controller.abort();
    await assert.rejects(result, expectCode("aborted"));
    assert.deepEqual(worker().messages.at(-1), { op: "cancel", target: id });
    worker().reply(id, { text: "discarded", ms: 0 });
  }
  const next = engine.transcribe(audio);
  worker().reply(worker().messages.at(-1).id);
  assert.equal((await next).text, "hello world");
});

test("aborting load from its progress callback starts no worker", async () => {
  const { engine, workers } = setup();
  engine.init({ base, files });
  const controller = new AbortController();
  await assert.rejects(engine.load({
    signal: controller.signal, onProgress: () => controller.abort(),
  }), expectCode("aborted"));
  assert.equal(workers.length, 0);
  assert.equal(engine.status().state, "initialised");
});

test("unload rejects active work, terminates the worker, and permits reload", async () => {
  const { engine, worker } = setup();
  engine.init({ base, files });
  await engine.load();
  const firstWorker = worker();
  const result = engine.transcribe(audio);
  assert.deepEqual(engine.unload(), { ok: true });
  await assert.rejects(result, expectCode("aborted"));
  await assert.rejects(engine.transcribe(audio), expectCode("not-loaded"));
  assert.ok(firstWorker.terminated);
  assert.deepEqual(engine.status(), { state: "initialised", totalBytes: 36, threads: 0 });
  await engine.load();
  assert.notEqual(worker(), firstWorker);
});

test("worker death rejects active work and a new load gets its own worker", async () => {
  const { engine, worker } = setup();
  engine.init({ base, files });
  await engine.load();
  const dead = worker();
  const pending = engine.transcribe(audio);
  dead.onerror({ message: "worker died" });
  await assert.rejects(pending, expectCode("worker-failed"));
  assert.equal(engine.status().state, "failed");
  await engine.load();
  assert.notEqual(worker(), dead);
  dead.onerror({ message: "stale event" });
  assert.equal(engine.status().state, "ready");
});

test("six parallel engines share verified cache entries across 20 repetitions", { timeout: 15000 }, async () => {
  for (let round = 0; round < 20; round++) {
    const cache = cacheFixture();
    const actors = Array.from({ length: 6 }, () => setup({ cache }));
    await Promise.all(actors.map(async ({ engine }) => {
      await Promise.resolve(); // Release every actor from the same turn.
      engine.init({ base, files });
      assert.equal((await engine.load()).ok, true);
      engine.unload();
    }));
    assert.equal(cache.data.size, files.length);
    for (const [index, file] of files.entries()) {
      assert.deepEqual(cache.data.get(base + file.path), bodies[index]);
    }
  }
});

test("Whisper silence produces the reference log-mel floor for every frame", () => {
  const features = logMel(audio);
  assert.equal(features.length, 80 * 3000);
  assert.ok(features.every((value) => value === -1.5));
});
