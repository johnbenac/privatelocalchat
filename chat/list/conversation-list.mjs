// The conversation list: the list itself (Projects, dated groups, Archive, Trash), a conversation's menu, projects (folders) and their instructions,
// new / trash / restore / duplicate / branch. It owns the projects (folders) and which view (active / archived / trash) is shown.
// createConversationList(host) returns { folders, view, setView, render, threadTitle, newThread, createFolder, moveToFolder, toggleThreadMenu, duplicateThread, saveFolders }.
//
// host: el, M() (pure chat modules), events, readJson, writeJson, threads(), currentThreadId(), clearCurrentThread(), getThread, createThread, selectThread, renameThread,
// exportThreadMarkdown, buildPreloadUrl, saveThreads, generateThreadId, generation() (the running answer, or null), threadList (the <ul>), messageInput, createEmoji, actionButton,
// messageDecorators, messageActionHandlers, closeThreadMenu, placeMenu, openThreadMenu() (the open menu or null), updateThreadListMinHeight, promptDialog, confirmDialog, copyTextDialog, openAppDialog, showToast
import { appLocal } from "../vault/vault-store.mjs";
export function createConversationList(host) {
  const { el, events, readJson, writeJson, getThread, createThread, selectThread, renameThread, exportThreadMarkdown, buildPreloadUrl, saveThreads, persistThreads: persist,
    generateThreadId, threadList, messageInput, createEmoji, actionButton, messageDecorators, messageActionHandlers, closeThreadMenu, placeMenu,
    updateThreadListMinHeight, promptDialog, confirmDialog, copyTextDialog, openAppDialog, showToast } = host;
  const FOLDERS_KEY = 'plc.folders.v1';
  let folders = readJson(appLocal, FOLDERS_KEY, []);
  if (!Array.isArray(folders)) folders = [];
  folders = folders.filter(f => f && typeof f.id === 'string' && typeof f.name === 'string');
  const saveFolders = () => writeJson(appLocal, FOLDERS_KEY, folders);
  let threadView = 'active'; // active | archived | trash
  const setView = v => { threadView = v; };

  function threadTitle(thread) { return thread.title && thread.title.trim() ? thread.title.trim() : 'Untitled'; }

  function renderThreadList() {
    closeThreadMenu();
    threadList.textContent = '';
    document.querySelectorAll('.thread-filter button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === threadView)));
    const visible = host.M().model.listThreads(host.threads(), { archived: threadView === 'archived', trashed: threadView === 'trash' });
    if (threadView === 'active') {
      const inProject = t => t.folderId && folders.some(f => f.id === t.folderId);
      const projectsHead = el('li', 'list-heading heading-with-action'); projectsHead.setAttribute('role', 'presentation');
      projectsHead.appendChild(el('span', null, 'Projects'));
      const addProject = el('button', 'list-add'); addProject.type = 'button'; addProject.title = 'New project'; addProject.setAttribute('aria-label', 'New project');
      addProject.appendChild(createEmoji('➕')); addProject.addEventListener('click', event => { event.stopPropagation(); createFolder(); });
      projectsHead.appendChild(addProject); threadList.appendChild(projectsHead);
      folders.forEach(f => {
        const h = el('li', 'folder-heading'); h.setAttribute('role', 'presentation');
        h.appendChild(el('span', 'thread-name', f.name));
        const mb = el('button', 'thread-menu-btn'); mb.type = 'button'; mb.setAttribute('aria-label', 'Options for project ' + f.name); mb.appendChild(createEmoji('⋮'));
        mb.addEventListener('click', event => { event.stopPropagation(); toggleFolderMenu(f.id, mb); });
        h.appendChild(mb); threadList.appendChild(h);
        visible.filter(t => t.folderId === f.id).forEach(t => { const li = threadItem(t); li.classList.add('in-project'); threadList.appendChild(li); });
      });
      const loose = visible.filter(t => !inProject(t));
      host.M().shellRegistry.groupThreadsByDate(loose).forEach(group => {
        const head = el('li', 'list-heading', group.label); head.setAttribute('role', 'presentation'); threadList.appendChild(head);
        group.items.forEach(t => threadList.appendChild(threadItem(t)));
      });
    } else {
      if (!visible.length) threadList.appendChild(el('li', 'folder-heading', threadView === 'trash' ? 'Trash is empty. Deleted chats stay here for ' + host.M().model.TRASH_DAYS + ' days.' : 'Nothing archived.'));
      visible.forEach(t => threadList.appendChild(threadItem(t)));
    }
    updateThreadListMinHeight();
  }

  function threadItem(thread) {
    const name = threadTitle(thread);
    const li = el('li'); li.dataset.id = thread.id;
    if (thread.id === host.currentThreadId()) li.classList.add('selected');
    const pick = el('button', 'thread-name'); pick.type = 'button';
    if (thread.pinned) pick.appendChild(el('span', 'pin-mark', '📌'));
    if (thread.temporary) pick.appendChild(el('span', 'pin-mark', '🕶️'));
    pick.append(name);
    pick.title = name;
    if (thread.id === host.currentThreadId()) pick.setAttribute('aria-current', 'true');
    pick.addEventListener('click', event => { event.stopPropagation(); selectThread(thread.id); });
    li.appendChild(pick);
    const menuBtn = el('button', 'thread-menu-btn'); menuBtn.type = 'button';
    menuBtn.setAttribute('aria-label', 'Options for ' + name); menuBtn.setAttribute('aria-haspopup', 'menu');
    menuBtn.appendChild(createEmoji('⋮'));
    menuBtn.addEventListener('click', event => { event.stopPropagation(); toggleThreadMenu(thread.id, menuBtn); });
    li.appendChild(menuBtn);
    li.addEventListener('click', () => selectThread(thread.id));
    return li;
  }

  function menuItem(menu, emoji, label, run, cls) {
    const b = el('button'); b.type = 'button'; b.setAttribute('role', 'menuitem');
    b.appendChild(createEmoji(emoji)); b.appendChild(el('span', 'btn-label', label));
    if (cls) b.classList.add(cls);
    b.addEventListener('click', () => { closeThreadMenu(); run(); });
    menu.appendChild(b); return b;
  }
  function toggleFolderMenu(folderId, anchor) {
    if (host.openThreadMenu() && host.openThreadMenu().anchor === anchor) { closeThreadMenu(); return; }
    closeThreadMenu();
    const menu = el('div', 'thread-menu'); menu.setAttribute('role', 'menu');
    menuItem(menu, '✏️', 'Rename project', async () => { const f = folders.find(x => x.id === folderId); const n = await promptDialog('Rename project', 'Name', f.name); if (n && n.trim()) { f.name = n.trim(); saveFolders(); renderThreadList(); } });
    menuItem(menu, '📝', 'Project instructions', async () => { const f = folders.find(x => x.id === folderId); const n = await promptDialog('Project instructions', 'Added to the instructions of every chat in this project', f.instructions || '', { multiline: true }); if (n !== null) { f.instructions = n.trim(); saveFolders(); showToast('Project instructions saved'); } });
    menuItem(menu, '🗑️', 'Delete project (keeps its chats)', async () => {
      if (!await confirmDialog('Delete project?', 'The chats inside stay in your list; only the grouping and its instructions are removed.', 'Delete project', { danger: true })) return;
      folders = folders.filter(x => x.id !== folderId); host.threads().forEach(t => { if (t.folderId === folderId) delete t.folderId; });
      saveFolders(); const o = await saveThreads(); if (!o) { folders.push({ id: folderId, name: '', instructions: '' }); host.threads().forEach(t => { if (t.folderId === folderId) t.folderId = folderId; }); } renderThreadList();
    }, 'delete');
    placeMenu(menu, anchor);
  }
  async function createFolder() {
    const name = await promptDialog('New project', 'Project name', '', { confirmLabel: 'Create' });
    if (!name || !name.trim()) return;
    folders.push({ id: generateThreadId(), name: name.trim(), instructions: '' }); saveFolders(); renderThreadList();
  }
  async function moveToFolder(threadId) {
    const thread = getThread(threadId); if (!thread) return;
    if (!folders.length) { showToast('Create a project first (New project).'); return; }
    const sel = el('select'); sel.id = 'folderPick'; sel.appendChild(new Option('No project', ''));
    folders.forEach(f => sel.appendChild(new Option(f.name, f.id))); sel.value = thread.folderId || '';
    const label = el('label', null, 'Project'); label.htmlFor = 'folderPick';
    const wrap = el('div'); wrap.append(label, sel);
    openAppDialog({ title: 'Move chat to a project', content: wrap, actions: [{ label: 'Cancel' }, { label: 'Move', primary: true, run: async () => { if (sel.value) thread.folderId = sel.value; else delete thread.folderId; const o = await persist(threadId, 'The move was not saved'); if (!o.saved) { const back = keepFields(thread, ['folderId']); back(); } renderThreadList(); } }] });
  }

  events.on('context:collect', async thread => ({ preamble: [selectedFolderInstructions(thread)] }));
  messageDecorators.push((thread, msg, index, ctx, actions) => {
    if (!ctx.streaming && index < thread.messages.length) actions.appendChild(actionButton('branch-here', '🌿 Start a branch here', 'Start a branch here'));
  });
  messageActionHandlers['branch-here'] = (thread, msg) => duplicateThread(thread.id, thread.messages.indexOf(msg));

  function selectedFolderInstructions(thread) {
    const f = folders.find(x => x.id === thread.folderId);
    return f?.instructions?.trim() ? 'Instructions for the "' + f.name + '" project:\n' + f.instructions.trim() : '';
  }

  // createThread() returns the new id at once (it is synchronous); its save is queued and its outcome is told by the save itself.
  function newThread({ temporary = false } = {}) {
    const id = createThread({ temporary });
    if (threadView !== 'active') threadView = 'active';
    renderThreadList();
    selectThread(id);
    messageInput.focus();
  }

  // A change to a chat's own fields that was refused is taken back in this tab's memory (storage is never written back): `keep` remembers the fields as they were.
  const keepFields = (thread, names) => { const was = names.map(n => [n, n in thread, thread[n]]); return () => { for (const [n, had, v] of was) { if (had) thread[n] = v; else delete thread[n]; } }; };

  async function trashThread(threadId) {
    const thread = getThread(threadId); if (!thread) return;
    if (host.generation() && host.generation().threadId === threadId) host.generation().controller.abort();
    const at = host.threads().indexOf(thread), putBack = keepFields(thread, ['deletedAt', 'pinned']);
    if (thread.temporary) { host.threads().splice(at, 1); }
    else { thread.deletedAt = Date.now(); delete thread.pinned; }
    const outcome = await persist(threadId, 'The chat was not moved to Trash');
    if (!outcome.saved) {
      if (thread.temporary) host.threads().splice(Math.min(at, host.threads().length), 0, thread); else putBack();
      renderThreadList();
      return;                                    // still here, still selected: nothing else moves
    }
    if (threadId === host.currentThreadId()) {
      const next = host.M().model.listThreads(host.threads())[0];
      host.clearCurrentThread();
      if (next) selectThread(next.id); else { const id = createThread(); renderThreadList(); selectThread(id); }
    } else renderThreadList();
    renderThreadList();
    if (!thread.temporary) showToast('Moved to Trash', 8000, { label: 'Undo', run: async () => { const back = keepFields(thread, ['deletedAt']); delete thread.deletedAt; const o = await persist(threadId, 'The chat was not restored'); if (!o.saved) back(); renderThreadList(); } });
  }
  async function deleteForever(threadId) {
    const thread = getThread(threadId); if (!thread) return;
    if (!await confirmDialog('Delete permanently?', 'This chat will be erased and cannot be recovered.', 'Delete permanently', { danger: true })) return;
    const at = host.threads().indexOf(thread);
    host.threads().splice(at, 1);
    const outcome = await persist(threadId, 'The chat was not deleted');
    if (!outcome.saved && !host.threads().includes(thread)) host.threads().splice(Math.min(at, host.threads().length), 0, thread);
    renderThreadList();
  }

  async function duplicateThread(threadId, upToIndex) {
    const thread = getThread(threadId); if (!thread) return;
    const copy = host.M().model.branchThread(thread, upToIndex ?? thread.messages.length - 1);
    // the copy's messages are new ids copied from this chat: they keep the attribution of what they were copied from (chat/encounters/)
    host.encounters?.markBranch(copy.id, thread.id, Object.fromEntries(copy.messages.map((m, i) => [m.id, thread.messages[i]?.id]).filter(([, src]) => src)));
    host.threads().push(copy);
    const outcome = await persist(copy.id, upToIndex == null ? 'The copy was not saved' : 'The branch was not saved');
    if (!outcome.saved) {                       // the copy was never stored: it leaves this tab too, and so do its attribution hints; the original is untouched
      const at = host.threads().indexOf(copy); if (at >= 0) host.threads().splice(at, 1);
      host.encounters?.unmarkBranch(copy.id);
      renderThreadList();
      return;
    }
    renderThreadList(); selectThread(copy.id);
    showToast(upToIndex == null ? 'Chat duplicated' : 'Branched into a new chat');
  }

  function toggleThreadMenu(threadId, anchor) {
    const thread = getThread(threadId); if (!thread) return;
    if (host.openThreadMenu() && host.openThreadMenu().anchor === anchor) { closeThreadMenu(); return; }
    closeThreadMenu();
    const menu = el('div', 'thread-menu'); menu.setAttribute('role', 'menu');
    if (thread.deletedAt != null) {
      menuItem(menu, '♻️', 'Restore', async () => { const back = keepFields(thread, ['deletedAt']); delete thread.deletedAt; const o = await persist(threadId, 'The chat was not restored'); if (!o.saved) back(); renderThreadList(); });
      menuItem(menu, '🗑️', 'Delete permanently', () => deleteForever(threadId), 'delete');
      placeMenu(menu, anchor); return;
    }
    menuItem(menu, '✏️', 'Rename', () => renameThread(threadId));
    menuItem(menu, thread.pinned ? '📍' : '📌', thread.pinned ? 'Unpin' : 'Pin to top', async () => { const back = keepFields(thread, ['pinned']); if (thread.pinned) delete thread.pinned; else thread.pinned = true; const o = await persist(threadId, 'The pin was not saved'); if (!o.saved) back(); renderThreadList(); });
    menuItem(menu, '🗄️', thread.archived ? 'Unarchive' : 'Archive', async () => { const back = keepFields(thread, ['archived']); if (thread.archived) delete thread.archived; else thread.archived = true; const o = await persist(threadId, 'The archive change was not saved'); if (!o.saved) { back(); renderThreadList(); return; } renderThreadList(); showToast(thread.archived ? 'Archived' : 'Moved back to your chats'); });
    menuItem(menu, '📁', 'Move to project…', async () => { await moveToFolder(threadId); });
    menuItem(menu, '🧬', 'Duplicate', () => duplicateThread(threadId));
    menuItem(menu, '📤', 'Export (.md)', () => exportThreadMarkdown(threadId));
    menuItem(menu, '🔗', 'Copy link with current title/system/prompt', async () => { const url = buildPreloadUrl(); try { await navigator.clipboard.writeText(url); showToast('Link copied to clipboard'); } catch (err) { copyTextDialog('Copy this link', url); } });
    menuItem(menu, '🗑️', 'Delete', () => trashThread(threadId), 'delete');
    placeMenu(menu, anchor);
  }
  return { selectedFolderInstructions, folders: () => folders, view: () => threadView, setView, render: renderThreadList, threadTitle, newThread, createFolder, moveToFolder, toggleThreadMenu, duplicateThread, saveFolders };
}
