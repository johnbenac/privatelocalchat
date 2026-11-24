// SPDX-License-Identifier: AGPL-3.0-only
// Single-thread WASM SpeechT5. The host owns ONNX, module integrity and model files.
const modelPath = '/__speech_model__/';
const loadOptions = {local_files_only: true, device: 'wasm',
  session_options: {executionProviders: ['wasm']}};
const onnxKey = Symbol.for('onnxruntime');
const loadingFrontends = new WeakSet();

function allowWorkerMessages(model) {
  const decoder = model.sessions?.decoder_model_merged;
  if (typeof decoder?.run !== 'function') {
    throw new Error('SpeechT5 frontend does not expose its expected decoder session.');
  }
  const run = decoder.run.bind(decoder);
  decoder.run = async (...args) => {
    // WASM and the frontend may otherwise chain only microtasks for the entire utterance.
    // Let the worker receive cancellation while the bounded decoder finishes its call.
    await new Promise(resolve => setTimeout(resolve, 0));
    return run(...args);
  };
}

async function readExact(file, readVerified, signal) {
  const bytes = new Uint8Array(file.bytes);
  let offset = 0;
  for await (const chunk of readVerified(file, {signal})) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  if (offset !== bytes.length) throw new Error('Incomplete SpeechT5 resource.');
  return bytes;
}

function cacheResponse(chunks, bytes) {
  const iterator = chunks[Symbol.asyncIterator]();
  return new Response(new ReadableStream({
    async pull(controller) {
      const part = await iterator.next();
      if (part.done) controller.close();
      else controller.enqueue(part.value);
    },
    async cancel() {
      await iterator.return?.();
    }
  }), {headers: {'Content-Length': String(bytes)}});
}

export function createSpeechT5SessionEngine({
  loadOrt, loadFrontend, readVerified, files, readStockVector, validateConfiguration, origin
}) {
  const resources = new Map(files.map(file => [file.path, file]));
  let model, vocoder, tokenizer, conditioning, Tensor;

  return {
    async load({signal}) {
      const ort = await loadOrt({signal});
      if (globalThis[onnxKey] !== undefined && globalThis[onnxKey] !== ort) {
        throw new Error('The speech worker already has a different ONNX instance.');
      }
      globalThis[onnxKey] = ort;
      const frontend = await loadFrontend({signal});
      const {env, AutoTokenizer, SpeechT5ForTextToSpeech, SpeechT5HifiGan} = frontend;
      if (env.backends.onnx !== ort.env) throw new Error('SpeechT5 did not adopt the host ONNX instance.');
      if (loadingFrontends.has(env)) throw new Error('The SpeechT5 frontend is already loading.');
      Tensor = frontend.Tensor;
      const oldSettings = {
        allowRemoteModels: env.allowRemoteModels, allowLocalModels: env.allowLocalModels,
        localModelPath: env.localModelPath, useBrowserCache: env.useBrowserCache,
        useFSCache: env.useFSCache, useCustomCache: env.useCustomCache, customCache: env.customCache
      };
      loadingFrontends.add(env);
      try {
        Object.assign(env, {
          allowRemoteModels: false, allowLocalModels: true, localModelPath: modelPath,
          useBrowserCache: false, useFSCache: false, useCustomCache: true,
          customCache: {
            async match(key) {
              signal.throwIfAborted();
              const url = new URL(typeof key === 'string' ? key : key.url, origin);
              const path = url.pathname;
              const file = url.origin === origin && !url.search && !url.hash &&
                path.startsWith(modelPath) && resources.get(path.slice(modelPath.length));
              if (!file || file.role === 'stock-conditioning') {
                throw new Error('SpeechT5 requested an unregistered model resource.');
              }
              return cacheResponse(readVerified(file, {signal}), file.bytes);
            },
            async put() { throw new Error('SpeechT5 cannot write its installed model cache.'); }
          }
        });
        for (const path of ['tts/config.json', 'vocoder/config.json']) {
          const file = resources.get(path);
          if (!file || !Number.isInteger(file.bytes) || file.bytes < 1 || file.bytes > 65536) {
            throw new Error('SpeechT5 requires a bounded configuration.');
          }
          const bytes = await readExact(file, readVerified, signal);
          const config = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
          validateConfiguration(file.role, config);
        }
        const stock = resources.get('stock/cmu-slt-arctic-a0001.npy');
        if (!stock || stock.role !== 'stock-conditioning' || stock.bytes !== 2176) {
          throw new Error('SpeechT5 requires its verified stock conditioning vector.');
        }
        conditioning = readStockVector(await readExact(stock, readVerified, signal));
        signal.throwIfAborted();
        tokenizer = await AutoTokenizer.from_pretrained('tts', loadOptions);
        signal.throwIfAborted();
        model = await SpeechT5ForTextToSpeech.from_pretrained('tts', {...loadOptions, dtype: 'q4'});
        allowWorkerMessages(model);
        signal.throwIfAborted();
        vocoder = await SpeechT5HifiGan.from_pretrained('vocoder', {...loadOptions, dtype: 'q8'});
      } finally {
        loadingFrontends.delete(env);
        Object.assign(env, oldSettings);
      }
    },

    async synthesize(text, {signal}) {
      signal.throwIfAborted();
      const inputs = tokenizer(text);
      let speaker, result;
      try {
        const {input_ids} = inputs;
        const tokens = input_ids.dims.at(-1);
        if (!Number.isInteger(tokens) || tokens < 1 || tokens > 80) {
          throw new Error('SpeechT5 input exceeds the supported token profile.');
        }
        const reduction = model.config.reduction_factor;
        if (reduction !== 2) throw new Error('Unsupported SpeechT5 reduction factor.');
        const frameLimit = Math.floor(tokens / reduction * 12) * reduction;
        speaker = new Tensor('float32', conditioning, [1, 512]);
        result = await model.generate_speech(input_ids, speaker, {
          vocoder, threshold: 0.5, minlenratio: 0, maxlenratio: 12
        });
        signal.throwIfAborted();
        return {pcm: new Float32Array(result.waveform.data),
          frames: result.spectrogram.dims[0], frameLimit};
      } finally {
        const tensors = new Set([...Object.values(inputs), speaker, result?.waveform, result?.spectrogram]);
        for (const tensor of tensors) tensor?.dispose?.();
      }
    },

    async unload() {
      const tts = model;
      const audio = vocoder;
      model = vocoder = tokenizer = conditioning = Tensor = undefined;
      try { await tts?.dispose(); }
      finally { await audio?.dispose(); }
    }
  };
}
