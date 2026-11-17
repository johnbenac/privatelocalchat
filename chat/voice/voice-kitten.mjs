// The pure parts of the Kitten TTS nano 0.8 pipeline: no DOM, no worker, no ONNX Runtime, so they run under plain `node --test`.
// They follow KittenML/KittenTTS 0.8 (kittentts/onnx_model.py, text_preprocessing.py) and the spike that proved the model under ONNX Runtime
// Web: text -> espeak-ng IPA -> tokens -> symbol ids -> [0, ...ids, 0] -> style row -> speed -> run -> drop the last 5000 samples.
// KittenTTS's text pre-processor (numbers, currency, dates, ...) is ported in voice-text.mjs and applied by speechChunks() before chunking.

import { normalizeForSpeech } from "./voice-text.mjs";

export const SAMPLE_RATE = 24000;
export const TRIM_SAMPLES = 5000;
export const MAX_CHUNK_CHARS = 400;

// _pad + _punctuation + _letters + _letters_ipa, in the order the model was trained with (178 entries; a symbol that appears twice keeps its
// first index, as in the reference `{c: i}` dictionary built from the reverse).
const IPA = "\u0251\u0250\u0252\u00e6\u0253\u0299\u03b2\u0254\u0255\u00e7\u0257\u0256\u00f0\u02a4\u0259\u0258\u025a\u025b\u025c\u025d\u025e\u025f\u0284\u0261\u0260\u0262\u029b\u0266\u0267\u0127\u0265\u029c\u0268\u026a\u029d\u026d\u026c\u026b\u026e\u029f\u0271\u026f\u0270\u014b\u0273\u0272\u0274\u00f8\u0275\u0278\u03b8\u0153\u0276\u0298\u0279\u027a\u027e\u027b\u0280\u0281\u027d\u0282\u0283\u0288\u02a7\u0289\u028a\u028b\u2c71\u028c\u0263\u0264\u028d\u03c7\u028e\u028f\u0291\u0290\u0292\u0294\u02a1\u0295\u02a2\u01c0\u01c1\u01c2\u01c3\u02c8\u02cc\u02d0\u02d1\u02bc\u02b4\u02b0\u02b1\u02b2\u02b7\u02e0\u02e4\u02de\u2193\u2191\u2192\u2197\u2198\x27\u0329\x27\u1d7b";
export const SYMBOLS = [..."$", ...";:,.!?¡¿—…\"«»“” ", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz", ...IPA];
export const SYMBOL_INDEX = new Map();
SYMBOLS.forEach((c, i) => { if (!SYMBOL_INDEX.has(c)) SYMBOL_INDEX.set(c, i); });

// Python's \w is Unicode aware, JavaScript's is ASCII only: with /\w+/ every IPA letter became its own token and a space id was
// inserted between all sounds (unintelligible speech). Letters, digits and "_" (stress and length marks are letter modifiers) stay in a word.
const TOKEN = /[\p{L}\p{N}_]+|[^\p{L}\p{N}_\s]/gu;
const PUNCT_CHARS = ";:,.!?\u00a1\u00bf\u2014\u2026\"\u00ab\u00bb\u201c\u201d";
const PUNCT_SPLIT = new RegExp(`([${PUNCT_CHARS}]+)`);
const PUNCT_ONLY = new RegExp(`^[${PUNCT_CHARS}]+$`);

/** Phonemizer output (string or array of strings) -> the string the symbol table is applied to: words and punctuation joined by spaces. */
export function tokenizePhonemes(phonemes) {
  const text = Array.isArray(phonemes) ? phonemes.join(" ") : String(phonemes ?? "");
  return (text.match(TOKEN) || []).join(" ");
}

/**
 * Phonemes of one chunk with its punctuation kept where it was, like the reference's espeak backend with preserve_punctuation=True. The npm
 * phonemizer drops punctuation, so the text is split at punctuation, each piece is phonemized alone and the marks are put back attached to
 * the preceding word ("pˈæɹɪs,").
 */
export async function phonemizeChunk(chunk, phonemize) {
  let out = "";
  for (const part of String(chunk).split(PUNCT_SPLIT)) {
    if (!part) continue;
    if (PUNCT_ONLY.test(part)) { out = out.replace(/\s+$/, "") + part + " "; continue; }
    if (!part.trim()) { out += " "; continue; }
    const ph = await phonemize(part.trim(), "en-us");
    out += (Array.isArray(ph) ? ph.join(" ") : String(ph)).trim() + " ";
  }
  return out;
}

/** One chunk of text -> model input ids. `phonemize` is the phonemizer package's function (injected so tests need no WASM). */
export async function chunkToIds(chunk, phonemize) {
  return phonemesToIds(tokenizePhonemes(await phonemizeChunk(chunk, phonemize)));
}

/** Joined phoneme string -> model input ids, framed by the pad id 0. Characters outside the table are dropped, as in the reference. */
export function phonemesToIds(joined) {
  const ids = [0];
  for (const ch of joined) if (SYMBOL_INDEX.has(ch)) ids.push(SYMBOL_INDEX.get(ch));
  ids.push(0);
  return ids;
}

export function ensurePunctuation(text) {
  const t = text.trim();
  if (!t) return t;
  return ".!?,;:".includes(t[t.length - 1]) ? t : t + ",";
}

/** Port of chunk_text(text, max_len=400): split at . ! ?, keep sentences up to maxLen, pack words for longer ones. */
export function chunkText(text, maxLen = MAX_CHUNK_CHARS) {
  const chunks = [];
  for (const raw of String(text ?? "").split(/[.!?]+/)) {
    const sentence = raw.trim();
    if (!sentence) continue;
    if (sentence.length <= maxLen) { chunks.push(ensurePunctuation(sentence)); continue; }
    let current = "";
    for (const word of sentence.split(/\s+/)) {
      if (current.length + word.length + 1 <= maxLen) current = current ? current + " " + word : word;
      else { if (current) chunks.push(ensurePunctuation(current.trim())); current = word; }
    }
    if (current) chunks.push(ensurePunctuation(current.trim()));
  }
  return chunks;
}

/** The reference's generate(): normalise the text for speech (clean_text, on by default), THEN cut it into chunks. */
/** Full stops after common abbreviations are not sentence ends: without this "Dr. Smith" would be cut into "dr" and "smith ...". */
export function softenAbbreviations(text) {
  return String(text ?? "")
    .replace(/\be\.g\./gi, "for example").replace(/\bi\.e\./gi, "that is").replace(/\betc\./gi, "et cetera")
    .replace(/\b(Dr|Mr|Mrs|Ms|Prof|Sr|Jr|St|Mt|vs|No|Inc|Ltd)\.(?=\s+\p{Lu}|\s+\d)/gu, "$1");
}

export function speechChunks(text, maxLen = MAX_CHUNK_CHARS) {
  // numbers, currency, dates and units are spoken out as the reference does, but sentence punctuation is KEPT (the reference strips it): measured with an
  // independent recogniser the result is as intelligible (word error rate 0.29/0.39/0.0 against 0.29/0.45/0.0), it keeps the pauses between sentences,
  // and the first sentence is ready sooner than one long run.
  return chunkText(normalizeForSpeech(softenAbbreviations(text), { removePunctuation: false }), maxLen);
}

/** Parse one .npy file (format 1.0/2.0/3.0, little-endian float32, C order) -> { shape, data: Float32Array }. */
export function parseNpy(u8) {
  const magic = [0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59];
  if (u8.length < 12 || magic.some((b, i) => u8[i] !== b)) throw new Error("not an .npy file");
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const major = u8[6];
  const headerLength = major === 1 ? dv.getUint16(8, true) : dv.getUint32(8, true);
  const offset = major === 1 ? 10 : 12;
  const header = new TextDecoder().decode(u8.subarray(offset, offset + headerLength));
  const descr = /'descr':\s*'([^']+)'/.exec(header)?.[1];
  if (descr !== "<f4") throw new Error(`unsupported .npy dtype ${descr}`);
  if (/'fortran_order':\s*True/.test(header)) throw new Error("unsupported .npy fortran order");
  const shapeText = /'shape':\s*\(([^)]*)\)/.exec(header)?.[1];
  if (shapeText === undefined) throw new Error("bad .npy header");
  const shape = shapeText.split(",").map((s) => s.trim()).filter(Boolean).map(Number);
  const bytes = u8.slice(offset + headerLength); // a copy: the Float32Array needs 4-byte alignment
  const count = shape.reduce((a, b) => a * b, 1);
  if (bytes.byteLength !== count * 4) throw new Error("the .npy data does not match its shape");
  return { shape, data: new Float32Array(bytes.buffer, 0, count) };
}

