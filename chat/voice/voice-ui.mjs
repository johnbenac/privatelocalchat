// The voice features around the composer, in one place: the browser's speech services (is there speech output, is there speech input), reading an answer aloud
// (the Listen button), dictation into the message box, the Dictate and Voice call buttons, and voice notes (play any reply like a voice message; record a long message
// as a note). The voice call screen itself is chat/call/call.mjs and the voice choice is chat/models/services.mjs; this file hands the call what it needs
// (loadSpeech, loadVoice, endDictation, stopSpeaking, the voice button). createVoiceUi(host) returns { speechAvailable, speechInputOk, noteSupport, loadSpeech, loadVoice,
// speech(), stopSpeaking, speakText, explainSpeechInputFailure, endDictation, micButton(), voiceButton(), recordAvailable(), startVoiceNote, toggleVoiceNote,
// mountMessageVoiceNote, loadNoteModules, recorderOpen }.
//
// host: el, events, icons() (the icon set, once it has loaded), createEmoji, actionButton, messageDecorators, messageActionHandlers, messageForm, messageInput, composerTools, moduleBase(), prefs(), savePrefs(),
//       saveThreads, scheduleDraftSave, showToast, growComposer, updateSendButtonDisabled(), currentThread(), renderMessages(thread, opts), nodeFor(id), sendMessage(),
//       isCallActive(), isTouchDevice(), loadDocModules(), loadVoiceChoice(), voiceRoute(), voiceOpts(), loadCallSounds(), robotName, clockText(seconds)
import { siteLinks } from '../site/site-links.mjs';

