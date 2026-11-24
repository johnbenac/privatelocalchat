import { normalizeSources } from "../../runtime/providers/sources-core.mjs";

function sourceError(code, message) {
  return Object.assign(new Error(message), { name: "SourceError", code });
}

export function personalSource({ id, label, base, credential = false }) {
  if (typeof id !== "string" || !/^[a-z0-9-]{1,80}$/.test(id)) {
    throw sourceError("source-id", "The source ID is invalid.");
  }
  label = typeof label === "string" ? label.trim() : "";
  if (!label || label.length > 80) throw sourceError("source-label", "Enter a source name of up to 80 characters.");
  let url;
  try {
    url = new URL(base);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) {
      throw new Error();
    }
    // Canonicalize the endpoint and reject URLs carrying credentials before saving.
    const [source] = normalizeSources([{ id, label, base: url.href, credentialScope: "endpoint" }]);
    return { id, label, base: source.base, credential: credential === true };
  } catch {
    throw sourceError("source-address", "Enter a secure source address without credentials or a fragment.");
  }
}

export function editPersonalSources(sources, edit) {
  if (edit.kind === "add") {
    const source = personalSource(edit.source);
    if (sources.some(({ id, base }) => id === source.id || base === source.base)) {
      throw sourceError("source-duplicate", "This source is already in your list.");
    }
    return [...sources, source];
  }
  const index = sources.findIndex(({ id }) => id === edit.id);
  if (index === -1) throw sourceError("source-missing", "This source is no longer in your list.");
  if (edit.kind === "remove") return sources.filter(({ id }) => id !== edit.id);
  if (edit.kind !== "move" || ![-1, 1].includes(edit.direction)) {
    throw sourceError("source-edit", "The source edit is invalid.");
  }
  const nextIndex = index + edit.direction;
  if (nextIndex < 0 || nextIndex >= sources.length) return sources;
  const next = [...sources];
  [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
  return next;
}

export function runtimeSources(sources) {
  return sources.map(({ id, label, base, credential }) => ({
    id, label, base,
    credentialScope: "endpoint",
    credentials: credential ? "request" : "none",
  }));
}

export const PERSONAL_SOURCE_KEY = "plc.personalModelSources.v1";

export function readPersonalSources(storage) {
  const raw = storage.getItem(PERSONAL_SOURCE_KEY);
  if (raw === null) return [];
  const sources = JSON.parse(raw);
  if (!Array.isArray(sources)) throw sourceError("source-format", "The saved source list could not be read.");
  return sources.reduce((list, source) => editPersonalSources(list, { kind: "add", source }), []);
}

export async function savePersonalSourceEdit({ storage, locks, commit }, edit) {
  if (!locks?.request) throw sourceError("source-lock", "This browser cannot safely edit saved model sources.");
  return locks.request(PERSONAL_SOURCE_KEY, async () => {
    const sources = editPersonalSources(readPersonalSources(storage), edit);
    await commit(JSON.stringify(sources));
    return sources;
  });
}
