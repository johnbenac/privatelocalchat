// Trusted committed fixture reader. No filesystem writes or network.
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import {registerDefinitions, parseContent} from '../../src/core/content.mjs';
import {loadRegistry, parseDefinitions, exportAuthored, openAuthored, receivingFixture}
  from '../authored.mjs';
export const root = new URL('../', import.meta.url);
export const read = async path => readFile(new URL(path, root), 'utf8');
export const json = async path => JSON.parse(await read(path));
export async function example(name) {
  let registry = loadRegistry(parseDefinitions(await read('../content/starter-registry.json')),
    parseDefinitions(await read('definitions.v1.json')));
  if (name === 'bex') registry = registerDefinitions(registry,
    parseDefinitions(await read('examples/festival.definitions.json')));
  const document = parseContent(await read(`examples/${name}.content.json`), registry).document;
  const manifest = await json('resources/manifest.json');
  const bytes = new Map(await Promise.all(manifest.resources.map(async r =>
    [r.sha256, new Uint8Array(await readFile(new URL(`resources/${r.file}`, root)))])));
  return {document, registry, bytes};
}
export async function packaged(name, options = {}) {
  const source = await example(name);
  const bundle = await exportAuthored(source.document, source.registry, {
    selection: {kind: 'subject', ids: [`subject:${name === 'minimal' ? 'pip' : name}`]},
    visibility: 'private', audience: ['my-devices'], byteMode: 'inline',
    readAsset: async hash => source.bytes.get(hash), crypto: webcrypto, ...options});
  return {...source, bundle, candidate: await openAuthored(JSON.stringify(bundle), {crypto: webcrypto})};
}
export async function projections(bundle, name) {
  const subjectId = `subject:${name === 'minimal' ? 'pip' : name}`;
  return {plc: await receivingFixture(bundle, {target: 'plc', subjectId, crypto: webcrypto}),
    sonalon: await receivingFixture(bundle, {target: 'sonalon', subjectId, crypto: webcrypto})};
}
