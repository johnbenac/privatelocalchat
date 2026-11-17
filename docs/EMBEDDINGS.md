# Embeddings: matching speech to Roberta's topics by meaning

Roberta, the app's robot, answers from prepared messages. Before any language model is loaded she has to work out which prepared topic a
person means ("is this sending information to the cloud", "who has my data", "can I download models on my phone"). A small sentence-embedding
model does that. It generates nothing: it turns a sentence into 256 numbers, and the sentence is matched to the topic whose example phrases
are closest in meaning. A lexical (word-based) arm runs beside it so Roberta answers at once, with no model, and keeps answering if the model
cannot load.

## Parts

| File | What it is |
|---|---|
| `chat/embedding/embedding-config.mjs` | The ONE place that names the asset host and version of the model files. |
| `chat/embedding/embedding-model.mjs` | What the model is: id, revision, licence, 256 dimensions, the query prompt. |
| `chat/embedding/embedder.mjs` | The page's client: `createEmbedder()`, lazy worker, shared load promise, idle termination, Data saver. |
| `chat/vendor/embedding/worker.js` | The same-origin worker (transformers.js + ONNX Runtime WASM bundled, 561 kB). `VERSIONS.json`, `worker.js.LEGAL.txt` beside it. |
| `chat/roberta/intent-router.mjs` | `createIntentRouter()`: semantic + lexical fusion, thresholds, controls (repeat/back). Pure. |
| `chat/roberta/ivr-vectors.json` | Precomputed embeddings of every example phrase (`INTENT_PHRASES`), 160 kB. |
| `ops/embedding/` | Engine (shared by worker and Node), model-environment, worker source, `build-worker.mjs`, Node loader. |
| `scripts/build-intent-vectors.mjs` | Regenerates `chat/roberta/ivr-vectors.json` (`--check` tells whether it is stale). |
| `scripts/eval-intent-router.mjs` | Runs the held-out queries with the real model in Node; prints the table below. |
| `tests/fixtures/ivr-eval-queries.json` | 359 in-scope and 68 off-topic held-out queries. |
| `tests/embedder.test.mjs`, `tests/intent-router.test.mjs`, `tests/e2e/ivr-semantic.e2e.mjs` | Unit tests (fake worker, synthetic vectors, lexical floors) and the browser test with the real model. |

## Where the model comes from, licences, sizes

The set is served from this project's own content-addressed asset host (see `chat/embedding/embedding-config.mjs`):

    https://assets.privatelocal.chat/models/memory/79cbff1e617b319a/

It was published on 2026-11-02 with `ops/cloudflare/publish-embedding.py`, which checks every file against the SHA-256 values below before
uploading and re-downloads each object from the public URL afterwards. The host sends CORS `*`, which the worker's CORS-mode fetches need under
this site's cross-origin isolation (COEP `require-corp`); it sends no `Cross-Origin-Resource-Policy` header, like the language-model files. The
version is the first 16 hex digits of the SHA-256 of every file's path and hash, so a changed byte is a new path and the objects are immutable.

| Asset | Licence | Size | SHA-256 |
|---|---|---|---|
| `MongoDB/mdbr-leaf-ir` int8 ONNX, revision `4262131b32c3182bd06e67e92ae69d7bd66e0c5c`: `embed/onnx/model_quantized.onnx_data` | Apache-2.0 | 22.95 MB | `e77ea96a124230e23e5bac8e26c3ffe5410154973d8635673fa0220b06c13f8b` |
| `embed/onnx/model_quantized.onnx` | Apache-2.0 | 0.22 MB | `8c08cb4ecc00bad721b117a85738c537ceb9b85b3eedc52d9c6906fddaa55718` |
| `embed/tokenizer.json`, `tokenizer_config.json`, `config.json`, `special_tokens_map.json` | Apache-2.0 | 0.71 MB | in `manifest.json` next to them |
| `runtime/ort-wasm-simd-threaded.wasm` (ONNX Runtime Web, plain CPU SIMD build) | MIT | 12.94 MB | `f4f290847a4df02d0b93cdbf39b4b0e71acefbe80573e7e6b9342a7abd7b290a` |
| `runtime/ort-wasm-simd-threaded.mjs` | MIT | 24 kB | `5f2cd914554830762579c372d0211614c1e3f40ab3f6c0cfcf0900343229071d` |
| `@huggingface/transformers` 4.2.0 (bundled in the worker) | Apache-2.0 | worker 561 kB | |
| `onnxruntime-web` 1.26.0-dev.20260416-b7804b056c (bundled JS) | MIT | | |

