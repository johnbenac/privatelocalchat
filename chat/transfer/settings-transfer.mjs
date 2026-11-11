// Settings transfer: move the three provider settings (endpoint, model, theme) to another browser through a link, a QR code or a file,
// with the API token optionally encrypted under a password the sender chooses.
//
//   {
//     "format": "plc-settings-transfer/2",
//     "settings": { "endpoint": "...", "model": "...", "theme": "dark" },       readable by anyone holding the package
//     "protectedToken": { "suite": "pbkdf2-sha256-aes256gcm/1", "salt": "...", "iv": "...", "ciphertext": "..." }   only when a token is included
//   }
//
// The password is used exactly as entered: its UTF-8 bytes, no trimming, no case folding, no Unicode normalisation, and any string (a
// single character, spaces, an empty string) is a valid password. That is deliberately different from the encrypted-backup and app-lock
// code in crypto.mjs, whose behaviour stays as it was so existing backups and locks keep opening.
//
// The plaintext token and the password exist only inside createTransfer() and unlockToken() while they run; nothing here stores them.

import { checkFormat, newerMessage } from "./file-formats.mjs";
export const TRANSFER_FORMAT = "plc-settings-transfer/2";
export const TOKEN_SUITE = "pbkdf2-sha256-aes256gcm/1";
export const PBKDF2_ITERATIONS = 600_000;
export const SALT_BYTES = 16, IV_BYTES = 12, TAG_BITS = 128;
export const MAX_JSON_BYTES = 64 * 1024;
/** Unpadded Base64URL length of the largest allowed package: checked before anything is decoded. */
export const MAX_ENCODED_LENGTH = Math.ceil((MAX_JSON_BYTES * 4) / 3);
export const TRANSFER_ORIGIN = "https://privatelocal.chat/";
const MAX_FIELD = 2048, MAX_TOKEN_BYTES = 4096;

const enc = new TextEncoder();
const subtle = () => globalThis.crypto.subtle;

// ---- Base64URL, unpadded ----------------------------------------------------------------------------------------------
const B64URL = /^[A-Za-z0-9_-]*$/;
export function toBase64Url(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function fromBase64Url(text) {
  if (typeof text !== "string" || !B64URL.test(text) || text.length % 4 === 1) throw new TypeError("not unpadded Base64URL");
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

// ---- endpoint identity ------------------------------------------------------------------------------------------------
/**
 * The identity of a provider destination: scheme, host, port, path and query of the parsed absolute URL. Trailing slashes and a
 * trailing /chat/completions are ignored (the app adds that itself), the fragment is dropped, and anything with embedded credentials or
 * a scheme other than http(s) has no identity. The same function decides which token a destination may use.
 */
export function endpointIdentity(endpoint) {
  if (typeof endpoint !== "string") return null;
  let url;
  try { url = new URL(endpoint.trim()); } catch { return null; }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password || !url.hostname) return null;
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length >= 2 && segments.at(-2) === "chat" && segments.at(-1) === "completions") segments.length -= 2;
  return url.origin + (segments.length ? "/" + segments.join("/") : "") + url.search;
}
export const sameDestination = (a, b) => { const x = endpointIdentity(a), y = endpointIdentity(b); return x !== null && x === y; };

// ---- settings allowlist -----------------------------------------------------------------------------------------------
const THEMES = new Set(["light", "dark"]);
/** The only fields that ever travel: endpoint, model, theme. Built field by field, never by copying an object. */
export function pickSettings(source) {
  const s = source && typeof source === "object" ? source : {};
  const endpoint = typeof s.endpoint === "string" ? s.endpoint.trim() : "";
  const model = typeof s.model === "string" ? s.model.trim() : "";
  const theme = THEMES.has(s.theme) ? s.theme : "";
  return { endpoint, model, theme };
}

/** The bytes the readable settings are bound to the token with (AES-GCM additionalData). */
export function authenticatedData(format, suite, endpoint, model, theme) {
  return enc.encode(JSON.stringify([format, suite, endpointIdentity(endpoint), model, theme || ""]));
}

