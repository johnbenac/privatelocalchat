// Speech through the browser's own services: on an iPhone that is Apple's, in Chrome it is Google's, elsewhere whatever the
// browser provides. Where the browser offers no speech recognition or voices, the matching buttons are simply not shown.

import { createGaplessPlayer } from "./voice-player.mjs";

// The recognition and the system voice are the shared package voice-loop (runtime/voice-loop, read-only: see docs/VOICE-LOOP.md); only the downloaded-voice route below is PLC's.
import { speakSystem } from "../../runtime/voice-loop/browser-voice.mjs";
export { speechSupport, dictationMessage, probeMicrophone, startDictation } from "../../runtime/voice-loop/recognition.mjs";
export { voices, bestVoice, whenVoicesReady, speechChunks } from "../../runtime/voice-loop/browser-voice.mjs";

/**
 * Optional route to a downloaded voice engine (chat/voice/voice-choice.mjs hands one over while a downloaded voice is selected):
 *   engine = { speak(text, { onChunk, signal, speed }) -> Promise, fail(error) }
 * Chunks play gaplessly. If the engine throws, or produces nothing for `stallMs` (a stalled engine, like the stalled-reply watch in the
 * call screen), engine.fail(error) is told and the same text is read by the system voice instead, unless audio already started.
 */
function speakViaEngine(text, opts) {
  const { engine, rate = 1, onStart, onAudio, stallMs = (n) => 20000 + n * 150, betweenMs = 75000, firstChunkMs = 90000, startDelayMs = 0, createContext, ...rest } = opts;
  const ac = new AbortController(), player = createGaplessPlayer({ createContext, hold: startDelayMs > 0 });
  let stopped = false, fallback = null, timer = null, releaseTimer = null, got = false, announced = false;
  const announce = () => { if (!announced) { announced = true; onAudio?.(); } }; // sound is really coming out now (not just being made)
  const stop = () => { stopped = true; clearTimeout(timer); clearTimeout(releaseTimer); ac.abort(); player.stop(); fallback?.stop(); };
  const done = (async () => {
    let stalled = null;
    const arm = (ms) => { clearTimeout(timer); timer = setTimeout(() => { stalled = new Error("The downloaded voice stopped responding."); ac.abort(); try { engine.terminate?.(); } catch { /* the worker is already gone */ } }, ms); };
    try {
      arm(Math.min(stallMs(String(text).length), firstChunkMs)); onStart?.();
      if (startDelayMs > 0) releaseTimer = setTimeout(() => { player.release(); if (got) announce(); }, startDelayMs); // buffer ahead, then play gaplessly
      await engine.speak(text, { speed: rate, signal: ac.signal, onChunk: (samples, sampleRate) => { if (stopped) return; got = true; arm(betweenMs); player.push(samples, sampleRate); if (startDelayMs <= 0) announce(); } });
      clearTimeout(timer); clearTimeout(releaseTimer);
      if (stalled) throw stalled;
      if (got) announce();
      await player.finish();
    } catch (err) {
      clearTimeout(timer); clearTimeout(releaseTimer);
      if (stopped) return;
      const failure = stalled || err;
      player.stop();
      try { engine.fail?.(failure); } catch { /* the caller's bookkeeping must not break reading */ }
      if (got && player.started) return; // part of the reply was already heard; the system voice takes over from the next one
      fallback = speak(text, { ...rest, rate, onAudio, engine: null, interrupt: true });
      await fallback.done;
    }
  })();
  return { done, stop };
}

/** -> { stop(), done: Promise } ; `done` rejects with a readable Error when the browser has no voice. */
export function speak(text, { voiceURI, rate = 1, onStart, onAudio, interrupt = true, engine = null, ...engineOpts } = {}) {
  if (engine) return speakViaEngine(text, { engine, voiceURI, rate, onStart, onAudio, interrupt, ...engineOpts });
  return speakSystem(text, { voiceURI, rate, onStart, onAudio, interrupt });
}
