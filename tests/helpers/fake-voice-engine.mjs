// An in-memory FAKE of the voice engine interface (chat/voice/voice-engine.mjs) for tests. It makes no sound and downloads nothing.
//   createVoiceEngine -> { status(), install(onProgress), remove(), load(), unload(), speak(text, {onChunk, signal, speed, voice}), sample() }
// Options: bytes, metrics (what speak() reports), failInstall, failSpeak, hangSpeak (never produces audio, honours signal), installed.
export function createFakeVoiceEngine({ bytes = 30e6, metrics = { audioSeconds: 4, synthSeconds: 1, realTimeFactor: 4, firstAudioMs: 300 }, failInstall = false, failSpeak = false, hangSpeak = false, installed = false } = {}) {
  const calls = [];
  let files = installed, loaded = false;
  return {
    calls,
    get filesOnDisk() { return files; },
    get loaded() { return loaded; },
    async status() { return { installed: files, bytes: files ? bytes : 0 }; },
    async install(onProgress) {
      calls.push("install");
      if (failInstall) throw new Error("download failed");
      for (const f of [0.5, 1]) onProgress?.(Math.round(bytes * f), bytes);
      files = true;
    },
    async remove() { calls.push("remove"); files = false; loaded = false; },
    async load() { calls.push("load"); loaded = true; },
    async unload() { calls.push("unload"); loaded = false; },
    async speak(text, { onChunk, signal } = {}) {
      calls.push("speak");
      if (failSpeak) throw new Error("synthesis failed");
      if (hangSpeak) await new Promise((_, rej) => signal?.addEventListener("abort", () => rej(new Error("aborted"))));
      loaded = true;
      onChunk?.({ samples: new Float32Array(2400).fill(0.1), sampleRate: 24000, index: 0, count: 2, text }); // the REAL engine's contract: one object per chunk
      onChunk?.({ samples: new Float32Array(2400).fill(0.1), sampleRate: 24000, index: 1, count: 2, text });
      return { ...metrics };
    },
    async sample() { return this.speak("sample", {}); }
  };
}

/** Minimal AudioContext stand-in: sources "end" on a timer, and what was scheduled is recorded. */
export function fakeAudioContext() {
  const ctx = { currentTime: 0, destination: {}, scheduled: [], resume() {}, close() {},
    createBuffer: (ch, n, rate) => ({ duration: n / rate, getChannelData: () => new Float32Array(n), copyToChannel() {} }),
    createBufferSource() { const s = { connect() {}, stop() {}, start(at) { ctx.scheduled.push({ at, duration: s.buffer.duration }); setTimeout(() => s.onended?.(), 1); } }; return s; } };
  return ctx;
}
