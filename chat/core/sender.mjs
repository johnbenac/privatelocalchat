// Sending: a message goes out, the reply is written into its bubble as it streams, and a bubble's own buttons (edit, retry, continue, regenerate, copy, branch...) work.
// It decides when to send and what to show; the engines are local-models.js (on this device) or the connected provider (an OpenAI-compatible request).
// createSender(host) returns { scheduleSave, flushSave, setGenerating, runReply, buildInferenceMessages, contextOptions, handleSendMessage, sendToApi, beginEdit,
// handleMessageAction, extensionFor }.
//
// host: g (the running answer: gen, controller, busy, with setters), M(), moduleBase(), currentThreadId(), and the page capabilities named in the destructure below
// (threads, the messages view, the provider settings, documents, the event list)
import { buildApiRequest, readApiStream, errorDetail } from '../provider/api-formats.mjs';

export function createSender(host) {
  const { saveThreads, persistThreads: persist, updateChatAvailability, updateSendButtonDisabled, getThread, STATUS, messagesView, providerName, renderMessages, events,
    schedulePaint, modelLabel, provider, updateAuthGuidance, isAuthError, buildAuthErrorMessage, renderThreadList, CONTINUE_PROMPT, getChatState,
    triggerEndpointGuidance, messageInput, docsUi, currentThread, threadTitleInput, growComposer, persistDraftNow, authTokenFor,
    deriveChatCompletionsUrl, showToast, el, copyText, downloadText, messageActionHandlers, offline } = host;
  const g = host.g;
  let saveTimer = null;
  const scheduleSave = () => { if (saveTimer) return; saveTimer = window.setTimeout(async () => { saveTimer = null; try { await saveThreads(); } catch { /* save failure is reported via onResult */ } }, 800); };
  const flushSave = async () => { if (saveTimer) { window.clearTimeout(saveTimer); saveTimer = null; } try { await saveThreads(); } catch { /* save failure is reported via onResult */ } };

  function setGenerating(on) {
    g.busy = on;
    document.getElementById('stopGeneration').hidden = !on;
    updateChatAvailability();
    updateSendButtonDisabled();
  }

  /**
   * Write one assistant reply for a conversation.
   *  new         a fresh assistant message after the last prompt
   *  regenerate  another answer to the same prompt; the earlier one stays as a version
   *  retry       the same request again, in place (nothing was produced the first time)
   *  continue    append to a stopped, cut-off or failed answer
   */
  async function runReply(threadId, { mode = 'new', message = null } = {}) {
    const thread = getThread(threadId);
    if (!thread || g.gen) return { ok: false, code: 'busy' };
    const S = STATUS();
    let msg = message, baseText = '';
    const before = msg ? JSON.parse(JSON.stringify(msg)) : null, updatedBefore = thread.updatedAt;   // what an abandoned start puts back (this tab's memory only)
    if (mode === 'continue') baseText = msg.content;
    else if (mode === 'regenerate') host.M().model.beginNewVersion(msg);
    else if (mode === 'retry') { msg.content = ''; host.M().model.syncActiveVersion(msg); }
    else { msg = host.M().model.makeMessage('assistant', '', { status: S.STREAMING }); thread.messages.push(msg); }
    const needsPrep = window.localModels?.mode === 'local' && !window.localModels.ready;
    msg.status = needsPrep ? S.PREPARING : S.STREAMING; delete msg.error;
    if (needsPrep) messagesView.prep = { messageId: msg.id, progress: { phase: 'starting' }, card: null, question: thread.messages[thread.messages.indexOf(msg) - 1]?.content || '' };
    const controller = new AbortController();
    g.gen = { threadId, messageId: msg.id, controller };
    g.controller = controller;
    const generationStatus = document.getElementById('generationStatus');
    generationStatus.hidden = false;
    generationStatus.textContent = needsPrep ? 'Getting on-device chat ready…' : window.localModels?.mode === 'local' ? messagesView.generatingLabel() : 'Waiting for ' + providerName() + '…';
    setGenerating(true);
    host.M().model.touch(thread);
    // The start of an answer is a mutation of the stored chat (a placeholder, a new version, a cleared answer). Nothing is dispatched to the model unless it was actually stored: a refused or
    // conflicted start is taken back in this tab's memory (never written to storage) and the person is told.
    let started; try { started = await persist(threadId, startWords[mode]); } catch { started = { saved: false }; }
    if (!started.saved) {
      if (mode === 'new') { const at = thread.messages.indexOf(msg); if (at >= 0) thread.messages.splice(at, 1); }
      else { for (const k of Object.keys(msg)) delete msg[k]; Object.assign(msg, before); }
      thread.updatedAt = updatedBefore;
      messagesView.prep = null; g.gen = null; g.controller = null;
      generationStatus.textContent = 'Not started. Nothing was sent to the model and nothing was changed.';
      setGenerating(false);
      if (threadId === host.currentThreadId()) messagesView.renderMessages(thread, { keepScroll: true });
      return { ok: false, code: started.code || 'not-saved' };
    }
    if (threadId === host.currentThreadId()) messagesView.renderMessages(thread, { keepScroll: false });
    events.emit('reply:start', thread, msg);
    const index = thread.messages.indexOf(msg);
    const join = next => (baseText && next && !/\s$/.test(baseText) && !/^\s/.test(next) && /[.!?:;,)\]]$/.test(baseText) && /^[\p{L}\p{N}]/u.test(next) ? ' ' : '');
    let streamed = '', finished = { ok: true };
    const onText = full => {
      streamed = full;
      msg.content = baseText + join(full) + full;
      host.M().model.syncActiveVersion(msg);
      generationStatus.textContent = (window.localModels?.mode === 'local' ? (messagesView.generatingLabel() + ' ') : 'Receiving the response… ') + full.length + ' characters written';
      messagesView.schedulePaint(threadId, msg);
      scheduleSave();
      events.emit('reply:text', thread, streamed);
    };
    try {
      if (needsPrep) {
        // First message on this device: get a model (download once, load) while showing what is happening, then answer.
        await window.localModels.ensureReady({ signal: controller.signal, onProgress: p => {
          if (!messagesView.prep) return;
          messagesView.prep.progress = p; messagesView.prep.card?.update(p);
          generationStatus.textContent = p.phase === 'download' ? 'Downloading the chat model' + (p.modelName ? ' ' + p.modelName : '') + '… ' + Math.round((p.fraction || 0) * 100) + '%' : p.phase === 'load' ? 'Loading the chat model' + (p.modelName ? ' ' + p.modelName : '') + ' into memory…' : 'Getting on-device chat ready…';
        } });
        messagesView.prep = null;
        msg.status = S.STREAMING;
        generationStatus.textContent = messagesView.generatingLabel();
        if (threadId === host.currentThreadId()) messagesView.renderMessages(thread, { keepScroll: false });
      }
      const context = await buildInferenceMessages(thread, index, mode);
      let result;
      for (let attempt = 0; ; attempt++) {
        try { result = await sendToApi(context, controller.signal, onText); break; }
        catch (err) {
          // A model that was only just loaded can fail its very first request. That is the app's problem to retry, not the person's.
          const transient = window.localModels?.mode === 'local' && attempt === 0 && !streamed && err?.name !== 'AbortError' && !['context-overflow', 'invalid-request', 'aborted'].includes(err?.class);
          if (!transient) throw err;
          console.warn('Retrying the first request once:', err);
          generationStatus.textContent = 'Getting the model ready again…';
          await window.localModels.ensureReady({ signal: controller.signal });
        }
      }
      msg.content = baseText + join(result.text) + result.text;
      if (result.finishReason === 'length') msg.status = S.LENGTH; else delete msg.status;
      generationStatus.textContent = msg.status === S.LENGTH ? 'The response reached the context limit.' : 'Response complete.';
      msg.model = modelLabel();
      provider.authErrors = 0;
      if (window.localModels?.mode === 'api') offline?.noteRequest(true);
      updateAuthGuidance();
    } catch (err) {
      if (err?.name !== 'AbortError' && err?.code !== 'cancelled') console.error(err);
      const partial = typeof err?.partialText === 'string' ? err.partialText : streamed;
      msg.content = baseText + (partial ? join(partial) + partial : '');
      if (err?.name === 'AbortError' || err?.code === 'cancelled') {
        msg.status = S.STOPPED;
        generationStatus.textContent = err?.code === 'cancelled' ? 'The download was stopped. Your message is still here.' : 'Response stopped. The partial response has been kept.';
      } else {
        msg.status = S.FAILED;
        if (window.localModels?.mode === 'local' && ['out-of-memory', 'load-failed'].includes(err?.class)) window.plcMemoryReady?.().then(m => m.offerFailure?.('chat', 'the chat model')).catch(() => {});
        const errorText = err && typeof err.message === 'string' && err.message ? err.message : 'Unknown error';
        // A request that never got an answer is the connection, not the provider: say so in words, and tell the connection layer. Only when the
        // connection layer agrees that the app is offline is it called "offline"; a stream that dropped on a working connection is "could not reach".
        const networkFailure = window.localModels?.mode === 'api' && offline?.isNetworkError(err);
        if (networkFailure) offline.noteRequest(false, err);
        const isOffline = networkFailure && offline.connection.state === 'offline' && offline.providerPlace() === 'internet';
        msg.error = isOffline ? offline.reason('provider') : networkFailure ? offline.reason('unreachable') : isAuthError(err) ? buildAuthErrorMessage(errorText) : errorText;
        if (isOffline) msg.errorKind = 'offline'; else delete msg.errorKind;
        generationStatus.textContent = 'The response was interrupted. ' + (networkFailure ? msg.error : errorText);
        provider.authErrors = isAuthError(err) ? Math.min(provider.authErrors + 1, 3) : 0;
      }
      updateAuthGuidance();
      // A stop that produced nothing leaves nothing behind.
      if (msg.status === S.STOPPED && !msg.content.trim()) {
        if (mode === 'regenerate' && msg.versions) {
          msg.versions.pop();
          if (msg.versions.length > 1) host.M().model.selectVersion(msg, msg.versions.length - 1); else { const v = msg.versions[0]; msg.content = v.content; if (v.status) msg.status = v.status; else delete msg.status; delete msg.versions; delete msg.versionIndex; }
        } else if (mode === 'new') {
          thread.messages.splice(thread.messages.indexOf(msg), 1);
        } else { msg.status = baseText ? S.STOPPED : S.FAILED; }
      }
    } finally {
      if (messagesView.prep?.messageId === msg.id) messagesView.prep = null;
      if (contextSources.length) msg.sources = contextSources; else if (mode !== 'continue') delete msg.sources;
      host.M().model.syncActiveVersion(msg);
      g.gen = null; g.controller = null;
      host.M().model.touch(thread);
      if (saveTimer) { window.clearTimeout(saveTimer); saveTimer = null; }
      let ended; try { ended = await persist(threadId, 'The answer is on screen but was not saved'); } catch { ended = { saved: false }; }
      // an answer that could not be stored stays in this tab (the baseline did not move, so the next save of this chat tries again) and says so where the status is read
      if (!ended.saved) generationStatus.textContent += ' It could not be saved yet; it is tried again with the next change.';
      finished = { ok: true, saved: ended.saved };
      if (threadId === host.currentThreadId()) messagesView.renderMessages(thread, { keepScroll: true });
      setGenerating(false);
      renderThreadList();
      events.emit('reply:end', thread, msg);
    }
    return finished;
  }
  const startWords = { new: 'Your message was not answered', regenerate: 'The new answer was not started', retry: 'The retry was not started', continue: 'The continuation was not started' };
  let contextSources = [];

  async function buildInferenceMessages(thread, index, mode) {
    const { messagesForInference } = await import(host.moduleBase() + 'conversation-messages.mjs');
    const view = { ...thread, messages: thread.messages.slice(0, mode === 'continue' ? index + 1 : index) };
    // the answer being continued is already written: it is context, not a reply in progress
    if (mode === 'continue') view.messages[index] = { ...view.messages[index], status: undefined };
    const options = await contextOptions(thread, view);
    contextSources = options.sources;
    const messages = messagesForInference(view, options);
    if (mode === 'continue') messages.push({ role: 'user', content: CONTINUE_PROMPT });
    return messages;
  }
  async function contextOptions(thread, view) {
    const out = { preamble: [], attachmentText: {}, sources: [] };
    for (const part of await events.collect('context:collect', thread, view)) {
      if (part?.preamble) out.preamble.push(...part.preamble);
      if (part?.attachmentText) Object.assign(out.attachmentText, part.attachmentText);
      if (part?.sources) out.sources.push(...part.sources);
    }
    return out;
  }

  // One send at a time: while this tab's own message is waiting for its save, a second press (or Enter) is ignored, so an unsent message can never be pushed twice.
  let sending = false;
  async function handleSendMessage(event) {
    event.preventDefault();
    if (g.gen || sending) return;
    const state = getChatState();
    if (!state.ready) {
      if (!state.hasEndpoint) triggerEndpointGuidance();
      updateChatAvailability();
      return;
    }
    events.emit('send:before');
    const typed = messageInput.value, text = typed.trim();
    if (!text && !docsUi.attachments.count()) { messageInput.focus(); return; }
    const thread = currentThread();
    if (!thread) return;
    sending = true;
    try {
      if (await events.intercept('send:intercept', text, thread)) return;
      // The person's input is NOT taken from the screen until the message is stored: the composer text, the attachments and the title stay as they are while the save is awaited,
      // so a refusal has nothing to put back and newer typing is never overwritten.
      const taken = docsUi.attachments.count() ? docsUi.attachments.take() : [];
      const userMessage = host.M().model.makeMessage('user', text, taken.length ? { attachments: taken } : {});
      await events.emitAwait('prompt:ready', userMessage);
      const updatedBefore = thread.updatedAt, titleBefore = thread.title;
      thread.messages.push(userMessage);
      let derived = null;
      if (thread.messages.filter(m => m.role === 'user').length === 1 && host.M().model.hasDefaultTitle(thread)) {
        derived = host.M().model.deriveTitle(text) || null;
        if (derived) { thread.title = derived; threadTitleInput.value = thread.title; }
      }
      host.M().model.touch(thread);
      const outcome = await persist(thread.id, 'Your message was not sent');
      if (!outcome.saved) {
        // Only this send is taken back, in this tab's own memory (nothing is written to storage): the message by id, a title derived for it, the attachments it took. The composer was never cleared.
        const at = thread.messages.indexOf(userMessage); if (at >= 0) thread.messages.splice(at, 1);
        if (derived && thread.title === derived) { thread.title = titleBefore; if (thread.id === host.currentThreadId()) threadTitleInput.value = titleBefore; }
        thread.updatedAt = updatedBefore;
        if (taken.length) docsUi.attachments.restore(taken);
        if (thread.id === host.currentThreadId()) messagesView.renderMessages(thread, { keepScroll: true });
        messageInput.focus();
        return;
      }
      // stored: now (and only now) the composer lets go of the words that were sent, and only if it is still exactly what was sent. A composer that changed while the save was awaited
      // (appended to, or Select All and replaced) is the person's newer text: it stays WHOLE. An equal prefix is not proof of what the person did, so nothing is sliced off it.
      if (thread.id === host.currentThreadId()) {            // (the person may have opened another chat meanwhile: that chat's composer is not ours to touch)
        if (messageInput.value === typed) messageInput.value = '';
        growComposer();
        persistDraftNow(thread.id);
      }
      renderThreadList();
      messagesView.renderMessages(thread);
      await runReply(thread.id);
    } finally { sending = false; }
  }

  /** Send the conversation to the chosen engine and resolve with { text, finishReason }. */
  async function sendToApi(messages, signal, onText) {
    if (!window.localModels) throw new Error('Inference controls have not initialized. Reload the app before sending.');
    if (window.localModels?.mode === 'local') {
      let finishReason = 'stop';
      const text = await window.localModels.generate(messages, { signal, onToken: onText, onFinish: info => { finishReason = info?.finishReason || 'stop'; } });
      return { text, finishReason };
    }
    if (!provider.config.endpoint) throw new Error('Endpoint is not configured.');
    if (!provider.config.model) throw new Error('Model is not selected.');
    // The provider's API format (Chat Completions, Responses or Anthropic Messages) decides the address, the key header, the body and how the answer is read: chat/provider/api-formats.mjs
    const api = provider.apiSettings();
    const requestToken = authTokenFor(provider.config.endpoint);
    const payloadMessages = await docsUi.apiMessages(messages);
    const post = stream => {
      let request;
      try { request = buildApiRequest({ format: api.format, endpoint: provider.config.endpoint, model: provider.config.model, messages: payloadMessages, token: requestToken, authStyle: api.authStyle, stream, base: window.location.href }); }
      catch (err) { throw new Error('Invalid endpoint: ' + err.message); }
      return fetch(request.url, { ...request.init, signal });
    };
    let response = await post(true);
    if (!response.ok && (response.status === 400 || response.status === 422)) response = await post(false); // a provider that rejects streaming
    if (!response.ok) {
      let detail = '';
      try { detail = errorDetail(await response.clone().json()); } catch { /* body is not JSON */ }
      const error = new Error('API responded with status ' + response.status + (detail ? ': ' + detail : ''));
      error.status = response.status;
      if (response.status === 401 || response.status === 403) error.isAuthError = true;
      throw error;
    }
    const result = await readApiStream(api.format, response, { signal, onDelta: (delta, full) => onText(full) });
    return { text: result.text, finishReason: result.finishReason };
  }

  const EXT = { javascript: 'js', js: 'js', typescript: 'ts', ts: 'ts', python: 'py', py: 'py', html: 'html', css: 'css', json: 'json', bash: 'sh', sh: 'sh', shell: 'sh', markdown: 'md', md: 'md', csv: 'csv', sql: 'sql', c: 'c', cpp: 'cpp', java: 'java', go: 'go', rust: 'rs', yaml: 'yml', yml: 'yml', xml: 'xml', text: 'txt' };
  const extensionFor = lang => EXT[String(lang || '').toLowerCase()] || 'txt';

  function beginEdit(thread, msg, node) {
    if (g.gen) { showToast('Wait for the reply to finish, or press Stop.'); return; }
    const body = node.querySelector('.message-body');
    const actions = node.querySelector('.message-actions');
    const index = thread.messages.indexOf(msg);
    const box = el('div', 'edit-box');
    const area = el('textarea'); area.value = msg.content; area.setAttribute('aria-label', 'Edit your prompt');
    const row = el('div', 'row');
    const cancel = el('button', null, 'Cancel'); cancel.type = 'button';
    const save = el('button', null, 'Save and resend'); save.type = 'button';
    if (index < thread.messages.length - 1) row.appendChild(el('span', 'muted', 'Everything after this prompt is replaced by the new reply. You can undo.'));
    row.append(cancel, save); box.append(area, row);
    body.replaceChildren(box);
    if (actions) actions.hidden = true;
    area.focus();
    cancel.addEventListener('click', () => messagesView.renderMessages(thread, { keepScroll: true }));
    let saving = false;     // a second press while the edit is being stored does nothing (one edit, one resend)
    save.addEventListener('click', async () => {
      const text = area.value.trim();
      if (!text || saving || g.gen) return;
      saving = true; save.disabled = true;
      try {
        const updatedBefore = thread.updatedAt;
        const previous = host.M().model.editPrompt(thread, index, text);
        if (!previous) return;
        await events.emitAwait('prompt:ready', thread.messages[index]);
        host.M().model.touch(thread);
        const outcome = await persist(thread.id, 'Your edit was not saved or sent');
        if (!outcome.saved) {
          // taken back in this tab's memory only; the edit box stays open with the person's words, nothing is sent to the model
          host.M().model.undoEditPrompt(thread, index, previous); thread.updatedAt = updatedBefore;
          return;
        }
        messagesView.renderMessages(thread);
        const undo = async () => {
          if (g.gen && g.gen.threadId === thread.id) { g.gen.controller.abort(); while (g.gen) await new Promise(r => window.setTimeout(r, 20)); }
          host.M().model.undoEditPrompt(thread, index, previous);
          await events.emitAwait('prompt:ready', thread.messages[index]);
          host.M().model.touch(thread);
          const undone = await persist(thread.id, 'The undo was not saved');
          renderThreadList();
          if (thread.id === host.currentThreadId()) messagesView.renderMessages(thread);
          showToast(undone.saved ? 'Edit undone' : 'Edit undone on screen only (not saved yet)');
        };
        showToast('Prompt updated', 9000, { label: 'Undo', run: undo });
        runReply(thread.id);
      } finally { saving = false; save.disabled = false; }
    });
  }

  const changing = new Set();     // messages whose version / context change is being stored
  async function handleMessageAction(action, id, btn, node) {
    const thread = currentThread();
    if (!thread) return;
    if (action === 'copy-code' || action === 'download-code') {
      const block = btn.closest('.code-block');
      const code = block?.querySelector('pre code')?.textContent ?? '';
      if (action === 'copy-code') copyText(code, 'Code copied');
      else downloadText('code.' + extensionFor(block?.querySelector('.code-lang')?.textContent), code);
      return;
    }
    const msg = host.M().model.findMessage(thread, id);
    if (!msg) return;
    const S = STATUS();
    switch (action) {
      case 'copy-message': copyText(msg.content, msg.role === 'assistant' ? 'Answer copied' : 'Copied'); break;
      case 'edit-message': beginEdit(thread, msg, node); break;
      case 'regenerate': if (!g.gen) runReply(thread.id, { mode: 'regenerate', message: msg }); break;
      case 'retry': if (!g.gen) runReply(thread.id, { mode: 'retry', message: msg }); break;
      case 'continue': if (!g.gen) runReply(thread.id, { mode: 'continue', message: msg }); break;
      case 'prev-version': case 'next-version':
        if (changing.has(msg.id)) break;                               // one change per message at a time: a second press while the first is being stored does nothing
        { const OWN = ['versionIndex', 'content', 'status', 'error', 'errorKind'];   // the only fields a version selection changes: the only ones a refusal puts back
          const was = OWN.map(k => [k, k in msg, msg[k] === undefined ? undefined : JSON.parse(JSON.stringify(msg[k]))]);   // their exact before-image, taken before the selection
          if (host.M().model.selectVersion(msg, msg.versionIndex + (action === 'next-version' ? 1 : -1))) {
            changing.add(msg.id); const chosen = msg.versionIndex;
            messagesView.renderMessages(thread, { keepScroll: true });
            let o; try { o = await persist(thread.id, 'The chosen version was not saved'); } catch { o = { saved: false }; } finally { changing.delete(msg.id); }
            // a refused selection is taken back in this tab (never written); only if the message is still on the version this press chose (otherwise newer work is not overwritten)
            // (newer fields of the message that this press did not touch, written meanwhile by anything else, are never erased)
            if (!o.saved && msg.versionIndex === chosen && !g.gen) { for (const [k, had, v] of was) { if (had) msg[k] = v; else delete msg[k]; } }
            if (!o.saved) messagesView.renderMessages(thread, { keepScroll: true });
          } }
        break;
      case 'toggle-context': {
        if (changing.has(msg.id)) break;
        const wasExcluded = Boolean(msg.excluded);
        if (wasExcluded) delete msg.excluded; else msg.excluded = true;
        const toggled = Boolean(msg.excluded);
        changing.add(msg.id);
        messagesView.renderMessages(thread, { keepScroll: true });
        let o2; try { o2 = await persist(thread.id, 'The change was not saved'); } catch { o2 = { saved: false }; } finally { changing.delete(msg.id); }
        if (!o2.saved) { if (Boolean(msg.excluded) === toggled) { if (wasExcluded) msg.excluded = true; else delete msg.excluded; } messagesView.renderMessages(thread, { keepScroll: true }); }
        break;
      }
      default: if (messageActionHandlers[action]) await messageActionHandlers[action](thread, msg, btn, node);
    }
  }
  return { scheduleSave, flushSave, setGenerating, runReply, buildInferenceMessages, contextOptions, handleSendMessage, sendToApi, beginEdit, handleMessageAction, extensionFor };
}
