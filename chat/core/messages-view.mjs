// The messages on screen: the list of messages and its scrolling (follow the newest, "jump to latest"), one message bubble with its action buttons, the empty / welcome
// screen, the "getting on-device chat ready" card, help links for a failure, and repainting the bubble that is being written. It does not decide what a
// message says or how it is sent: the chat core does, and calls in here to show it.
// createMessagesView(host) returns { jumpLatestBtn, followLatest (get / set), prep (get / set), welcomeSetup (get), nearBottom, scrollToLatest, helpLink, helpAnchorFor, statusNote,
// buildPrepCard, fillBody, createMessageEl, compactActions, renderEmptyState, startWelcomeSetup, renderMessages, nodeFor, paintBubble, schedulePaint, generatingLabel }.
//
// host: el, M() (pure modules), messagesEl, STATUS(), gen() (the running answer or null), currentThread(), currentThreadId(), updateContextMeter(thread), renderSummaryDivider,
// actionButton, messageDecorators, events, openProviderSettings, openAbout, showToast, clockText, copyText, plus whatever a message needs (see the destructure below)
import { siteLinks } from '../site/site-links.mjs';
export function createMessagesView(host) {
  const { el, messagesEl, STATUS, showToast, clockText, renderSources, actionButton, messageDecorators, openProviderSettings, openAbout, currentThread, renderSummaryDivider } = host;
  const { } = host;
  const jumpLatestBtn = document.getElementById('jumpLatest');
  let followLatest = true;
  const nearBottom = () => messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 80;
  function scrollToLatest(force = false) {
    if (force) followLatest = true;
    if (followLatest) messagesEl.scrollTop = messagesEl.scrollHeight;
    if (jumpLatestBtn) jumpLatestBtn.hidden = followLatest || messagesEl.scrollHeight <= messagesEl.clientHeight;
  }
  messagesEl.addEventListener('scroll', () => {
    followLatest = nearBottom();
    if (jumpLatestBtn) jumpLatestBtn.hidden = followLatest;
  }, { passive: true });
  if (jumpLatestBtn) jumpLatestBtn.addEventListener('click', () => { scrollToLatest(true); messagesEl.focus({ preventScroll: true }); });

  const ROBOT_NAME = 'Roberta';  // the app's robot (chat/roberta/ivr-content.mjs holds the same name for the menu)
  /** A link to the Help page section for a problem, opened in a new tab so the chat and draft stay put. Null when this copy has no Help page (chat/site/site-links.mjs): draw nothing. */
  function helpLink(anchor, label) {
    const href = siteLinks().href('help', anchor);
    if (!href) return null;
    const a = el('a', 'help-link', label); a.href = href; a.target = '_blank'; a.rel = 'noopener';
    a.appendChild(el('span', 'sr-only', ' (opens in a new tab)'));
    return a;
  }
  const helpAnchorFor = text => (/stall|download|connection|network|offline|resum/i.test(text) ? 'stalled-download' : /storage|quota|disk|space|evict/i.test(text) ? 'model-storage' : /load|memory|webgpu|gpu|runtime|model/i.test(text) ? 'load-failure' : null);
  const statusNote = msg => {
    const S = STATUS();
    if (msg.status === S.STOPPED) return ['Response stopped. The partial response has been kept.', false];
    if (msg.status === S.LENGTH) return ['This response reached the model’s context limit. Continue it, or review a summary of the earlier conversation.', false];
    if (msg.status === S.INTERRUPTED) return ['The previous response was interrupted. What was written is kept; retry or continue when you are ready.', false];
    if (msg.status === S.FAILED && msg.errorKind === 'offline') return ['You are offline. ' + (msg.error || '') + (msg.content ? ' What was written is kept.' : ' Your question is still here. Retry when you are back online.'), true];
    if (msg.status === S.FAILED) return ['The response was interrupted. ' + (msg.error || '') + (msg.content ? ' What was written is kept.' : ' Your question is still in this conversation. Retry when you are ready.'), true];
    return null;
  };

  // ---- getting on-device chat ready: a calm progress card, shown where the answer will appear ----------------------------
  let prep = null; // { messageId, progress, card } for the reply that is waiting on the model
  const fmtBytes = n => (n >= 1e9 ? (n / 1e9).toFixed(1) + ' GB' : Math.max(1, Math.round(n / 1e6)) + ' MB');
  const fmtEta = sec => (!Number.isFinite(sec) || sec <= 0 ? '' : sec < 90 ? 'less than a minute left' : 'about ' + Math.round(sec / 60) + ' min left');
  const generatingLabel = () => window.localModels?.backend === 'cpu' ? 'Generating on this device\u2019s processor (slower)\u2026' : 'Generating on this device\u2026';
  function buildPrepCard({ intro, question = '', onCancelMessage = null, onCancelDownload = null }) {
    const lm = window.localModels, info = lm?.prepareInfo?.() || {};
    const card = el('div', 'prep-card'); card.setAttribute('role', 'status');
    const head = el('div', 'prep-head'); const spin = el('span', 'prep-spinner'); spin.setAttribute('aria-hidden', 'true');
    head.append(spin, el('strong', null, 'Getting on-device chat ready'));
    const waiting = el('p', 'prep-waiting');
    if (question) { waiting.append('Waiting to send: '); waiting.appendChild(el('q', null, question.length > 140 ? question.slice(0, 140).trimEnd() + '\u2026' : question)); }
    const phase = el('p', 'prep-phase', 'Starting\u2026');
    const bar = el('div', 'prep-bar'); bar.setAttribute('role', 'progressbar'); bar.setAttribute('aria-label', 'Model download progress'); bar.setAttribute('aria-valuemin', '0'); bar.setAttribute('aria-valuemax', '100');
    const fill = el('div', 'prep-fill'); bar.appendChild(fill);
    const detail = el('p', 'prep-detail');
    const size = info.downloadBytes ? fmtBytes(info.downloadBytes) : 'a few GB';
    const calm = el('p', 'prep-calm', intro + ' This runs on your device, so the model downloads once (about ' + size + ') and then works without a connection.' + (lm?.backend === 'cpu' ? ' No usable graphics card was found, so it runs on your processor: it works, but replies come more slowly.' : '') + (onCancelMessage ? ' You can cancel the message at any time; the download keeps going.' : ''));
    const actions = el('div', 'prep-actions');
    const help = el('p', 'prep-help'); help.hidden = true;
    card.append(head, ...(question ? [waiting] : []), phase, bar, detail, calm, actions, help);
    let lastPhase = '';
    const api = { el: card, update(p) {
      const key = p.phase + (p.phase === 'offline' ? '' : '');
      if (key !== lastPhase) {
        lastPhase = key;
        const nm = 'the chat model' + (p.modelName ? ' ' + p.modelName : '');
        phase.textContent = { starting: 'Starting\u2026', download: 'Downloading ' + nm, check: 'Checking the download\u2026', load: 'Loading ' + nm + ' into memory\u2026', offline: 'Waiting for a connection. Your progress is saved and the download will continue.', retrying: 'The download was interrupted. Trying again\u2026', stalled: 'The download stalled. Restarting it now; nothing already downloaded is lost.', 'another-tab': 'Another tab is downloading ' + nm + '. This one continues when it finishes.', ready: 'Ready.' }[p.phase] || 'Working\u2026';
        bar.classList.toggle('indeterminate', p.phase !== 'download');
        const anchor = p.phase === 'stalled' || p.phase === 'retrying' ? 'stalled-download' : p.phase === 'offline' ? 'offline-readiness' : null;
        const helpA = anchor ? helpLink(anchor, 'Download stuck? Get help') : null; help.hidden = !helpA; help.textContent = ''; if (helpA) help.appendChild(helpA);
        actions.textContent = '';
        if (onCancelMessage) { const c = el('button', 'secondary', 'Cancel message'); c.type = 'button'; c.addEventListener('click', onCancelMessage); actions.appendChild(c); }
        if (onCancelDownload && ['starting', 'download', 'retrying', 'check', 'offline', 'stalled'].includes(p.phase)) { const c = el('button', 'link-btn', 'Cancel download'); c.type = 'button'; c.addEventListener('click', onCancelDownload); actions.appendChild(c); }
        const smaller = lm?.prepareInfo?.();
        if (smaller?.tier === 'default' && ['starting', 'download', 'retrying', 'check', 'stalled'].includes(p.phase)) {
          const b = el('button', 'link-btn', 'Use the smaller model instead (faster to download)'); b.type = 'button';
          b.addEventListener('click', () => { b.textContent = 'Switching\u2026'; lm.switchTier('light').catch(err => showToast(err.message, 6000)); });
          actions.appendChild(b);
        }
      }
      if (p.phase === 'download') {
        const pct = Math.round((p.fraction || 0) * 100);
        fill.style.width = pct + '%'; bar.setAttribute('aria-valuenow', String(pct));
        detail.textContent = pct + '%  \u00B7  ' + fmtBytes(p.bytesDone || 0) + ' of ' + fmtBytes(p.totalBytes || 0) + (fmtEta(p.etaSeconds) ? '  \u00B7  ' + fmtEta(p.etaSeconds) : '');
      } else { fill.style.width = ''; bar.removeAttribute('aria-valuenow'); detail.textContent = p.modelName && p.phase !== 'offline' ? p.modelName : ''; }
    } };
    api.update(prep?.progress || { phase: 'starting' });
    return api;
  }

  function fillBody(body, msg) {
    if (msg.role === 'assistant' && msg.status === 'preparing' && prep?.messageId === msg.id) {
      prep.card = buildPrepCard({ intro: 'Your message is saved and will be sent as soon as this finishes.', question: prep.question, onCancelMessage: () => host.gen()?.controller.abort(), onCancelDownload: () => window.localModels.cancelDownload() });
      body.replaceChildren(prep.card.el);
      return;
    }
    if (msg.role === 'assistant' && host.M()) {
      body.replaceChildren(host.M().markdown.renderMarkdown(msg.content, document));
    } else {
      body.textContent = msg.content;
    }
  }

  function createMessageEl(thread, msg, index, lastIndex) {
    const S = STATUS();
    const isLast = index === lastIndex;
    const streaming = msg.status === S.STREAMING || msg.status === S.PREPARING;
    const div = el('div', 'message ' + msg.role + (streaming ? ' streaming' : '') + (msg.status === S.PREPARING ? ' preparing' : '') + (msg.excluded ? ' excluded' : ''));
    div.dataset.id = msg.id;
    div.appendChild(el('div', 'speaker', msg.role === 'user' ? 'You' : msg.role === 'assistant' ? 'AI response' : 'Notice'));
    if (msg.attachments?.length) {
      const chips = el('div', 'message-attachments');
      msg.attachments.forEach(a => chips.appendChild(el('span', 'chip', '📎 ' + a.name)));
      div.appendChild(chips);
    }
    const body = el('div', 'message-body');
    fillBody(body, msg);
    if (msg.role === 'user' && msg.voice) div.appendChild(el('div', 'voice-badge', '\uD83C\uDF99 Voice note \u00B7 ' + clockText(msg.voice.seconds) + ' \u00B7 transcribed by your browser; the audio was not saved'));
    if (msg.role === 'assistant' && msg.voiceNote && msg.content && !streaming && host.voiceUiApi()?.noteSupport) host.voiceUiApi().mountMessageVoiceNote(div, body, msg);
    div.appendChild(body);
    if (msg.role === 'assistant' && msg.sources?.length && !streaming) div.appendChild(renderSources(msg));
    if (msg.role === 'user' && msg.tools?.length) div.appendChild(el('div', 'message-meta', msg.tools.map(t => '\uD83E\uDDEE ' + t.label + ' = ' + t.result).join('   \u00B7   ')));
    if (msg.role === 'assistant' && msg.local) div.appendChild(el('div', 'message-meta', 'Computed on this device, not by the model.'));
    else if (msg.role === 'assistant' && msg.model && !streaming) div.appendChild(el('div', 'message-model', msg.model));
    const note = statusNote(msg);
    if (note) {
      const meta = el('div', 'message-meta' + (note[1] ? ' failed' : ''));
      meta.appendChild(el('span', 'badge', note[0]));
      const anchor = note[1] && window.localModels?.mode === 'local' ? helpAnchorFor(msg.error || '') : null;
      const helpA = anchor ? helpLink(anchor, 'Get help') : null;
      if (helpA) { meta.appendChild(document.createTextNode(' ')); meta.appendChild(helpA); }
      div.appendChild(meta);
    }
    if (msg.excluded) div.appendChild(el('div', 'message-meta', 'Left out of what the model sees. It stays in the saved conversation.'));
    const ctx = { isLast, streaming, busy: Boolean(host.gen()) };
    const actions = el('div', 'message-actions');
    actions.setAttribute('role', 'group');
    actions.setAttribute('aria-label', (msg.role === 'user' ? 'Your' : 'Assistant') + ' message actions');
    if (!streaming && !msg.notice && msg.role !== 'system') {
      if (msg.role === 'user') {
        if (!ctx.busy) actions.appendChild(actionButton('edit-message', '✏️ Edit', 'Edit message'));
      }
      actions.appendChild(actionButton('copy-message', '📋 Copy', msg.role === 'assistant' ? 'Copy response' : 'Copy message'));
      if (msg.role === 'assistant') {
        if (msg.versions?.length > 1) {
          const sw = el('span', 'version-switch');
          if (msg.versionIndex > 0) sw.appendChild(actionButton('prev-version', '‹', 'Previous response'));
          sw.appendChild(el('span', null, (msg.versionIndex + 1) + '/' + msg.versions.length));
          if (msg.versionIndex < msg.versions.length - 1) sw.appendChild(actionButton('next-version', '›', 'Next response'));
          sw.setAttribute('aria-label', 'Response ' + (msg.versionIndex + 1) + ' of ' + msg.versions.length);
          actions.appendChild(sw);
        }
        if (isLast && !ctx.busy) {
          if (msg.status === S.FAILED && !msg.content) actions.appendChild(actionButton('retry', '↻ Retry', 'Retry response'));
          else {
            if (host.M().model.CONTINUABLE.has(msg.status) && msg.content) actions.appendChild(actionButton('continue', '▶ Continue', 'Continue response'));
            actions.appendChild(actionButton('regenerate', '↻ Regenerate', 'Generate another response'));
          }
        }
      }
      const hide = actionButton('toggle-context', msg.excluded ? '➕ Include in context' : '➖ Leave out of context', msg.excluded ? 'Include this message in what the model sees' : 'Leave this message out of what the model sees');
      hide.setAttribute('aria-pressed', msg.excluded ? 'true' : 'false');
      actions.appendChild(hide);
      messageDecorators.forEach(fn => fn(thread, msg, index, ctx, actions, div));
    }
    compactActions(actions);
    if (actions.childElementCount) div.appendChild(actions);
    return div;
  }

  // The everyday actions stay in view; the rest live behind "More".
  const PRIMARY_ACTIONS = new Set(['edit-message', 'copy-message', 'regenerate', 'retry', 'continue', 'speak', 'voice-note', 'summarize']);
  function compactActions(actions) {
    const extra = [...actions.children].filter(n => n.matches?.('button[data-action]') && !PRIMARY_ACTIONS.has(n.dataset.action));
    if (!extra.length) return;
    extra.forEach(n => n.remove());
    const more = actionButton('more', '⋮', 'More actions');
    more._extra = extra;
    actions.appendChild(more);
  }
  function renderEmptyState(thread) {
    const box = el('div', 'empty-state');
    box.id = 'emptyState';
    const lm = window.localModels, local = lm?.mode === 'local';
    const unsupported = local && lm && lm.supported === false && !lm.ready && Boolean(lm.gpuHelp && lm.gpuHelp.kind !== 'ok');
    const help = unsupported ? lm.gpuHelp : null;
    if (unsupported) {
      // this browser cannot run the on-device models: say so and offer the other path, instead of a setup that cannot work
      box.classList.add('welcome');
      box.appendChild(el('h2', null, help?.headline || 'This browser cannot run the available on-device models.'));
      box.appendChild(el('p', 'lede', (help?.detail ? help.detail + ' ' : '') + 'Try a supported browser, or choose a connected provider.'));
      if (help?.steps?.length) { const steps = el('ol', 'gpu-steps'); help.steps.slice(0, 3).forEach(t => steps.appendChild(el('li', null, t))); box.appendChild(steps); }
      const provider = el('button', 'primary', 'Choose a connected provider'); provider.type = 'button'; provider.id = 'emptyProvider';
      provider.addEventListener('click', () => { window.localModels?.setMode('api'); openProviderSettings(document.getElementById('endpointSelect')); });
      const how = el('button', 'secondary', 'How privacy works'); how.type = 'button'; how.addEventListener('click', () => openAbout());
      const row = el('div', 'welcome-actions'); row.append(provider, how); box.appendChild(row);
      return box;
    }
    if (local && welcomeSetup) {
      box.classList.add('welcome');
      box.appendChild(el('p', 'eyebrow', 'PRIVATE AI CHAT ON YOUR DEVICE'));
      box.appendChild(el('h2', null, welcomeSetup.error ? 'Setup did not finish.' : 'Setting up on-device chat'));
      if (welcomeSetup.error) {
        box.appendChild(el('p', 'lede', welcomeSetup.error));
        const hl = helpAnchorFor(welcomeSetup.error), hlink = hl ? helpLink(hl, 'Get help with this') : null; if (hlink) { const hp = el('p', 'hint-text'); hp.appendChild(hlink); box.appendChild(hp); }
        const again = el('button', 'primary', 'Try again'); again.type = 'button'; again.addEventListener('click', () => startWelcomeSetup()); box.appendChild(again);
      } else {
        welcomeSetup.card = buildPrepCard({ intro: 'You can start typing your first message now.', onCancelDownload: () => window.localModels.cancelDownload() });
        welcomeSetup.card.update(welcomeSetup.progress);
        box.appendChild(welcomeSetup.card.el);
      }
      return box;
    }
    box.appendChild(el('h2', null, thread.temporary ? 'Temporary chat' : host.M().shellRegistry.greeting()));
    if (thread.temporary) box.appendChild(el('p', 'lede', 'Not saved to your history. Copy anything you want to keep before closing it.'));
    return box;
  }
  // The welcome button just starts: no dialog. Progress appears right there, and the first message can be typed meanwhile.
  let welcomeSetup = null; // { progress, card, error }
  async function startWelcomeSetup() {
    const lm = window.localModels;
    welcomeSetup = { progress: { phase: 'starting' }, card: null, error: null };
    const thread = currentThread(); if (thread) renderMessages(thread);
    try {
      await lm.ensureReady({ onProgress: p => { if (welcomeSetup) { welcomeSetup.progress = p; welcomeSetup.card?.update(p); } } });
      welcomeSetup = null;
      showToast('On-device chat is ready.');
    } catch (err) {
      welcomeSetup = { error: err.message || 'Setup could not finish.' };
    }
    const t = currentThread(); if (t && !t.messages.length) renderMessages(t);
  }

  function renderMessages(thread, { keepScroll = false } = {}) {
    const previousTop = messagesEl.scrollTop;
    messagesEl.textContent = '';
    if (!thread) return;
    if (thread.temporary) messagesEl.appendChild(el('div', 'temp-banner', 'Temporary chat: it isn’t saved and is forgotten when you close or reload the page.'));
    const lastIndex = (() => { for (let i = thread.messages.length - 1; i >= 0; i--) if (!thread.messages[i].notice) return i; return -1; })();
    if (!thread.messages.length) messagesEl.appendChild(renderEmptyState(thread));
    thread.messages.forEach((msg, index) => {
      if (thread.summary && thread.summary.upTo === index) messagesEl.appendChild(renderSummaryDivider(thread));
      messagesEl.appendChild(createMessageEl(thread, msg, index, lastIndex));
    });
    if (thread.summary && thread.summary.upTo >= thread.messages.length) messagesEl.appendChild(renderSummaryDivider(thread));
    if (keepScroll && !followLatest) { messagesEl.scrollTop = previousTop; if (jumpLatestBtn) jumpLatestBtn.hidden = nearBottom(); }
    else if (!thread.messages.length) messagesEl.scrollTop = 0; // the start screen (and Roberta at its top) is read from the top
    else scrollToLatest(true);
    host.updateContextMeter()?.(thread);
  }
  const nodeFor = id => messagesEl.querySelector('[data-id="' + (window.CSS?.escape ? CSS.escape(id) : id) + '"]');
  let paintPending = null;
  function paintBubble(threadId, msg) {
    if (threadId !== host.currentThreadId()) return;
    const node = nodeFor(msg.id);
    if (!node) return;
    fillBody(node.querySelector('.message-body'), msg);
    scrollToLatest();
  }
  function schedulePaint(threadId, msg) {
    const idle = paintPending === null;
    paintPending = { threadId, msg };
    if (!idle) return;
    const run = () => { const p = paintPending; paintPending = null; if (p) paintBubble(p.threadId, p.msg); };
    if (document.hidden) run(); else requestAnimationFrame(run);
  }

  return { jumpLatestBtn, get followLatest() { return followLatest; }, set followLatest(v) { followLatest = v; }, get prep() { return prep; }, set prep(v) { prep = v; }, get welcomeSetup() { return welcomeSetup; }, nearBottom, scrollToLatest, helpLink, helpAnchorFor, statusNote, buildPrepCard, fillBody, createMessageEl, compactActions, renderEmptyState, startWelcomeSetup, renderMessages, nodeFor, paintBubble, schedulePaint, generatingLabel, fmtBytes, fmtEta, ROBOT_NAME };
}
