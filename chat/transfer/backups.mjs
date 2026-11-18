// Backups: what goes into a full backup (conversations, projects, memory, presets, preferences, optionally documents), asking for the passphrase of an encrypted one, and
// putting the extras back from a backup. The encryption is chat/crypto.mjs (loaded when first needed); passField is the passphrase input the lock and the backup dialogs share.
// createBackups(host) returns { loadCrypto, passField, buildBackup, askPassphrase, restoreExtras }.
//
// host: el, moduleBase(), threads(), folders(), saveFolders(), assistant (its restorePresets puts presets back), addMemory, prefs, prefsStore (chat/assistant/prefs-store.mjs: the one writer of the preferences; its restore() puts a backup's preferences back), generateThreadId, loadDocModules(), promptDialog, showToast
export function createBackups(host) {
  const { el, assistant, addMemory, prefs, generateThreadId, promptDialog, showToast, saveFolders } = host;
  let cryptoMod = null;
  const loadCrypto = async () => (cryptoMod ||= await import(host.moduleBase() + 'chat/crypto.mjs'));
  const passField = (label, id) => { const w = el('div'); const l = el('label', null, label); l.htmlFor = id; const i = el('input'); i.type = 'password'; i.id = id; i.autocomplete = 'new-password'; w.append(l, i); return [w, i]; };

  async function buildBackup(includeDocs) {
    const backup = {
      format: 'plc-backup/1', exportedAt: Date.now(), app: { version: window.APP_BUILD?.version, commit: window.APP_BUILD?.commit },
      threads: host.threads().filter(t => !t.temporary), folders: host.folders(), memory: assistant.memory, presets: assistant.customPresets,
      prefs: { instructions: prefs.instructions || '', enterSends: prefs.enterSends, voiceURI: prefs.voiceURI, speechRate: prefs.speechRate }
    };
    const looks = assistant.looksForBackup(); // kept character looks of the person's own presets; left out when there are none, so a backup without any is as it was
    if (Object.keys(looks).length) backup.looks = looks;
    if (includeDocs) {
      const { store } = await host.loadDocModules();
      backup.docs = (await store.all()).filter(d => !d.temporary).map(({ chunks, ...rest }) => rest);
    }
    return backup;
  }
  async function askPassphrase(envelope) {
    const c = await loadCrypto();
    for (;;) {
      const pass = await promptDialog('Encrypted backup', 'Passphrase', '', { confirmLabel: 'Unlock backup' });
      if (pass === null) return null;
      try { return JSON.parse(await c.decryptString(envelope, pass)); }
      catch (err) { if (err.code !== 'bad-passphrase') throw err; showToast(err.message, 5000); }
    }
  }
  // settings, memory, presets, projects and documents that travel with a full backup
  // `skip` names the parts a newer version of the app owns in this browser (folders, memory, presets, prefs, docs): they are left as they are.
  async function restoreExtras(extras, { skip = new Set() } = {}) {
    let added = 0;
    if (!skip.has('folders')) (extras.folders || []).forEach(f => { if (f && f.id && f.name && !host.folders().some(x => x.id === f.id)) { host.folders().push({ id: f.id, name: f.name, instructions: f.instructions || '' }); added++; } });
    if (!skip.has('folders')) saveFolders();
    if (!skip.has('memory')) (extras.memory?.items || []).forEach(i => { if (i?.text && addMemory(i.text)) added++; });
    // presets are put back by the assistant under the same lock every other preset change takes (a name already among yours is skipped, each added one gets a new id)
    if (!skip.has('presets')) {
      const restored = await assistant.restorePresets(extras.presets);
      added += restored.added;
      // a kept look follows its preset to the id the restore gave it (a preset the person already had is never given a look)
      if (extras.looks && restored.idMap?.size) added += await assistant.restoreLooks(extras.looks, restored.idMap);
    }
    // preferences (instructions, Enter sends, voice, reading speed): what is not set here is taken from the backup, what the person chose here is kept (chat/transfer/prefs-restore.mjs).
    // Written by the preferences store under its lock; when that cannot be done nothing is written and this says so. The page redraws what shows a changed preference when the store levels it.
    if (!skip.has('prefs')) {
      const r = await host.prefsStore.restore(extras.prefs);
      if (r.ok) added += r.added.length;
      else showToast('The backup’s settings were not restored: ' + (r.message || 'your saved settings could not be updated.') + ' Nothing was changed.', 7000);
    }
    if (extras.docs?.length && !skip.has('docs')) {
      const { docs, store } = await host.loadDocModules();
      for (const d of extras.docs) {
        try {
          if (!d?.id || await store.get(d.id)) continue;
          let rec = d;
          if (d.kind !== 'image') {
            let pages;
            if (d.kind === 'pdf') { // the saved text carries "[Page N]" markers: restore the pages so citations keep their page numbers
              const parts = String(d.text).split(/\[Page (\d+)\]\n/); pages = [];
              for (let i = 1; i < parts.length; i += 2) pages.push({ page: Number(parts[i]), text: (parts[i + 1] || '').trim() });
            }
            rec = { ...docs.buildDocument({ id: d.id, name: d.name, size: d.size, kind: d.kind, text: d.text, pages: pages?.length ? pages : undefined, now: d.addedAt }), library: d.library, scope: d.scope };
          }
          await store.put(rec); added++;
        } catch { /* skip an unreadable record */ }
      }
    }
    return added;
  }
  return { loadCrypto, passField, buildBackup, askPassphrase, restoreExtras };
}
