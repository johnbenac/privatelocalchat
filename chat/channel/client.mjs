// The channel client: this app's side of the message handoff contract for a running mind (a pinned copy of the contract is in tests/fixtures/message-handoff/, the plan in docs/CHANNEL-CLIENT.md).
// PREPARATION: it is tested against the contract's reference endpoint and is NOT wired into the page. It runs against a real running mind only when a host that answers the contract exists.
//
// What it does: it sends a person's words as contract messages (one id per attempt group, reused unchanged on every retry), turns the five receipts into the states a person can see, resolves an
// uncertain outcome with a status query (known: do not resend; not known: resend the SAME message), and receives her replies from a stream that is resumed from the last sequence number it saw.
// Every reply carries an occurrence identity (occ.source + occ.id): a reply seen once is never shown again, also after a reconnect or a reload (the seen keys are kept in the injected `store`).
// When she cannot be reached the client says so (`availability`): a closed tab or a stopped host is `unavailable`, a lost connection is `unreachable`. NOTHING answers in her place: this module has
// no model, no prompt and no fallback of any kind, and a refused or unsent message is never queued as if she were alive.
//
// What it does NOT do: it stores nothing itself (the `store` is the caller's), writes no ledger and no typed records (her words are not kept anywhere until real deletion exists and the owner says so), opens no
// network connection of its own (the `transport` is the caller's), names no host, and never touches the page.
//
//   transport.request(frame) -> Promise<frame[]>      one request, the endpoint's answers; REJECTS when no answer arrived (the outcome is then unknown)
//   transport.subscribe({ after }, onFrame, onClose) -> { close() }      the stream of her replies; onFrame(frame, seq), seq a number that grows; onClose(reason) when it ends
//   store.load() -> state | null, store.save(state) -> Promise|void      what survives a reload: messages, the occurrence keys seen, the stream cursor
import { digestOf } from '../encounters/records.mjs';

export const STATES = Object.freeze(['accepted', 'delivered', 'exposed', 'interpreted', 'persisted']);
const REFUSED = new Set(['not-admitted', 'revoked', 'malformed', 'over-limit']);
const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const occKey = (occ) => occ.source + '\u0000' + occ.id;

