import './helpers/install-app-config.mjs'; // the model sources the build writes into the page (docs/APP-CONFIG.md)
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  SYMBOLS, SYMBOL_INDEX, tokenizePhonemes, chunkToIds, phonemizeChunk, phonemesToIds, chunkText, ensurePunctuation, parseNpy, parseNpz, resolveVoice, effectiveSpeed,
  styleFor, trimAudio,
} from "../chat/voice/voice-kitten.mjs";
import { createVoiceEngine, validateManifest } from "../chat/voice/voice-engine.mjs";
import { KITTEN_NANO_MANIFEST } from "../chat/voice/voice-manifest.mjs";

// ---------- symbol table ----------
test("the symbol table has the reference's 178 entries and indexes", () => {
  assert.equal(SYMBOLS.length, 178);
  assert.equal(SYMBOL_INDEX.get("$"), 0);
  assert.equal(SYMBOL_INDEX.get(";"), 1);
  assert.equal(SYMBOL_INDEX.get(" "), 16);
  assert.equal(SYMBOL_INDEX.get("A"), 17);
  assert.equal(SYMBOL_INDEX.get("a"), 43);
  assert.equal(SYMBOL_INDEX.get("ɑ"), 69); // first IPA letter
  assert.equal(SYMBOLS[177], "ᵻ"); // last
  assert.equal(SYMBOL_INDEX.get("ᵻ"), 177);
});

// ---------- tokenizer ----------
test("tokenizePhonemes accepts an array and keeps stress and punctuation as tokens", () => {
  assert.equal(tokenizePhonemes(["a b", "c."]), "a b c .");
  assert.equal(tokenizePhonemes("ab, cd"), "ab , cd");
  assert.equal(tokenizePhonemes(""), "");
  assert.equal(tokenizePhonemes(undefined), "");
});
test("phonemesToIds frames with pad 0, maps known symbols and drops unknown ones", () => {
  assert.deepEqual(phonemesToIds("A a"), [0, 17, 16, 43, 0]);
  assert.deepEqual(phonemesToIds("a中b"), [0, 43, 44, 0]);
  assert.deepEqual(phonemesToIds(""), [0, 0]);
});

// ---------- chunking ----------
test("chunkText splits at sentence ends and ends each chunk with punctuation", () => {
  assert.deepEqual(chunkText("Hello there. How are you? Fine!"), ["Hello there,", "How are you,", "Fine,"]);
  assert.deepEqual(chunkText("One, two; three:"), ["One, two; three:"]);
  assert.deepEqual(chunkText("   "), []);
  assert.deepEqual(chunkText(""), []);
  assert.equal(ensurePunctuation(" hi "), "hi,");
});
test("chunkText packs long sentences into pieces of at most 400 characters", () => {
  const sentence = Array.from({ length: 200 }, (_, i) => "word" + (i % 10)).join(" "); // about 1000 characters
  const chunks = chunkText(sentence);
  assert.ok(chunks.length >= 3);
  for (const c of chunks) assert.ok(c.length <= 401, `chunk of ${c.length}`); // 400 plus the added comma
  assert.equal(chunks.join(" ").replace(/,/g, "").split(/\s+/).length, 200);
  const exactly = "x".repeat(400);
  assert.deepEqual(chunkText(exactly), [exactly + ","]);
});

