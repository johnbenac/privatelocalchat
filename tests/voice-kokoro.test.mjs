import './helpers/install-app-config.mjs'; // the model sources the build writes into the page (docs/APP-CONFIG.md)
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import {
  normalizeText, postProcessPhonemes, phonemizeText, splitSentences, splitLongSentence, kokoroChunks, createTokenizer, parseVoice, styleFor, resolveVoice,
  languageForVoice, KOKORO_VOICES, STYLE_DIM,
} from "../chat/voice/voice-kokoro.mjs";
import { KOKORO_Q8_MANIFEST, KOKORO_Q8_BASE_URL, KOKORO_Q8_COMMIT } from "../chat/voice/voice-manifest-kokoro.mjs";
import { createVoiceEngine, validateManifest, KOKORO_VOICE_DIR } from "../chat/voice/voice-engine.mjs";

const golden = JSON.parse(readFileSync(new URL("./fixtures/kokoro-golden.json", import.meta.url), "utf8"));
const tokenizerJson = JSON.parse(readFileSync(new URL("./fixtures/kokoro-tokenizer.json", import.meta.url), "utf8"));
const tokenizerConfig = { model_max_length: 512, pad_token: "$", unk_token: "$" };

// ---------- tokenizer: exact equality with the reference (@huggingface/transformers) ----------
test(`golden: ${golden.tokens.length} phoneme strings tokenize to exactly the reference token ids`, () => {
  assert.ok(golden.tokens.length >= 12);
  const tok = createTokenizer(tokenizerJson, tokenizerConfig);
  for (const { phonemes, ids } of golden.tokens) assert.deepEqual(tok.encode(phonemes), ids, JSON.stringify(phonemes.slice(0, 40)));
});
test("tokenizer: pads both ends, drops characters outside the vocabulary, truncates to 512 like the reference", () => {
  const tok = createTokenizer(tokenizerJson, tokenizerConfig);
  assert.deepEqual(tok.encode(""), [0, 0]);
  assert.deepEqual(tok.encode("a b"), [0, 43, 16, 44, 0]);
  assert.deepEqual(tok.encode("a中b"), [0, 43, 44, 0]);
  assert.equal(tok.encode("a".repeat(900)).length, 512);
  assert.throws(() => createTokenizer({}), /vocabulary/);
});

// ---------- phonemize: replays the reference's recorded phonemizer calls ----------
test(`golden: phonemizeText equals the reference for ${golden.phonemize.length} sentence and voice combinations`, async () => {
  for (const g of golden.phonemize) {
    const queue = g.calls.map((c) => [...c]);
    const replay = async (text, language) => {
      const call = queue.shift();
      assert.ok(call, `unexpected phonemizer call for ${JSON.stringify(text)}`);
      assert.deepEqual([text, language], [call[0], call[1]]);
      return call[2];
    };
    assert.equal(await phonemizeText(g.text, g.voice === "a" ? "af_heart" : "bf_emma", replay), g.expected, g.text);
    assert.equal(queue.length, 0, "every recorded call was made");
  }
});
test("normalizeText follows the reference rules", () => {
  assert.equal(normalizeText("Dr. Smith paid $5.50 in 1999."), "Doctor Smith paid 5 dollars and 50 cents in 19 99.");
  assert.equal(normalizeText("At 10:05, 3.14"), "At 10 oh 5, 3 point 1 4");
  assert.equal(normalizeText("(hi) “there”"), "«hi» \"there\"");
});
test("postProcessPhonemes maps r, x, ʲ and ɬ, and the American 'ninety'", () => {
  assert.equal(postProcessPhonemes("rxʲɬ"), "ɹkjl");
  assert.equal(postProcessPhonemes("nˈaɪnti"), "nˈaɪndi");
  assert.equal(postProcessPhonemes("nˈaɪnti", false), "nˈaɪnti");
  assert.equal(languageForVoice("af_heart"), "en-us");
  assert.equal(languageForVoice("bm_george"), "en");
});

// ---------- sentence splitting ----------
test(`golden: splitSentences equals the reference for ${golden.splits.length} texts`, () => {
  for (const g of golden.splits) assert.deepEqual(splitSentences(g.text), g.sentences, JSON.stringify(g.text));
});
test("splitLongSentence leaves short sentences alone and cuts long ones at clauses then words, under the limit", () => {
  assert.deepEqual(splitLongSentence("Short one."), ["Short one."]);
  const clauses = Array.from({ length: 30 }, (_, i) => `clause number ${i} goes here`).join(", ");
  const pieces = splitLongSentence(clauses, 300);
  assert.ok(pieces.length > 1 && pieces.every((p) => p.length <= 300), pieces.map((p) => p.length).join());
  assert.equal(pieces.join(" ").replace(/\s+/g, " "), clauses.replace(/\s+/g, " "));
  const words = splitLongSentence("word ".repeat(200).trim(), 100);
  assert.ok(words.every((p) => p.length <= 100));
  assert.deepEqual(kokoroChunks("One. Two!"), ["One.", "Two!"]);
});

