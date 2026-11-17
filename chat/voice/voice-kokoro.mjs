// The pure parts of the Kokoro-82M (q8) pipeline: no DOM, no worker, no ONNX Runtime, so they run under plain `node --test`.
// A faithful port of what kokoro-js 1.2.1 (Apache-2.0, hexgrad/kokoro + xenova) does around the model, without transformers.js:
//   text -> TextSplitterStream sentences -> phonemize() (text normalisation, split at punctuation, espeak-ng via the phonemizer package,
//   post-processing of the phoneme string) -> character-level tokenizer.json (normalizer drops unknown characters, [0, ...ids, 0],
//   truncated to 512) -> style row min(max(ids - 2, 0), 509) of the voice .bin (Float32, rows of 256) -> run {input_ids, style, speed}
//   -> 24 kHz Float32 waveform (nothing is trimmed).
// Golden tests: tests/fixtures/kokoro-golden.json (made by the reference with ops/voice/gen-kokoro-golden.mjs).

export const SAMPLE_RATE = 24000;
export const STYLE_DIM = 256;
export const MAX_STYLE_ROW = 509;
/** A sentence longer than this is cut at clause marks and then words: the model reads at most 512 tokens and the reference silently truncates. */
export const MAX_SENTENCE_CHARS = 300;

/** The voices the app offers (ids of the .bin files in the manifest). */
export const KOKORO_VOICES = Object.freeze({
  af_heart: { name: "Heart", language: "en-us", gender: "Female" },
  af_bella: { name: "Bella", language: "en-us", gender: "Female" },
  af_nicole: { name: "Nicole", language: "en-us", gender: "Female" },
  af_sarah: { name: "Sarah", language: "en-us", gender: "Female" },
  am_michael: { name: "Michael", language: "en-us", gender: "Male" },
  am_adam: { name: "Adam", language: "en-us", gender: "Male" },
  bf_emma: { name: "Emma", language: "en-gb", gender: "Female" },
  bm_george: { name: "George", language: "en-gb", gender: "Male" },
});
export const DEFAULT_VOICE = "af_heart";

/** A voice id or display name ("af_heart", "Heart") -> the voice id. Unknown names throw. */
export function resolveVoice(voice = DEFAULT_VOICE, available = Object.keys(KOKORO_VOICES)) {
  const wanted = String(voice ?? DEFAULT_VOICE);
  if (available.includes(wanted)) return wanted;
  const byName = available.find((id) => KOKORO_VOICES[id]?.name.toLowerCase() === wanted.toLowerCase());
  if (byName) return byName;
  throw new Error(`unknown voice "${voice}"`);
}

// ---------- text normalisation (kokoro-js phonemize(), the `norm` step) ----------

function flipDecimal(s) { // "1990" -> "19 90", "10:05" -> "10 oh 5", "2005" -> "20 oh 5"; decimals pass through
  if (s.includes(".")) return s;
  if (s.includes(":")) {
    const [h, m] = s.split(":").map(Number);
    return m === 0 ? `${h} o'clock` : m < 10 ? `${h} oh ${m}` : `${h} ${m}`;
  }
  const year = parseInt(s.slice(0, 4), 10);
  if (year < 1100 || year % 1000 < 10) return s;
  const head = s.slice(0, 2), tail = parseInt(s.slice(2, 4), 10), plural = s.endsWith("s") ? "s" : "";
  if (year % 1000 >= 100 && year % 1000 <= 999) {
    if (tail === 0) return `${head} hundred${plural}`;
    if (tail < 10) return `${head} oh ${tail}${plural}`;
  }
  return `${head} ${tail}${plural}`;
}

function money(s) {
  const unit = s[0] === "$" ? "dollar" : "pound";
  if (isNaN(Number(s.slice(1)))) return `${s.slice(1)} ${unit}s`;
  if (!s.includes(".")) return `${s.slice(1)} ${unit}${s.slice(1) === "1" ? "" : "s"}`;
  const [whole, fraction] = s.slice(1).split(".");
  const cents = parseInt(fraction.padEnd(2, "0"), 10);
  return `${whole} ${unit}${whole === "1" ? "" : "s"} and ${cents} ${s[0] === "$" ? (cents === 1 ? "cent" : "cents") : (cents === 1 ? "penny" : "pence")}`;
}

