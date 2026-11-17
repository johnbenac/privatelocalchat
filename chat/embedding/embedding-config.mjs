// Where the small embedding model comes from, and what it is. This is the ONE place that names the host and the version.
//
// The model files and the ONNX Runtime WASM are a content-addressed set served from the configured model source (by default the project's own asset host: R2 bucket
// privatelocalchat-assets, published and verified by ops/cloudflare/publish-embedding.py): the version below is the first 16 hex digits of the
// SHA-256 of every file's path and hash, so a changed byte is a new path and the objects are immutable. The host sends CORS (`*`), which the
// app's cross-origin isolation (COEP) accepts for the worker's CORS-mode fetches.
//
// To change the set: publish it under <model source>/memory/<version>/ first (docs/EMBEDDINGS.md), verify it,
// then change the version below. Nothing else needs to change.

import { appConfig } from "../../runtime/config/app-config.mjs";

export const EMBEDDING_ASSET_HOST = appConfig().modelRoot() + "memory/";
export const EMBEDDING_ASSET_VERSION = "79cbff1e617b319a";
export const EMBEDDING_MODEL_BASE = `${EMBEDDING_ASSET_HOST}${EMBEDDING_ASSET_VERSION}/`;
export const EMBEDDING_WASM_BASE = `${EMBEDDING_MODEL_BASE}runtime/`;

export { EMBEDDING_MODEL } from "./embedding-model.mjs";
