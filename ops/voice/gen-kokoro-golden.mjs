// Regenerates tests/fixtures/kokoro-golden.json from the REFERENCE implementation (kokoro-js 1.2.1 + @huggingface/transformers), which is run
// unmodified except for one recording wrapper around its phonemizer call. Needs a node_modules with kokoro-js, phonemizer and
// @huggingface/transformers, and the model's tokenizer files:
//   node ops/voice/gen-kokoro-golden.mjs <node_modules> <dir with tokenizer.json and tokenizer_config.json>
// The fixture holds: phoneme strings with their reference token ids, whole-text phonemize results together with the raw phonemizer calls
// (so the unit tests replay them without WASM), and the reference sentence splits.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const [nm, files] = process.argv.slice(2);
if (!nm || !files) throw new Error("usage: node gen-kokoro-golden.mjs <node_modules> <tokenizer dir>");
const here = path.dirname(fileURLToPath(import.meta.url));
const work = fs.mkdtempSync(path.join(os.tmpdir(), "kokoro-golden-"));
fs.symlinkSync(path.resolve(nm), path.join(work, "node_modules"));
let src = fs.readFileSync(path.join(nm, "kokoro-js/dist/kokoro.js"), "utf8");
const hook = '(await l(a,n)).join(" ")';
if (!src.includes(hook)) throw new Error("kokoro-js changed: the phonemizer call was not found");
src = src.replace(hook, '(await globalThis.__rec(l,a,n)).join(" ")') + "\nexport {m as __phon, w as __Splitter};\n";
fs.writeFileSync(path.join(work, "ref.mjs"), src);

const calls = [];
globalThis.__rec = async (phonemize, text, language) => { const out = await phonemize(text, language); calls.push([text, language, out]); return out; };
const { __phon, __Splitter } = await import(pathToFileURL(path.join(work, "ref.mjs")).href);
fs.writeFileSync(path.join(work, "tok.mjs"), 'export { PreTrainedTokenizer } from "@huggingface/transformers";\n');
const { PreTrainedTokenizer } = await import(pathToFileURL(path.join(work, "tok.mjs")).href);
const tok = new PreTrainedTokenizer(JSON.parse(fs.readFileSync(path.join(files, "tokenizer.json"), "utf8")), JSON.parse(fs.readFileSync(path.join(files, "tokenizer_config.json"), "utf8")));
const ids = (s) => Array.from(tok(s, { truncation: true }).input_ids.data, Number);

const sentences = [
  "The capital of France is Paris.", "This is a short test of on device speech.", "Hello, world!", "Is it really 5:30 or 10:05?", "It costs $5.50 on Jan 3rd, and there are 365 days.",
  "Dr. Smith and Mr. Jones met in 1999, 2005 and the 1990s.", "She said (quietly): \"yeah, that's fine\" — and left.", "Pay £3 or 2.75 pounds; ratio 3.14159.",
  "The U.S.A. is large; e.g. Texas, etc.", "Cats' toes and NASA's rockets in the XYZ's lab.", "Ninety nine, nine hundred and ninety, a hundred.", "Kokoro is a name.",
  "、。！，：；？ full width marks", "Colour, grey and aluminium in the British voice.", "Wait... what?!", "Visit https://example.com/a.b or mail a@b.org now.",
];
const phonemize = [];
for (const text of sentences) {
  for (const voice of ["a", "b"]) {
    calls.length = 0;
    const expected = await __phon(text, voice);
    phonemize.push({ text, voice, expected, calls: calls.map((c) => [...c]) });
  }
}

const phonemeStrings = [
  ...phonemize.filter((p) => p.voice === "a").map((p) => p.expected),
  "", "$", " ", "ðə kˈæpɪɾəl ʌv fɹˈæns ɪz pˈæɹɪs.", "ʣʥʦʨ ᵝ ꭧ AIOQSTWY ᵊ", "ã ɑ ɐ ɒ ɓ ʙ — … “ ” ( ) 🙂 日本", "tab\tnewline\nüñí", "a".repeat(700), "ˈ".repeat(520),
];
const tokens = phonemeStrings.map((phonemes) => ({ phonemes, ids: ids(phonemes) }));

const splitTexts = [
  "Hello Dr. Smith. It is \"fine.\" Really? Yes! 3.14 is pi. end", "One. Two. Three.", "He said \"Stop. Now.\" and left. Then (she paused. He waited.) it ended.", "1. First item\n2. Second item\n",
  "Visit https://example.com/a. Then go home.", "I live in the U.S. A cat sat. It's Mrs. Lee's. Prof. X. e.g. this. Wait... What?! Fine…", "No terminal punctuation here", "", "  \n ", "Line one\nLine two.\n\nNew paragraph. And more! ", "It's 5 p.m. today. Isn't it? Yes. ",
];
const splits = splitTexts.map((text) => {
  const s = new __Splitter();
  s.push(text);
  return { text, sentences: [...s] };
});

fs.writeFileSync(path.join(here, "../../tests/fixtures/kokoro-golden.json"), JSON.stringify({ source: "kokoro-js 1.2.1 + @huggingface/transformers", tokens, phonemize, splits }, null, 1) + "\n");
console.log(`tokens ${tokens.length}, phonemize ${phonemize.length}, splits ${splits.length}`);
