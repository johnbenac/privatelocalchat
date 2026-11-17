// Chat history in and out: download it as JSON, import this app's export or a ChatGPT / Claude export (with a preview before anything changes), delete all of it.
// createHistoryIo(host) returns { exportHistory, importHistory, clearChatHistory }.
//
// host: el, M() (pure chat modules), moduleBase(), threads(), setThreads(list), currentThreadId(), clearCurrentThread(), prefs, savePrefs, saveThreads, getThread, ensureThreadExists,
// selectThread, renderThreadList, updateChatAvailability, loadCrypto, askPassphrase, restoreExtras, openAppDialog, confirmDialog, showToast, THREAD_KEY, ACTIVE_THREAD_KEY,
// importInput, threadTitleInput, systemPromptInput, messageInput, messagesEl
import { app as appStorage, appLocal } from "../vault/vault-store.mjs";
import { refuseIfNewer, buildHistoryFile } from "../transfer/file-formats.mjs";
export function createHistoryIo(host) {
  const { el, prefs, savePrefs, saveThreads, getThread, ensureThreadExists, selectThread, renderThreadList, updateChatAvailability, loadCrypto,
    askPassphrase, restoreExtras, openAppDialog, confirmDialog, showToast, THREAD_KEY, ACTIVE_THREAD_KEY, importInput, threadTitleInput,
    systemPromptInput, messageInput, messagesEl } = host;
  function exportHistory() {
    prefs.lastExportAt = Date.now(); savePrefs();
    const dataStr = JSON.stringify(buildHistoryFile(host.threads().filter(t => !t.temporary), { app: window.APP_BUILD }), null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'chat-history.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // Stores that a newer version wrote are held read-only (stage 1): an import into one would say it worked and save nothing, so it says so first.
  const heldReadOnly = keys => keys.filter(k => appStorage.blocked.includes(k));
  // which of a backup's extras (projects, memory, presets, preferences) belong to a store held read-only; named by family, so the keys stay named only by their owners
  const heldExtras = () => {
    const held = new Set(appStorage.blocked.map(k => /^plc\.(folders|memory|presets|prefs)\./.exec(k)?.[1]).filter(Boolean));
    if ((globalThis.__plcFormatGuard?.databases || []).includes('plc-docs')) held.add('docs');   // the document database was written by a newer version
    return held;
  };

  async function readImportFile(file) {
    if (/\.zip$/i.test(file.name) || file.type === 'application/zip') {
      const zip = await import(host.moduleBase() + 'chat/transfer/zip.mjs');
      return zip.readConversationsJson(new Uint8Array(await file.arrayBuffer()));
    }
    return file.text();
  }

  /**
   * Import chat history. The file is read and checked first, nothing changes until the person confirms a preview.
   * Accepts this app's exports, and ChatGPT or Claude data exports (the .zip or its conversations.json).
   */
  async function importHistory(event) {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const text = await readImportFile(file);
      let data;
      try { data = JSON.parse(text); } catch { throw new Error('The file is not valid JSON.'); }
      refuseIfNewer(data);   // a file from a newer format is refused whole, before anything else is judged
      if (heldReadOnly([THREAD_KEY]).length) throw new Error('The chats in this browser were saved by a newer version of the app, so this version cannot add to them.');
      let extras = null;
      if ((await loadCrypto()).isEncryptedBackup(data)) { data = await askPassphrase(data); if (!data) return; refuseIfNewer(data); }
      if (data && data.format === 'plc-backup/1') extras = data;
      const foreignModule = await import(host.moduleBase() + 'chat/transfer/foreign-import.mjs');
      const foreign = foreignModule.convertForeign(data);
      let incoming, note = '';
      if (foreign) { incoming = foreign.threads; note = foreignModule.describeForeign(foreign); }
      else {
        const checked = host.M().model.validateHistory(data);
        if (!checked.ok) throw new Error(checked.error);
        incoming = checked.threads;
        if (checked.skipped) note = checked.skipped + ' unusable entr' + (checked.skipped === 1 ? 'y was' : 'ies were') + ' left out.';
      }
      showImportPreview(incoming, note, extras);
    } catch (err) {
      openAppDialog({ title: 'Import failed', content: el('p', null, err.message + ' Nothing was changed.'), actions: [{ label: 'OK', primary: true }] });
    } finally {
      importInput.value = '';
    }
  }

  function showImportPreview(incoming, note, extras = null) {
    const wrap = el('div');
    const extrasRow = el('label', 'list-row'); const extrasBox = el('input'); extrasBox.type = 'checkbox'; extrasBox.checked = true; extrasBox.id = 'importExtras';
    const hasExtras = Boolean(extras && (extras.memory?.items?.length || extras.presets?.length || extras.folders?.length || extras.docs?.length || extras.prefs?.instructions));
    if (note) wrap.appendChild(el('p', null, note));
    const mk = (id, text, checked) => {
      const row = el('label', 'list-row'); const r = el('input'); r.type = 'radio'; r.name = 'importMode'; r.id = id; r.checked = checked;
      row.append(r, el('span', null, text)); return [row, r];
    };
    const [mergeRow, mergeRadio] = mk('importMerge', 'Add to my current chats (recommended). Nothing already here is changed.', true);
    const [replaceRow, replaceRadio] = mk('importReplace', 'Replace all my current chats with the imported ones.', false);
    const backupRow = el('label', 'list-row'); const backup = el('input'); backup.type = 'checkbox'; backup.checked = true; backup.id = 'importBackup';
    backupRow.append(backup, el('span', null, 'Download a backup of my current chats first'));
    const summary = el('p', null); summary.id = 'importSummary'; summary.setAttribute('role', 'status');
    const update = () => {
      const preview = host.M().model.mergeThreads(host.threads().filter(t => !t.temporary), incoming, { replace: replaceRadio.checked });
      summary.textContent = host.M().model.describeImport(preview);
      backupRow.hidden = !replaceRadio.checked;
      summary.classList.toggle('danger', replaceRadio.checked);
    };
    mergeRadio.addEventListener('change', update); replaceRadio.addEventListener('change', update);
    extrasRow.append(extrasBox, el('span', null, 'Also restore memory, presets, projects, preferences' + (extras?.docs?.length ? ' and documents' : '') + ' from this backup'));
    wrap.append(mergeRow, replaceRow, backupRow, ...(hasExtras ? [extrasRow] : []), summary); update();
    openAppDialog({ title: 'Import ' + incoming.length + ' conversation' + (incoming.length === 1 ? '' : 's'), content: wrap, actions: [
      { label: 'Cancel' },
      { label: 'Import', primary: true, run: () => {
        const replace = replaceRadio.checked;
        if (replace && backup.checked) exportHistory();
        const result = host.M().model.mergeThreads(host.threads().filter(t => !t.temporary), incoming, { replace });
        host.setThreads(result.threads);
        saveThreads();
        const skip = heldExtras(), held = hasExtras && extrasBox.checked ? [...skip].filter(k => extras[k] !== undefined) : [];
        if (hasExtras && extrasBox.checked) restoreExtras(extras, { skip }).then(n => { if (n) showToast('Restored ' + n + ' more item' + (n === 1 ? '' : 's') + ' from the backup.'); });
        if (held.length) showToast('Not restored: ' + held.join(', ') + '. A newer version of the app saved those here, so this version leaves them as they are.', 8000);
        const ensuredId = ensureThreadExists();
        const target = (replace ? host.M().model.listThreads(host.threads())[0] : getThread(host.currentThreadId())) || host.M().model.listThreads(host.threads())[0];
        renderThreadList();
        if (target) selectThread(target.id); else if (ensuredId) selectThread(ensuredId);
        const said = [];
        if (result.added) said.push('imported ' + result.added + ' conversation' + (result.added === 1 ? '' : 's') + (result.copies ? ' (' + result.copies + ' as copies)' : ''));
        if (result.duplicates) said.push(result.duplicates + ' already here and skipped');
        if (result.removed) said.push(result.removed + ' replaced');
        showToast(said.length ? said.join(', ').replace(/^./, c => c.toUpperCase()) + '.' : 'Nothing new to import.', 6000);
      } }
    ] });
  }

  async function clearChatHistory() {
    if (!Array.isArray(host.threads()) || host.threads().length === 0) {
      showToast('No chat history to clear.');
      return;
    }
    const confirmed = await confirmDialog('Delete all chat history?', 'This action cannot be undone.', 'Delete everything', { danger: true });
    if (!confirmed) {
      return;
    }
    host.setThreads([]);
    host.clearCurrentThread();
    try {
      appLocal.removeItem(THREAD_KEY);
      appLocal.removeItem(ACTIVE_THREAD_KEY);
    } catch (err) {
      console.warn('Unable to remove chat history from storage:', err);
      saveThreads();
    }
    threadTitleInput.value = '';
    systemPromptInput.value = '';
    if (messageInput) {
      messageInput.value = '';
    }
    if (messagesEl) {
      messagesEl.innerHTML = '';
    }
    renderThreadList();
    updateChatAvailability();
    showToast('Chat history cleared.');
  }
  return { exportHistory, importHistory, clearChatHistory };
}
