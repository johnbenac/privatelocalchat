// SPDX-License-Identifier: AGPL-3.0-only
// The browser's own text-to-speech (speechSynthesis): the voice that needs no download. It gives no audio samples and no phonemes, so a face cannot be
// animated from it; use kokoro-speaker.mjs for that. `win` is injected (default: the global scope).

/** Voices that run on the device first (they start faster and work offline), then any others. */
export function voices(win = globalThis) {
  const s = win.speechSynthesis; if (!s) return [];
  const all = s.getVoices();
  return [...all.filter((v) => v.localService), ...all.filter((v) => !v.localService)];
}
export function bestVoice(preferredURI, lang, win = globalThis) {
  lang = lang || win.navigator?.language || "en";
  const list = voices(win); if (!list.length) return null;
  const same = (v) => v.lang?.toLowerCase() === lang.toLowerCase(), close = (v) => v.lang?.toLowerCase().startsWith(lang.slice(0, 2).toLowerCase());
  const local = list.filter((v) => v.localService);
  return list.find((v) => v.voiceURI === preferredURI) || local.find(same) || local.find(close) || list.find(same) || list.find(close) || list[0];
}
/** Voices load asynchronously in several browsers. */
export function whenVoicesReady(timeoutMs = 1500, win = globalThis) {
  const s = win.speechSynthesis; if (!s) return Promise.resolve([]);
  if (s.getVoices().length) return Promise.resolve(s.getVoices());
  return new Promise((resolve) => { const done = () => { s.removeEventListener?.("voiceschanged", done); resolve(s.getVoices()); }; s.addEventListener?.("voiceschanged", done); setTimeout(done, timeoutMs); });
}
/** Sentence-sized pieces: long utterances stall in some engines. */
export function speechChunks(text, max = 220) {
  const out = [];
  for (const para of String(text).split(/\n+/)) {
    const sentences = para.match(/[^.!?。！？]+[.!?。！？]*\s*/g) || [para];
    let cur = "";
    for (const s of sentences) {
      if ((cur + s).length > max && cur) { out.push(cur.trim()); cur = ""; }
      if (s.length > max) { for (let i = 0; i < s.length; i += max) out.push(s.slice(i, i + max).trim()); } else cur += s;
    }
    if (cur.trim()) out.push(cur.trim());
  }
  return out.filter(Boolean);
}
/** Speak with the system voice -> { stop(), done: Promise }; `done` rejects with a readable Error when the browser has no voice. This is a speakOne for createVoiceSession. */
export function speakSystem(text, { voiceURI, rate = 1, onStart, onAudio, interrupt = true, win = globalThis } = {}) {
  const w = win, s = w.speechSynthesis;
  let stopped = false, began = false;
  const done = (async () => {
    if (!s || !w.SpeechSynthesisUtterance) throw new Error("This browser cannot read aloud.");
    await whenVoicesReady(1500, w);
    const voice = bestVoice(voiceURI, undefined, w);
    if (!voice) throw new Error("This browser has no voice installed for reading aloud.");
    if (interrupt) { s.cancel(); if (s.speaking || s.pending) await new Promise((r) => setTimeout(r, 60)); } // Safari drops an utterance spoken in the same moment as a cancel
    try { if (s.paused) s.resume(); } catch { /* not paused */ } // a synth left paused (after a call, or by the system) otherwise swallows everything
    onStart?.();
    for (const piece of speechChunks(text)) {
      if (stopped) return;
      await new Promise((resolve) => {
        const u = new w.SpeechSynthesisUtterance(piece); u.voice = voice; u.lang = voice.lang; u.rate = rate;
        u.onstart = () => { if (!began) { began = true; onAudio?.(); } };
        u.onend = resolve; u.onerror = resolve; s.speak(u);
      });
    }
  })();
  return { done, stop() { stopped = true; try { s?.cancel(); } catch { /* idle */ } } };
}
