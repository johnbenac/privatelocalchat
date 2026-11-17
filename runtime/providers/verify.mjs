// Pure inventory comparison and progress arithmetic for the model manager. No DOM, no storage: the caller supplies what it found.

/**
 * expected: [{ path, bytes, sha256? }]   actual: Map<path, bytes> | { [path]: bytes }
 * A file is `ok` only when its stored size equals the catalogue size. A zero-length entry is `empty` (the WebLLM F5 failure:
 * an interrupted download leaves a zero-byte cache entry that the engine trusts). Anything not in the catalogue is `extra`
 * (reported, never silently counted as the model).
 */
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
