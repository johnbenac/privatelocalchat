/** Portable content bundles. Pure records/bytes; no storage publication, network or credentials. */
import {CONTENT_SCHEMA, checkJSON, createRegistry, validateContent, ContentError} from './content.mjs';
import {validateReceipt} from './providers.mjs';

export const BUNDLE_FORMAT = 'cosmogenitor/bundle/0';
export const DEFAULT_BUNDLE_LIMITS = Object.freeze({maxMetadataBytes: 16 * 1024 * 1024,
  maxInlineAssetBytes: 8 * 1024 * 1024, maxInlineTotalBytes: 16 * 1024 * 1024,
  maxExternalAssetBytes: Number.MAX_SAFE_INTEGER, maxExternalTotalBytes: Number.MAX_SAFE_INTEGER,
  maxEntries: 100000});
const groups = ['subjects', 'contexts', 'expressions', 'assets', 'references', 'judgments', 'bindings', 'instances'];
const kinds = ['subject', 'cast', 'world', 'aesthetic', 'relationship', 'expression', 'asset', 'take', 'library'];
const json = value => JSON.parse(JSON.stringify(value));
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
const hash = value => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);
const bytesLength = value => new TextEncoder().encode(value).length;
const canonical = value => Array.isArray(value) ? value.map(canonical) : isObject(value) ?
  Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const sorted = values => [...values].sort();
const problem = (code, path, message) => ({code, path, message});
export class BundleError extends TypeError {
  constructor(errors) { super(errors.map(x => `${x.path}: ${x.message}`).join('\n')); this.name = 'BundleError'; this.errors = errors; }
}
const refuse = (code, path, message) => { throw new BundleError([problem(code, path, message)]); };
function safe(value, path = '') { const errors = checkJSON(value); if (errors.length) throw new BundleError(errors.map(e => ({...e, path: path + e.path}))); }
function limits(options = {}) {
  const result = {...DEFAULT_BUNDLE_LIMITS, ...options};
  for (const [key, value] of Object.entries(result)) if (!(key in DEFAULT_BUNDLE_LIMITS) || !Number.isSafeInteger(value) || value < 0) refuse('limits', key, 'Use documented nonnegative safe integer limits.');
  return result;
}
function checkedRegistry(registry) { try { return createRegistry(registry); } catch (error) { throw new BundleError(error instanceof ContentError ? error.errors : [problem('registry', '', 'Invalid registry.')]); } }
function checkedContent(document, registry) {
  const report = validateContent(document, registry);
  if (!report.valid) throw new BundleError(report.errors);
  return report;
}
function exact(record, allowed, path) {
  if (!isObject(record) || Object.keys(record).some(k => !allowed.includes(k))) refuse('shape', path, 'Unexpected structural field or non-record.');
}

/** Portable text is preserved literally. Known connection/secret fields cannot travel as structure. */
function portability(document, definitions, receipts, visibility) {
  const forbidden = /^(?:api[_-]?key|authorization|password|secret|credentials?|access[_-]?token|refresh[_-]?token|token|endpoint|base[_-]?url|service[_-]?url|providerConfig|connectionConfig)$/i;
  const locators = /(?:url|uri|endpoint|hostname|host|origin|locator|upload|download)$/i;
  function visit(value, path, inSchema = false) {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      const next = `${path}/${key}`;
      if (!inSchema && forbidden.test(key)) refuse('not-portable', next, 'Keep credentials and provider connection configuration outside bundles.');
      if (!inSchema && locators.test(key) && typeof child === 'string' && /^(?:https?|wss?):\/\//i.test(child)) refuse('not-portable', next, 'Live service locators do not travel in portable structural fields.');
      const schemaRoot = next === '/definitions/schema' || /^\/definitions\/aspectDefinitions\/\d+\/schema$/u.test(next);
      visit(child, next, inSchema || schemaRoot);
    }
  }
  visit(document, '/content'); visit(definitions, '/definitions'); visit(receipts, '/receipts');
  if (visibility === 'public') {
    const defs = new Map(definitions.aspectDefinitions.map(d => [d.id, d]));
    for (const subject of document.subjects || []) for (const aspect of subject.aspects || []) {
      if (aspect.claims?.some(c => c.visibility === 'author-only')) refuse('private-content', aspect.id, 'A public bundle needs an explicitly redacted document.');
      for (const path of defs.get(aspect.definition)?.privatePaths || []) {
        let current = aspect.value, present = true;
        for (const key of path === '' ? [] : path.slice(1).split('/').map(t => t.replace(/~1/g, '/').replace(/~0/g, '~'))) {
          if (!current || typeof current !== 'object' || !Object.hasOwn(current, key)) { present = false; break; }
          current = current[key];
        }
        if (present) refuse('private-content', aspect.id, 'A public bundle needs an explicitly redacted document.');
      }
    }
  }
}

