// Where the pages of the site that serves this copy are, and nothing else (docs/PLAN, stage 3).
//
// The app never names one of our pages itself. A copy that is served with a site manifest (`site.json`, written into index.html by the build as `window.SITE_LINKS`)
// links to the pages it lists; a copy without one links to none, and every surface leaves the link out. This module is the only place that knows the shape.
//
//   site.json:  { "format": "plc-site/1", "pages": { "help": "/help/", "about": "/about/", "privacy": "/privacy/", "updates": "/updates/" } }
//
// A value is a path on the same host or an absolute https:// address. Anything else, or a missing key, means that page does not exist for this copy.
export const SITE_FORMAT = "plc-site/1";
export const PAGES = Object.freeze(["help", "about", "privacy", "updates"]);

const isPath = (v) => /^\/(?!\/)[^\s\\]*$/.test(v);
const isHttps = (v) => /^https:\/\/[^\s/\\]+[^\s\\]*$/.test(v);
/** True for a value that may name a page: a same-host path or an absolute https address, of a sane length. */
export const validTarget = (v) => typeof v === "string" && v.length > 0 && v.length <= 2000 && (isPath(v) || isHttps(v));

/** What a manifest says, leniently: only the known pages with a valid target. A broken or newer manifest says nothing. */
export function readSiteLinks(raw) {
  const pages = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return Object.freeze(pages);
  if (raw.format !== undefined && raw.format !== SITE_FORMAT) return Object.freeze(pages);
  const given = raw.pages && typeof raw.pages === "object" && !Array.isArray(raw.pages) ? raw.pages : {};
  for (const page of PAGES) if (validTarget(given[page])) pages[page] = given[page];
  return Object.freeze(pages);
}

/** The problems in a manifest, for the build to refuse it with: unknown pages, invalid targets, a format this build does not read. Empty means fine. */
export function checkSiteJson(raw) {
  const problems = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return ["site.json must be an object."];
  if (raw.format !== SITE_FORMAT) problems.push(`format must be "${SITE_FORMAT}".`);
  const pages = raw.pages;
  if (!pages || typeof pages !== "object" || Array.isArray(pages)) { problems.push("pages must be an object."); return problems; }
  for (const [name, target] of Object.entries(pages)) {
    if (!PAGES.includes(name)) problems.push(`"${name}" is not a page this app knows (${PAGES.join(", ")}).`);
    else if (!validTarget(target)) problems.push(`pages.${name} must be a path on this host (starting with a single /) or an https:// address.`);
  }
  return problems;
}

/** The manifest as the build writes it into the page: validated, so the page and the inline script can trust it. */
export const normalizedSiteLinks = (raw) => ({ format: SITE_FORMAT, pages: { ...readSiteLinks(raw) } });

/**
 * The links of this copy. `has(page)` says whether the page exists here; `href(page, anchor)` gives its address with an optional #anchor, or null when it does not exist,
 * so a caller draws nothing for null. Reading `window.SITE_LINKS` at call time lets tests set it.
 */
export function siteLinks(raw = globalThis.window?.SITE_LINKS) {
  const pages = readSiteLinks(raw);
  const href = (page, anchor) => {
    const base = pages[page];
    if (!base) return null;
    if (!anchor) return base;
    return base.replace(/#.*$/, "") + "#" + encodeURIComponent(anchor);
  };
  return { has: (page) => Boolean(pages[page]), href, pages };
}
