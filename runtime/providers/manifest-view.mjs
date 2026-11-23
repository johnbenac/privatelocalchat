// Manifests: a resource-profile descriptor plus the runtime's derived view, for ANY model. This module is data-free (it imports no catalogue): the shipped catalogue's manifests are made by
// manifest-shipped.mjs, so a consumer that imports runtime.mjs never loads the package's own tier data.
// A manifest is {descriptor, view}. The descriptor is a resource-profile (T783 draft.7) of class model-resource; the view is the runtime's derived data. Both are location-free and
// time-free: files are named, never placed (the host comes from the injected source list), so building from the same inputs gives the same bytes.
// The closure hash needs SHA-256 over the whole list, so it is computed by tools/ (Node) and passed in as `closureHash`; in a page the manifests simply carry no `closure` unless a hash is given.
// The validator and the closure tool are Node-only (tools/); a page never loads them.

const MEDIA = { json: "application/json", wasm: "application/wasm", txt: "text/plain", md: "text/markdown" };
export const mediaOf = (name) => MEDIA[name.split(".").pop().toLowerCase()] ?? "application/octet-stream";
export const slug = (s) => s.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "");

/**
 * The REVIEWED terms of each licence the shipped catalogue uses, keyed by the licence string the catalogue states. A bundle builder believes these, so nothing here is a default: a licence that is
 * not in the table gets `user-supplied-only` (never bundled) until someone reviews it. Reviewed by platform on 22 November 2026 from the catalogue's own licence strings and notes; this is a
 * reading of those notes, NOT a legal review: devops and brand own that decision. Apache-2.0 is "allowed-with-notice" because a redistributed copy carries the licence text and any NOTICE.
 */
export const REVIEWED_LICENCES = Object.freeze({
  "Apache-2.0": Object.freeze({ redistribution: "allowed-with-notice", gated: false, copyleft: false }),
  "LFM Open License v1.0": Object.freeze({ redistribution: "allowed-with-notice", gated: false, copyleft: false,
    useRestrictions: Object.freeze(["Free to use only below the licence's revenue threshold (LFM Open License v1.0): above it the owner's commercial licence is needed. Read the licence text shipped with the files for the threshold."]) })
});
const UNREVIEWED = Object.freeze({ redistribution: "user-supplied-only", gated: false, copyleft: false, useRestrictions: Object.freeze(["This licence is not in the reviewed table: the files are never bundled until it is reviewed."]) });
/** The rights a shipped model gets from its licence string; a copyleft licence must say where its source is, so one without is refused here and never reaches a manifest. */
export function rightsForLicence(licence) {
  const t = REVIEWED_LICENCES[licence] ?? UNREVIEWED;
  if (t.copyleft === true && !t.source) throw new RangeError(`licence ${licence} is copyleft and the reviewed table names no source`);
  return { licence, redistribution: t.redistribution, gated: t.gated, copyleft: t.copyleft, ...(t.source ? { source: t.source } : {}), ...(t.useRestrictions ? { useRestrictions: [...t.useRestrictions] } : {}) };
}

const TERM_FIELDS = ["licence", "attribution", "redistribution", "gated", "acceptance", "ownerUrl", "useRestrictions", "copyleft", "source"];
/** The terms of a descriptor's rights, as the view carries them: DERIVED, never written by hand. */
export function termsFromRights(rights = {}) {
  const t = {};
  for (const k of TERM_FIELDS) if (rights[k] !== undefined) t[k] = rights[k];
  return t;
}

/**
 * A manifest from ANY resource-profile descriptor (T783 draft.7) of class model-resource: the descriptor plus the runtime's derived view.
 * `engine`/`adapter` name the engine that reads it; `scopeOf(artifact)` names the cache scope of each named artifact; `needs` adds device needs beyond what the descriptor's
 * `requires` already say (webgpu and opfs are read from `requires`); `slots` are user-supplied inputs; `io` is the reserved name for what a family accepts and returns;
 * `closureHash` (Node, tools/closure.mjs) adds the closure. Nothing in the view carries a location, a path on disk, a host or a time.
 */