/** voices.npz (a zip of .npy files) -> { voiceId: { shape, data } }. `unzipSync` is fflate's, injected so this stays dependency free. */
export function parseNpz(u8, unzipSync) {
  const voices = {};
  for (const [name, bytes] of Object.entries(unzipSync(u8))) {
    if (name.endsWith(".npy")) voices[name.slice(0, -4)] = parseNpy(bytes);
  }
  if (!Object.keys(voices).length) throw new Error("voices.npz holds no voices");
  return voices;
}

/** A voice name or alias ("Bella", "expr-voice-2-f") -> the voice id in voices.npz. Unknown names throw. */
export function resolveVoice(config, voices, voice = "Leo") {
  const id = config?.voice_aliases?.[voice] ?? voice;
  if (!voices[id]) throw new Error(`unknown voice "${voice}"`);
  return id;
}

/** The speed the model receives: the caller's speed times the voice's prior from config.json. */
export function effectiveSpeed(config, voiceId, speed = 1) {
  const prior = config?.speed_priors?.[voiceId];
  return speed * (typeof prior === "number" ? prior : 1);
}

/** The style vector for a chunk: row min(text length, rows - 1) of the voice matrix (the reference picks the row by text length). */
export function styleFor(voice, textLength) {
  const [rows, dim] = voice.shape;
  const row = Math.min(textLength, rows - 1);
  return voice.data.slice(row * dim, (row + 1) * dim);
}

/** Model output -> audio: the reference drops the last 5000 samples of every chunk. */
export function trimAudio(samples) {
  return samples.subarray(0, Math.max(0, samples.length - TRIM_SAMPLES));
}
