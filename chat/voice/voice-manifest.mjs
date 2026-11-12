// The pinned file set of the Kitten TTS nano 0.8 int8 voice. Every file is verified against these sizes and SHA-256 values before use.
// Upstream: Hugging Face KittenML/kitten-tts-nano-0.8-int8 (Apache-2.0 on the model card). The files are published on the asset host in a folder keyed by the
// pinned Hugging Face revision (docs/VOICE-RUNTIME.md); the app never asks Hugging Face for them. A changed byte is a new manifest, never an edit in place.
import { appConfig } from "../../runtime/config/app-config.mjs";


/** Where the three files live: under the configured model source, in a folder keyed by the pinned Hugging Face revision (immutable; see ops/cloudflare/voice-models.json). */
export const KITTEN_NANO_BASE_URL = appConfig().modelRoot() + "Kitten-TTS-Nano-0.8-int8/84781d74e29ee25217551556398b42f80593a813/";

export const KITTEN_NANO_MANIFEST = Object.freeze({
  id: "kitten-tts-nano-0.8-int8",
  files: Object.freeze([
    Object.freeze({ name: "kitten_tts_nano_v0_8.onnx", role: "model", bytes: 24369971, sha256: "f7b0afcbee92870b32b8e0276d855b954dc25470c9f051b376ac7eee537c76fc" }),
    Object.freeze({ name: "voices.npz", role: "voices", bytes: 3278902, sha256: "8aa7cee235abb0739cb51e6559685f65a4dacd95568833d05699b1633f519b3f" }),
    Object.freeze({ name: "config.json", role: "config", bytes: 688, sha256: "b66006ccbeccd4de5fc3c9272059c47f5725df7215fd889785c03602652fab64" }),
  ]),
});