/** Bounded segment portability only. Not content-schema, reference, registry or
 * receipt validation; admission must separately establish those contracts. */
export function validatePortableContent(document, registry, receipts = [], visibility = 'private') {
  if (!['private', 'public'].includes(visibility)) refuse('visibility', '', 'Choose private or public visibility explicitly.');
  safe(document); safe(registry); safe(receipts);
  if (!isObject(document) || !isObject(registry) || !Array.isArray(registry.aspectDefinitions) || !Array.isArray(receipts))
    refuse('shape', '', 'Supply content and definition records plus receipt entries.');
  for (const group of groups) if (document[group] !== undefined && (!Array.isArray(document[group]) || document[group].some(r => !isObject(r))))
    refuse('shape', group, 'Content collections must contain records.');
  for (const d of registry.aspectDefinitions) if (!isObject(d) || typeof d.id !== 'string' || d.privatePaths !== undefined &&
    (!Array.isArray(d.privatePaths) || d.privatePaths.some(p => typeof p !== 'string' || p !== '' && !p.startsWith('/') || /~(?![01])/u.test(p))))
    refuse('shape', '/definitions', 'Aspect definitions need IDs and valid private JSON pointers.');
  for (const subject of document.subjects || []) {
    if (subject.aspects !== undefined && !Array.isArray(subject.aspects)) refuse('shape', '/subjects/aspects', 'Aspects must be an array.');
    for (const a of subject.aspects || []) if (!isObject(a) || typeof a.definition !== 'string' ||
      a.claims !== undefined && (!Array.isArray(a.claims) || a.claims.some(c => !isObject(c))))
      refuse('shape', '/subjects/aspects', 'Supply aspect records and claim arrays.');
  }
  portability(document, registry, receipts, visibility);
  return true;
}

function graph(document, registry) {
  const records = new Map(), owners = new Map(), definitions = new Map(registry.aspectDefinitions.map(d => [d.id, d]));
  for (const group of groups) for (const record of document[group] || []) {
    records.set(record.id, {group, record}); owners.set(record.id, record.id);
    if (group === 'subjects') for (const aspect of record.aspects || []) owners.set(aspect.id, record.id);
    if (group === 'instances') for (const event of record.events || []) owners.set(event.id, record.id);
  }
  const links = new Map([...records.keys()].map(id => [id, new Set()]));
  const link = (id, target) => {
    if (target === undefined) return;
    const owner = owners.get(target);
    if (!owner) refuse('missing-dependency', id, `Declared dependency is absent: ${target}.`);
    links.get(id).add(owner);
  };
  function walk(value, tokens, use) {
    if (!tokens.length) { use(value); return; }
    const [token, ...rest] = tokens;
    if (token === '*') { if (!Array.isArray(value)) refuse('reference-shape', '', 'A declared wildcard reference requires an array.'); for (const v of value) walk(v, rest, use); }
    else if (value && typeof value === 'object' && Object.hasOwn(value, token)) walk(value[token], rest, use);
  }
  for (const [id, {group, record: r}] of records) {
    const refs = values => { for (const target of values || []) link(id, target); };
    if (group === 'subjects') {
      for (const participant of r.participants || []) link(id, participant.subject);
      for (const aspect of r.aspects || []) {
        if (aspect.scope.id) link(id, aspect.scope.id);
        for (const claim of aspect.claims || []) { link(id, claim.instance); link(id, claim.event); }
        for (const declaration of definitions.get(aspect.definition)?.links || []) walk(aspect.value,
          declaration.path.slice(1).split('/').map(t => t.replace(/~1/g, '/').replace(/~0/g, '~')), target => link(id, target));
      }
    } else if (group === 'contexts') { refs(r.subjects); refs(r.aesthetics); }
    else if (group === 'expressions') { for (const field of ['subjects', 'contexts', 'aspects', 'assets', 'references', 'bindings']) refs(r[field]); }
    else if (group === 'assets') link(id, r.source);
    else if (group === 'references') link(id, r.target);
    else if (group === 'judgments') { link(id, r.target); refs(r.evidence); link(id, r.context); }
    else if (group === 'bindings') { link(id, r.subject); refs(r.aspects); refs(r.references); refs(r.evidence); }
    else if (group === 'instances') link(id, r.design);
  }
  return {records, owners, links};
}

