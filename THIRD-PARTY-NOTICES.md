# Third-party notices

Private Local Chat is released under the **GNU General Public License, version 3** (`LICENSE`). Earlier releases were published under the Apache License 2.0 and remain available under it for the code they contained. The change takes effect with the release that first bundles the voice engine described below.

## Software bundled with the app

| Component | Used for | Licence | Source |
|---|---|---|---|
| **eSpeak NG** (embedded in the npm package `phonemizer` 1.2.1, file `chat/vendor/voice/worker.js`) | Turning text into phonemes for the optional downloaded read-aloud voices (Kitten and Kokoro) | **GPL-3.0-or-later** | https://github.com/espeak-ng/espeak-ng |
| `phonemizer` 1.2.1 (JavaScript wrapper, by Xenova) | Loads the eSpeak NG build above | Apache-2.0 | https://github.com/xenova/phonemizer.js |
| ONNX Runtime Web 1.31.1 | Runs the voice model in the browser (`chat/vendor/voice/`) | MIT | https://github.com/microsoft/onnxruntime |
| fflate 0.8.3 | Reads the voice file archive | MIT | https://github.com/101arrowz/fflate |
| pdf.js (`chat/vendor/pdfjs/`, Mozilla Foundation) | Reading PDF attachments | Apache-2.0 (notice at the top of the file) | https://github.com/mozilla/pdf.js |
| QRCode.js (`chat/vendor/qrcode.js`) | Share and transfer QR codes | MIT, Copyright (c) 2012 davidshimjs. The file is byte-identical to upstream `qrcode.min.js` (19,927 bytes, SHA-256 starting `c541ef06`); the licence text is `chat/vendor/qrcode.js.LICENSE` | https://github.com/davidshimjs/qrcodejs |
| noble-hashes (`runtime/providers/vendor/noble-hashes/`) | SHA-256 checks of downloaded files | MIT | https://github.com/paulmillr/noble-hashes |
| wllama and the llama.cpp engine inside it (`runtime/providers/vendor/wllama/`) | Running GGUF models | MIT | https://github.com/ngxson/wllama |
| WebLLM, transformers.js and the other runtimes listed in `docs/RUNTIMES.md` and `docs/EMBEDDINGS.md` | On-device language models and search | Apache-2.0 / MIT, see those documents | see those documents |

The complete corresponding source of every GPL-covered part is this repository, which also contains the script that rebuilds the voice worker (`ops/voice/`, see `docs/VOICE-RUNTIME.md`). The eSpeak NG source is available at the address above. Apache-2.0 and MIT components are combined with this program under the terms of GPL-3.0, which permits it.

## Models (downloaded files, not part of the program)

| Model | Used for | Licence | Hosted at |
|---|---|---|---|
| Kitten TTS nano 0.8 (int8), KittenML | Optional natural read-aloud voice | Apache-2.0 (model card) | `models/Kitten-TTS-Nano-0.8-int8/` on the project asset host, with its licence text beside the files |
| Kokoro-82M v1.0 (q8 ONNX), hexgrad / onnx-community | Optional, more natural read-aloud voice on devices that can run it | Apache-2.0 (model card). The model card names training audio under CC BY 3.0 (Koniwa) and CC BY 4.0 (SIWIS), plus synthetic audio; the data notice is stored with the licence text | `models/Kokoro-82M-v1.0-ONNX-q8/` on the project asset host, with its licence text beside the files |
| Qwen3.5, LFM2.5, Granite 4.0 | On-device chat | Apache-2.0, LFM Open License v1.0 | see `docs/RUNTIMES.md` and the licence text stored beside each model |

Model files are separate works. Their licences, not the GPL, apply to them.

## Data and dictionary licences (eSpeak NG)

Checked on 2026-11-02 against the `master` branch of https://github.com/espeak-ng/espeak-ng (primary sources only; the exact lines are quoted). This section states what the upstream files say. It is not legal advice.

