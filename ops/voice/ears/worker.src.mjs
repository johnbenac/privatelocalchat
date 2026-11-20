// SPDX-License-Identifier: AGPL-3.0-only
import * as ort from "onnxruntime-web/wasm";
import { logMel, createDecoder } from "./whisper.mjs";

const ENCODER = "onnx/encoder_model_quantized.onnx";
const DECODER = "onnx/decoder_model_merged_quantized.onnx";
const sessionOptions = { executionProviders: ["wasm"] };
let modelFiles, decode, encoder;
const jobs = new Map();
let queue = Promise.resolve();

async function load({ files, wasm }) {
  ort.env.wasm.wasmBinary = wasm;
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  const json = (path) => JSON.parse(new TextDecoder().decode(files[path]));
  decode = createDecoder(ort, json("config.json"), json("generation_config.json"), json("vocab.json"));
  // Check both graphs at load while keeping only one session alive at any time.
  const decoder = await ort.InferenceSession.create(files[DECODER], sessionOptions);
  await decoder.release();
  encoder = await ort.InferenceSession.create(files[ENCODER], sessionOptions);
  modelFiles = { encoder: files[ENCODER], decoder: files[DECODER] };
  return { threads: 1 };
}

async function transcribe(samples, job) {
  const start = performance.now();
  const features = new ort.Tensor("float32", logMel(samples), [1, 80, 3000]);
  encoder ??= await ort.InferenceSession.create(modelFiles.encoder, sessionOptions);
  let hidden;
  try {
    ({ last_hidden_state: hidden } = await encoder.run({ input_features: features }));
  } finally {
    features.dispose();
    const session = encoder;
    encoder = undefined;
    await session.release();
  }
  try {
    if (job.cancelled) return {};
    const decoder = await ort.InferenceSession.create(modelFiles.decoder, sessionOptions);
    try {
      const text = await decode(decoder, hidden, job);
      return { text, ms: performance.now() - start };
    } finally {
      await decoder.release();
    }
  } finally {
    hidden.dispose();
  }
}

self.onmessage = ({ data }) => {
  if (data.op === "cancel") {
    const job = jobs.get(data.target);
    if (job) job.cancelled = true;
    return;
  }
  const job = { cancelled: false };
  jobs.set(data.id, job);
  queue = queue.then(async () => {
    try {
      if (job.cancelled) return;
      let result;
      if (data.op === "load") result = await load(data);
      else if (data.op === "transcribe") result = await transcribe(data.samples, job);
      else throw new Error("Unknown ears worker operation");
      if (!job.cancelled) self.postMessage({ id: data.id, ok: true, ...result });
    } catch (error) {
      if (!job.cancelled) self.postMessage({ id: data.id, ok: false, error: String(error.message || error) });
    } finally {
      jobs.delete(data.id);
    }
  });
};
