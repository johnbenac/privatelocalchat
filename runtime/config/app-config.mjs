// What the app is configured with, and nothing else (docs/APP-CONFIG.md).
//
// The shipped defaults are `app-config.json`; an operator's choices are `config/app-config.json`. The build checks them, applies the operator's file, and writes the result
// into index.html as `window.APP_CONFIG`. This module is the only code that knows the shape: where model files come from is asked of it, never written into the app.
//
//   { "format": "plc-app-config/1", "modelSources": [ { "id": "project-cdn", "label": "...", "base": "<an https:// address or a path>" } ] }
//
// `base` is the root that holds `<name>/<revision>/<files>` (the bucket's layout): an https:// address, or a path on the copy's own host. The first source is used; the others are
// validated and reserved. Every file from every source is still checked against the size and SHA-256 pinned in the app.
export const CONFIG_FORMAT = "plc-app-config/1";
const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const isPath = (v) => /^\/(?!\/)[^\s\\]*$/.test(v);
const isHttps = (v) => /^https:\/\/[^\s/\\]+[^\s\\]*$/.test(v);
const withSlash = (v) => (v.endsWith("/") ? v : v + "/");

/** True for an address that may be a source root: an https:// address or a path on this host, of a sane length. */
export const validBase = (v) => typeof v === "string" && v.length > 0 && v.length <= 2000 && (isPath(v) || isHttps(v));

/** The problems in a configuration, for the build to refuse it with. Empty means fine. */
export function checkAppConfig(raw) {
  const problems = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return ["The configuration must be an object."];
  for (const key of Object.keys(raw)) if (!["format", "modelSources"].includes(key)) problems.push(`"${key}" is not a setting this app knows (format, modelSources).`);
  if (raw.format !== CONFIG_FORMAT) problems.push(`format must be "${CONFIG_FORMAT}".`);
  if (!Array.isArray(raw.modelSources) || raw.modelSources.length === 0) { problems.push("modelSources must be a list with at least one source."); return problems; }
  const seen = new Set();
  raw.modelSources.forEach((s, i) => {
    const at = `modelSources[${i}]`;
    if (!s || typeof s !== "object" || Array.isArray(s)) { problems.push(`${at} must be an object.`); return; }
    for (const key of Object.keys(s)) if (!["id", "label", "base"].includes(key)) problems.push(`${at}: "${key}" is not a source setting (id, label, base).`);
    if (typeof s.id !== "string" || !ID.test(s.id)) problems.push(`${at}.id must be lower-case letters, digits and hyphens.`);
    else if (seen.has(s.id)) problems.push(`${at}.id "${s.id}" is used twice.`); else seen.add(s.id);
    if (typeof s.label !== "string" || !s.label.trim() || s.label.length > 80) problems.push(`${at}.label must be a short text.`);
    if (!validBase(s.base)) problems.push(`${at}.base must be an https:// address or a path on this host (starting with a single /).`);
  });
  return problems;
}

/** The sources of a configuration, leniently: only the valid entries, each base ending in "/". */
export function readSources(raw) {
  const list = raw && typeof raw === "object" && Array.isArray(raw.modelSources) ? raw.modelSources : [];
  return list.filter((s) => s && typeof s === "object" && typeof s.id === "string" && ID.test(s.id) && typeof s.label === "string" && s.label.trim() && validBase(s.base))
    .map((s) => Object.freeze({ id: s.id, label: s.label.trim(), base: withSlash(s.base) }));
}

/**
 * The configuration as the build writes it into the page: the shipped defaults, with the operator's `modelSources` replacing them whole when there are any (the list is never
 * merged entry by entry). `overridden` says which it is, so the app can tell the shipped source from an operator's without comparing addresses.
 */
export function buildAppConfig(defaults, override = null) {
  const bad = checkAppConfig(defaults);
  if (bad.length) throw new Error("app-config.json has problems:\n - " + bad.join("\n - "));
  if (override === null || override === undefined) return { format: CONFIG_FORMAT, modelSources: readSources(defaults).map((s) => ({ ...s })), overridden: false };
  const worse = checkAppConfig({ format: CONFIG_FORMAT, ...override });
  if (worse.length) throw new Error("config/app-config.json has problems:\n - " + worse.join("\n - "));
  return { format: CONFIG_FORMAT, modelSources: readSources(override).map((s) => ({ ...s })), overridden: true };
}

/**
 * The configuration of this copy. Nothing is assumed: without `window.APP_CONFIG` (a worker, or a test that has not installed one) there are no sources and `modelRoot()` throws
 * with the reason, instead of quietly using an address of ours.
 */
export function appConfig(raw = globalThis.APP_CONFIG) {
  const sources = readSources(raw);
  const overridden = Boolean(raw && raw.overridden === true);
  const absolute = (base) => { try { const origin = globalThis.location?.origin; return origin && origin !== "null" ? new URL(base, origin).href : base; } catch { return base; } };
  const active = () => sources[0] || null;
  return {
    sources,
    overridden,
    activeSource: active,
    isDefaultSource: () => sources.length > 0 && !overridden,
    /** The root that holds <name>/<revision>/<files>, absolute when the page knows its own origin. */
    modelRoot() {
      const a = active();
      if (!a) throw new Error("No model source is configured (window.APP_CONFIG is missing or has none). The build writes it from app-config.json.");
      return absolute(a.base);
    }
  };
}
