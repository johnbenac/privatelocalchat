// A link from a discovery page that DESCRIBES a downloadable resource and never carries it (docs/contracts/discovery-opening/contract-request.md, agreed with the owner of the discovery pages):
//   https://<app address>/#resource=<base64url, UTF-8, no padding, of one JSON object>
//   { "v": 1, "family": "preset-candidate", "title": "…", "version": "1.0.0", "bytes": 149, "sha256": "<64 lower-case hex>", "license": "CC0-1.0", "page": "https://…" }
// Pure: no DOM, storage, network or clock. Opening such a link changes nothing and fetches nothing: the person downloads the file and chooses it, and checkResourceFile compares what was chosen with what the
// link said (size and SHA-256, exactly); only then does the family's own reader run, and only its Add adds anything. Like the preset link, the fragment is measured BEFORE it is split, decoded or parsed.
// readResourceFragment(hash) -> null (no resource in this address) | { ok: false, code, message } | { ok: true, resource }
// Lengths count UTF-16 code units (JavaScript length), as PLC's preset limits do. A page whose fragment would be over the bound leaves the link out and keeps the download link; it never cuts a field.

export const RESOURCE_KEY = "resource";
export const RESOURCE_LIMITS = Object.freeze({ valueChars: 2048, envelopeChars: 2048 + 256, title: 120, license: 120, page: 2048 });
/** The families a link may name, with the largest file each may be. A new family needs a new version of the discovery format (T452). */
export const RESOURCE_FAMILIES = Object.freeze({ "preset-candidate": Object.freeze({ maxBytes: 32768 }) });
export const RESOURCE_KEYS = Object.freeze(["v", "family", "title", "version", "bytes", "sha256", "license", "page"]);
const VERSION = /^[0-9A-Za-z][0-9A-Za-z._-]{0,63}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const BASE64URL = /^[A-Za-z0-9_-]*$/;
const BAD_LINE_TEXT = /[\u0000-\u001F\u007F-\u009F\u2028\u2029\u202A-\u202E\u2066-\u2069]/;
const SECRET_QUERY = /(token|secret|passw|passphrase|credential|authorization|api[-_ ]?key|bearer|private[-_ ]?key|cookie|session|signature|sig)/i;
const KEY_AT_START_OR_AFTER_AMP = new RegExp("(^|&)" + RESOURCE_KEY + "=");

const refuse = (code, message) => ({ ok: false, code, message });
const NOTHING = " Nothing was changed.";
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** A page address a person may be sent to read about a resource: https only, no credentials, no port, no fragment, no secret-looking query key, a real host name (not numeric, local or private). */
export function safePageAddress(value) {
  if (typeof value !== "string" || !value || value.length > RESOURCE_LIMITS.page || BAD_LINE_TEXT.test(value)) return false;
  let url; try { url = new URL(value); } catch { return false; }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash || value.includes("#")) return false;
  const host = url.hostname.toLowerCase();
  if (!host.includes(".") || /^[0-9.]+$/.test(host) || host.includes(":") || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".lan")) return false;
  for (const key of url.searchParams.keys()) if (SECRET_QUERY.test(key)) return false;
  return !SECRET_QUERY.test(decodeURIComponent(url.search.replace(/\+/g, " ")).split("&").map((p) => p.split("=")[0]).join("&"));
}

