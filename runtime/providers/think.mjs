// Empty think blocks. Qwen3.5 thinks by default; the app asks for enable_thinking:false on ordinary replies and WebLLM then starts the
// assistant text with an EMPTY block ("<think>\n\n</think>\n\n"). That exact empty block (whitespace tolerant) is removed from visible text
// and from anything parsed as JSON. A block with content is real reasoning and is never removed here: it passes through untouched.
const OPEN = "<think>"; const CLOSE = "</think>";
const isWs = (c) => c === " " || c === "\n" || c === "\r" || c === "\t";
const skipWs = (t, i) => { while (i < t.length && isWs(t[i])) i++; return i; };

/** One empty block at the start of `text`. "match" (end = index after the block and trailing whitespace), "prefix" (could still become one), or "no". */
function oneEmptyThink(text) {
  let i = skipWs(text, 0);
  const rest = text.slice(i);
  if (rest.length < OPEN.length) return OPEN.startsWith(rest) ? { state: "prefix" } : { state: "no" };
  if (!rest.startsWith(OPEN)) return { state: "no" };
  let j = skipWs(text, i + OPEN.length);
  const tail = text.slice(j);
  if (tail.length < CLOSE.length) return CLOSE.startsWith(tail) ? { state: "prefix" } : { state: "no" };
  if (!tail.startsWith(CLOSE)) return { state: "no" };
  return { state: "match", end: skipWs(text, j + CLOSE.length) };
}

/** The empty block(s) at the start. LFM2.5's template writes two in a row ("<think></think><think></think>"), so any number in a row is accepted.
 *  "match" (end = index after the blocks and trailing whitespace), "prefix" (the start could still become one), or "no". */
export function emptyThinkAtStart(text) {
  let pos = 0, matched = false;
  for (;;) {
    const r = oneEmptyThink(text.slice(pos));
    if (r.state === "match") { pos += r.end; matched = true; if (pos >= text.length) return { state: "match", end: pos }; continue; }
    if (r.state === "prefix") return { state: "prefix" };
    return matched ? { state: "match", end: pos } : { state: "no" };
  }
}

/** For finished text (JSON parsing, stored replies). */
export function stripEmptyThink(text) {
  const r = emptyThinkAtStart(String(text ?? ""));
  return r.state === "match" ? String(text).slice(r.end) : String(text ?? "");
}

/** Streaming filter: push deltas, get the visible part back. Output is held back only while the start could still be an empty block. */
export function createThinkFilter() {
  let pending = ""; let decided = false; let matched = false; let skipLead = false;
  return {
    push(delta) {
      if (decided) { if (skipLead) { const k = skipWs(delta, 0); if (k < delta.length) skipLead = false; return delta.slice(k); } return delta; }
      pending += delta;
      const r = emptyThinkAtStart(pending);
      if (r.state === "prefix") return "";
      if (r.state === "match") {
        matched = true;
        const out = pending.slice(r.end); pending = "";
        if (out === "") return ""; // the blocks ended exactly here: more may follow, so keep watching
        decided = true; return out;
      }
      // not a block: after earlier blocks, the whitespace that followed them is not part of the answer
      const out = pending.slice(skipWs(pending, 0)); pending = ""; decided = true; // an answer never starts with blank space
      if (out === "") decided = false;
      return out;
    },
    /** End of stream: whatever was held back is real text (or a lone partial block) and is released, never dropped. */
    flush() { const out = stripEmptyThink(pending); pending = ""; decided = true; return out; }
  };
}
