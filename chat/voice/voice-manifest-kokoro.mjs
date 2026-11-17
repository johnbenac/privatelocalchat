// The pinned file set of the Kokoro-82M q8 voice (onnx-community/Kokoro-82M-v1.0-ONNX, Apache-2.0 on the model card). Every file is verified
// against these sizes and SHA-256 values before use. A changed byte is a new manifest, never an edit in place.
//
// `name` is the flat file name in the origin's private storage; `path` is where the file lives under the base URL.
import { appConfig } from "../../runtime/config/app-config.mjs";


/** The Hugging Face revision the hosted copy is keyed by. ONE place. */
export const KOKORO_Q8_COMMIT = "1939ad2a8e416c0acfeecc08a694d14ef25f2231";

export const KOKORO_Q8_BASE_URL = `${appConfig().modelRoot()}Kokoro-82M-v1.0-ONNX-q8/${KOKORO_Q8_COMMIT}/`;

const file = (path, role, bytes, sha256) => Object.freeze({ name: path.split("/").pop(), path, role, bytes, sha256 });

export const KOKORO_Q8_MANIFEST = Object.freeze({
  id: "kokoro-82m-v1.0-q8",
  requiredRoles: Object.freeze(["model", "tokenizer", "tokenizer_config", "config", "voice"]),
  files: Object.freeze([
    file("onnx/model_quantized.onnx", "model", 92361116, "fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478"),
    file("tokenizer.json", "tokenizer", 3497, "77a02c8e164413299b4b4c403b14f8e0e1c1b727db4d46a09d6327b861060a34"),
    file("tokenizer_config.json", "tokenizer_config", 113, "be1cb066d6ef6b074b3f15e6a6dd21ac88ff3cdaedf325f0aaed686c70f75d20"),
    file("config.json", "config", 44, "df34b4f930b23447cd4dc410fabfb42eb3f24e803e6c3f97d618fb359380a36f"),
    file("voices/af_heart.bin", "voice", 522240, "d583ccff3cdca2f7fae535cb998ac07e9fcb90f09737b9a41fa2734ec44a8f0b"),
    file("voices/af_bella.bin", "voice", 522240, "f69d836209b78eb8c66e75e3cda491e26ea838a3674257e9d4e5703cbaf55c8b"),
    file("voices/af_nicole.bin", "voice", 522240, "cd2191ab31b914ed7b318416b0e4440fdf392ddad9106a060819aa600a64f59a"),
    file("voices/af_sarah.bin", "voice", 522240, "4409fbc125afabacc615d94db5398d847006a737b0247d6892b7a9a0007a2f0a"),
    file("voices/am_michael.bin", "voice", 522240, "1d1f21dd8da39c30705cd4c75d039d265e9bc4a2a93ed09bc9e1b1225eb95ba1"),
    file("voices/am_adam.bin", "voice", 522240, "162b035ed91cfc48b6046982184c645f72edcdd1b82843347f605d7bf7b15716"),
    file("voices/bf_emma.bin", "voice", 522240, "669fe0647f9dd04fcab92f1439a40eeb4c8b4ab1f82e4996fe3d918ce4a63b73"),
    file("voices/bm_george.bin", "voice", 522240, "c4b235a4c1f2cd3b939fed08b899ce9385638b763f7b73a59616c4fc9bd6c9bc"),
  ]),
});
