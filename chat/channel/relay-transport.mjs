// SPDX-License-Identifier: AGPL-3.0-only
// The channel client's transport over a RELAY (docs/CHANNEL-CLIENT.md): one WebSocket to a content-blind relay that both this page and the mind's host dial OUT to, so a page served over https
// in any browser can reach a mind (no loopback address, no mixed content). The interface is the one of http-transport.mjs; only what the carrier does differently is different:
//
//   createRelayTransport({ url, getToken, WebSocket?, timeoutMs?, connectTimeoutMs?, probeId?, timers?, doc?, now? })
//     -> { request(frame), subscribe({after}, onFrame, onClose, onRecord), track(ids), untrack(ids), nudge(), suspend(), stop() }
//   relayUrl({ address, channel }) -> the address of the relay's channel (always the secure scheme, except a relay on this computer's own loopback), or null
//
// THE WIRE. Every WebSocket message is TEXT: one routing line (a JSON object), a newline, then ONE contract frame. A surface sends `{"t":"msg"}`; what the host sends comes back as
// `{"t":"msg","from":"host"}`. The relay also sends control lines: host-present and host-absent (a state of the other side, told at once, also right after connecting), and `refused`
// (nothing was forwarded: no-host, queue-full, bad-routing). The relay keeps nothing, has no cursor and replays nothing.
// THE TOKEN. It is a WebSocket subprotocol (`bearer.<token>`), never in the address and never in a frame; `getToken()` is asked at EVERY (re)connect, so a fresh token the person put in is
// used and no token is ever invented here. No token: nothing is opened and the client is told `no-token`.
// RECEIPTS AND REPLIES ARE PUSHED. request(frame) resolves with the FIRST frame the host answers for it (a receipt, a status, a refusal); every later one is passed to onRecord, and each reply
// to onFrame(frame, seq) with a growing seq. A reply seen once (by its id, or by its occurrence key) is never passed on twice, also after a reconnect or a restart of the host.
// WHAT EACH ENDING MEANS (the reason passed to onClose; the client turns it into what the person sees):
//   'superseded'  close code 4000: the same person opened this conversation in another tab and that one stays. Never reconnected: it would only take the connection back, in a loop.
//   'revoked'     close code 4001: the relay says this token is not allowed any more. Never reconnected: a fresh token is the person's act.
//   'insecure'    the connection failed before it opened on a secure address. The browser gives no cause (a certificate it does not trust looks like a refused connection), so this says only that.
//   'unreachable' no answer at all (a silence, or an open link that was lost). Reconnected with a wait of 1.5 s doubling to 15 s, reset by any message.
//   'no-token'    nothing to present.
// A refusal of the relay itself (no host connected) is an ANSWER, not a silence: request() resolves it as `{kind:'refusal', class:'unavailable'}` and a `host-absent` line is passed to onRecord
// the same way, so the client says UNAVAILABLE, never unreachable. A frame larger than 1 MiB is never sent: it resolves as a refusal `over-limit`.
export const SUBPROTOCOL = 'relay.v1';
export const MAX_FRAME_BYTES = 1024 * 1024;
export const CLOSE = Object.freeze({ superseded: 4000, revoked: 4001, tokenRefused: 4401 });
export const BACKOFF_START_MS = 1500;
export const BACKOFF_MAX_MS = 15000;
export const DEFAULT_TIMEOUT_MS = 15000;
const CHANNEL = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,79}$/;
const MAX_SEEN = 4000;
const MAX_QUERIES = 20;
const encoder = new TextEncoder();
const isLoopback = (h) => h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h.endsWith('.localhost');

/** The channel's address on a relay. With `readableRefusal` the relay answers a refused token INSIDE the socket (a control line and close 4401), which a page can read; without it a refused token is a bare 401 the page cannot tell from a dead network. The scheme is always the secure one (https or wss given); plain http or ws is taken only for the loopback address of this computer. Never holds a token. */
export function relayUrl({ address, channel, readableRefusal = false } = {}) {
  let u;
  try { u = new URL(String(address || '').trim()); } catch { return null; }
  if (!['http:', 'https:', 'ws:', 'wss:'].includes(u.protocol) || u.username || u.password || u.search || u.hash) return null;
  const secure = u.protocol === 'https:' || u.protocol === 'wss:';
  if (!secure && !isLoopback(u.hostname)) return null;
  const id = String(channel || '').trim();
  if (!CHANNEL.test(id)) return null;
  return (secure ? 'wss:' : 'ws:') + '//' + u.host + (u.pathname.replace(/\/+$/, '')) + '/channel/' + encodeURIComponent(id) + '?as=surface' + (readableRefusal ? '&refusal=socket' : '');
}

