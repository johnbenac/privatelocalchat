// Two things you can do with an answer: save it as a file (the whole text, each code block, a table as CSV...) and open it in a simple draft editor that stays with the
// conversation. createDrafts(host) adds the two buttons under assistant answers and the editor's button in the header.
//
// host: el, events, createEmoji, actionButton, messageDecorators, messageActionHandlers, messageInput, headerTools (the element the editor's button joins),
//       openAppDialog, promptDialog, currentThread(), saveThreads, generating(), growComposer(), sendMessage(), copyText, downloadText, loadExports() (chat/transfer/exports.mjs)

export function createDrafts(host) {
  const { el, events, createEmoji, actionButton, messageDecorators, messageActionHandlers, messageInput, openAppDialog, saveThreads } = host;
  // save an answer as a file
  messageDecorators.push((thread, msg, index, ctx, actions) => {
    if (msg.role !== 'assistant' || !msg.content || ctx.streaming) return;
    actions.appendChild(actionButton('save-message', '⬇ Save as a file', 'Save this response as a file'));
    actions.appendChild(actionButton('open-canvas', '📝 Open in editor', 'Open this response in the draft editor'));
  });
  messageActionHandlers['save-message'] = async (thread, msg) => {
    const ex = await host.loadExports();
    const root = el('div');
    ex.exportsFor(msg.content, thread.title).forEach(item => {
      const row = el('div', 'list-row'); row.append(el('span', null, item.label));
      const b = el('button', 'secondary', 'Save'); b.type = 'button'; b.setAttribute('aria-label', 'Save ' + item.label);
      b.addEventListener('click', () => host.downloadText(item.filename, item.text, item.mime)); row.appendChild(b); root.appendChild(row);
    });
    openAppDialog({ title: 'Save this answer', content: root, actions: [{ label: 'Done', primary: true }] });
  };

  // a simple editor for longer drafts
  let canvas = null;
  function ensureCanvas() {
    if (canvas) return canvas;
    const pane = el('aside', 'canvas-pane'); pane.hidden = true; pane.setAttribute('aria-label', 'Draft editor'); pane.id = 'canvasPane';
    const head = el('div', 'dialog-head'); head.appendChild(el('strong', null, 'Draft editor'));
    const close = el('button', 'icon-action', '✕'); close.type = 'button'; close.setAttribute('aria-label', 'Close editor'); head.appendChild(close);
    const area = el('textarea'); area.setAttribute('aria-label', 'Draft text'); area.id = 'canvasText';
    const bar = el('div', 'dialog-actions');
    const mk = (label, fn) => { const b = el('button', 'secondary', label); b.type = 'button'; b.addEventListener('click', fn); bar.appendChild(b); return b; };
    mk('Copy', () => host.copyText(area.value, 'Draft copied'));
    mk('Save .md', () => host.downloadText('draft.md', area.value, 'text/markdown'));
    mk('Save .txt', () => host.downloadText('draft.txt', area.value));
    mk('Revise with assistant…', async () => {
      const instruction = await host.promptDialog('Revise with the assistant', 'What should change?', '', { confirmLabel: 'Send' });
      if (!instruction || !instruction.trim() || host.generating()) return;
      messageInput.value = 'Revise the draft below. ' + instruction.trim() + '\nReturn only the revised draft.\n\n---\n' + area.value;
      host.growComposer(); await host.sendMessage();
    });
    pane.append(head, area, bar); document.body.appendChild(pane);
    let t = null;
    area.addEventListener('input', () => { window.clearTimeout(t); t = window.setTimeout(() => { const th = host.currentThread(); if (!th) return; th.canvas = { text: area.value, updatedAt: Date.now() }; saveThreads(); }, 400); });
    close.addEventListener('click', () => { pane.hidden = true; canvasBtn.setAttribute('aria-pressed', 'false'); canvasBtn.focus(); });
    pane.addEventListener('keydown', e => { if (e.key === 'Escape') close.click(); });
    canvas = { pane, area };
    return canvas;
  }
  function openCanvas(text) {
    const c = ensureCanvas(), th = host.currentThread();
    c.area.value = text ?? th?.canvas?.text ?? '';
    if (text != null && th) { th.canvas = { text, updatedAt: Date.now() }; saveThreads(); syncCanvasBtn(th); }
    c.pane.hidden = false; canvasBtn.setAttribute('aria-pressed', 'true'); c.area.focus();
  }
  const canvasBtn = el('button', 'icon-btn'); canvasBtn.appendChild(createEmoji('📝')); canvasBtn.hidden = true; canvasBtn.type = 'button'; canvasBtn.id = 'canvasBtn'; canvasBtn.title = 'Draft editor for this chat';
  canvasBtn.setAttribute('aria-label', 'Open draft editor'); canvasBtn.setAttribute('aria-pressed', 'false');
  canvasBtn.addEventListener('click', () => { const c = ensureCanvas(); if (c.pane.hidden) openCanvas(); else c.pane.querySelector('[aria-label="Close editor"]').click(); });
  host.headerTools.appendChild(canvasBtn); // shown only for a chat that has a draft
  const syncCanvasBtn = thread => { canvasBtn.hidden = !(thread?.canvas?.text); };
  events.on('thread:selected', syncCanvasBtn);
  messageActionHandlers['open-canvas'] = (thread, msg) => openCanvas(msg.content);
  events.on('thread:selected', () => { if (canvas && !canvas.pane.hidden) { canvas.pane.hidden = true; canvasBtn.setAttribute('aria-pressed', 'false'); } });

  return { openCanvas };
}
