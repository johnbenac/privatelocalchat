# Third-party notices

model-runtime is released under the GNU Affero General Public License, version 3 (`LICENSE`). It vendors the third-party
code listed here, each under its own licence, whose text is kept beside the code. No model weights are part of this
package: the catalogue names them and pins their size and SHA-256, and an application downloads them from its configured
model source.

| Component | Where | Licence | Upstream |
|---|---|---|---|
| noble-hashes 2.4.0 (SHA-256 of downloaded files) | `runtime/providers/vendor/noble-hashes/2.4.0/` (`LICENSE`, `provenance.json`) | MIT | https://github.com/paulmillr/noble-hashes |
| wllama (the wrapper that runs llama.cpp in WebAssembly) and the pinned native build `v1q` | `runtime/providers/vendor/wllama/` (`LICENCE`) | MIT | https://github.com/ngxson/wllama |
| llama.cpp (inside the wllama build) | `runtime/providers/vendor/wllama/` (`LLAMA-LICENSE`) | MIT | https://github.com/ggml-org/llama.cpp |
| WebLLM 0.2.86 | `runtime/providers/vendor/webllm/web-llm-0.2.86.js` (`LICENSE`) | Apache-2.0 | https://github.com/mlc-ai/web-llm |
| The two compiled WebGPU model libraries of Qwen3.5-9B (`q4f16_1`, `q4f32_1`) | `runtime/providers/vendor/webllm/libs/` (`README.md` has size, SHA-256 and provenance) | Apache-2.0 | https://github.com/mlc-ai/binary-mlc-llm-libs |

The sizes and SHA-256 values of the vendored runtimes are pinned in `runtime/providers/production-runtime.json` and
`runtime/providers/catalog-data.mjs`. An application that vendors this package keeps this file and `LICENSE` with it.