export function createRelayTransport({ url, getToken, WebSocket: WS = globalThis.WebSocket, timeoutMs = DEFAULT_TIMEOUT_MS, connectTimeoutMs = DEFAULT_TIMEOUT_MS, probeId = null, hiddenPauseMs = 60000, now = () => Date.now(),
  doc = globalThis.document, maxFrameBytes = MAX_FRAME_BYTES, timers = { set: (fn, ms) => globalThis.setTimeout(fn, ms), clear: (id) => globalThis.clearTimeout(id) } } = {}) {
  if (typeof url !== 'string' || !/^wss?:\/\//.test(url)) throw new TypeError('url must be the address of a relay channel (see relayUrl)');
  if (/bearer\.|[?&]token=/i.test(url)) throw new TypeError('the token is never part of the address');
  if (typeof WS !== 'function') throw new TypeError('a WebSocket implementation is required');
  const tokenOf = typeof getToken === 'function' ? getToken : () => getToken;
  const secureUrl = url.startsWith('wss:');
  const tracked = new Set(), seenIds = new Set(), seenOcc = new Set(), pending = new Set();
  let ws = null, opened = false, wantOpen = false, stopped = false, suspended = false, terminal = null, tokenRefusedSeen = false, seq = 0, backoff = BACKOFF_START_MS, reconnectTimer = null, connectTimer = null, lastClose = null;
  let onFrameFn = null, onCloseFn = null, onRecordFn = null, visListener = null, hiddenSince = null, deferred = false;

  const remember = (set, key) => { set.add(key); if (set.size > MAX_SEEN) set.delete(set.values().next().value); };
  const emitClose = (reason) => { if (lastClose === reason) return; lastClose = reason; try { onCloseFn?.(reason); } catch { /* a listener must not stop the transport */ } };
  const record = (frame) => { try { onRecordFn?.(frame); } catch { /* a listener must not stop the transport */ } };
  const byteLength = (text) => encoder.encode(text).length;
  const hiddenLong = () => Boolean(doc?.hidden) && hiddenSince !== null && now() - hiddenSince > hiddenPauseMs;

  function rejectAll(message) { for (const e of [...pending]) { pending.delete(e); timers.clear(e.timer); e.reject(new Error(message)); } }
  function settle(entry, frames) { if (!pending.delete(entry)) return; timers.clear(entry.timer); entry.resolve(frames); }

  // ---- the connection ----------------------------------------------------------------------------------------------------------------------------------------------------------------
  function dropSocket() {
    const sock = ws; ws = null; opened = false;
    if (connectTimer !== null) { timers.clear(connectTimer); connectTimer = null; }
    if (sock) { sock.onopen = sock.onmessage = sock.onclose = sock.onerror = null; try { sock.close(1000); } catch { /* already closed */ } }
    rejectAll('the connection was closed');
  }
  function scheduleReconnect() {
    if (stopped || !wantOpen || terminal || suspended || reconnectTimer !== null) return;
    const wait = backoff; backoff = Math.min(BACKOFF_MAX_MS, backoff * 2);
    reconnectTimer = timers.set(() => { reconnectTimer = null; if (hiddenLong()) { deferred = true; return; } open(); }, wait);   // a tab hidden for long is not reconnected until it is shown
  }
  function open() {
    if (stopped || !wantOpen || terminal || suspended || ws) return;
    const token = String(tokenOf() || '');
    if (!token) { emitClose('no-token'); return; }
    let sock;
    try { sock = new WS(url, [SUBPROTOCOL, 'bearer.' + token]); } catch { emitClose('unreachable'); scheduleReconnect(); return; }
    ws = sock; opened = false;
    connectTimer = timers.set(() => { connectTimer = null; if (ws === sock && !opened) { dropSocket(); emitClose('unreachable'); scheduleReconnect(); } }, connectTimeoutMs);   // no answer at all
    sock.onopen = () => { if (ws !== sock) return; opened = true; if (connectTimer !== null) { timers.clear(connectTimer); connectTimer = null; } };
    sock.onmessage = (event) => { if (ws === sock) onMessage(event?.data); };
    sock.onerror = () => { /* the close that follows says what happened */ };
    sock.onclose = (event) => {
      if (ws !== sock) return;
      const wasOpen = opened; ws = null; opened = false;
      if (connectTimer !== null) { timers.clear(connectTimer); connectTimer = null; }
      rejectAll('the connection was lost');
      const code = Number(event?.code);
      if (code === CLOSE.superseded) { terminal = 'superseded'; emitClose('superseded'); return; }
      if (code === CLOSE.revoked) { terminal = 'revoked'; emitClose('revoked'); return; }
      if (code === CLOSE.tokenRefused || tokenRefusedSeen) { terminal = 'token-refused'; emitClose('token-refused'); return; }   // the relay said the TOKEN was refused (expired, revoked, forged, wrong channel: it does not say which): the person's act, never a loop
      if (stopped || !wantOpen || suspended) return;
      emitClose(!wasOpen && secureUrl ? 'insecure' : 'unreachable');
      scheduleReconnect();
    };
  }

  // ---- what arrives ------------------------------------------------------------------------------------------------------------------------------------------------------------------
  function askAboutTracked() {   // after the host is (back) there: nothing was replayed, so ask about the messages the person sent; the receipts and any reply it still holds come back as pushed frames
    for (const id of [...tracked].slice(-MAX_QUERIES)) { try { ws?.send(JSON.stringify({ t: 'msg' }) + '\n' + JSON.stringify({ kind: 'status-query', messageId: id })); } catch { /* the close says it */ } }
  }
  const refusalFor = (reason, messageId) => ({ kind: 'refusal', class: 'unavailable', messageId: messageId ?? null, reason: String(reason || 'refused') });
  function onControl(routing) {
    if (routing.code === 'host-present') { record({ kind: 'presence', present: true }); askAboutTracked(); }
    else if (routing.code === 'host-absent') record(refusalFor('host-absent'));
    else if (routing.code === 'refused' && routing.reason === 'token' && routing.for === 'connect') tokenRefusedSeen = true;   // the readable refusal of a connection (the close follows)
    else if (routing.code === 'refused') {   // a message the relay did NOT forward: said to the newest request that waits for an answer; the relay answered, so it is a refusal and never a silence
      const waiting = [...pending].reverse()[0];
      if (waiting) settle(waiting, [refusalFor(routing.reason, waiting.messageId)]);
      else if (routing.reason === 'no-host') record(refusalFor('no-host'));
    }
  }
  function onFrame(frame) {
    if (frame.kind === 'reply') {
      const occ = frame.occ && typeof frame.occ === 'object' ? String(frame.occ.source) + '\u0000' + String(frame.occ.id) : null;
      if (occ === null) return;
      const id = typeof frame.id === 'string' ? frame.id : null;
      if (seenOcc.has(occ) || (id !== null && seenIds.has(id))) return;   // the same reply, again (a retry, a reconnect, a restarted host): passed on once
      remember(seenOcc, occ); if (id !== null) remember(seenIds, id);
      seq += 1;
      try { onFrameFn?.(frame, seq); } catch { /* a listener must not stop the transport */ }
      return;
    }
    const messageId = frame.messageId ?? null;
    const answers = ['receipt', 'status', 'refusal', 'revocation-ack'].includes(frame.kind);
    const waiting = answers ? [...pending].filter((e) => (messageId !== null ? e.messageId === messageId : e.type === 'revocation' || frame.kind === 'refusal')) : [];
    if (waiting.length) { for (const e of waiting.slice(0, messageId === null ? 1 : waiting.length)) settle(e, [frame]); return; }
    record(frame);
  }
  function onMessage(data) {
    if (typeof data !== 'string') return;   // a text-only link
    backoff = BACKOFF_START_MS; lastClose = null;
    const i = data.indexOf('\n');
    let routing;
    try { routing = JSON.parse(i < 0 ? data : data.slice(0, i)); } catch { return; }
    if (!routing || typeof routing !== 'object') return;
    if (routing.t === 'ctl') { onControl(routing); return; }
    if (routing.t !== 'msg' || i < 0) return;
    let frame;
    try { frame = JSON.parse(data.slice(i + 1)); } catch { return; }   // a body that is not one JSON object is unusable: never guessed at
    if (frame && typeof frame === 'object' && !Array.isArray(frame)) onFrame(frame);
  }

  // ---- the interface -----------------------------------------------------------------------------------------------------------------------------------------------------------------
  const dropVis = () => { if (visListener && doc?.removeEventListener) doc.removeEventListener('visibilitychange', visListener); visListener = null; };
  const api = {
    kind: 'relay',
    /** One request. Resolves the first answer of the host (or the relay's refusal); REJECTS when nothing answered or there is no connection (the outcome is then unknown). */
    request(frame) {
      if (!ws || !opened || ws.readyState !== 1) return Promise.reject(new Error('not connected to the relay'));
      const text = JSON.stringify({ t: 'msg' }) + '\n' + JSON.stringify(frame);
      const messageId = frame?.kind === 'status-query' ? frame.messageId : frame?.id ?? null;
      if (byteLength(text) > maxFrameBytes) return Promise.resolve([{ kind: 'refusal', class: 'over-limit', messageId, reason: 'larger than the relay allows (1 MiB)' }]);   // never sent
      return new Promise((resolve, reject) => {
        const entry = { type: frame?.kind === 'revocation' ? 'revocation' : frame?.kind === 'status-query' ? 'status' : 'message', messageId, resolve, reject, timer: null };
        entry.timer = timers.set(() => { if (pending.delete(entry)) reject(new Error('no answer')); }, timeoutMs);
        pending.add(entry);
        try { ws.send(text); } catch (error) { pending.delete(entry); timers.clear(entry.timer); reject(error); }
      });
    },
    subscribe(_cursor, onFrameCb, onClose, onRecord) {   // no cursor: the relay replays nothing
      onFrameFn = onFrameCb; onCloseFn = onClose || null; onRecordFn = onRecord || null;
      stopped = false; suspended = false; wantOpen = true; terminal = null; tokenRefusedSeen = false; lastClose = null; backoff = BACKOFF_START_MS; deferred = false;
      if (doc?.addEventListener && !visListener) {
        visListener = () => { if (doc.hidden) { hiddenSince = now(); return; } hiddenSince = null; api.nudge(); };
        doc.addEventListener('visibilitychange', visListener);
        if (doc.hidden) hiddenSince = now();
      }
      open();
      return { close: () => { wantOpen = false; if (reconnectTimer !== null) { timers.clear(reconnectTimer); reconnectTimer = null; } dropSocket(); onFrameFn = onCloseFn = onRecordFn = null; dropVis(); } };
    },
    track(ids) { for (const id of [].concat(ids)) tracked.add(String(id)); },
    untrack(ids) { for (const id of [].concat(ids)) tracked.delete(String(id)); },
    /** The tab is shown again, or the person asks: a lost link is reopened now (never a superseded or revoked one: that is the person's act, `subscribe` again). */
    nudge() {
      deferred = false;
      if (!wantOpen || stopped || suspended || terminal || ws) return;
      if (reconnectTimer !== null) { timers.clear(reconnectTimer); reconnectTimer = null; }
      backoff = BACKOFF_START_MS; open();
    },
    /** Let go of the connection without a reason to come back by itself (the person is changing it); `subscribe` again resumes. */
    suspend() { suspended = true; if (reconnectTimer !== null) { timers.clear(reconnectTimer); reconnectTimer = null; } dropSocket(); },
    probeId: () => probeId,
    stop() { stopped = true; wantOpen = false; if (reconnectTimer !== null) { timers.clear(reconnectTimer); reconnectTimer = null; } dropSocket(); onFrameFn = onCloseFn = onRecordFn = null; dropVis(); },
    // for tests and the screen: what the transport knows
    state: () => ({ open: Boolean(ws && opened), terminal, backoffMs: backoff, waitingForTab: deferred })
  };
  return api;
}

/**
 * One look at a relay, for the setup's Check: connect, wait for the relay's first control line, close. Resolves { kind, reason }:
 *   available (the host is connected) | unavailable (the relay answered: no host) | unreachable | insecure | revoked | superseded (it took the connection of another tab of this person) | no-token
 * The token is presented as a subprotocol only; nothing is sent.
 */
export function checkRelay({ url, token, WebSocket: WS = globalThis.WebSocket, timeoutMs = DEFAULT_TIMEOUT_MS, timers = { set: (fn, ms) => globalThis.setTimeout(fn, ms), clear: (id) => globalThis.clearTimeout(id) } } = {}) {
  return new Promise((resolve) => {
    if (!token) { resolve({ kind: 'no-token' }); return; }
    let done = false, opened = false, sock = null;
    const finish = (r) => { if (done) return; done = true; timers.clear(timer); if (sock) { sock.onopen = sock.onmessage = sock.onclose = sock.onerror = null; try { sock.close(1000); } catch { /* closed */ } } resolve(r); };
    const timer = timers.set(() => finish({ kind: 'unreachable' }), timeoutMs);
    try { sock = new WS(url, [SUBPROTOCOL, 'bearer.' + token]); } catch { finish({ kind: 'unreachable' }); return; }
    sock.onopen = () => { opened = true; };
    sock.onmessage = (event) => {
      if (typeof event?.data !== 'string') return;
      try { const r = JSON.parse(event.data.split('\n')[0]); if (r?.t === 'ctl' && r.code === 'host-present') finish({ kind: 'available' }); else if (r?.t === 'ctl' && r.code === 'host-absent') finish({ kind: 'unavailable' }); } catch { /* not a line of the relay */ }
    };
    sock.onclose = (event) => {
      const code = Number(event?.code);
      if (code === CLOSE.superseded) finish({ kind: 'superseded' });
      else if (code === CLOSE.revoked) finish({ kind: 'revoked' });
      else finish({ kind: !opened && url.startsWith('wss:') ? 'insecure' : 'unreachable' });
    };
  });
}
