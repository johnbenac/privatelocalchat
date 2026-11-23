// SPDX-License-Identifier: AGPL-3.0-only
// "A mind" (docs/MIND-CONVERSATION.md): a kind of conversation whose other side is a running mind, reached through the message handoff contract, either over HTTP on this computer (the loopback
// address of its host) or through a relay (a WebSocket both sides dial out to; the person's access token is kept for the tab only, relay-token.mjs).
// She is not a model. Nothing here calls one, nothing answers in her place, and nothing answers an unasked word she says.
//
// createMind({ app, events, doc }) returns { attach(registry), sync(), isMindThread(thread), openEntry(), destroy() }.
//   app     window.plcApp (threads(), currentThread(), createThread(), selectThread(), persistThreads(), renderThreadList(), dialogs, toast, parts.chatArea)
//   events  the page's event list: the screen follows 'thread:selected' and nothing else
//
// Her words and the person's are ordinary messages of the chat (chatThreads); the channel client's bookkeeping is `plc.mind.v1` (mind-store.mjs), which holds no words.
import { createChannelClient } from '../channel/client.mjs';
import { createHttpTransport } from '../channel/http-transport.mjs';
import { createRelayTransport, relayUrl } from '../channel/relay-transport.mjs';
import { createRelayTokens } from './relay-token.mjs';
import { createMindStore, pruneOrphans } from './mind-store.mjs';
import { createMindScreen } from './mind-screen.mjs';
import { discoverHost, openSetup } from './mind-setup.mjs';
import { ACTIONS, COPY, ENTRY_DESCRIPTION, ENTRY_DESCRIPTION_RELAY, ENTRY_LABEL, REACH_ONLY, RELAY_REACH, addressLabel, nameOf, blockedByBrowser, canReachLoopback, classifyReply, handoffUrl, markerOf, occKey, receiptView, replyMessageId, replyToMessage, statusOf, threadOccKeys, waitingLine } from './mind-model.mjs';

const MAX_TRACKED = 20;       // the latest messages of the person that are asked about (a reply names the message it answers)
const WAIT_TICK_MS = 15000;   // how often the elapsed time is looked at

const uuid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16)));

