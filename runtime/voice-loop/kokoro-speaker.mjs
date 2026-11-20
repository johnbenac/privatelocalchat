// SPDX-License-Identifier: AGPL-3.0-only
// Adapter code only: a speakOne for createVoiceSession that speaks with a Kokoro engine (the standalone engine package `kokoro-engine`, or any object with the
// same speak(text, { onChunk, signal, speed }) shape). The model, its voices and the worker are NOT part of this package.
//
//   const speakOne = createKokoroSpeaker({ engine, voice: "af_heart", speed: 1, player });   // player: { push(samples, sampleRate), finish(): Promise, stop() }
//   createVoiceSession({ ..., speakOne, onSentence: ({ playing }) => playing.subscribe((chunk) => face.feed(chunk)) });
//
// The returned object is { done, stop, chunks, sampleRate, ipa, subscribe(fn) }: every chunk is { samples (mono Float32Array), sampleRate, text, ipa, index, count };
// `chunks` and `ipa` fill in as the engine produces them and subscribe(fn) replays the ones already there, so a late listener misses nothing.
// ipa is the phoneme text of the sentence, not a timing track.

export function createKokoroSpeaker({ engine, voice, speed = 1, player = null }) {
  if (!engine || typeof engine.speak !== "function") throw new TypeError("createKokoroSpeaker needs an engine with speak()");
  return function speakOne(text) {
    const ac = new AbortController(), listeners = new Set();
    const playing = { chunks: [], sampleRate: null, ipa: "", stop() { ac.abort(); try { player?.stop(); } catch { /* nothing playing */ } },
      subscribe(fn) { for (const c of playing.chunks) { try { fn(c); } catch { /* a listener never breaks speaking */ } } listeners.add(fn); return () => listeners.delete(fn); } };
    playing.done = (async () => {
      await engine.speak(text, { voice, speed, signal: ac.signal, onChunk: (chunk) => {
        if (ac.signal.aborted) return;
        const { samples, sampleRate = 24000 } = chunk;
        const c = { samples, sampleRate, text: chunk.text ?? text, ipa: chunk.ipa ?? "", index: chunk.index ?? playing.chunks.length, count: chunk.count ?? null };
        playing.chunks.push(c); playing.sampleRate = sampleRate; playing.ipa = playing.ipa ? playing.ipa + " " + c.ipa : c.ipa;
        player?.push(samples, sampleRate);
        for (const fn of [...listeners]) { try { fn(c); } catch { /* a listener never breaks speaking */ } }
      } });
      if (!ac.signal.aborted) await player?.finish();
    })();
    return playing;
  };
}
