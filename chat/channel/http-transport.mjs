// SPDX-License-Identifier: AGPL-3.0-only
// The channel client's transport over the message handoff's HTTP binding (docs/CHANNEL-CLIENT.md): one POST route, one JSON object in, newline-delimited JSON records out.
// A running host answers on its own computer's loopback address; there is no subscription and no cursor on the wire, so her replies are fetched by asking the endpoint for the
// status of the messages this person sent (a `status-query`), and a reply seen once is never passed on twice. Pure apart from the injected `fetch`, clock and timers: no page,
// no storage, no host name, and nothing here answers in her place.
//
//   createHttpTransport({ url, fetch?, pollMs?, timeoutMs?, timers? }) -> { request(frame), subscribe({after}, onFrame, onClose), track(ids), untrack(ids), stop() }
//   request(frame)  POST the frame, resolve the answer records; REJECTS when nothing answered (a refusal is an ANSWER, not a rejection)
//   subscribe(...)  starts a poll loop over the tracked message ids; each new reply record is passed to onFrame(frame, seq) with a growing seq; every OTHER record of an answer (a status, a
//                   refusal) is passed to onRecord(frame) with no seq, so the client learns the receipts, and that the host answered at all (or refused: a refusal is an answer)
//                   onClose('unreachable') means a poll got NO answer (a refusal is never that); the client says `unreachable`, not `unavailable`
//   probeId         a message id nobody sent (a UUID): while nothing is tracked, the loop asks about it, so the state of the host is known before the first message
//   nudge()         ask quickly now and for a while (a send, Check status, the tab shown again); with nothing happening the wait doubles from pollMs up to maxMs (15 s), and a tab hidden
//                   for more than hiddenPauseMs (60 s) is not polled until it is shown
//   track(ids)      the message ids to ask about (the page adds the ids of messages it sent, also after a reload)
export const DEFAULT_POLL_MS = 1500;
export const DEFAULT_TIMEOUT_MS = 15000;

/** The records of an NDJSON body. A line that is not a JSON object makes the whole answer unusable: the outcome is then unknown, never guessed. */
export function parseRecords(text) {
  const out = [];
  for (const line of String(text).split('\n')) {
    const t = line.trim();
    if (!t) continue;
    let v;
    try { v = JSON.parse(t); } catch { throw new Error('the answer was not newline-delimited JSON'); }
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('the answer held a record that is not an object');
    out.push(v);
  }
  return out;
}

