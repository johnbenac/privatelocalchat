// The embedding engine in Node, for the precomputed vectors (scripts/build-intent-vectors.mjs) and the router evaluation
// (scripts/eval-intent-router.mjs). Same engine code as the browser worker, onnxruntime-node instead of WASM, the same content-addressed
// model files from the asset host (chat/embedding/embedding-config.mjs), kept in a cache directory outside the repository.
//
// transformers.js is not a dependency of this repository. Point EMBEDDING_NODE_MODULES at a node_modules directory that has
// @huggingface/transformers@4.2.0 and onnxruntime-node (docs/EMBEDDINGS.md). EMBEDDING_CACHE_DIR chooses where the model files are kept.

import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createEngine } from "./engine.mjs";
import { EMBEDDING_MODEL_BASE } from "../../chat/embedding/embedding-config.mjs";

export async function createNodeEngine({ nodeModules = process.env.EMBEDDING_NODE_MODULES, cacheDir = process.env.EMBEDDING_CACHE_DIR, modelBase = EMBEDDING_MODEL_BASE } = {}) {
  if (!nodeModules) throw new Error("set EMBEDDING_NODE_MODULES to a node_modules directory with @huggingface/transformers@4.2.0 and onnxruntime-node (see docs/EMBEDDINGS.md)");
  const transformers = await import(pathToFileURL(path.join(nodeModules, "@huggingface/transformers/dist/transformers.node.mjs")).href);
  const { env } = transformers;
  env.allowLocalModels = false;
  env.allowRemoteModels = true;
  env.remoteHost = modelBase;
  env.remotePathTemplate = "{model}/";
  env.useFSCache = true;
  env.cacheDir = cacheDir || path.join(os.tmpdir(), "plc-embedding-cache");
  return createEngine({ transformers });
}