// ---------- npy / npz ----------
function makeNpy(shape, values, { version = 1, descr = "<f4" } = {}) {
  let header = `{'descr': '${descr}', 'fortran_order': False, 'shape': (${shape.join(", ")}${shape.length === 1 ? "," : ""}), }`;
  const lead = version === 1 ? 10 : 12;
  while ((lead + header.length + 1) % 64) header += " ";
  header += "\n";
  const out = new Uint8Array(lead + header.length + values.length * 4);
  out.set([0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59, version, 0]);
  const dv = new DataView(out.buffer);
  if (version === 1) dv.setUint16(8, header.length, true); else dv.setUint32(8, header.length, true);
  out.set(new TextEncoder().encode(header), lead);
  new Float32Array(out.buffer, lead + header.length, values.length).set(values);
  return out;
}
test("parseNpy reads shape and float32 data (format 1.0 and 2.0)", () => {
  for (const version of [1, 2]) {
    const npy = parseNpy(makeNpy([2, 3], [1, 2, 3, 4, 5, 6.5], { version }));
    assert.deepEqual(npy.shape, [2, 3]);
    assert.deepEqual([...npy.data], [1, 2, 3, 4, 5, 6.5]);
  }
  assert.deepEqual(parseNpy(makeNpy([3], [1, 2, 3])).shape, [3]);
});
test("parseNpy refuses other dtypes, bad magic and truncated data", () => {
  assert.throws(() => parseNpy(makeNpy([1], [1], { descr: "<f8" })), /dtype/);
  assert.throws(() => parseNpy(new Uint8Array(40)), /not an .npy/);
  const ok = makeNpy([2, 2], [1, 2, 3, 4]);
  assert.throws(() => parseNpy(ok.subarray(0, ok.length - 4)), /shape/);
});
test("parseNpz maps .npy members to voices through the injected unzip", () => {
  const unzip = () => ({ "expr-voice-2-f.npy": makeNpy([2, 2], [1, 2, 3, 4]), "README.txt": new Uint8Array(3) });
  const voices = parseNpz(new Uint8Array(1), unzip);
  assert.deepEqual(Object.keys(voices), ["expr-voice-2-f"]);
  assert.throws(() => parseNpz(new Uint8Array(1), () => ({})), /no voices/);
});
const fflatePath = new URL("../ops/voice/node_modules/fflate/lib/node.cjs", import.meta.url);
test("parseNpz reads a real zip made with fflate (needs ops/voice npm ci)", { skip: !existsSync(fflatePath) && "ops/voice/node_modules is not installed" }, () => {
  const { zipSync, unzipSync } = createRequire(import.meta.url)(fflatePath.pathname);
  const zip = zipSync({ "a.npy": makeNpy([1, 2], [7, 8]), "b.npy": makeNpy([1, 2], [9, 10]) });
  const voices = parseNpz(zip, unzipSync);
  assert.deepEqual([...voices.b.data], [9, 10]);
});

// ---------- voice, speed, style, trim ----------
test("resolveVoice, effectiveSpeed, styleFor and trimAudio follow the reference", () => {
  const config = { voice_aliases: { Leo: "expr-voice-5-m" }, speed_priors: { "expr-voice-5-m": 0.8, "expr-voice-4-m": 0.9 } };
  const voices = { "expr-voice-5-m": { shape: [3, 2], data: Float32Array.of(0, 1, 2, 3, 4, 5) }, "expr-voice-4-m": { shape: [1, 1], data: Float32Array.of(0) } };
  assert.equal(resolveVoice(config, voices, "Leo"), "expr-voice-5-m");
  assert.equal(resolveVoice(config, voices, "expr-voice-4-m"), "expr-voice-4-m");
  assert.equal(resolveVoice(config, voices), "expr-voice-5-m");
  assert.throws(() => resolveVoice(config, voices, "Nobody"), /unknown voice/);
  assert.ok(Math.abs(effectiveSpeed(config, "expr-voice-5-m", 1.5) - 1.2) < 1e-9);
  assert.equal(effectiveSpeed(config, "other", 1.5), 1.5);
  assert.deepEqual([...styleFor(voices["expr-voice-5-m"], 1)], [2, 3]);
  assert.deepEqual([...styleFor(voices["expr-voice-5-m"], 99)], [4, 5]); // min(len, rows - 1)
  assert.equal(trimAudio(new Float32Array(5100)).length, 100);
  assert.equal(trimAudio(new Float32Array(10)).length, 0);
});

// ---------- manifest ----------
test("the shipped manifest is valid and pins the three files", () => {
  validateManifest(KITTEN_NANO_MANIFEST);
  assert.deepEqual(KITTEN_NANO_MANIFEST.files.map((f) => f.name), ["kitten_tts_nano_v0_8.onnx", "voices.npz", "config.json"]);
});
test("validateManifest rejects bad entries", () => {
  const good = KITTEN_NANO_MANIFEST.files;
  const bad = (patch) => ({ id: "x", files: [{ ...good[0], ...patch }, good[1], good[2]] });
  assert.throws(() => validateManifest(null), /no files/);
  assert.throws(() => validateManifest(bad({ sha256: "abc" })), /SHA-256/);
  assert.throws(() => validateManifest(bad({ bytes: 0 })), /size/);
  assert.throws(() => validateManifest(bad({ name: "../evil" })), /file name/);
  assert.throws(() => validateManifest({ id: "x", files: [good[0]] }), /no voices/);
});