export function createMind({ app, events, doc = document, win = window, options = {} } = {}) {
  const chatArea = app.parts.chatArea;
  const reachable = () => canReachLoopback({
    coarsePointer: Boolean(win.matchMedia?.('(pointer: coarse)').matches), finePointer: Boolean(win.matchMedia?.('(any-pointer: fine)').matches),
    maxTouchPoints: win.navigator?.maxTouchPoints || 0, userAgent: win.navigator?.userAgent || '', platform: win.navigator?.platform || ''
  });
  const relayTokens = options.relayTokens || createRelayTokens();
  const isMindThread = (t) => Boolean(t && t.mind && typeof t.mind === 'object' && t.mind.address);

  let active = null;   // { threadId, transport, client, timer, ... } while a mind chat is on screen
  let announceN = 0, announceText = null;
  const siteH1 = chatArea.querySelector(':scope > h1.sr-only');

  const screen = createMindScreen({
    doc,
    onSend: (text) => send(text),
    onAction: (label) => act(label),
    onConnection: () => editConnection(),
    onSendAgain: (id) => sendAgain(id),
    onCheckStatus: (id) => checkStatus(id)
  });
  chatArea.append(screen.root);

  const thread = () => (active ? app.threads().find((t) => t.id === active.threadId) || null : null);

  // ---- what is drawn -----------------------------------------------------------------------------------------------------------------------------------------------------------
  function model() {
    const t = thread(); const cfg = t.mind;
    const view = active.client.view();
    const byId = new Map(view.messages.map((m) => [m.id, m]));
    const personMsgs = t.messages.filter((m) => m.role === 'user');
    const merged = personMsgs.map((m) => {
      const c = byId.get(m.id);
      if (c) return { ...c, at: m.at };
      return { id: m.id, state: active.inflight.has(m.id) ? 'sending' : 'unknown', states: [], times: {}, refusal: null, at: m.at };
    });
    const relay = cfg.via === 'relay', name = nameOf(cfg);
    const status = statusOf({ availability: view.availability, messages: merged, name, address: relay ? addressLabel(cfg.address) : cfg.address, ignoreRefusalsBefore: cfg.ignoreRefusalsBefore || 0, via: relay ? 'relay' : 'computer',
      blocked: !relay && blockedByBrowser({ pageProtocol: win.location?.protocol, pageHostname: win.location?.hostname, address: cfg.address }) });
    const items = t.messages.filter((m) => !m.notice).map((m) => {
      if (m.role === 'user') {
        const c = merged.find((x) => x.id === m.id);
        const marker = markerOf(c.state);
        const markerText = marker === 'unknown' ? COPY.unknown() : marker === 'refused' ? 'The host refused this message' + (c.refusal?.class ? ' (' + c.refusal.class + ')' : '') + '. It was not delivered.' : marker === 'not-sent' ? 'Not sent: the host was not running.' : active.notRecorded.has(m.id) ? COPY.notRecorded() : '';
        const actions = marker === 'unknown' ? [ACTIONS.checkStatus, ACTIONS.sendAgain] : marker === 'not-sent' || active.notRecorded.has(m.id) ? [ACTIONS.sendAgain] : [];
        return { id: m.id, role: 'person', text: m.content, at: m.at, marker, markerText, actions, receipts: receiptView(c) };
      }
      const unasked = Boolean(m.mind?.unasked);
      return { id: m.id, role: unasked ? 'unasked' : 'mind', text: m.content, at: m.at, speaker: m.mind?.speaker || name };
    });
    const showWaiting = status.kind === 'available' && !active.notRecorded.size;
    return { name, reach: relay ? RELAY_REACH : REACH_ONLY, status, items, composer: { disabled: status.composerDisabled, reason: status.reason },
      waiting: showWaiting ? waitingLine({ name, messages: view.messages, threadMessages: t.messages, now: Date.now() }) : null,
      announce: announceText ? { n: announceN, text: announceText } : null };
  }
  function render() { if (!active || !thread()) return; screen.render(model()); }

  // ---- starting and stopping a conversation on screen ------------------------------------------------------------------------------------------------------------------------
  function start(t) {
    stop();
    const cfg = t.mind;
    const relay = cfg.via === 'relay';
    const url = relay ? relayUrl({ address: cfg.address, channel: cfg.channel }) : handoffUrl(cfg.address);
    if (!url) { return; }
    const timeoutMs = Math.min(60, Math.max(3, Number(cfg.timeoutSeconds) || 15)) * 1000;
    const transport = relay ? createRelayTransport({ url, getToken: () => relayTokens.get(t.id), WebSocket: options.WebSocket || win.WebSocket, timeoutMs, connectTimeoutMs: timeoutMs, probeId: uuid(), doc, timers: options.timers })
      : createHttpTransport({ url, timeoutMs, pollMs: options.pollMs || 1500, probeId: uuid() });
    const store = createMindStore({ threadId: t.id, source: 'plc:' + t.id, thread: () => app.threads().find((x) => x.id === t.id) || null });
    let nextId = null;
    const a = { threadId: t.id, transport, client: null, inflight: new Set(), notRecorded: new Set(), tick: null, nextId: () => nextId, setNext: (id) => { nextId = id; } };
    active = a;
    a.client = createChannelClient({
      transport, store, source: 'plc:' + t.id, encounter: cfg.encounter, resident: { individualId: cfg.resident, host: relay ? { kind: 'relay', address: cfg.address } : { kind: 'own-computer', address: url } },
      participant: { id: cfg.participant, kind: 'human', name: 'You', standing: 'guest', individualId: null }, newId: () => nextId || uuid(),
      onChange: () => render(), onReply: (reply) => { void receive(reply); }
    });
    for (const m of t.messages) if (m.role === 'user') a.client.adopt({ id: m.id, words: m.content, occId: m.mind?.occ?.id });   // a message the client has no record of: its outcome is unknown, never assumed
    track();
    a.client.connect();
    a.tick = win.setInterval(() => render(), WAIT_TICK_MS);
    app.parts.chatArea.classList.add('mind-active');
    if (siteH1) siteH1.setAttribute('aria-hidden', 'true');
    screen.show(); render();
  }
  function stop() {
    if (!active) return;
    const a = active; active = null;
    try { a.client.disconnect(); } catch { /* already closed */ }
    try { a.transport.stop(); } catch { /* already stopped */ }
    win.clearInterval(a.tick);
    screen.hide(); screen.destroyItems(); screen.resetAnnounce(); announceText = null;
    chatArea.classList.remove('mind-active');
    siteH1?.removeAttribute('aria-hidden');
  }
  function track() {
    const t = thread(); if (!t || !active) return;
    const ids = t.messages.filter((m) => m.role === 'user').map((m) => m.id);
    active.transport.untrack(ids.slice(0, -MAX_TRACKED));
    active.transport.track(ids.slice(-MAX_TRACKED));
  }

  // ---- her words arrive ------------------------------------------------------------------------------------------------------------------------------------------------------
  async function receive(reply) {
    const a = active; const t = thread(); if (!a || !t) return;
    const id = replyMessageId(reply.occ);
    if (t.messages.some((m) => m.id === id) || threadOccKeys(t).has(occKey(reply.occ))) return;   // this occurrence is already in the chat: shown once, stored once
    if (!reply.text) return;                                                                       // nothing was said (a failed or unavailable utterance carries no delivered words)
    const sent = new Set(t.messages.filter((m) => m.role === 'user').map((m) => m.id));
    const unasked = classifyReply(reply, sent) === 'unasked';
    const msg = replyToMessage(reply, { speaker: nameOf(t.mind), at: Date.now(), unasked });
    t.messages.push(msg); t.updatedAt = msg.at;
    announceN += 1; announceText = unasked ? COPY.said(msg.mind.speaker) : nameOf(t.mind) + ' replied';
    render();
    await app.persistThreads(t.id, 'Her words were not saved');   // told by the save itself when it fails; the words stay shown in this tab and are received again if this tab closes first
    app.renderThreadList();
  }

  // ---- what the person does --------------------------------------------------------------------------------------------------------------------------------------------------
  async function send(text) {
    const a = active; const t = thread(); if (!a || !t) return false;
    if (model().composer.disabled) return false;   // the composer is off whenever she is not Available: nothing is sent into a void
    const id = uuid(); const at = Date.now();
    t.messages.push({ id, role: 'user', content: text, at, mind: { occ: { source: 'plc:' + t.id, id: 'occ:' + id } } }); t.updatedAt = at;
    const outcome = await app.persistThreads(t.id, 'Your message was not sent');
    if (!outcome.saved) { const i = t.messages.findIndex((m) => m.id === id); if (i >= 0) t.messages.splice(i, 1); render(); return false; }   // not kept, so not sent: the words stay in the box
    app.renderThreadList();
    a.inflight.add(id); a.transport.track(id); a.transport.nudge(); a.setNext(id); track();
    render();
    const done = a.client.send(text, { occId: 'occ:' + id }).finally(() => { a.setNext(null); a.inflight.delete(id); render(); });
    void done.catch(() => {});
    return true;
  }
  async function sendAgain(id) {
    const a = active; if (!a) return;
    a.notRecorded.delete(id); a.inflight.add(id);
    try { await a.client.retry(id, { force: true }); } finally { a.inflight.delete(id); render(); }
  }
  async function checkStatus(id) {
    const a = active; if (!a) return;
    a.transport.nudge();
    const outcome = await a.client.checkStatus(id);
    if (outcome === 'resend') a.notRecorded.add(id); else a.notRecorded.delete(id);
    render();
  }
  async function act(label) {
    const a = active; if (!a) return;
    if (label === ACTIONS.checkAgain || label === ACTIONS.tryAgain || label === ACTIONS.useHere) { a.client.connect(); }
    else if (label === ACTIONS.changeAddress || label === ACTIONS.changeConnection) await editConnection();
    else if (label === ACTIONS.checkStatus) { const t = thread(); const last = [...a.client.view().messages].reverse().find((m) => m.state === 'unknown'); if (last && t) await checkStatus(last.id); }
  }
  async function editConnection() {
    const t = thread(); if (!t) return;
    const a = active;
    const suspended = typeof a.transport.suspend === 'function'; if (suspended) a.transport.suspend();   // a Check on a relay connects as this person: this tab lets go of its own connection first, or the check would stop it
    const config = await openSetup({ dialogs: app.dialogs, initial: t.mind, loopbackOk: reachable(), savedToken: () => relayTokens.get(t.id), doc });
    if (!config) { if (suspended && active === a) a.client.connect(); return; }
    const { token, ...rest } = config;
    const next = { ...t.mind, ...rest, ignoreRefusalsBefore: Date.now() };
    if (rest.via !== 'relay') { delete next.via; delete next.channel; }
    t.mind = next;
    if (rest.via === 'relay' && token) relayTokens.set(t.id, token); else if (rest.via !== 'relay') relayTokens.clear(t.id);
    if (config.name && t.title !== config.name) t.title = config.name;
    await app.persistThreads(t.id, 'The connection was not saved');
    app.renderThreadList();
    start(t);
  }

  // ---- entry ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
  async function openEntry() {
    const existing = app.threads().find((t) => isMindThread(t) && t.deletedAt == null);
    if (existing) { app.selectThread(existing.id); return; }
    const config = await openSetup({ dialogs: app.dialogs, initial: await discoverHost({ page: win.location }), loopbackOk: reachable(), doc });
    if (!config) return;
    const { token, ...rest } = config;
    const id = app.createThread({ title: config.name });
    const t = app.threads().find((x) => x.id === id);
    t.mind = { ...rest, ignoreRefusalsBefore: 0 };
    if (rest.via === 'relay' && token) relayTokens.set(id, token);
    await app.persistThreads(id, 'The conversation was not saved');
    app.renderThreadList();
    app.selectThread(id);
  }
  const entry = { label: ENTRY_LABEL, icon: 'mind', open: () => openEntry(),
    desc: () => (reachable() ? ENTRY_DESCRIPTION : ENTRY_DESCRIPTION_RELAY), disabled: () => false };   // every device can open it: where this one cannot reach a mind on itself, the setup offers the relay
  function attach(registry) {
    registry.register('plus', { id: 'mind', order: 60, ...entry });
    registry.register('explore', { id: 'mind', order: 15, ...entry });
  }

  // ---- following the page ------------------------------------------------------------------------------------------------------------------------------------------------------
  function sync() {
    const t = app.currentThread();
    if (isMindThread(t)) { if (!active || active.threadId !== t.id) start(t); else render(); }
    else stop();
  }
  events.on('thread:selected', () => sync());
  const prune = () => { try { const ids = app.threads().map((t) => t.id); pruneOrphans(ids); relayTokens.prune(ids); } catch { /* storage unavailable */ } };
  const list = app.parts.threadList;
  let pruneTimer = null;
  const observer = list && win.MutationObserver ? new win.MutationObserver(() => { win.clearTimeout(pruneTimer); pruneTimer = win.setTimeout(prune, 300); }) : null;
  observer?.observe(list, { childList: true });
  prune();

  return { attach, sync, isMindThread, openEntry, prune, destroy() { stop(); observer?.disconnect(); screen.root.remove(); } };
}