export function createVoiceUi(host) {
  const { el, events, createEmoji, actionButton, messageDecorators, messageActionHandlers, messageForm, messageInput, saveThreads, scheduleDraftSave, showToast, growComposer } = host;
  let loadedDocExports = null;   // the text cleaner (markdown out) once the documents code has loaded
  // ---- dictation and voice conversation -------------------------------------------------------------------------
  // Both use the browser's own speech recognition and voices (Apple's on an iPhone). A control the browser cannot support is not shown.
  const speechAvailable = {
    synth: Boolean(window.speechSynthesis && window.SpeechSynthesisUtterance),
    recognition: Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
  };
  const noteSupport = speechAvailable.synth;   // voice notes need the browser's text-to-speech
  // Speech input is never hidden because of an earlier failure: a failure shows its message and the buttons stay. (An older version hid them for
  // days after one refusal; that stored flag is removed here so nobody stays locked out by it.)
  try { localStorage.removeItem('plc.speechInputUnusable'); } catch { /* private mode */ }
  const speechInputOk = speechAvailable.recognition;
  let speechMod = null, voiceMod = null;
  const loadSpeech = async () => (speechMod ||= await import(host.moduleBase() + 'chat/voice/speech.mjs'));
  const loadVoice = async () => (voiceMod ||= await import(host.moduleBase() + 'chat/voice/voice.mjs'));
  let speaking = null;
  const setListenButton = (btn, on) => { btn.setAttribute('aria-pressed', String(on)); host.icons().setIconLabel(btn, on ? '⏹ Stop' : '🔊 Listen'); };
  function stopSpeaking() { if (speaking) { speaking.handle.stop(); speaking = null; document.querySelectorAll('[data-action="speak"][aria-pressed="true"]').forEach(b => setListenButton(b, false)); } }
  async function speakText(text, onDone) {
    const sp = await loadSpeech();
    stopSpeaking();
    const { stripMarkdown } = (await host.loadDocModules()).exports;
    await host.loadVoiceChoice();
    const route = host.voiceRoute();
    const handle = sp.speak(stripMarkdown(text), { voiceURI: host.prefs().voiceURI, rate: host.prefs().speechRate || 1, ...(route ? { engine: route.engine, ...route.options } : {}) });
    speaking = { handle };
    try { await handle.done; } catch (err) { showToast(err.message, 8000, speechHelpAction); } finally { if (speaking?.handle === handle) speaking = null; onDone?.(); }
  }
  if (speechAvailable.synth) {
    messageDecorators.push((thread, msg, index, ctx, actions) => {
      if (msg.role !== 'assistant' || !msg.content || ctx.streaming) return;
      actions.appendChild(actionButton('speak', '🔊 Listen', 'Read this answer aloud'));
      actions.appendChild(actionButton('voice-note', msg.voiceNote ? '📄 Show as text' : '🎙️ Voice note', msg.voiceNote ? 'Show this reply as text again' : 'Turn this reply into a voice note you can play'));
    });
    messageActionHandlers['voice-note'] = async (thread, msg) => {
      await loadNoteModules();
      msg.voiceNote = !msg.voiceNote;
      saveThreads(); host.renderMessages(thread, { keepScroll: true });
      if (msg.voiceNote) host.nodeFor(msg.id)?.querySelector('.vn-play')?.click(); // turning a reply into a note plays it
    };
    messageActionHandlers['speak'] = async (thread, msg, btn) => {
      if (btn.getAttribute('aria-pressed') === 'true') { stopSpeaking(); return; }
      stopSpeaking(); setListenButton(btn, true);
      await speakText(msg.content, () => { if (btn.isConnected) setListenButton(btn, false); });
    };
    events.on('thread:selected', () => stopSpeaking());
  }

  const toolButton = (id, icon, label) => {
    const b = el('button', 'tool-btn'); b.type = 'button'; b.id = id; b.title = label; b.setAttribute('aria-label', label); b.setAttribute('aria-pressed', 'false');
    b.appendChild(createEmoji(icon === 'mic' ? '🎙️' : icon === 'phone' ? '📞' : icon === 'waveform' ? '🎚️' : '🎧')); return b;
  };
  let recordAvailable = false;
  let micBtn = speechInputOk ? toolButton('micBtn', 'mic', 'Dictate') : null;
  let voiceBtn = speechInputOk && speechAvailable.synth ? toolButton('voiceModeBtn', 'phone', 'Voice call') : null;
  [micBtn, voiceBtn].forEach(b => b && host.composerTools.append(b));
  const setPressed = (btn, on) => btn?.setAttribute('aria-pressed', String(on));
  const hideSpeechInput = () => { micBtn?.remove(); voiceBtn?.remove(); micBtn = voiceBtn = null; recordAvailable = false; };
  // WebKit only shows the microphone prompt for a recognition that starts inside the tap, so the code it needs is loaded up front.
  if (speechInputOk) { loadSpeech().catch(() => hideSpeechInput()); if (voiceBtn) { voiceBtn.classList.add('call-start'); voiceBtn.title = 'Start a voice call'; loadVoice().catch(() => {}); host.loadCallSounds().catch(() => {}); } }

  // Why speech recognition could not start, in words that say what to do. A blocked microphone is the person's to allow;
  // a browser that exposes speech recognition but never lets sites use it is not, so the controls go away.
  let speechFailures = 0;
  // a Get help button on the speech messages, only when this copy has a Help page (chat/site/site-links.mjs)
  const speechHelpAction = siteLinks().has('help') ? { label: 'Get help', run: () => window.open(siteLinks().href('help', 'speech-availability'), '_blank', 'noopener') } : undefined;
  async function explainSpeechInputFailure(code) {
    const sp = await loadSpeech();
    if (code === 'audio-capture' || code === 'network') return sp.dictationMessage(code);
    if (code !== 'not-allowed' && code !== 'service-not-allowed') return sp.dictationMessage(code);
    const probe = await sp.probeMicrophone();
    if (probe.state === 'denied') return 'The microphone is blocked for this site. Allow it in your browser’s site settings (in Safari: the aA menu, then Website Settings, then Microphone) and try again.';
    if (probe.state === 'none') return sp.dictationMessage('audio-capture');
    speechFailures++;
    if (probe.state === 'granted' && speechFailures === 1) return 'The microphone is allowed now. Tap again to start.';
    return 'This browser did not let the page use speech recognition just now. Check that Dictation is on and the microphone is allowed for this site (iPhone: Settings > General > Keyboard > Enable Dictation; in Safari: the aA menu, then Website Settings, then Microphone), then tap again. Safari and Chrome support it.';
  }

  // dictation: words go into the composer while the microphone is on
  let dictation = null; // { handle, committed, shown }
  function endDictation({ abort = false } = {}) {
    const d = dictation; dictation = null; setPressed(micBtn, false);
    if (!d) return;
    if (abort) d.handle?.abort(); else d.handle?.stop();
  }
  const writeDictation = (d, value) => { d.shown = value; messageInput.value = value; growComposer(); host.updateSendButtonDisabled(); scheduleDraftSave(); };
  function beginDictation() {
    if (host.isCallActive()) return;
    const sp = speechMod;
    if (!sp) { loadSpeech().then(beginDictation, () => hideSpeechInput()); return; }
    const d = dictation = { handle: null, committed: messageInput.value ? messageInput.value.replace(/\s*$/, ' ') : '', shown: messageInput.value };
    setPressed(micBtn, true);
    if (!host.isTouchDevice()) messageInput.focus();
    d.handle = sp.startDictation({
      onText: ({ final, interim }) => { if (dictation !== d) return; if (final) d.committed += final.trim() + ' '; writeDictation(d, d.committed + interim); },
      onEnd: () => { if (dictation !== d) return; if (messageInput.value === d.shown) writeDictation(d, d.committed.trimEnd()); endDictation(); },
      onError: err => { if (dictation !== d) return; endDictation({ abort: true }); explainSpeechInputFailure(err.code).then(m => showToast(m, 9000, speechHelpAction)).catch(() => showToast(err.message, 9000, speechHelpAction)); }
    });
  }
  micBtn?.addEventListener('click', () => { if (dictation) endDictation(); else beginDictation(); });
  // typing while dictating is the person's edit: later words are added after it, never over it
  messageInput.addEventListener('input', () => { if (dictation && messageInput.value !== dictation.shown) { dictation.committed = messageInput.value.replace(/\s*$/, ' '); dictation.shown = messageInput.value; } });
  // sending (or leaving the conversation) ends the microphone for good: a recogniser keeps delivering late words after it is stopped
  events.on('send:before', () => endDictation({ abort: true }));
  events.on('thread:selected', () => endDictation({ abort: true }));

  // ---- voice notes: any reply can be played like a voice message; long messages can be recorded as notes ------------------------
  // The sound is the browser's own text-to-speech, one sentence at a time (chat/voice/voice-note.mjs). Nothing is recorded as audio:
  // a note you record is kept as its transcript.
  let voiceNoteMod = null, voiceRecorderMod = null;
  const loadNoteModules = async () => {
    await Promise.all([loadSpeech(), voiceNoteMod ? null : import(host.moduleBase() + 'chat/voice/voice-note.mjs').then(m => { voiceNoteMod = m; }), host.loadDocModules().then(m => { loadedDocExports = m.exports; }).catch(() => {})]);
  };
  if (noteSupport) loadNoteModules().catch(() => {});
  function mountMessageVoiceNote(div, body, msg) {
    if (!voiceNoteMod || !speechMod) { loadNoteModules().then(() => { const t = host.currentThread(); if (t) host.renderMessages(t, { keepScroll: true }); }).catch(() => {}); return; }
    div.classList.add('voice-note-message');
    const holder = el('div', 'voice-note-holder'); div.appendChild(holder);
    const plain = loadedDocExports?.stripMarkdown ? loadedDocExports.stripMarkdown(msg.content) : msg.content;
    voiceNoteMod.mountVoiceNote(holder, {
      text: plain, from: host.robotName, id: msg.id, transcript: body, rate: host.prefs().noteRate || 1,
      onRate: r => { host.prefs().noteRate = r; host.savePrefs(); },
      onPlay: () => stopSpeaking(),
      speakOne: (t, r) => speechMod.speak(t, { voiceURI: host.prefs().voiceURI, rate: Math.min(2.5, r * (host.prefs().speechRate || 1)), ...host.voiceOpts() })
    });
  }
  // the other audio features stop a playing note
  const stopNotes = () => voiceNoteMod?.stopOtherNotes(null);
  messageActionHandlers['speak'] = ((inner) => (...args) => { stopNotes(); return inner(...args); })(messageActionHandlers['speak'] || (() => {}));

  // recording a voice note (also behind "leave a voice message" in Roberta's menu)
  let recorder = null, recorderUi = null, pendingVoice = null;
  recordAvailable = Boolean(speechInputOk);
  function buildRecorderUi() {
    const root = el('section', 'vn-recorder'); root.id = 'voiceRecorder'; root.hidden = true; root.setAttribute('role', 'group'); root.setAttribute('aria-label', 'Voice note');
    const top = el('div', 'vnr-top'); const dot = el('span', 'vnr-dot'); dot.setAttribute('aria-hidden', 'true');
    const label = el('span', 'vnr-label', 'Recording'); const timer = el('span', 'vnr-timer', '0:00'); timer.id = 'vnrTimer'; timer.setAttribute('role', 'timer'); timer.setAttribute('aria-live', 'off');
    top.append(dot, label, timer);
    const live = el('p', 'vnr-text'); live.id = 'vnrText'; live.setAttribute('aria-live', 'off');
    const edit = el('textarea', 'vnr-edit'); edit.id = 'vnrEdit'; edit.rows = 5; edit.hidden = true; edit.setAttribute('aria-label', 'What was heard. You can correct it before sending.');
    const note = el('p', 'hint-text', 'Only your words are kept, not the audio. They are written down by your browser’s speech recognition, which may send audio to its speech service.');
    const err = el('p', 'vnr-error'); err.id = 'vnrError'; err.setAttribute('role', 'alert');
    const cancel = el('button', 'secondary', 'Cancel'); cancel.type = 'button'; cancel.id = 'vnrCancel';
    const stop = el('button', 'primary', 'Stop'); stop.type = 'button'; stop.id = 'vnrStop';
    const send = el('button', 'primary', 'Send voice note'); send.type = 'button'; send.id = 'vnrSend'; send.hidden = true;
    const row = el('div', 'vnr-actions'); row.append(cancel, stop, send);
    root.append(top, live, edit, note, err, row);
    messageForm.parentNode.insertBefore(root, messageForm);
    cancel.addEventListener('click', () => closeRecorder());
    stop.addEventListener('click', () => reviewRecording());
    send.addEventListener('click', () => sendRecording());
    root.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); closeRecorder(); } });
    return { root, label, timer, live, edit, err, cancel, stop, send, dot };
  }
  const recorderOpen = () => Boolean(recorderUi && !recorderUi.root.hidden);
  function renderRecorder(s) {
    const ui = recorderUi; if (!ui) return;
    ui.timer.textContent = host.clockText(s.seconds);
    if (!ui.edit.hidden) return;
    ui.live.textContent = s.text || 'Listening… start talking.';
    ui.live.scrollTop = ui.live.scrollHeight;
    if (s.state === 'stopped' && s.error) { ui.err.textContent = s.error.message; if (s.error.keep === false || !s.text) { explainSpeechInputFailure(s.error.code).then(m => { ui.err.textContent = m; }).catch(() => {}); } else reviewRecording(); }
  }
  async function startVoiceNote() {
    if (host.isCallActive() || recorderOpen()) return;
    endDictation({ abort: true }); stopSpeaking(); stopNotes();
    if (!speechMod || !voiceRecorderMod) await Promise.all([loadSpeech(), import(host.moduleBase() + 'chat/voice/voice-recorder.mjs').then(m => { voiceRecorderMod = m; })]);
    recorderUi ||= buildRecorderUi();
    const ui = recorderUi;
    ui.root.hidden = false; document.body.classList.add('voice-on'); ui.edit.hidden = true; ui.edit.value = ''; ui.err.textContent = ''; ui.live.hidden = false;
    ui.label.textContent = 'Recording'; ui.root.dataset.state = 'recording'; ui.stop.hidden = false; ui.send.hidden = true;
    recorder = voiceRecorderMod.createVoiceRecorder({ listen: handlers => speechMod.startDictation(handlers), onChange: renderRecorder });
    recorder.start(); ui.stop.focus({ preventScroll: true });
  }
  function reviewRecording() {
    const ui = recorderUi; if (!ui || !recorder) return;
    const out = recorder.stop();
    ui.edit.hidden = false; ui.live.hidden = true; ui.edit.value = out.text; ui.root.dataset.state = 'review'; ui.label.textContent = 'Review';
    ui.stop.hidden = true; ui.send.hidden = false; ui.timer.textContent = host.clockText(out.seconds); ui.root.dataset.seconds = String(out.seconds);
    ui.err.textContent = out.text ? (out.error ? out.error.message : '') : 'Nothing was heard. Try again, or cancel.';
    ui.cancel.textContent = out.text ? 'Discard' : 'Close';
    ui.send.hidden = !out.text; (out.text ? ui.edit : ui.cancel).focus({ preventScroll: true });
  }
  function closeRecorder() {
    recorder?.cancel(); recorder = null;
    if (recorderUi) { recorderUi.root.hidden = true; recorderUi.cancel.textContent = 'Cancel'; }
    if (!host.isCallActive()) document.body.classList.remove('voice-on');
    messageInput.focus({ preventScroll: true });
  }
  async function sendRecording() {
    const ui = recorderUi; if (!ui) return;
    const text = ui.edit.value.trim(); if (!text) return;
    pendingVoice = { seconds: Number(ui.root.dataset.seconds) || 1 };
    closeRecorder();
    messageInput.value = text; growComposer();
    await host.sendMessage();
  }
  events.on('prompt:ready', message => { if (pendingVoice) { message.voice = pendingVoice; pendingVoice = null; } });
  const toggleVoiceNote = () => { if (!recordAvailable) return; if (recorderOpen()) closeRecorder(); else startVoiceNote(); };

  return {
    speechAvailable, speechInputOk, noteSupport, loadSpeech, loadVoice, speech: () => speechMod, stopSpeaking, speakText, explainSpeechInputFailure, endDictation,
    micButton: () => micBtn, voiceButton: () => voiceBtn, recordAvailable: () => recordAvailable, startVoiceNote, toggleVoiceNote, mountMessageVoiceNote, loadNoteModules, recorderOpen
  };
}