// ---------- voices ----------
test("parseVoice reads whole rows of float32 and styleFor picks row min(max(ids-2,0),509) like the reference", () => {
  const rows = 510;
  const floats = new Float32Array(rows * STYLE_DIM).map((_, i) => Math.floor(i / STYLE_DIM) + (i % STYLE_DIM) / 1000);
  const bytes = new Uint8Array(floats.buffer.slice(0));
  const voice = parseVoice(bytes);
  assert.equal(voice.length, rows * STYLE_DIM);
  assert.equal(styleFor(voice, 2)[0], 0); // two pads, no tokens
  assert.equal(styleFor(voice, 0)[0], 0);
  assert.equal(styleFor(voice, 34)[0], 32); // the 32 phoneme tokens of a 34-id sequence
  assert.equal(styleFor(voice, 34).length, 256);
  assert.equal(styleFor(voice, 512)[0], 509);
  assert.equal(styleFor(voice, 5000)[0], 509);
  assert.throws(() => parseVoice(new Uint8Array(1000)), /whole rows/);
  assert.throws(() => parseVoice(new Uint8Array(0)), /whole rows/);
});
test("resolveVoice accepts ids and display names", () => {
  assert.equal(resolveVoice("af_heart"), "af_heart");
  assert.equal(resolveVoice("Emma"), "bf_emma");
  assert.equal(resolveVoice(undefined), "af_heart");
  assert.throws(() => resolveVoice("Nobody"), /unknown voice/);
  assert.equal(Object.keys(KOKORO_VOICES).length, 8);
});

// ---------- manifest ----------
test("the Kokoro manifest is valid, pins the named files and the commit lives in one constant", () => {
  validateManifest(KOKORO_Q8_MANIFEST);
  const names = KOKORO_Q8_MANIFEST.files.map((f) => f.path);
  assert.deepEqual(names.slice(0, 4), ["onnx/model_quantized.onnx", "tokenizer.json", "tokenizer_config.json", "config.json"]);
  assert.equal(names.filter((n) => n.startsWith("voices/")).length, 8);
  const model = KOKORO_Q8_MANIFEST.files[0];
  assert.equal(model.bytes, 92361116);
  assert.equal(model.sha256, "fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478");
  assert.equal(KOKORO_Q8_BASE_URL, `https://assets.privatelocal.chat/models/Kokoro-82M-v1.0-ONNX-q8/${KOKORO_Q8_COMMIT}/`);
  assert.ok(KOKORO_Q8_MANIFEST.files.filter((f) => f.role === "voice").every((f) => f.bytes === 522240));
});
test("the pinned tokenizer fixture matches the manifest checksum", () => {
  const entry = KOKORO_Q8_MANIFEST.files.find((f) => f.role === "tokenizer");
  const bytes = readFileSync(new URL("./fixtures/kokoro-tokenizer.json", import.meta.url));
  assert.equal(bytes.length, entry.bytes);
  assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), entry.sha256);
});

