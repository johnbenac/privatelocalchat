// SPDX-License-Identifier: AGPL-3.0-only
// The view-model of "a mind on this computer" (docs/MIND-CONVERSATION.md): everything the screen says, decided here, pure (no DOM, no storage, no network, no clock but the one passed in).
// A mind is not a model: nothing in this file, or in the screen built on it, produces a word in her place. A sentence here is about the CONNECTION or about what was SENT, never in her voice.
//
//   statusOf(...)        the one status line: state, sentence, loudness, actions, whether the composer may be used and, if not, why
//   receiptView(...)     the highest receipt reached, the five-dot meter and the list the "Receipts" disclosure shows
//   classifyReply(...)   a reply that answers one of the person's messages, or an unasked word
//   canReachLoopback(..) whether this page can possibly reach a host on its own computer (a phone cannot)
//   occKey / replyMessageId / threadOccKeys   the occurrence identity of her words and the one message id each gets in the thread, so a word is never shown or stored twice

/** The words for the receipts. ONE place, so the owner of wording can change them. (Placeholders: the contract names five states, the design six words.) */
export const RECEIPT_WORDS = Object.freeze({
  sending: 'Sending',
  sent: 'Sent',
  accepted: 'Accepted',
  delivered: 'Delivered',
  exposed: 'Shown to the mind',
  interpreted: 'Understood',
  persisted: 'Saved'
});
export const RECEIPT_STATES = Object.freeze(['accepted', 'delivered', 'exposed', 'interpreted', 'persisted']);

export const REACH_ONLY = 'Reached on this computer only. Phones and other computers cannot reach it.';
export const ENTRY_LABEL = 'Talk with a mind on this computer';
export const ENTRY_DESCRIPTION = 'A running mind on this computer. It is not a model: only the mind answers.';
export const ENTRY_DESCRIPTION_RELAY = 'A running mind, reached through a relay. It is not a model: only the mind answers.';
export const DEFAULT_NAME = 'a mind on this computer';
export const RELAY_DEFAULT_NAME = 'a mind';
export const RELAY_REACH = 'Reached through a relay.';
export const RELAY_REACH_NOTE = 'A relay is a go-between that both you and the mind connect to. It is meant to pass messages along without keeping them.';
export const nameOf = (cfg) => (cfg?.name || (cfg?.via === 'relay' ? RELAY_DEFAULT_NAME : DEFAULT_NAME));
export const UNPROMPTED_LABEL = 'Unprompted';

/** The sentences, exactly as designed. `name` and `address` are filled in. */
export const COPY = Object.freeze({
  // a configured name is a name: "Connected to Ada on this computer."; the neutral default already says where she is
  available: (name) => (name === DEFAULT_NAME ? `Connected to ${DEFAULT_NAME}.` : `Connected to ${name} on this computer.`),
  unavailable: () => 'The host is not running, or its tab is closed. Nothing can be sent.',
  unreachable: (address) => `No answer from the host at ${address}. Nothing was sent. It may be slow, or the address may be wrong.`,
  unknown: () => 'Sent, but the host did not confirm. It may or may not have arrived. Send again only if you are happy to say it twice.',
  notAdmitted: () => 'The host does not know this participant id. Nothing was sent. Check the id, or ask whoever runs the host to admit you.',
  blocked: () => "This browser cannot reach a mind on this computer from this page. Open the same page from the host's own address instead.",
  blockedDetail: () => 'A page served over https is not allowed to call a plain http address on this computer. Nothing was sent.',
  checking: (name) => `Checking whether ${name} can be reached.`,
  waiting: (name, elapsed) => `Waiting for ${name}. No answer yet (${elapsed}).`,
  // not in the design: said when the host answers a status query for a message and has never recorded it
  notRecorded: () => 'The host has no record of that message. It did not arrive. You can send it again.',
  stillUnknown: () => 'Still no answer from the host. The message may or may not have arrived.',
  said: (speaker) => `${speaker.charAt(0).toUpperCase()}${speaker.slice(1)} said something`
});

