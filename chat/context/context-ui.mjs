// How full the model's window is (the meter above the composer) and condensing older messages: the pure planning is chat/context.mjs; this file is the meter, the
// "Summarize earlier messages" flow (which asks the model for a summary, piece by piece), the divider under which messages are summarized, and the button under a reply that
// ran out of room. The saved conversation is never shortened; only what the model is sent. createContextUi(host) returns { updateMeter, renderSummaryDivider, summarizeEarlier }.
//
// host: el, M() (the app's pure model: context and thread functions), prefs, assistant, messageForm, messageDecorators, messageActionHandlers, actionButton, showToast, promptDialog,
//       saveThreads, renderMessages, getThread(id), currentThreadId(), contextWindowTokens(), selectedFolderInstructions(thread), sendToApi(messages, signal), setGenerating(on),
//       STATUS(), generating(), preparing(), setGeneration(gen | null)
export function createContextUi(host) {
  const { el, prefs, assistant, messageForm, messageDecorators, messageActionHandlers, actionButton, showToast, promptDialog, saveThreads,
    renderMessages, getThread, contextWindowTokens, selectedFolderInstructions, sendToApi, setGenerating, STATUS } = host;
  const meterRow = el('div', 'context-meter'); meterRow.id = 'contextMeter'; meterRow.hidden = true;
  const meterText = el('span'); meterText.setAttribute('role', 'status');
  const meterBar = el('meter'); meterBar.min = 0; meterBar.max = 1; meterBar.low = 0.75; meterBar.high = 0.95; meterBar.optimum = 0; meterBar.setAttribute('aria-hidden', 'true');
  const meterBtn = el('button', 'secondary', 'Summarize earlier messages'); meterBtn.type = 'button'; meterBtn.id = 'summarizeBtn'; meterBtn.hidden = true;
  meterRow.append(meterText, meterBar, meterBtn);
  messageForm.parentNode.insertBefore(meterRow, messageForm);
  const updateContextMeter = thread => {
    if (!thread || !thread.messages.length || host.preparing()) { meterRow.hidden = true; return; }
    const extra = (prefs.instructions || '').length + (assistant.memory.enabled && !thread.temporary ? assistant.memory.items.reduce((n, i) => n + i.text.length + 2, 0) : 0) + selectedFolderInstructions(thread).length + 300;
    const u = host.M().context.contextUsage(thread, contextWindowTokens(), extra);
    const pct = Math.min(100, Math.round(u.fraction * 100));
    meterRow.hidden = false; meterRow.classList.toggle('warn', u.level !== 'ok');
    meterBar.value = Math.min(1, u.fraction);
    meterText.textContent = u.level === 'full' ? 'Conversation is full for this model (about ' + pct + '%). The next reply may fail.' : u.level === 'warn' ? 'Conversation is getting long (about ' + pct + '% of what the model can hold).' : 'Conversation uses about ' + pct + '% of the model’s memory.';
    meterText.title = 'About ' + u.tokens + ' of roughly ' + Math.round(u.windowTokens * 0.8) + ' usable tokens. Your saved conversation is never shortened.';
    meterBtn.hidden = u.level === 'ok' || host.generating() || !host.M().context.planSummary(thread, u.windowTokens);
  };
  meterBtn.addEventListener('click', () => summarizeEarlier(host.currentThreadId()));
  async function summarizeEarlier(threadId) {
    const thread = getThread(threadId);
    if (!thread || host.generating()) return;
    const plan = host.M().context.planSummary(thread, contextWindowTokens());
    if (!plan) { showToast('There isn’t enough earlier conversation to summarize yet.'); return; }
    const controller = new AbortController();
    host.setGeneration({ threadId, messageId: null, controller });
    const status = document.getElementById('generationStatus'); status.hidden = false;
    setGenerating(true);
    let summary = thread.summary?.text || '';
    try {
      for (let i = 0; i < plan.pieces.length; i++) {
        status.textContent = 'Summarizing earlier messages (' + (i + 1) + ' of ' + plan.pieces.length + ')…';
        const out = await sendToApi([{ role: 'system', content: host.M().context.SUMMARY_SYSTEM }, { role: 'user', content: host.M().context.summaryPrompt(summary, plan.pieces[i]) }], controller.signal, () => {});
        summary = out.text.trim();
        if (!summary) throw new Error('The model returned an empty summary.');
      }
      thread.summary = { text: summary, upTo: plan.upTo };
      host.M().model.touch(thread); saveThreads();
      status.textContent = 'Earlier messages summarized.';
      showToast('The model now sees a summary of the earlier messages. Your full conversation is unchanged.', 6000);
    } catch (err) {
      status.textContent = err.name === 'AbortError' ? 'Summary cancelled.' : 'Summary failed: ' + err.message;
      if (err.name !== 'AbortError') showToast('The summary could not be made: ' + err.message, 8000);
    } finally {
      host.setGeneration(null); setGenerating(false);
      if (threadId === host.currentThreadId()) renderMessages(thread, { keepScroll: true });
    }
  }
  function renderSummaryDivider(thread) {
    const d = el('div', 'context-divider'); d.setAttribute('role', 'note');
    d.append('Messages above are summarized for the model. They stay in your saved conversation. ');
    const view = el('button', 'link-btn', 'View or edit the summary'); view.type = 'button';
    view.addEventListener('click', async () => {
      const text = await promptDialog('Summary the model sees', 'Edit it, or clear it to show the model the full conversation again.', thread.summary.text, { multiline: true });
      if (text === null) return;
      if (text.trim()) thread.summary.text = text.trim(); else delete thread.summary;
      host.M().model.touch(thread); saveThreads(); renderMessages(thread, { keepScroll: true });
    });
    d.appendChild(view); return d;
  }
  messageDecorators.push((thread, msg, index, ctx, actions) => {
    const S = STATUS();
    const overflow = msg.status === S.FAILED && /context|too long|exceed|overflow/i.test(msg.error || '');
    if (ctx.isLast && !ctx.busy && msg.role === 'assistant' && (msg.status === S.LENGTH || overflow) && host.M().context.planSummary(thread, contextWindowTokens()))
      actions.appendChild(actionButton('summarize', '🗜 Summarize earlier messages', 'Summarize the earlier conversation so the model has room again'));
  });
  messageActionHandlers['summarize'] = thread => summarizeEarlier(thread.id);
  return { updateMeter: updateContextMeter, renderSummaryDivider, summarizeEarlier };
}