// ---------- the engine selects Kokoro ----------
class FakeFile {
  constructor() { this.bytes = new Uint8Array(0); }
  async getFile() { const b = this.bytes; return { size: b.length, text: async () => new TextDecoder().decode(b) }; }
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

test("createVoiceEngine({engine:'kokoro'}) downloads by manifest path into its own directory, tells the worker the voices, and remove purges only what it should", async () => {
  const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
  const contents = { "m.onnx": Buffer.alloc(300, 1), "tokenizer.json": Buffer.from("{}"), "tc.json": Buffer.from("{}x"), "config.json": Buffer.from('{"a":1}'), "af_heart.bin": Buffer.alloc(40, 2), "bf_emma.bin": Buffer.alloc(40, 3) };
  const paths = { "m.onnx": "onnx/m.onnx", "af_heart.bin": "voices/af_heart.bin", "bf_emma.bin": "voices/bf_emma.bin" };
  const roles = { "m.onnx": "model", "tokenizer.json": "tokenizer", "tc.json": "tokenizer_config", "config.json": "config", "af_heart.bin": "voice", "bf_emma.bin": "voice" };
  const manifest = { id: "test-kokoro", requiredRoles: ["model", "tokenizer", "config", "voice"], files: Object.entries(contents).map(([name, b]) => ({ name, path: paths[name], role: roles[name], bytes: b.length, sha256: sha(b) })) };
  const requests = [];
  const fetchImpl = async (url) => {
    requests.push(url);
    const body = contents[url.split("/").pop()];
    if (!body) return { ok: false, status: 404 };
    return { ok: true, status: 200, body: new ReadableStream({ start(c) { c.enqueue(new Uint8Array(body)); c.close(); } }) };
  };
  // stands in for the shared OPFS stream writer, which needs a real worker (see tests/e2e/voice-kokoro.e2e.mjs for the real one)
  const writeStream = async (key, stream) => {
    const reader = stream.getReader(); const parts = [];
    for (;;) { const { done, value } = await reader.read(); if (done) break; parts.push(Buffer.from(value)); }
    const dir = await root.getDirectoryHandle(KOKORO_VOICE_DIR, { create: true });
    (await dir.getFileHandle(key, { create: true })).bytes = Buffer.concat(parts);
  };
  const root = new FakeDir();
  // the Kitten directory exists too: removing Kokoro must keep the shared runtime files cached
  await root.getDirectoryHandle("plc-voice-kitten-nano-0.8", { create: true });
  const urls = ["worker.js", "worker-kokoro.js", "worker-kokoro.js.LEGAL.txt", "ort-wasm-simd-threaded.wasm"].map((n) => `https://app.example/releases/abc/chat/vendor/voice/${n}`);
  const entries = new Map([["shell", new Set([...urls, "https://app.example/index.html"])]]);
  const cachesImpl = { keys: async () => [...entries.keys()], open: async (name) => ({ keys: async () => [...entries.get(name)].map((url) => ({ url })), delete: async (r) => entries.get(name).delete(r.url) }) };
  const sent = [];
  const createWorker = () => ({
    terminate() {},
    postMessage(m) {
      sent.push(m);
      queueMicrotask(() => {
        if (m.op === "load") this.onmessage({ data: { id: m.id, ok: true, voices: Object.keys(m.voiceFiles), loadMs: 1 } });
        else if (m.op === "speak") {
          this.onmessage({ data: { id: m.id, event: "chunk", samples: new Float32Array(24000), index: 0, count: 1, text: "a" } });
          this.onmessage({ data: { id: m.id, ok: true, chunks: 1, samples: 24000, synthMs: 2000, firstAudioMs: 900 } });
        } else if (m.op === "unload") this.onmessage({ data: { id: m.id, ok: true } });
      });
    },
  });
  const engine = createVoiceEngine({ engine: "kokoro", baseUrl: "https://cdn.example/k", manifest, fetchImpl, getRoot: async () => root, writeStream, pause: async () => {}, createWorker, cachesImpl });
  await engine.install();
  assert.deepEqual(requests, ["m.onnx", "tokenizer.json", "tc.json", "config.json", "af_heart.bin", "bf_emma.bin"].map((n) => "https://cdn.example/k/" + (paths[n] || n)));
  assert.ok(root.dirs.has(KOKORO_VOICE_DIR));
  assert.equal(KOKORO_VOICE_DIR, "plc-voice-kokoro-q8");
  const got = [];
  const stats = await engine.speak("Hello.", { voice: "af_heart", onChunk: (c) => got.push(c.sampleRate) });
  assert.deepEqual(got, [24000]);
  assert.deepEqual({ a: stats.audioSeconds, s: stats.synthSeconds, r: stats.realTimeFactor, f: stats.firstAudioMs }, { a: 1, s: 2, r: 0.5, f: 900 });
  const load = sent.find((m) => m.op === "load");
  assert.deepEqual(load.files, { model: "m.onnx", tokenizer: "tokenizer.json", tokenizer_config: "tc.json", config: "config.json" });
  assert.deepEqual(load.voiceFiles, { af_heart: "af_heart.bin", bf_emma: "bf_emma.bin" });
  assert.equal(load.dir, KOKORO_VOICE_DIR);
  assert.equal((await engine.status()).installed, true);
  const removed = await engine.remove();
  assert.equal(removed.installed, false);
  assert.ok(root.dirs.has("plc-voice-kitten-nano-0.8") && !root.dirs.has(KOKORO_VOICE_DIR));
  assert.deepEqual([...entries.get("shell")].map((u) => u.split("/").pop()), ["worker.js", "ort-wasm-simd-threaded.wasm", "index.html"], "Kokoro's worker goes, Kitten's worker and the shared runtime stay");
  await root.removeEntry("plc-voice-kitten-nano-0.8");
  await engine.remove();
  assert.deepEqual([...entries.get("shell")].map((u) => u.split("/").pop()), ["worker.js", "index.html"], "with no other engine installed the shared runtime goes as well");
  assert.throws(() => createVoiceEngine({ engine: "nope" }), (e) => e.code === "bad-engine");
});

test("the real shipped Kokoro files (if present in VOICE_KOKORO_DIR) match the manifest", { skip: !process.env.VOICE_KOKORO_DIR && "set VOICE_KOKORO_DIR to check the downloaded files" }, () => {
  for (const f of KOKORO_Q8_MANIFEST.files) {
    const p = `${process.env.VOICE_KOKORO_DIR}/${f.path}`;
    assert.ok(existsSync(p), p);
    const bytes = readFileSync(p);
    assert.equal(bytes.length, f.bytes, f.path);
    assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), f.sha256, f.path);
  }
});
