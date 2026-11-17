// What the embedding model is (pure data, so the worker bundle and the precomputed vectors can name it without the host address).
// Where its files are served from is chat/embedding/embedding-config.mjs.

export const EMBEDDING_MODEL = Object.freeze({
  id: "MongoDB/mdbr-leaf-ir",
  revision: "4262131b32c3182bd06e67e92ae69d7bd66e0c5c",
  license: "Apache-2.0",
  dim: 256,
  /** Questions get this prompt; the stored example phrases (documents) do not. */
  queryPrompt: "Represent this sentence for searching relevant passages: ",
});
