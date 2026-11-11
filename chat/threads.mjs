// Conversation model: pure functions over plain thread objects (stored as JSON), tested in Node.
//
// thread  { id, title, systemPrompt, messages[], createdAt, updatedAt, pinned?, archived?, deletedAt?, folderId?, temporary?,
//           summary? { text, upTo } }
// message { id, role, content, at, status?, error?, notice?, excluded?, versions?, versionIndex?, attachments?, sources?, voiceNote?, voice? }
//   voiceNote: an assistant reply shown as a playable voice note (the words stay underneath); voice: { seconds } on a message you recorded
//   by voice (only the transcript is kept, never audio)
//   status: complete | streaming | stopped | failed | length | interrupted   (assistant messages; absent = complete)
//   versions: every answer produced for the same prompt; `content` always mirrors the version being shown.

export const STATUS = Object.freeze({ COMPLETE: "complete", PREPARING: "preparing", STREAMING: "streaming", STOPPED: "stopped", FAILED: "failed", LENGTH: "length", INTERRUPTED: "interrupted" });
export const CONTINUABLE = new Set([STATUS.STOPPED, STATUS.LENGTH, STATUS.INTERRUPTED, STATUS.FAILED]);

export const newId = () => `${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 10)}`;
const str = (v, fallback = "") => (typeof v === "string" ? v : fallback);
const num = (v, fallback) => (Number.isFinite(v) ? v : fallback);
const ROLES = new Set(["system", "user", "assistant"]);

// Fields this build does not know are kept, not dropped, so a chat that passed through a newer version (or a file made by one) comes out whole when it is saved or exported again.
// Only plain data is kept, and a limited amount of it; the fields this build handles itself are never copied from here.
const THREAD_FIELDS = new Set(["id", "title", "systemPrompt", "messages", "createdAt", "updatedAt", "pinned", "archived", "temporary", "deletedAt", "folderId", "summary", "presetId", "canvas"]);
const MESSAGE_FIELDS = new Set(["id", "role", "content", "at", "notice", "excluded", "status", "error", "errorKind", "versions", "versionIndex", "model", "sources", "tools", "voiceNote", "voice", "local", "attachments"]);
const MAX_EXTRA_KEYS = 40, MAX_EXTRA_BYTES = 20000;
function keepUnknown(raw, known, out) {
  let kept = 0, bytes = 0;
  for (const key of Object.keys(raw)) {
    if (known.has(key) || key === "__proto__" || key === "constructor" || key === "prototype" || kept >= MAX_EXTRA_KEYS) continue;
    let text; try { text = JSON.stringify(raw[key]); } catch { continue; }
    if (text === undefined || bytes + text.length > MAX_EXTRA_BYTES) continue;
    out[key] = JSON.parse(text); kept++; bytes += text.length;
  }
  return out;
}

