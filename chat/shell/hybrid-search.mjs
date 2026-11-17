// Search over chats that blends two signals: the words typed (chat/search.mjs) and the meaning of the question (the small on-device
// embedding model). Nothing here fetches or sends anything; the vectors are computed in this page and kept in memory only.

import { searchThreads, parseQuery, fold } from "../search.mjs";

export const PASSAGE_CHARS = 420;

/** Short pieces of every searchable message, each with what a filter needs to know about its chat. */
export function passagesFor(threads) {
  const out = [];
  for (const t of threads) {
    if (t.temporary) continue;
    const base = { threadId: t.id, title: String(t.title || ""), updatedAt: t.updatedAt ?? 0, archived: Boolean(t.archived), trashed: t.deletedAt != null, pinned: Boolean(t.pinned), folderId: t.folderId || null };
    if (base.title) out.push({ ...base, key: t.id + ":title", messageId: null, role: null, text: base.title, hasFiles: false });
    for (const m of t.messages || []) {
      if (m.notice || !m.content || m.excluded) continue;
      const hasFiles = Boolean(m.attachments?.length);
      const text = String(m.content).replace(/\s+/g, " ").trim();
      for (let i = 0, n = 0; i < text.length && n < 3; i += PASSAGE_CHARS, n++) out.push({ ...base, key: m.id + ":" + n, messageId: m.id, role: m.role, text: text.slice(i, i + PASSAGE_CHARS), hasFiles });
    }
  }
  return out;
}

export function cosine(a, b) {
  let s = 0; const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s; // the model returns unit-length vectors
}

const DEFAULT_FILTERS = Object.freeze({ days: 0, folderId: "", archived: "no", pinnedOnly: false, hasFiles: false, role: "", mode: "both" });
export const defaultFilters = () => ({ ...DEFAULT_FILTERS });

export function passesFilters(p, f, now = Date.now()) {
  if (p.trashed && f.archived !== "all") return false;
  if (f.archived === "no" && p.archived) return false;
  if (f.archived === "only" && !p.archived) return false;
  if (f.days > 0 && now - p.updatedAt > f.days * 864e5) return false;
  if (f.folderId && p.folderId !== f.folderId) return false;
  if (f.pinnedOnly && !p.pinned) return false;
  if (f.hasFiles && !p.hasFiles) return false;
  if (f.role && p.role !== f.role) return false;
  return true;
}

const SNIP = 90;
const plainSnippet = (text) => { const s = text.replace(/\s+/g, " "); return { before: "", match: "", after: s.length > SNIP * 2 ? s.slice(0, SNIP * 2) + "…" : s }; };

/**
 * Hybrid ranking by reciprocal rank fusion: a result near the top of either list rises, one near the top of both rises most.
 * `semantic` is optional: { queryVector, vectors: Map(key -> vector), minScore }. Without it only words are used, and `via` says so.
 */
export function hybridSearch({ threads, query, filters = DEFAULT_FILTERS, semantic = null, limit = 40, now = Date.now(), passages = null }) {
  const f = { ...DEFAULT_FILTERS, ...filters };
  const q = String(query || "").trim();
  if (!q) return [];
  const pass = passages || passagesFor(threads);
  const byKey = new Map(pass.map((p) => [p.key, p]));
  const byMessage = new Map();
  for (const p of pass) { const k = p.threadId + "|" + (p.messageId ?? ""); if (!byMessage.has(k)) byMessage.set(k, p); }
  const merged = new Map();
  const add = (id, entry, rankKey, rank) => {
    const cur = merged.get(id) || { ...entry, score: 0, via: new Set(), ranks: {} };
    cur.score += 1 / (60 + rank); cur.via.add(rankKey);
    if (rankKey === "words" || !cur.snippet) cur.snippet = entry.snippet;
    merged.set(id, cur);
  };

  if (f.mode !== "meaning") {
    const hits = searchThreads(threads.filter((t) => t.deletedAt == null || f.archived === "all"), q, { limit: 200, perThread: 3 });
    let rank = 0;
    for (const h of hits) {
      const p = byMessage.get(h.threadId + "|" + (h.messageId ?? ""));
      const probe = p || { threadId: h.threadId, archived: h.archived, updatedAt: h.updatedAt, trashed: false, pinned: false, folderId: null, role: h.role, hasFiles: false };
      const thread = threads.find((t) => t.id === h.threadId);
      if (thread) { probe.pinned = Boolean(thread.pinned); probe.folderId = thread.folderId || null; probe.updatedAt = thread.updatedAt ?? probe.updatedAt; }
      if (!passesFilters(probe, f, now)) continue;
      add(h.threadId + "|" + (h.messageId ?? ""), { threadId: h.threadId, messageId: h.messageId, title: h.title, role: h.role, snippet: h.snippet, archived: h.archived, updatedAt: h.updatedAt }, "words", rank++);
    }
  }

  let semanticUsed = false;
  if (f.mode !== "words" && semantic?.queryVector && semantic.vectors?.size) {
    semanticUsed = true;
    const min = semantic.minScore ?? 0.32;
    const scored = [];
    for (const [key, vec] of semantic.vectors) {
      const p = byKey.get(key);
      if (!p || !passesFilters(p, f, now)) continue;
      const s = cosine(semantic.queryVector, vec);
      if (s >= min) scored.push([s, p]);
    }
    scored.sort((a, b) => b[0] - a[0]);
    const seen = new Set();
    let rank = 0;
    for (const [, p] of scored) {
      const id = p.threadId + "|" + (p.messageId ?? "");
      if (seen.has(id)) continue; seen.add(id);
      add(id, { threadId: p.threadId, messageId: p.messageId, title: p.title, role: p.role, snippet: plainSnippet(p.text), archived: p.archived, updatedAt: p.updatedAt }, "meaning", rank++);
      if (rank >= 100) break;
    }
  }

  const out = [...merged.values()].map((r) => ({ ...r, via: r.via.size > 1 ? "both" : [...r.via][0] }));
  out.sort((a, b) => b.score - a.score || b.updatedAt - a.updatedAt);
  return Object.assign(out.slice(0, limit), { semanticUsed });
}

export { parseQuery, fold };
