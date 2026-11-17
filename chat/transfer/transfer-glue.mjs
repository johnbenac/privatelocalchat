// Moving settings and chats in and out of this page: the lazy-loaded transfer dialogs (chat/transfer/transfer-ui.mjs), the app object they are given, a settings link or
// file opened here (reviewed before anything changes), and the title / system / prompt carried in the address.
// createTransferGlue(host) returns { loadTransferUi, transferUiDiscardPending, applyConfigFromUrl, importConfig, parseUrlParams }.
//
// host: provider (chat/provider/provider-settings.mjs), M(), moduleBase(), el, openAppDialog, showToast, loadRoberta(), importConfigInput, importInput, tokenInput, downloadText,
// exportHistory, updateBackupNudge, threads(), folders(), assistant, prefs, savePrefs, loadDocModules, loadCrypto, buildBackup, openAbout, openProviderSettings, createThread, getThread,
// setCurrentThreadId, renderThreadList, selectThread, updateChatAvailability, threadTitleInput, systemPromptInput, messageInput
import { appSession } from "../vault/vault-store.mjs";
export function createTransferGlue(host) {
  const { provider, el, openAppDialog, showToast, importConfigInput, importInput, tokenInput, downloadText, exportHistory, updateBackupNudge,
    assistant, prefs, savePrefs, loadDocModules, loadCrypto, buildBackup, openAbout, openProviderSettings, createThread, getThread, renderThreadList,
    selectThread, updateChatAvailability, threadTitleInput, systemPromptInput, messageInput } = host;
  const { getTokenForEndpoint, setTokenForEndpoint, canonicalizeEndpoint, persistTokenValue, refreshModels, storeModels, persistConfig, renderModelOptions, updateAuthGuidance, resolveTheme } = provider;
  let transferUi = null, transferUiLoading = null;
  const settingsTransferModule = () => import(host.moduleBase() + 'chat/transfer/settings-transfer.mjs');
  function loadTransferUi() {
    transferUiLoading ||= import(host.moduleBase() + 'chat/transfer/transfer-ui.mjs').then(mod => {
      transferUi = mod.createTransferUi({
        app: transferApp, el, openAppDialog, showToast,
        icon: name => (host.M() && host.M().icons ? host.M().icons.iconNode(name) : null)
      });
      transferUi.mountPendingRow(document.getElementById('pendingTokenRow'));
      return transferUi;
    });
    return transferUiLoading;
  }
  function transferUiDiscardPending() {
    try { appSession.removeItem('plc.pendingToken.v1'); } catch (err) { /* nothing stored */ }
    transferUi?.renderPending();
  }
  const transferApp = {
    siteConfig: window.SITE_CONFIG || {},
    callRoberta: () => host.loadRoberta().then(r => r.openCall()),
    getConfig: () => ({ ...provider.config }),
    tokens: {
      get: endpoint => getTokenForEndpoint(endpoint),
      set: (endpoint, token) => {
        setTokenForEndpoint(endpoint, token);
        if (canonicalizeEndpoint(endpoint) === canonicalizeEndpoint(provider.config.endpoint)) { persistTokenValue(token, { refresh: false }); tokenInput.value = (token || '').trim(); }
      }
    },
    applySettings: provider.applyImportedSettings,
    // provider requests start only after the destination was reviewed and the token question is settled
    async credentialsResolved({ endpoint, changed = true, unlocked = false } = {}) {
      const ST = await settingsTransferModule();
      if (!provider.config.endpoint || (endpoint && !ST.sameDestination(endpoint, provider.config.endpoint))) return;
      const wanted = provider.config.model;
      if (changed || unlocked || (provider.config.model && !provider.models.includes(provider.config.model))) await refreshModels({ silent: true });
      // the model that came with the settings stays selected even if this provider's list does not show it (some providers accept more than they list)
      if (wanted && provider.config.model !== wanted) {
        storeModels([...provider.models, wanted]); provider.config.model = wanted; persistConfig(); renderModelOptions(provider.models, wanted);
        showToast('The model \u201C' + wanted + '\u201D is not in this provider\u2019s list. It was kept; choose another if requests fail.', 6000);
      }
      updateAuthGuidance();
      updateChatAvailability();
    },
    focusTokenField() {
      openProviderSettings(tokenInput);
    },
    chooseSettingsFile: () => importConfigInput.click(),
    chooseChatFile: () => importInput.click(),
    downloadText,
    exportHistory: () => { exportHistory(); updateBackupNudge(); },
    chatCounts: () => ({
      conversations: host.threads().filter(t => !t.temporary).length, projects: host.folders().length, memory: assistant.memory.items.length,
      presets: assistant.customPresets.length, hasInstructions: Boolean((prefs.instructions || '').trim())
    }),
    async documentCount() { const { store } = await loadDocModules(); return (await store.all()).filter(d => !d.temporary).length; },
    async createProtectedBackup({ passphrase, includeDocs }) {
      const c = await loadCrypto();
      const backup = await buildBackup(includeDocs);
      const envelope = await c.encryptString(JSON.stringify(backup), passphrase, { meta: { exportedAt: backup.exportedAt, app: 'privatelocalchat' } });
      downloadText('private-local-chat-' + new Date().toISOString().slice(0, 10) + '.encrypted.json', JSON.stringify(envelope), 'application/json');
      prefs.lastExportAt = Date.now(); savePrefs(); updateBackupNudge();
    },
    qrColors: () => (resolveTheme(provider.config.theme) === 'dark' ? { dark: '#f8fafc', light: '#111827' } : { dark: '#000000', light: '#ffffff' }),
    openAboutModal: () => openAbout()
  };
  /** Take what this page's address carried out of the address bar once it has been read and kept. */
  function clearTransferFromAddress(ST) {
    try {
      const url = new URL(window.location.href);
      const fragment = new URLSearchParams(url.hash.replace(/^#/, ''));
      if (fragment.has('settings')) { fragment.delete('settings'); const rest = fragment.toString(); url.hash = rest ? '#' + rest : ''; }
      ST.LEGACY_PARAMS.forEach(key => url.searchParams.delete(key));
      history.replaceState(null, document.title, url.pathname + url.search + url.hash);
    } catch (err) {
      console.warn('Unable to clear shared settings from the address:', err);
    }
  }
  /** A settings link opened here: a version 2 fragment decides, older query links still work. Reviewed before anything changes. */
  async function applyConfigFromUrl() {
    const ST = await settingsTransferModule();
    const incoming = ST.readIncoming({ hash: window.location.hash, search: window.location.search });
    if (!incoming) return;
    clearTransferFromAddress(ST);
    (await loadTransferUi()).reviewIncoming(incoming, { origin: 'link' });
  }
  /** A settings file chosen here (version 2 or an earlier export), through the same review. */
  async function importConfig(event) {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const ST = await settingsTransferModule();
      const result = file.size > 5 * 1024 * 1024 ? { ok: false, message: 'This file is too large to be a settings file.' } : ST.readConfigFile(await file.text());
      (await loadTransferUi()).reviewIncoming(result, { origin: 'file' });
    } catch (err) {
      (await loadTransferUi()).reviewIncoming({ ok: false, message: 'The file could not be read.' });
    } finally {
      importConfigInput.value = '';
    }
  }

  /**
   * Parse the current URL's query parameters and, if any chat data is
   * provided, prepopulate a new chat thread. Supported parameters:
   *
   *   - title: the chat title
   *   - system: the system prompt
   *   - prompt: the initial message to prefill in the message input
   *
   * If at least one of these parameters is present, a new thread is
   * created (without altering existing ones) and selected. The chat
   * remains disabled until the user configures an endpoint and model.
   */
  function parseUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const titleParam = params.get('title') || params.get('chat') || params.get('name');
    const systemParam = params.get('system') || params.get('systemPrompt') || params.get('system_prompt');
    const promptParam = params.get('prompt') || params.get('message') || params.get('msg');
    // Only act if at least one parameter is present and no threads yet created via params
    if (titleParam || systemParam || promptParam) {
      // Create a new thread with provided values
      const threadDetails = {
        title: titleParam ? decodeURIComponent(titleParam) : 'New chat',
        systemPrompt: systemParam ? decodeURIComponent(systemParam) : ''
      };
      const id = createThread(threadDetails);
      host.setCurrentThreadId(id);
      const threadObj = getThread(id);
      // Insert into UI
      renderThreadList();
      selectThread(id);
      // Overwrite fields with decoded values
      threadTitleInput.value = threadObj?.title ?? threadDetails.title;
      systemPromptInput.value = threadObj?.systemPrompt ?? threadDetails.systemPrompt;
      if (promptParam) {
        messageInput.value = decodeURIComponent(promptParam);
      }
      updateChatAvailability();
    }
  }
  return { loadTransferUi, transferUiDiscardPending, applyConfigFromUrl, importConfig, parseUrlParams };
}