// ---------- install / remove with fakes ----------
class FakeFile {
  constructor() { this.bytes = new Uint8Array(0); }
  async getFile() { const b = this.bytes; return { size: b.length, text: async () => new TextDecoder().decode(b), arrayBuffer: async () => b.slice().buffer }; }
  async createWritable() {
    const parts = []; const self = this;
    return { write: async (c) => { parts.push(typeof c === "string" ? new TextEncoder().encode(c) : Uint8Array.from(c)); }, close: async () => { self.bytes = Buffer.concat(parts); }, abort: async () => {} };
  }
}
class FakeDir {
  constructor() { this.files = new Map(); this.dirs = new Map(); }
  async getDirectoryHandle(name, { create } = {}) {
    if (!this.dirs.has(name)) { if (!create) throw Object.assign(new Error("nf"), { name: "NotFoundError" }); this.dirs.set(name, new FakeDir()); }
    return this.dirs.get(name);
  }
  async getFileHandle(name, { create } = {}) {
    if (!this.files.has(name)) { if (!create) throw Object.assign(new Error("nf"), { name: "NotFoundError" }); this.files.set(name, new FakeFile()); }
    return this.files.get(name);
  }
  async removeEntry(name) { if (!this.dirs.delete(name) && !this.files.delete(name)) throw Object.assign(new Error("nf"), { name: "NotFoundError" }); }
}
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
function fixture() {
  const contents = { "kitten_tts_nano_v0_8.onnx": Buffer.alloc(3000, 1), "voices.npz": Buffer.alloc(700, 2), "config.json": Buffer.from('{"a":1}') };
  const roles = { "kitten_tts_nano_v0_8.onnx": "model", "voices.npz": "voices", "config.json": "config" };
  const manifest = { id: "test-voice", files: Object.entries(contents).map(([name, b]) => ({ name, role: roles[name], bytes: b.length, sha256: sha(b) })) };
  const requests = [];
  const fetchImpl = async (url) => {
    requests.push(url);
    const name = url.split("/").pop();
    const body = contents[name];
    if (!body) return { ok: false, status: 404 };
    const half = Math.ceil(body.length / 2);
    const parts = [body.subarray(0, half), body.subarray(half)];
    return { ok: true, status: 200, body: new ReadableStream({ start(c) { for (const part of parts) c.enqueue(new Uint8Array(part)); c.close(); } }) };
  };
  const root = new FakeDir();
  // stands in for the shared OPFS stream writer (runtime/providers/opfs-stream-writer.mjs), which needs a real worker
  const writeStream = async (key, stream) => {
    const reader = stream.getReader(); const parts = [];
    for (;;) { const { done, value } = await reader.read(); if (done) break; parts.push(Buffer.from(value)); }
    const dir = await root.getDirectoryHandle("plc-voice-kitten-nano-0.8", { create: true });
    (await dir.getFileHandle(key, { create: true })).bytes = Buffer.concat(parts);
  };
  return { contents, manifest, requests, fetchImpl, root, writeStream, make: (extra = {}) => createVoiceEngine({ baseUrl: "https://cdn.example/voice", manifest, fetchImpl, getRoot: async () => root, writeStream, pause: async () => {}, ...extra }) };
}


test("tokenizePhonemes keeps IPA letters and stress/length marks inside words (Unicode-aware) and splits punctuation off", () => {
  assert.equal(tokenizePhonemes("h\u0259l\u02c8o\u028a, w\u02c8\u025c\u02d0ld!"), "h\u0259l\u02c8o\u028a , w\u02c8\u025c\u02d0ld !");
});

