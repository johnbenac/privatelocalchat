// Preserve PLC's voice-worker protocol while the shared engine owns Kitten's
// model session, tensor and cancellation lifecycle.
import "./stream-polyfill.mjs";
import * as ort from "onnxruntime-web/wasm";
import { phonemize } from "phonemizer";
import { unzipSync as unzip } from "fflate";
import * as pipeline from "../../chat/voice/voice-kitten.mjs";
import { sha256 } from "../../runtime/providers/vendor/noble-hashes/2.4.0/sha2.js";
import { createEngineRegistry } from "../../runtime/providers/engine-registry.mjs";
import { registerKitten } from "../../runtime/providers/speech-kitten.mjs";

const modelId = "resource:model/kitten-tts-nano-0.8-int8";
const revision = "84781d74e29ee25217551556398b42f80593a813";
const base = new URL("./", self.location.href).href;
ort.env.wasm.wasmPaths = {
  mjs: base + "ort-wasm-simd-threaded.mjs", wasm: base + "ort-wasm-simd-threaded.wasm",
};
ort.env.wasm.proxy = false;

let adapter, voices, active;
let loading;
async function load({ dir, artifactPins, threads }) {
  if (voices) return { voices, loadMs: 0 };
  if (loading) return loading;
  const started = performance.now();
  const registry = registerKitten(createEngineRegistry(), {
    manifest: { descriptor: {
      resource: { id: modelId, revision }, runtime: { engine: "kitten", version: "kitten-engine-files/1" },
      artifacts: artifactPins.map(file => ({...file, role:file.role === "voices" ? "voice" : file.role})),
    } },
    pipeline, phonemize, unzip, maxThreads: 4,
    async loadOrt({ threads }) {
      ort.env.wasm.numThreads = threads;
      return ort;
    },
    async readVerified(file, { signal }) {
      const root = await navigator.storage.getDirectory();
      const folder = await root.getDirectoryHandle(dir);
      const handle = await folder.getFileHandle(file.name);
      const bytes = new Uint8Array(await (await handle.getFile()).arrayBuffer());
      signal.throwIfAborted();
      const hash = Array.from(sha256(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
      if (hash !== file.sha256) throw new Error("Installed Kitten artifact failed verification: " + file.name);
      return bytes;
    },
  });
  const instance = registry.hostOptions().adapters.kitten();
  adapter = instance;
  const count = self.crossOriginIsolated
    ? Math.min(4, Number.isInteger(threads) && threads > 0 ? threads : self.navigator?.hardwareConcurrency || 1)
    : 1;
  loading = (async () => {
    const loaded = await instance.load({ modelId, revision, threads: count });
    voices = loaded.capabilities.voices;
    return { voices, loadMs: Math.round(performance.now() - started) };
  })();
  try {
    return await loading;
  } finally {
    loading = undefined;
  }
}

self.onmessage = async ({ data }) => {
  const { id, op } = data;
  const reply = payload => self.postMessage({ id, ...payload });
  if (op === "cancel") {
    if (active?.id === data.target) active.controller.abort();
    return;
  }
  try {
    if (op === "load") return reply({ ok:true, ...await load(data) });
    if (op === "unload") {
      await adapter?.unload();
      adapter = undefined;
      voices = undefined;
      return reply({ ok:true });
    }
    if (op !== "speak" || !adapter || active) throw new Error("The Kitten worker is not ready.");
    const controller = new AbortController();
    active = { id, controller };
    const speed = Number.isFinite(data.speed) && data.speed > 0 ? data.speed : 1;
    try {
      const result = await adapter.invoke("synthesize", {text:data.text, voice:data.voice, speed},
        controller.signal, ({samples,index,count,text}, transfer) => {
          self.postMessage({id,event:"chunk",samples,index,count,text}, transfer);
        });
      return reply({ ok:true, ...result, cancelled:false });
    } finally {
      active = undefined;
    }
  } catch (error) {
    reply({ ok:false, error:{name:error?.name || "Error", message:String(error?.message || error)} });
  }
};