export function createHttpTransport({ url, fetch: fetchImpl = globalThis.fetch?.bind(globalThis), pollMs = DEFAULT_POLL_MS, timeoutMs = DEFAULT_TIMEOUT_MS, probeId = null, quietMs = 30000, maxMs = 15000, hiddenPauseMs = 60000, now = () => Date.now(), doc = globalThis.document,
  timers = { set: (fn, ms) => globalThis.setTimeout(fn, ms), clear: (id) => globalThis.clearTimeout(id) } } = {}) {
  if (typeof url !== 'string' || !/^https?:\/\//.test(url)) throw new TypeError('url must be the http(s) address of the message handoff route');
  if (typeof fetchImpl !== 'function') throw new TypeError('a fetch function is required');
  const tracked = new Set(), seen = new Set(), log = [];
  let seq = 0, loop = null, interval = pollMs, activeAt = now(), hiddenSince = null, visListener = null, tickFn = null, onFrameFn = null, onCloseFn = null, onRecordFn = null, stopped = false, running = false;

  async function post(frame, signal) {
    const controller = new AbortController();
    const timer = timers.set(() => controller.abort(), timeoutMs);
    const abort = () => controller.abort();
    signal?.addEventListener?.('abort', abort, { once: true });
    try {
      const response = await fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(frame), signal: controller.signal, cache: 'no-store', credentials: 'omit' });
      const body = await response.text();
      if (!response.ok) {
        const type = response.headers?.get?.('content-type') || '';
        if (!/ndjson|json/.test(type)) throw new Error('the host answered HTTP ' + response.status);
        return parseRecords(body);   // a refusal that the endpoint wrote as records is an answer
      }
      return parseRecords(body);
    } finally { timers.clear(timer); signal?.removeEventListener?.('abort', abort); }
  }

  const occKey = (frame) => frame.occ ? frame.occ.source + '\u0000' + frame.occ.id : null;

  async function pollOnce() {
    if (running || stopped || !onFrameFn) return;
    running = true;
    try {
      const ids = tracked.size ? [...tracked] : probeId ? [probeId] : [];
      for (const id of ids) {
        let records;
        try { records = await post({ kind: 'status-query', messageId: id }); } catch { if (!stopped) onCloseFn?.('unreachable'); break; }   // no answer: the others would only wait as long

        if (stopped) return;
        for (const frame of records) {
          if (frame.kind !== 'reply') { try { onRecordFn?.(frame); } catch { /* a listener must not stop the poll */ } continue; }
          const key = occKey(frame);
          if (key === null || seen.has(key)) continue;
          seen.add(key);
          activeAt = now(); interval = pollMs;   // she spoke: ask quickly again
          log.push({ frame, seq: ++seq });
          onFrameFn?.(frame, seq);
        }
      }
    } finally { running = false; }
  }

  const dropVis = () => { if (visListener && doc?.removeEventListener) doc.removeEventListener('visibilitychange', visListener); visListener = null; };
  const api = {
    request: (frame) => post(frame),
    subscribe({ after = 0 } = {}, onFrame, onClose, onRecord) {
      onFrameFn = onFrame; onCloseFn = onClose || null; onRecordFn = onRecord || null; stopped = false;
      for (const item of log) if (item.seq > after) onFrame(item.frame, item.seq);   // what this transport already saw, after the cursor
      // The schedule: fast (pollMs) for quietMs after anything happened (a send, a nudge, a reply, the tab coming back), then the wait doubles up to maxMs while nothing arrives.
      // A tab hidden for more than hiddenPauseMs is not polled at all; it is asked at once when it is shown again.
      const tick = () => {
        if (stopped) return;
        const hiddenLong = doc?.hidden && hiddenSince !== null && now() - hiddenSince > hiddenPauseMs;
        const next = () => { if (stopped) return; if (now() - activeAt >= quietMs) interval = Math.min(maxMs, interval * 2); else interval = pollMs; loop = timers.set(tick, hiddenLong ? maxMs : interval); };
        if (hiddenLong) { next(); return; }
        void pollOnce().finally(next);
      };
      tickFn = tick;
      if (doc?.addEventListener) {
        visListener = () => { if (doc.hidden) { hiddenSince = now(); return; } hiddenSince = null; api.nudge(); };
        doc.addEventListener('visibilitychange', visListener);
        if (doc.hidden) hiddenSince = now();
      }
      interval = pollMs; activeAt = now();
      loop = timers.set(tick, 0);
      return { close: () => { stopped = true; if (loop !== null) timers.clear(loop); loop = null; onFrameFn = null; } };
    },
    track(ids) { for (const id of [].concat(ids)) tracked.add(String(id)); },
    untrack(ids) { for (const id of [].concat(ids)) tracked.delete(String(id)); },
    pollNow: pollOnce,
    /** Something happened that makes an answer likely (a message was sent, the person asked for the status, the tab is back): ask quickly now and keep asking quickly for a while. */
    nudge() { activeAt = now(); interval = pollMs; if (!stopped && tickFn && loop !== null) { timers.clear(loop); loop = timers.set(tickFn, 0); } },
    intervalMs: () => interval,
    stop() { stopped = true; if (loop !== null) timers.clear(loop); loop = null; onFrameFn = null; onRecordFn = null; dropVis(); }
  };
  return api;
}