test("install downloads, verifies, stores under its own directory, reports progress; remove deletes it", async () => {
  const f = fixture();
  const engine = f.make();
  const before = await engine.status();
  assert.equal(before.installed, false);
  assert.equal(before.totalBytes, 3707);
  const progress = [];
  const after = await engine.install((p) => progress.push(p));
  assert.equal(after.installed, true);
  assert.equal(after.bytes, 3707);
  assert.deepEqual(f.requests, f.manifest.files.map((x) => "https://cdn.example/voice/" + x.name));
  assert.equal(progress.at(-1).overallLoaded, 3707);
  assert.equal(progress.at(-1).overallTotal, 3707);
  assert.ok(f.root.dirs.has("plc-voice-kitten-nano-0.8"));
  assert.equal(f.root.files.size, 0); // nothing outside the dedicated directory
  await engine.install();
  assert.equal(f.requests.length, 3, "an installed voice is not downloaded again");
  const removed = await engine.remove();
  assert.equal(removed.installed, false);
  assert.equal(f.root.dirs.size, 0);
  await engine.remove(); // removing nothing is fine
});

test("install refuses a file whose SHA-256 does not match and leaves nothing behind", async () => {
  const f = fixture();
  f.contents["voices.npz"] = Buffer.alloc(700, 9); // served bytes differ from the pinned ones
  const engine = f.make();
  await assert.rejects(engine.install(), (e) => e.code === "hash-mismatch" && e.file === "voices.npz");
  assert.equal(f.root.dirs.size, 0);
  assert.equal((await engine.status()).installed, false);
});

test("install refuses a wrong size", async () => {
  const f = fixture();
  f.contents["config.json"] = Buffer.from('{"a":1,"b":2}');
  await assert.rejects(f.make().install(), (e) => e.code === "hash-mismatch");
  assert.equal(f.root.dirs.size, 0);
});

test("install retries a transient HTTP failure and cleans up after a permanent one", async () => {
  const f = fixture();
  let failures = 1;
  const flaky = async (url) => (failures-- > 0 ? { ok: false, status: 503 } : f.fetchImpl(url));
  assert.equal((await f.make({ fetchImpl: flaky }).install()).installed, true);
  const g = fixture();
  await assert.rejects(g.make({ fetchImpl: async () => ({ ok: false, status: 404 }) }).install(), /404/);
  assert.equal(g.root.dirs.size, 0);
});

test("install without a baseUrl, and load before install, fail clearly", async () => {
  const f = fixture();
  await assert.rejects(createVoiceEngine({ manifest: f.manifest, getRoot: async () => f.root }).install(), (e) => e.code === "no-base-url");
  await assert.rejects(f.make({ createWorker: () => { throw new Error("must not start"); } }).load(), (e) => e.code === "not-installed");
});

test("speak drives the worker protocol: chunks in order, stats derived, the model loads once", async () => {
  const f = fixture();
  const sent = [];
  const createWorker = () => ({
    terminate() { this.dead = true; },
    postMessage(m) {
      sent.push(m);
      queueMicrotask(() => {
        if (m.op === "load") this.onmessage({ data: { id: m.id, ok: true, voices: ["v"], loadMs: 5 } });
        else if (m.op === "speak") {
          this.onmessage({ data: { id: m.id, event: "chunk", samples: new Float32Array(24000), index: 0, count: 2, text: "a" } });
          this.onmessage({ data: { id: m.id, event: "chunk", samples: new Float32Array(12000), index: 1, count: 2, text: "b" } });
          this.onmessage({ data: { id: m.id, ok: true, chunks: 2, samples: 36000, synthMs: 750, firstAudioMs: 300 } });
        } else if (m.op === "unload") this.onmessage({ data: { id: m.id, ok: true } });
      });
    },
  });
  const engine = f.make({ createWorker });
  await engine.install();
  const got = [];
  const stats = await engine.speak("A. B.", { onChunk: (c) => got.push([c.index, c.samples.length, c.sampleRate]), voice: "Leo", speed: 1.1 });
  assert.deepEqual(got, [[0, 24000, 24000], [1, 12000, 24000]]);
  assert.equal(stats.audioSeconds, 1.5);
  assert.equal(stats.synthSeconds, 0.75);
  assert.equal(stats.realTimeFactor, 2);
  assert.equal(stats.firstAudioMs, 300);
  const speakMessage = sent.find((m) => m.op === "speak");
  assert.deepEqual(speakMessage, { id: speakMessage.id, op: "speak", text: "A. B.", speed: 1.1, voice: "Leo" });
  assert.equal((await engine.status()).loaded, true);
  await engine.speak("again");
  assert.equal(sent.filter((m) => m.op === "load").length, 1);
  const removed = await engine.remove(); // unloads, terminates, deletes
  assert.equal(removed.installed, false);
  assert.equal(removed.loaded, false);
});

