// SPDX-License-Identifier: AGPL-3.0-only
const FFT = 400;
const HOP = 160;
const FRAMES = 3000;
const MELS = 80;
const BINS = FFT / 2 + 1;

// Slaney mel scale and area-normalised triangular filters.
const logStep = Math.log(6.4) / 27;
const melToHz = (mel) => mel < 15 ? mel * (200 / 3) : 1000 * Math.exp(logStep * (mel - 15));
const edges = Array.from({ length: MELS + 2 }, (_, i) => melToHz(
  (15 + Math.log(8) / logStep) * i / (MELS + 1),
));
const filters = edges.slice(0, MELS).map((left, mel) => {
  const middle = edges[mel + 1];
  const right = edges[mel + 2];
  const bins = [];
  for (let bin = 0; bin < BINS; bin++) {
    const hz = bin * 40;
    const weight = Math.min((hz - left) / (middle - left), (right - hz) / (right - middle));
    if (weight > 0) bins.push([bin, weight * 2 / (right - left)]);
  }
  return bins;
});

// Decompose the 400-point DFT into 16 transforms of 25 samples and combine.
const GROUPS = 16;
const GROUP_LENGTH = FFT / GROUPS;
function trig(rows, columns, period) {
  const cos = new Float64Array(rows * columns);
  const sin = new Float64Array(rows * columns);
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const angle = -2 * Math.PI * row * column / period;
      cos[row * columns + column] = Math.cos(angle);
      sin[row * columns + column] = Math.sin(angle);
    }
  }
  return { cos, sin };
}
const groupTrig = trig(GROUP_LENGTH, GROUP_LENGTH, GROUP_LENGTH);
const combineTrig = trig(BINS, GROUPS, FFT);
const hann = Float64Array.from({ length: FFT }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / FFT));

function spectrum(frame, real, imaginary, power) {
  for (let k = 0; k < GROUP_LENGTH; k++) {
    for (let group = 0; group < GROUPS; group++) {
      let re = 0, im = 0;
      for (let j = 0; j < GROUP_LENGTH; j++) {
        const sample = frame[j * GROUPS + group];
        const weight = k * GROUP_LENGTH + j;
        re += sample * groupTrig.cos[weight];
        im += sample * groupTrig.sin[weight];
      }
      real[k * GROUPS + group] = re;
      imaginary[k * GROUPS + group] = im;
    }
  }
  for (let k = 0; k < BINS; k++) {
    let re = 0, im = 0;
    for (let group = 0; group < GROUPS; group++) {
      const index = (k % GROUP_LENGTH) * GROUPS + group;
      const weight = k * GROUPS + group;
      re += real[index] * combineTrig.cos[weight] - imaginary[index] * combineTrig.sin[weight];
      im += imaginary[index] * combineTrig.cos[weight] + real[index] * combineTrig.sin[weight];
    }
    power[k] = re * re + im * im;
  }
}

export function logMel(samples) {
  const features = new Float32Array(MELS * FRAMES).fill(-10);
  const frame = new Float64Array(FFT);
  const real = new Float64Array(FFT);
  const imaginary = new Float64Array(FFT);
  const power = new Float64Array(BINS);
  let peak = -10;
  const frames = Math.min(FRAMES, Math.ceil((samples.length + FFT / 2) / HOP));
  for (let frameIndex = 0; frameIndex < frames; frameIndex++) {
    for (let i = 0; i < FFT; i++) {
      let sampleIndex = Math.abs(frameIndex * HOP + i - FFT / 2);
      if (sampleIndex >= HOP * FRAMES) sampleIndex = 2 * (HOP * FRAMES - 1) - sampleIndex;
      frame[i] = (samples[sampleIndex] ?? 0) * hann[i];
    }
    spectrum(frame, real, imaginary, power);
    for (let mel = 0; mel < MELS; mel++) {
      let energy = 0;
      for (const [bin, weight] of filters[mel]) energy += power[bin] * weight;
      const value = Math.log10(Math.max(1e-10, energy));
      features[mel * FRAMES + frameIndex] = value;
      peak = Math.max(peak, value);
    }
  }
  for (let i = 0; i < features.length; i++) features[i] = (Math.max(features[i], peak - 8) + 4) / 4;
  return features;
}

function byteAlphabet() {
  const bytes = new Map();
  let extra = 256;
  for (let byte = 0; byte < 256; byte++) {
    const visible = (byte >= 33 && byte <= 126) || (byte >= 161 && byte <= 172) || byte >= 174;
    bytes.set(visible ? byte : extra++, byte);
  }
  return bytes;
}

export function createDecoder(ort, config, generation, vocab) {
  const { decoder_layers: layers, decoder_attention_heads: heads, d_model: width } = config;
  const { decoder_start_token_id: start, eos_token_id: eos, no_timestamps_token_id: noTimestamps } = generation;
  const suppressed = new Set(generation.suppress_tokens);
  const firstSuppressed = new Set(generation.begin_suppress_tokens);
  const alphabet = byteAlphabet();
  const tokens = [];
  for (const [piece, id] of Object.entries(vocab)) {
    if (id < eos) tokens[id] = Array.from(piece, (character) => alphabet.get(character.codePointAt(0)));
  }
  const cacheNames = [];
  for (let layer = 0; layer < layers; layer++) {
    for (const side of ["decoder", "encoder"]) {
      for (const kind of ["key", "value"]) cacheNames.push(`${layer}.${side}.${kind}`);
    }
  }
  return async function decode(session, hidden, job) {
    const cache = new Map(cacheNames.map((name) => [name,
      new ort.Tensor("float32", new Float32Array(), [1, heads, 0, width / heads]),
    ]));
    const text = [];
    let input = [start, noTimestamps];
    try {
      for (let step = 0; step < generation.max_length - 2; step++) {
        // Give cancel messages a turn before each ONNX call.
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (job.cancelled) break;
        const feeds = {
          input_ids: new ort.Tensor("int64", BigInt64Array.from(input, BigInt), [1, input.length]),
          encoder_hidden_states: hidden,
          use_cache_branch: new ort.Tensor("bool", Uint8Array.of(Number(step > 0)), [1]),
        };
        for (const [name, tensor] of cache) feeds[`past_key_values.${name}`] = tensor;
        const updated = step === 0 ? cacheNames : cacheNames.filter((name) => name.includes(".decoder."));
        let outputs;
        try {
          outputs = await session.run(feeds, ["logits", ...updated.map((name) => `present.${name}`)]);
        } finally {
          feeds.input_ids.dispose();
          feeds.use_cache_branch.dispose();
        }
        for (const name of updated) {
          cache.get(name).dispose();
          cache.set(name, outputs[`present.${name}`]);
        }
        const size = outputs.logits.dims.at(-1);
        const logits = outputs.logits.data.subarray(outputs.logits.data.length - size);
        let winner = eos;
        let score = -Infinity;
        for (let token = 0; token <= eos; token++) {
          if (logits[token] > score && !suppressed.has(token) && (step !== 0 || !firstSuppressed.has(token))) {
            winner = token;
            score = logits[token];
          }
        }
        outputs.logits.dispose();
        if (winner === eos) break;
        text.push(...tokens[winner]);
        input = [winner];
      }
    } finally {
      for (const tensor of cache.values()) tensor.dispose();
    }
    return new TextDecoder().decode(Uint8Array.from(text)).trim();
  };
}
