// The Storage and backups screen (what is kept, how much, how to free or protect it) and the "Back up your chats" reminder in the chat list.
// createStorageUi(host) returns { openStorage, updateBackupNudge }.
//
// host: el, M() (the pure chat modules), moduleBase(), threads(), THREAD_KEY, prefs, savePrefs, localModels (window), confirmDialog, showToast, humanSize, loadDocModules(),
// loadVoiceChoice(), loadTransferUi(), openAppDialog, openLibrary(), referencedDocIds(), pruneOrphanDocs()
import { appLocal } from "../vault/vault-store.mjs";
export function createStorageUi(host) {
  const { el, THREAD_KEY, prefs, savePrefs, confirmDialog, showToast, humanSize, loadVoiceChoice, loadTransferUi, openAppDialog,
    referencedDocIds, pruneOrphanDocs } = host;
  async function openStorage() {
    const root = el('div');
    const lm = window.localModels, { store } = await host.loadDocModules();
    try { await lm?.refreshStorage?.(); await lm?.inspectAll?.(); } catch { /* estimate unavailable */ }
    const stateNow = lm?.state;
    const table = el('table'); const body = el('tbody'); table.appendChild(body);
    const row = (label, value, note, action) => {
      const tr = el('tr'); tr.appendChild(el('th', null, label)); tr.firstChild.scope = 'row';
      const td = el('td'); td.appendChild(el('div', null, value)); if (note) td.appendChild(el('div', 'muted', note)); tr.appendChild(td);
      const ac = el('td'); if (action) ac.appendChild(action); tr.appendChild(ac); body.appendChild(tr);
    };
    const btn = (label, fn, cls = 'secondary') => { const b = el('button', cls, label); b.type = 'button'; b.addEventListener('click', fn); return b; };
    if (stateNow) {
      const mv = await import(host.moduleBase() + 'chat/models/models-view.mjs');
      mv.languageRows(stateNow, { mode: lm.mode }).forEach(vm => {
        const tier = vm.id, item = stateNow.tiers[tier], present = vm.bytesOnDevice || 0;
        row('Chat model: ' + (item.info.modelId || tier), mv.stateLine(vm), vm.state === 'loaded' ? 'In memory now' : '',
          present > 0 ? btn('Remove files', async () => { if (!await confirmDialog('Remove ' + (item.info.label || item.info.modelId) + '?', 'This deletes the downloaded model files (' + humanSize(present) + ') from this device. Your conversations are kept, and you can download it again later.', 'Remove files', { danger: true })) return; try { await lm.removeTier(tier); showToast('Removed. ' + humanSize(present) + ' freed.'); } catch (e) { showToast(e.message); } openStorageRefresh(); }) : null);
      });
      row('Memory', stateNow.load.state === 'ready' ? 'Model is loaded' : 'Model is not loaded', 'Freeing memory keeps the download and your chats.',
        stateNow.load.state === 'ready' ? btn('Free memory', async () => { try { await lm.freeMemory(); showToast('Memory freed. The download is kept.'); } catch (e) { showToast(e.message); } openStorageRefresh(); }) : null);
    }
    // the downloaded voices, in the same words as the pickers
    try {
      const vctl = await loadVoiceChoice(), mv2 = await import(host.moduleBase() + 'chat/models/models-view.mjs');
      if (vctl) mv2.voiceRows(vctl.snapshot()).filter(vm => vm.kind === 'voice').forEach(vm => row('Voice: ' + vm.label, mv2.stateLine(vm), vm.state === 'loaded' ? 'In memory now' : '',
        vm.bytesOnDevice > 0 ? btn('Remove files', async () => { if (!await confirmDialog('Remove ' + vm.label + '?', 'This deletes the downloaded voice (' + humanSize(vm.bytesOnDevice) + ') from this device. Reading aloud goes back to the system voice if it was in use. You can download it again later.', 'Remove files', { danger: true })) return; await vctl.remove(vm.id); openStorageRefresh(); }) : null));
    } catch { /* voices are optional */ }
    const chatJson = (() => { try { return appLocal.getItem(THREAD_KEY) || ''; } catch { return ''; } })();
    const real = host.threads().filter(t => !t.temporary && t.deletedAt == null);
    row('Conversations', humanSize(chatJson.length * 2) + ' · ' + real.length + ' chat' + (real.length === 1 ? '' : 's'), host.threads().some(t => t.deletedAt != null) ? 'Includes chats in Trash.' : '');
    let docsList = []; try { docsList = await store.list(); } catch { /* none */ }
    const attBytes = docsList.filter(d => !d.library).reduce((n, d) => n + (d.bytes || 0), 0), libBytes = docsList.filter(d => d.library).reduce((n, d) => n + (d.bytes || 0), 0);
    const refs = new Set(referencedDocIds());
    const unused = docsList.filter(d => !d.library && !refs.has(d.id));
    row('Attachments', humanSize(attBytes), unused.length ? unused.length + ' file(s) are no longer used by any chat.' : '', unused.length ? btn('Delete unused', async () => { await pruneOrphanDocs(); openStorageRefresh(); }) : null);
    row('Document library', humanSize(libBytes) + ' · ' + docsList.filter(d => d.library).length + ' file(s)', '', btn('Manage', () => { handleDialog.close(); host.openLibrary(); }));
    let est = null; try { est = await navigator.storage?.estimate?.(); } catch { /* not available */ }
    let persisted = null; try { persisted = await navigator.storage?.persisted?.(); } catch { /* not available */ }
    row('Browser storage', est ? humanSize(est.usage || 0) + ' used of about ' + humanSize(est.quota || 0) : 'Not reported by this browser',
      persisted ? 'Protected: the browser will not clear it automatically.' : 'Not protected: the browser may clear it when the device is low on space.',
      persisted ? null : btn('Keep my data', async () => { const ok = await (lm?.requestPersist?.() ?? navigator.storage?.persist?.()); showToast(ok ? 'This browser will keep your data.' : 'The browser declined. Back up important chats.'); openStorageRefresh(); }));
    const last = prefs.lastExportAt;
    row('Last backup', last ? new Date(last).toLocaleString() : 'Never', last ? '' : 'Browsers can clear site data. A backup is the only copy that survives that.',
      btn('Back up chats', () => { handleDialog.close(); loadTransferUi().then(ui => ui.openTransferChats()); }, 'primary'));
    row('Protected backup', 'Encrypted with a passphrase', 'Chats, memory, projects, presets and (optionally) documents.', btn('Protected backup…', () => { handleDialog.close(); loadTransferUi().then(ui => ui.openTransferChats()); }));
    row('App lock', host.lock().enabled ? 'On' : 'Off', 'Hides your chats behind a passphrase on this device.', btn(host.lock().enabled ? 'Lock settings…' : 'Set a lock…', () => { handleDialog.close(); host.lock().openLockSettings(); }));
    root.appendChild(table);
    const handleDialog = openAppDialog({ title: 'Storage and backups', content: root, wide: true, actions: [{ label: 'Done', primary: true }] });
    function openStorageRefresh() { handleDialog.close(); openStorage(); }
  }

  const backupNudge = el('div', 'backup-nudge'); backupNudge.id = 'backupNudge'; backupNudge.hidden = true; backupNudge.setAttribute('role', 'region'); backupNudge.setAttribute('aria-label', 'Back up your chats');
  document.querySelector('.chats-section').after(backupNudge);
  function updateBackupNudge() {
    const hasChats = host.threads().some(t => !t.temporary && t.deletedAt == null && t.messages.some(m => m.role === 'user'));
    const stale = !prefs.lastExportAt || Date.now() - prefs.lastExportAt > 14 * 864e5;
    backupNudge.hidden = !(hasChats && stale && !(prefs.nudgeUntil > Date.now()));
    if (backupNudge.hidden) return;
    backupNudge.textContent = '';
    const icon = el('span', 'backup-nudge-icon'); icon.setAttribute('aria-hidden', 'true'); host.M().icons.setIconLabel(icon, '💾');
    const text = el('div', 'backup-nudge-text');
    text.append(el('strong', null, 'Back up your chats'), el('p', null, prefs.lastExportAt ? 'Your last backup was ' + Math.round((Date.now() - prefs.lastExportAt) / 864e5) + ' days ago.' : 'These chats exist only in this browser, which can clear them.'));
    const go = el('button', 'primary', 'Back up now'); go.type = 'button'; go.addEventListener('click', openStorage);
    const later = el('button', 'secondary', 'Remind me later'); later.type = 'button'; later.addEventListener('click', () => { prefs.nudgeUntil = Date.now() + 7 * 864e5; savePrefs(); updateBackupNudge(); });
    const row = el('div', 'backup-nudge-actions'); row.append(go, later);
    backupNudge.append(icon, text, row);
  }
  return { openStorage, updateBackupNudge };
}
