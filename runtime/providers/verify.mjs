// Pure inventory comparison and progress arithmetic for the model manager. No DOM, no storage: the caller supplies what it found.

/**
 * expected: [{ path, bytes, sha256? }]   actual: Map<path, bytes> | { [path]: bytes }
 * A file is `ok` only when its stored size equals the catalogue size. A zero-length entry is `empty` (the WebLLM F5 failure:
 * an interrupted download leaves a zero-byte cache entry that the engine trusts). Anything not in the catalogue is `extra`
 * (reported, never silently counted as the model).
 */
// SIZE-ONLY: compares byte counts, never digests. It is the older, cheaper check (is anything missing or the wrong size?) and is NOT proof of the bytes: use verifyManifest for that.
export function compareInventory(expected, actual) {
  const have = actual instanceof Map ? actual : new Map(Object.entries(actual || {}));
  const missing = []; const empty = []; const wrongSize = []; let bytesPresent = 0; let bytesTotal = 0; let okCount = 0;
  const seen = new Set();
  for (const e of expected) {
    bytesTotal += e.bytes; seen.add(e.path);
    if (!have.has(e.path)) { missing.push(e.path); continue; }
    const got = have.get(e.path);
    if (got === 0) { empty.push({ path: e.path, want: e.bytes, got }); continue; }
    if (got !== e.bytes) { wrongSize.push({ path: e.path, want: e.bytes, got }); continue; }
    okCount++; bytesPresent += e.bytes;
  }
  const extra = [...have.keys()].filter((k) => !seen.has(k));
  const bad = [...empty.map((x) => ({ ...x, why: "empty" })), ...wrongSize.map((x) => ({ ...x, why: "wrong-size" }))];
  const state = bad.length ? "corrupt" : missing.length === expected.length ? "absent" : missing.length ? "partial" : "complete";
  return { state, ok: state === "complete", files: expected.length, okFiles: okCount, missing, bad, extra, bytesPresent, bytesTotal };
}

/** Sliding-window transfer rate. Feed it cumulative byte counts; read bytes per second and an ETA. */
export function createRateTracker({ windowMs = 5000 } = {}) {
  const samples = [];
  return {
    add(totalBytes, t) {
      samples.push([t, totalBytes]);
      while (samples.length > 2 && t - samples[0][0] > windowMs) samples.shift();
    },
    bytesPerSecond() {
      if (samples.length < 2) return null;
      const [t0, b0] = samples[0]; const [t1, b1] = samples[samples.length - 1];
      return t1 > t0 ? Math.max(0, ((b1 - b0) / (t1 - t0)) * 1000) : null;
    },
    etaSeconds(remainingBytes) {
      const r = this.bytesPerSecond();
      return r && r > 0 ? remainingBytes / r : null;
    },
    reset() { samples.length = 0; }
  };
}

/** Which files an install must fetch: everything not already complete. Resume = keep complete files, re-fetch the rest whole. */
export function planInstall(expected, inventory) {
  const bad = new Set(inventory.bad.map((b) => b.path)); const missing = new Set(inventory.missing);
  const todo = expected.filter((e) => bad.has(e.path) || missing.has(e.path));
  const todoSet = new Set(todo.map((e) => e.path));
  return { todo, deleteFirst: [...bad], bytesToFetch: todo.reduce((n, e) => n + e.bytes, 0), bytesKept: expected.filter((e) => !todoSet.has(e.path)).reduce((n, e) => n + e.bytes, 0) };
}

export function hex(buf) { return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join(""); }

// ---- the manifest verifier and the service profile (C2) --------------------------------------------------------------------------------------------------------------
// Pure: no network, no DOM, no file system. The caller MEASURES what it holds (a browser hashes Blobs in chunks with the vendored noble SHA-256, tools/verify-cli.mjs streams a
// directory or a tar in Node) and passes an inventory; this function judges it against a manifest. One verifier, so the offline bundle builder and the runtime cannot disagree.
//   inventory: Map | object   name -> {bytes, sha256?}       sha256 absent means "not hashed": the file is reported `unverified`, and a deep verification refuses it
import { isUnsafeName, readTarIndex } from "./tar-core.mjs";
const CREDENTIAL_LIKE = /(^|[\/._-])(token|secret|secrets|credential|credentials|passwd|password|vault|apikey|api-key|id_rsa|id_ed25519)([\/._-]|$)|\.(pem|key|p12|pfx|env)$|(^|\/)\.env/i;
const sorted = (a) => [...a].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
const asMap = (inv) => (inv instanceof Map ? inv : new Map(Object.entries(inv || {})));