About 24 MB of model plus 13 MB of runtime is downloaded once, only when Roberta first needs it, and kept by the browser's Cache API. The
set on the host also holds a reranker; this repository never fetches it. These hashes were checked against the host on 2026-11-01.

How the model is used: the output is the model's `sentence_embedding` (encoder plus its Dense projection), cut to 256
dimensions and renormalised, not the mean-pooled `last_hidden_state`. Questions get the prompt
`Represent this sentence for searching relevant passages: `; the stored example phrases (documents) do not. ONNX Runtime runs with one thread
(no thread pool, no SharedArrayBuffer needed).

## Privacy

The sentence a person says or types is embedded **on the device**, in a worker of this page. It is never sent anywhere. The only network
traffic is the one-time download of the model files from the asset host (and the page's own files). Nothing about the query is in those
requests: they are plain GETs of fixed file names. The Cache API keeps the files, so a reload or an offline visit fetches nothing (verified in
`tests/e2e/ivr-semantic.e2e.mjs`: the second load makes zero requests to the host; a third load with the host blocked still works).
With Data saver on, the model is not downloaded and Roberta stays lexical (`embedder.state === "unavailable"`, `embedder.error` says why).
The host sees an ordinary file download (IP address, user agent), as with any other asset.

## Moving the files to the project's own asset host

The task is written up in `docs/CDN-POPULATION.md` and `ops/cloudflare/publish-embedding.py` does the upload and verification. You cannot publish from a coding session (no credentials), but the move is mechanical:

1. Download the files of the set: `embed/` (six files) and `runtime/` (two files) from the URL above, and `manifest.json`. Check each SHA-256
   against `manifest.json` and the table above.
2. Upload them to R2 under a content-addressed prefix on `assets.privatelocal.chat`, for example `models/memory/<version>/embed/...` and
   `models/memory/<version>/runtime/...`. Easiest and safest: keep the SAME version string and layout (`models/memory/79cbff1e617b319a/`), so the
   bytes are provably the ones above. Publish with the immutable header `Cache-Control: public, max-age=31536000, immutable`, never overwrite an
   object (`docs/OPERATIONS.md`), and verify each object over its public URL.
3. The host must answer `Access-Control-Allow-Origin: *` and `Cross-Origin-Resource-Policy: cross-origin` (the app is cross-origin isolated).
   Content types: `.json` application/json, `.onnx` and `.onnx_data` application/octet-stream, `.wasm` application/wasm, `.mjs` text/javascript.
4. Change `EMBEDDING_ASSET_HOST` (and `EMBEDDING_ASSET_VERSION` if the set changed) in `chat/embedding/embedding-config.mjs`. Nothing else: the worker
   gets the base from the page. The files are NOT in the service worker's precache (they are too big and are kept by the Cache API instead).

## Regenerating the example vectors

`chat/roberta/ivr-vectors.json` holds the document embedding of every phrase in `INTENT_PHRASES` (every node's `examples` in `chat/roberta/ivr-content.mjs`).
`tests/intent-router.test.mjs` fails when the phrases and the file disagree (it compares a SHA-256 of the ordered intents and texts). After
adding or rewording any example:

    mkdir -p /tmp/plc-embed && cd /tmp/plc-embed && npm init -y && npm install @huggingface/transformers@4.2.0 esbuild onnxruntime-node   # once
    cd <repo> && EMBEDDING_NODE_MODULES=/tmp/plc-embed/node_modules node scripts/build-intent-vectors.mjs

(Behind an HTTPS proxy add `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=<ca bundle>`.) The packages are not repository dependencies; the model files
are fetched from the asset host into `EMBEDDING_CACHE_DIR` (default: the system temp directory). `node scripts/build-intent-vectors.mjs --check`
(no model needed) says whether the file is current. To rebuild the worker bundle (only needed when changing `ops/embedding/worker.src.mjs` or the
library versions): `EMBEDDING_NODE_MODULES=... node ops/embedding/build-worker.mjs`.

The vectors are coded at 6 bits a dimension (one base64 character each; `VECTOR_QUANT` in the router): a cosine moves by 0.004 on average and
0.017 at worst, far below the gaps that decide a match, and the file stays under 200 kB.

## How the router decides

Per topic the semantic score is `0.6 * best example + 0.4 * mean of its best 3 examples` (cosine between the question, with the query prompt,
and the stored phrases), scaled from 0.30..0.72 to 0..1. The lexical score is word overlap on normalised stems (stop words and filler removed,
spelled-out letters joined: "chat g p t" becomes `chatgpt`, "q r" becomes `qr`), counting each topic's `keywords` fully and its example words
at 0.7, mixed with the best single-example Dice overlap. With a ready embedder the topic score is `0.7 * semantic + 0.3 * lexical`; without one
it is the lexical score. Repeat and back phrases are recognised directly. A topic and its own sub-topics are neighbours: a tie between
"privacy" and "privacy / the cloud" is not a conflict, so it does not demand a margin.

| Confidence | Meaning | Hybrid rule | Lexical-only rule |
|---|---|---|---|
| `high` | go there | score >= 0.60 and 0.10 ahead of the best non-neighbour | score >= 0.80 and 0.05 ahead |
| `medium` | go there; the caller may say "here is what I have about X" | score >= 0.35 and 0.08 ahead | score >= 0.45 and 0.10 ahead |
| `low` | no confident match: off-topic, gibberish, or a close tie | otherwise | otherwise |

A `low` answer lists in `candidates` only the topics that scored at least 0.25 ("did you mean ..."); gibberish offers nothing.
A cold embedder is waited for at most 250 ms (`coldBudgetMs`), a ready one at most 2 s; after that the answer is lexical and `method` says so.

## Accuracy

Held-out queries (`tests/fixtures/ivr-eval-queries.json`), each routed on its own, real model, `node scripts/eval-intent-router.mjs`. Written in
the style of browser speech-to-text: lowercase, no punctuation, fillers, "chat g p t". "Top-1" = the best candidate is the expected topic
whatever the confidence; "acted" = high or medium (what the menu would go to); "branch" counts a menu and its own sub-topic as right.

| Set | Method | Top-1 | Top-3 | Acted | Acted precision | Branch precision | Off-topic -> low |
|---|---|---|---|---|---|---|---|
| all (359 in scope, 57 off-topic) | lexical only | 85.5% | 96.7% | 78.3% | 93.6% | 97.2% | 56/57 |
| | semantic only | 87.2% | 98.6% | 67.1% | 95.4% | 98.8% | 56/57 |
| | **hybrid** | **91.9%** | **99.4%** | 83.6% | 96.0% | 99.0% | **56/57 (98.2%)** |
| final, written after the content and thresholds were frozen (55, 12 off-topic) | lexical | 76.4% | 98.2% | 61.8% | 91.2% | 91.2% | 12/12 |
| | semantic | 85.5% | 96.4% | 56.4% | 96.8% | 96.8% | 12/12 |
| | **hybrid** | **90.9%** | **100%** | 74.5% | 97.6% | 97.6% | 11/12 |
| validation, looked at once after calibration (98, 12 off-topic) | hybrid | 92.9% | 99.0% | 83.7% | 95.1% | 98.8% | 12/12 |
| development: plain, noisy, owner, hard (206, 33 off-topic) | hybrid | 91.7% | 99.5% | 85.9% | 96.0% | 99.4% | 33/33 |

Eleven further "adjacent" queries use the app's words without being about the app ("which phone should I buy", "how do I record a phone call");
7 of 11 come out low, which is an honest limit: they are close to real topics. The one pure off-topic miss is "can you help me with my math
homework" (it matches the word "help"). In the browser (Chromium, WASM, one thread) the numbers are identical to Node's.

How much to believe them: the examples and keywords were extended using the development set (that is allowed and is what "development"
means), so the development numbers are optimistic. The validation set was looked at once, and the final set was written after everything was
frozen. The wording of the final set is mine and not a real person's; real speech-to-text will be noisier, so treat 85 to 90% top-1 and
the top-3 "did you mean" path as the working expectation.

Costs measured in headless Chromium in a cloud sandbox: first load (download of 37 MB plus session creation) 3.2 to 4.2 s; second load from the
Cache API 0.5 s; one query (embed plus match) median 12 ms, p95 17 ms. Node: 491 phrases embedded in 0.9 s.
