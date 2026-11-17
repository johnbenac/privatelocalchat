// Model services: the three things that put a model in memory, created once for the page.
//   memoryManager()   runtime/memory-manager.mjs: one place that knows what is loaded; the chat model registers here
//   sharedEmbedder()  the small matching model used by Roberta and by search (one instance, a resident of the manager)
//   loadVoiceChoice() chat/voice/voice-choice.mjs: the system voice or a downloaded one; registers as a resident and offers "One model at a time" after a failure
//   voiceOpts()       engine options for anything that speaks: the chosen voice, or nothing for the system voice
// createModelServices({ moduleBase, isGenerating, testVoiceHook }): moduleBase() is where the app's modules live, isGenerating() says whether a reply is being
// written (so a swap message does not hide the reply's status line), testVoiceHook() returns a stand-in voice factory in development builds and null otherwise.

export function createModelServices({ moduleBase, isGenerating = () => false, testVoiceHook = null }) {
  // The voice choice (chat/voice/voice-choice.mjs): the system voice or a downloaded one, picked from the voice pill. Development builds also honour a test hook (see the markers below).
  // Model memory (runtime/memory-manager.mjs): one logical place that knows what is in memory. With "One model at a time" on (Settings > Models) using a model first
  // unloads the others; with it off nothing is unloaded for another model and the app tries whatever is asked. Each model kind registers itself.
  let memoryPromise = null, sharedEmbedderPromise = null;
  const memoryManager = () => (memoryPromise ||= import(moduleBase() + 'runtime/memory-manager.mjs').then(async mod => {
    const m = mod.createMemoryManager({});
    const sync = s => { window.plcOneAtATime = s.policy === 'one-at-a-time'; };
    m.subscribe(sync); sync(m.snapshot());
    // what the swap is doing, in words, on the status line (never an unexplained pause)
    let lastText = '';
    m.subscribe(snap => {
      const g = document.getElementById('generationStatus'); if (!g) return;
      if (snap.activity) { lastText = snap.activity.text; g.hidden = false; g.textContent = lastText; }
      else if (lastText) { if (g.textContent === lastText) { g.textContent = ''; if (!isGenerating()) g.hidden = true; } lastText = ''; }
    });
    const registerChat = () => {
      const lm = window.localModels; if (!lm) return false;
      const tierInfo = () => lm.state?.tiers?.[lm.state.selection.tier]?.info;
      m.register({ id: 'chat-llm', kind: 'chat', label: () => 'the chat model' + (tierInfo()?.modelId ? ' ' + tierInfo().modelId : ''),
        state: () => { const st = lm.state?.load?.state; return st === 'ready' ? 'loaded' : st === 'loading' ? 'loading' : st === 'unloading' ? 'unloading' : st === 'faulted' ? 'faulted' : 'unloaded'; },
        isBusy: () => lm.generating || lm.state?.load?.state === 'loading', estimateBytes: () => tierInfo()?.memory?.steadyBytes ?? null,
        unload: () => lm.unloadForMemory() });
      window.addEventListener('local-model-state', () => m.notify());
      return true;
    };
    if (!registerChat()) { const once = () => { if (registerChat()) window.removeEventListener('local-model-state', once); }; window.addEventListener('local-model-state', once); }
    // the offer to turn on "One model at a time" after a model fails; it never turns it on by itself
    await import(moduleBase() + 'chat/models/memory-offer.mjs').then(om => {
      const o = om.createMemoryOffer({ memory: m }); m.offerFailure = (kind, what) => o.offer(kind, what);
      let lastErr = null;
      // only a failure of the model itself (loading it, or writing a reply) counts: a storage check that failed at start-up is not the chat model failing
      window.addEventListener('local-model-state', () => { const e = window.localModels?.state?.load?.lastError; if (e && e !== lastErr && ['out-of-memory', 'load-failed'].includes(e.class)) { lastErr = e; o.offer('chat', 'the chat model'); } });
    }).catch(() => {});
    return m;
  }));
  // One matching/embedding model for the page (Roberta and the search overlay used to start one each); it is a resident of the memory manager like any other model.
  const sharedEmbedder = () => (sharedEmbedderPromise ||= import(moduleBase() + 'chat/embedding/embedder.mjs').then(async mod => {
    const e = mod.createEmbedder({}), m = await memoryManager();
    m.register({ id: 'matching', kind: 'embedding', label: 'the embedding model', state: () => ({ loading: 'loading', ready: 'loaded' }[e.state] || 'unloaded'), isBusy: () => e.state === 'loading', estimateBytes: () => null, unload: async () => e.terminate() });
    e.onState(() => m.notify());
    // using the embedding model asks the memory manager for the device like any other model (with "One model at a time" on, the others unload first)
    for (const name of ['ready', 'embedQuery', 'embedDocuments']) {
      const inner = e[name].bind(e);
      e[name] = async (...args) => { const lease = await m.acquire('matching'); try { return await inner(...args); } finally { lease.release(); } };
    }
    return e;
  }));
  let voiceChoicePromise = null, voiceCtl = null;
  const loadVoiceChoice = () => (voiceChoicePromise ||= (async () => {
    const mod = await import(moduleBase() + 'chat/voice/voice-choice.mjs');
    const hook = testVoiceHook?.() || null; // development builds only: a test page may stand in for the voice engines (the page decides, see index.html)
    const env = async () => {
      let webgpu = { available: false };
      try { const a = await navigator.gpu?.requestAdapter(); if (a) webgpu = { available: true, isFallbackAdapter: Boolean(a.isFallbackAdapter) }; } catch { /* no WebGPU */ }
      return { deviceMemoryGB: navigator.deviceMemory, cores: navigator.hardwareConcurrency, webgpu };
    };
    const factory = hook || (async id => {
      if (id !== 'kitten' && id !== 'kokoro') throw new Error('No engine for ' + id);
      const kokoro = id === 'kokoro';
      const [eng, man] = await Promise.all([import(moduleBase() + 'chat/voice/voice-engine.mjs'), import(moduleBase() + (kokoro ? 'chat/voice/voice-manifest-kokoro.mjs' : 'chat/voice/voice-manifest.mjs'))]);
      return eng.createVoiceEngine({ engine: id, baseUrl: kokoro ? man.KOKORO_Q8_BASE_URL : man.KITTEN_NANO_BASE_URL, workerUrl: moduleBase() + (kokoro ? 'chat/vendor/voice/worker-kokoro.js' : 'chat/vendor/voice/worker.js') });
    });
    const mm = await memoryManager();
    const ctl = mod.createVoiceChoice({ factory, env, acquireMemory: () => mm.acquire('voice'), ...(hook?.inputs || {}) });
    await ctl.init();
    mm.register({ id: 'voice', kind: 'voice', label: () => ctl.memoryState().label, state: () => ctl.memoryState().state, isBusy: () => ctl.memoryState().busy, estimateBytes: () => ctl.memoryState().estimateBytes, unload: () => ctl.release('memory') });
    ctl.subscribe(() => mm.notify());
    let lastNotice = 0;
    const offerOnFailure = snap => { const n = snap.notice; if (n && n.kind === 'error' && n.memory && !n.stale && n.at !== lastNotice) { lastNotice = n.at; mm.offerFailure?.('voice', ctl.memoryState().label); } };
    ctl.subscribe(offerOnFailure); setTimeout(() => offerOnFailure(ctl.snapshot()), 0); // a failure found at start (the page was killed last time) is offered too
    voiceCtl = ctl;
    return ctl;
  })().catch(() => null));
  // Engine options for anything that speaks (read aloud, voice calls, Roberta): the chosen voice, or nothing for the system voice. A single sentence has no lead-in.
  const voiceOpts = () => { const r = voiceCtl?.route(); return r ? { engine: r.engine, ...r.options, startDelayMs: 0 } : {}; };
  return { memoryManager, sharedEmbedder, loadVoiceChoice, voiceOpts, get voiceCtl() { return voiceCtl; } };
}
