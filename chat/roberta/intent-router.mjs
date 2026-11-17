// Roberta's intent router: what someone said (typed, or a browser speech-to-text transcript) -> which prepared topic it means.
// No language model and no generation. Two arms are fused:
//   semantic  the sentence is embedded on this device (chat/embedding/embedder.mjs, 256 numbers) and compared with the precomputed vectors of every
//             example phrase of every topic (chat/roberta/ivr-vectors.json), so "who has my data" finds "where are my chats saved" by meaning;
//   lexical   normalised words, stop words, light stemming, synonyms, each topic's keywords and example words. It needs no model, so Roberta
//             answers at once, before anything is downloaded, and keeps answering if the model fails or Data saver is on.
// route(text) never throws and always answers: if the embedder is not ready within a short budget the answer is lexical (method "lexical").
//
//   const router = createIntentRouter({ vectors: loadIntentVectors(), embedder });   // embedder optional, can be added later: setEmbedder()
//   const { intent, confidence, candidates } = await router.route("is this sending information to the cloud");
//   // confidence "high": go there. "medium": go there, but the caller may say "here is what I have about X". "low": no confident match.
//
// This file is pure (no DOM, no network, except loadIntentVectors which the caller opts into) and is tested in tests/intent-router.test.mjs.

import { NODES } from "./ivr-content.mjs";

export const VECTORS_FORMAT = "intent-vectors/1";
export const VECTOR_QUANT = "6 bit, one character of A-Za-z0-9+/ per dimension, value = (index - 32) / 64";
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const VECTOR_STEPS = 64;

// ---- the vector file ----------------------------------------------------------------------------------------------------------------
/** The text the vectors' phraseHash is computed over: every phrase's intent and text, in order. */
export const canonicalPhrases = (phrases) => JSON.stringify(phrases.map((p) => [p.intent, p.text]));

export function encodeVector(vector) {
  let out = "";
  for (let i = 0; i < vector.length; i += 1) out += ALPHABET[Math.max(0, Math.min(63, Math.round(vector[i] * VECTOR_STEPS) + 32))];
  return out;
}
export function decodeVector(text) {
  const out = new Float32Array(text.length);
  let norm = 0;
  for (let i = 0; i < text.length; i += 1) { out[i] = (ALPHABET.indexOf(text[i]) - 32) / VECTOR_STEPS; norm += out[i] * out[i]; }
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < out.length; i += 1) out[i] /= norm;
  return out;
}
/** Fetch and parse the precomputed vectors (resolves to null, never rejects, if they cannot be had: the router then stays lexical). */
export async function loadIntentVectors(url = new URL("./ivr-vectors.json", import.meta.url)) {
  try { const response = await fetch(url); return response.ok ? await response.json() : null; } catch { return null; }
}
/** True when the vector file was made from exactly these phrases (cheap, no hashing; the build script and tests also compare the hash). */
export const vectorsMatch = (vectors, phrases) => Boolean(vectors && Array.isArray(vectors.phrases) && vectors.phrases.length === phrases.length
  && vectors.phrases.every((p, i) => p.intent === phrases[i].intent && p.text === phrases[i].text));

// ---- words ---------------------------------------------------------------------------------------------------------------------------
const STOP = new Set(("a an the to of in on at for and or but so as if then than that this these those there here it its it's is am are was were be been being do does did "
  + "can could would will shall should may might i me my mine we us our you're i'm i'd i'll ive um uh er erm hmm hm mm ah oh hey hi hello please okay ok yeah yes no just really "
  + "like well actually basically kind sort thing things stuff some any get got want wanna gonna need would roberta tell show give let lets say know see").split(" "));
