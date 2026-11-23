// Sources, mirrors and the one integrity path (T1067). Pure apart from the injected services: no window global, no storage, no worker. Runs in the host Worker and in tests.
//
//   source   {id, label?, base, kind?: "https"|"path"|"files"|"archive", privacy?, credentials?: "request"|"none", files?: Map<name, Blob>, blob?: Blob}
//            https/path: a base address a file's relative place is appended to. files: a Map of relative name -> File/Blob (a picked folder). archive: ONE uncompressed tar as a Blob.
//   file     {path, bytes, sha256, url (the CANONICAL address: the cache key whichever source served it), rel (its place under a source's base), scope}
//   services {fetch, readFile(source, rel) => Promise<Blob>, requestCredential(endpoint) => Promise<{headers}|{none:true}|{refused:true}>}
//
// EVERY candidate, from any source, goes through the same size and SHA-256 check; with fallback a failing candidate is dropped and the next tried; without fallback only the
// configured source (the first) is contacted and a failure is a failure. Credentials are asked for per request and never kept, logged or returned.
import { readTarIndex } from "./tar-core.mjs";
import { sha256 } from "./vendor/noble-hashes/2.4.0/sha2.js";

export const DEFAULT_PRIVACY = "this source learns the address of the person fetching";
const KINDS = new Set(["https", "path", "files", "archive"]);

