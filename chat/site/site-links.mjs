// Where the pages of the site that serves this copy are, and nothing else (docs/PLAN, stage 3).
//
// The app never names one of our pages itself. A copy that is served with a site manifest (`site.json`, written into index.html by the build as `window.SITE_LINKS`)
// links to the pages it lists; a copy without one links to none, and every surface leaves the link out. This module is the only place that knows the shape.
//
//   site.json:  { "format": "plc-site/1", "pages": { "help": "/help/", ... },
//                 "site": { "url": "https://example.org/", "socialImage": "/brand/card.png", "countsPageLoads": true } }
//
// A page value is a path on the same host or an absolute https:// address. Anything else, or a missing key, means that page does not exist for this copy.
// `site` is the identity of the site that serves this copy: its public address (the page head, the Share entry points), the picture shown when it is shared, and whether its host counts
// page loads (what the assistant says about tracking). A copy without it names no site: no address in the head, nothing to share, and no statement about a host.
export const SITE_FORMAT = "plc-site/1";
export const PAGES = Object.freeze(["help", "about", "privacy", "updates"]);
const SITE_KEYS = ["url", "socialImage", "countsPageLoads"];
// an origin with a trailing slash, and a plain path to an image: no quotes, spaces, brackets or anything else that could end an attribute or a string in the page head
const validSiteUrl = (v) => typeof v === "string" && v.length <= 200 && /^https:\/\/[A-Za-z0-9.-]+(:\d{1,5})?\/$/.test(v);
const validImagePath = (v) => typeof v === "string" && v.length <= 200 && /^\/[A-Za-z0-9._\/-]+$/.test(v) && !v.includes("..");

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

/** The identity of the site, leniently: null unless it has a valid address. */
export function readSiteInfo(raw) {
  const s = raw && typeof raw === "object" && raw.site && typeof raw.site === "object" && !Array.isArray(raw.site) ? raw.site : null;
  if (!s || !validSiteUrl(s.url)) return null;
  return Object.freeze({ url: s.url, host: new URL(s.url).host, socialImage: validImagePath(s.socialImage) ? s.socialImage : null, countsPageLoads: s.countsPageLoads === true });
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
  if (raw.site !== undefined) {
    const s = raw.site;
    if (!s || typeof s !== "object" || Array.isArray(s)) problems.push("site must be an object.");
    else {
      for (const key of Object.keys(s)) if (!SITE_KEYS.includes(key)) problems.push(`site: "${key}" is not a setting this app knows (${SITE_KEYS.join(", ")}).`);
      if (!validSiteUrl(s.url)) problems.push("site.url must be the public address of the site: https://host/ with nothing after the slash.");
      if (s.socialImage !== undefined && !validImagePath(s.socialImage)) problems.push("site.socialImage must be a path to an image on that site, such as /brand/card.png.");
      if (s.countsPageLoads !== undefined && typeof s.countsPageLoads !== "boolean") problems.push("site.countsPageLoads must be true or false.");
    }
  }
  return problems;
}

/** The manifest as the build writes it into the page: validated, so the page and the inline script can trust it. */
export function normalizedSiteLinks(raw) {
  const info = readSiteInfo(raw);
  return { format: SITE_FORMAT, pages: { ...readSiteLinks(raw) }, ...(info ? { site: { ...info } } : {}) };
}

/**
 * The links of this copy. `has(page)` says whether the page exists here; `href(page, anchor)` gives its address with an optional #anchor, or null when it does not exist,
 * so a caller draws nothing for null. Reading the global `SITE_LINKS` (window.SITE_LINKS in a page) at call time lets tests set it.
 */
export function siteLinks(raw = globalThis.SITE_LINKS) {
  const pages = readSiteLinks(raw);
  const href = (page, anchor) => {
    const base = pages[page];
    if (!base) return null;
    if (!anchor) return base;
    return base.replace(/#.*$/, "") + "#" + encodeURIComponent(anchor);
  };
  return { has: (page) => Boolean(pages[page]), href, pages, site: readSiteInfo(raw) };
}
