// Long-form voice messages. The browser's speech recognition listens (restarting itself when the browser ends a session, which browsers do
// after a pause) and the words are kept; the AUDIO is never recorded or stored. A message is the transcript plus how long it took to say.
//
//   const rec = createVoiceRecorder({ listen, onChange });   listen(handlers) -> { abort() }   (chat/voice/speech.mjs startDictation)
//   rec.start();  ...  const { text, seconds } = rec.stop();   or rec.cancel()

export function createVoiceRecorder({ listen, onChange = () => {}, now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout, maxSeconds = 1800, restartMs = 200 }) {
  let state = "idle", committed = "", interim = "", startedAt = 0, rec = null, tick = null, restart = null, error = null, quickRestarts = 0, lastOpen = 0;
  const seconds = () => (state === "idle" ? 0 : Math.floor((now() - startedAt) / 1000));
  const text = () => (committed + (interim ? (committed && !/\s$/.test(committed) ? " " : "") + interim : "")).replace(/\s+/g, " ").trim();
  const emit = () => onChange({ state, seconds: seconds(), text: text(), error });
  const closeRecogniser = () => { clearTimer(restart); restart = null; const r = rec; rec = null; try { r?.abort(); } catch { /* not running */ } };
  const stopTimers = () => { clearTimer(tick); tick = null; };

  function open() {
    if (state !== "recording") return;
    lastOpen = now();
    rec = listen({
      onText: ({ final, interim: live }) => {
        if (state !== "recording") return;
        if (final) { committed += (committed && !/\s$/.test(committed) ? " " : "") + final.trim(); }
        interim = live || "";
        emit();
      },
      onEnd: () => {
        if (state !== "recording") return;
        interim = "";
        // the browser ended the session (a pause): carry on, unless it keeps ending at once, which means it cannot continue
        quickRestarts = now() - lastOpen < 1500 ? quickRestarts + 1 : 0;
        if (quickRestarts > 4) return finish("The microphone stopped listening. What was heard is kept.", true);
        rec = null; clearTimer(restart); restart = setTimer(open, restartMs);
      },
      onError: (e) => {
        if (state !== "recording") return;
        const fatal = ["not-allowed", "service-not-allowed", "audio-capture"].includes(e?.code);
        if (fatal) { finish(e.message || "The microphone is not available.", false, e.code); return; }
        if (e?.code === "network") { finish("Speech recognition needs a connection in this browser. What was heard is kept.", true, e.code); }
      }
    });
  }
  function finish(message, keep = true, code) { error = { message, code: code || null, keep }; closeRecogniser(); stopTimers(); state = "stopped"; emit(); }
  function schedule() { clearTimer(tick); tick = setTimer(() => { if (state !== "recording") return; if (seconds() >= maxSeconds) return finish("That's the longest a voice note can be. What was heard is kept.", true); emit(); schedule(); }, 1000); }

  return {
    get state() { return state; },
    start() { if (state === "recording") return; committed = ""; interim = ""; error = null; quickRestarts = 0; startedAt = now(); state = "recording"; open(); schedule(); emit(); },
    /** Ends the recording and returns what was said. */
    stop() { const out = { text: text(), seconds: Math.max(1, seconds()), error }; closeRecogniser(); stopTimers(); if (state === "recording") state = "stopped"; emit(); return out; },
    cancel() { closeRecogniser(); stopTimers(); committed = interim = ""; state = "idle"; error = null; emit(); },
    get text() { return text(); },
    get seconds() { return seconds(); }
  };
}