/**
 * Judge an inventory against a manifest ({descriptor, view}). Options:
 *   release        an undeclared extra file is a FAILURE, not a note (a bundle holds exactly its closure); a credential-like name is flagged even when declared (unless the manifest lists it in
 *                  view.credentialLikeAllowed); and the closure must be present and recomputable
 *   deep           (default true) a file whose bytes were not hashed is a failure
 *   closure        (artifacts) => sha256 hex, injected (this module has no SHA-256): the manifest's own closure and its runtime closure are RECOMPUTED and compared, so a manifest edited after
 *                  generation is not trusted
 *   expectedClosure  the closure a bundle or a caller recorded: it must equal view.closure
 *   validateSlot   (slot, found) => boolean, for a slot that expects a schema or states neither bytes nor sha256: without it such a slot is never filled
 * The model's runtime dependencies (descriptor.dependencies with a name) are judged exactly like its own artifacts: a model without its runtime is not complete.
 * A user-supplied slot is `filled` ONLY when its file is in the inventory and matches what the slot expects: `filled` is produced here, never set by a caller.
 */
export function verifyManifest(manifest, inventory, { release = false, deep = true, closure = null, expectedClosure = null, validateSlot = null } = {}) {
  const inv = asMap(inventory);
  const artifacts = new Map(manifest.descriptor.artifacts.filter((a) => a.name !== undefined).map((a) => [a.name, a]));
  const named = (manifest.descriptor.dependencies ?? []).filter((d) => d.name !== undefined);
  const deps = named.filter((d) => d.sha256 !== undefined);
  const unpinnedDependencies = sorted(named.filter((d) => d.sha256 === undefined).map((d) => d.name));   // listed without a digest: nothing can be checked, so release refuses
  // what the READER found (duplicates, links, unsafe names) rides on the inventory; a name that leaves the folder is also judged here, whoever built the inventory
  const found = inv.problems ?? {};
  const duplicateMembers = sorted(found.duplicateMembers ?? []);
  const linked = sorted(found.linked ?? []);
  const unsafeName = sorted([...new Set([...(found.unsafeNames ?? []), ...[...inv.keys()].filter(isUnsafeName)])]);
  const missing = [], wrongSize = [], wrongHash = [], unverified = [];
  const judge = (name, want, required) => {
    const got = inv.get(name);
    if (!got) { if (required) missing.push(name); }
    else if (got.bytes !== want.bytes) wrongSize.push({ name, want: want.bytes, got: got.bytes });
    else if (got.sha256 === undefined) unverified.push(name);
    else if (got.sha256 !== want.sha256) wrongHash.push({ name, want: want.sha256, got: got.sha256 });
  };
  // a licence text travels with a bundle; an installed copy need not hold it, so it is required only in release mode (and judged whenever it is present)
  for (const f of manifest.view.files) judge(f.name, artifacts.get(f.name), f.role !== "licence" || release);
  for (const d of deps) judge(d.name, d, (d.need ?? "required") === "required");
  const slots = (manifest.view.slots ?? []).map((s) => {
    const got = inv.get(s.name);
    const stated = s.expect?.bytes !== undefined || s.expect?.sha256 !== undefined;
    let filled = false;
    if (got) {
      const byValue = (s.expect?.bytes === undefined || got.bytes === s.expect.bytes) && (s.expect?.sha256 === undefined || (got.sha256 !== undefined && got.sha256 === s.expect.sha256));
      // a slot that states neither a size nor a digest, or expects a schema, is filled only when the caller's own validator says so: no file of the right name fills it by itself
      const needsValidator = !stated || s.expect?.schema !== undefined;
      filled = byValue && (!needsValidator || (typeof validateSlot === "function" && validateSlot(s, got) === true));
    }
    return { name: s.name, required: s.required === true, filled };
  });
  const unfilledSlots = slots.filter((s) => s.required && !s.filled).map((s) => s.name);
  const declaredNames = [...manifest.view.files.map((f) => f.name), ...deps.map((d) => d.name), ...(manifest.view.slots ?? []).map((s) => s.name)];
  const declared = new Set(declaredNames);
  const undeclaredExtra = sorted([...inv.keys()].filter((n) => !declared.has(n)));
  const allowed = new Set(manifest.view.credentialLikeAllowed ?? []);
  const credentialLike = sorted([...undeclaredExtra, ...(release ? declaredNames : [])].filter((n, i, a) => a.indexOf(n) === i && CREDENTIAL_LIKE.test(n) && !(declared.has(n) && allowed.has(n))));
  // closures: recomputed from the descriptor, never trusted from the view (the runtime closure is the closure of the runtime manifest's artifacts, each of role "runtime": the model lists them as dependencies)
  const closureMismatch = [];
  if (typeof closure === "function") {
    const list = (xs) => xs.filter((a) => a.name !== undefined).map(({ name, role, bytes, sha256 }) => ({ name, role, bytes, sha256 }));
    if (manifest.view.closure !== undefined) { if (closure(list(manifest.descriptor.artifacts)) !== manifest.view.closure) closureMismatch.push("closure"); }
    else if (release) closureMismatch.push("closure-absent");
    if (manifest.view.runtime?.closure !== undefined && deps.length && closure(list(deps.map((d) => ({ ...d, role: "runtime" })))) !== manifest.view.runtime.closure) closureMismatch.push("runtime.closure");
  } else if (release) closureMismatch.push("closure-not-checkable");
  if (expectedClosure !== null && expectedClosure !== manifest.view.closure) closureMismatch.push("expectedClosure");
  const reasons = [];
  if (missing.length || wrongSize.length) reasons.push("download-incomplete");
  if (wrongHash.length || closureMismatch.some((c) => c !== "closure-not-checkable" && c !== "closure-absent")) reasons.push("closure-mismatch");
  if (closureMismatch.some((c) => c === "closure-not-checkable" || c === "closure-absent")) reasons.push("closure-unchecked"); // nobody checked: not the same as the bytes being wrong
  if (unfilledSlots.length) reasons.push("slot-unfilled");
  if (duplicateMembers.length) reasons.push("ambiguous-archive");
  if (unsafeName.length) reasons.push("unsafe-name");
  if (linked.length && release) reasons.push("linked-member");
  if (unpinnedDependencies.length && release) reasons.push("dependency-unpinned");
  const ok = !duplicateMembers.length && !unsafeName.length && (!release || (!linked.length && !unpinnedDependencies.length)) && !missing.length && !wrongSize.length && !wrongHash.length && !unfilledSlots.length && !credentialLike.length && !closureMismatch.length && (!release || !undeclaredExtra.length) && (!deep || !unverified.length);
  return { ok, missing: sorted(missing), wrongSize: wrongSize.sort((a, b) => (a.name < b.name ? -1 : 1)), wrongHash: wrongHash.sort((a, b) => (a.name < b.name ? -1 : 1)), unverified: sorted(unverified), unfilledSlots: sorted(unfilledSlots), undeclaredExtra, credentialLike, duplicateMembers, linked, unsafeName, unpinnedDependencies, closureMismatch: sorted(closureMismatch), slots, reasons };
}

