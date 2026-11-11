#!/usr/bin/env node
// An inventory of every host the app's code names, and of the paths it fetches from its own origin.
//
//   node scripts/network-inventory.mjs write     rewrite docs/evidence/split/network-origins.json from the source
//   node scripts/network-inventory.mjs check     exit 1 and show the difference if the source and the committed inventory disagree
//
// A host appearing in the source is not proof of a request: the provider list and documentation links name hosts that are only
// contacted when a person chooses them, and namespace strings are never fetched. The inventory is the complete list to review
// when the app's network behaviour is described, and a change to it is always a deliberate one.
import {readFile, writeFile, readdir} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

export const INVENTORY_FILE = 'docs/evidence/split/network-origins.json';
const ROOTS = ['index.html', 'local-models.js', 'local-models.css', 'conversation-messages.mjs', 'chat', 'runtime', 'brand'];
const CODE = /\.(mjs|js|html|css|json|svg)$/;
const SKIP_FILE = /vectors/; // embedding data for the intent router
const HOST = /\b(?:https?|wss?):\/\/([A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?)(?::\d+)?/g;
const OWN_FETCH = /fetch\(\s*['"`](\/[^'"`?\s]*)/g;

async function sourceFiles(root) {
  const files = [];
  async function walk(p) {
    let entries;
    try { entries = await readdir(path.join(root, p), {withFileTypes: true}); } catch { files.push(p); return; }
    for (const entry of entries) await walk(path.posix.join(p, entry.name));
  }
  for (const r of ROOTS) await walk(r);
  return files.filter((f) => CODE.test(f) && !SKIP_FILE.test(f)).sort();
}

/** The inventory of the source tree at `root`. */
export async function scan(root = process.cwd()) {
  const appHosts = {}, vendorHosts = {}, ownFetchPaths = {};
  const add = (bucket, key, file) => { (bucket[key] ||= new Set()).add(file); };
  for (const file of await sourceFiles(root)) {
    let text;
    try { text = await readFile(path.join(root, file), 'utf8'); } catch { continue; }
    const vendor = file.split('/').includes('vendor');
    for (const m of text.matchAll(HOST)) add(vendor ? vendorHosts : appHosts, m[1].toLowerCase(), file);
    if (!vendor) for (const m of text.matchAll(OWN_FETCH)) add(ownFetchPaths, m[1], file);
  }
  const sorted = (bucket) => Object.fromEntries(Object.keys(bucket).sort().map((k) => [k, [...bucket[k]].sort()]));
  return {
    format: 'plc-network-inventory/1',
    about: 'Hosts named by the app source (appHosts), by vendored libraries (vendorHosts), and paths the app fetches from its own origin (ownFetchPaths). A host named here is not necessarily contacted; see scripts/network-inventory.mjs.',
    appHosts: sorted(appHosts),
    vendorHosts: sorted(vendorHosts),
    ownFetchPaths: sorted(ownFetchPaths)
  };
}

/** What differs between two inventories, as readable lines. */
export function compareInventories(committed, current) {
  const lines = [];
  for (const section of ['appHosts', 'vendorHosts', 'ownFetchPaths']) {
    for (const key of new Set([...Object.keys(committed[section] || {}), ...Object.keys(current[section] || {})])) {
      const before = (committed[section] || {})[key], after = (current[section] || {})[key];
      if (!before) lines.push(section + ': new entry ' + key + ' in ' + after.join(', '));
      else if (!after) lines.push(section + ': ' + key + ' is no longer named');
      else if (before.join() !== after.join()) lines.push(section + ': ' + key + ' moved from [' + before.join(', ') + '] to [' + after.join(', ') + ']');
    }
  }
  return lines;
}

async function cli(command) {
  const current = await scan();
  if (command === 'write') {
    await writeFile(INVENTORY_FILE, JSON.stringify(current, null, 1) + '\n');
    console.log('Wrote ' + INVENTORY_FILE + ': ' + Object.keys(current.appHosts).length + ' app hosts, ' + Object.keys(current.vendorHosts).length + ' vendor hosts');
    return 0;
  }
  if (command === 'check') {
    const differences = compareInventories(JSON.parse(await readFile(INVENTORY_FILE, 'utf8')), current);
    console.log(differences.length ? differences.join('\n') + '\nIf this change is intended, run: node scripts/network-inventory.mjs write' : 'The network inventory is current.');
    return differences.length ? 1 : 0;
  }
  console.error('Usage: network-inventory.mjs write | check');
  return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await cli(process.argv[2]);
