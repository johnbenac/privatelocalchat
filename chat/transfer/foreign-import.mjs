// Conversion of other chatbots' data exports into this app's threads. Only text transfers; the result says what did not.
import { normalizeThread, newId } from "../threads.mjs";

const toMs = (v) => { if (typeof v === "number") return v < 1e11 ? Math.round(v * 1000) : v; const t = Date.parse(v); return Number.isFinite(t) ? t : undefined; };
const textOfParts = (parts, report) => {
  const out = [];
  for (const p of parts ?? []) {
    if (typeof p === "string") { if (p) out.push(p); }
    else if (p && typeof p === "object") {
      if (typeof p.text === "string" && p.text) out.push(p.text);
      else { report.omitted++; }
    }
  }
  return out.join("\n\n");
};

function chatgptThread(c, report) {
  const mapping = c.mapping || {};
  const chain = []; let id = c.current_node ?? Object.keys(mapping).find((k) => !(mapping[k].children || []).length);
  const seen = new Set();
  while (id && mapping[id] && !seen.has(id)) { seen.add(id); chain.push(mapping[id]); id = mapping[id].parent; }
  const messages = [];
  for (const node of chain.reverse()) {
    const m = node.message; if (!m || m.metadata?.is_visually_hidden_from_conversation) continue;
    const role = m.author?.role; if (role !== "user" && role !== "assistant") { if (role === "tool") report.omitted++; continue; } // hidden system scaffolding is not the user's content
    const content = m.content?.content_type === "text" || m.content?.parts ? textOfParts(m.content.parts, report) : "";
    if (!content.trim()) continue;
    messages.push({ role, content, at: toMs(m.create_time) });
  }
  return { id: newId(), title: c.title || "Imported chat", messages, createdAt: toMs(c.create_time), updatedAt: toMs(c.update_time) };
}

function claudeThread(c, report) {
  const messages = [];
  for (const m of c.chat_messages || []) {
    const role = m.sender === "human" ? "user" : m.sender === "assistant" ? "assistant" : null; if (!role) continue;
    let content = Array.isArray(m.content) && m.content.length ? m.content.filter((p) => p?.type === "text").map((p) => p.text).join("\n\n") : (m.text || "");
    if (Array.isArray(m.content)) report.omitted += m.content.filter((p) => p && p.type && p.type !== "text").length;
    for (const a of m.attachments || []) { if (a.extracted_content) content += `\n\n[Attached file: ${a.file_name || "file"}]\n${a.extracted_content}`; else report.omitted++; }
    report.omitted += (m.files || []).length;
    if (!content.trim()) continue;
    messages.push({ role, content, at: toMs(m.created_at) });
  }
  return { id: newId(), title: c.name || "Imported chat", messages, createdAt: toMs(c.created_at), updatedAt: toMs(c.updated_at) };
}

/** -> { format, threads, omitted, skippedChats } or null when the data is not a recognised export. */
export function convertForeign(data) {
  const list = Array.isArray(data) ? data : null;
  if (!list?.length || typeof list[0] !== "object" || !list[0]) return null;
  const report = { omitted: 0 };
  let format = null, make;
  if (list[0].mapping && typeof list[0].mapping === "object") { format = "ChatGPT"; make = chatgptThread; }
  else if (Array.isArray(list[0].chat_messages)) { format = "Claude"; make = claudeThread; }
  if (!format) return null;
  const threads = []; let skippedChats = 0;
  for (const c of list) { const raw = make(c, report); const t = normalizeThread(raw); if (t && t.messages.length) threads.push(t); else skippedChats++; }
  return { format, threads, omitted: report.omitted, skippedChats };
}

export const describeForeign = (r) => `${r.format} export: ${r.threads.length} conversation${r.threads.length === 1 ? "" : "s"} with ${r.threads.reduce((n, t) => n + t.messages.length, 0)} messages. Text and any extracted text of attached files transfer. ` +
  (r.omitted ? `${r.omitted} image, file, tool or other non-text item${r.omitted === 1 ? "" : "s"} cannot be imported. ` : "") + (r.skippedChats ? `${r.skippedChats} empty conversation${r.skippedChats === 1 ? "" : "s"} skipped.` : "");
