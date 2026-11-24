// SPDX-License-Identifier: AGPL-3.0-only
// In-worker Kokoro engine. The host owns ONNX, verified resources and the
// optional phonemizer. This module starts no worker and imports no eSpeak.
const fault = (code, message) => Object.assign(new Error(message), {name: 'KokoroEngineError', code});
const abortFault = () => new DOMException('Speech cancelled.', 'AbortError');

export function createKokoroSessionEngine({loadOrt, readVerified, pipeline, phonemize, maxThreads = 1}) {
  if (typeof loadOrt !== 'function' || typeof readVerified !== 'function' ||
      typeof phonemize !== 'function' || !pipeline || !Number.isInteger(maxThreads) || maxThreads < 1 || maxThreads > 4) {
    throw fault('bad-config', 'Kokoro needs its ONNX, verified file and phonemizer services.');
  }
  let config, loaded, pendingLoad, speaking;
  const decoder = new TextDecoder('utf-8', {fatal: true});

  async function build({signal, onProgress, threads}) {
    const {base, files} = config;
    const read = async file => {
      signal.throwIfAborted();
      const bytes = await readVerified(file, {base, signal, onProgress});
      signal.throwIfAborted();
      if (!(bytes instanceof Uint8Array) || bytes.byteLength !== file.bytes) {
        throw fault('bad-size', 'The verified reader returned the wrong size: ' + file.path);
      }
      return bytes;
    };
    const readRole = role => read(files.find(file => file.role === role));
    const ort = await loadOrt({signal, threads});
    const tokenizer = pipeline.createTokenizer(JSON.parse(decoder.decode(await readRole('tokenizer'))),
      JSON.parse(decoder.decode(await readRole('tokenizer_config'))));
    const voices = new Map();
    for (const file of files.filter(file => file.role === 'voice')) {
      const id = file.path.split('/').at(-1).replace(/\.bin$/, '');
      voices.set(id, pipeline.parseVoice(await read(file)));
    }
    // Read the graph last so its bytes are never retained while fetching voices.
    const session = await ort.InferenceSession.create(await readRole('model'), {executionProviders: ['wasm']});
    if (signal.aborted) {
      await session.release();
      signal.throwIfAborted();
    }
    return {session, ort, tokenizer, voices, threads};
  }

  async function unload() {
    pendingLoad?.controller.abort();
    speaking?.controller.abort();
    await pendingLoad?.done.catch(() => {});
    await speaking?.done.catch(() => {});
    const state = loaded;
    loaded = null;
    await state?.session.release();
  }

  return {
    init({base, files}) {
      if (loaded || pendingLoad || !Array.isArray(files) ||
          files.some(file => !file || typeof file.path !== 'string' ||
            !/^[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*$/.test(file.path) ||
            file.path.split('/').some(part => part === '.' || part === '..') ||
            !Number.isSafeInteger(file.bytes) || file.bytes <= 0 || !/^[a-f0-9]{64}$/.test(file.sha256)) ||
          !['model', 'tokenizer', 'tokenizer_config'].every(role => files.filter(file => file.role === role).length === 1) ||
          !files.some(file => file.role === 'voice')) {
        throw fault('bad-file-list', 'Kokoro needs one graph, tokenizer and tokenizer config and at least one voice.');
      }
      config = {base, files: structuredClone(files)};
    },
    async load({signal, onProgress, threads = 1} = {}) {
      if (!config || pendingLoad || !Number.isInteger(threads) || threads < 1 || threads > maxThreads ||
          (loaded && loaded.threads !== threads)) {
        throw fault('bad-config', 'The Kokoro thread count must match the initialized host profile.');
      }
      if (loaded) return {voices: [...loaded.voices.keys()]};
      const controller = new AbortController();
      const cancel = () => controller.abort();
      if (signal?.aborted) cancel();
      signal?.addEventListener('abort', cancel, {once: true});
      const job = {controller, threads, done: build({signal:controller.signal, onProgress, threads})};
      pendingLoad = job;
      try {
        loaded = await job.done;
        return {voices: [...loaded.voices.keys()]};
      } finally {
        pendingLoad = null;
        signal?.removeEventListener('abort', cancel);
      }
    },
    async speak(text, {voice, speed = 1, signal, firstChunkSplit, onChunk} = {}) {
      const state = loaded;
      if (!state) throw fault('not-loaded', 'Load Kokoro before synthesizing speech.');
      if (speaking || firstChunkSplit !== undefined || !Number.isFinite(speed) || speed <= 0) {
        throw fault('bad-config', 'Unsupported Kokoro synthesis settings.');
      }
      const voiceId = voice ?? pipeline.DEFAULT_VOICE;
      if (!state.voices.has(voiceId)) throw fault('unknown-voice', 'That voice is not loaded.');
      const controller = new AbortController();
      const cancel = () => controller.abort(abortFault());
      if (signal?.aborted) cancel();
      signal?.addEventListener('abort', cancel, {once:true});
      const check = () => controller.signal.throwIfAborted();
      const run = async () => {
        const {ort, session, tokenizer, voices} = state;
        const fragments = pipeline.kokoroChunks(text);
        const start = performance.now();
        let samples = 0, chunks = 0, firstAudioMs = 0;
        for (const [index, fragment] of fragments.entries()) {
          await new Promise(resolve => setTimeout(resolve, 0));
          check();
          const ipa = await pipeline.phonemizeText(fragment, voiceId, phonemize);
          const ids = tokenizer.encode(ipa);
          if (ids.length <= 2) continue;
          check();
          const style = pipeline.styleFor(voices.get(voiceId), ids.length);
          const inputs = {};
          let outputs;
          let audio;
          try {
            inputs.input_ids = new ort.Tensor('int64', BigInt64Array.from(ids, BigInt), [1, ids.length]);
            inputs.style = new ort.Tensor('float32', style, [1, style.length]);
            inputs.speed = new ort.Tensor('float32', Float32Array.of(speed), [1]);
            outputs = await session.run(inputs);
            check();
            const waveform = outputs.waveform ?? Object.values(outputs)[0];
            audio = new Float32Array(waveform.data);
          } finally {
            for (const output of Object.values(outputs ?? {})) output.dispose?.();
            for (const input of Object.values(inputs)) input.dispose?.();
          }
          if (!audio.length) continue;
          if (!chunks) firstAudioMs = performance.now() - start;
          chunks++;
          samples += audio.length;
          onChunk?.({index, count:fragments.length, text:fragment, ipa, samples:audio, sampleRate:24000});
        }
        return {chunks, samples, firstAudioMs, synthMs:performance.now() - start, audioSeconds:samples / 24000,
          sampleRate:24000, cancelled:false};
      };
      speaking = {controller, done:run()};
      try { return await speaking.done; }
      finally { speaking = null; signal?.removeEventListener('abort', cancel); }
    },
    cancel() {speaking?.controller.abort(abortFault());},
    unload,
    status() {return {state:loaded ? 'ready' : pendingLoad ? 'loading' : 'idle', threads:loaded?.threads ?? pendingLoad?.threads ?? 1};},
  };
}