function selectedDefinitions(document, registry) {
  const profiles = new Map(registry.profiles.map(p => [p.id, p])), aspects = new Map(registry.aspectDefinitions.map(a => [a.id, a]));
  const usedProfiles = new Set(), usedAspects = new Set(), pending = [];
  for (const subject of document.subjects || []) {
    pending.push(...subject.profiles || [], ...subject.requires || []);
    for (const aspect of subject.aspects || []) usedAspects.add(aspect.definition);
  }
  while (pending.length) {
    const id = pending.pop(); if (usedProfiles.has(id)) continue; usedProfiles.add(id);
    const profile = profiles.get(id); if (!profile) continue;
    pending.push(...profile.extends || []); for (const id of profile.aspects || []) usedAspects.add(id);
  }
  return {schema: json(CONTENT_SCHEMA), profiles: sorted(usedProfiles).filter(id => profiles.has(id)).map(id => json(profiles.get(id))),
    aspectDefinitions: sorted(usedAspects).filter(id => aspects.has(id)).map(id => json(aspects.get(id)))};
}

function checkedReceipts(receipts, document) {
  safe(receipts, '/receipts'); if (!Array.isArray(receipts)) refuse('receipts', '', 'Receipts must be a list.');
  const expressions = new Set((document.expressions || []).map(e => e.id)), seen = new Set();
  for (const entry of receipts) {
    exact(entry, ['expression', 'receipt'], '/receipts');
    if (!expressions.has(entry.expression)) refuse('receipt-expression', '', 'Every receipt must name an included expression.');
    const issues = validateReceipt(entry.receipt); if (issues.length) throw new BundleError(issues);
    const id = JSON.stringify([entry.expression, entry.receipt.requestId]);
    if (seen.has(id)) refuse('duplicate-receipt', '', 'Expression/request receipt pairs must be unique.'); seen.add(id);
  }
}

