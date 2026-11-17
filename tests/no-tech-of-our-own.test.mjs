// Private Local Chat does not depend on Tech of Our Own: no model, file or service is fetched from or published from its hosts,
// and nothing in the repository names them. A model's files come from the project's own CDN (assets.privatelocal.chat), and a new
// model is published from a folder the maintainer supplies (docs/CDN-POPULATION.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

// The neutrality test names it on purpose: it is the list of what a copy of the app must not carry (tests/neutrality.config.json).
const SELF = new Set(['tests/no-tech-of-our-own.test.mjs', 'tests/publish-files.test.mjs', 'tests/neutrality.config.json', 'tests/neutrality.test.mjs']);
const PATTERN = /techofourown|tech of our own/i;

test('no tracked file names Tech of Our Own', () => {
  const files = execFileSync('git', ['ls-files', '-z'], {encoding: 'utf8', maxBuffer: 1 << 28}).split('\0').filter(Boolean);
  const hits = [];
  for (const file of files) {
    if (SELF.has(file) || !fs.existsSync(file)) continue;
    const bytes = fs.readFileSync(file);
    if (bytes.includes(0)) continue; // binary
    if (PATTERN.test(bytes.toString('utf8'))) hits.push(file);
  }
  assert.deepEqual(hits, [], 'These files name Tech of Our Own; model files and services come from the project\'s own hosts.');
});
