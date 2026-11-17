// What this version understands of each stored format, and what a browser's stored data says about the versions that wrote it
// (docs/DATA-COMPATIBILITY.md).
//
// Every key in key-classes.mjs has a `format`: the highest format of its value this version reads and writes. A browser keeps a small plain
// record, `plc.formats.v1`, of the highest format of each store that any version has used there. A version that finds a store marked
// higher than it understands leaves that store exactly as it is: it can still read it, but it never writes to it or removes it.
//
// A change to a stored format raises the number in the key table and ships in two releases (docs/DATA-COMPATIBILITY.md). The functions here are
// pure: they take the storage they read from and the key table, and touch nothing else.
import { KEY_CLASSES } from "./key-classes.mjs";

export const REGISTRY_KEY = "plc.formats.v1";
const STAMPED = new Set(["user", "setting"]); // the stores that hold what the person keeps or chose

/** A key named ...vN is version N of a store called ...; a store may move to a new key name instead of changing in place. */
export const familyOf = (key) => String(key).replace(/\.v\d+$/, "");
export const versionOf = (key) => { const m = /\.v(\d+)$/.exec(String(key)); return m ? Number(m[1]) : null; };

/** The highest format this version understands for a key, or null when the key is not one of ours. */
export const supportedFormat = (key) => KEY_CLASSES[key]?.format ?? null;

/** { formats: { key: n }, app } from the stored text, or null when there is no usable record. */
export function parseRegistry(text) {
  if (!text) return null;
  let value;
  try { value = JSON.parse(text); } catch { return null; }
  if (!value || typeof value !== "object" || !value.formats || typeof value.formats !== "object") return null;
  const formats = {};
  for (const [key, n] of Object.entries(value.formats)) if (Number.isInteger(n) && n >= 1) formats[key] = n;
  return { formats, app: value.app && typeof value.app === "object" ? value.app : null };
}

/** The known keys of a family, with the highest version number among them. */
function familyMembers(family) {
  const members = Object.keys(KEY_CLASSES).filter((k) => familyOf(k) === family && versionOf(k) !== null);
  return { members, highest: members.reduce((n, k) => Math.max(n, versionOf(k)), 0) };
}

/**
 * Which stores hold data from a newer version than this one understands.
 * `registry` is parseRegistry's result (or null); `storedKeys` are the keys actually present in local storage.
 * -> { blocked: [keys this version must not write to], notes: [{ key, found, understood }], unknown: [names this version has never heard of] }
 */
export function findNewer({ registry = null, storedKeys = [] } = {}) {
  const blocked = new Set(), notes = [], unknown = [];
  const consider = (name, found, source) => {
    const known = KEY_CLASSES[name];
    if (known) {
      if (found > known.format) { blocked.add(name); notes.push({ key: name, found, understood: known.format, source }); }
      return;
    }
    const family = familyOf(name), version = versionOf(name);
    const { members, highest } = familyMembers(family);
    if (version !== null && members.length && version > highest) {
      for (const member of members) blocked.add(member);
      notes.push({ key: family, found: version, understood: highest, source });
    } else if (version !== null && !members.length) unknown.push(name);
  };
  if (registry) for (const [name, n] of Object.entries(registry.formats)) consider(name, n, "record");
  for (const name of storedKeys) if (String(name).startsWith("plc.") && !KEY_CLASSES[name]) consider(name, versionOf(name) ?? 1, "key");
  return { blocked: [...blocked].sort(), notes, unknown: [...new Set(unknown)].sort() };
}

/**
 * The record to store after this version has started: every store this version manages at the highest format any version has used,
 * never lower than what is already recorded. Returns the text to store, or null when the stored record is already right.
 */
export function stampedRegistry({ current = null, blocked = [], app = null } = {}) {
  const formats = { ...(current?.formats || {}) };
  for (const [key, info] of Object.entries(KEY_CLASSES)) {
    if (!STAMPED.has(info.class) || blocked.includes(key)) continue;
    formats[key] = Math.max(formats[key] || 0, info.format);
  }
  const sorted = Object.fromEntries(Object.keys(formats).sort().map((k) => [k, formats[k]]));
  const same = current && JSON.stringify(current.formats) === JSON.stringify(sorted) && JSON.stringify(current.app || null) === JSON.stringify(app || null);
  return same ? null : JSON.stringify({ v: 1, formats: sorted, app: app || null });
}

/** A short, plain name for a store, for the message the person reads. */
const LABELS = {
  chatThreads: "chats", memory: "memory", folders: "projects", presets: "prompt presets", drafts: "unsent drafts", prefs: "preferences", models: "model choices",
  voice: "voice settings", activeThread: "the open chat", "shell.pins": "pinned items", inferenceMode: "the chat mode", modelMemory: "model memory settings",
  chatConfig: "provider settings", chatModels: "provider settings", chatEndpointTokens: "API keys"
};
export function describeStore(key) {
  return LABELS[familyOf(key).replace(/^plc\./, "")] || "saved data";
}
