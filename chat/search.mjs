// Local full-text search over conversations: titles and every message (including archived chats). No index to build or
// keep in step: chats are small, and a linear scan with accent/case folding is instant at this scale.

export const fold = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** "hello world" -> two terms; "exact phrase" in quotes stays together. */
export function parseQuery(query) {
  const terms = [], re = /"([^"]+)"|(\S+)/g; let m;
  while ((m = re.exec(String(query ?? "")))) { const t = fold(m[1] ?? m[2]).trim(); if (t) terms.push(t); }
  return terms;
}

const snippetAround = (text, at, len, radius = 48) => {
  const start = Math.max(0, at - radius), end = Math.min(text.length, at + len + radius);
  return { before: (start > 0 ? "…" : "") + text.slice(start, at).replace(/\s+/g, " "), match: text.slice(at, at + len), after: text.slice(at + len, end).replace(/\s+/g, " ") + (end < text.length ? "…" : "") };
};

/**
 * Every term must appear in the title or in a single message. A chat can match through its title and through several messages.
 * Results: [{ threadId, title, messageId|null, role, snippet, inTitle, archived, updatedAt }] best first.
 */
export function searchThreads(threads, query, { limit = 50, perThread = 3 } = {}) {
  const terms = parseQuery(query);
  if (!terms.length) return [];
  const out = [];
  for (const t of threads) {
    if (t.deletedAt != null || t.temporary) continue;
    const title = String(t.title ?? ""), foldedTitle = fold(title);
    if (terms.every((x) => foldedTitle.includes(x))) {
      const at = foldedTitle.indexOf(terms[0]);
      out.push({ threadId: t.id, title, messageId: null, role: null, snippet: snippetAround(title, at, terms[0].length), inTitle: true, archived: Boolean(t.archived), updatedAt: t.updatedAt ?? 0, score: 100 });
    }
    let found = 0;
    for (const m of t.messages ?? []) {
      if (m.notice || !m.content) continue;
      // versions other than the one shown are searchable too
      for (const text of m.versions ? m.versions.map((v) => v.content) : [m.content]) {
        const folded = fold(text);
        if (!terms.every((x) => folded.includes(x))) continue;
        const at = folded.indexOf(terms[0]);
        out.push({ threadId: t.id, title, messageId: m.id, role: m.role, snippet: snippetAround(text, at, terms[0].length), inTitle: false, archived: Boolean(t.archived), updatedAt: t.updatedAt ?? 0, score: 10 + (m.role === "user" ? 1 : 0) });
        found++; break;
      }
      if (found >= perThread) break;
    }
  }
  return out.sort((a, b) => b.score - a.score || b.updatedAt - a.updatedAt).slice(0, limit);
}

/** Character ranges in `text` covered by any term, for highlighting (accent-insensitive; folding keeps lengths for Latin text). */
export function matchRanges(text, terms) {
  const folded = fold(text), same = folded.length === text.length, ranges = [];
  if (!same) return ranges;
  for (const t of terms) { let i = 0; while ((i = folded.indexOf(t, i)) !== -1) { ranges.push([i, i + t.length]); i += t.length; } }
  ranges.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const merged = [];
  for (const r of ranges) { const last = merged[merged.length - 1]; if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]); else merged.push([...r]); }
  return merged;
}
