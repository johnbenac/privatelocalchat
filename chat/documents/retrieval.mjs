// Lexical retrieval (BM25) over text chunks. No embedding model: it works offline at any size and can be explained to the reader.
import { fold } from "../search.mjs";

const STOP = new Set("a an and are as at be but by for from has have he her his i in is it its of on or she that the their them they this to was we were what when where which who will with you your about into than then there these those not can could would should do does did how why".split(" "));
export const tokenize = (text) => fold(text).split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 1 && !STOP.has(t));

export function buildIndex(chunks) {
  const docs = chunks.map((c) => { const tokens = tokenize(c.text), tf = new Map(); for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1); return { chunk: c, tf, len: tokens.length }; });
  const df = new Map(); for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) || 0) + 1);
  const avg = docs.reduce((n, d) => n + d.len, 0) / (docs.length || 1) || 1;
  return { docs, df, avg, n: docs.length };
}

/** Best chunks for a question, with scores. Terms the question shares with no chunk contribute nothing. */
export function rank(index, query, { k = 6, minScore = 0.1, k1 = 1.4, b = 0.75 } = {}) {
  const q = [...new Set(tokenize(query))];
  if (!q.length || !index.n) return [];
  const scored = index.docs.map((d) => {
    let score = 0;
    for (const t of q) {
      const f = d.tf.get(t); if (!f) continue;
      const idf = Math.log(1 + (index.n - (index.df.get(t) || 0) + 0.5) / ((index.df.get(t) || 0) + 0.5));
      score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / index.avg)));
    }
    return { chunk: d.chunk, score };
  }).filter((s) => s.score >= minScore);
  return scored.sort((a, b2) => b2.score - a.score).slice(0, k);
}