/** The same states as COPY, said for a mind reached through a relay (nothing here claims the mind is on this computer). */
export const RELAY_COPY = Object.freeze({
  available: (name) => `Connected to ${name} through a relay.`,
  unavailable: () => 'The mind is not connected to the relay right now. Nothing can be sent.',
  unreachable: (address) => `No answer from the relay at ${address}. Nothing was sent. It may be slow, the address may be wrong, or your access token may have run out.`,
  insecure: () => 'Could not connect securely.',
  insecureDetail: () => 'The browser does not say why. Nothing was sent.',
  superseded: () => 'This conversation was opened in another tab, so it stopped here.',
  revoked: () => 'You are not allowed to use this connection any more. Nothing can be sent.',
  tokenRefused: () => 'The relay did not accept your access token. Nothing can be sent.',
  needsToken: () => 'Add your access token to connect. Nothing can be sent.'
});

export const ACTIONS = Object.freeze({
  useHere: 'Use it here',
  checkAgain: 'Check again',
  tryAgain: 'Try again',
  changeAddress: 'Change address',
  checkStatus: 'Check status',
  changeConnection: 'Change connection',
  sendAgain: 'Send again'
});

/** The composer is written next to; these are the reasons it gives when it is off. */
const REASONS = Object.freeze({
  checking: 'Waiting for the connection check. Nothing can be sent yet.',
  unavailable: 'The host is not running. Nothing can be sent.',
  unreachable: 'No answer from the host. Nothing can be sent.',
  blocked: 'This browser blocks the connection from this page. Nothing can be sent.',
  unknown: 'The last message is unconfirmed. Check its status before writing again.',
  'not-admitted': 'The host does not know this participant id. Nothing can be sent.',
  insecure: 'The connection to the relay could not be made securely. Nothing can be sent.',
  superseded: 'This conversation is open in another tab. Nothing can be sent from here.',
  revoked: 'You are not allowed to use this connection any more. Nothing can be sent.',
  'needs-token': 'There is no access token. Nothing can be sent.'
});

const RELAY_REASONS = Object.freeze({ unavailable: 'The mind is not connected to the relay. Nothing can be sent.', unreachable: 'No answer from the relay. Nothing can be sent.' });

// ---- the status line --------------------------------------------------------------------------------------------------------------------------------------------------------------------
/**
 * @param {object} p
 * @param {{state:string, reason?:string}} p.availability   the channel client's availability
 * @param {Array<{id:string,state:string,refusal?:{class:string}|null,at?:number}>} p.messages   the person's messages, oldest first
 * @param {string} p.name  @param {string} p.address
 * @param {number} [p.ignoreRefusalsBefore]  a refusal older than this is the past: the person changed the connection since
 * @returns {{kind:string, shape:string, tone:string, sentence:string, assertive:boolean, actions:string[], composerDisabled:boolean, reason:string|null}}
 */
