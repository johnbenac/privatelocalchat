// SPDX-License-Identifier: AGPL-3.0-only
// The browser's own speech recognition (Web Speech API), wrapped. On an iPhone that is Apple's, in Chrome Google's; the page cannot control where the audio goes.
// `win` is injected (default: the global scope) so a fake browser can drive it in tests.

export const speechSupport = (win = globalThis) => ({
  synth: Boolean(win.speechSynthesis && win.SpeechSynthesisUtterance),
  recognition: Boolean(win.SpeechRecognition || win.webkitSpeechRecognition)
});

export const dictationMessage = (code) => ({
  "not-allowed": "This browser did not allow speech recognition. Check that the microphone is allowed for this site in your browser or system settings.",
  "service-not-allowed": "Speech recognition is turned off for this browser. Turn on dictation (on iPhone: Settings > General > Keyboard > Enable Dictation) and try again.",
  "audio-capture": "No microphone was found.",
  network: "Dictation needs a connection in this browser right now."
}[code] || `Dictation stopped (${code || "unknown error"}).`);

/** Ask the browser for the microphone directly, to tell "you blocked it" from "this browser gives websites no speech-to-text". Nothing is recorded. */
export async function probeMicrophone(win = globalThis) {
  const md = win.navigator?.mediaDevices;
  if (!md?.getUserMedia) return { state: "unsupported" };
  try { const stream = await md.getUserMedia({ audio: true }); stream.getTracks().forEach((t) => t.stop()); return { state: "granted" }; }
  catch (e) { return { state: e?.name === "NotAllowedError" || e?.name === "SecurityError" ? "denied" : e?.name === "NotFoundError" ? "none" : "error", name: e?.name }; }
}

/**
 * Start dictation. onText({ final, interim }) fires as words arrive. Returns { stop(), abort() }: stop() lets pending words arrive; abort() drops
 * everything still in flight (recognisers deliver late results after stop(), and those words must never reach the next message).
 * Call it directly from a tap: WebKit only shows the microphone prompt for a recognition started inside a user gesture.
 */
export function startDictation({ lang, onText, onEnd, onError, win = globalThis }) {
  const SR = win.SpeechRecognition || win.webkitSpeechRecognition;
  const rec = new SR();
  let dead = false;
  rec.lang = lang || win.navigator?.language || "en-US"; rec.continuous = true; rec.interimResults = true;
  rec.onresult = (e) => {
    if (dead) return;
    let fin = "", interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) { const r = e.results[i]; (r.isFinal ? (fin += r[0].transcript) : (interim += r[0].transcript)); }
    onText?.({ final: fin, interim });
  };
  rec.onerror = (e) => { if (dead) return; if (e.error !== "no-speech" && e.error !== "aborted") onError?.(Object.assign(new Error(dictationMessage(e.error)), { code: e.error })); };
  rec.onend = () => { if (!dead) onEnd?.(); };
  try { rec.start(); } catch (err) { onError?.(err); }
  return { stop() { try { rec.stop(); } catch { /* not running */ } }, abort() { dead = true; rec.onresult = rec.onerror = rec.onend = null; try { rec.abort(); } catch { try { rec.stop(); } catch { /* not running */ } } } };
}