const PHRASES = [
  [/\bspeech to text\b|\bvoice to text\b|\bvoice typing\b|\bspeech recognition\b/g, " dictation "],
  [/\btext to speech\b|\bread (?:it |this |that |replies |answers |the \w+ )?(?:out loud|aloud)\b/g, " tts "],
  [/\bback ?up\b/g, " backup "], [/\bset ?up\b/g, " setup "], [/\bsign ?(?:up|in)\b/g, " signup "], [/\blog ?in\b/g, " login "],
  [/\bnever ?mind\b/g, " nevermind "], [/\bhome ?screen\b/g, " homescreen "], [/\bwi-?fi\b/g, " wifi "], [/\bopen ?ai\b/g, " openai "],
  [/\bchat ?gpt\b/g, " chatgpt "], [/\bllm\b/g, " model "], [/\blm studio\b/g, " lmstudio "], [/\bopen ?router\b/g, " openrouter "],
];
const SYNONYMS = {
  iphon: "phon", android: "phon", ipad: "phon", mobil: "phon", cell: "phon", smartphon: "phon", tablet: "phon",
  mic: "microphon", gigabyt: "size", megabyt: "size", gb: "size", mb: "size", big: "size", larg: "size", huge: "size",
  delet: "remov", uninstall: "remov", eras: "remov", wipe: "remov", clear: "remov",
  laptop: "comput", desktop: "comput", pc: "comput", slow: "slow", sluggish: "slow", lag: "slow", laggy: "slow", gpu: "gpu", graphics: "gpu",
  friend: "friend", famil: "friend", mom: "friend", dad: "friend", sister: "friend", brother: "friend", someon: "friend", parent: "friend",
  chatgpt: "provid", openai: "provid", gpt: "provid", claud: "provid", gemini: "provid", anthropic: "provid", api: "provid", endpoint: "provid", openrouter: "provid", lmstudio: "provid", ollama: "provid",
  stuck: "stuck", froz: "stuck", stall: "stuck", hang: "stuck", fail: "fail", crash: "fail", broken: "broken", broke: "broken",
  hear: "hear", listen: "hear", cloud: "cloud", server: "cloud",
  human: "person", real: "real", alive: "alive", conscious: "alive", feeling: "alive", sentient: "alive",
  record: "record", recording: "record", voicemail: "voicemail",
  airplan: "offlin", plane: "offlin", offlin: "offlin",
  megabytes: "size",
};
const EXCEPTIONS = { setting: "setting", settings: "setting", talking: "talk", chatting: "chat", using: "use", dictation: "dictat", this: "this", has: "has", was: "was", its: "its", does: "does", yes: "yes" };

/** Light stemming: plural, -ing, -ed, -age, trailing e, doubled final consonant; then the synonym table. */
export function stem(word) {
  if (EXCEPTIONS[word]) return SYNONYMS[EXCEPTIONS[word]] || EXCEPTIONS[word];
  let w = word;
  if (w.length > 4 && w.endsWith("ies")) w = `${w.slice(0, -3)}y`;
  else if (w.length > 3 && w.endsWith("s") && !/(ss|us|is)$/.test(w)) w = w.slice(0, -1);
  for (const suffix of ["ing", "ed", "age"]) {
    if (w.endsWith(suffix) && w.length - suffix.length >= 4) { w = w.slice(0, -suffix.length); if (/([^aeiouls])\1$/.test(w)) w = w.slice(0, -1); break; }
  }
  if (w.length > 4 && w.endsWith("e")) w = w.slice(0, -1);
  return SYNONYMS[w] || w;
}