test("an aborted signal rejects speak with AbortError before any work", async () => {
  const f = fixture();
  const engine = f.make({ createWorker: () => { throw new Error("must not start"); } });
  await engine.install();
  await assert.rejects(engine.speak("hi", { signal: AbortSignal.abort() }), (e) => e.name === "AbortError");
});

// ---------- golden ids from KittenTTS's own Python reference (espeak-ng, preserve_punctuation=True) ----------
const golden = JSON.parse(readFileSync(new URL("./fixtures/kitten-golden.json", import.meta.url), "utf8"));
const PARIS_IDS = [0, 81, 83, 16, 53, 156, 72, 58, 102, 125, 83, 54, 16, 138, 64, 16, 48, 123, 156, 72, 56, 61, 16, 102, 68, 16, 58, 156, 72, 123, 102, 61, 16, 3, 0];

test("golden: the reference phonemes of 'The capital of France is Paris,' give exactly the reference ids", () => {
  const g = golden.find((x) => x.chunk === "The capital of France is Paris,");
  assert.equal(g.phonemes, "ðə kˈæpɪɾəl ʌv fɹˈæns ɪz pˈæɹɪs, ");
  assert.deepEqual(phonemesToIds(tokenizePhonemes(g.phonemes)), PARIS_IDS);
  assert.equal(PARIS_IDS.length, 35);
});
test("golden: every reference chunk's phonemes give the reference ids", () => {
  assert.ok(golden.length >= 3);
  for (const g of golden) assert.deepEqual(phonemesToIds(tokenizePhonemes(g.phonemes)), g.ids, g.chunk);
});

test("phonemizeChunk phonemizes between punctuation and puts the marks back after the preceding word", async () => {
  const calls = [];
  const fake = async (text) => { calls.push(text); return [text.toUpperCase()]; };
  assert.equal(await phonemizeChunk("Hello, big world,", fake), "HELLO, BIG WORLD, ");
  assert.deepEqual(calls, ["Hello", "big world"]);
  assert.equal(await phonemizeChunk("Wait — what?!", fake), "WAIT— WHAT?! ");
});

const phonemizerPath = new URL("../ops/voice/node_modules/phonemizer/dist/phonemizer.js", import.meta.url);
test("golden with the real phonemizer: chunk ids equal the reference ids (needs ops/voice npm ci)", { skip: !existsSync(phonemizerPath) && "ops/voice/node_modules is not installed" }, async () => {
  const { phonemize } = await import(phonemizerPath.href);
  const g = golden.find((x) => x.chunk === "The capital of France is Paris,");
  assert.deepEqual(await chunkToIds(g.chunk, phonemize), PARIS_IDS);
  // The npm espeak-ng build says "foːɹ" where the Python build says "fɔːɹ" for "four"; every other reference chunk matches exactly.
  let identical = 0;
  for (const x of golden) {
    const ids = await chunkToIds(x.chunk, phonemize);
    if (JSON.stringify(ids) === JSON.stringify(x.ids)) identical++;
    else assert.ok(/ four /.test(x.chunk), `unexpected difference in: ${x.chunk}`);
  }
  assert.ok(identical >= golden.length - 1, `${identical}/${golden.length} identical`);
});

