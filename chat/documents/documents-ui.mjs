// Documents: attach files to a message (and drag, drop, paste), read them on this device, put the best-matching passages in front of the model, show the sources
// under an answer, and the document library. The pure parts are chat/documents/documents.mjs (what can be read, chunking, planning what goes to the model) and
// doc-store.mjs (IndexedDB); this file is the screen and the flow around them. createDocumentsUi(host) returns what the rest of the page needs.
//
// host: el, events, messageActionHandlers, messageForm, messageInput, composerTools (the element the attach input joins), chatArea (the drop target), moduleBase(),
//       models() (the chat model controller), prefs(), currentThread(), threads(), folders(), generateThreadId(), getChatState(), updateSendButtonDisabled(ready),
//       showToast, openAppDialog

export function createDocumentsUi(host) {
  const { el, events, messageActionHandlers, messageForm, messageInput, showToast, openAppDialog } = host;
  let docModules = null;
  async function loadDocModules() {
    if (docModules) return docModules;
    const base = host.moduleBase();
    const [docs, store, exportsModule] = await Promise.all([import(base + 'chat/documents/documents.mjs'), import(base + 'chat/documents/doc-store.mjs'), import(base + 'chat/transfer/exports.mjs')]);
    docModules = { docs, store: store.docStore, exports: exportsModule };
    return docModules;
  }
  const humanSize = n => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n >= 1024 ? Math.round(n / 1024) + ' KB' : n + ' B');

  function contextWindowTokens() {
    if (host.models()?.mode === 'local') {
      const s = host.models().state;
      return s?.tiers?.[s?.selection?.tier]?.info?.contextWindowTokens || 4096;
    }
    return host.prefs().apiContextTokens || 8192;
  }
  const documentBudgetTokens = () => Math.max(600, Math.floor(contextWindowTokens() * 0.45));

  async function ingestFile(file, { library = false, scope = 'all', onStatus } = {}) {
    const { docs, store } = await loadDocModules();
    const L = docs.LIMITS, kind = docs.kindOf(file.name, file.type);
    if (!kind) throw new Error(docs.unsupportedMessage(file.name));
    const temporary = Boolean(host.currentThread()?.temporary) && !library;
    const id = host.generateThreadId();
    if (kind === 'image') {
      if (host.models()?.mode === 'local') throw new Error('Pictures can only go to an API provider whose model can see images. The on-device models here read text only.');
      if (file.size > L.imageBytes) throw new Error('“' + file.name + '” is larger than ' + humanSize(L.imageBytes) + '.');
      onStatus?.('Preparing ' + file.name + '…');
      const img = await (await import(host.moduleBase() + 'chat/documents/images.mjs')).prepareImage(file);
      await store.put({ id, name: file.name, kind: 'image', size: img.size, addedAt: Date.now(), dataUrl: img.dataUrl, width: img.width, height: img.height, chars: 0, temporary });
      return { id, name: file.name, kind: 'image', size: img.size };
    }
    if (file.size > L.fileBytes) throw new Error('“' + file.name + '” is larger than ' + humanSize(L.fileBytes) + '.');
    let rec;
    if (kind === 'pdf') {
      const { extractPdf } = await import(host.moduleBase() + 'chat/documents/pdf.mjs');
      const out = await extractPdf(new Uint8Array(await file.arrayBuffer()), { onProgress: (n, total) => onStatus?.('Reading ' + file.name + ' (page ' + n + ' of ' + total + ')…') });
      rec = docs.buildDocument({ id, name: file.name, size: file.size, kind, pages: out.pages });
      if (out.emptyPages) rec.note = out.emptyPages + ' page' + (out.emptyPages === 1 ? '' : 's') + ' had no selectable text and were skipped.';
    } else {
      onStatus?.('Reading ' + file.name + '…');
      const text = await file.text();
      if (/\u0000/.test(text.slice(0, 4000))) throw new Error('“' + file.name + '” looks like a binary file, not text.');
      if (!text.trim()) throw new Error('“' + file.name + '” is empty.');
      if (text.length > L.chars) throw new Error('“' + file.name + '” has more text than can be kept on this device.');
      rec = docs.buildDocument({ id, name: file.name, size: file.size, kind, text });
    }
    rec.temporary = temporary;
    if (library) { rec.library = true; rec.scope = scope; }
    await store.put(rec);
    return { id, name: rec.name, kind: rec.kind, size: rec.size, pages: rec.pages, chars: rec.chars, note: rec.note };
  }

  // composer: attach button, chips, drag and drop, paste
  let pendingAttachments = [];
  const takePendingAttachments = () => { const out = pendingAttachments; pendingAttachments = []; renderChips(); host.updateSendButtonDisabled(host.getChatState().ready); return out; };
  const chipsRow = el('div', 'message-attachments'); chipsRow.id = 'attachmentChips'; chipsRow.style.flex = '1 0 100%';
  const chipStatus = el('span', 'muted'); chipStatus.setAttribute('role', 'status'); chipStatus.setAttribute('aria-live', 'polite'); chipStatus.id = 'attachStatus';
  messageForm.insertBefore(chipsRow, messageForm.firstChild);
  function renderChips() {
    chipsRow.textContent = '';
    pendingAttachments.forEach((a, i) => {
      const chip = el('span', 'chip');
      chip.append((a.kind === 'image' ? '🖼️ ' : '📎 ') + a.name + (a.pages ? ' · ' + a.pages + ' pages' : ''));
      const x = el('button', null, '✕'); x.type = 'button'; x.setAttribute('aria-label', 'Remove ' + a.name);
      x.addEventListener('click', () => { pendingAttachments.splice(i, 1); renderChips(); host.updateSendButtonDisabled(host.getChatState().ready); });
      chip.appendChild(x); chipsRow.appendChild(chip);
    });
    chipsRow.appendChild(chipStatus);
    chipsRow.hidden = !pendingAttachments.length && !chipStatus.textContent;
  }
  async function addFiles(fileList) {
    for (const file of [...fileList]) {
      try {
        const a = await ingestFile(file, { onStatus: t => { chipStatus.textContent = t; renderChips(); } });
        pendingAttachments.push(a);
        chipStatus.textContent = a.note || '';
      } catch (err) {
        chipStatus.textContent = '';
        showToast(err.message, 8000);
      }
    }
    chipStatus.textContent = chipStatus.textContent && !/Reading|Preparing/.test(chipStatus.textContent) ? chipStatus.textContent : '';
    renderChips(); host.updateSendButtonDisabled(host.getChatState().ready);
  }
  const attachInput = el('input'); attachInput.type = 'file'; attachInput.multiple = true; attachInput.hidden = true; attachInput.id = 'attachInput';
  attachInput.accept = '.pdf,.txt,.md,.markdown,.csv,.tsv,.json,.jsonl,.log,.xml,.yaml,.yml,.html,.htm,.js,.mjs,.ts,.py,.java,.c,.h,.cpp,.go,.rs,.rb,.php,.sh,.sql,.css,.srt,.vtt,text/*,image/png,image/jpeg,image/webp,image/gif';
  const attachTypes = attachInput.accept, attachNoImages = attachTypes.split(',').filter(x => !x.startsWith('image/')).join(',');
  const syncAttachAccept = () => { attachInput.accept = host.models()?.mode === 'local' ? attachNoImages : attachTypes; };
  window.addEventListener('local-model-state', syncAttachAccept); syncAttachAccept();
  attachInput.addEventListener('change', () => { addFiles(attachInput.files); attachInput.value = ''; });
  host.composerTools.append(attachInput);
  const chatAreaEl = host.chatArea;
  ['dragenter', 'dragover'].forEach(t => chatAreaEl.addEventListener(t, e => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); chatAreaEl.classList.add('drop-target'); } }));
  ['dragleave', 'drop'].forEach(t => chatAreaEl.addEventListener(t, e => { if (t === 'drop' && e.dataTransfer?.files?.length) { e.preventDefault(); if (host.getChatState().hasThread) addFiles(e.dataTransfer.files); } chatAreaEl.classList.remove('drop-target'); }));
  messageInput.addEventListener('paste', e => { if (e.clipboardData?.files?.length) { e.preventDefault(); addFiles(e.clipboardData.files); } });

  // what the model is told about the documents
  events.on('context:collect', async (thread, view) => {
    const attachmentList = view.messages.flatMap(m => m.attachments || []);
    const ids = [...new Set(attachmentList.filter(a => a.kind !== 'image').map(a => a.id))];
    const { docs, store } = await loadDocModules();
    let attached = [], library = [];
    try { attached = ids.length ? (await store.getMany(ids)).filter(Boolean) : []; library = await store.libraryFor(thread.folderId); } catch (err) { console.warn('Documents unavailable:', err); }
    const missing = ids.filter(id => !attached.some(d => d.id === id));
    if (!attached.length && !library.length && !missing.length) return {};
    const lastUser = [...view.messages].reverse().find(m => m.role === 'user' && !m.excluded)?.content || '';
    const budget = documentBudgetTokens();
    const plan = docs.planContext(attached, lastUser, { budgetTokens: budget });
    const used = plan.mode === 'full' ? docs.estimateTokens(Object.values(plan.fullText).join('').length) : plan.excerpts.reduce((n, e) => n + docs.estimateTokens(e.text.length), 0);
    const libPlan = library.length ? docs.planContext(library, lastUser, { budgetTokens: Math.max(300, budget - used), library: true, maxExcerpts: 4 }) : { excerpts: [] };
    const excerpts = [...plan.excerpts, ...libPlan.excerpts.map((e, i) => ({ ...e, n: plan.excerpts.length + i + 1 }))];
    const preamble = [];
    if (plan.mode === 'full') preamble.push(docs.FULL_TEXT_RULES);
    if (excerpts.length) preamble.push(docs.excerptPreamble(excerpts));
    const attachmentText = { ...plan.fullText };
    missing.forEach(id => { attachmentText[id] = '(This file is no longer stored on this device, so its contents are not available.)'; });
    const sources = plan.mode === 'full' ? attached.map(d => ({ docId: d.id, name: d.name })) : [];
    sources.push(...excerpts.map(({ n, docId, chunkId, name, page }) => ({ n, docId, chunkId, name, page })));
    return { preamble, attachmentText, sources };
  });
  async function apiMessages(messages) {
    const out = [];
    for (const m of messages) {
      if (!m.images?.length) { out.push(m.images ? { role: m.role, content: m.content } : m); continue; }
      const { store } = await loadDocModules();
      const parts = [{ type: 'text', text: m.content || 'Please look at the attached image.' }];
      for (const id of m.images) { const rec = await store.get(id); if (rec?.dataUrl) parts.push({ type: 'image_url', image_url: { url: rec.dataUrl } }); }
      out.push({ role: m.role, content: parts });
    }
    return out;
  }

  // sources under an answer
  function renderSources(msg) {
    const wrap = el('div', 'message-sources'); wrap.setAttribute('role', 'group'); wrap.setAttribute('aria-label', 'Sources used');
    wrap.appendChild(el('span', 'muted', 'Sources: '));
    const cited = new Set([...String(msg.content).matchAll(/\[(\d{1,2})\]/g)].map(m => Number(m[1])));
    msg.sources.forEach((s, i) => {
      const label = (s.n ? '[' + s.n + '] ' : '') + s.name + (s.page ? ', p. ' + s.page : '');
      const b = el('button', cited.has(s.n) ? 'cited' : null, label); b.type = 'button'; b.dataset.action = 'open-source'; b.dataset.sourceIndex = String(i);
      b.title = cited.has(s.n) ? 'Cited in the answer. Show the passage.' : 'Show the passage'; wrap.appendChild(b);
    });
    return wrap;
  }
  messageActionHandlers['open-source'] = async (thread, msg, btn) => {
    const s = msg.sources?.[Number(btn.dataset.sourceIndex)]; if (!s) return;
    const { store } = await loadDocModules();
    const doc = await store.get(s.docId).catch(() => null);
    const body = el('div');
    if (!doc) body.appendChild(el('p', null, 'This document is no longer stored on this device, so the passage cannot be shown.'));
    else {
      const chunk = s.chunkId ? doc.chunks?.find(c => c.id === s.chunkId) : null;
      body.appendChild(el('p', 'muted', doc.name + (chunk?.page ? ', page ' + chunk.page : '') + (chunk ? '' : ' (start of the document; the whole text was supplied)')));
      const pre = el('pre'); pre.style.whiteSpace = 'pre-wrap'; pre.style.overflowWrap = 'anywhere';
      pre.textContent = chunk ? chunk.text : doc.text.slice(0, 4000) + (doc.text.length > 4000 ? '\n…' : '');
      body.appendChild(pre);
    }
    openAppDialog({ title: (s.n ? '[' + s.n + '] ' : '') + s.name, content: body, actions: [{ label: 'Close', primary: true }] });
  };

  function referencedDocIds() {
    return host.threads().flatMap(t => t.messages.flatMap(m => (m.attachments || []).map(a => a.id)));
  }
  async function pruneOrphanDocs() {
    try { const { store } = await loadDocModules(); await store.prune(referencedDocIds()); } catch { /* storage unavailable: nothing to prune */ }
  }

  // document library: files that are searched for every chat in scope
  async function openLibrary() {
    const { docs, store } = await loadDocModules();
    const root = el('div'); const list = el('div'); const note = el('p', 'muted'); note.setAttribute('role', 'status');
    root.append(el('p', 'muted', 'Files added here are read and kept on this device only. When you ask a question in a chat they apply to, the best-matching passages are supplied to the model and cited under its answer. The files themselves are never uploaded, but if you chose an outside provider, those passages are sent to it with your question.'));
    const add = el('button', 'secondary', 'Add documents…'); add.type = 'button';
    const pick = el('input'); pick.type = 'file'; pick.multiple = true; pick.hidden = true; pick.accept = attachInput.accept.split(',').filter(x => !x.startsWith('image/')).join(',');
    add.addEventListener('click', () => pick.click());
    pick.addEventListener('change', async () => {
      for (const f of [...pick.files]) { try { await ingestFile(f, { library: true, onStatus: t => { note.textContent = t; } }); note.textContent = 'Added ' + f.name + '.'; } catch (err) { note.textContent = err.message; } }
      pick.value = ''; await refresh();
    });
    root.append(add, pick, note, list);
    async function refresh() {
      list.textContent = '';
      const all = (await store.list()).filter(d => d.library).sort((a, b) => b.addedAt - a.addedAt);
      if (!all.length) list.appendChild(el('p', 'muted', 'No documents yet.'));
      let total = 0;
      all.forEach(d => {
        total += d.bytes || 0;
        const row = el('div', 'list-row'); const info = el('div');
        info.append(el('strong', null, d.name), el('div', 'muted', (d.kind === 'pdf' ? d.pages + ' pages' : humanSize(d.size)) + ' · ' + humanSize(d.bytes || 0) + ' stored'));
        const sel = el('select'); sel.setAttribute('aria-label', 'Where ' + d.name + ' is used');
        sel.appendChild(new Option('All chats', 'all')); host.folders().forEach(f => sel.appendChild(new Option('Project: ' + f.name, f.id))); sel.appendChild(new Option('Off', 'off'));
        sel.value = [...sel.options].some(o => o.value === d.scope) ? d.scope : 'all'; sel.style.maxWidth = '11rem';
        sel.addEventListener('change', async () => { const rec = await store.get(d.id); rec.scope = sel.value; await store.put(rec); });
        const del = el('button', 'secondary', 'Remove'); del.type = 'button'; del.setAttribute('aria-label', 'Remove ' + d.name);
        del.addEventListener('click', async () => { await store.remove(d.id); await refresh(); });
        row.append(info, sel, del); list.appendChild(row);
      });
      if (all.length) list.appendChild(el('p', 'muted', 'Total stored: ' + humanSize(total)));
    }
    await refresh();
    openAppDialog({ title: 'Documents', content: root, actions: [{ label: 'Done', primary: true }], wide: true });
  }

  return {
    loadDocModules, humanSize, contextWindowTokens, renderSources, referencedDocIds, pruneOrphanDocs, openLibrary, apiMessages,
    /** The files attached to the message being written. */
    attachments: { count: () => pendingAttachments.length, take: takePendingAttachments },
    /** Open the file picker (the + menu's "Add photos & files"). */
    attachFiles: () => attachInput.click(),
  };
}
