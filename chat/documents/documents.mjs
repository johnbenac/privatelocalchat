// Pure helpers for attached documents: what can be read, how it is chunked, and how much of it goes to the model.
import { buildIndex, rank } from "./retrieval.mjs";

export const LIMITS = Object.freeze({ fileBytes: 25 * 1024 * 1024, imageBytes: 12 * 1024 * 1024, chars: 3_000_000, pages: 600 });
export const estimateTokens = (chars) => Math.ceil(chars / 3.6);

const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|jsonl|log|xml|yaml|yml|ini|toml|rst|tex|srt|vtt|html?|js|mjs|ts|py|java|c|h|cpp|go|rs|rb|php|sh|sql|css)$/i;
export function kindOf(name, type = "") {
  if (/\.pdf$/i.test(name) || type === "application/pdf") return "pdf";
  if (/\.(png|jpe?g|webp|gif)$/i.test(name) || /^image\/(png|jpe?g|webp|gif)$/.test(type)) return "image";
  if (TEXT_EXT.test(name) || /^text\//.test(type) || type === "application/json") return "text";
  return null;
}
export const unsupportedMessage = (name) => `“${name}” can’t be read here. Supported: text, Markdown, CSV, JSON, code and text-based PDF files${"" /* images go to API providers only */}.`;

/** Quote-aware CSV/TSV -> rows. */
export function parseCsv(text, delimiter = ",") {
  const rows = []; let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false; } else cell += c; }
    else if (c === '"') quoted = true;
    else if (c === delimiter) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); cell = ""; if (row.length > 1 || row[0] !== "") rows.push(row); row = []; }
    else cell += c;
  }
  row.push(cell); if (row.length > 1 || row[0] !== "") rows.push(row);
  return rows;
}

export function describeTable(text, name) {
  const delimiter = /\.tsv$/i.test(name) ? "\t" : ",";
  const rows = parseCsv(text, delimiter);
  if (!rows.length) return "";
  return `Table with ${rows.length - 1} data row${rows.length === 2 ? "" : "s"} and ${rows[0].length} column${rows[0].length === 1 ? "" : "s"}: ${rows[0].slice(0, 30).join(", ")}.`;
}

/** Split text into chunks near `size` characters, breaking at paragraph or line ends, with a little overlap. */
export function chunkText(text, { size = 1200, overlap = 150, page = null } = {}) {
  const chunks = []; const clean = text.replace(/\r\n?/g, "\n").trim();
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(clean.length, start + size);
    if (end < clean.length) {
      const window = clean.slice(start + size * 0.6, end);
      const cut = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf("\n"), window.lastIndexOf(". "));
      if (cut > 0) end = start + size * 0.6 + cut + 1;
    }
    const piece = clean.slice(start, end).trim();
    if (piece) chunks.push({ page, text: piece });
    if (end >= clean.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks;
}

/**
 * Build the record kept for an attached document.
 * input: { name, size, type?, text } for text-like files, or { name, size, pages:[{page,text}] } for PDFs.
 */
export function buildDocument({ id, name, size, kind, text, pages, now = Date.now() }) {
  let chunks, full, pageCount = null;
  if (pages) {
    pageCount = pages.length;
    full = pages.map((p) => `[Page ${p.page}]\n${p.text}`).join("\n\n");
    chunks = pages.flatMap((p) => chunkText(p.text, { page: p.page }));
  } else {
    full = text; chunks = chunkText(text);
  }
  const summary = kind === "text" && /\.(csv|tsv)$/i.test(name) ? describeTable(text, name) : "";
  chunks = chunks.map((c, i) => ({ id: `${id}:${i}`, docId: id, ...c }));
  return { id, name, size, kind, addedAt: now, pages: pageCount, chars: full.length, summary, text: full, chunks };
}

/**
 * Decide what the model is told about the documents for one question.
 *  - everything fits in `budgetTokens`: the whole text goes in, in the message the file was attached to
 *  - otherwise: the passages that best match the question go in, numbered so the answer can cite them
 * docs: [{ id, name, text, chunks, pages }]; returns { mode, fullText:{id:text}, excerpts:[{n,docId,chunkId,name,page,text}], omitted }
 */
export function planContext(docs, query, { budgetTokens = 1800, maxExcerpts = 6, library = false } = {}) {
  if (!docs.length) return { mode: "none", fullText: {}, excerpts: [], omitted: 0 };
  const total = docs.reduce((n, d) => n + d.text.length, 0);
  if (!library && estimateTokens(total) <= budgetTokens) {
    return { mode: "full", fullText: Object.fromEntries(docs.map((d) => [d.id, d.summary ? `${d.summary}\n\n${d.text}` : d.text])), excerpts: [], omitted: 0 };
  }
  const chunks = docs.flatMap((d) => d.chunks.map((c) => ({ ...c, name: d.name })));
  const hits = rank(buildIndex(chunks), query, { k: maxExcerpts * 2 });
  const excerpts = []; let used = 0, omitted = 0;
  for (const h of hits) {
    const cost = estimateTokens(h.chunk.text.length) + 8;
    if (excerpts.length >= maxExcerpts || used + cost > budgetTokens) { omitted++; continue; }
    used += cost;
    excerpts.push({ n: excerpts.length + 1, docId: h.chunk.docId, chunkId: h.chunk.id, name: h.chunk.name, page: h.chunk.page, text: h.chunk.text });
  }
  const note = Object.fromEntries(docs.map((d) => [d.id, `(${d.name} is long${d.pages ? `, ${d.pages} pages` : ""}: only the passages relevant to the question are supplied in the instructions.)`]));
  return { mode: library ? "library" : "excerpts", fullText: library ? {} : note, excerpts, omitted };
}

export const CITATION_RULES = "Use only the supplied document text to answer questions about the documents. When you rely on a passage, cite it with its number in square brackets, like [1]. If the documents do not contain the answer, say so instead of guessing.";
export function excerptPreamble(excerpts) {
  if (!excerpts.length) return "";
  return `${CITATION_RULES}\n\n` + excerpts.map((e) => `[${e.n}] ${e.name}${e.page ? `, page ${e.page}` : ""}:\n${e.text}`).join("\n\n");
}
export const FULL_TEXT_RULES = "The user attached files; their text appears in the user's message. Answer from that text. If a file came from a PDF, name the page like (p. 3) when you quote it, and say so when the files do not contain the answer.";

/** Which numbered sources an answer actually cites. */
export function citedNumbers(answer) {
  return [...new Set([...String(answer).matchAll(/\[(\d{1,2})\]/g)].map((m) => Number(m[1])))];
}