test("remove also clears the ONNX Runtime files the service worker cached, and nothing else", async () => {
  const urls = [
    "https://app.example/releases/abc/chat/vendor/voice/ort-wasm-simd-threaded.wasm",
    "https://app.example/releases/abc/chat/vendor/voice/ort-wasm-simd-threaded.mjs",
    "https://app.example/releases/abc/chat/vendor/voice/worker.js",
    "https://app.example/releases/abc/index.html",
  ];
  const entries = new Map([["shell", new Set(urls)], ["other", new Set(["https://app.example/other/ort-wasm.wasm.txt"])]]);
  const cachesImpl = {
    keys: async () => [...entries.keys()],
    open: async (name) => ({ keys: async () => [...entries.get(name)].map((url) => ({ url })), delete: async (r) => entries.get(name).delete(r.url) }),
  };
  const f = fixture();
  const engine = f.make({ cachesImpl });
  await engine.install();
  await engine.remove();
  assert.deepEqual([...entries.get("shell")], [urls[3]], "the voice worker and runtime files are dropped, the app is not");
  assert.equal(entries.get("other").size, 1);
  const noCaches = f.make({ cachesImpl: { keys: async () => { throw new Error("denied"); } } });
  await noCaches.remove(); // a cache that cannot be read does not make removal fail
});

test("a download server that never answers fails with a clear timeout instead of waiting at 0% for ever", async () => {
  const f = fixture();
  const hang = (url, { signal } = {}) => new Promise((_, reject) => signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))));
  const engine = f.make({ fetchImpl: hang, connectTimeoutMs: 20, attempts: 2 });
  const events = [];
  await assert.rejects(engine.install((e) => events.push(e)), (e) => /connection timed out/.test(e.message) && e.name === "TimeoutError");
  assert.equal(events.filter((e) => e.phase === "connecting").length, 2, "it said it was connecting, tried twice");
  assert.ok(events.some((e) => e.phase === "retry"), "and showed that it was retrying");
  assert.equal(f.root.dirs.size, 0, "nothing is left behind");
});

test("a download that stalls is retried and then succeeds; progress starts with connecting", async () => {
  const f = fixture();
  let stalled = 0;
  const writeStream = async (key, stream) => {
    if (!stalled++) { await stream.cancel(); throw Object.assign(new Error("Model download stalled"), { code: "download-read-timeout" }); }
    return f.writeStream(key, stream);
  };
  const events = [];
  const result = await f.make({ writeStream }).install((e) => events.push(e));
  assert.equal(result.installed, true);
  assert.equal(events[0].phase, "connecting");
  assert.ok(events.some((e) => e.phase === "retry"), "the stall was retried, not fatal");
  assert.equal(f.requests.length, 4, "three files plus one retry");
});

test("a cancelled install stops and leaves nothing behind", async () => {
  const f = fixture(); const ac = new AbortController();
  const hang = (url, { signal } = {}) => new Promise((_, reject) => signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))));
  const engine = f.make({ fetchImpl: hang, connectTimeoutMs: 60000 });
  const run = engine.install(() => {}, { signal: ac.signal });
  setTimeout(() => ac.abort(), 10);
  await assert.rejects(run, (e) => e.name === "AbortError");
  assert.equal(f.root.dirs.size, 0);
});

test("a threaded runtime that runs out of memory on a phone is retried once with one thread in a fresh worker; other errors are not retried", async () => {
  const f = fixture();
  const loads = [];
  const make = (failFirst, message) => () => {
    const w = { terminate() { this.dead = true; },
      postMessage(m) { queueMicrotask(() => { if (m.op !== "load") return;
        loads.push({ threads: m.threads, worker: w });
        if (failFirst && loads.length === 1) this.onmessage({ data: { id: m.id, ok: false, error: { name: "Error", message } } });
        else this.onmessage({ data: { id: m.id, ok: true, voices: ["v"], loadMs: 5 } }); }); } };
    return w;
  };
  const a = f.make({ createWorker: make(true, "no available backend found. ERR: [wasm] RangeError: WebAssembly.Memory(): could not allocate memory") });
  await a.install(); await a.load();
  assert.equal(loads.length, 2); assert.equal(loads[1].threads, 1, "the second try asks for one thread");
  assert.ok(loads[0].worker.dead, "the failed worker was stopped"); assert.notEqual(loads[0].worker, loads[1].worker);
  loads.length = 0;
  const b = f.make({ createWorker: make(true, "the model file is corrupt") });
  await b.install(); await assert.rejects(b.load(), /corrupt/); assert.equal(loads.length, 1, "an unrelated failure is not retried");
});