function point(s) {
  const [whole, fraction] = s.split(".");
  return `${whole} point ${fraction.split("").join(" ")}`;
}

/** kokoro-js's text clean-up before phonemizing (quotes, brackets, honorifics, years, times, money, decimals, plurals of capitals). */
export function normalizeText(text) {
  return String(text ?? "")
    .replace(/[‘’]/g, "'")
    .replace(/«/g, "“").replace(/»/g, "”")
    .replace(/[“”]/g, '"')
    .replace(/\(/g, "«").replace(/\)/g, "»")
    .replace(/、/g, ", ").replace(/。/g, ". ").replace(/！/g, "! ").replace(/，/g, ", ").replace(/：/g, ": ").replace(/；/g, "; ").replace(/？/g, "? ")
    .replace(/[^\S \n]/g, " ")
    .replace(/  +/, " ") // no g flag in the reference: only the first run of spaces
    .replace(/(?<=\n) +(?=\n)/g, "")
    .replace(/\bD[Rr]\.(?= [A-Z])/g, "Doctor")
    .replace(/\b(?:Mr\.|MR\.(?= [A-Z]))/g, "Mister")
    .replace(/\b(?:Ms\.|MS\.(?= [A-Z]))/g, "Miss")
    .replace(/\b(?:Mrs\.|MRS\.(?= [A-Z]))/g, "Mrs")
    .replace(/\betc\.(?! [A-Z])/gi, "etc")
    .replace(/\b(y)eah?\b/gi, "$1e'a")
    .replace(/\d*\.\d+|\b\d{4}s?\b|(?<!:)\b(?:[1-9]|1[0-2]):[0-5]\d\b(?!:)/g, flipDecimal)
    .replace(/(?<=\d),(?=\d)/g, "")
    .replace(/[$£]\d+(?:\.\d+)?(?: hundred| thousand| (?:[bm]|tr)illion)*\b|[$£]\d+\.\d\d?\b/gi, money)
    .replace(/\d*\.\d+/g, point)
    .replace(/(?<=\d)-(?=\d)/g, " to ")
    .replace(/(?<=\d)S/g, " S")
    .replace(/(?<=[BCDFGHJ-NP-TV-Z])'?s\b/g, "'S")
    .replace(/(?<=X')S\b/g, "s")
    .replace(/(?:[A-Za-z]\.){2,} [a-z]/g, (m) => m.replace(/\./g, "-"))
    .replace(/(?<=[A-Z])\.(?=[A-Z])/gi, "-")
    .trim();
}

// ---------- phonemes ----------

const PUNCT = ';:,.!?¡¿—…"«»“”(){}[]';
const PUNCT_RUN = new RegExp(`(\\s*[${PUNCT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}]+\\s*)+`, "g");

function splitKeepingMatches(text, regex) { // [{ match, text }]: punctuation runs are kept verbatim, the rest is phonemized
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(regex)) {
    if (last < m.index) parts.push({ match: false, text: text.slice(last, m.index) });
    if (m[0].length > 0) parts.push({ match: true, text: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ match: false, text: text.slice(last) });
  return parts;
}

/** The language code for a voice: American voices ("a...") use en-us, the others (British) "en". */
export const languageForVoice = (voiceId) => (String(voiceId)[0] === "a" ? "en-us" : "en");

/** kokoro-js's clean-up of the espeak-ng output so it matches the symbols the model was trained on. */
export function postProcessPhonemes(joined, american = true) {
  let out = joined
    .replace(/kəkˈoːɹoʊ/g, "kˈoʊkəɹoʊ").replace(/kəkˈɔːɹəʊ/g, "kˈəʊkəɹəʊ")
    .replace(/ʲ/g, "j").replace(/r/g, "ɹ").replace(/x/g, "k").replace(/ɬ/g, "l")
    .replace(/(?<=[a-zɹː])(?=hˈʌndɹɪd)/g, " ")
    .replace(/ z(?=[;:,.!?¡¿—…"«»“” ]|$)/g, "z");
  if (american) out = out.replace(/(?<=nˈaɪn)ti(?!ː)/g, "di");
  return out.trim();
}

/**
 * Text (one sentence) -> the phoneme string for a voice. `phonemize` is the npm phonemizer package's function (text, language) -> string[]
 * (injected so tests need no WASM). Punctuation runs are kept as they are; everything between them is phonemized on its own.
 */
export async function phonemizeText(text, voiceId, phonemize, { normalize = true } = {}) {
  const american = String(voiceId)[0] === "a";
  const language = american ? "en-us" : "en";
  const source = normalize ? normalizeText(text) : String(text ?? "");
  const pieces = await Promise.all(splitKeepingMatches(source, PUNCT_RUN).map(async ({ match, text: part }) => (match ? part : (await phonemize(part, language)).join(" "))));
  return postProcessPhonemes(pieces.join(""), american);
}

// ---------- sentence splitting (kokoro-js TextSplitterStream) ----------

const isTerminator = (c, newline = true) => ".!?…。？！".includes(c) || (newline && c === "\n");
const ABBREVIATIONS = new Set(["mr", "mrs", "ms", "dr", "prof", "sr", "jr", "sgt", "col", "gen", "rep", "sen", "gov", "lt", "maj", "capt", "st", "mt", "etc", "co", "inc", "ltd", "dept", "vs", "p", "pg", "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec", "sun", "mon", "tu", "tue", "tues", "wed", "th", "thu", "thur", "thurs", "fri", "sat"]);
const isAbbreviation = (word) => ABBREVIATIONS.has(word.replace(/['’]s$/i, "").replace(/\.+$/, "").toLowerCase());
const CLOSING = new Map([[")", "("], ["]", "["], ["}", "{"], ["》", "《"], ["〉", "〈"], ["›", "‹"], ["»", "«"], ["」", "「"], ["』", "『"], ["〕", "〔"], ["】", "【"]]);
const OPENING = new Set(CLOSING.values());

function trackNesting(char, stack, index, text) {
  if (char === '"' || char === "'") {
    if (char === "'" && index > 0 && index < text.length - 1 && /[A-Za-z]/.test(text[index - 1]) && /[A-Za-z]/.test(text[index + 1])) return; // apostrophe
    if (stack.length && stack.at(-1) === char) stack.pop(); else stack.push(char);
    return;
  }
  if (OPENING.has(char)) { stack.push(char); return; }
  const opener = CLOSING.get(char);
  if (opener && stack.length && stack.at(-1) === opener) stack.pop();
}

const wordAt = (text, start) => { let i = start; while (i < text.length && !/\s/.test(text[i])) ++i; return text.substring(start, i); };

/** Port of kokoro-js's TextSplitterStream for a whole text: sentences end at . ! ? … unless that is an abbreviation, a number, a URL or inside quotes/brackets. */
export function splitSentences(text) {
  const buffer = String(text ?? "");
  const sentences = [];
  const length = buffer.length;
  let start = 0, cursor = 0;
  const stack = [];
  const endOf = (at) => {
    let end = at;
    while (end + 1 < length && isTerminator(buffer[end + 1], false)) ++end;
    while (end + 1 < length && "\"')]}」』".includes(buffer[end + 1])) ++end;
    let next = end + 1;
    while (next < length && /\s/.test(buffer[next])) ++next;
    return { end, next };
  };
  while (cursor < length) {
    const ch = buffer[cursor];
    trackNesting(ch, stack, cursor, buffer);
    if (stack.length === 0 && isTerminator(ch)) {
      if (/(^|\n)\d+$/.test(buffer.slice(start, cursor))) { ++cursor; continue; }
      const { end, next } = endOf(cursor);
      if (cursor === next - 1 && ch !== "\n") { ++cursor; continue; }
      if (next === length) break; // the rest is flushed below
      let from = cursor - 1;
      while (from >= 0 && /\S/.test(buffer[from])) from--;
      from = Math.max(start, from + 1);
      const word = wordAt(buffer, from);
      if (!word) { ++cursor; continue; }
      if ((/https?[,:]\/\//.test(word) || word.includes("@")) && !isTerminator(word.at(-1))) { cursor = from + word.length; continue; }
      if (isAbbreviation(word)) { ++cursor; continue; }
      if (/^([A-Za-z]\.)+$/.test(word) && next < length && /[A-Z]/.test(buffer[next])) { ++cursor; continue; }
      if (ch === "." && next < length && /[a-z]/.test(buffer[next])) { ++cursor; continue; }
      const sentence = buffer.substring(start, end + 1).trim();
      if (sentence === "..." || sentence === "…") { ++cursor; continue; }
      if (sentence) sentences.push(sentence);
      cursor = start = end + 1;
    } else ++cursor;
  }
  const rest = buffer.substring(start).trim();
  if (rest) sentences.push(rest);
  return sentences;
}

/** Cuts an over-long sentence at clause marks, then at spaces, so each piece fits the model's 512-token window. Short sentences are returned as they are. */
export function splitLongSentence(sentence, maxChars = MAX_SENTENCE_CHARS) {
  if (sentence.length <= maxChars) return [sentence];
  const pieces = [];
  let current = "";
  const flush = () => { if (current.trim()) pieces.push(current.trim()); current = ""; };
  for (const clause of sentence.split(/(?<=[,;:—])\s+/)) {
    if (clause.length > maxChars) {
      flush();
      for (const word of clause.split(/\s+/)) {
        if (current && current.length + word.length + 1 > maxChars) flush();
        current = current ? current + " " + word : word;
      }
      continue;
    }
    if (current && current.length + clause.length + 1 > maxChars) flush();
    current = current ? current + " " + clause : clause;
  }
  flush();
  return pieces;
}

/** What the worker speaks, one model run each: the reference's sentences, with any over-long one cut further. */
export function kokoroChunks(text, maxChars = MAX_SENTENCE_CHARS) {
  return splitSentences(text).flatMap((s) => splitLongSentence(s, maxChars));
}

// ---------- tokenizer (tokenizer.json of the model: normalizer Replace + one token per character) ----------

/**
 * Builds the encoder from the parsed tokenizer.json (and optionally tokenizer_config.json for model_max_length). encode(phonemes) returns the
 * ids as the reference tokenizer does: characters outside the normalizer's class are removed, each remaining character is looked up
 * (unknown -> the unk id), the pad id 0 is added at both ends, and the result is cut to model_max_length (512).
 */
export function createTokenizer(tokenizerJson, tokenizerConfig = {}) {
  const vocab = tokenizerJson?.model?.vocab;
  const pattern = tokenizerJson?.normalizer?.pattern?.Regex;
  if (!vocab || typeof vocab !== "object") throw new Error("tokenizer.json has no vocabulary");
  if (typeof pattern !== "string") throw new Error("tokenizer.json has no Replace normalizer");
  const drop = new RegExp(pattern, "g");
  const pad = vocab[tokenizerConfig.pad_token ?? "$"] ?? 0;
  const unk = vocab[tokenizerConfig.unk_token ?? "$"] ?? pad;
  const max = Number.isInteger(tokenizerConfig.model_max_length) ? tokenizerConfig.model_max_length : 512;
  return {
    maxLength: max,
    encode(phonemes) {
      const ids = [pad];
      for (const ch of String(phonemes ?? "").replace(drop, "")) ids.push(vocab[ch] ?? unk);
      ids.push(pad);
      return ids.length > max ? ids.slice(0, max) : ids;
    },
  };
}

// ---------- voices ----------

/** A voice .bin (little-endian Float32, rows of 256) -> Float32Array. Throws when the size is not a whole number of rows. */
export function parseVoice(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (!u8.byteLength || u8.byteLength % (STYLE_DIM * 4) !== 0) throw new Error("a voice file must hold whole rows of 256 float32 values");
  const copy = u8.slice(); // 4-byte aligned copy
  return new Float32Array(copy.buffer, 0, copy.byteLength / 4);
}

/** The style vector for an id sequence: row min(max(ids - 2, 0), 509), as the reference's generate_from_ids picks it. */
export function styleFor(voiceData, idCount) {
  const rows = voiceData.length / STYLE_DIM;
  const row = Math.min(Math.min(Math.max(idCount - 2, 0), MAX_STYLE_ROW), rows - 1);
  return voiceData.slice(row * STYLE_DIM, (row + 1) * STYLE_DIM);
}