export function normalizeSources(list) {
  if (list === null || list === undefined) return [];
  if (!Array.isArray(list)) throw new TypeError("sources must be an ordered list");
  const seen = new Set();
  return list.map((s, i) => {
    if (!s || typeof s !== "object") throw new TypeError(`source ${i} is not an object`);
    const id = String(s.id ?? `source-${i}`); if (seen.has(id)) throw new RangeError(`two sources have the id ${id}`); seen.add(id);
    const kind = s.kind ?? (s.files ? "files" : s.blob ? "archive" : /^https?:\/\//i.test(String(s.base ?? "")) ? "https" : "path");
    if (!KINDS.has(kind)) throw new RangeError(`source ${id}: unknown kind ${kind}`);
    if ((kind === "https" || kind === "path") && typeof s.base !== "string") throw new TypeError(`source ${id}: ${kind} needs a base`);
    if (kind === "files" && !(s.files instanceof Map)) throw new TypeError(`source ${id}: files needs a Map of relative name -> File/Blob`);
    if (kind === "archive" && !(typeof Blob !== "undefined" && s.blob instanceof Blob)) throw new TypeError(`source ${id}: archive needs one tar Blob`);
    return { id, label: String(s.label ?? id), base: typeof s.base === "string" ? (s.base.endsWith("/") ? s.base : s.base + "/") : "", kind, privacy: s.privacy ?? DEFAULT_PRIVACY, credentials: s.credentials ?? "none", ...(s.files ? { files: s.files } : {}), ...(s.blob ? { blob: s.blob } : {}) };
  });
}

/** Does this source use the network? files and archive never do. */
export const usesNetwork = (s) => s.kind === "https" || s.kind === "path";

/**
 * The ordered candidates for one file. A network source serves a file only where the file has a place under a source's base (`rel`); a file without one (the runtime library, an entry with its own host or an
 * absolute directory) can come only from its own catalogue address, so such a source gets a candidate that FAILS WITH THE REASON (`source-cannot-serve`) instead of silently vanishing. Without `fallback` the
 * FIRST CONFIGURED source is the only candidate, usable or not; with it the catalogue's own address follows the list. With no list the canonical address is the only candidate (today's behaviour).
 */
export function candidatesFor(file, { sources = [], fallback = true } = {}) {
  const canonical = { source: "canonical", kind: /^https?:\/\//i.test(file.url) ? "https" : "path", url: file.url, credentials: "none" };
  if (!sources.length) return [canonical];
  const one = (s) => (usesNetwork(s)
    ? (file.rel ? { source: s.id, kind: s.kind, url: s.base + file.rel, credentials: s.credentials } : { source: s.id, kind: s.kind, unservable: `${s.label} cannot serve ${file.path}: it has no place under a source's base (a runtime file, or an entry with its own host or an absolute directory); it comes only from its catalogue address` })
    : { source: s.id, kind: s.kind, rel: file.bundleRel ?? file.rel ?? file.path, name: file.path });
  const list = sources.map(one);
  return fallback ? [...list, ...(list.some((c) => c.url === file.url) ? [] : [canonical])] : list.slice(0, 1);
}

/** The origin (scheme and host) of an ABSOLUTE http(s) address, or null for a relative one: no host is invented to resolve against. */
export const originOfUrl = (u) => /^(https?:\/\/[^/?#]+)/i.exec(String(u))?.[1]?.toLowerCase() ?? null;

const refusal = (code, message, detail) => Object.assign(new Error(message), { name: "SourceError", code, ...(detail ? { detail } : {}) });

const archives = new WeakMap();   // tar Blob -> Promise<Map name -> {offset, bytes}>
async function archiveIndex(blob, signal) {
  if (!archives.has(blob)) archives.set(blob, readTarIndex(async (a, n) => new Uint8Array(await blob.slice(a, a + n).arrayBuffer()), blob.size, { signal }).then((ix) => {
    if (ix.duplicateMembers.length) throw refusal("ambiguous-archive", `the archive holds a name twice: ${ix.duplicateMembers.slice(0, 3).join(", ")}`);
    if (ix.linked.length) throw refusal("linked-member", `the archive holds a link or a non-regular member: ${ix.linked.slice(0, 3).join(", ")}`);
    if (ix.unsafeNames.length) throw refusal("unsafe-name", `the archive holds a name that leaves its folder: ${ix.unsafeNames.slice(0, 3).join(", ")}`);
    return new Map(ix.members.map((m) => [m.name, m]));
  }));
  return archives.get(blob);
}

/** The default readFile: a picked folder (Map) or one archive (range reads of a tar). */
export async function readFromSource(source, rel, name, { signal } = {}) {
  if (source.kind === "files") { const b = source.files.get(rel) ?? source.files.get(name); if (!b) throw refusal("file-not-in-source", `${rel} is not in ${source.label}`); return b; }
  if (source.kind === "archive") { const m = (await archiveIndex(source.blob, signal)).get(rel) ?? (await archiveIndex(source.blob, signal)).get(name); if (!m) throw refusal("file-not-in-source", `${rel} is not in ${source.label}`); return source.blob.slice(m.offset, m.offset + m.bytes); }
  throw refusal("not-a-local-source", `${source.id} is not a file or archive source`);
}

const HEADER_NAME = /^(authorization|x-[a-z0-9-]+)$/i;
/** The headers a page may hand over for one request: Authorization and X-* only, no line breaks; anything else is refused (Host, Cookie, Origin, Referer, Content-Length ...). */
export function checkCredentialHeaders(headers) {
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) throw refusal("credential-malformed", "the credential answer carries no headers object");
  const out = {};
  for (const [k, v] of Object.entries(headers)) {
    if (!HEADER_NAME.test(k)) throw refusal("credential-header-refused", `the header ${k} is not allowed in a credential (Authorization and X-* only)`);
    if (typeof v !== "string" || /[\r\n\0]/.test(v)) throw refusal("credential-malformed", `the value of ${k} is not a single line`);
    out[k] = v;
  }
  return out;
}
const isLoopback = (u) => /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/i.test(new URL(u).hostname);
const sameOrigin = (a, b) => new URL(a).origin === new URL(b).origin;

/** One request that never lets a credential follow a redirect to another origin: redirects are followed here, by hand, and the headers are dropped as soon as the origin changes. */
async function fetchNoLeak(fetch, url, { signal, headers }) {
  let current = url, sendHeaders = headers, hops = 0;
  for (;;) {
    const res = await fetch(current, { signal, credentials: "omit", cache: "no-store", redirect: headers ? "manual" : "follow", ...(sendHeaders ? { headers: sendHeaders } : {}) });
    const redirected = headers && (res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400 && res.headers?.get?.("location")));
    if (!redirected) return res;
    if (++hops > 5) throw refusal("download-failed", "too many redirects");
    const next = new URL(res.headers.get("location"), current).href;
    if (sendHeaders && !sameOrigin(current, next)) sendHeaders = undefined;   // the person's token never reaches an origin they did not give it to
    current = next;
  }
}

/**
 * Fetch one file from its candidates through the one integrity path. `hash(blob) => sha256 hex` is the caller's (a Worker-side hasher). Returns {blob, servedBy, tried}: `tried` lists every
 * candidate that failed and why (never the headers). Throws the LAST failure when every candidate failed (code from the failure; `candidates-exhausted` carries the list in detail).
 * With `sink` ({write(stream, file) => Promise, discard() => Promise}) a NETWORK file is streamed into the store while it is hashed incrementally (memory stays bounded by a chunk, not the file),
 * and a file from a picked folder or an archive is hashed by slices and then streamed; the result has no `blob`. A size or digest mismatch discards what was written.
 */
export async function fetchVerified(file, candidates, services, { hash, signal, onBytes, sourcesById = new Map(), posture = null, sink = null, dead = null } = {}) {
  const tried = [];
  for (const c of candidates) {
    signal?.throwIfAborted();
    const src = sourcesById.get(c.source);
    try {
      if (c.unservable) throw refusal("source-cannot-serve", c.unservable);
      if (dead?.has(c.source)) { const why = dead.get(c.source); throw Object.assign(refusal(why.code, `${why.message} (${c.source} failed earlier in this install and is not asked again)`), { skipped: true }); }   // the REAL cause is kept, never hidden behind "skipped"
      if (posture && src && posture.refused?.includes(src.id)) throw refusal("source-not-approved", `${src.label} is not approved on this page`);
      let blob = null, streamed = false;
      if (c.kind === "files" || c.kind === "archive") blob = await (services.readFile ? services.readFile(src, c.rel, c.name, { signal }) : readFromSource(src, c.rel, c.name, { signal }));
      else {
        let headers; if (c.credentials === "request") {
          if (!/^https:/i.test(c.url) && !isLoopback(c.url)) throw refusal("credential-needs-https", "a credential is never sent over plain http");
          if (!services.requestCredential) throw refusal("credential-unavailable", "this source needs a credential and the page supplies none");
          const origin = originOfUrl(c.url); if (!origin) throw refusal("credential-needs-https", "a credential is asked for only for an absolute https address"); const a = await services.requestCredential(origin);
          if (a?.unavailable) throw refusal("credential-unavailable", "this source needs a credential and the page supplies no handler for one");
          if (a?.timedOut) throw refusal("credential-timeout", "the page did not answer the credential request in time");
          if (a?.refused) throw refusal("credential-refused", "the page refused to give a credential for this source");
          headers = a?.headers ? checkCredentialHeaders(a.headers) : undefined;
        }
        const res = await fetchNoLeak(services.fetch, c.url, { signal, headers });
        if (!res.ok || !res.body) throw Object.assign(refusal("download-failed", `HTTP ${res.status} for ${c.source}`), { status: res.status });
        if (sink) {
          const hasher = hash ? sha256.create() : null; let n = 0;
          const t = new TransformStream({ transform(chunk, ctl) { n += chunk.byteLength; hasher?.update(chunk); onBytes?.(chunk.byteLength); ctl.enqueue(chunk); } });
          try { await sink.write(res.body.pipeThrough(t), file); } catch (e) { await sink.discard?.(); throw e; }
          const got = hasher ? Array.from(hasher.digest(), (b) => b.toString(16).padStart(2, "0")).join("") : null; streamed = true;
          if (n !== file.bytes) { await sink.discard?.(); throw refusal("cache-corrupt", `size mismatch for ${file.path}: got ${n} bytes, the catalogue says ${file.bytes}`); }
          if (file.sha256 && got !== null && got !== file.sha256) { await sink.discard?.(); throw refusal("cache-corrupt", `checksum mismatch for ${file.path}: sha256 ${got}, the catalogue says ${file.sha256}`); }
        } else {
          const reader = res.body.getReader(); const chunks = []; let n = 0;
          for (;;) { const { value, done } = await reader.read(); if (done) break; chunks.push(value); n += value.byteLength; onBytes?.(value.byteLength); }
          blob = new Blob(chunks, { type: res.headers?.get?.("content-type") || "application/octet-stream" });
        }
      }
      if (!streamed) {
        if (blob.size !== file.bytes) throw refusal("cache-corrupt", `size mismatch for ${file.path}: got ${blob.size} bytes, the catalogue says ${file.bytes}`);
        if (file.sha256 && hash) { const got = await hash(blob); if (got !== file.sha256) throw refusal("cache-corrupt", `checksum mismatch for ${file.path}: sha256 ${got}, the catalogue says ${file.sha256}`); }
        if (sink) await sink.write(blob.stream(), file);
      }
      return { blob: sink ? null : blob, servedBy: c.source, tried };
    } catch (e) {
      if (signal?.aborted || e?.name === "AbortError") throw e;
      tried.push({ source: c.source, code: e?.code ?? e?.name ?? "error", message: String(e?.message ?? e).slice(0, 200) });
      if (dead && c.kind !== "files" && c.kind !== "archive" && c.source !== "canonical" && !e?.skipped && !["cache-corrupt", "source-cannot-serve", "source-not-approved", "credential-refused", "credential-timeout", "credential-unavailable"].includes(e?.code)) dead.set(c.source, { code: e?.code ?? e?.name ?? "download-failed", message: String(e?.message ?? e).slice(0, 200) });   // a dead host is asked once per install, not once per file
      if (c === candidates[candidates.length - 1]) { const last = e instanceof Error ? e : new Error(String(e)); throw Object.assign(last, { message: candidates.length > 1 ? `no source could supply ${file.path}: ${tried.map((t) => `${t.source}: ${t.code}`).join("; ")}` : last.message, detail: { ...(last.detail ?? {}), tried } }); }
    }
  }
  throw refusal("candidates-exhausted", `no source could supply ${file.path}: ${tried.map((t) => `${t.source}: ${t.code}`).join("; ") || "no candidate was configured"}`, { tried });
}

/** The origins the runtime may contact, grouped by use, so a consumer builds separate content-security rules for the model Worker and for the page. */
export function originsOf({ files = [], runtimeFiles = [], sources = [], extraScript = [] } = {}) {
  const connect = new Set(), worker = new Set(), wasm = new Set(), script = new Set(extraScript);
  const originOf = originOfUrl;
  for (const f of files) { const o = originOf(f.url); if (o) connect.add(o); }
  for (const s of sources) if (usesNetwork(s)) { const o = originOf(s.base); if (o) connect.add(o); }
  for (const f of runtimeFiles) { const o = originOf(f.url); if (!o) continue; if (/\.wasm$/i.test(f.path ?? f.url)) wasm.add(o); else if (/worker/i.test(f.path ?? f.url)) worker.add(o); else script.add(o); connect.add(o); }
  const s = (x) => [...x].sort();
  return { connect: s(connect), worker: s(worker), wasm: s(wasm), script: s(script) };
}

/** Posture: "open" (default) approves everything; "curated" asks approve(base) of every network source. Nothing is dropped: the ids refused are returned and fetchVerified refuses them by name (`source-not-approved`) WITHOUT contacting them, so with fallback off a refused first source is a failure, never a silent move to the next. */
export function applyPosture(sources, posture) {
  if (!posture || posture.mode !== "curated") return { sources, refused: [] };
  if (typeof posture.approve !== "function") throw new TypeError("a curated posture needs approve(base) => boolean");
  return { sources, refused: sources.filter((s) => usesNetwork(s) && posture.approve(s.base) !== true).map((s) => s.id) };
}
