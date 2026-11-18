# WebLLM model libraries (served by the app)

The two compiled WebGPU model libraries of Qwen3.5-9B, one per build. They are code, so the app serves them itself and the
model source (data only) never holds them. Each is checked against the size and SHA-256 pinned in
`runtime/providers/catalog-data.mjs` (`lib`), by the download code and by `scripts/build.mjs`.

| File | Bytes | SHA-256 |
|---|---|---|
| `Qwen3.5-9B-q4f16_1_cs1k-webgpu.wasm` | 7,488,165 | `84fc5ef675ea0d8770deaf9a53e81fd663299a69d3cf66e94243914779f9877f` |
| `Qwen3.5-9B-q4f32_1_cs1k-webgpu.wasm` | 7,347,353 | `c2f196c4bd3ee6fae01d2e234d3bcfe356aac66ae15cfe0a34e8d2ecb9ada579` |

Provenance: built by the MLC project (`mlc-ai/binary-mlc-llm-libs`, Apache-2.0) for WebLLM 0.2.86. These files were copied
unchanged on 2026-11-17 from the project's earlier public copies (`models/Qwen3.5-9B-<variant>-MLC/resolve/<revision>/`
on the project asset host) after checking both pins. To change one, publish nothing here by hand: update the pin in
`catalog-data.mjs` and replace the file in the same change.