/** Lower case, no punctuation, spelled-out letters joined ("chat g p t" -> "chatgpt", "a p i" -> "api", "q r" -> "qr"), phrase rewrites. */
export function normalise(text) {
  let t = String(text ?? "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const words = t.split(" ").filter(Boolean);
  const joined = [];
  for (let i = 0; i < words.length;) {
    let j = i;
    while (j < words.length && words[j].length === 1 && /[a-z]/.test(words[j])) j += 1;
    if (j - i >= 2) { joined.push(words.slice(i, j).join("")); i = j; } else { joined.push(words[i]); i += 1; }
  }
  t = ` ${joined.join(" ")} `;
  for (const [pattern, replacement] of PHRASES) t = t.replace(pattern, replacement);
  return t.replace(/\s+/g, " ").trim();
}
/** The stems of the words that carry meaning. */
export function tokens(text) {
  return normalise(text).split(" ").filter((w) => w && !STOP.has(w)).map(stem).filter((w) => w && !STOP.has(w));
}

// ---- defaults, calibrated on tests/fixtures/ivr-eval-queries.json (docs/EMBEDDINGS.md) ----------------------------------------------
export const ROUTER_DEFAULTS = Object.freeze({
  semanticWeight: 0.7,        // fused = w * semantic + (1 - w) * lexical, when the embedder answered
  semLow: 0.30, semHigh: 0.72, // cosine -> 0..1: below semLow is noise, semHigh is as good as a match gets
  maxWeight: 0.6, topK: 3,    // an intent's semantic score = maxWeight * best example + (1 - maxWeight) * mean of its best topK examples
  exampleWeight: 0.7,         // a word found only in an example phrase counts this much of a keyword hit
  nearFloor: 0.25,            // a "low" answer still lists the topics scoring at least this, for "did you mean"
  coldBudgetMs: 250,          // longest wait for a cold embedder before answering lexically
  warmBudgetMs: 2000,         // longest wait for a ready embedder (a hung worker must not freeze the phone menu)
  lexical: { high: 0.80, highMargin: 0.05, medium: 0.45, mediumMargin: 0.10 },
  hybrid: { high: 0.60, highMargin: 0.10, medium: 0.35, mediumMargin: 0.08 },
});

const CONTROL_BACK = /\b(?:go back|back|previous|nevermind|cancel|return|undo)\b/;
const CONTROL_REPEAT = /\b(?:repeat|again|options|choices|main menu|over that|once more|one more time|missed that|catch that|didnt catch)\b/;

export function createIntentRouter({ intents, vectors, embedder = null, keywords, ...overrides } = {}) {
  const cfg = { ...ROUTER_DEFAULTS, ...overrides, lexical: { ...ROUTER_DEFAULTS.lexical, ...overrides.lexical }, hybrid: { ...ROUTER_DEFAULTS.hybrid, ...overrides.hybrid } };
  const list = (intents ? (Array.isArray(intents) ? intents : Object.values(intents)) : Object.values(NODES))
    .map((n) => ({ id: n.id, keywords: n.keywords || [], examples: n.examples || [], children: n.children || [] }));
  // a topic and its sub-topics (privacy / privacy.cloud) are neighbours, not rivals: when they tie, either lands on the right branch of the menu
  const family = new Set(list.flatMap((n) => n.children.flatMap((c) => [`${n.id}|${c}`, `${c}|${n.id}`])));
  const related = (a, b) => family.has(`${a}|${b}`);
  const extra = keywords || {};
  let currentEmbedder = embedder;
  let vectorSet = null; // intent -> Float32Array[]
  let vectorsInput = vectors;

  // lexical index: per intent the keyword stems and the example stems; idf over intents
  const index = list.map((n) => ({
    id: n.id,
    keys: new Set([...n.keywords, ...(extra[n.id] || [])].flatMap(tokens)),
    exampleBags: n.examples.map((e) => new Set(tokens(e))),
  }));
  for (const n of index) n.words = new Set([...n.keys, ...n.exampleBags.flatMap((b) => [...b])]);
  const df = new Map();
  for (const n of index) for (const w of n.words) df.set(w, (df.get(w) || 0) + 1);
  const idf = (w) => Math.log(1 + index.length / (df.get(w) || 0.5));
  const known = (w) => df.has(w);

  function lexicalScores(text) {
    const query = [...new Set(tokens(text))];
    const total = query.reduce((sum, w) => sum + (known(w) ? idf(w) : idf(w) * 0.6), 0) || 1; // unknown words count against the match, a little
    const scores = new Map();
    for (const n of index) {
      let hit = 0;
      for (const w of query) if (n.keys.has(w)) hit += idf(w); else if (n.words.has(w)) hit += idf(w) * cfg.exampleWeight;
      const coverage = hit / total;
      let best = 0; // the best single example, Dice overlap
      for (const bag of n.exampleBags) {
        if (!bag.size) continue;
        let common = 0;
        for (const w of query) if (bag.has(w)) common += 1;
        best = Math.max(best, (2 * common) / (query.length + bag.size));
      }
      scores.set(n.id, Math.min(1, 0.65 * coverage + 0.35 * best));
    }
    return { scores, query };
  }

  function controlBoost(norm, content) {
    const out = new Map();
    const short = norm.split(" ").length <= 9;
    if (!short) return out;
    if (CONTROL_BACK.test(norm) && !/\bbackup\b/.test(norm) && content.filter((w) => !["back", "previou", "go", "last", "menu", "return", "take", "nevermind", "cancel", "undo"].includes(w)).length <= 1) out.set("ctl.back", 0.9);
    if (CONTROL_REPEAT.test(norm) && !out.size && content.filter((w) => !["repeat", "again", "option", "choic", "menu", "main", "over", "that", "one", "time", "more", "go", "what", "were", "are", "read", "press", "you", "sorri"].includes(w)).length <= 1) out.set("ctl.repeat", 0.9);
    return out;
  }

  async function semanticScores(text) {
    if (!currentEmbedder) return null;
    if (vectorsInput && typeof vectorsInput.then === "function") { try { vectorsInput = await vectorsInput; } catch { vectorsInput = null; } }
    if (!vectorSet && vectorsInput?.phrases) {
      const known = new Set(list.map((n) => n.id));
      vectorSet = new Map();
      for (const p of vectorsInput.phrases) if (known.has(p.intent)) { if (!vectorSet.has(p.intent)) vectorSet.set(p.intent, []); vectorSet.get(p.intent).push(decodeVector(p.v)); }
    }
    if (!vectorSet || !vectorSet.size) return null;
    const embedder_ = currentEmbedder;
    const state = embedder_.state;
    if (state === "failed" || state === "unavailable") return null;
    const budget = state === "ready" ? cfg.warmBudgetMs : cfg.coldBudgetMs;
    let timer;
    const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(null), budget); });
    try {
      const vector = await Promise.race([
        (async () => { await embedder_.ready(); return embedder_.embedQuery(text); })().catch(() => null),
        timeout,
      ]);
      if (!vector) return null;
      const out = new Map();
      for (const [id, vs] of vectorSet) {
        const sims = vs.map((v) => { let d = 0; for (let i = 0; i < v.length; i += 1) d += v[i] * vector[i]; return d; }).sort((a, b) => b - a);
        const top = sims.slice(0, cfg.topK);
        out.set(id, cfg.maxWeight * sims[0] + (1 - cfg.maxWeight) * (top.reduce((s, x) => s + x, 0) / top.length));
      }
      return { cosine: out, best: Math.max(...out.values()) };
    } finally { clearTimeout(timer); }
  }

  const clamp01 = (x) => Math.max(0, Math.min(1, x));

  async function route(text) {
    const said = String(text ?? "").trim();
    const norm = normalise(said);
    const none = (method = "lexical") => ({ intent: null, score: 0, confidence: "low", method, candidates: [] });
    if (!norm) return none();
    const { scores: lex, query } = lexicalScores(said);
    const boosts = controlBoost(norm, query);
    for (const [id, boost] of boosts) if (lex.has(id)) lex.set(id, Math.max(lex.get(id), boost));
    // short-utterance guard: one word that is no topic's keyword ("hmm", "okay", "test") is not a request
    if (!query.length && !boosts.size) return none();
    let sem = null;
    if (cfg.semanticWeight > 0) { try { sem = await semanticScores(said); } catch { sem = null; } }
    const w = sem ? cfg.semanticWeight : 0;
    const rows = list.map((n) => {
      const l = lex.get(n.id) || 0;
      const cosine = sem?.cosine.get(n.id);
      const s = cosine === undefined ? 0 : clamp01((cosine - cfg.semLow) / (cfg.semHigh - cfg.semLow));
      const boost = boosts.get(n.id) || 0;
      const score = sem ? Math.max(w * s + (1 - w) * l, boost) : l;
      return { intent: n.id, score, semantic: cosine === undefined ? null : s, lexical: l };
    }).sort((a, b) => b.score - a.score);
    const first = rows[0];
    const rival = rows.find((r, i) => i > 0 && !related(first.intent, r.intent));
    const margin = first.score - (rival?.score ?? 0);
    const t = sem ? cfg.hybrid : cfg.lexical;
    let confidence = "low";
    if (first.score >= t.high && margin >= t.highMargin) confidence = "high";
    else if (first.score >= t.medium && margin >= t.mediumMargin) confidence = "medium";
    // a single unrecognised word with no semantic backing never rises above low
    if (query.length === 1 && !known(query[0]) && !boosts.size) confidence = "low";
    const method = !sem ? "lexical" : first.lexical > 0.05 ? "hybrid" : "semantic";
    return {
      intent: confidence === "low" ? null : first.intent, score: first.score, confidence, method,
      // for "low", only the topics that came near are offered ("did you mean ..."); gibberish offers nothing
      candidates: rows.slice(0, 5).filter((r) => confidence !== "low" || r.score >= cfg.nearFloor).map(({ intent, score, semantic, lexical }) => ({ intent, score, semantic, lexical })),
    };
  }

  return {
    route,
    setEmbedder(e) { currentEmbedder = e || null; },
    setVectors(v) { vectorsInput = v; vectorSet = null; },
    config: cfg,
  };
}
