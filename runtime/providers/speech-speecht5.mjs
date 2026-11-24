// SPDX-License-Identifier: AGPL-3.0-only
// Optional stock speech adapter. The host supplies ONNX and the installed model reader.
const sampleRate = 16000;
const maxSamples = 320000;
const invalid = message => Object.assign(new Error(message), {name: 'SpeechT5RequestError'});

export function classifySpeechT5Error(error) {
  if (error?.name !== 'SpeechT5RequestError') return undefined;
  return {class: 'invalid-request', code: 'unsupported-speech-request',
    reason: 'unsupported-speech-request', providerFault: false, recoverable: false,
    advice: error.message};
}

export function registerSpeechT5(registry, {modelId, presetId, createEngine}) {
  if (!modelId || !presetId || typeof createEngine !== 'function') {
    throw new TypeError('SpeechT5 requires a model revision, stock preset and engine factory.');
  }

  return registry.register('speecht5', {
    kind: 'speech-synthesis',
    group: 'speech-out',
    ops: ['synthesize'],
    engineVersions: ['speecht5-stock/1'],
    license: 'AGPL-3.0-only',
    createAdapter() {
      let engine;
      let loading;
      let speaking;

      return {
        async load(config = {}) {
          if (config.modelId !== modelId) throw invalid('Select the configured SpeechT5 model revision.');
          if (engine || loading) throw invalid('Unload SpeechT5 before loading again.');
          const instance = createEngine();
          const controller = new AbortController();
          const job = Promise.resolve().then(async () => {
            try {
              controller.signal.throwIfAborted();
              await instance.load({signal: controller.signal});
              controller.signal.throwIfAborted();
              engine = instance;
            } catch (error) {
              await instance.unload().catch(() => {});
              throw error;
            } finally {
              loading = undefined;
            }
          });
          loading = {controller, job};
          await job;
          return {modelId, capabilities: {kind: 'speech-synthesis', sampleRate, voices: [presetId],
            inputRoles: ['utterance-text'], threads: 1}};
        },

        async invoke(name, request, signal, emit) {
          const {text, voice} = request ?? {};
          if (name !== 'synthesize' || voice !== presetId ||
              Object.keys(request ?? {}).some(key => !['text', 'voice', 'invocationId'].includes(key))) {
            throw invalid('SpeechT5 supports utterance text and its configured stock preset.');
          }
          if (typeof text !== 'string' || !/^[a-z .,!?'-]{1,80}$/.test(text) ||
              !/^\S+(?: +\S+){3,9}$/.test(text.trim())) {
            throw invalid('Enter a supported utterance of four to ten words and up to 80 characters.');
          }
          const instance = engine;
          if (!instance || speaking) throw invalid('Load SpeechT5 and wait for any current utterance.');
          signal?.throwIfAborted();
          const controller = new AbortController();
          const abort = () => controller.abort(signal.reason);
          signal?.addEventListener('abort', abort, {once: true});
          const job = Promise.resolve().then(async () => {
            controller.signal.throwIfAborted();
            const result = await instance.synthesize(text, {signal: controller.signal});
            controller.signal.throwIfAborted();
            return result;
          });
          speaking = {controller, job};
          try {
            const {pcm, frames, frameLimit} = await job;
            if (!(pcm instanceof Float32Array) || pcm.length < 160 || pcm.length > maxSamples ||
                pcm.some(value => !Number.isFinite(value)) ||
                !pcm.some(value => Math.abs(value) >= 1e-6)) {
              throw new Error('SpeechT5 returned invalid PCM.');
            }
            // Copy only the owned waveform, never an ONNX tensor's backing store.
            const samples = pcm.slice();
            emit({sampleRate, samples}, [samples.buffer]);
            return {sampleRate, samples: pcm.length, frames, frameLimit, truncated: frames >= frameLimit};
          } finally {
            speaking = undefined;
            signal?.removeEventListener('abort', abort);
          }
        },

        async unload() {
          const pending = loading;
          pending?.controller.abort();
          await pending?.job.catch(() => {});
          const active = speaking;
          active?.controller.abort();
          await active?.job.catch(() => {});
          const instance = engine;
          engine = undefined;
          await instance?.unload();
        }
      };
    }
  });
}