- **Program and data: GPL-3.0-or-later.** README.md ("License Information"): "eSpeak NG Text-to-Speech is released under the [GPL version 3](COPYING) or later license." (https://raw.githubusercontent.com/espeak-ng/espeak-ng/master/README.md). `COPYING` is the GPL version 3 text. The README names no separate licence for the dictionary rules (`dictsource/`), the phoneme data (`phsource/`) or the compiled `espeak-ng-data/` directory, and the repository has no licence file inside those directories (the repository file list has only `COPYING`, `COPYING.APACHE`, `COPYING.BSD2`, `COPYING.UCD` and a `src/ucd-tools/COPYING` copy of the GPL).
- **Other licences named by the repository:**
  - `COPYING.BSD2`, 2-clause BSD. README: "The `getopt.c` compatibility implementation for getopt support on Windows is taken from the NetBSD `getopt_long` implementation, which is licensed under a [2-clause BSD](COPYING.BSD2) license." This is Windows command-line code; it is not part of the browser build.
  - `COPYING.UCD`, the Unicode Terms of Use (header: "COPYRIGHT AND PERMISSION NOTICE / Copyright © 1991-2018 Unicode, Inc. All rights reserved."). `src/ucd-tools/README.md`: "UCD Tools is released under the GPL version 3 or later license. The UCD data files in `data/ucd` are downloaded from the UCD website and are licensed under the [Unicode Terms of Use](COPYING.UCD). These data files are used in their unmodified form." The Unicode terms are permissive (they require the notice to appear with copies).
  - `COPYING.APACHE` is the unmodified Apache License 2.0 text (its appendix still reads "Copyright [yyyy] [name of copyright owner]"). No README or ChangeLog line says which files it covers. UNVERIFIED: which files are under Apache-2.0.
- **What the npm build embeds: UNVERIFIED.** `phonemizer` 1.2.1 carries one JavaScript file with eSpeak NG and its data compiled in (`ops/voice/node_modules/phonemizer/dist/phonemizer.js`, 1,322,380 bytes, containing the path `espeak-ng-data`). The package contains no list of the embedded data files and no third-party notice; the file was searched for "Unicode, Inc", "Apache License" and "Permission is hereby" and none appears. Which upstream data files it embeds was not established, so whether any embedded file is under the Apache-2.0, BSD or Unicode terms above is UNVERIFIED. Everything it embeds is distributed here under GPL-3.0-or-later (the licence of the eSpeak NG project as a whole), which is also the licence of this app.
- **Not found:** no non-commercial, share-alike-only (other than the GPL itself) or "no derivatives" term was found anywhere in the files read.

## Training data (voice models)

Checked on 2026-11-02 from the model cards and repositories. The cards are the model authors' own statements; they were not independently audited. Not legal advice.

### Kitten TTS nano 0.8 (`KittenML/kitten-tts-nano-0.8-int8`)

- Model card (https://huggingface.co/KittenML/kitten-tts-nano-0.8-int8/raw/main/README.md, repository revision `84781d74e29ee25217551556398b42f80593a813`): front matter `license: apache-2.0`. The only other statement on the origin is "### Acknowledgements / StyleTTS 2 architecture".
- The card, the Hugging Face model record and the GitHub repository README (https://github.com/KittenML/KittenTTS) **do not say what data the model was trained on or under what licence that data was**. Training data licence: **UNVERIFIED (not stated by the publisher).**
- The GitHub README says: "This project is licensed under the Apache License 2.0. That covers the code in this repository. **The models are licensed separately and their terms may differ.** Each model repository carries its own licensing, so check the one you intend to use before relying on it". It also says "KittenTTS 2 is released under the Stellon Labs Community License" (a different model, not used here; its terms were not read). The licence of the model used here is the Apache-2.0 declaration on its own card.

### Kokoro-82M (`hexgrad/Kokoro-82M`; ONNX files from `onnx-community/Kokoro-82M-v1.0-ONNX`)

- Both cards declare `license: apache-2.0` (https://huggingface.co/hexgrad/Kokoro-82M/raw/main/README.md and https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/raw/main/README.md; the second lists `base_model: hexgrad/Kokoro-82M`).
- Training data, quoted from the hexgrad card ("Training Details"): "Kokoro was trained exclusively on **permissive/non-copyrighted audio data** and IPA phoneme labels. Examples of permissive/non-copyrighted audio include: Public domain audio; Audio licensed under Apache, MIT, etc; Synthetic audio generated by closed TTS models from large providers" with the footnote "No synthetic audio from open TTS models or \"custom voice clones\"". "Total Dataset Size: A few hundred hours of audio".
- Attribution-required (CC BY) audio, quoted from the card ("Creative Commons Attribution"): "The following CC BY audio was part of the dataset used to train Kokoro v1.0." Koniwa `tnc` (https://github.com/koniwa/koniwa), "<1h", CC BY 3.0; SIWIS (https://datashare.ed.ac.uk/handle/10283/2353), "<11h", CC BY 4.0. This is the attribution notice for those two datasets.
- **Points that are not plain permissive or are unclear:**
  1. Part of the training audio is synthetic speech produced by "closed TTS models from large providers". The card does not name the providers, and the terms of use of those providers (which may restrict using their output to train other models) were not read. UNVERIFIED whether those terms allow what was done or restrict downstream use.
  2. Two datasets are CC BY (attribution required). The card does not say whether the licence of the trained weights is affected by that; the weights are declared Apache-2.0.
  3. The card's data statement is the author's own and is not backed by a dataset list in the card (it links a separate `VOICES.md` for the voices, which was not read: UNVERIFIED).
