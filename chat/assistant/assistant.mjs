// The assistant's standing context and its small tools: preferences (instructions, how Enter sends, the reply voice and speed, call sounds), memory (things you asked it to
// remember), presets (built in and your own), and the exact-answer tools (arithmetic, unit conversion, calendar questions, slash commands answered without the model).
// What it adds to what the model is told arrives through the event list: context:collect for preferences and memory, send:intercept and prompt:ready for the tools.
// createAssistant(host) returns { memory, customPresets, addMemory, savePresets, openPreferences }: the page reads memory and the presets for backups and the context meter.
//
// host: el, events, messageDecorators, messageActionHandlers, actionButton (buttons under a message), model() (the thread model functions), prefs (the object), savePrefs, readJson, writeJson, messageInput, systemPromptInput, threadTitleInput, openAppDialog,
//       promptDialog, showToast, saveThreads, currentThread(), generateThreadId, growComposer, persistDraftNow, renderMessages, renderThreadList, updateComposerHint,
//       enterSends(), callSoundsOn(), loadSpeech(), speechAvailable() (what the browser can do), voiceButton() (null when there is no call button), moduleBase()
import { appLocal } from "../vault/vault-store.mjs";

export function createAssistant(host) {
  const { el, events, prefs, savePrefs, readJson, writeJson, messageInput, systemPromptInput, threadTitleInput, openAppDialog, promptDialog, showToast, saveThreads, growComposer,
    persistDraftNow, renderMessages, renderThreadList, updateComposerHint, generateThreadId, currentThread, messageDecorators, messageActionHandlers, actionButton } = host;
  const MEMORY_KEY = 'plc.memory.v1', PRESETS_KEY = 'plc.presets.v1';
  let memory = readJson(appLocal, MEMORY_KEY, { enabled: true, items: [] });
  if (!memory || !Array.isArray(memory.items)) memory = { enabled: true, items: [] };
  const saveMemory = () => writeJson(appLocal, MEMORY_KEY, memory);
  let customPresets = readJson(appLocal, PRESETS_KEY, []);
  if (!Array.isArray(customPresets)) customPresets = [];
  const savePresets = () => writeJson(appLocal, PRESETS_KEY, customPresets);
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
  }
  presetSelect.addEventListener('change', () => {
    const thread = currentThread(); if (!thread) return;
    const preset = allPresets().find(p => p.id === presetSelect.value);
    if (preset) { thread.presetId = preset.id; thread.systemPrompt = preset.prompt; systemPromptInput.value = preset.prompt; }
    else delete thread.presetId;
    saveThreads(); showToast(preset ? 'Preset “' + preset.name + '” applied to this chat' : 'Preset cleared');
  });
  document.getElementById('savePresetBtn').addEventListener('click', async () => {
    const thread = currentThread(); const prompt = systemPromptInput.value.trim();
    if (!thread || !prompt) { showToast('Write the instructions first, then save them as a preset.'); return; }
    const name = await promptDialog('Save as preset', 'Preset name', thread.title && thread.title !== 'New chat' ? thread.title : '', { confirmLabel: 'Save preset' });
    if (!name || !name.trim()) return;
    const preset = { id: 'preset-' + generateThreadId(), name: name.trim(), prompt };
    customPresets.push(preset); savePresets(); thread.presetId = preset.id; saveThreads(); renderPresetOptions(thread); showToast('Preset saved');
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
    const instr = el('textarea'); instr.value = prefs.instructions || ''; instr.id = 'prefInstructions'; instr.placeholder = 'For example: Reply in British English. Keep answers short. I am a nurse, not a programmer.';
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
          edit.addEventListener('click', async () => { const prompt = await promptDialog('Edit preset “' + p.name + '”', 'Instructions', p.prompt, { multiline: true }); if (prompt && prompt.trim()) { p.prompt = prompt.trim(); savePresets(); renderPresets(); renderPresetOptions(currentThread()); } });
          const del = el('button', 'secondary', 'Delete'); del.type = 'button';
          del.addEventListener('click', () => { customPresets = customPresets.filter(x => x.id !== p.id); savePresets(); renderPresets(); renderPresetOptions(currentThread()); });
          row.append(edit, del);
        }
        presetList.appendChild(row);
      });
    };
    renderPresets();
    sec('Assistant presets', el('p', 'muted', 'Pick one under “Instructions for this chat”. Write instructions there and press “Save as preset” to add your own.'), presetList);
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
    openAppDialog({ title: 'Memory & preferences', content: root, wide: true, actions: [{ label: 'Done', primary: true, run: () => { prefs.instructions = instr.value.trim().slice(0, 4000); savePrefs(); } }] });
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
  return { get memory() { return memory; }, get customPresets() { return customPresets; }, addMemory, savePresets, openPreferences };
}
