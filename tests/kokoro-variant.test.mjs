// The threads variant of the standalone Kokoro package: the first-chunk splitter and the exact-text patches (docs/VOICE-STANDALONE.md). The browser test is tests/e2e/kokoro-threads.e2e.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { findFirstCut, splitFirst } from '../ops/voice/standalone/first-chunk.mjs';
import { patchWorker, patchEngine } from '../ops/voice/standalone/variant-threads.mjs';

const S = "That's a really good question, and honestly, the answer depends on what you care about most right now.";
test('the first chunk is cut at the first comma at least minChars in, and only the first chunk', () => {
  assert.deepEqual(splitFirst([S], { minChars: 20 }), ["That's a really good question,", 'and honestly, the answer depends on what you care about most right now.']);
  assert.deepEqual(splitFirst([S, 'Second, sentence here is long enough.'], { minChars: 20 }).length, 3);
  assert.deepEqual(splitFirst([S, 'Second sentence, here.'], { minChars: 20 })[2], 'Second sentence, here.', 'later chunks are left alone');
  assert.deepEqual(splitFirst([S], { minChars: 40 })[0], "That's a really good question, and honestly,", 'the next comma after minChars');
});
test('nothing is cut when it is off, too short, a number, or would leave too little', () => {
  for (const opt of [undefined, null, {}, { minChars: 0 }, { minChars: -3 }, { minChars: 2.5 }, { minChars: '20' }]) assert.deepEqual(splitFirst([S], opt), [S], JSON.stringify(opt));
  assert.deepEqual(splitFirst(['Hello, I am Emma.'], { minChars: 20 }), ['Hello, I am Emma.'], 'no comma after minChars');
  assert.deepEqual(splitFirst(['It costs 1,000 pounds in total and more.'], { minChars: 5 }), ['It costs 1,000 pounds in total and more.'], 'a number is not cut');
  assert.deepEqual(splitFirst(['This is a long start, ok.'], { minChars: 10 }), ['This is a long start, ok.'], 'a tail under 12 characters stays with its head');
  assert.deepEqual(splitFirst([], { minChars: 10 }), []);
  assert.equal(findFirstCut('a, b', 0), -1);
});
test('the pieces always add up to the input (no character lost) and no piece is empty', () => {
  for (const t of [S, 'One; two three four five six seven eight nine ten eleven.', 'Note: this is a long enough tail to be its own chunk here.', 'x,y,z, and then a long sentence follows right after.']) for (const minChars of [1, 5, 10, 20, 60]) {
    const parts = splitFirst([t], { minChars }); assert.equal(parts.join('').replace(/\s+/g, ''), t.replace(/\s+/g, ''), t + ' ' + minChars); assert.ok(parts.every((p) => p.length > 0));
  }
});
test('the variant patches apply to the real sources exactly once each and put the threads and the split in', () => {
  const w = patchWorker(readFileSync(new URL('../ops/voice/standalone/worker.src.mjs', import.meta.url), 'utf8')), e = patchEngine(readFileSync(new URL('../ops/voice/standalone/engine.mjs', import.meta.url), 'utf8'));
  assert.match(w, /crossOriginIsolated === true/); assert.match(w, /Math\.min\(threads, 4, self\.navigator\?\.hardwareConcurrency \|\| 1\)/); assert.match(w, /splitFirst\(kokoroChunks\(text\), firstChunkSplit\)/); assert.doesNotMatch(w, /numThreads = 1;/);
  assert.match(e, /threads \}, transfer\)/); assert.match(e, /firstChunkSplit \}/); assert.match(e, /threads: threadsUsed \}\);/);
  assert.throws(() => patchWorker('nothing here'), /found 0 times/); assert.throws(() => patchEngine(readFileSync(new URL('../ops/voice/standalone/engine.mjs', import.meta.url), 'utf8') + '\nlet config = null, worker = null, state = "new", voices = [], seq = 0, currentSpeak = null;'), /found 2 times|found 0 times/);
});
