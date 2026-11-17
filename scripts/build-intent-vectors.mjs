// Precompute the example-phrase embeddings for Roberta's intent router: one 256-number vector per phrase in INTENT_PHRASES
// (chat/roberta/ivr-content.mjs), embedded as DOCUMENTS (no query prompt) by the same engine the browser runs, then written compactly to
// chat/roberta/ivr-vectors.json. The page only has to embed what the person says.
//
//   EMBEDDING_NODE_MODULES=<scratch>/node_modules node scripts/build-intent-vectors.mjs          write chat/roberta/ivr-vectors.json
//   EMBEDDING_NODE_MODULES=<scratch>/node_modules node scripts/build-intent-vectors.mjs --check  exit 1 if the file is stale or malformed
//
// <scratch>/node_modules needs @huggingface/transformers@4.2.0 and onnxruntime-node (not repository dependencies; docs/EMBEDDINGS.md).
// The model files are fetched from the asset host in chat/embedding/embedding-config.mjs and kept in EMBEDDING_CACHE_DIR (default: the system temp
// directory). Behind an HTTPS proxy, run node with NODE_USE_ENV_PROXY=1 (and NODE_EXTRA_CA_CERTS if the proxy needs its own CA).
// Nothing a person said is involved: only the phrases written in the content file.

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { INTENT_PHRASES } from "../chat/roberta/ivr-content.mjs";
import { EMBEDDING_MODEL } from "../chat/embedding/embedding-model.mjs";
import { canonicalPhrases, encodeVector, VECTORS_FORMAT, VECTOR_QUANT } from "../chat/roberta/intent-router.mjs";

export const VECTORS_PATH = fileURLToPath(new URL("../chat/roberta/ivr-vectors.json", import.meta.url));
export const phraseHashOf = (phrases) => createHash("sha256").update(canonicalPhrases(phrases)).digest("hex");

export async function buildVectors(engine, phrases = INTENT_PHRASES) {
  await engine.init();
  const t0 = Date.now();
  const vectors = await engine.embedDocuments(phrases.map((p) => p.text));
  return {
    format: VECTORS_FORMAT,
    model: EMBEDDING_MODEL.id,
    revision: EMBEDDING_MODEL.revision,
    dim: EMBEDDING_MODEL.dim,
    queryPrompt: EMBEDDING_MODEL.queryPrompt,
    quant: VECTOR_QUANT,
    phraseHash: phraseHashOf(phrases),
    count: phrases.length,
    phrases: phrases.map((p, i) => ({ intent: p.intent, text: p.text, v: encodeVector(vectors[i]) })),
    _ms: Date.now() - t0,
  };
}

const serialise = (doc) => {
  const { _ms, phrases, ...header } = doc;
  return `${JSON.stringify(header).slice(0, -1)},\n"phrases":[\n${phrases.map((p) => JSON.stringify(p)).join(",\n")}\n]}\n`;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--check")) {
    const file = JSON.parse(await readFile(VECTORS_PATH, "utf8"));
    const ok = file.phraseHash === phraseHashOf(INTENT_PHRASES) && file.count === INTENT_PHRASES.length && file.phrases.length === file.count;
    console.log(ok ? `ivr-vectors.json is current (${file.count} phrases)` : "ivr-vectors.json is STALE: regenerate it (see docs/EMBEDDINGS.md)");
    process.exit(ok ? 0 : 1);
  }
  const { createNodeEngine } = await import("../ops/embedding/node-engine.mjs");
  const engine = await createNodeEngine();
  const doc = await buildVectors(engine);
  await engine.dispose();
  const text = serialise(doc);
  await writeFile(VECTORS_PATH, text);
  console.log(`wrote ${VECTORS_PATH}: ${doc.count} phrases, ${text.length} bytes, embedded in ${doc._ms} ms`);
}