/** An object that is exactly a resource description, or the reason it is not. */
export function checkResource(value) {
  if (!isObject(value)) return refuse("not-an-object", "This link does not describe a resource." + NOTHING);
  const keys = Object.keys(value);
  const extra = keys.find((k) => !RESOURCE_KEYS.includes(k));
  if (extra !== undefined) return refuse("unknown-field", "This link has a field this version does not understand." + NOTHING);
  if (RESOURCE_KEYS.some((k) => !keys.includes(k))) return refuse("missing", "This link is missing part of what it should describe." + NOTHING);
  if (value.v !== 1) return refuse("version", "This link is from a newer version of the discovery format than this app reads." + NOTHING);
  const family = Object.prototype.hasOwnProperty.call(RESOURCE_FAMILIES, value.family) ? RESOURCE_FAMILIES[value.family] : null;
  if (!family) return refuse("family", "This link names a kind of resource this app does not open yet." + NOTHING);
  for (const [k, max] of [["title", RESOURCE_LIMITS.title], ["license", RESOURCE_LIMITS.license]]) {
    if (typeof value[k] !== "string" || !value[k].trim() || value[k].length > max || BAD_LINE_TEXT.test(value[k])) return refuse("bad-" + k, "This link has a " + k + " that cannot be shown safely." + NOTHING);
  }
  if (typeof value.version !== "string" || !VERSION.test(value.version)) return refuse("bad-version", "This link has a version that is not usable." + NOTHING);
  if (!Number.isInteger(value.bytes) || value.bytes < 1 || value.bytes > family.maxBytes) return refuse("bad-bytes", "This link names a file size that this kind of resource cannot have." + NOTHING);
  if (typeof value.sha256 !== "string" || !SHA256.test(value.sha256)) return refuse("bad-sha256", "This link has a checksum that is not usable." + NOTHING);
  if (!safePageAddress(value.page)) return refuse("bad-page", "This link names a page that cannot be opened safely." + NOTHING);
  return { ok: true, resource: Object.freeze({ v: 1, family: value.family, title: value.title, version: value.version, bytes: value.bytes, sha256: value.sha256, license: value.license, page: value.page }) };
}

export function readResourceFragment(hash) {
  const fragment = String(hash || "").replace(/^#/, "");
  if (!KEY_AT_START_OR_AFTER_AMP.test(fragment)) return null;
  if (fragment.length > RESOURCE_LIMITS.envelopeChars) return refuse("too-large", "This link is too long to be a resource link." + NOTHING);
  const values = new URLSearchParams(fragment).getAll(RESOURCE_KEY);
  if (!values.length) return null;
  if (values.length > 1) return refuse("ambiguous", "This link names more than one resource." + NOTHING);
  const raw = values[0];
  if (raw.length > RESOURCE_LIMITS.valueChars) return refuse("too-large", "This link is too long to be a resource link." + NOTHING);
  if (!raw || !BASE64URL.test(raw) || raw.length % 4 === 1) return refuse("not-json", "This link does not carry a readable description of a resource." + NOTHING);
  let text;
  try {
    const binary = atob(raw.replace(/-/g, "+").replace(/_/g, "/"));
    text = new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
  } catch { return refuse("not-json", "This link does not carry a readable description of a resource." + NOTHING); }
  let value; try { value = JSON.parse(text); } catch { return refuse("not-json", "This link does not carry a readable description of a resource." + NOTHING); }
  return checkResource(value);
}

/** The link's fragment for one resource, in the canonical key order and compact JSON the discovery pages use; null when it would not fit (the page then offers no link, and never cuts a field). */
export function encodeResourceFragment(resource) {
  const ordered = {}; for (const k of RESOURCE_KEYS) ordered[k] = resource[k];
  const bytes = new TextEncoder().encode(JSON.stringify(ordered));
  let binary = ""; for (const b of bytes) binary += String.fromCharCode(b);
  const value = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return value.length > RESOURCE_LIMITS.valueChars ? null : "#" + RESOURCE_KEY + "=" + value;
}

/** Lower-case hex SHA-256 of bytes (Web Crypto). */
export async function sha256Hex(bytes) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  let out = ""; for (const b of digest) out += b.toString(16).padStart(2, "0");
  return out;
}

/** Is the file the person chose exactly the one the link described? Size first (cheap), then the checksum of the exact bytes. Any difference is a refusal that says what differed, never that the file is "bad". */
export async function checkResourceFile(resource, bytes, hash = sha256Hex) {
  if (!(bytes instanceof Uint8Array)) return refuse("unreadable", "The file could not be read." + NOTHING);
  if (bytes.length !== resource.bytes) return refuse("size", "This file is " + bytes.length + " bytes, but the listing says " + resource.bytes + ". It is not the file that was listed; choose the one downloaded from the page." + NOTHING);
  if ((await hash(bytes)) !== resource.sha256) return refuse("hash", "This file has the right size but a different checksum from the listing. It is not the file that was listed; choose the one downloaded from the page." + NOTHING);
  return { ok: true };
}