export function createChannelClient({ transport, resident, encounter, participant, source, newId, store = null, maxAttempts = 3, now = () => Date.now(), onChange = () => {}, onReply = () => {} } = {}) {
  if (!transport?.request || !transport?.subscribe) throw new TypeError('a transport with request() and subscribe() is required');
  if (!resident?.individualId || !encounter || !participant?.id || !source || typeof newId !== 'function') throw new TypeError('resident, encounter, participant, source and newId are required');
  const saved = (() => { try { return clone(store?.load?.()) || null; } catch { return null; } })();
  const st = { messages: saved?.messages || {}, order: saved?.order || [], seen: new Set(saved?.seen || []), cursor: saved?.cursor ?? 0, replies: saved?.replies || [], lastAccepted: saved?.lastAccepted || {} };
  for (const id of st.order) if (st.messages[id]?.state === 'sending') st.messages[id].state = 'unknown';   // a page that went away mid-send does not know what happened to it: it asks (checkStatus), it never assumes
  let availability = { state: 'idle', reason: null }, subscription = null, saving = Promise.resolve();

  const persist = () => {   // saves are serialized: a later state can never be overwritten by an earlier, slower save
    const snapshot = clone({ messages: st.messages, order: st.order, seen: [...st.seen], cursor: st.cursor, replies: st.replies, lastAccepted: st.lastAccepted });
    saving = saving.then(() => store?.save?.(snapshot)).catch(() => {});
    return saving;
  };
  const changed = () => { persist(); try { onChange(view()); } catch { /* a listener must not stop the client */ } };
  const setAvailability = (state, reason = null) => { if (availability.state === state && availability.reason === reason) return; availability = { state, reason }; changed(); };

  function view() {
    return clone({
      availability,
      messages: st.order.map((id) => { const m = st.messages[id]; return { id, words: m.words, state: m.state, states: m.states, waitingFor: m.waitingFor ?? null, refusal: m.refusal ?? null, corrects: m.corrects ?? null, worldSeq: m.worldSeq ?? null, times: m.times ?? {} }; }),
      replies: st.replies
    });
  }

  // ---- what a frame from the endpoint does -------------------------------------------------------------------------------------------------------------------------------------------
  function reach(m, state) {   // each state once, in order; a repeat or an out-of-order one changes nothing
    const next = STATES.indexOf(state);
    if (next < 0 || next !== m.states.length) return;
    m.states.push(state); m.state = state; (m.times ||= {})[state] = now();   // when THIS client learned of it
  }
  function apply(frame) {
    if (!frame || typeof frame !== 'object') return;
    const m = frame.messageId ? st.messages[frame.messageId] : null;
    if (frame.kind === 'receipt' && m) {
      reach(m, frame.state);
      if (frame.state === 'accepted') { if (frame.waitingFor) m.waitingFor = frame.waitingFor; else delete m.waitingFor; st.lastAccepted[participant.id] = m.id; }
      if (frame.state === 'delivered') { delete m.waitingFor; if (frame.worldSeq != null) m.worldSeq = frame.worldSeq; }
      delete m.refusal; if (availability.state !== 'available') availability = { state: 'available', reason: null };
    } else if (frame.kind === 'status' && m) {
      for (const s of frame.states || []) reach(m, s);
      if (frame.waitingFor) m.waitingFor = frame.waitingFor; else if (m.states.includes('delivered')) delete m.waitingFor;
      if (availability.state !== 'available') availability = { state: 'available', reason: null };
    } else if (frame.kind === 'refusal') {
      if (frame.class === 'unavailable') {   // nothing was accepted and nothing answers: not queued, and said as it is
        if (m && !m.states.length) m.state = 'unavailable';
        availability = { state: 'unavailable', reason: frame.reason || 'no resident is running' };
      } else if (REFUSED.has(frame.class) && m) { m.state = 'refused'; m.refusal = { class: frame.class, reason: frame.reason || '' }; }
    } else if (frame.kind === 'revocation-ack') { /* the cutoff is the endpoint's now */ }
  }
  const applyAll = (frames) => { for (const f of frames || []) apply(f); changed(); };

  // ---- sending ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
  const wire = (m) => ({ kind: 'message', id: m.id, encounter, to: { individualId: resident.individualId, host: resident.host }, from: { participant: clone(participant) },
    occ: m.occ, words: m.words, audience: m.audience, expression: m.expression, after: m.after, ...(m.corrects ? { corrects: m.corrects } : {}) });

  async function resolve(id) {   // an answer was lost: ask, never guess
    let frames;
    try { frames = await transport.request({ kind: 'status-query', messageId: id }); } catch { return 'unreachable'; }
    applyAll(frames);
    if (frames.some((f) => f.kind === 'refusal' && f.class === 'unavailable')) return 'unavailable';
    const status = frames.find((f) => f.kind === 'status' && f.messageId === id);
    return status?.known ? 'known' : 'resend';
  }
  /** The person asks what became of a message whose outcome is unknown: one status query. Resolves 'known' (the host has it; the receipts are updated), 'resend' (the host never recorded it:
   * nothing arrived; the SAME message may be sent again with retry), 'unavailable' (a refusal) or 'unreachable' (no answer: still unknown). */
  async function checkStatus(id) {
    const m = st.messages[id];
    if (!m) throw new Error('no such message: ' + id);
    const outcome = await resolve(id);
    if (outcome === 'known') { if (m.state === 'unknown' || m.state === 'sending') m.state = m.states.at(-1) || 'accepted'; }
    else if (outcome === 'unreachable') setAvailability('unreachable', 'no answer from the host');
    changed();
    return outcome;
  }
  async function deliver(id) {
    const m = st.messages[id];
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      let frames;
      try { frames = await transport.request(wire(m)); }
      catch {
        const outcome = await resolve(id);
        if (outcome === 'known' || outcome === 'unavailable') return;
        if (outcome === 'unreachable') { m.state = 'unknown'; setAvailability('unreachable', 'no answer from the host'); changed(); return; }
        continue;   // the endpoint never recorded this id: the SAME message is sent again, unchanged
      }
      applyAll(frames);
      return;
    }
    m.state = 'unknown'; setAvailability('unreachable', 'no answer from the host'); changed();
  }

  /** Take over a message the page holds but this client has no record of (the page went away between keeping it and hearing from the host, or another tab sent it): its outcome is UNKNOWN,
   * never assumed. The next poll or checkStatus(id) learns what the host has. Nothing is sent. */
  function adopt({ id, words, occId = null, audience = { kind: 'encounter' }, expression = 'typed' } = {}) {
    if (!id || typeof words !== 'string' || st.messages[id]) return false;
    st.messages[id] = { id, words, states: [], state: 'unknown', audience: clone(audience), expression, after: [], occ: { source, id: occId || 'occ:' + id, digest: digestOf(words) } };
    if (!st.order.includes(id)) st.order.push(id);
    return true;
  }
  /** Send a person's words. The `after` default is the previous message of this chat that was not refused (the contract: never after a refused message). Resolves with this message's view. */
  async function send(words, { audience = { kind: 'encounter' }, expression = 'typed', corrects = null, occId = null, after = null } = {}) {
    if (typeof words !== 'string' || [...words].length < 1) throw new TypeError('words must be at least one character');
    const id = newId();
    const previous = [...st.order].reverse().find((x) => st.messages[x].state !== 'refused' && st.messages[x].state !== 'unavailable');
    const m = { id, words, states: [], state: 'sending', audience: clone(audience), expression, after: after ? [...after] : previous ? [previous] : [], occ: { source, id: occId || 'occ:' + id, digest: digestOf(words) }, ...(corrects ? { corrects } : {}) };
    st.messages[id] = m; st.order.push(id); changed();
    await deliver(id);
    return view().messages.find((x) => x.id === id);
  }
  /** Send a message again with the SAME id (after a refusal as unavailable, or an unknown outcome). The endpoint answers the original outcome if it had taken it. */
  async function retry(id, { force = false } = {}) {
    const m = st.messages[id];
    if (!m) throw new Error('no such message: ' + id);
    if (!force && (m.state === 'refused' || STATES.includes(m.state))) return view().messages.find((x) => x.id === id);   // settled: nothing to send (force: send it anyway; the endpoint answers the original outcome)
    if (!STATES.includes(m.state) && m.state !== 'refused') m.state = 'sending';
    changed();
    await deliver(id);
    return view().messages.find((x) => x.id === id);
  }
  /** The person ends this participant's link. The cutoff is the id of the last message the endpoint accepted from them. */
  async function revoke() {
    const last = st.lastAccepted[participant.id];
    if (!last) return { ok: true, sent: false };
    try {
      const frames = await transport.request({ kind: 'revocation', encounter, participantId: participant.id, cutoff: { lastAcceptedMessageId: last } });
      applyAll(frames);
      const refusal = (frames || []).find((f) => f.kind === 'refusal');   // a refused revocation is not a revocation: say so, never ok
      return refusal ? { ok: false, sent: true, refusal: { class: refusal.class, reason: refusal.reason || '' } } : { ok: true, sent: true };
    }
    catch { setAvailability('unreachable', 'no answer from the host'); return { ok: false, sent: false }; }
  }

  // ---- her replies -----------------------------------------------------------------------------------------------------------------------------------------------------------------
  function onStreamFrame(frame, seq) {
    if (typeof seq === 'number' && seq > st.cursor) st.cursor = seq;   // the cursor moves even for a frame that is not shown
    if (availability.state !== 'available') availability = { state: 'available', reason: null };
    if (frame?.kind === 'reply' && frame.occ && frame.encounter === encounter) {
      const key = occKey(frame.occ);
      if (st.seen.has(key)) { changed(); return; }   // the same occurrence, again (a replay after a reconnect): shown once
      st.seen.add(key);
      const reply = { id: frame.id, occ: clone(frame.occ), causes: clone(frame.causes), text: frame.delivered, status: frame.status };   // the delivered text only; `intended` and `units` are not shown
      st.replies.push(reply);
      try { onReply(clone(reply)); } catch { /* a listener must not stop the client */ }
    } else if (frame && frame.kind && frame.kind !== 'reply') apply(frame);
    changed();
  }
  function onRecord(frame) {   // a record a poll brought that is not a reply: a status (the receipts), a refusal. Either way the host ANSWERED.
    if (!frame || typeof frame !== 'object') return;
    if (frame.kind !== 'refusal' && availability.state !== 'available') availability = { state: 'available', reason: null };
    apply(frame); changed();
  }
  /** Open (or reopen) the stream from the last sequence number seen. */
  function connect() {
    if (subscription) { try { subscription.close(); } catch { /* already closed */ } subscription = null; }
    setAvailability('connecting');
    try {
      subscription = transport.subscribe({ after: st.cursor }, onStreamFrame, (reason) => {
        // `unreachable`: the poll got no answer at all (the contract's UNREACHABLE). Anything else closing the stream is the host going away (UNAVAILABLE).
        if (reason === 'unreachable') { setAvailability('unreachable', 'no answer from the host'); return; }
        // the relay binding (docs/CHANNEL-CLIENT.md): a lost link that the transport reopens by itself, and the endings it never retries (each is a state of its own, left only by the person)
        if (reason === 'insecure') { setAvailability('unreachable', 'insecure'); return; }
        if (reason === 'superseded' || reason === 'revoked' || reason === 'no-token') { setAvailability(reason === 'no-token' ? 'needs-token' : reason, reason); return; }
        subscription = null; setAvailability('unavailable', reason ? String(reason) : 'connection closed');
      }, onRecord);
    } catch (error) { subscription = null; setAvailability('unreachable', String(error?.message || error)); }
    return subscription;
  }
  function disconnect() { if (subscription) { try { subscription.close(); } catch { /* ignore */ } subscription = null; } setAvailability('idle'); }

  return { send, retry, checkStatus, adopt, revoke, connect, disconnect, view, flush: () => saving, cursor: () => st.cursor };
}