/** The manifest with each slot's `filled` set from a verifier report: the ONLY way `filled` becomes true, so explainSupport's `slot-unfilled` rests on checked bytes. */
export function withVerifiedSlots(manifest, report) {
  const byName = new Map(report.slots.map((s) => [s.name, s.filled]));
  return { ...manifest, view: { ...manifest.view, slots: (manifest.view.slots ?? []).map((s) => ({ ...s, filled: byName.get(s.name) === true })) } };
}

/**
 * A service profile names its models (manifests), where each one's files are (`dir`, under the inventory root), its user-supplied slots (carried by the manifests) and its remote providers.
 * `offline` is DERIVED capability: every model local, no remote provider, every required slot filled; `offlineReady` = ok && offline (all bytes present and verified). Models that share a `dir` share an inventory, so a file is "extra" only when no model of the profile declares it.
 *   profile:      {id, label, models: [{id, manifest, dir?}], remoteProviders?: string[]}
 *   inventories:  {[dir]: inventory}   ("" for the root)
 */
export function evaluateProfile(profile, inventories, { release = false, deep = true, closure = null, validateSlot = null } = {}) {
  const groups = new Map();
  for (const m of profile.models) { const d = m.dir ?? ""; if (!groups.has(d)) groups.set(d, []); groups.get(d).push(m); }
  const models = {};
  for (const [dir, members] of groups) {
    const inv = asMap(inventories[dir] ?? {});
    const declaredByOthers = (self) => new Set(members.filter((x) => x !== self).flatMap((x) => [...x.manifest.view.files.map((f) => f.name), ...(x.manifest.descriptor.dependencies ?? []).map((d) => d.name).filter(Boolean), ...(x.manifest.view.slots ?? []).map((s) => s.name)]));
    for (const m of members) {
      const r = verifyManifest(m.manifest, inv, { release, deep, closure, validateSlot });
      const others = declaredByOthers(m);
      r.undeclaredExtra = r.undeclaredExtra.filter((n) => !others.has(n));
      const own = new Set([...m.manifest.view.files.map((f) => f.name), ...(m.manifest.descriptor.dependencies ?? []).map((d) => d.name), ...(m.manifest.view.slots ?? []).map((s) => s.name)]);
      r.credentialLike = r.credentialLike.filter((n) => own.has(n) || r.undeclaredExtra.includes(n));
      r.ok = !r.missing.length && !r.wrongSize.length && !r.wrongHash.length && !r.unfilledSlots.length && !r.credentialLike.length && !r.closureMismatch.length && !r.duplicateMembers.length && !r.unsafeName.length && (!release || (!r.linked.length && !r.unpinnedDependencies.length)) && (!release || !r.undeclaredExtra.length) && (!deep || !r.unverified.length);
      models[m.id] = r;
    }
  }
  const remoteProviders = profile.remoteProviders ?? [];
  const allLocal = profile.models.every((m) => (m.manifest.view.provider ?? "local") === "local");
  const slotsFilled = Object.values(models).every((r) => !r.unfilledSlots.length);
  const reasons = [...new Set(Object.values(models).flatMap((r) => r.reasons))];   // each model keeps its own order; the profile lists each reason once
  const ok = Object.values(models).every((r) => r.ok), offline = allLocal && !remoteProviders.length && slotsFilled;
  // `offline` is a CAPABILITY (local models, no remote provider, filled slots); `offlineReady` is the verdict a page may act on: capable AND every byte present and verified
  return { ok, offline, offlineReady: ok && offline, remoteProviders: [...remoteProviders], models, reasons };
}

