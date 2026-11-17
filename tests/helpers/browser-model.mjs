// A model of what real Chromium showed (T418 race diagnosis): several tabs, each with its OWN view of localStorage. A write is seen at once by its own tab and reaches the other tabs' views after a
// delay (in order per key). The Web Lock manager is strongly consistent. STAND-INS: localStorage (Maps with delayed delivery), Web Locks (in-process queue), the IndexedDB record (memoryBackend).
// What is real: chat/encounters/* including the SHA-256 digests and the coordination protocol.
export function lockManager() {
  const tails = new Map(); const held = [];
  return {
    held,
    request(name, opts, fn) {
      if (typeof opts === 'function') { fn = opts; opts = {}; }
      const entry = { name, mode: opts.mode || 'exclusive' };
      const run = async () => { held.push(entry); try { return await fn({ name, mode: entry.mode }); } finally { held.splice(held.indexOf(entry), 1); } };
      if (entry.mode === 'shared') return run();
      const p = (tails.get(name) || Promise.resolve()).then(run); tails.set(name, p.catch(() => {})); return p;
    },
    query: async () => ({ held: held.map((h) => ({ name: h.name, mode: h.mode })), pending: [] }),
  };
}
export function browser(n, { lag = 8, lagFn } = {}) {
  const views = Array.from({ length: n }, () => new Map()); let seq = 0;
  const mk = (view, i) => ({
    getItem: (k) => (view.has(k) ? view.get(k).v : null),   // a removal is a tombstone { v: null }
    setItem: (k, v) => { const s = ++seq; view.set(k, { v: String(v), s }); views.forEach((o, j) => { if (j !== i) setTimeout(() => { const cur = o.get(k); if (!cur || cur.s < s) o.set(k, { v: String(v), s }); }, lagFn ? lagFn() : 1 + Math.random() * lag); }); },
    removeItem: (k) => { const s = ++seq; view.set(k, { v: null, s }); views.forEach((o, j) => { if (j !== i) setTimeout(() => { const cur = o.get(k); if (!cur || cur.s < s) o.set(k, { v: null, s }); }, lagFn ? lagFn() : 1 + Math.random() * lag); }); },
  });
  const tabs = views.map(mk);
  const truth = (k) => { let best = null; for (const v of views) { const x = v.get(k); if (x && (!best || x.s > best.s)) best = x; } return best ? best.v : null; };
  /** A NEW tab: its view is loaded from the browser's real state at this moment (a document that starts late cannot lag). */
  const spawn = () => { const view = new Map(); const keys = new Set(views.flatMap((v) => [...v.keys()])); for (const k of keys) { let best = null; for (const v of views) { const x = v.get(k); if (x && (!best || x.s > best.s)) best = x; } if (best) view.set(k, { ...best }); } views.push(view); const t = mk(view, views.length - 1); tabs.push(t); return t; };
  return { tabs, truth, views, spawn };
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const within = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('no deadlock: ' + what + ' did not finish in ' + ms + ' ms')), ms))]);
