// How full is the model's usable context, and how to condense the older part of a conversation so it can go on.
// The saved transcript is never changed: a summary only replaces the old messages in what the model is shown.
import { contextMessages } from "./threads.mjs";

export const estimateTokens = (chars) => Math.ceil(chars / 3.6);
const REPLY_RESERVE = 0.2; // room kept for the next answer

export function contextUsage(thread, windowTokens, extraChars = 0) {
  const chars = contextMessages(thread).reduce((n, m) => n + m.content.length + (m.attachments || []).reduce((a, x) => a + Math.min(x.chars || 0, windowTokens * 1.6), 0) + (m.tools || []).reduce((a, t) => a + t.label.length + t.result.length + 60, 0), 0)
    + (thread.systemPrompt?.length || 0) + (thread.summary?.text.length || 0) + extraChars;
  const tokens = estimateTokens(chars), usable = windowTokens * (1 - REPLY_RESERVE), fraction = tokens / usable;
  return { tokens, windowTokens, fraction, level: fraction >= 1 ? "full" : fraction >= 0.75 ? "warn" : "ok" };
}

const label = (m) => (m.role === "user" ? "User" : "Assistant");
/**
 * Split everything before the last two messages into pieces that each fit in `windowTokens` alongside instructions,
 * so even a conversation that has outgrown the window can be condensed step by step.
 * -> { upTo, pieces:[string] } or null when there is too little to condense.
 */
export function planSummary(thread, windowTokens) {
  const from = thread.summary?.upTo ?? 0, upTo = thread.messages.length - 2;
  if (upTo - from < 2) return null;
  const pieceChars = Math.max(1500, Math.floor(windowTokens * 0.45 * 3.6));
  const pieces = []; let cur = "";
  for (const m of thread.messages.slice(from, upTo)) {
    if (m.excluded || m.notice || !m.content.trim() || m.role === "system") continue;
    let text = `${label(m)}: ${m.content.trim()}`;
    while (text.length > pieceChars) { if (cur) { pieces.push(cur); cur = ""; } pieces.push(text.slice(0, pieceChars)); text = text.slice(pieceChars); }
    if (cur.length + text.length + 2 > pieceChars) { pieces.push(cur); cur = ""; }
    cur += (cur ? "\n\n" : "") + text;
  }
  if (cur) pieces.push(cur);
  return pieces.length ? { upTo, pieces } : null;
}

export const SUMMARY_SYSTEM = "You condense conversations faithfully. You never invent details.";
export function summaryPrompt(previous, piece) {
  return `${previous ? `Summary so far:\n${previous}\n\nNew part of the conversation:\n` : "Conversation:\n"}${piece}\n\nWrite one compact summary of ${previous ? "everything above" : "the conversation"} in under 200 words. Keep names, numbers, decisions, open questions and the user's preferences. Add nothing that is not stated.`;
}