export function statusOf({ availability, messages = [], name, address, ignoreRefusalsBefore = 0, blocked = false, via = 'computer' }) {
  const relay = via === 'relay';
  const mine = messages.filter((m) => m && typeof m === 'object');
  const unknown = mine.some((m) => m.state === 'unknown');
  const last = [...mine].reverse().find((m) => (m.at ?? Infinity) >= ignoreRefusalsBefore);
  const notAdmitted = Boolean(last && last.state === 'refused' && last.refusal?.class === 'not-admitted');
  const make = (kind, shape, tone, sentence, assertive, actions, composerDisabled, detail = null) => ({ kind, shape, tone, sentence, assertive, actions, composerDisabled, detail, reason: composerDisabled ? ((relay && RELAY_REASONS[kind]) || REASONS[kind]) : null });
  if (unknown) return make('unknown', 'hatched', 'warn', COPY.unknown(), true, [ACTIONS.checkStatus], true);
  if (notAdmitted) return make('not-admitted', 'cross', 'bad', COPY.notAdmitted(), true, [ACTIONS.changeConnection], true);
  switch (availability?.state) {
    case 'available': return make('available', 'dot', 'good', relay ? RELAY_COPY.available(name) : COPY.available(name), false, [], false);
    case 'unavailable': return relay ? make('unavailable', 'slash', 'bad', RELAY_COPY.unavailable(), true, [ACTIONS.checkAgain], true) : make('unavailable', 'slash', 'bad', COPY.unavailable(), true, [ACTIONS.checkAgain], true);
    case 'unreachable':
      if (relay && availability.reason === 'insecure') return make('insecure', 'ring', 'warn', RELAY_COPY.insecure(), true, [ACTIONS.tryAgain, ACTIONS.changeConnection], true, RELAY_COPY.insecureDetail());
      if (relay) return make('unreachable', 'ring', 'warn', RELAY_COPY.unreachable(address), true, [ACTIONS.tryAgain, ACTIONS.changeConnection], true);
      if (blocked) return make('blocked', 'barred', 'bad', COPY.blocked(), true, [ACTIONS.tryAgain], true, COPY.blockedDetail());
      return make('unreachable', 'ring', 'warn', COPY.unreachable(address), true, [ACTIONS.tryAgain, ACTIONS.changeAddress], true);
    case 'superseded': return make('superseded', 'slash', 'warn', RELAY_COPY.superseded(), true, [ACTIONS.useHere], true);
    case 'revoked': return make('revoked', 'cross', 'bad', RELAY_COPY.revoked(), true, [ACTIONS.changeConnection], true);
    case 'token-refused': return make('token-refused', 'cross', 'bad', RELAY_COPY.tokenRefused(), true, [ACTIONS.changeConnection], true);
    case 'needs-token': return make('needs-token', 'ring', 'warn', RELAY_COPY.needsToken(), true, [ACTIONS.changeConnection], true);
    default: return make('checking', 'ring-dashed', 'quiet', COPY.checking(name), false, [], true);
  }
}

// ---- receipts ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** One line under a message of the person: the highest stage reached and a five-dot meter; the list is what the "Receipts" disclosure shows. */
export function receiptView({ state, states = [], times = {} } = {}) {
  const reached = RECEIPT_STATES.filter((s) => states.includes(s));
  const highest = reached.length ? reached[reached.length - 1] : null;
  const list = RECEIPT_STATES.map((s) => ({ state: s, word: RECEIPT_WORDS[s], reached: states.includes(s), at: times[s] ?? null }));
  let word, loud = false;
  if (highest) word = RECEIPT_WORDS[highest];
  else if (state === 'unknown') { word = 'No confirmation from the host'; loud = true; }
  else if (state === 'refused') { word = 'The host refused it'; loud = true; }
  else if (state === 'unavailable') { word = 'Not sent: the host was not running'; loud = true; }
  else word = RECEIPT_WORDS.sending;
  return { highest, word, dots: reached.length, total: RECEIPT_STATES.length, list, loud };
}

/** What marks a message of the person: `unknown` is hatched, never "failed" and never "sent"; a refusal and a message that was not sent are said as they are. */
export function markerOf(state) { return state === 'unknown' ? 'unknown' : state === 'refused' ? 'refused' : state === 'unavailable' ? 'not-sent' : null; }

// ---- her words --------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** A reply answers the person if one of its causes is a message the person sent; otherwise it is an unasked word (nothing of the person's caused it, and nothing answers it automatically). */
export function classifyReply(reply, sentIds) {
  const set = sentIds instanceof Set ? sentIds : new Set(sentIds || []);
  const causes = Array.isArray(reply?.causes) ? reply.causes : [];
  return causes.some((c) => set.has(c)) ? 'reply' : 'unasked';
}