/** Deterministic outgoing dependency closure, including owner records for aspect/event references. */
export function selectContent(document, registry, {selection = {kind: 'library', ids: []}, receipts = [], includeJudgments = true} = {}) {
  registry = checkedRegistry(registry); checkedContent(document, registry); checkedReceipts(receipts, document);
  safe(selection); exact(selection, ['kind', 'ids'], '/selection');
  if (!kinds.includes(selection.kind) || !Array.isArray(selection.ids) || selection.ids.some(id => !text(id)) || new Set(selection.ids).size !== selection.ids.length) refuse('selection', '', 'Choose a documented selection kind and unique IDs.');
  const {records, owners, links} = graph(document, registry), included = new Set(), pending = [];
  if (selection.kind === 'library') {
    if (selection.ids.length) refuse('selection', '', 'Whole-library selection has no subset IDs.'); pending.push(...records.keys());
  } else {
    if (!selection.ids.length) refuse('selection', '', 'A granular export needs explicit root IDs.');
    const wanted = ['expression', 'take'].includes(selection.kind) ? 'expressions' : selection.kind === 'asset' ? 'assets' : 'subjects';
    for (const id of selection.ids) { if (records.get(id)?.group !== wanted) refuse('selection', id, `Expected a ${wanted} root.`); pending.push(id); }
  }
  const receiptAssets = new Map();
  for (const asset of document.assets || []) {
    if (!receiptAssets.has(asset.sha256)) receiptAssets.set(asset.sha256, []);
    receiptAssets.get(asset.sha256).push(asset.id);
  }
  let change = true;
  while (change) {
    change = false;
    while (pending.length) {
      const id = pending.pop(); if (included.has(id)) continue; included.add(id); change = true;
      pending.push(...links.get(id));
    }
    if (includeJudgments) for (const judgment of document.judgments || []) if (included.has(owners.get(judgment.target)) && !included.has(judgment.id)) pending.push(judgment.id);
    for (const entry of receipts) if (included.has(entry.expression)) for (const output of entry.receipt.outputs) {
      const ids = receiptAssets.get(output.assetHash);
      if (!ids) refuse('missing-dependency', entry.expression, 'Receipt output bytes have no corresponding asset record.');
      pending.push(...ids.filter(id => !included.has(id)));
    }
    if (pending.length) change = true;
  }
  const selected = {format: document.format};
  for (const group of groups) {
    const values = [...records.values()].filter(x => x.group === group && included.has(x.record.id)).map(x => json(x.record)).sort((a, b) => a.id.localeCompare(b.id));
    if (values.length) selected[group] = values;
  }
  // Source-device storage placement is not portable availability on the recipient.
  for (const asset of selected.assets || []) asset.availability = 'missing';
  const definitions = selectedDefinitions(selected, registry), selectedRegistry = checkedRegistry(definitions);
  const selectedReceipts = receipts.filter(r => included.has(r.expression)).map(json).sort((a, b) => JSON.stringify([a.expression, a.receipt.requestId]).localeCompare(JSON.stringify([b.expression, b.receipt.requestId])));
  checkedContent(selected, selectedRegistry); checkedReceipts(selectedReceipts, selected);
  return {document: selected, definitions, registry: selectedRegistry, receipts: selectedReceipts,
    records: [...records].filter(([id]) => included.has(id)).map(([id, item]) => ({id, collection: item.group})).sort((a, b) => a.id.localeCompare(b.id)),
    selection: {kind: selection.kind, ids: sorted(selection.ids)}};
}

