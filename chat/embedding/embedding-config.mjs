// Where the small embedding model comes from, and what it is. This is the ONE place that names the host and the version.
//
// The model DATA files (embed/: weights, tokenizer, config) are a content-addressed set served from the configured model source (by default the programme's
// shared data CDN, published with the project's CDN publisher; the pins are in ops/cloudflare/memory-models.json): the version below is the first 16 hex digits of
// the SHA-256 of every file's path and hash, so a changed byte is a new path and the objects are immutable. The host sends CORS (`*`), which the app's
// cross-origin isolation (COEP) accepts for the worker's CORS-mode fetches.
//
// The ONNX Runtime WebAssembly and its loader are CODE, not data: the shared CDN is data-only, so the app serves them itself, from its own release folder
// (chat/vendor/embedding/ort/, pinned by SHA-256 in chat/vendor/embedding/VERSIONS.json). The version string still names the original set, which also held
// these two files under runtime/; they are no longer fetched from the model source.
//
// To change the set: publish it under <model source>/memory/<version>/ first (docs/EMBEDDINGS.md), verify it,
// then change the version below. Nothing else needs to change.

import { appConfig } from "../../runtime/providers/app-config.mjs";

export const EMBEDDING_ASSET_HOST = appConfig().modelRoot() + "memory/";
export const EMBEDDING_ASSET_VERSION = "79cbff1e617b319a";
export const EMBEDDING_MODEL_BASE = `${EMBEDDING_ASSET_HOST}${EMBEDDING_ASSET_VERSION}/`;
export const EMBEDDING_WASM_BASE = new URL("../vendor/embedding/ort/", import.meta.url).href;

export { EMBEDDING_MODEL } from "./embedding-model.mjs";
