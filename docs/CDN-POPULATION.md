# Where the model files live and how they are published

**Rule:** every model file the app downloads, of any kind (language, search, voices), is served by one host, the programme's shared data CDN
`https://cdn.aiofourown.com` (R2 bucket `cosmoshot-cdn`, run by infra). The app does not depend on another project's storage or on Hugging Face /
GitHub at run time (the models come from the configured model source, `docs/APP-CONFIG.md`).

**Data only:** executable files do not belong on that CDN. The two WebLLM model libraries (`*-webgpu.wasm`) are served by the app from
`runtime/providers/vendor/webllm/libs/` (`docs/RUNTIMES.md`), and the search model's ONNX Runtime files (`runtime/ort-wasm-simd-threaded.wasm` and
`.mjs`) from `chat/vendor/embedding/ort/` (pinned in `chat/vendor/embedding/VERSIONS.json`).

## State

| Date | What |
|---|---|
| 2026-11-17 | T587: the shipped model source became `https://cdn.aiofourown.com/models/`. Infra copied the 308 pinned files (nine families) server-side with their hashes checked, and published the search set's data files (`models/memory/79cbff1e617b319a/`, 8 objects, without the two runtime files). |
| 2026-11-17 22:07 EST | T674: production (`privatelocal.chat`, commit `a1059ea`) and the site layer name the new host; a real-browser network log showed no request to the old host. |
| 2026-11-17 22:10 EST | The old host `assets.privatelocal.chat` was made to 301-redirect `/models/*` to the shared CDN (applied by infra on PLC's written word on T674). `*.wasm` and `/models/catalog.json` stay on the old host. |
| 2026-11-17 | T677: the old publishers, verifier and provisioning scripts were deleted from this repository (see below). |

Records of the retired bucket, kept as they were and not maintained: `ops/cloudflare/cdn-state.json` (account, zone, bucket, domain),
`ops/cloudflare/public-cdn-verification.json` (its last public check, 2026-11-02), and `ops/cloudflare/cdn-inventory.json`.

## What PLC keeps (the pins)

PLC owns the record of what the app asks for. Every file is pinned by size and SHA-256 here, checked by the app before use, and published
under `models/<family>/<revision>/` (the two Qwen3.5-9B sets under `models/<family>/resolve/<revision>/`):

| File | What it pins |
|---|---|
| `ops/cloudflare/model-cdn-manifest.json` | All 308 data files of the nine families (key, size, SHA-256, URL on the shared CDN); the four `.wasm` entries keep their old address and are app-served. Infra's retention reads it as PLC's list of pinned revisions. |
| `ops/cloudflare/pinned-model-catalog.json` | The upstream revisions and hashes the app catalogue was generated from. |
| `ops/cloudflare/gguf-models.json` | The wllama models (Qwen3.5-2B, LFM2.5, Granite, SmolLM2): source, files, prefix, licence, load context and sampling. |
| `ops/cloudflare/voice-models.json` | The read-aloud voices (Kitten, Kokoro). |
| `ops/cloudflare/memory-models.json` | The search model: the six `embed/` data files and the two app-served `runtime/` files. |
| `ops/cloudflare/licenses/` | The licence texts published beside each model. |

`tests/publish-files.test.mjs`, `tests/embedding-ort-pin.test.mjs` and `tests/models-catalog.test.mjs` check these files (hashes, sizes, unique
prefixes, no foreign hosts, the version the app uses).

## Publishing a model (the shared tool)

Publishing is done with the shared tool `/cosmoshot/tools/ops/cdn_publish.py` (devops, T585; read the section "Shared CDN publish, verify, roll back" in
`/cosmoshot/tools/ops/README.md`). It reports by default and writes only with `--apply`; every write is a conditional create, a different object at an
existing key is refused, it refuses code (`.wasm`, `.js`, ...), and `publish --apply` reads every object back over the public URL.

```sh
# put the files in a local folder laid out as the family's version folder, with the upstream licence text
/usr/bin/python3 /cosmoshot/tools/ops/cdn_publish.py publish --project plc --family models/Foo-Q4 --revision REV --source-dir DIR \
    --source-url URL --license-name Apache-2.0 --license-file LICENSE.txt [--version-dir resolve] [--refresh-catalog]   # report
... same command with --apply                                                                                          # write and verify
/usr/bin/python3 /cosmoshot/tools/ops/cdn_publish.py verify --family models/Foo-Q4 --revision REV [--quick] [--version-dir resolve]
/usr/bin/python3 /cosmoshot/infra/cloudflare/cdn_verify.py            # infra's check of every published version
```

Adding another model: (1) get the files, check each against the upstream pin you computed yourself, and describe the set in the matching pin file above
(`gguf-models.json`, `voice-models.json`, or a new entry in `memory-models.json`'s style); (2) publish it with the command above; (3) add it to
`runtime/providers/catalog-data.mjs` and a tier in `runtime/providers/catalog.mjs`, a short note in `TIER_NOTES` (`chat/models/models-view.mjs`), the
Privacy page and the Updates feed in the site layer; (4) refresh `model-cdn-manifest.json` for the new files (the tool does not do this: see the
T677 report); (5) prove it with a real download (`node work/check-new-models.mjs <tier> <origin>`, which writes `docs/evidence/model-<tier>-cdn-check.json`).

## Layout convention

* `models/<family>/<pinned revision or content hash>/<files>`: one immutable directory per version; a changed byte is a new path. Existing families:
  `models/Qwen3.5-9B-*-MLC/resolve/<commit>/`, `models/Qwen3.5-2B/<revision>/`, `models/memory/<hash>/`, and one folder per other model.
* Pin every file by SHA-256 in this repository and in the app where files are large. Ship the upstream LICENSE next to each model.
* Never overwrite an object. CORS is open (`*`) with `Cross-Origin-Resource-Policy: cross-origin`; weights (`.gguf`, `.bin`) get `no-store` so the offline
  copy is the app's own; everything else is `immutable`.
* Large files are kept by the app in OPFS or the Cache API, not in the service worker precache.
* Keep a verified local copy of the files too, laid out like the bucket, so any model can be published again from it.

## History

Until 2026-11-17 the files were published to the project's own bucket `privatelocalchat-assets` (`assets.privatelocal.chat`) with scripts in
`ops/cloudflare/` (a provisioning script, `publish-gguf.py`, `publish-files.py`, `publish-embedding.py`, a server-side copy, a catalogue updater and
`verify-cdn.py`); the search model went there on 2026-11-02 and the LFM2.5, Granite and SmolLM2 models on 2026-11-02 and 2026-11-03, each downloaded
from its source, checked against its pinned SHA-256, uploaded unchanged and read back. Those scripts are deleted; their data (the pins) is in the
files above and in git history. Retirement of the old host: `/cosmoshot/infra/docs/RETIREMENT-RUNBOOK-PLC.md`, board tasks T673, T674 and T677.
