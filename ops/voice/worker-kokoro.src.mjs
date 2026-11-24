// The Kokoro voice worker, bundled by ops/voice/build-worker.mjs into chat/vendor/voice/worker-kokoro.js.
// Kokoro-82M q8 on ONNX Runtime Web (WASM, SIMD, threaded when the page is cross-origin isolated) with the phonemizer package (an espeak-ng
// build, GPL-3.0). The text is synthesised here, on the device; the worker never touches the network: the model files are read from the
// page's private storage (OPFS) directory the main thread installed them into. The pipeline is chat/voice/voice-kokoro.mjs.
//
// Protocol (requests carry an id; every reply carries the same id), the same as worker.src.mjs:
//   { op: "load", dir, files: { model, tokenizer, tokenizer_config }, voiceFiles: { voiceId: fileName }, threads? } -> { ok: true, voices: [...], loadMs }
//   { op: "speak", text, voice?, speed? }  -> zero or more { event: "chunk", samples: Float32Array (transferred), index, count, text }
//                                             then { ok: true, chunks, samples, synthMs, firstAudioMs }
//   { op: "cancel", target }               -> stops the speak with id `target` after the chunk in progress
//   { op: "unload" }                       -> { ok: true }
// A failure is { ok: false, error: { name, message } }.

import "./stream-polyfill.mjs";
import * as ort from "onnxruntime-web/wasm";
import { phonemize } from "phonemizer";
import * as pipeline from "../../chat/voice/voice-kokoro.mjs";
import { sha256 } from "../../runtime/providers/vendor/noble-hashes/2.4.0/sha2.js";
import { createKokoroSessionEngine } from "../../runtime/providers/kokoro-session-engine.mjs";

let selectedVoices;
let activeId;
const engine = createKokoroSessionEngine({
  maxThreads: 4,
  pipeline,
  phonemize,
  async loadOrt({ threads }) {
    const base = new URL("./", self.location.href).href;
    ort.env.wasm.wasmPaths = { mjs: base + "ort-wasm-simd-threaded.mjs", wasm: base + "ort-wasm-simd-threaded.wasm" };
    ort.env.wasm.proxy = false;
    ort.env.wasm.numThreads = threads;
    return ort;
  },
  async readVerified(file, { base: dir, signal }) {
    const root = await navigator.storage.getDirectory();
    const folder = await root.getDirectoryHandle(dir);
    const handle = await folder.getFileHandle(file.path.split("/").at(-1));
    const bytes = new Uint8Array(await (await handle.getFile()).arrayBuffer());
    signal.throwIfAborted();
    const hash = Array.from(sha256(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
    if (bytes.byteLength !== file.bytes || hash !== file.sha256) throw new Error("Installed Kokoro artifact failed verification: " + file.path);
    return bytes;
  },
});

async function load({ dir, artifactPins, threads }) {
  if (selectedVoices) return { voices: selectedVoices, loadMs: 0 };
  const start = performance.now();
  const cores = self.navigator?.hardwareConcurrency || 1;
  const selectedThreads = self.crossOriginIsolated
    ? Math.min(4, Number.isInteger(threads) && threads > 0 ? threads : cores)
    : 1;
  engine.init({base:dir, files:artifactPins});
  const result = await engine.load({threads:selectedThreads});
  selectedVoices = result.voices;
  return {voices:selectedVoices, loadMs:Math.round(performance.now()-start)};
}

self.onmessage = async ({data}) => {
  const {id, op} = data;
  const reply = payload => self.postMessage({id,...payload});
  if (op === "cancel") {
    if (data.target === activeId) engine.cancel();
    return;
  }
  try {
    if (op === "load") return reply({ok:true,...await load(data)});
    if (op === "unload") {
      await engine.unload();
      selectedVoices = null;
      return reply({ok:true});
    }
    if (op === "speak") {
      if (!selectedVoices || activeId !== undefined) throw new Error("The Kokoro worker is not ready.");
      activeId = id;
      const voice = pipeline.resolveVoice(data.voice ?? pipeline.DEFAULT_VOICE, selectedVoices);
      const speed = Number.isFinite(data.speed) && data.speed > 0 ? data.speed : 1;
      try {
        const stats = await engine.speak(data.text,{voice,speed,onChunk({samples,index,count,text}) {
          self.postMessage({id,event:"chunk",samples,index,count,text},[samples.buffer]);
        }});
        return reply({ok:true,...stats});
      } finally {
        activeId = undefined;
      }
    }
    throw new Error("Unknown Kokoro worker operation: " + op);
  } catch (error) {
    reply({ok:false,error:{name:error?.name || "Error",message:String(error?.message || error)}});
  }
};