export function normalizeMessage(raw, at = Date.now()) {
  if (!raw || typeof raw !== "object" || !ROLES.has(raw.role) || typeof raw.content !== "string") return null;
  const m = { id: str(raw.id) || newId(), role: raw.role, content: raw.content, at: num(raw.at, at) };
  if (raw.notice === true) m.notice = true;
  if (raw.excluded === true) m.excluded = true;
  if (raw.role === "assistant") {
    let status = str(raw.status);
    if (status === STATUS.STREAMING || status === STATUS.PREPARING) status = STATUS.INTERRUPTED; // the page went away mid-answer: keep what was written
    if (status && status !== STATUS.COMPLETE && Object.values(STATUS).includes(status)) m.status = status;
    if (typeof raw.error === "string" && raw.error) m.error = raw.error.slice(0, 2000);
    if (raw.errorKind === "offline") m.errorKind = "offline"; // the failure was the connection, not the provider
    if (Array.isArray(raw.versions) && raw.versions.length > 1) {
      m.versions = raw.versions.map((v) => ({ content: str(v?.content), ...(v?.status && Object.values(STATUS).includes(v.status) && v.status !== STATUS.COMPLETE ? { status: v.status === STATUS.STREAMING || v.status === STATUS.PREPARING ? STATUS.INTERRUPTED : v.status } : {}), at: num(v?.at, m.at) }));
      m.versionIndex = Math.min(Math.max(0, num(raw.versionIndex, m.versions.length - 1) | 0), m.versions.length - 1);
      m.content = m.versions[m.versionIndex].content;
      const vs = m.versions[m.versionIndex].status; if (vs) m.status = vs; else delete m.status;
    }
    if (typeof raw.model === "string" && raw.model) m.model = raw.model.slice(0, 120);
    if (Array.isArray(raw.sources) && raw.sources.length) m.sources = raw.sources.filter((s) => s && typeof s === "object").slice(0, 50);
  }
  if (raw.role === "user" && Array.isArray(raw.tools) && raw.tools.length) m.tools = raw.tools.filter((t) => t && typeof t.label === "string" && typeof t.result === "string").slice(0, 6).map((t) => ({ kind: str(t.kind, "calc"), label: t.label.slice(0, 200), result: t.result.slice(0, 200) }));
  if (raw.role === "assistant" && raw.voiceNote === true) m.voiceNote = true;
  if (raw.role === "user" && raw.voice && typeof raw.voice === "object" && Number.isFinite(raw.voice.seconds)) m.voice = { seconds: Math.min(86400, Math.max(1, Math.round(raw.voice.seconds))) };
  if (raw.role === "assistant" && raw.local === true) m.local = true; // answered on this device by a built-in tool, not by the model
  if (Array.isArray(raw.attachments) && raw.attachments.length) m.attachments = raw.attachments.filter((a) => a && typeof a === "object" && typeof a.name === "string").slice(0, 50).map((a) => ({ ...a, name: a.name.slice(0, 200) }));
  return keepUnknown(raw, MESSAGE_FIELDS, m);
}

export function normalizeThread(raw, now = Date.now()) {
  if (!raw || typeof raw !== "object") return null;
  const messages = (Array.isArray(raw.messages) ? raw.messages : []).map((m) => normalizeMessage(m, now)).filter(Boolean);
  const t = {
    id: str(raw.id) || newId(), title: str(raw.title, "New chat"), systemPrompt: str(raw.systemPrompt), messages,
    createdAt: num(raw.createdAt, now), updatedAt: num(raw.updatedAt, num(raw.createdAt, now))
  };
  for (const flag of ["pinned", "archived", "temporary"]) if (raw[flag] === true) t[flag] = true;
  if (Number.isFinite(raw.deletedAt)) t.deletedAt = raw.deletedAt;
  if (typeof raw.folderId === "string" && raw.folderId) t.folderId = raw.folderId;
  if (raw.summary && typeof raw.summary.text === "string" && Number.isInteger(raw.summary.upTo) && raw.summary.upTo > 0) t.summary = { text: raw.summary.text, upTo: raw.summary.upTo };
  if (typeof raw.presetId === "string" && raw.presetId) t.presetId = raw.presetId;
  if (raw.canvas && typeof raw.canvas.text === "string") t.canvas = { text: raw.canvas.text.slice(0, 200000), updatedAt: num(raw.canvas.updatedAt, now) };
  return keepUnknown(raw, THREAD_FIELDS, t);
}

// ---- titles & ordering --------------------------------------------------------------------------------------------
const DEFAULT_TITLES = new Set(["", "new chat", "untitled"]);
export const hasDefaultTitle = (t) => DEFAULT_TITLES.has(str(t.title).trim().toLowerCase());

