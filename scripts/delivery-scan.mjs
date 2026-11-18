// The neutrality scan as this application runs it (docs/DELIVERY.md): the shared engine (tools/delivery-tooling, vendored, read-only), Brand's shared rules, this application's own
// exceptions (neutrality-exceptions.json), the brand asset hashes and the network inventory as the optional host check. Used by tests/neutrality.test.mjs and scripts/release-hooks.mjs.
// Nothing here reads outside the repository.
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadRules, loadExceptions, scan, format} from '../tools/delivery-tooling/scan/neutrality.mjs';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const RULES_FILE = path.join(root, 'tests/neutrality-rules.json');
export const EXCEPTIONS_FILE = path.join(root, 'neutrality-exceptions.json');
export const BRAND_HASHES_FILE = path.join(root, 'tests/brand-asset-hashes.json');
export const INVENTORY_FILE = path.join(root, 'docs/evidence/split/network-origins.json');

/** The hosts the application knows about: its own source and its vendored libraries (scripts/network-inventory.mjs). */
export async function inventoryHosts(file = INVENTORY_FILE) {
  const inventory = JSON.parse(await readFile(file, 'utf8'));
  return new Set([...Object.keys(inventory.appHosts), ...Object.keys(inventory.vendorHosts)]);
}

/**
 * Scans folders as a copy for others is scanned. `roots` are folders (a build, an unpacked release's app/ folder, an unpacked release's own folder with app/ left out by skipPaths).
 * Options replace the files (a test's stricter rules or an extra exception) or switch the host check and the attribution check off.
 */
export async function plcScan({roots, rulesFile = RULES_FILE, exceptionsFile = EXCEPTIONS_FILE, requireAttribution = true, hostCheck = true, skipPaths = [], now}) {
  const rules = await loadRules(rulesFile);
  const exceptions = await loadExceptions(exceptionsFile, rules, now);
  return scan({roots, rules, exceptions, requireAttribution, manifests: [BRAND_HASHES_FILE], knownHosts: hostCheck ? await inventoryHosts() : null, skipPaths, now});
}
export {format};
