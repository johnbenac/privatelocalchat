// The reference endpoint of the message handoff contract (Sonalon, board T379), copied from their `tests/message-handoff-contract.test.mjs` (origin/main 2c67738b) for PLC's own tests.
// It is a pure function over an in-memory log: step(state, input) -> the frames the endpoint answers with. It lives only in tests. One change from the original: the JSON Schema check of an
// incoming message is a plain structural check here, because PLC has no JSON Schema library; the digest, dedupe, collision, order, hold, revocation and refusal rules are the original's.
// Synthetic data only.
import { createHash } from 'node:crypto';

const sha = (words) => 'sha256:' + createHash('sha256').update(words, 'utf8').digest('hex');
const ORDER = ['accepted', 'delivered', 'exposed', 'interpreted', 'persisted'];
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
export function structurallyValid(m) {
  return isObj(m) && m.kind === 'message' && typeof m.id === 'string' && m.id && typeof m.encounter === 'string' && isObj(m.to) && typeof m.to.individualId === 'string'
    && isObj(m.from) && isObj(m.from.participant) && typeof m.from.participant.id === 'string' && isObj(m.occ) && typeof m.occ.source === 'string' && typeof m.occ.id === 'string'
    && typeof m.occ.digest === 'string' && typeof m.words === 'string' && [...m.words].length >= 1 && isObj(m.audience) && typeof m.audience.kind === 'string'
    && typeof m.expression === 'string' && Array.isArray(m.after);
}

export function createEndpoint(initial) {
  return { running: initial.running, resident: initial.resident, admitted: [...initial.admitted], limit: initial.limit, log: new Map(), refused: new Set(), deliveredOrder: [], revoked: new Map(), replies: new Map() };
}
const refuse = (cls, messageId, reason) => ({ kind: 'refusal', class: cls, messageId, reason });
const receipt = (state, m, extra = {}) => ({ kind: 'receipt', state, messageId: m.id, encounter: m.encounter, ...extra });

function deliverReady(s, out) {
  for (let moved = true; moved;) {
    moved = false;
    for (const [id, e] of s.log) {
      if (e.states.includes('delivered')) continue;
      const pre = e.message.after[0];
      if (pre !== undefined && !s.log.get(pre)?.states.includes('delivered')) continue;
      s.deliveredOrder.push(id);
      const r = receipt('delivered', e.message, { worldSeq: s.deliveredOrder.length });
      e.states.push('delivered'); e.receipts.push(r); out.push(r);
      moved = true;
    }
  }
}

export function step(s, input) {
  const out = step0(s, input);
  for (const o of out) if (o.kind === 'refusal' && o.messageId) s.refused.add(o.messageId);
  return out;
}
function step0(s, input) {
  const out = [];
  switch (input.kind) {
    case 'tab-closed': s.running = false; break;
    case 'tab-opened': s.running = true; break;
    case 'status-query': {
      if (!s.running) return [refuse('unavailable', input.messageId, 'no resident is running')];
      const e = s.log.get(input.messageId);
      const pre = e?.message.after[0];
      const waiting = pre !== undefined && !e.states.includes('delivered') ? { waitingFor: pre } : {};
      out.push({ kind: 'status', messageId: input.messageId, known: Boolean(e), states: e ? [...e.states] : [], ...waiting });
      break;
    }
    case 'revocation': {
      if (!s.running) return [refuse('unavailable', null, 'no resident is running')];
      s.revoked.set(input.participantId, input.cutoff.lastAcceptedMessageId);
      out.push({ kind: 'revocation-ack', participantId: input.participantId, cutoff: input.cutoff });
      break;
    }
    case 'message': {
      if (!s.running) return [refuse('unavailable', input.id, 'no resident is running')];
      if (!structurallyValid(input)) return [refuse('malformed', input.id ?? null, 'does not match the schema')];
      if (input.occ.digest !== sha(input.words)) return [refuse('malformed', input.id, 'digest does not cover the words')];
      const prior = s.log.get(input.id);
      if (prior) {
        const m = prior.message;
        const same = m.occ.digest === input.occ.digest && JSON.stringify(m.audience) === JSON.stringify(input.audience) && m.expression === input.expression;
        if (!same) return [refuse('malformed', input.id, 'id reused with different content')];
        return prior.receipts.map((r) => ({ ...r }));
      }
      const pid = input.from.participant.id;
      if (s.revoked.has(pid) && s.revoked.get(pid) !== input.id) return [refuse('revoked', input.id, 'participant revoked')];
      if (input.to.individualId !== s.resident) return [refuse('not-admitted', input.id, 'not this resident')];
      if (!s.admitted.includes(pid)) return [refuse('not-admitted', input.id, 'participant not admitted')];
      if ([...input.words].length > s.limit) return [refuse('over-limit', input.id, 'too many code points')];
      const pre = input.after[0];
      if (pre !== undefined && s.refused.has(pre) && !s.log.has(pre)) return [refuse('malformed', input.id, 'predecessor-refused')];
      const held = pre !== undefined && !s.log.get(pre)?.states.includes('delivered');
      s.refused.delete(input.id);
      const r = receipt('accepted', input, held ? { waitingFor: pre } : {});
      s.log.set(input.id, { message: input, states: ['accepted'], receipts: [r] });
      out.push(r);
      deliverReady(s, out);
      break;
    }
    case 'progress': {
      const e = s.log.get(input.messageId);
      if (!e || !e.states.includes('delivered')) break;
      if (ORDER.indexOf(input.state) !== e.states.length) break;
      const r = receipt(input.state, e.message);
      e.states.push(input.state); e.receipts.push(r); out.push(r);
      break;
    }
    case 'composing': break;
    case 'speech-report': {
      const n = (s.replies.get(input.causes[0]) ?? 0) + 1;
      s.replies.set(input.causes[0], n);
      const first = s.log.get(input.causes[0])?.message;
      out.push({ kind: 'reply', id: `reply:${input.causes[0]}:${n}`, encounter: first.encounter, causes: input.causes, speaker: { individualId: s.resident },
        occ: { source: s.resident, id: `reply:${input.causes[0]}:${n}`, digest: sha(input.delivered) }, audience: { kind: 'encounter' }, expression: 'said',
        delivered: input.delivered, units: input.units, status: input.status, ...(input.intended !== undefined ? { intended: input.intended } : {}) });
      break;
    }
    default: throw new Error('unknown input ' + input.kind);
  }
  return out;
}
export const summary = (s) => ({ running: s.running, deliveredOrder: [...s.deliveredOrder], byMessage: Object.fromEntries([...s.log].map(([id, e]) => [id, e.states.at(-1)])) });
