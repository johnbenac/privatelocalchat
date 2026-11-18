// The assistant's standing context and its small tools: preferences (instructions, how Enter sends, the reply voice and speed, call sounds), memory (things you asked it to
// remember), presets (built in and your own), and the exact-answer tools (arithmetic, unit conversion, calendar questions, slash commands answered without the model).
// What it adds to what the model is told arrives through the event list: context:collect for preferences and memory, send:intercept and prompt:ready for the tools.
// createAssistant(host) returns { memory, customPresets, addMemory, restorePresets, openPreferences, openPresetFromAddress }: the page reads memory and the presets for backups and the context meter,
// restores a backup's presets (restorePresets, under the preset lock) and asks for a preset link in the address to be shown for review. Importing a preset file or link: preset-candidate.mjs (reading), preset-import.mjs (review box), preset-store.mjs (locked writes).
//
// host: el, events, messageDecorators, messageActionHandlers, actionButton (buttons under a message), model() (the thread model functions), prefs (the object), savePrefs, readJson, writeJson, messageInput, systemPromptInput, threadTitleInput, openAppDialog,
//       promptDialog, showToast, saveThreads, currentThread(), generateThreadId, growComposer, persistDraftNow, renderMessages, renderThreadList, updateComposerHint,
//       enterSends(), callSoundsOn(), loadSpeech(), speechAvailable() (what the browser can do), voiceButton() (null when there is no call button), moduleBase()
import { app, appLocal } from "../vault/vault-store.mjs";
import { createPresetStore, editPresetChange } from "./preset-store.mjs";
import { createPresetImport } from "./preset-import.mjs";
import { createPresentationPreview } from "../presentation/preview.mjs";
import { loadValidator } from "../presentation/reader.mjs";
import { createPresentationKeeper, MAX_KEPT } from "../presentation/keeper.mjs";
import { createLookUi } from "../presentation/look-ui.mjs";
import { looksForBackup, idMapForRestore, looksToRestore } from "../presentation/backup-looks.mjs";
import { mergeBackupPresets } from "./preset-candidate.mjs";

