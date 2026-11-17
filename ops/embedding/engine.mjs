// The embedding engine: MongoDB/mdbr-leaf-ir (Apache-2.0), int8 ONNX, on top of transformers.js (Apache-2.0).
// The same code runs in the browser worker (worker.src.mjs, WASM) and in Node (scripts/build-intent-vectors.mjs, onnxruntime-node).
//
// The output is the model's `sentence_embedding` (encoder plus its Dense projection), cut to the first 256 dimensions (the model is trained
// for that Matryoshka cut) and renormalised. It is NOT the mean-pooled last_hidden_state, which is the encoder output before the projection
// and ranks short phrases poorly. Questions get the retrieval prompt; the stored phrases do not.

import { EMBEDDING_MODEL } from "../../chat/embedding/embedding-model.mjs";

export const EMBED_DIM = EMBEDDING_MODEL.dim;
export const QUERY_PROMPT = EMBEDDING_MODEL.queryPrompt;
/** The folder of the model inside the asset set (and, in Node, inside a local copy of it). */
export const MODEL_DIR = "embed";

/** @param {{ transformers: object, device?: string, dtype?: string }} options  `transformers` is the loaded, already configured module. */
export function createEngine({ transformers, device, dtype = "q8" }) {
  const { AutoModel, AutoTokenizer } = transformers;
  let emb = null;
  let initPromise = null;
  const timings = {};

  async function init() {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      const t0 = Date.now();
      const opts = { dtype, ...(device ? { device } : {}) };
      emb = { tok: await AutoTokenizer.from_pretrained(MODEL_DIR), model: await AutoModel.from_pretrained(MODEL_DIR, opts) };
      timings.embedLoadMs = Date.now() - t0;
    })();
    initPromise.catch(() => { initPromise = null; }); // a failed load is reported to the caller and may be retried
    return initPromise;
  }

  async function embedOne(text, isQuery) {
    const enc = emb.tok(isQuery ? QUERY_PROMPT + text : text, { padding: true, truncation: true, max_length: 256 });
    const out = await emb.model(enc);
    const e = out.sentence_embedding;
    if (!e || e.dims.at(-1) < EMBED_DIM) throw new Error(`the embedding model gave no sentence_embedding of at least ${EMBED_DIM} dimensions`);
    const v = Float32Array.from(e.data.slice(0, EMBED_DIM));
    const norm = Math.hypot(...v);
    if (!norm) throw new Error("the embedding is the zero vector");
    for (let i = 0; i < v.length; i += 1) v[i] /= norm;
    return v;
  }

  return {
    /** Release the ONNX session (a Node process cannot exit while it is held; in a worker, terminate() does it). */
    async dispose() { await emb?.model.dispose?.(); emb = null; initPromise = null; },
    id: `${EMBEDDING_MODEL.id}@${EMBEDDING_MODEL.revision.slice(0, 8)}`,
    init,
    timings,
    async embedDocuments(texts) { await init(); const out = []; for (const t of texts) out.push(await embedOne(String(t), false)); return out; },
    async embedQuery(text) { await init(); return embedOne(String(text), true); },
  };
}
