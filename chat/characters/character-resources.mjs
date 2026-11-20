// Resources a person supplies as separate local files, for a character package whose bytes are not inside the package. Pure: no DOM, no storage, no network.
//
// A package can declare that some of its resources live outside it (status `external`: a hash, a size, no bytes). This app never resolves an address for them: the
// person chooses the files, this module checks the files against the manifest BEFORE any byte is read (count, each size, the total), maps every file to a declared
// resource by the file's actual SHA-256, and hands the producer validators an opener and an incremental hasher over those held bytes. The producer then verifies
// every byte against its own manifest exactly as for inline bytes (chat/characters/character-package.mjs keeps the verified copies).
//
//   externalResourcesOf(text)               -> [{ hash, size }]   the declared external resources of a package text (bounded input, [] on anything unreadable)
//   checkResourceFiles(files, declared)     -> { ok: true } | { ok: false, code, message }     files: [{ name, size }] (nothing read yet)
//   matchResourceFiles(entries, declared, crypto) -> Promise<{ ok, adapters, matched, unmatched, missing }>     entries: [{ name, bytes: Uint8Array }]
import { CHARACTER_PACKAGE_LIMITS } from './character-package.mjs';

const refuse = (code, message) => ({ ok: false, code, message });
const HASH = /^sha256:[a-f0-9]{64}$/;
const kb = (n) => Math.round(n / 1024);

export function externalResourcesOf(text) {
  if (typeof text !== 'string' || text.length > CHARACTER_PACKAGE_LIMITS.fileBytes) return [];
  let value;
  try { value = JSON.parse(text); } catch { return []; }
  if (!value || typeof value !== 'object' || !Array.isArray(value.assets)) return [];
  const seen = new Set(); const out = [];
  for (const a of value.assets.slice(0, CHARACTER_PACKAGE_LIMITS.producer.maxEntries)) {
    if (a && a.status === 'external' && typeof a.hash === 'string' && HASH.test(a.hash) && Number.isSafeInteger(a.size) && a.size >= 0 && !seen.has(a.hash)) { seen.add(a.hash); out.push({ hash: a.hash, size: a.size }); }
  }
  return out;
}

export function checkResourceFiles(files, declared) {
  const L = CHARACTER_PACKAGE_LIMITS.producer;
  if (!Array.isArray(files) || !files.length) return refuse('none', 'Choose the resource files that go with this package.');
  if (files.length > declared.length) return refuse('count', 'This package declares ' + declared.length + ' resource file' + (declared.length === 1 ? '' : 's') + ' and ' + files.length + ' were chosen. Nothing was read.');
  let total = 0;
  const sizes = declared.map((d) => d.size);
  for (const f of files) {
    if (!f || !Number.isSafeInteger(f.size) || f.size < 0) return refuse('size', 'A chosen file cannot be measured. Nothing was read.');
    if (f.size > L.maxExternalAssetBytes) return refuse('too-large', '“' + String(f.name).slice(0, 80) + '” is larger than one resource may be (' + kb(L.maxExternalAssetBytes) + ' KB). Nothing was read.');
    total += f.size;
    if (total > L.maxExternalTotalBytes) return refuse('too-large', 'The chosen files are together larger than a package may carry (' + kb(L.maxExternalTotalBytes) + ' KB). Nothing was read.');
    if (!sizes.includes(f.size)) return refuse('unknown', '“' + String(f.name).slice(0, 80) + '” is not the size of any resource this package declares. Nothing was read.');
  }
  return { ok: true };
}

const hex = (buffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Hash each chosen file (already within the bounds above) and map it to a declared resource; the producer still verifies every byte afterwards. */
export async function matchResourceFiles(entries, declared, crypto = globalThis.crypto) {
  const byHash = new Map(); const unmatched = [];
  const want = new Map(declared.map((d) => [d.hash, d.size]));
  for (const e of entries) {
    const hash = 'sha256:' + hex(await crypto.subtle.digest('SHA-256', e.bytes));
    if (want.has(hash) && want.get(hash) === e.bytes.byteLength) { if (!byHash.has(hash)) byHash.set(hash, e.bytes); else unmatched.push({ name: e.name, reason: 'duplicate' }); }
    else unmatched.push({ name: e.name, reason: 'not-declared' });
  }
  const missing = declared.filter((d) => !byHash.has(d.hash));
  const openExternal = async (hash) => {
    const bytes = byHash.get(hash);
    if (!bytes) throw Object.assign(new Error('No chosen file for this resource.'), { errors: [{ code: 'external-bytes', path: hash, message: 'No chosen file for this resource.' }] });
    return (async function* () { yield new Uint8Array(bytes); })();
  };
  const hasherFactory = () => {
    const chunks = []; let size = 0;
    return {
      update(chunk) { size += chunk.byteLength; chunks.push(new Uint8Array(chunk)); },
      digest: async () => { const all = new Uint8Array(size); let at = 0; for (const c of chunks) { all.set(c, at); at += c.byteLength; } return new Uint8Array(await crypto.subtle.digest('SHA-256', all)); },
    };
  };
  return { ok: !unmatched.length, adapters: { openExternal, hasherFactory }, matched: [...byHash.keys()], unmatched, missing };
}