export function createAssistant(host) {
  const { el, events, prefs, savePrefs, readJson, writeJson, messageInput, systemPromptInput, threadTitleInput, openAppDialog, promptDialog, showToast, saveThreads, growComposer,
    persistDraftNow, renderMessages, renderThreadList, updateComposerHint, generateThreadId, currentThread, messageDecorators, messageActionHandlers, actionButton } = host;
  const MEMORY_KEY = 'plc.memory.v1', PRESETS_KEY = 'plc.presets.v1';
  let memory = readJson(appLocal, MEMORY_KEY, { enabled: true, items: [] });
  if (!memory || !Array.isArray(memory.items)) memory = { enabled: true, items: [] };
  const saveMemory = () => writeJson(appLocal, MEMORY_KEY, memory);
  let customPresets = readJson(appLocal, PRESETS_KEY, []);
  if (!Array.isArray(customPresets)) customPresets = [];
  // Every change to the saved presets (save, edit, delete, import, backup restore) goes through `presetStore` (chat/assistant/preset-store.mjs): a lock shared by every tab, a fresh read
  // of what is stored, one change, a write checked by reading it back. There is no whole-list writer any more: `customPresets` is only this tab's copy of what was last read or written.
  const presetStore = createPresetStore({ storage: appLocal, key: PRESETS_KEY, isReadOnly: () => app.readOnly });
  const adoptPresets = list => { customPresets = list; };
  let look = null; // the kept-look view (chat/presentation/look-ui.mjs), created below once the keeper exists
  // text of an edit that was refused (a newer version of the preset was stored first, or the save failed), kept in memory so the next Edit of that preset starts from it
  const rejectedEdits = new Map();
  const presetFailure = outcome => showToast(outcome.message || 'The preset could not be saved.');
  const BUILTIN_PRESETS = [
    { id: 'builtin-writing', name: 'Writing helper', prompt: 'You are a careful writing assistant. Improve clarity and flow while keeping the author’s own voice and meaning. Give the revised text first, then briefly list what you changed.' },
    { id: 'builtin-tutor', name: 'Study tutor', prompt: 'You are a patient tutor. Explain step by step in plain language, use small examples, and end with one short question that checks understanding. For exercises, guide the student instead of simply giving the answer.' },
    { id: 'builtin-brainstorm', name: 'Brainstorm partner', prompt: 'You are a creative brainstorming partner. Offer a varied list of distinct ideas, including a couple of unusual ones, and say in a few words why each could work. Ask one question that would help narrow them down.' },
    { id: 'builtin-summary', name: 'Faithful summarizer', prompt: 'Summarize the text you are given faithfully as short bullet points, then add a one-sentence takeaway. Do not add information that is not in the text, and say so when something is unclear.' },
    { id: 'builtin-concise', name: 'Brief answers', prompt: 'Answer as briefly as possible while staying correct. Prefer one to three sentences. Offer more detail only if asked.' },
    { id: 'builtin-code', name: 'Code helper', prompt: 'You are a careful programmer. Ask for missing details when needed, show complete runnable code in fenced blocks with the language named, explain the key idea briefly, and point out edge cases and risks.' }
  ];
  const allPresets = () => [...BUILTIN_PRESETS, ...customPresets];

  // standing preferences and memory travel with every question
  events.on('context:collect', async thread => {
    const preamble = [];
    if (prefs.instructions?.trim()) preamble.push('The user’s standing preferences for how you respond (follow them unless the conversation says otherwise):\n' + prefs.instructions.trim());
    if (memory.enabled && memory.items.length && !thread.temporary) {
      const lines = []; let used = 0;
      for (const item of [...memory.items].reverse()) { if (used + item.text.length > 2000 || lines.length >= 40) break; lines.push('- ' + item.text); used += item.text.length; }
      preamble.push('Things the user asked you to remember (use them when relevant; do not bring them up otherwise):\n' + lines.reverse().join('\n'));
    }
    return { preamble };
  });

  // chat-level preset picker
  const presetSelect = document.getElementById('presetSelect');
  function renderPresetOptions(thread) {
    presetSelect.textContent = '';
    presetSelect.appendChild(new Option('No preset', ''));
    allPresets().forEach(p => presetSelect.appendChild(new Option(p.name, p.id)));
    presetSelect.value = thread?.presetId && allPresets().some(p => p.id === thread.presetId) ? thread.presetId : '';
    look?.render(thread?.presetId && allPresets().some(p => p.id === thread.presetId) ? thread.presetId : null);
  }
  presetSelect.addEventListener('change', () => {
    const thread = currentThread(); if (!thread) return;
    const preset = allPresets().find(p => p.id === presetSelect.value);
    if (preset) { thread.presetId = preset.id; thread.systemPrompt = preset.prompt; systemPromptInput.value = preset.prompt; }
    else delete thread.presetId;
    saveThreads(); look?.render(preset ? preset.id : null); showToast(preset ? 'Preset “' + preset.name + '” applied to this chat' : 'Preset cleared');
  });
  document.getElementById('savePresetBtn').addEventListener('click', async () => {
    const thread = currentThread(); const prompt = systemPromptInput.value.trim();
    if (!thread || !prompt) { showToast('Write the instructions first, then save them as a preset.'); return; }
    const name = await promptDialog('Save as preset', 'Preset name', thread.title && thread.title !== 'New chat' ? thread.title : '', { confirmLabel: 'Save preset' });
    if (!name || !name.trim()) return;
    const preset = { id: 'preset-' + generateThreadId(), name: name.trim(), prompt };
    const saved = await presetStore.mutate(list => ({ list: [...list, preset] }));
    if (!saved.ok) { presetFailure(saved); return; }
    adoptPresets(saved.list); thread.presetId = preset.id; saveThreads(); renderPresetOptions(thread); showToast('Preset saved');
  });

  // import: a file or a preset link is reviewed first; only the review box's "Add" makes a new preset (chat/assistant/preset-import.mjs)
  const presetImport = createPresetImport({
    el, openAppDialog, showToast, store: presetStore, builtins: () => BUILTIN_PRESETS, generateId: () => 'preset-' + generateThreadId(),
    onAdded: (preset, list) => { adoptPresets(list); renderPresetOptions(currentThread()); }
  });
  // restoring a backup's presets: the same rules as before (a preset whose name is already one of yours is skipped, each added one gets a new id), but made under the preset lock
  // against what is stored now. Returns { ok, added }; when presets cannot be changed (unreadable saved presets, no Web Locks, read-only tab) nothing is written and the person is told.
  async function restorePresets(items) {
    if (!(items || []).some(p => p?.name && p.prompt)) return { ok: true, added: 0 };
    const done = await presetStore.mutate(list => {
      const merged = mergeBackupPresets(list, items, () => 'preset-' + generateThreadId());
      // which backup preset became which new preset, so its kept look can follow it (restoreLooks); a preset whose name the person already has is skipped and gets nothing
      return merged.added ? { list: merged.list, result: { added: merged.added, idMap: idMapForRestore(list, merged.list, items) } } : { result: { added: 0, idMap: new Map() } };
    });
    if (!done.ok) { presetFailure(done); return { ok: false, added: 0, idMap: new Map() }; }
    adoptPresets(done.list); renderPresetOptions(currentThread());
    return { ok: true, added: done.result.added, idMap: done.result.idMap };
  }
  /** The kept looks of the person's own presets, for a full backup: { preset id: record } (only looks that can be used). */
  const looksForBackupNow = () => looksForBackup(customPresets, id => keeper.peek(id));
  /** Put a backup's looks back on the presets that restore just added (idMap: old id -> new id). Each record is checked again when it is kept. Returns how many were kept. */
  async function restoreLooks(looks, idMap) {
    let kept = 0;
    for (const [presetId, record] of looksToRestore(looks, idMap)) {
      const r = await keeper.keep(presetId, record);
      if (r.ok && r.result?.status === 'saved') kept++;
      else if (r.ok && r.result?.status === 'full') { showToast('Some character looks from the backup were not kept: ' + MAX_KEPT + ' looks are already kept.'); break; }
    }
    return kept;
  }
  document.getElementById('importPresetBtn')?.addEventListener('click', () => presetImport.chooseFile());
  // a Cosmogenitor character package is only PREVIEWED: nothing is added or saved (chat/presentation/preview.mjs, board T444). The shared validator is loaded when a package is opened.
  // Kept character looks (chat/presentation/keeper.mjs owns the key): one per preset, attached when a package's character is added as a preset, shown in the conversation by look-ui.mjs.
  const keeper = createPresentationKeeper({ storage: appLocal, isReadOnly: () => app.readOnly, onChange: () => look?.render(currentThread()?.presetId || null) });
  look = createLookUi({ el, keeper, showToast, strip: document.getElementById('lookStrip'), messagesEl: document.getElementById('messages'), controlsEl: document.getElementById('lookControls'), confirm: (...a) => window.plcDialogs.confirm(...a) });
  // A Cosmogenitor character package is previewed first (chat/presentation/preview.mjs, board T444); only "Add as a preset" changes anything, and it goes through the preset review box.
  // The shared validator (its neutral entry, chat/presentation/reader.mjs) is loaded when a package is opened.
  const presentationPreview = createPresentationPreview({
    el, openAppDialog, showToast, loadValidator,
    addAsPreset: (character, record) => presetImport.reviewResult(character.preset, 'package', {
      note: record ? 'The look from the package (its layout, palette and pictures) is kept with this preset too. You can turn it off or remove it later, under “Instructions for this chat”.' : 'The package has no look that can be used, so only the character\u2019s text is added.',
      after: async (preset) => {
        if (!record) return;
        const r = await keeper.keep(preset.id, record);
        showToast(r.ok && r.result?.status === 'saved' ? 'Look kept for “' + preset.name + '”.'
          : r.ok && r.result?.status === 'full' ? 'The preset was added, but ' + MAX_KEPT + ' looks are already kept. Remove one first, then add this character again.'
          : (r.message || 'The preset was added, but its look could not be kept.'));
      }
    })
  });
  document.getElementById('previewCharacterBtn')?.addEventListener('click', () => presentationPreview.chooseFile());
  // another tab changed the saved presets: show them here too (the list is read again; nothing is written)
  window.addEventListener('storage', event => {
    if (event.key !== PRESETS_KEY && event.key !== null) return;
    const fresh = presetStore.read(); if (!fresh.ok) return;
    adoptPresets(fresh.list); renderPresetOptions(currentThread());
  });
  systemPromptInput.addEventListener('input', () => { const t = currentThread(); if (t?.presetId && allPresets().find(p => p.id === t.presetId)?.prompt !== systemPromptInput.value.trim()) { delete t.presetId; presetSelect.value = ''; } });
  events.on('thread:selected', thread => renderPresetOptions(thread));

  // exact tools
  let toolsModule = null;
  const loadTools = async () => (toolsModule ||= await import(host.moduleBase() + 'chat/tools.mjs'));
  const retool = async msg => { if (msg.role !== 'user') return; const t = await loadTools(); const found = t.detectTools(msg.content); if (found.length) msg.tools = found; else delete msg.tools; };

  // memory
  function addMemory(text) {
    const clean = text.replace(/\s+/g, ' ').trim().slice(0, 400);
    if (!clean) return false;
    if (memory.items.some(i => i.text.toLowerCase() === clean.toLowerCase())) return false;
    memory.items.push({ id: generateThreadId(), text: clean, at: Date.now() }); saveMemory(); return true;
  }
  messageDecorators.push((thread, msg, index, ctx, actions) => {
    if (msg.notice || msg.role === 'system' || ctx.streaming || thread.temporary || msg.local) return;
    actions.appendChild(actionButton('remember', '🧠 Remember this', 'Remember this in future chats'));
  });
  messageActionHandlers['remember'] = async (thread, msg) => {
    const text = await promptDialog('Remember this', 'You can edit it before it is saved. It will be available in future chats (not temporary ones).', msg.content.slice(0, 400), { multiline: true, confirmLabel: 'Remember' });
    if (text === null) return;
    showToast(addMemory(text) ? 'Remembered. Manage it under Memory & preferences.' : 'Nothing new to remember.');
  };

  async function openPreferences() {
    const root = el('div');
    const sec = (title, ...nodes) => { const d = el('section'); d.appendChild(el('h3', null, title)); nodes.forEach(n => d.appendChild(n)); root.appendChild(d); return d; };
    // standing instructions
    const instr = el('textarea'); instr.value = prefs.instructions || ''; const openedInstructions = instr.value; instr.id = 'prefInstructions'; instr.placeholder = 'For example: Reply in British English. Keep answers short. I am a nurse, not a programmer.';
    const instrLabel = el('label', 'sr-only', 'How should the assistant respond?'); instrLabel.htmlFor = 'prefInstructions';
    sec('How should replies be written?', el('p', 'muted', 'Applied to every chat, on top of that chat’s own instructions. Kept on this device.'), instrLabel, instr);
    // memory
    const memList = el('div'); const memToggle = el('label', 'list-row'); const cb = el('input'); cb.type = 'checkbox'; cb.checked = memory.enabled;
    memToggle.append(cb, el('span', null, 'Use memory in new questions (never in temporary chats)'));
    cb.addEventListener('change', () => { memory.enabled = cb.checked; saveMemory(); });
    const addRow = el('div', 'list-row'); const addIn = el('input'); addIn.type = 'text'; addIn.placeholder = 'Something to remember…'; addIn.setAttribute('aria-label', 'New memory');
    const addBtn = el('button', 'secondary', 'Add'); addBtn.type = 'button';
    const renderMemory = () => {
      memList.textContent = '';
      if (!memory.items.length) memList.appendChild(el('p', 'muted', 'Nothing remembered yet. Use “Remember” on any message, or type /remember followed by a fact.'));
      memory.items.forEach((item, i) => {
        const row = el('div', 'list-row'); const t = el('input'); t.type = 'text'; t.value = item.text; t.setAttribute('aria-label', 'Memory ' + (i + 1));
        t.addEventListener('change', () => { item.text = t.value.trim().slice(0, 400); if (!item.text) memory.items.splice(i, 1); saveMemory(); renderMemory(); });
        const del = el('button', 'secondary', 'Forget'); del.type = 'button'; del.setAttribute('aria-label', 'Forget: ' + item.text.slice(0, 40));
        del.addEventListener('click', () => { memory.items.splice(i, 1); saveMemory(); renderMemory(); });
        row.append(t, del); memList.appendChild(row);
      });
    };
    addBtn.addEventListener('click', () => { if (addMemory(addIn.value)) { addIn.value = ''; renderMemory(); } });
    addIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addBtn.click(); } });
    addRow.append(addIn, addBtn); renderMemory();
    sec('Memory', el('p', 'muted', 'Short facts the assistant is reminded of in later chats. You decide what goes in, and you can edit or remove anything.'), memToggle, memList, addRow);
    // presets
    const presetList = el('div');
    const renderPresets = () => {
      presetList.textContent = '';
      allPresets().forEach(p => {
        const row = el('div', 'list-row'); const info = el('div'); info.append(el('strong', null, p.name), el('div', 'muted', p.prompt.slice(0, 140) + (p.prompt.length > 140 ? '…' : '')));
        row.appendChild(info);
        if (!p.id.startsWith('builtin-')) {
          const edit = el('button', 'secondary', 'Edit'); edit.type = 'button';
          edit.addEventListener('click', async () => {
            // `p` is the record this editor shows. It is compared with the stored record inside the lock (editPresetChange): if the preset was changed or removed since, nothing is written.
            const prompt = await promptDialog('Edit preset “' + p.name + '”', 'Instructions', rejectedEdits.get(p.id) ?? p.prompt, { multiline: true });
            if (!prompt || !prompt.trim()) return;
            rejectedEdits.delete(p.id);
            const done = await presetStore.mutate(editPresetChange(p, prompt.trim()));
            if (!done.ok) { rejectedEdits.set(p.id, prompt.trim()); presetFailure(done); return; }
            adoptPresets(done.list);
            if (done.result.status === 'gone') showToast('That preset was already removed. Your edit was not saved.');
            else if (done.result.status === 'stale') { rejectedEdits.set(p.id, prompt.trim()); showToast('This preset was changed somewhere else after you opened it, so your edit was not saved. Press Edit again to see the newer text with your wording kept for you to apply.'); }
            renderPresets(); renderPresetOptions(currentThread());
          });
          const del = el('button', 'secondary', 'Delete'); del.type = 'button';
          del.addEventListener('click', async () => {
            const done = await presetStore.mutate(list => ({ list: list.filter(x => x.id !== p.id) }));
            if (!done.ok) { presetFailure(done); return; }
            adoptPresets(done.list); renderPresets(); renderPresetOptions(currentThread());
            keeper.remove(p.id); // the look goes with its preset (a newer version's entry is left alone)
          });
          row.append(edit, del);
        }
        presetList.appendChild(row);
      });
    };
    renderPresets();
    sec('Assistant presets', el('p', 'muted', 'Pick one under “Instructions for this chat”. Write instructions there and press “Save as preset” to add your own, or press “Import preset…” to review one from a file.'), presetList);
    // typing
    const enter = el('label', 'list-row'); const ecb = el('input'); ecb.type = 'checkbox'; ecb.checked = host.enterSends();
    enter.append(ecb, el('span', null, 'Enter sends the message (Shift+Enter adds a new line)'));
    ecb.addEventListener('change', () => { prefs.enterSends = ecb.checked; savePrefs(); updateComposerHint(); });
    sec('Typing', enter);
    // speech
    const voiceWrap = el('div');
    const voiceSel = el('select'); voiceSel.setAttribute('aria-label', 'Read-aloud voice');
    const rate = el('input'); rate.type = 'range'; rate.min = '0.6'; rate.max = '1.6'; rate.step = '0.1'; rate.value = String(prefs.speechRate || 1); rate.setAttribute('aria-label', 'Reading speed');
    const speechModule = await host.loadSpeech(); await speechModule.whenVoicesReady();
    const voiceList = speechModule.voices();
    if (host.speechAvailable().synth && voiceList.length) {
      voiceList.forEach(v => voiceSel.appendChild(new Option(v.name + ' (' + v.lang + ')' + (v.localService ? '' : ' \u00B7 online'), v.voiceURI)));
      voiceSel.value = speechModule.bestVoice(prefs.voiceURI)?.voiceURI || voiceList[0].voiceURI;
      voiceSel.addEventListener('change', () => { prefs.voiceURI = voiceSel.value; savePrefs(); });
      rate.addEventListener('change', () => { prefs.speechRate = Number(rate.value); savePrefs(); });
      voiceWrap.append(el('p', 'muted', 'Replies are read with your browser\u2019s voices.'), voiceSel, el('div', 'muted', 'Speed'), rate);
    }
    if (voiceWrap.childElementCount) sec('Read aloud', voiceWrap);
    if (host.voiceButton()) {
      const soundRow = el('label', 'list-row'); const soundBox = el('input'); soundBox.type = 'checkbox'; soundBox.id = 'callSoundsPref'; soundBox.checked = host.callSoundsOn();
      soundRow.append(soundBox, el('span', null, 'Play ringing, pick-up and hang-up sounds during voice calls'));
      soundBox.addEventListener('change', () => { prefs.callSounds = soundBox.checked; savePrefs(); });
      sec('Voice calls', soundRow);
    }
    openAppDialog({ title: 'Memory & preferences', content: root, wide: true, actions: [{ label: 'Done', primary: true, run: () => { if (instr.value === openedInstructions) return; prefs.instructions = instr.value.trim().slice(0, 4000); savePrefs(); } }] }); // only a field the person edited is written: Done in a stale tab must not claim the instructions it merely showed
  }

  // slash commands are answered here, without the model; exact results are attached to ordinary questions
  events.on('send:intercept', async (text, thread) => {
    if (!text.startsWith('/')) return false;
    const tools = await loadTools();
    const remember = /^\/remember\s+([\s\S]+)$/i.exec(text);
    const reply = remember
      ? { text: thread.temporary ? 'Temporary chats don\u2019t add to memory.' : addMemory(remember[1]) ? 'Remembered: **' + remember[1].trim() + '**' : 'I already had that, or there was nothing to remember.' }
      : tools.runCommand(text);
    if (!reply) return false;
    thread.messages.push(host.model().makeMessage('user', text), host.model().makeMessage('assistant', reply.text, { local: true }));
    if (thread.messages.length === 2 && host.model().hasDefaultTitle(thread)) { thread.title = host.model().deriveTitle(text) || thread.title; threadTitleInput.value = thread.title; }
    messageInput.value = ''; growComposer(); persistDraftNow(thread.id); host.model().touch(thread); saveThreads(); renderThreadList(); renderMessages(thread);
    const status = document.getElementById('generationStatus'); status.hidden = false; status.textContent = 'Answered on this device.';
    return true;
  });
  events.on('prompt:ready', retool);
  return { get memory() { return memory; }, get customPresets() { return customPresets; }, addMemory, restorePresets, looksForBackup: looksForBackupNow, restoreLooks, openPreferences, openPresetFromAddress:() => presetImport.openFromAddress() };
}