export function manifestFromDescriptor(descriptor, { engine = descriptor.runtime?.engine, adapter = engine, engineVariant = null, scopeOf = () => "opfs", needs = {}, slots = [], io = null, provider = "local", note = null, closureHash = null } = {}) {
  const unnamed = descriptor.artifacts.filter((a) => a.name === undefined);
  // a model's files are placed by name and its closure covers every artifact: an unnamed artifact cannot be placed and would silently leave the closure out, so it is refused
  if (unnamed.length) throw Object.assign(new RangeError(`manifestFromDescriptor: every artifact of a model needs a name (${unnamed.length} without one in ${descriptor.resource?.id})`), { code: "unnamed-artifact" });
  const named = descriptor.artifacts;
  const req = (id) => (descriptor.requires ?? []).find((q) => q.profile === id);
  const fromRequires = { webgpu: req("provisional/cap/webgpu")?.need === "required", opfs: req("provisional/cap/opfs-storage")?.need === "required" };
  return {
    descriptor,
    view: {
      files: named.map((a) => ({ name: a.name, role: a.role, scope: scopeOf(a), artifact: a.sha256 })),
      ...(closureHash ? { closure: closureHash(descriptor.artifacts) } : {}),
      engine: { name: engine, version: descriptor.runtime?.version ?? null, adapter, variant: engineVariant },
      // memory is stated, never silently absent: "unmeasured" until a measurement (T1068) fills steadyBytes and peakBytes, "estimate" for a figure from file sizes, "measured" for a reading on a named device
      needs: { ...fromRequires, threads: false, crossOriginIsolated: false, threadsBasis: "not stated", steadyBytes: null, peakBytes: null, memoryBasis: "unmeasured", ...needs, storageBytes: descriptor.artifacts.reduce((n, a) => n + a.bytes, 0) },
      // transferBytes and compression are ASSUMED (served as installed, uncompressed) until a manifest says otherwise; the basis field says so
      artifacts: descriptor.artifacts.map((a) => ({ name: a.name, transferBytes: a.bytes, compression: "none", transferBasis: "assumed" })),
      terms: { ...termsFromRights(descriptor.rights), ...(note ? { note } : {}) },
      slots,
      io: io ?? { inputs: [], outputs: [] },
      provider
    }
  };
}

/**
 * The manifest of the pinned wllama runtime build (production-runtime.json: the compat build's three files with their sizes and digests), as an executable application-code descriptor.
 * `productionRuntime` is that JSON, parsed. The build's own name is not used as the id (it carries an application's name); the revision is the base build label. Executable and pinned: a bundle
 * that carries a wllama model carries these three files too, and MIT requires the notice with them (rights.redistribution "allowed-with-notice").
 */
export function wllamaRuntimeManifest(productionRuntime, { closureHash = null, descriptorFormat = null } = {}) {
  const media = { "compat.wasm": "application/wasm", "compat-worker.js": "text/javascript", "wllama.js": "text/javascript" };
  const artifacts = Object.entries(productionRuntime.files).map(([name, f]) => ({ role: "runtime", sha256: f.sha256, bytes: f.bytes, mediaType: media[name] ?? "application/octet-stream", name }));
  const descriptor = {
    ...(descriptorFormat ? { format: descriptorFormat } : {}),
    resource: { id: "resource:runtime/wllama-" + slug(productionRuntime.baseBuildId.split("-")[0]), kind: "executable", class: "application-code", revision: productionRuntime.baseBuildId, label: "wllama runtime build (compat, single thread)" },
    artifacts,
    runtime: { engine: "browser-wasm", version: "compat" },
    rights: { licence: "MIT", redistribution: "allowed-with-notice", gated: false, copyleft: false },
    crosswalk: [{ system: "runtime-manifest", ref: "production-runtime.json files{}.bytes + sha256", correspondence: "exact" }]
  };
  return manifestFromDescriptor(descriptor, { engine: "browser-wasm", scopeOf: () => "runtime", closureHash, needs: { webgpu: false, shaderF16: false, opfs: false, threadsBasis: "single-thread compat build" }, io: { inputs: [], outputs: [] } });
}
