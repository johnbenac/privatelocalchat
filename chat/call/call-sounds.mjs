// The small sounds that make a voice call feel like a call: a ringback while it connects, a blip when it picks up and a two-note
// hang-up tone. They are synthesised with the Web Audio API (no files, no network), kept quiet, and skipped when the person turned
// them off or the browser has no audio context. Create the audio context inside the tap that starts the call.

// rows 697 770 852 941 Hz, columns 1209 1336 1477 Hz
const DTMF = Object.freeze({ 1: [697, 1209], 2: [697, 1336], 3: [697, 1477], 4: [770, 1209], 5: [770, 1336], 6: [770, 1477], 7: [852, 1209], 8: [852, 1336], 9: [852, 1477], "*": [941, 1209], 0: [941, 1336], "#": [941, 1477] });

export function createCallSounds({ createContext = () => { const C = globalThis.AudioContext || globalThis.webkitAudioContext; return C ? new C() : null; }, enabled = () => true } = {}) {
  let ctx = null;
  const context = () => { if (ctx) return ctx; try { ctx = createContext(); } catch { ctx = null; } return ctx; };
  // one steady tone (several frequencies at once make a chord) with short fades so it never clicks
  function tone(c, freqs, startOffset, seconds, level = 0.05) {
    const t0 = c.currentTime + startOffset, gain = c.createGain();
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(level, t0 + 0.02);
    gain.gain.setValueAtTime(level, t0 + Math.max(0.02, seconds - 0.04));
    gain.gain.linearRampToValueAtTime(0, t0 + seconds);
    gain.connect(c.destination);
    for (const f of freqs) { const o = c.createOscillator(); o.type = "sine"; o.frequency.value = f; o.connect(gain); o.start(t0); o.stop(t0 + seconds + 0.02); }
  }
  const play = (fn) => { if (!enabled()) return; const c = context(); if (!c) return; try { if (c.state === "suspended") c.resume?.(); fn(c); } catch { /* sounds are a nicety */ } };
  return {
    /** Call inside the tap that starts the call. */
    unlock() { if (enabled()) play(() => {}); },
    ringback() { play((c) => { tone(c, [440, 480], 0, 0.9); }); },
    connected() { play((c) => { tone(c, [880], 0, 0.09); tone(c, [1175], 0.11, 0.14); }); },
    /** The two-tone sound of a keypad button (standard telephone frequencies). */
    dtmf(key) { const f = DTMF[String(key)]; if (f) play((c) => { tone(c, f, 0, 0.09, 0.04); }); },
    ended() { play((c) => { tone(c, [520], 0, 0.14); tone(c, [392], 0.18, 0.22); }); },
    close() { try { ctx?.close?.(); } catch { /* already closed */ } ctx = null; }
  };
}
