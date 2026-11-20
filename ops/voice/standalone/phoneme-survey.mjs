// The survey behind kokoro-phoneme-notes.md: runs the real phonemizer pipeline over a few texts and reports the symbols it emits and any the model's vocabulary lacks.
//   KOKORO_TOKENIZER=<tokenizer.json> node ops/voice/standalone/phoneme-survey.mjs   (needs `npm ci --ignore-scripts` in ops/voice)
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const here = new URL('.', import.meta.url).pathname; const nm = here + '../node_modules';
const { phonemize } = await import(pathToFileURL(nm + '/phonemizer/dist/phonemizer.js').href).catch(async () => await import('phonemizer'));
const { phonemizeText, kokoroChunks } = await import(here + '../../../chat/voice/voice-kokoro.mjs');
const vocab = new Set(Object.keys(JSON.parse(fs.readFileSync(process.env.KOKORO_TOKENIZER || 'tokenizer.json', 'utf8')).model.vocab));
const texts = ['Hello! This is a short sample of the voice.', 'The quick brown fox jumps over the lazy dog, and then it sits very still.', 'Could you please tell me where the nearest train station is?', 'I was not expecting that, but honestly, it turned out wonderfully.', 'Numbers are tricky: on the 14th of March, 2027, we paid 3,250 dollars and 40 cents.', 'Hello! This is a short sample of the voice. Please type anything, and watch the mouth move, sound by sound.',
  'The boy joined the choir, and my house is by the beach. Pure thought, near here; a bird, a law, the hour, a vision of treasure.', 'Cheese, jump, think, this, sing, yes, red, water, over there.'];
const seen = new Map();
for (const voice of ['af_heart', 'bf_emma']) for (const t of texts) for (const c of kokoroChunks(t)) { const p = await phonemizeText(c, voice, phonemize); if (voice === 'af_heart') console.log(JSON.stringify(c), '=>', p); for (const ch of p) seen.set(ch, (seen.get(ch) || 0) + 1); }
const outside = [...seen.keys()].filter((c) => !vocab.has(c));
console.log('SYMBOLS EMITTED:', [...seen.keys()].sort().join(''), '| count', seen.size);
console.log('NOT IN THE MODEL VOCAB (silently dropped by the tokenizer):', JSON.stringify(outside));
console.log('CAPITAL LETTERS EMITTED:', [...seen.keys()].filter((c) => /[A-Z]/.test(c)).join('') || 'none');
