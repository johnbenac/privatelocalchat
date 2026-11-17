// Roberta in the page: what she can see (the model's state, what the browser can do, the person's chats), what she can do (open share and import, start the
// model download, leave a voice message), and the router that matches what someone says to a topic by meaning (the small matching model loads in the background).
// The screen itself is chat/roberta/roberta-ui.mjs and her words are chat/roberta/ivr-content.mjs; this file connects them to the app.
// createRobertaGlue(host) returns { loadRoberta, api() }.
//
// host: moduleBase(), prefs, threads(), models() (the chat model controller), speech() (the loaded speech module or null), speechAvailable, speechInputOk,
//       loadSpeech(), loadCallSounds(), ensureCallSounds(), callSounds(), explainSpeechInputFailure(code), sharedEmbedder(), isTouchDevice(), loadTransferUi(),
//       importInput, endpointInput, messageInput, openProviderSettings(el), startSetup(), startVoiceNote(), voiceOpts()
export function createRobertaGlue(host) {
  const { prefs, speechAvailable, speechInputOk, importInput, endpointInput, messageInput, openProviderSettings } = host;
  // She is the front desk: it works before any language model is loaded, in parallel with the model download. Pressing numbers always
  // works; what a person says is matched to a topic by meaning (chat/roberta/intent-router.mjs, with a small search model that loads in the
  // background). She is not the language model and says so (chat/roberta/ivr-content.mjs).
  let robertaApi = null, contentMod = null, routerPromise = null;
  function robertaModelFacts() {
    const lm = host.models(), base = { state: 'none', tierLabel: null, bytes: null, progress: 0, backend: null };
    if (!lm || lm.mode !== 'local') return base;
    const info = lm.prepareInfo?.() || {}, st = lm.state;
    const facts = { ...base, bytes: info.downloadBytes ?? null, tierLabel: info.tier === 'light' ? 'smaller' : info.tier === 'default' ? 'larger' : null, backend: lm.backend };
    if (lm.ready) facts.state = 'ready';
    else if (lm.supported === false && lm.canPrepare === false) facts.state = 'unavailable';
    else if (st?.load?.state === 'loading') facts.state = 'loading';
    else if (st?.busy === 'install' || lm.downloadRecovery?.pending) { facts.state = 'downloading'; const t = st?.transfer; facts.progress = t && t.bytesTotal ? Math.min(1, (t.bytesDone || 0) / t.bytesTotal) : 0; }
    else if (info.installed) facts.state = 'downloaded';
    return facts;
  }
  async function loadRouter() {
    routerPromise ||= (async () => {
      try {
        const [routerMod, embedderMod, content] = await Promise.all([import(host.moduleBase() + 'chat/roberta/intent-router.mjs'), import(host.moduleBase() + 'chat/embedding/embedder.mjs'), import(host.moduleBase() + 'chat/roberta/ivr-content.mjs')]);
        const vectors = await (await fetch(host.moduleBase() + 'chat/roberta/ivr-vectors.json')).json();
        const embedder = await host.sharedEmbedder();
        const router = routerMod.createIntentRouter({ vectors, embedder });
        embedder.ready().catch(() => {}); // the small search model loads in the background; until then words are matched by their text
        return router;
      } catch (err) { console.warn('Roberta is matching by keypad only:', err); return null; }
    })();
    return routerPromise;
  }
  const robertaApp = {
    ringMs: 1500,
    context: () => contentMod.describeContext({
      userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints || 0, online: navigator.onLine,
      standalone: Boolean(window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true),
      mode: host.models()?.mode, model: robertaModelFacts(), speechInput: speechInputOk, speechOutput: speechAvailable.synth,
      hasChats: host.threads().some(t => !t.temporary && t.messages.some(m => m.role === 'user'))
    }),
    speak: (text, rate = 1) => (host.speech() && speechAvailable.synth ? host.speech().speak(text, { voiceURI: prefs.voiceURI, rate: Math.min(2.5, rate * (prefs.speechRate || 1)), ...host.voiceOpts() }) : { done: Promise.resolve(), stop() {} }),
    canSpeak: () => speechAvailable.synth,
    getRouter: () => loadRouter(),
    warmUp: () => { loadRouter(); },
    listen: speechInputOk ? handlers => host.speech().startDictation(handlers) : null,
    explainListenFailure: code => host.explainSpeechInputFailure(code),
    get sounds() { return host.callSounds(); },
    layout: () => (window.matchMedia('(min-width: 900px)').matches && !host.isTouchDevice() ? 'desktop' : 'mobile'),
    actions: {
      startSetup() { host.startSetup(); },
      openShare() { host.loadTransferUi().then(ui => ui.openShare()); },
      openImport() { importInput.click(); },
      openExport() { host.loadTransferUi().then(ui => ui.openTransferChats()); },
      openTransferSettings() { host.loadTransferUi().then(ui => ui.openTransferSettings()); },
      openProvider() { host.models()?.setMode('api'); openProviderSettings(endpointInput); },
      startVoicemail() { host.startVoiceNote(); },
      startChatting() { messageInput.focus({ preventScroll: true }); }
    }
  };
  async function loadRoberta() {
    if (robertaApi) return robertaApi;
    const [, , roberta, content] = await Promise.all([host.loadSpeech(), host.loadCallSounds().catch(() => null), import(host.moduleBase() + 'chat/roberta/roberta-ui.mjs'), import(host.moduleBase() + 'chat/roberta/ivr-content.mjs')]);
    contentMod = content;
    await host.ensureCallSounds();
    robertaApi ||= roberta.createRoberta({ app: robertaApp });
    return robertaApi;
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && robertaApi?.callOpen && !document.querySelector('.app-dialog')) robertaApi.closeCall(); });
  return { loadRoberta, api: () => robertaApi };
}
