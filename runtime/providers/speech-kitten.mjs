// SPDX-License-Identifier: AGPL-3.0-only
// Optional engine. The host supplies the existing pure Kitten pipeline,
// ONNX, verified model reads, and the separately licensed phonemizer.
const VERSION = 'kitten-engine-files/1';
const ROLES = ['model', 'voice', 'config'];
const invalid = message => Object.assign(new Error(message), {name:'ConfigError', code:'bad-config'});

async function renderChunk({pipeline, phonemize, ort, session, text, voice, speed, signal}) {
  const ids = await pipeline.chunkToIds(text, phonemize);
  signal.throwIfAborted();
  const style = pipeline.styleFor(voice, text.length);
  const inputs = {};
  let output;
  try {
    inputs.input_ids = new ort.Tensor('int64', BigInt64Array.from(ids, BigInt), [1, ids.length]);
    inputs.style = new ort.Tensor('float32', style, [1, style.length]);
    inputs.speed = new ort.Tensor('float32', Float32Array.of(speed), [1]);
    output = await session.run(inputs);
    signal.throwIfAborted();
    return pipeline.trimAudio(Object.values(output)[0].data).slice();
  } finally {
    for (const tensor of new Set(Object.values(output ?? {}))) tensor.dispose?.();
    for (const tensor of Object.values(inputs)) tensor.dispose?.();
  }
}

export function registerKitten(registry, {
  manifest, loadOrt, readVerified, pipeline, phonemize, unzip, maxThreads = 1
} = {}) {
  const descriptor = manifest?.descriptor;
  const artifacts = descriptor?.artifacts;
  if (descriptor?.runtime?.engine !== 'kitten' || descriptor.runtime.version !== VERSION ||
      !Array.isArray(artifacts) || !ROLES.every(role => artifacts.filter(file => file.role === role).length === 1) ||
      ![loadOrt, readVerified, phonemize, unzip].every(dependency => typeof dependency === 'function') ||
      !pipeline || !Number.isInteger(maxThreads) || maxThreads < 1 || maxThreads > 4) {
    throw invalid('Kitten needs a pinned model manifest and the host speech services.');
  }
  const files = new Map(artifacts.filter(file => ROLES.includes(file.role)).map(file => [file.role, {...file}]));
  const {id:modelId, revision} = descriptor.resource;
  return registry.register('kitten', {
    kind:'speech-synthesis', group:'speech-out', ops:['synthesize'],
    engineVersions:[VERSION], license:'AGPL-3.0-only',
    createAdapter() {
      let state, loading, active;
      return {
        async load(config = {}) {
          if (config.modelId !== modelId || config.revision !== revision || state || loading) {
            throw invalid('Select the pinned Kitten model revision and unload any existing Kitten session.');
          }
          const {threads = 1} = config;
          if (!Number.isInteger(threads) || threads < 1 || threads > maxThreads) {
            throw invalid('Kitten needs a thread count supported by the configured host.');
          }
          const controller = new AbortController();
          const {signal} = controller;
          const read = async role => {
            const file = files.get(role);
            const bytes = await readVerified(file, {signal});
            signal.throwIfAborted();
            if (!(bytes instanceof Uint8Array) || bytes.byteLength !== file.bytes) {
              throw invalid('The verified reader returned a different size for ' + file.name);
            }
            return bytes;
          };
          const done = Promise.resolve().then(async () => {
            signal.throwIfAborted();
            const ort = await loadOrt({signal, threads});
            const settings = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(await read('config')));
            const voices = pipeline.parseNpz(await read('voice'), unzip);
            const session = await ort.InferenceSession.create(await read('model'), {executionProviders:['wasm']});
            if (signal.aborted) {
              await session.release();
              signal.throwIfAborted();
            }
            state = {ort, session, settings, voices};
            return {modelId, capabilities:{kind:'speech-synthesis', inputRoles:['utterance-text'],
              voices:Object.keys(voices), sampleRate:pipeline.SAMPLE_RATE, threads}};
          });
          loading = {controller, done};
          try { return await done; }
          finally { loading = undefined; }
        },

        async invoke(name, request, signal, emit) {
          const {text, voice, speed = 1} = request ?? {};
          if (!state || active || name !== 'synthesize' || typeof text !== 'string' ||
              !Number.isFinite(speed) || speed <= 0 ||
              Object.keys(request ?? {}).some(key => !['text', 'voice', 'speed', 'invocationId'].includes(key))) {
            throw invalid('Kitten needs a loaded idle session, utterance text, and supported voice settings.');
          }
          const {settings, voices, session, ort} = state;
          let voiceId;
          try { voiceId = pipeline.resolveVoice(settings, voices, voice); }
          catch { throw invalid('That voice is not part of the selected Kitten preset pack.'); }
          if (!Object.hasOwn(voices, voiceId)) {
            throw invalid('That voice is not part of the selected Kitten preset pack.');
          }
          signal?.throwIfAborted();
          const controller = new AbortController();
          const abort = () => controller.abort(signal.reason);
          signal?.addEventListener('abort', abort, {once:true});
          const done = Promise.resolve().then(async () => {
            const fragments = pipeline.speechChunks(text);
            const rate = pipeline.effectiveSpeed(settings, voiceId, speed);
            const sampleRate = pipeline.SAMPLE_RATE;
            const start = performance.now();
            let count = 0, samples = 0;
            let firstAudioMs = 0;
            for (const [index, fragment] of fragments.entries()) {
              await new Promise(resolve => setTimeout(resolve, 0));
              controller.signal.throwIfAborted();
              const pcm = await renderChunk({pipeline, phonemize, ort, session, text:fragment,
                voice:voices[voiceId], speed:rate, signal:controller.signal});
              controller.signal.throwIfAborted();
              if (!count) firstAudioMs = performance.now() - start;
              samples += pcm.length;
              count++;
              emit({index, count:fragments.length, text:fragment, sampleRate, samples:pcm}, [pcm.buffer]);
            }
            return {chunks:count, samples, sampleRate, audioSeconds:samples / sampleRate,
              synthMs:performance.now() - start, firstAudioMs};
          });
          active = {controller, done};
          try { return await done; }
          finally {
            active = undefined;
            signal?.removeEventListener('abort', abort);
          }
        },

        async unload() {
          const pending = loading;
          const running = active;
          pending?.controller.abort();
          running?.controller.abort();
          await pending?.done.catch(() => {});
          await running?.done.catch(() => {});
          const loaded = state;
          state = undefined;
          await loaded?.session.release();
        }
      };
    }
  });
}