// ---- key derivation ---------------------------------------------------------------------------------------------------
async function deriveKey(password, salt) {
  const material = await subtle().importKey("raw", enc.encode(String(password)), "PBKDF2", false, ["deriveKey"]);
  return subtle().deriveKey({ name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

async function protectToken(token, password, settings) {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(password, salt);
  const aad = authenticatedData(TRANSFER_FORMAT, TOKEN_SUITE, settings.endpoint, settings.model, settings.theme);
  const sealed = await subtle().encrypt({ name: "AES-GCM", iv, additionalData: aad, tagLength: TAG_BITS }, key, enc.encode(token));
  return { suite: TOKEN_SUITE, salt: toBase64Url(salt), iv: toBase64Url(iv), ciphertext: toBase64Url(sealed) };
}

const deepFreeze = (o) => { if (o && typeof o === "object") { Object.values(o).forEach(deepFreeze); Object.freeze(o); } return o; };

/**
 * Builds one immutable snapshot of what was reviewed: the envelope, its link, and the file text, all from the same bytes.
 * `password` may be any string, including "". Rejects (and creates nothing) when a token is requested but there is none, or when the
 * endpoint it must be bound to is not a usable address.
 */
export async function createTransfer({ settings, includeToken = false, token = "", password = "" } = {}) {
  const picked = pickSettings(settings);
  const envelope = { format: TRANSFER_FORMAT, settings: { endpoint: picked.endpoint, model: picked.model } };
  if (picked.theme) envelope.settings.theme = picked.theme;
  if (includeToken) {
    if (typeof token !== "string" || !token.trim()) throw Object.assign(new Error("There is no API token to include."), { code: "no-token" });
    if (endpointIdentity(picked.endpoint) === null) throw Object.assign(new Error("An API token can only be included for a valid endpoint address."), { code: "no-endpoint" });
    if (typeof password !== "string") throw Object.assign(new Error("The transfer password must be text."), { code: "bad-password-type" });
    const bytes = enc.encode(token.trim());
    if (bytes.length > MAX_TOKEN_BYTES) throw Object.assign(new Error("That API token is too long to transfer."), { code: "token-too-long" });
    envelope.protectedToken = await protectToken(token.trim(), password, picked);
  }
  const compact = JSON.stringify(envelope);
  if (enc.encode(compact).length > MAX_JSON_BYTES) throw Object.assign(new Error("These settings are too large to transfer."), { code: "too-large" });
  const encoded = toBase64Url(enc.encode(compact));
  return deepFreeze({
    envelope,
    includesToken: Boolean(envelope.protectedToken),
    encoded,
    url: `${TRANSFER_ORIGIN}#settings=${encoded}`,
    fileText: JSON.stringify(envelope, null, 2) + "\n",
    fileName: "private-local-chat-settings.json"
  });
}

// ---- reading ----------------------------------------------------------------------------------------------------------
const fail = (code, message) => ({ ok: false, code, message });
const isPlain = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

function readTokenEnvelope(raw) {
  if (raw === undefined) return { state: "absent" };
  if (!isPlain(raw)) return { state: "damaged", reason: "not-an-object" };
  if (typeof raw.suite !== "string") return { state: "damaged", reason: "no-suite" };
  if (raw.suite !== TOKEN_SUITE) return { state: "unsupported", reason: "suite", suite: raw.suite.slice(0, 80) };
  try {
    const salt = fromBase64Url(raw.salt), iv = fromBase64Url(raw.iv), sealed = fromBase64Url(raw.ciphertext);
    if (salt.length !== SALT_BYTES || iv.length !== IV_BYTES) return { state: "damaged", reason: "lengths" };
    if (sealed.length <= TAG_BITS / 8 || sealed.length > MAX_TOKEN_BYTES + TAG_BITS / 8) return { state: "damaged", reason: "ciphertext-length" };
  } catch { return { state: "damaged", reason: "encoding" }; }
  return { state: "locked", protectedToken: { suite: raw.suite, salt: raw.salt, iv: raw.iv, ciphertext: raw.ciphertext } };
}

/** Validates a parsed version 2 object. Settings and the token envelope are judged separately: a bad token never loses good settings. */
export function readEnvelope(raw) {
  if (!isPlain(raw)) return fail("malformed", "This is not a settings transfer.");
  if (typeof raw.format !== "string" || !raw.format.startsWith("plc-settings-transfer/")) return fail("unsupported-format", "This is not a Private Local Chat settings transfer.");
  if (raw.format !== TRANSFER_FORMAT) {
    // a number above this build's is a newer version: say so in the words used for every saved file; there is no earlier number of this format to read (earlier links and files are the legacy forms below)
    const c = checkFormat(raw);
    return c.state === "newer" ? fail("newer-format", newerMessage(c.label)) : fail("unsupported-version", "This settings transfer was made by a different version of the app and cannot be read here.");
  }
  const s = raw.settings;
  if (!isPlain(s)) return fail("invalid-settings", "The transfer does not contain readable settings.");
  for (const key of ["endpoint", "model"]) if (typeof s[key] !== "string" || s[key].length > MAX_FIELD) return fail("invalid-settings", `The transfer's ${key} is not valid.`);
  if (s.theme !== undefined && !THEMES.has(s.theme)) return fail("invalid-settings", "The transfer's theme is not valid.");
  const settings = { endpoint: s.endpoint.trim(), model: s.model.trim(), theme: s.theme || "" };
  if (settings.endpoint && endpointIdentity(settings.endpoint) === null) return fail("invalid-settings", "The transfer's endpoint is not a usable web address.");
  const token = readTokenEnvelope(raw.protectedToken);
  if (token.state === "locked" && endpointIdentity(settings.endpoint) === null) { token.state = "damaged"; token.reason = "no-destination"; delete token.protectedToken; }
  const envelope = deepFreeze({ format: TRANSFER_FORMAT, settings: { ...settings }, ...(token.protectedToken ? { protectedToken: token.protectedToken } : {}) });
  return { ok: true, source: "v2", settings, token: { state: token.state, ...(token.reason ? { reason: token.reason } : {}) }, envelope: token.protectedToken ? envelope : null };
}

/** Reads the text of a version 2 package (a settings file). */
export function readTransferText(text) {
  if (typeof text !== "string") return fail("malformed", "This is not a settings file.");
  if (enc.encode(text).length > MAX_JSON_BYTES) return fail("too-large", "This settings file is too large to be a settings transfer.");
  let raw;
  try { raw = JSON.parse(text); } catch { return fail("malformed", "This file is not valid JSON."); }
  return readEnvelope(raw);
}

/** Reads the Base64URL package from a link's fragment. */
export function readTransferFragment(encoded) {
  if (typeof encoded !== "string") return fail("malformed", "The settings link is damaged.");
  if (encoded.length > MAX_ENCODED_LENGTH) return fail("too-large", "This settings link is too large to be a settings transfer.");
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(fromBase64Url(encoded)); } catch { return fail("malformed", "The settings link is damaged."); }
  return readTransferText(text);
}

/** True when the address carries a settings package in its fragment: that alone decides it is the transfer source. */
export function hasSettingsFragment(hash) {
  return typeof hash === "string" && new URLSearchParams(hash.replace(/^#/, "")).has("settings");
}
export const fragmentValue = (hash) => new URLSearchParams(String(hash).replace(/^#/, "")).get("settings") ?? "";

// ---- legacy (before version 2) ----------------------------------------------------------------------------------------
const decodeLegacyJson = (value) => JSON.parse(decodeURIComponent(escape(atob(value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=")))));

function legacyResult(source, raw) {
  const settings = pickSettings(raw);
  const plain = typeof raw?.token === "string" ? raw.token.trim() : "";
  return { ok: true, source, settings, token: plain ? { state: "decrypted", value: plain } : { state: "absent" }, envelope: null, legacy: true };
}

/** Links made before version 2: `?settings=BASE64URL(JSON)` and loose `?endpoint=&token=&model=&theme=` parameters. */
export function readLegacyQuery(search) {
  const params = new URLSearchParams(String(search).replace(/^\?/, ""));
  const keys = ["settings", "endpoint", "token", "model", "theme"];
  if (!keys.some((k) => params.has(k))) return null;
  let merged = {};
  if (params.get("settings")) { try { const parsed = decodeLegacyJson(params.get("settings")); if (isPlain(parsed)) merged = { ...parsed }; } catch { /* ignored, as before */ } }
  for (const k of ["endpoint", "token", "model", "theme"]) if (params.has(k)) merged[k] = params.get(k) ?? "";
  return legacyResult("legacy-link", merged);
}
export const LEGACY_PARAMS = Object.freeze(["settings", "endpoint", "token", "model", "theme"]);

/** A settings file: version 2, or an earlier export ({ config, models } or the bare settings object). */
export function readConfigFile(text) {
  if (typeof text !== "string") return fail("malformed", "This is not a settings file.");
  let raw;
  try { raw = JSON.parse(text); } catch { return fail("malformed", "This file is not valid JSON."); }
  if (isPlain(raw) && typeof raw.format === "string" && raw.format.startsWith("plc-settings-transfer/")) return readTransferText(text);
  if (!isPlain(raw)) return fail("malformed", "This is not a settings file.");
  const source = isPlain(raw.config) ? raw.config : raw;
  const known = ["endpoint", "token", "model", "theme"].some((k) => typeof source[k] === "string");
  if (!known) return fail("malformed", "This file has no settings this app can read.");
  const result = legacyResult("legacy-file", source);
  if (Array.isArray(raw.models)) result.models = raw.models.filter((m) => typeof m === "string").slice(0, 500);
  return result;
}

/** Where an arriving page's settings come from. A version 2 fragment, even a damaged one, outranks old query parameters. */
export function readIncoming({ hash = "", search = "" } = {}) {
  if (hasSettingsFragment(hash)) return { ...readTransferFragment(fragmentValue(hash)), fromFragment: true };
  const legacy = readLegacyQuery(search);
  return legacy ? { ...legacy, fromFragment: false } : null;
}

// ---- unlocking --------------------------------------------------------------------------------------------------------
/**
 * Decrypts the token of an envelope returned by readEnvelope(). `password` is used exactly as entered. Fails with code "bad-password"
 * for a wrong password and for any change to the ciphertext or to the authenticated settings (endpoint path or query, model, theme),
 * without saying which, and with "damaged" for an envelope that is not valid.
 */
export async function unlockToken(envelope, password) {
  const checked = readEnvelope(envelope);
  if (!checked.ok || !envelope?.protectedToken) throw Object.assign(new Error("There is no transferred API token to unlock."), { code: "damaged" });
  if (checked.token.state !== "locked") throw Object.assign(new Error("The transferred API token cannot be read."), { code: "damaged" });
  if (typeof password !== "string") throw Object.assign(new Error("The password must be text."), { code: "bad-password" });
  const { salt, iv, ciphertext } = envelope.protectedToken;
  const s = checked.settings;
  try {
    const key = await deriveKey(password, fromBase64Url(salt));
    const aad = authenticatedData(TRANSFER_FORMAT, TOKEN_SUITE, s.endpoint, s.model, s.theme);
    const plain = await subtle().decrypt({ name: "AES-GCM", iv: fromBase64Url(iv), additionalData: aad, tagLength: TAG_BITS }, key, fromBase64Url(ciphertext));
    return new TextDecoder("utf-8", { fatal: true }).decode(plain);
  } catch { throw Object.assign(new Error("Couldn't unlock the API token."), { code: "bad-password" }); }
}

/** A token may only be attached to the destination it was authenticated for. */
export const tokenBelongsTo = (envelope, currentEndpoint) => sameDestination(envelope?.settings?.endpoint, currentEndpoint);
