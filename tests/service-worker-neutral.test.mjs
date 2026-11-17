// The service worker names no site of ours outside the development markers, so a copy built for download carries no host of ours (split stage 7).
// What differs between the development site and every other build is the build-supplied DEVELOPMENT_NATIVE flag, not a hostname test.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const strip = (text) => text.replace(/\/\* DEV_DIAGNOSTICS_START \*\/[\s\S]*?\/\* DEV_DIAGNOSTICS_END \*\//g, '');

test('scripts/service-worker.js names no privatelocal.chat host outside the development markers', async () => {
  const source = strip(await readFile('scripts/service-worker.js', 'utf8'));
  assert.doesNotMatch(source, /privatelocal\.chat/);
});

test('the shell file list is filtered by DEVELOPMENT_NATIVE', async () => {
  const source = await readFile('scripts/service-worker.js', 'utf8');
  assert.match(source, /\.filter\(file=>DEVELOPMENT_NATIVE\|\|!file\.includes\('\/dev-tools\/'\)\)/);
});

test('the check is not brought back: the stripping really removes the hostname test (negative control)', async () => {
  const withHost = "const SHELL=[].filter(file=>location.hostname==='dev.privatelocal.chat'||true);";
  assert.match(strip(withHost), /privatelocal\.chat/);
});