export async function sha256Bytes(bytes, crypto = globalThis.crypto) {
  if (!(bytes instanceof Uint8Array)) refuse('bytes', '', 'Supply a Uint8Array.');
  if (!crypto?.subtle) refuse('crypto-unavailable', '', 'SHA-256 requires Web Crypto or an injected compatible implementation.');
  return 'sha256:' + [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('');
}
function hexDigest(value) {
  if (value instanceof Uint8Array && value.length === 32) return 'sha256:' + [...value].map(x => x.toString(16).padStart(2, '0')).join('');
  if (hash(value)) return value;
  refuse('digest', '', 'Incremental digest must return 32 bytes or a lowercase SHA-256 address.');
}
async function externalCheck(open, entry, factory) {
  if (typeof open !== 'function' || typeof factory !== 'function') refuse('external-bytes', entry.hash, 'External bytes require an explicit opener and incremental hasher factory.');
  const hasher = factory(); if (!hasher || typeof hasher.update !== 'function' || typeof hasher.digest !== 'function') refuse('hasher', '', 'Supply update(chunk) and digest() methods.');
  const stream = await open(entry.hash); if (!stream || typeof stream[Symbol.asyncIterator] !== 'function') refuse('external-bytes', entry.hash, 'External byte source must be an AsyncIterable<Uint8Array>.');
  let size = 0;
  for await (const chunk of stream) {
    if (!(chunk instanceof Uint8Array)) refuse('bytes', entry.hash, 'External chunks must be Uint8Array values.');
    size += chunk.byteLength; if (!Number.isSafeInteger(size) || size > entry.size) refuse('byte-size', entry.hash, 'External bytes exceed their declared length.');
    await hasher.update(chunk);
  }
  if (size !== entry.size || hexDigest(await hasher.digest()) !== entry.hash) refuse('byte-integrity', entry.hash, 'External byte size or SHA-256 mismatch.');
}
function base64(bytes) {
  let encoded = ''; for (let i = 0; i < bytes.length; i += 16384) encoded += String.fromCharCode(...bytes.subarray(i, i + 16384));
  return btoa(encoded);
}
function unbase64(value, max) {
  if (typeof value !== 'string' || value.length > Math.ceil(max / 3) * 4 || value.length % 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) refuse('base64', '', 'Use bounded canonical base64.');
  let decoded; try { decoded = atob(value); } catch { refuse('base64', '', 'Invalid base64.'); }
  if (decoded.length > max) refuse('inline-limit', '', 'Inline bytes exceed the configured bound.');
  const bytes = Uint8Array.from(decoded, c => c.charCodeAt(0));
  if (base64(bytes) !== value) refuse('base64', '', 'Use canonical base64 padding.');
  return bytes;
}
function metadata(bundle) {
  const {root, assets, ...rest} = bundle;
  return {...json(rest), assets: assets.map(entry => { const {data, ...descriptor} = entry; return json(descriptor); })};
}
async function rootOf(bundle, crypto) { return sha256Bytes(new TextEncoder().encode(JSON.stringify(canonical(metadata(bundle)))), crypto); }

/** Build an envelope, verifying supplied bytes without writing or silently fetching missing data. */
export async function exportBundle(document, registry, {selection, visibility = 'private', audience = [], receipts = [],
  byteMode = 'metadata', readAsset, hasherFactory, limits: configured, crypto = globalThis.crypto, includeJudgments = true} = {}) {
  const bounds = limits(configured), selected = selectContent(document, registry, {selection, receipts, includeJudgments});
  if (!['private', 'public'].includes(visibility) || !Array.isArray(audience) || audience.some(x => !text(x)) || new Set(audience).size !== audience.length) refuse('visibility', '', 'Choose explicit visibility and unique audience labels.');
  if (!['inline', 'external', 'metadata'].includes(byteMode)) refuse('byte-mode', '', 'Choose inline, external or metadata-only bytes.');
  const bundle = {format: BUNDLE_FORMAT, selection: selected.selection, visibility, audience: sorted(audience), content: selected.document,
    definitions: selected.definitions, receipts: selected.receipts, records: selected.records, assets: []};
  portability(bundle.content, bundle.definitions, bundle.receipts, visibility);
  const entries = new Map();
  for (const asset of selected.document.assets || []) {
    if (!Number.isSafeInteger(asset.size)) refuse('byte-size', asset.id, 'Asset sizes must be safe integers.');
    if (entries.has(asset.sha256) && entries.get(asset.sha256).size !== asset.size) refuse('byte-size', asset.id, 'One content hash cannot claim different byte lengths.');
    entries.set(asset.sha256, {hash: asset.sha256, size: asset.size, status: 'missing'});
  }
  let inlineTotal = 0, externalTotal = 0;
  for (const entry of [...entries.values()].sort((a, b) => a.hash.localeCompare(b.hash))) {
    if (byteMode === 'inline' && readAsset) {
      if (entry.size > bounds.maxInlineAssetBytes || inlineTotal + entry.size > bounds.maxInlineTotalBytes) refuse('inline-limit', entry.hash, 'Use the external streaming format for large media.');
      const supplied = await readAsset(entry.hash);
      if (supplied !== undefined && supplied !== null) {
        if (!(supplied instanceof Uint8Array) || supplied.byteLength !== entry.size) refuse('byte-integrity', entry.hash, 'Inline byte size or SHA-256 mismatch.');
        const bytes = new Uint8Array(supplied);
        if (await sha256Bytes(bytes, crypto) !== entry.hash) refuse('byte-integrity', entry.hash, 'Inline byte size or SHA-256 mismatch.');
        entry.status = 'inline'; entry.data = base64(bytes); inlineTotal += entry.size;
      }
    } else if (byteMode === 'external' && readAsset) {
      if (entry.size > bounds.maxExternalAssetBytes || externalTotal + entry.size > bounds.maxExternalTotalBytes) refuse('external-limit', entry.hash, 'External media exceeds the configured bound.');
      await externalCheck(readAsset, entry, hasherFactory); entry.status = 'external'; externalTotal += entry.size;
    }
    bundle.assets.push(entry);
  }
  if (bundle.records.length > bounds.maxEntries || bytesLength(JSON.stringify(metadata(bundle))) > bounds.maxMetadataBytes) refuse('metadata-limit', '', 'Bundle metadata exceeds the configured bound.');
  bundle.root = await rootOf(bundle, crypto);
  return bundle;
}

function envelope(bundle, bounds) {
  safe(bundle); exact(bundle, ['format', 'selection', 'visibility', 'audience', 'content', 'definitions', 'receipts', 'records', 'assets', 'root'], '');
  if (bundle.format !== BUNDLE_FORMAT || !hash(bundle.root) || !isObject(bundle.content) || !isObject(bundle.definitions) || !Array.isArray(bundle.receipts) || !Array.isArray(bundle.records) || !Array.isArray(bundle.assets)) refuse('shape', '', 'Missing or invalid bundle envelope fields.');
  exact(bundle.definitions, ['schema', 'profiles', 'aspectDefinitions'], '/definitions');
  if (!Array.isArray(bundle.definitions.profiles) || !Array.isArray(bundle.definitions.aspectDefinitions)) refuse('shape', '/definitions', 'Bundle definitions must explicitly list profiles and aspects.');
  if (!['private', 'public'].includes(bundle.visibility) || !Array.isArray(bundle.audience) || bundle.audience.some(x => !text(x)) || new Set(bundle.audience).size !== bundle.audience.length) refuse('visibility', '', 'Invalid bundle visibility or audience.');
  if (bundle.records.length > bounds.maxEntries || bundle.assets.length > bounds.maxEntries || bytesLength(JSON.stringify(metadata(bundle))) > bounds.maxMetadataBytes) refuse('metadata-limit', '', 'Bundle metadata exceeds the configured bound.');
  const seen = new Set(); let inlineTotal = 0, externalTotal = 0;
  for (const entry of bundle.assets) {
    exact(entry, ['hash', 'size', 'status', 'data'], '/assets');
    if (!hash(entry.hash) || !Number.isSafeInteger(entry.size) || entry.size < 0 || !['inline', 'external', 'missing'].includes(entry.status)) refuse('shape', '/assets', 'Invalid asset descriptor.');
    if (seen.has(entry.hash)) refuse('duplicate-asset', entry.hash, 'Byte objects must be unique by hash.'); seen.add(entry.hash);
    if (entry.status === 'inline') {
      inlineTotal += entry.size;
      if (entry.size > bounds.maxInlineAssetBytes || inlineTotal > bounds.maxInlineTotalBytes) refuse('inline-limit', entry.hash, 'Inline bytes exceed the configured bound.');
      if (typeof entry.data !== 'string') refuse('shape', entry.hash, 'Inline byte data is missing.');
      if (entry.data.length > Math.ceil(entry.size / 3) * 4) refuse('inline-limit', entry.hash, 'Encoded bytes exceed their declared size.');
    } else {
      if (entry.data !== undefined) refuse('shape', entry.hash, 'External and missing descriptors cannot hide inline data.');
      if (entry.status === 'external') {
        externalTotal += entry.size;
        if (entry.size > bounds.maxExternalAssetBytes || externalTotal > bounds.maxExternalTotalBytes) refuse('external-limit', entry.hash, 'External bytes exceed the configured bound.');
      }
    }
  }
}

/** Verify completely, then return a candidate. The caller stages/adopts bytes only after review. */
export async function importBundle(bundle, {openExternal, hasherFactory, limits: configured, crypto = globalThis.crypto} = {}) {
  const bounds = limits(configured); envelope(bundle, bounds);
  const candidate = json(bundle);
  if (await rootOf(candidate, crypto) !== candidate.root) refuse('root-integrity', '', 'Bundle metadata hash does not match.');
  const registry = checkedRegistry(candidate.definitions);
  const support = checkedContent(candidate.content, registry); checkedReceipts(candidate.receipts, candidate.content);
  portability(candidate.content, candidate.definitions, candidate.receipts, candidate.visibility);
  const selected = selectContent(candidate.content, registry, {selection: candidate.selection, receipts: candidate.receipts});
  const actualRecords = groups.flatMap(collection => (candidate.content[collection] || []).map(r => ({id: r.id, collection}))).sort((a, b) => a.id.localeCompare(b.id));
  if (JSON.stringify(canonical(actualRecords)) !== JSON.stringify(canonical(candidate.records))) refuse('record-manifest', '', 'Record manifest does not describe the supplied content.');
  // Every declared root and dependency must be present; explicit extra records may travel too.
  if (selected.records.some(r => !actualRecords.some(a => a.id === r.id))) refuse('missing-dependency', '', 'Selected dependency closure is incomplete.');
  const manifests = new Map(candidate.assets.map(a => [a.hash, a]));
  const expectedHashes = new Set();
  for (const asset of candidate.content.assets || []) {
    expectedHashes.add(asset.sha256);
    if (!manifests.has(asset.sha256) || manifests.get(asset.sha256).size !== asset.size) refuse('asset-manifest', asset.id, 'Asset metadata and byte manifest disagree.');
    if (asset.availability !== 'missing') refuse('availability', asset.id, 'Recipient availability is determined after byte admission, not copied from another device.');
  }
  if (expectedHashes.size !== manifests.size) refuse('asset-manifest', '', 'Bundle contains undeclared byte objects.');
  for (const entry of candidate.receipts) for (const output of entry.receipt.outputs) if (!expectedHashes.has(output.assetHash)) refuse('receipt-output', entry.expression, 'Receipt output is absent from the asset manifest.');
  const inlineBytes = new Map(), verifiedExternal = [], missing = [];
  for (const entry of candidate.assets) {
    if (entry.status === 'inline') {
      const bytes = unbase64(entry.data, Math.min(bounds.maxInlineAssetBytes, entry.size));
      if (bytes.byteLength !== entry.size || await sha256Bytes(bytes, crypto) !== entry.hash) refuse('byte-integrity', entry.hash, 'Inline bytes do not match the manifest.');
      inlineBytes.set(entry.hash, bytes);
    } else if (entry.status === 'external') { await externalCheck(openExternal, entry, hasherFactory); verifiedExternal.push(entry.hash); }
    else missing.push(entry.hash);
  }
  return {document: candidate.content, registry, receipts: candidate.receipts, visibility: candidate.visibility,
    audience: candidate.audience, selection: candidate.selection, inlineBytes, verifiedExternal, missing, support};
}

/** Parse a bounded inline JSON file. External archive readers should call importBundle directly. */
export async function parseBundle(textValue, options = {}) {
  const bounds = limits(options.limits);
  const maximum = bounds.maxMetadataBytes + Math.ceil(bounds.maxInlineTotalBytes / 3) * 4 + 1024;
  if (typeof textValue !== 'string' || textValue.length > maximum || bytesLength(textValue) > maximum) refuse('file-limit', '', 'Bundle file exceeds configured bounds.');
  let value; try { value = JSON.parse(textValue); } catch { refuse('json', '', 'Malformed bundle JSON.'); }
  // Use a lexical duplicate-key check: JSON.parse alone would erase conflicting fields.
  const stack = [];
  for (const token of textValue.match(/"(?:\\.|[^"\\])*"|[{}\[\],:]|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/g) || []) {
    if (token === '{') stack.push({object: true, key: true, keys: new Set()});
    else if (token === '[') stack.push({object: false});
    else if (token === '}' || token === ']') stack.pop();
    else if (token === ',' && stack.at(-1)?.object) stack.at(-1).key = true;
    else if (token.startsWith('"') && stack.at(-1)?.object && stack.at(-1).key) {
      const frame = stack.at(-1), key = JSON.parse(token);
      if (frame.keys.has(key)) refuse('duplicate-key', '', `Duplicate JSON property: ${key}.`);
      frame.keys.add(key); frame.key = false;
    }
  }
  return importBundle(value, options);
}