export const occKey = (occ) => String(occ?.source) + '\u0000' + String(occ?.id);
/** The keys of the occurrences already in a thread (her words carry `mind.occ`), the truth about what was seen: kept with the words, gone with them. */
export function threadOccKeys(thread) {
  const out = new Set();
  for (const m of thread?.messages || []) if (m?.mind?.occ?.source && m.mind.occ.id) out.add(occKey(m.mind.occ));
  return out;
}
function hash53(text, seed) {   // cyrb53: a small stable hash, enough to name a message; the occurrence key itself is kept beside it
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < text.length; i += 1) { const ch = text.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}
/** One occurrence is one message id in the thread, wherever and however often it arrives: two tabs that both receive it write the same message. */
export const replyMessageId = (occ) => 'mind-' + hash53(occKey(occ), 1) + hash53(occKey(occ), 2);

export function replyToMessage(reply, { speaker, at, unasked }) {
  return { id: replyMessageId(reply.occ), role: 'assistant', content: String(reply.text ?? ''), at,
    mind: { occ: { source: reply.occ.source, id: reply.occ.id }, causes: Array.isArray(reply.causes) ? reply.causes.slice(0, 4) : [], speaker, ...(unasked ? { unasked: true } : {}), ...(reply.status ? { status: String(reply.status).slice(0, 40) } : {}) } };
}

// ---- time ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export function elapsedWords(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return 'under 1 min';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min`;
}
/** The plain line while a message of the person has no word from her yet: shown only when the host can be reached and the last message was taken (a failure says its own sentence). */
export function waitingLine({ name, messages = [], threadMessages = [], now }) {
  const lastMine = [...messages].reverse().find((m) => m.state !== 'refused' && m.state !== 'unavailable' && m.state !== 'unknown');
  if (!lastMine || !lastMine.states?.length) return null;
  const after = threadMessages.find((m) => m.id === lastMine.id);
  if (!after) return null;
  const answered = threadMessages.some((m) => m.role === 'assistant' && m.at >= after.at && m.mind && (m.mind.causes || []).includes(lastMine.id));
  if (answered) return null;
  return COPY.waiting(name, elapsedWords(now - after.at));
}

// ---- where it can be reached ----------------------------------------------------------------------------------------------------------------------------------------------------
/**
 * Can this page reach a host on its own computer? A phone or a tablet cannot: a coarse-pointer touch device that has no fine pointer, or one that says so in its user agent.
 * Decided from what the page already knows; the network is never tried to find out.
 */
export function canReachLoopback({ coarsePointer = false, finePointer = false, maxTouchPoints = 0, userAgent = '', platform = '' } = {}) {
  const ua = String(userAgent);
  if (/\b(Android|iPhone|iPad|iPod)\b|Mobile|CriOS|FxiOS/i.test(ua)) return false;
  if (/Macintosh|MacIntel/i.test(ua + ' ' + platform) && maxTouchPoints > 1 && !finePointer) return false;   // an iPad that presents as a Mac
  if (coarsePointer && !finePointer && maxTouchPoints > 0) return false;
  return true;
}

/**
 * Is a failed request the browser REFUSING (not a host that did not answer)? A page served over https may not call a plain http address on this computer (mixed content in Safari, the Local
 * Network Access permission in Chrome): the request fails before any response. True only when the address is http loopback and the page is https and not itself on this computer, or the
 * browser said permission was denied. When it cannot be told, false: the honest word is then unreachable.
 */
export function blockedByBrowser({ pageProtocol = '', pageHostname = '', address = '', errorMessage = '' } = {}) {
  if (/permission was denied|mixed content|blocked:mixed|local network access/i.test(String(errorMessage))) return true;
  let u; try { u = new URL(String(address)); } catch { return false; }
  const loop = (h) => h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '::1' || h.endsWith('.localhost');
  return pageProtocol === 'https:' && u.protocol === 'http:' && loop(u.hostname) && !loop(pageHostname);
}

/** A host address the page can post to: an http(s) address; the route is added here. Returns null for anything else. */
export function handoffUrl(address) {
  let u;
  try { u = new URL(String(address || '').trim()); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.username || u.password) return null;
  const base = u.origin + (u.pathname.replace(/\/+$/, '') || '');
  return base.endsWith('/message-handoff') ? base : base + '/message-handoff';
}
export const addressLabel = (address) => { try { const u = new URL(String(address)); return u.host; } catch { return String(address || ''); } };