/** First line of the first prompt, trimmed to a readable length, without Markdown noise. */
export function deriveTitle(text, max = 48) {
  const line = str(text).split("\n").map((l) => l.trim()).find(Boolean) || "";
  const clean = line.replace(/^[#>*\-\s]+/, "").replace(/[`*_~]/g, "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max); const space = cut.lastIndexOf(" ");
  return (space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.\-–]+$/, "") + "…";
}

/** Pinned first, then most recently used. Archived and trashed chats are not in the main list. */
export function listThreads(threads, { archived = false, trashed = false } = {}) {
  return threads.filter((t) => (trashed ? t.deletedAt != null : t.deletedAt == null && Boolean(t.archived) === archived))
    .sort((a, b) => (trashed ? b.deletedAt - a.deletedAt : (b.pinned === true) - (a.pinned === true) || (b.updatedAt ?? 0) - (a.updatedAt ?? 0)));
}

export const touch = (thread, now = Date.now()) => { thread.updatedAt = now; return thread; };
export const TRASH_DAYS = 30;
export const purgeExpired = (threads, now = Date.now()) => threads.filter((t) => !(t.deletedAt != null && now - t.deletedAt > TRASH_DAYS * 864e5));

// ---- messages -----------------------------------------------------------------------------------------------------
export const findMessage = (thread, id) => thread.messages.find((m) => m.id === id);
export const indexOfMessage = (thread, id) => thread.messages.findIndex((m) => m.id === id);
export const lastVisible = (thread) => { for (let i = thread.messages.length - 1; i >= 0; i--) if (!thread.messages[i].notice) return thread.messages[i]; return null; };

export function makeMessage(role, content, extra = {}) {
  return { id: newId(), role, content, at: Date.now(), ...extra };
}

/** Start another answer to the same prompt; the previous answer stays reachable as an earlier version. */
export function beginNewVersion(msg) {
  if (!msg.versions) msg.versions = [{ content: msg.content, ...(msg.status ? { status: msg.status } : {}), at: msg.at }];
  msg.versions.push({ content: "", at: Date.now() });
  msg.versionIndex = msg.versions.length - 1;
  msg.content = ""; delete msg.error; delete msg.errorKind; msg.status = STATUS.STREAMING; msg.at = Date.now();
  return msg;
}

/** Keep `content`, `status` and the active version entry in step. */
export function syncActiveVersion(msg) {
  if (!msg.versions) return msg;
  const v = msg.versions[msg.versionIndex]; if (!v) return msg;
  v.content = msg.content; if (msg.status && msg.status !== STATUS.COMPLETE) v.status = msg.status; else delete v.status;
  return msg;
}

export function selectVersion(msg, index) {
  if (!msg.versions || index < 0 || index >= msg.versions.length) return false;
  syncActiveVersion(msg);
  msg.versionIndex = index; const v = msg.versions[index];
  msg.content = v.content; if (v.status) msg.status = v.status; else delete msg.status; delete msg.error; delete msg.errorKind;
  return true;
}

/**
 * Edit a prompt and drop everything after it (the caller regenerates). Returns the removed tail so the edit can be undone.
 * The earlier text of the edited prompt is returned too.
 */
export function editPrompt(thread, index, text) {
  const msg = thread.messages[index];
  if (!msg || msg.role !== "user") return null;
  const previous = { content: msg.content, attachments: msg.attachments, tail: thread.messages.splice(index + 1) };
  msg.content = text; msg.at = Date.now(); delete msg.attachments;
  if (previous.attachments) msg.attachments = previous.attachments;
  return previous;
}
export function undoEditPrompt(thread, index, previous) {
  const msg = thread.messages[index]; if (!msg) return false;
  msg.content = previous.content; if (previous.attachments) msg.attachments = previous.attachments; else delete msg.attachments;
  thread.messages.splice(index + 1, thread.messages.length, ...previous.tail);
  return true;
}

/** Messages that the model sees: the saved summary replaces the older part of the transcript, excluded ones are left out. */
export function contextMessages(thread) {
  const upTo = thread.summary?.upTo ?? 0;
  return thread.messages.map((m, i) => ({ m, i })).filter(({ m, i }) => i >= upTo && !m.excluded && !m.notice && !(m.role === "assistant" && (m.status === STATUS.STREAMING || m.status === STATUS.PREPARING))).map(({ m }) => m);
}

// ---- import -------------------------------------------------------------------------------------------------------
/** Accepts this app's history array or a { threads } backup object. Nothing is applied here. */
export function validateHistory(data, now = Date.now()) {
  const list = Array.isArray(data) ? data : Array.isArray(data?.threads) ? data.threads : null;
  if (!list) return { ok: false, error: "This file is not a chat history exported from this app.", threads: [], skipped: 0 };
  const threads = []; let skipped = 0;
  for (const raw of list) { const t = normalizeThread(raw, now); if (t && (t.messages.length || (raw && typeof raw.id === "string"))) threads.push(t); else skipped++; }
  if (!threads.length) return { ok: false, error: "The file does not contain any conversations.", threads: [], skipped };
  return { ok: true, threads, skipped };
}

const fingerprint = (t) => JSON.stringify([t.title, t.systemPrompt, t.messages.map((m) => [m.role, m.content])]);

/** Preview and perform a merge. Existing chats are never overwritten: a changed chat with a known id arrives as a copy. */
export function mergeThreads(existing, incoming, { replace = false } = {}) {
  if (replace) return { threads: incoming.slice(), added: incoming.length, duplicates: 0, copies: 0, removed: existing.length };
  const byId = new Map(existing.map((t) => [t.id, t])), seen = new Set(existing.map(fingerprint));
  const result = existing.slice(); let added = 0, duplicates = 0, copies = 0;
  for (const t of incoming) {
    const same = seen.has(fingerprint(t));
    if (same) { duplicates++; continue; }
    if (byId.has(t.id)) { const copy = { ...t, id: newId(), title: `${t.title} (imported)` }; result.push(copy); seen.add(fingerprint(copy)); copies++; added++; continue; }
    result.push(t); byId.set(t.id, t); seen.add(fingerprint(t)); added++;
  }
  return { threads: result, added, duplicates, copies, removed: 0 };
}

export const describeImport = (preview) => {
  const parts = [];
  if (preview.added) parts.push(`${preview.added} conversation${preview.added === 1 ? "" : "s"} will be added`);
  if (preview.copies) parts.push(`${preview.copies} will be added as copies because a different chat with the same identity exists`);
  if (preview.duplicates) parts.push(`${preview.duplicates} already here and will be skipped`);
  if (preview.removed) parts.push(`${preview.removed} current conversation${preview.removed === 1 ? "" : "s"} will be removed`);
  return parts.join("; ") || "Nothing to import.";
};

/** Duplicate a chat, optionally cutting it after a message (a branch). */
export function branchThread(thread, upToIndex = thread.messages.length - 1, now = Date.now()) {
  const copy = normalizeThread(JSON.parse(JSON.stringify(thread)), now);
  copy.id = newId(); copy.messages = copy.messages.slice(0, upToIndex + 1).map((m) => ({ ...m, id: newId() }));
  copy.title = upToIndex < thread.messages.length - 1 ? `${thread.title} (branch)` : `${thread.title} (copy)`;
  copy.createdAt = copy.updatedAt = now; delete copy.pinned; delete copy.archived; delete copy.deletedAt; delete copy.temporary;
  if (copy.summary && copy.summary.upTo > copy.messages.length) delete copy.summary;
  return copy;
}

/** A conversation as a Markdown document: title, system prompt, then every message numbered by role. */
export function threadToMarkdown(thread) {
  if (!thread) return '';
  const title = typeof thread.title === 'string' && thread.title.trim() ? thread.title.trim() : 'Untitled chat';
  const lines = [`# ${title}`];
  const prompt = typeof thread.systemPrompt === 'string' ? thread.systemPrompt.trim() : '';
  if (prompt) {
    lines.push('', '## System Prompt', '', prompt);
  }
  const messages = Array.isArray(thread.messages) ? thread.messages : [];
  if (messages.length) {
    lines.push('', '## Messages', '');
    messages.forEach((message, index) => {
      const rawRole = typeof message?.role === 'string' ? message.role.trim() : '';
      const role = rawRole ? rawRole.charAt(0).toUpperCase() + rawRole.slice(1) : 'Message';
      let content = '';
      if (message && typeof message.content === 'string') {
        content = message.content;
      } else if (message && message.content != null) {
        try {
          content = JSON.stringify(message.content, null, 2);
        } catch (err) {
          content = String(message.content);
        }
      }
      if (!content.trim()) {
        content = '_No content_';
      }
      lines.push(`### ${index + 1}. ${role}`, '', content, '');
    });
  } else {
    lines.push('', '_No messages yet._');
  }
  return lines.join('\n');
}