/**
 * Measure Blobs or Files into an inventory in a browser or in Node: `files` is a Map of relative name -> Blob, and `hash(blob)` returns the SHA-256 hex (the package's own chunked,
 * incremental hasher: hash-blob.mjs, which never reads a whole file into memory). Files are hashed ONE AT A TIME, so memory stays bounded. `onProgress({file, filesDone, filesTotal,
 * bytesDone, bytesTotal})` after each file and `signal` (an AbortSignal) cancel and report a long measurement (a 200 MB bundle on a phone).
 *
 * THE INVENTORY MUST BE MEASURED FROM THE STORE THE ENGINE WILL READ (the cache or OPFS after install, or the very Blobs the engine is handed): a verdict on a picked folder says nothing
 * about a different copy loaded afterwards. `closure` given to verifyManifest must be SYNCHRONOUS (a vendored pure-JS SHA-256 in a page; crypto.subtle is async and would compare a Promise).
 */
export async function inventoryFromFiles(files, hash, { onProgress = null, signal = null } = {}) {
  const out = new Map(); const entries = [...(files instanceof Map ? files : new Map(Object.entries(files)))];
  const bytesTotal = entries.reduce((n, [, b]) => n + b.size, 0); let bytesDone = 0, filesDone = 0;
  for (const [name, blob] of entries) {
    signal?.throwIfAborted?.();
    out.set(name, { bytes: blob.size, sha256: hash ? await hash(blob) : undefined });
    bytesDone += blob.size; filesDone++;
    onProgress?.({ file: name, filesDone, filesTotal: entries.length, bytesDone, bytesTotal });
  }
  return out;
}

/**
 * A browser's file list (a directory picker's File objects with webkitRelativePath, or a flat list from a phone) as a Map of manifest names to Files. `stripRoot` removes the picked
 * folder's own name (the first path segment) when every path shares it; `normalize` ("NFC" by default) composes names so a macOS NFD name matches the manifest. Two files that become the
 * same name are REFUSED (a name must mean one file). A flat list has no folders, so a manifest whose names are folder-shaped cannot be matched from it: give the person ONE tar file instead.
 */
export function filesFromList(list, { stripRoot = true, normalize = "NFC" } = {}) {
  const items = [...list].map((f) => [f.webkitRelativePath || f.name, f]);
  const roots = new Set(items.map(([p]) => p.split("/")[0]));
  const strip = stripRoot && items.length > 0 && items.every(([p]) => p.includes("/")) && roots.size === 1;
  const out = new Map();
  for (const [p, f] of items) {
    let name = strip ? p.slice(p.indexOf("/") + 1) : p;
    if (normalize) name = name.normalize(normalize);
    if (out.has(name)) throw Object.assign(new RangeError(`two files have the same name after normalising: ${name}`), { code: "name-collision", name });
    out.set(name, f);
  }
  return out;
}

/** The inventory of an uncompressed tar held as a Blob/File (the portable source on a phone): the index is read with range reads, each member is hashed from its slice, and duplicates, links and unsafe names are carried on the inventory for the verifier. */
export async function inventoryFromTar(blob, hash, { onProgress = null, signal = null } = {}) {
  const index = await readTarIndex(async (start, length) => new Uint8Array(await blob.slice(start, start + length).arrayBuffer()), blob.size, { signal });
  const last = new Map(index.members.map((m) => [m.name, m]));
  const files = new Map([...last].map(([name, m]) => [name, blob.slice(m.offset, m.offset + m.bytes)]));
  const inv = await inventoryFromFiles(files, hash, { onProgress, signal });
  inv.problems = { duplicateMembers: index.duplicateMembers, linked: index.linked, unsafeNames: index.unsafeNames };
  return inv;
}
