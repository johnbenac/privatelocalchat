// The conversations and what the chat is ready to do: load and save the threads, create / select / rename / export one, and work out whether the chat can send
// right now (a thread, a model or endpoint) and show that in the composer and the notice above it.
// The thread list and the current thread's id live in the page and are lent here as `s`.
// createThreadState(host) returns { buildPreloadUrl, loadThreads, saveThreads, generateThreadId, createThread, ensureThreadExists, getThread, currentThread, updateThread,
// getChatState, updateSendButtonDisabled, updateChatNotice, updateChatAvailability, selectThread, renameThread, exportThreadMarkdown }.
//
// host: s (threads, currentThreadId, generationBusy, gen as get / set), M(), drafts(), and the page capabilities named in the destructure below
import { appLocal } from "../vault/vault-store.mjs";
import { outcomeOf, sentence, warningSentence } from "../encounters/save-outcome.mjs";

export function createThreadState(host) {
  const { threadTitleInput, systemPromptInput, messageInput, readJson, writeJson, showToast, THREAD_KEY, ACTIVE_THREAD_KEY, provider, sendBtn, chatNotice, updateModeBadge, messageForm, closeThreadMenu, persistDraftNow, growComposer, events, closeSidebar, promptDialog, messagesView, renderThreadList } = host;
  const s = host.s;
  const { } = host;
  function buildPreloadUrl() {
    const baseHref = window.location.href.split('#')[0].split('?')[0];
    const params = new URLSearchParams();
    const title = (threadTitleInput?.value || '').trim();
    const system = (systemPromptInput?.value || '').trim();
    const prompt = (messageInput?.value || '').trim();
    if (title) params.set('title', title);
    if (system) params.set('system', system);
    if (prompt) params.set('prompt', prompt);
    const query = params.toString();
    return query ? `${baseHref}?${query}` : baseHref;
  }

  async function loadThreads() {
    if (host.encounters?.prepare) await host.encounters.prepare();   // finish an interrupted earlier commit under the lock BEFORE the screen reads the stored chats (a refusal still shows what is stored)
    // ONE read of the stored chats: the screen is built from it and the same text is the baseline of every later save (no second read, no await between this read and init)
    let raw = null; try { raw = appLocal.getItem(THREAD_KEY); } catch { raw = null; }
    let storedThreads = []; try { storedThreads = raw == null || raw === '' ? [] : JSON.parse(raw); } catch { storedThreads = []; }
    const list = Array.isArray(storedThreads) ? storedThreads : [];
    s.threads = host.M().model.purgeExpired(list.map(t => host.M().model.normalizeThread(t)).filter(Boolean));
    if (host.encounters) await host.encounters.init(raw);   // what storage held right now is what this tab's later saves are patched against
  }

  // Temporary chats are never written down. Every save is one commit under the Web Lock "plc-encounters" (chat/encounters/thread-commit.mjs): this tab's changes are applied as a patch to
  // the freshly stored chats, together with their conversation records, never as a whole-list overwrite.
  // persist(ids, what) is the ONE place a save's result becomes an outcome (chat/encounters/save-outcome.mjs): saved only when the commit went through and none of the conversations `ids`
  // (all, when omitted) is in conflict. When it was not saved the person is told, in the words of the action `what` ("Your message was not sent"), once per few seconds per wording, so an
  // automatic save that keeps failing is not a stream of toasts. Nothing here ever writes storage back: a refused change is the caller's to take back in its own memory.
  const toldAt = new Map();
  function tellNotSaved(text) { const now = Date.now(); if ((toldAt.get(text) || 0) > now - 8000) return; toldAt.set(text, now); try { host.showToast(text, 9000); } catch { /* no screen */ } }
  async function persist(ids = null, what = 'Your chat was not saved') {
    let result;
    if (host.encounters) result = await host.encounters.saveThreads();
    else { const ok = writeJson(appLocal, THREAD_KEY, s.threads.filter(t => !t.temporary)); result = ok ? { ok: true, conflicts: [] } : { ok: false, code: 'threads-write-failed', message: 'This browser could not save your chats.' }; }
    const outcome = outcomeOf(result, ids);
    if (!outcome.saved) tellNotSaved(sentence(outcome, what));
    else { const partial = warningSentence(outcome); if (partial) tellNotSaved(partial); }   // stored, but its records are incomplete: said plainly, the text is never restored or resent
    return outcome;
  }
  async function saveThreads(ids = null) { return (await persist(ids)).saved; }

  function generateThreadId() {
    return `${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 10)}`;
  }

  // SYNCHRONOUS, as it always was: the new conversation exists in this tab at once and its id is returned, so every caller (New chat, Temporary, URL parameters, deleting the last chat,
  // the first start, an import into an empty list) selects it without waiting. Its persistence is queued through the same commit; whatever mutation or dispatch next depends on it awaits
  // its own actual save result (a refused one is told there, and the new conversation is simply saved again with the next change).
  function createThread({ title = 'New chat', systemPrompt = '', messages = [], temporary = false } = {}) {
    const id = generateThreadId();
    const normalizedTitle = typeof title === 'string' ? title : 'New chat';
    const normalizedSystemPrompt = typeof systemPrompt === 'string' ? systemPrompt : '';
    const now = Date.now();
    const thread = {
      id,
      title: normalizedTitle,
      systemPrompt: normalizedSystemPrompt,
      messages: (Array.isArray(messages) ? messages : []).map(m => host.M().model.normalizeMessage(m, now)).filter(Boolean),
      createdAt: now,
      updatedAt: now
    };
    if (temporary) thread.temporary = true;
    s.threads.push(thread);
    persist(id, 'The new chat was not saved yet').catch(() => {});
    return id;
  }

  function ensureThreadExists() {
    const hasValidThread = s.threads.some(thread => thread && typeof thread.id === 'string' && thread.id);
    if (hasValidThread) {
      return null;
    }
    return createThread();
  }

  const getThread = id => s.threads.find(t => t.id === id);
  const currentThread = () => getThread(s.currentThreadId);
  const updateThread = async mutator => {
    const thread = currentThread();
    if (!thread) return null;
    mutator(thread);
    await saveThreads(thread.id);
    return thread;
  };

  /**
   * Derive the state of the chat. A thread, endpoint and model must be selected
   * before sending messages. This helper returns booleans representing those
   * conditions as well as an aggregate "ready" flag.
   */
  function getChatState() {
    if (!window.localModels) return {local:true,hasThread:Boolean(currentThread()),hasEndpoint:true,hasModel:false,canType:false,ready:false};
    if (window.localModels?.mode === 'local') {
      const hasThread = Boolean(currentThread());
      const hasModel = window.localModels.ready || window.localModels.canPrepare !== false;
      return { local: true, hasThread, hasEndpoint: true, hasModel, canType: hasThread && hasModel, ready: hasThread && hasModel && !s.generationBusy };
    }
    const thread = currentThread();
    const hasThread = Boolean(thread);
    const hasEndpoint = Boolean((provider.config.endpoint || '').trim());
    const hasModel = Boolean((provider.config.model || '').trim());
    return {
      hasThread,
      hasEndpoint,
      hasModel,
      canType: hasThread && hasEndpoint && hasModel,
      ready: hasThread && hasEndpoint && hasModel && !s.generationBusy
    };
  }

  /**
   * Enable or disable the send button depending on whether a message is ready to send.
   * @param {boolean} isReady indicates if chat conditions are met
   */
  // Send is always available when you can reply; while an answer is being written it gives way to Stop.
  function updateSendButtonDisabled() {
    if (!sendBtn) return;
    sendBtn.hidden = Boolean(s.gen) || s.generationBusy;
  }

  /**
   * Update the notice block above the chat area to indicate missing prerequisites.
   * When there are no issues this hides the notice, otherwise lists guidance.
   * @param {object} state output from getChatState()
   */
  function updateChatNotice(state) {
    if (!chatNotice) return;
    const instructions = [];
    if (state.local && !state.hasModel && currentThread()?.messages.length) instructions.push(window.localModels?.installed ? 'Loading the model into memory. You can write a draft while it loads.' : 'Set up on-device chat to start. You can write a draft in the meantime.');
    if (!state.hasEndpoint) {
      instructions.push('Add a provider endpoint under Model and connection to send messages.');
    }
    if (!state.local && state.hasEndpoint && !state.hasModel) {
      instructions.push('Refresh the provider’s model list and choose a model.');
    }
    if (!state.hasThread) {
      instructions.push('Start a new chat or open one from the conversation list.');
    }

    const requiresEndpoint = !state.hasEndpoint;
    chatNotice.classList.toggle('requires-endpoint', requiresEndpoint);
    if (requiresEndpoint) {
      chatNotice.setAttribute('tabindex', '0');
    } else {
      chatNotice.removeAttribute('tabindex');
    }

    chatNotice.innerHTML = '';
    if (!instructions.length) {
      chatNotice.classList.remove('active');
      chatNotice.setAttribute('aria-hidden', 'true');
      chatNotice.hidden = true;
      if (messageInput) {
        messageInput.removeAttribute('aria-describedby');
      }
      return;
    }

    const list = document.createElement('ul');
    instructions.forEach(text => {
      const item = document.createElement('li');
      item.textContent = text;
      list.appendChild(item);
    });
    chatNotice.appendChild(list);
    chatNotice.classList.add('active');
    chatNotice.setAttribute('aria-hidden', 'false');
    chatNotice.hidden = false;
    if (messageInput) {
      messageInput.setAttribute('aria-describedby', 'chatNotice');
    }
  }

  /**
   * Based on chat state, enable/disable inputs and update placeholders
   * to guide the user toward completing the necessary steps. When a
   * message has been prefilled via URL, we leave that value intact
   * so the user can see it even if sending is disabled.
   */
  function updateChatAvailability() {
    const state = getChatState();
    const placeholder = !state.hasThread ? 'Start a new chat to write a message' : 'Write a message…';
    threadTitleInput.disabled = !state.hasThread;
    systemPromptInput.disabled = !state.hasThread;
    updateModeBadge();

    // Only update the message placeholder if the input is empty. If there's
    // pre-filled text we leave it alone so that the user can see it.
    if (!messageInput.value) {
      messageInput.placeholder = placeholder;
    }
    // Disable input when not ready, but leave the value alone.
    messageInput.disabled = !state.hasThread;
    if (state.hasThread) {
      messageForm.classList.remove('disabled');
      messageForm.setAttribute('aria-disabled', 'false');
    } else {
      messageForm.classList.add('disabled');
      messageForm.setAttribute('aria-disabled', 'true');
    }
    updateChatNotice(state);
    updateSendButtonDisabled(state.ready);
  }

  /**
   * Select a thread by ID, updating UI and state accordingly. If the
   * thread doesn't exist, the chat inputs are disabled.
   * @param {string} id thread identifier
   */
  function selectThread(id) {
    closeThreadMenu();
    const previousId = s.currentThreadId;
    if (previousId && previousId !== id) {
      persistDraftNow(previousId);
      messageInput.value = host.drafts()[id] || '';
      growComposer();
    } else if (!previousId && !messageInput.value) {
      messageInput.value = host.drafts()[id] || '';
      growComposer();
    }
    s.currentThreadId = id;
    const thread = getThread(id);
    if (!thread) {
      updateChatAvailability();
      return;
    }
    writeJson(appLocal, ACTIVE_THREAD_KEY, id);
    // Populate title and system prompt
    threadTitleInput.value = thread.title || '';
    systemPromptInput.value = thread.systemPrompt || '';
    // Render messages
    messagesView.renderMessages(thread);
    events.emit('thread:selected', thread);
    // Re-render thread list to highlight current
    renderThreadList();
    closeSidebar();
    updateChatAvailability();
  }

  /**
   * Rename the given thread by prompting the user for a new title. The
   * current thread title input updates along with the list.
   * @param {string} threadId id of the thread to rename
   */
  async function renameThread(threadId) {
    const thread = getThread(threadId);
    if (!thread) return;
    const currentName = thread.title && thread.title.trim() ? thread.title.trim() : 'Untitled';
    const newName = await promptDialog('Rename chat', 'Title', currentName);
    if (newName === null) return;
    const previousTitle = thread.title;
    thread.title = newName.trim() || 'Untitled';
    const o = await persist(threadId, 'The new name was not saved');
    if (!o.saved) thread.title = previousTitle;   // this tab's own copy goes back; nothing is written to storage
    renderThreadList();
    if (threadId === s.currentThreadId) {
      threadTitleInput.value = thread.title;
    }
  }


  function exportThreadMarkdown(threadId = s.currentThreadId) {
    if (!threadId) return;
    const thread = getThread(threadId);
    if (!thread) return;
    const markdown = host.M().model.threadToMarkdown(thread);
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const safeTitle = typeof thread.title === 'string' && thread.title.trim()
      ? thread.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
      : 'chat';
    const filename = `${safeTitle || 'chat'}-${thread.id}.md`;
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // ---- chat core: answers are rendered, streamed and controlled per message -----------------------------------
  return { buildPreloadUrl, loadThreads, saveThreads, generateThreadId, createThread, ensureThreadExists, getThread, currentThread, updateThread, getChatState, updateSendButtonDisabled, updateChatNotice, updateChatAvailability, selectThread, renameThread, exportThreadMarkdown, persist };
}
