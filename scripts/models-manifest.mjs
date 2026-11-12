#!/usr/bin/env node
// models.json: every model file the app can download, with its size and SHA-256, taken from the same pins the app checks downloads against
// (the catalog, the voice manifests, the embedding configuration). It ships in the release zip so that fetch-models can fetch from any source.
//
//   node scripts/models-manifest.mjs [--out FILE]     print the manifest, or write it to FILE
//
// The enumeration lives here, not in tests/, because shipped code may not depend on tests. tests/links/model-urls.mjs re-exports `collectModelUrls`.
import {readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildAppConfig} from '../runtime/config/app-config.mjs';

export const MODELS_FORMAT = 'plc-models/1';
const shippedConfig = () => buildAppConfig(JSON.parse(readFileSync(new URL('../app-config.json', import.meta.url), 'utf8')));

/**
 * { tiers: { tier: { variant|"-": [{url, bytes, sha256}] } }, voices: { id: [..] }, embedding: { modelBase, wasmBase } }, sorted so two runs compare as text.
 * `effectiveSources` is the catalog's sources as the app uses them. `fresh` is a query string that loads new copies of the modules, so a caller can change
 * globalThis.APP_CONFIG (the model sources the build writes into the page) and read the result. Without APP_CONFIG the shipped one is installed, as a build does.
 */
export async function collectModelUrls({effectiveSources, fresh = ''} = {}) {
  globalThis.APP_CONFIG ??= shippedConfig();
  const catalog = await import('../runtime/providers/catalog.mjs' + fresh);
  const {KITTEN_NANO_MANIFEST, KITTEN_NANO_BASE_URL} = await import('../chat/voice/voice-manifest.mjs' + fresh);
  const {KOKORO_Q8_MANIFEST, KOKORO_Q8_BASE_URL} = await import('../chat/voice/voice-manifest-kokoro.mjs' + fresh);
  const embedding = await import('../chat/embedding/embedding-config.mjs' + fresh);
  const sources = effectiveSources;
  const pin = (f) => ({url: f.url, bytes: f.bytes, sha256: f.sha256});
  const byUrl = (a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0);
  const tiers = {};
  for (const tier of catalog.TIER_ORDER) {
    if (tier === 'default') { tiers[tier] = {}; for (const v of catalog.WEBLLM_VARIANTS) tiers[tier][v] = catalog.tierFiles(tier, sources, v).map(pin).sort(byUrl); }
    else tiers[tier] = {'-': catalog.tierFiles(tier, sources).map(pin).sort(byUrl)};
  }
  const voices = {
    'kitten-tts-nano-0.8-int8': KITTEN_NANO_MANIFEST.files.map((f) => ({url: KITTEN_NANO_BASE_URL + f.name, bytes: f.bytes, sha256: f.sha256})).sort(byUrl),
    'kokoro-82m-v1.0-q8': KOKORO_Q8_MANIFEST.files.map((f) => ({url: KOKORO_Q8_BASE_URL + f.path, bytes: f.bytes, sha256: f.sha256})).sort(byUrl)
  };
  return {tiers, voices, embedding: {modelBase: embedding.EMBEDDING_MODEL_BASE, wasmBase: embedding.EMBEDDING_WASM_BASE}};
}

const byPath = (a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

/** [{path, bytes, sha256}] for the pins in `files`, relative to `root`, each path once, sorted. A different pin for one path is an error. */
function relative(files, root, where) {
  const seen = new Map();
  for (const f of files) {
    if (!f.url.startsWith(root)) throw new Error(`${where}: ${f.url} is not under the model root ${root}`);
    const p = f.url.slice(root.length);
    const old = seen.get(p);
    if (old && (old.bytes !== f.bytes || old.sha256 !== f.sha256)) throw new Error(`${where}: ${p} is pinned two different ways`);
    seen.set(p, {path: p, bytes: f.bytes, sha256: f.sha256});
  }
  return [...seen.values()].sort(byPath);
}

/** The manifest of everything the shipped configuration lets the app download. */
export async function buildModelsManifest() {
  const saved = globalThis.APP_CONFIG;
  globalThis.APP_CONFIG = shippedConfig();
  try {
    const fresh = '?models-manifest';
    const catalog = await import('../runtime/providers/catalog.mjs' + fresh);
    const urls = await collectModelUrls({effectiveSources: catalog.resolveSources(null).sources, fresh});
    const {appConfig} = await import('../runtime/config/app-config.mjs');
    const root = appConfig().modelRoot();
    const tiers = {};
    for (const [tier, variants] of Object.entries(urls.tiers)) tiers[tier] = relative(Object.values(variants).flat(), root, 'tier ' + tier);
    const voices = {};
    for (const [id, files] of Object.entries(urls.voices)) voices[id] = relative(files, root, 'voice ' + id);
    // The embedding configuration names where its set is (a content-addressed folder) but pins no file: neither a list nor sizes nor hashes are in the code,
    // so there is nothing true to put here. ops/cloudflare/publish-embedding.py holds the set at publishing time only.
    return {format: MODELS_FORMAT, root, tiers, voices, embedding: []};
  } finally { globalThis.APP_CONFIG = saved; }
}

/** The text written to models.json. */
export const modelsManifestText = (manifest) => JSON.stringify(manifest, null, 2) + '\n';

async function cli(args) {
  const i = args.indexOf('--out');
  if (args.length && !(args.length === 2 && i === 0)) { console.error('Usage: models-manifest.mjs [--out FILE]'); return 2; }
  const text = modelsManifestText(await buildModelsManifest());
  if (i === 0) writeFileSync(path.resolve(args[1]), text); else process.stdout.write(text);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  cli(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (error) => { console.error(error.message); process.exitCode = 1; });
}
