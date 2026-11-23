// SPDX-License-Identifier: AGPL-3.0-only
// The screen of a conversation with a mind on this computer (docs/MIND-CONVERSATION.md): the name as the one h1 and the fixed sub-line, the STATUS LINE, her words and the person's, the composer.
// It only draws what the view-model (mind-model.mjs) decided and passes the person's actions to the controller (mind.mjs). It has no model, no placeholder in her voice, no typing dots and no
// skeleton bubble: a message of hers exists on this screen only when a record of hers was received.
//
// The screen is built once and updated in place. The composer is never rebuilt, so a word that arrives while the person is typing neither moves the focus nor touches the draft.
import { REACH_ONLY, UNPROMPTED_LABEL, ACTIONS } from './mind-model.mjs';

const h = (doc, tag, cls, text) => { const n = doc.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const clock = (at) => { try { return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };

export function createMindScreen({ doc = document, onSend, onAction, onConnection, onSendAgain, onCheckStatus } = {}) {
  const root = h(doc, 'section', 'mind-screen'); root.id = 'mindScreen'; root.hidden = true;
  // ---- the head: one h1, the fixed sub-line, the way back to setup ----
  const head = h(doc, 'header', 'mind-head');
  const titles = h(doc, 'div', 'mind-titles');
  const title = h(doc, 'h1', 'mind-title'); title.id = 'mindTitle';
  const reach = h(doc, 'p', 'mind-reach', REACH_ONLY); reach.id = 'mindReach';
  titles.append(reach);   // the h1 is in the page only while this screen is shown (the page has exactly one h1 at any time)
  const connection = h(doc, 'button', 'mind-btn secondary', 'Connection'); connection.type = 'button'; connection.id = 'mindConnection';
  connection.addEventListener('click', () => onConnection?.());
  head.append(titles, connection);
  // ---- the status line: always present; word + shape + colour; routine in a polite region, a failure in an assertive one ----
  const status = h(doc, 'div', 'mind-status'); status.id = 'mindStatus';
  const shape = h(doc, 'span', 'mind-shape'); shape.setAttribute('aria-hidden', 'true');
  const live = h(doc, 'div', 'mind-live');
  const polite = h(doc, 'p', 'mind-live-text'); polite.id = 'mindStatusPolite'; polite.setAttribute('role', 'status'); polite.setAttribute('aria-live', 'polite');
  const assertive = h(doc, 'p', 'mind-live-text'); assertive.id = 'mindStatusAssertive'; assertive.setAttribute('role', 'alert'); assertive.setAttribute('aria-live', 'assertive');
  const detail = h(doc, 'p', 'mind-detail'); detail.id = 'mindDetail';
  const waiting = h(doc, 'p', 'mind-waiting'); waiting.id = 'mindWaiting'; waiting.setAttribute('role', 'status'); waiting.setAttribute('aria-live', 'polite'); waiting.hidden = true;
  live.append(polite, assertive, detail, waiting);
  const actions = h(doc, 'div', 'mind-actions');
  status.append(shape, live, actions);
  // ---- the messages ----
  const log = h(doc, 'div', 'mind-log'); log.id = 'mindLog'; log.setAttribute('role', 'log'); log.setAttribute('aria-live', 'off'); log.tabIndex = 0;
  const announce = h(doc, 'p', 'sr-only'); announce.id = 'mindAnnounce'; announce.setAttribute('role', 'status'); announce.setAttribute('aria-live', 'polite');
  // ---- the composer: disabled (never hidden) with the reason written beside it ----
  const form = h(doc, 'form', 'mind-composer'); form.id = 'mindComposer';
  const input = h(doc, 'textarea', 'mind-input'); input.id = 'mindInput'; input.rows = 2; input.placeholder = 'Write a message'; input.autocomplete = 'off';
  const send = h(doc, 'button', 'mind-btn primary mind-send', 'Send'); send.type = 'submit'; send.id = 'mindSend';
  const reason = h(doc, 'p', 'mind-reason'); reason.id = 'mindReason';
  input.setAttribute('aria-describedby', 'mindReason');
  const row = h(doc, 'div', 'mind-composer-row'); row.append(input, send);
  form.append(row, reason);
  const sync = () => { send.disabled = input.disabled || !input.value.trim(); };
  input.addEventListener('input', sync);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); } });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (input.disabled) return;
    const text = input.value.trim(); if (!text) return;
    Promise.resolve(onSend?.(text)).then((sent) => { if (sent) { input.value = ''; sync(); } });   // the draft is cleared only once the message is kept; a refusal to keep it leaves the words where they were
  });
  root.append(head, status, log, announce, form);

  const nodes = new Map();   // message id -> { li, ...parts }
  let lastKind = null, lastAnnounced = null;

  function renderStatus(s, waitingText) {
    status.dataset.kind = s.kind; status.dataset.tone = s.tone; shape.dataset.shape = s.shape;
    const into = s.assertive ? assertive : polite, other = s.assertive ? polite : assertive;
    if (into.textContent !== s.sentence) into.textContent = s.sentence;   // an unchanged sentence is never rewritten: a screen reader hears it once
    if (other.textContent) other.textContent = '';
    if (lastKind !== s.kind || actions.dataset.k !== s.actions.join('|')) {
      actions.textContent = ''; actions.dataset.k = s.actions.join('|');
      for (const label of s.actions) { const b = h(doc, 'button', 'mind-btn secondary', label); b.type = 'button'; b.addEventListener('click', () => onAction?.(label)); actions.append(b); }
    }
    detail.textContent = s.detail || ''; detail.hidden = !s.detail;
    lastKind = s.kind;
    waiting.hidden = !waitingText;
    if (waitingText && waiting.textContent !== waitingText) waiting.textContent = waitingText;
    if (!waitingText) waiting.textContent = '';
  }

  function buildItem(item) {
    const li = h(doc, 'article', 'mind-msg'); li.dataset.id = item.id;
    const label = h(doc, 'p', 'mind-label'); const body = h(doc, 'p', 'mind-text');
    li.append(label, body);
    const parts = { li, label, body };
    if (item.role === 'person') {
      parts.marker = h(doc, 'p', 'mind-marker'); parts.marker.hidden = true;
      parts.again = h(doc, 'div', 'mind-marker-actions'); parts.again.hidden = true;
      parts.receipt = h(doc, 'p', 'mind-receipt');
      parts.meter = h(doc, 'span', 'mind-meter'); parts.meter.setAttribute('aria-hidden', 'true');
      for (let i = 0; i < 5; i += 1) parts.meter.append(h(doc, 'i'));
      parts.word = h(doc, 'span', 'mind-receipt-word');
      parts.receipt.append(parts.word, parts.meter);
      parts.details = h(doc, 'details', 'mind-receipts');
      parts.summary = h(doc, 'summary', null, 'Receipts');
      parts.list = h(doc, 'ul', 'mind-receipt-list');
      parts.details.append(parts.summary, parts.list);
      li.append(parts.marker, parts.again, parts.receipt, parts.details);
    }
    nodes.set(item.id, parts);
    return parts;
  }

  function updateItem(parts, item, name) {
    parts.li.className = 'mind-msg ' + item.role;
    parts.li.dataset.marker = item.marker || '';
    const label = item.role === 'person' ? 'You' : item.role === 'unasked' ? `${UNPROMPTED_LABEL} · ${item.speaker || name} · ${clock(item.at)}` : name;
    if (parts.label.textContent !== label) parts.label.textContent = label;
    if (parts.body.textContent !== item.text) parts.body.textContent = item.text;
    if (item.role !== 'person') return;
    const r = item.receipts;
    const word = r.word;
    if (parts.word.textContent !== word) parts.word.textContent = word;
    parts.receipt.dataset.loud = r.loud ? '1' : '';
    [...parts.meter.children].forEach((dot, i) => { dot.dataset.on = i < r.dots ? '1' : ''; });
    parts.meter.title = r.dots + ' of ' + r.total;
    const markerText = item.markerText || '';
    parts.marker.hidden = !markerText; if (parts.marker.textContent !== markerText) parts.marker.textContent = markerText;
    const want = item.actions.join('|');
    if (parts.again.dataset.k !== want) {
      parts.again.textContent = ''; parts.again.dataset.k = want; parts.again.hidden = !item.actions.length;
      for (const a of item.actions) { const b = h(doc, 'button', 'mind-btn secondary small', a); b.type = 'button'; b.addEventListener('click', () => (a === ACTIONS.sendAgain ? onSendAgain : onCheckStatus)?.(item.id)); parts.again.append(b); }
    }
    const sig = r.list.map((x) => (x.reached ? '1' : '0') + (x.at || '')).join(',');
    if (parts.list.dataset.sig !== sig) {
      parts.list.dataset.sig = sig; parts.list.textContent = '';
      for (const x of r.list) { const li = h(doc, 'li', null); li.dataset.reached = x.reached ? '1' : ''; li.append(h(doc, 'span', 'mind-tick', x.reached ? '✓' : '–'), h(doc, 'span', null, ' ' + x.word + (x.reached && x.at ? ' · ' + clock(x.at) : '')), ); parts.list.append(li); }
    }
  }

  return {
    root, input, log, form,
    /** Draw. `model`: { name, status, waiting, items, composer, announce }. Everything is updated in place; nothing is rebuilt that has not changed. */
    render(model) {
      if (title.textContent !== model.name) title.textContent = model.name;
      root.setAttribute('aria-labelledby', 'mindTitle');
      log.setAttribute('aria-label', 'Conversation with ' + model.name);
      input.setAttribute('aria-label', 'Message to ' + model.name);
      renderStatus(model.status, model.waiting);
      const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
      const seen = new Set();
      let previous = null;
      for (const item of model.items) {
        seen.add(item.id);
        const parts = nodes.get(item.id) || buildItem(item);
        updateItem(parts, item, model.name);
        const want = previous ? previous.nextSibling : log.firstChild;
        if (parts.li !== want) log.insertBefore(parts.li, want);
        previous = parts.li;
      }
      for (const [id, parts] of [...nodes]) if (!seen.has(id)) { parts.li.remove(); nodes.delete(id); }
      if (nearBottom) log.scrollTop = log.scrollHeight;
      // the composer: the text and the focus are never touched; only whether it can be used, and why not
      const off = model.composer.disabled;
      if (input.disabled !== off) input.disabled = off;
      reason.textContent = off ? model.composer.reason : '';
      reason.hidden = !off;
      sync();
      if (model.announce && model.announce.n !== lastAnnounced) { lastAnnounced = model.announce.n; announce.textContent = ''; announce.textContent = model.announce.text; }   // `n` counts the announcements: the same sentence twice is heard twice
    },
    show() { root.hidden = false; if (!title.isConnected) titles.prepend(title); },
    hide() { root.hidden = true; title.remove(); },
    resetAnnounce() { lastAnnounced = null; announce.textContent = ''; },
    destroyItems() { for (const [, p] of nodes) p.li.remove(); nodes.clear(); lastKind = null; actions.dataset.k = ''; }
  };
}
