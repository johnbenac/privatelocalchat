// compat.json is produced from the code (scripts/compat.mjs) and the Upgrading notes from compat.json (scripts/release-notes-upgrading.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';
import {buildCompat, toJson, snapshotReleases, NOT_KEPT, FORMAT, STEP_BACK} from '../scripts/compat.mjs';
import {upgradingSection, changesBetween} from '../scripts/release-notes-upgrading.mjs';
import {KEY_CLASSES} from '../chat/vault/key-classes.mjs';
import {FILE_FORMATS} from '../chat/transfer/file-formats.mjs';
import {DB_FORMAT} from '../chat/documents/doc-store.mjs';
import {VAULT_FORMAT} from '../chat/vault/vault.mjs';

const scratch = mkdtempSync(path.join(tmpdir(), 'plc-compat-'));
test.after(() => rmSync(scratch, {recursive: true, force: true}));
const COMMIT = 'c'.repeat(40);

test('compat.json names every kept key of the key table with its format, and none of the session-only or test keys', async () => {
  const compat = await buildCompat({version: '0.64.0', commit: COMMIT});
  assert.equal(compat.format, FORMAT);
  assert.deepEqual([compat.version, compat.commit], ['0.64.0', COMMIT]);
  const kept = Object.entries(KEY_CLASSES).filter(([, v]) => !NOT_KEPT.includes(v.class));
  assert.ok(kept.length > 20);
  assert.deepEqual(Object.keys(compat.storedFormats), kept.map(([k]) => k).sort());
  for (const [key, v] of kept) assert.equal(compat.storedFormats[key], v.format, key);
  for (const [key, v] of Object.entries(KEY_CLASSES)) if (NOT_KEPT.includes(v.class)) assert.ok(!(key in compat.storedFormats), key + ' is not kept across visits');
  assert.ok('plc.voice.v2' in compat.storedFormats && 'chatThreads' in compat.storedFormats && !('plc.test.voice' in compat.storedFormats) && !('plc.draft' in compat.storedFormats));
});

test('compat.json names every file format, with what is written and every number that is read', async () => {
  const compat = await buildCompat({version: '0.64.0'});
  assert.deepEqual(Object.keys(compat.fileFormats), Object.keys(FILE_FORMATS).sort());
  for (const [name, f] of Object.entries(FILE_FORMATS)) {
    assert.equal(compat.fileFormats[name].writes, f.current, name);
    assert.deepEqual(compat.fileFormats[name].reads, Array.from({length: f.current - (f.first ?? 1) + 1}, (_, i) => (f.first ?? 1) + i), name);
  }
  assert.deepEqual(compat.fileFormats['plc-settings-transfer'], {writes: 2, reads: [2]}, 'a format that was never written as 1 is not claimed to read 1');
});

test('compat.json holds the database versions, the tested snapshots and the oldest release it upgrades from', async () => {
  const compat = await buildCompat({version: '0.64.0'});
  assert.deepEqual(compat.databases, {'plc-docs': DB_FORMAT, 'plc-vault': Number(/(\d+)$/.exec(VAULT_FORMAT)[1])});
  const folders = readdirSync('tests/fixtures/data', {withFileTypes: true}).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  assert.equal(compat.snapshots.length, folders.length);
  assert.deepEqual(compat.snapshots, folders.map((f) => /^\d+-v(\d+\.\d+\.\d+)-/.exec(f)[1]));
  assert.equal(compat.upgradesFrom.oldest, compat.snapshots[0]);
  assert.equal(compat.stepBack, STEP_BACK);
});

test('negative control: compat.json follows the tables (a changed number, a new key, a new file format and a new database version all show)', async () => {
  const base = {version: '1.0.0', keyClasses: {a: {class: 'user', format: 1}, b: {class: 'setting', format: 1}, t: {class: 'transient', format: 1}}, fileFormats: {'plc-x': {current: 1}}, docsFormat: 1, vaultFormat: 1, snapshots: ['0.5.0']};
  const before = await buildCompat(base);
  assert.deepEqual(before.storedFormats, {a: 1, b: 1});
  const after = await buildCompat({...base, keyClasses: {...base.keyClasses, a: {class: 'user', format: 2}, c: {class: 'plain', format: 1}}, fileFormats: {'plc-x': {current: 3, first: 2}, 'plc-y': {current: 1}}, docsFormat: 2, snapshots: ['0.5.0', '0.9.0']});
  assert.deepEqual(after.storedFormats, {a: 2, b: 1, c: 1});
  assert.deepEqual(after.fileFormats, {'plc-x': {writes: 3, reads: [2, 3]}, 'plc-y': {writes: 1, reads: [1]}});
  assert.equal(after.databases['plc-docs'], 2);
  assert.deepEqual(after.snapshots, ['0.5.0', '0.9.0']);
  await assert.rejects(buildCompat({...base, snapshots: []}), /no data snapshot/);
});

test('the command prints the same record, and writes it to a file with --out', async () => {
  const printed = execFileSync('node', ['scripts/compat.mjs', '--version', '0.64.0', '--commit', COMMIT], {encoding: 'utf8'});
  assert.equal(printed, toJson(await buildCompat({version: '0.64.0', commit: COMMIT})));
  const file = path.join(scratch, 'compat.json');
  execFileSync('node', ['scripts/compat.mjs', '--version', '0.64.0', '--commit', COMMIT, '--out', file]);
  assert.equal(readFileSync(file, 'utf8'), printed);
  assert.equal(JSON.parse(printed).format, FORMAT);
});

test('snapshotReleases reads the releases of the snapshot folders, oldest first', () => {
  const dir = path.join(scratch, 'snaps');
  for (const [folder, release] of [['002-v0.63.0-aaaaaaa', 'v0.63.0'], ['001-v0.56.1-bbbbbbb', 'v0.56.1']]) { mkdirSync(path.join(dir, folder), {recursive: true}); writeFileSync(path.join(dir, folder, 'meta.json'), JSON.stringify({release})); }
  assert.deepEqual(snapshotReleases(dir), ['0.56.1', '0.63.0']);
  assert.deepEqual(snapshotReleases(path.join(scratch, 'nothing-here')), []);
});

// ---- the Upgrading notes ------------------------------------------------------------------------------------------------------------------------------
const record = (overrides = {}) => ({
  format: 'plc-compat/1', version: '0.63.0', commit: null,
  storedFormats: {chatThreads: 1, 'plc.voice.v2': 2},
  databases: {'plc-docs': 1, 'plc-vault': 1},
  fileFormats: {'plc-history': {writes: 1, reads: [1]}, 'plc-settings-transfer': {writes: 2, reads: [2]}},
  snapshots: ['0.56.1', '0.63.0'],
  upgradesFrom: {oldest: '0.56.1', note: 'older versions are not tested: upgrade through a release in this range'},
  stepBack: STEP_BACK,
  ...overrides
});

test('the notes for the first release with a compat.json say so and give the formats, the oldest release, stepping back and how to check a download', () => {
  const text = upgradingSection(record({version: '0.64.0'}), null);
  assert.match(text, /^## Upgrading\n/);
  assert.match(text, /first release with a `compat\.json`/);
  assert.match(text, /Saved file `plc-history`: writes format 1, reads `1`/);
  assert.match(text, /`plc-settings-transfer`: writes format 2, reads `2`/);
  assert.match(text, /`plc-docs` version 1, `plc-vault` version 1/);
  assert.match(text, /2 keys/);
  assert.match(text, /oldest release it upgrades directly from is 0\.56\.1/);
  assert.match(text, /Going to the previous release: it leaves data of a newer format untouched \(docs\/DATA-COMPATIBILITY\.md\)\./);
  assert.match(text, /sha256sum -c SHA256SUMS/);
  assert.match(text, /gh attestation verify <zip> --repo johnbenac\/privatelocalchat/);
});

test('the notes say what changed since the previous release, and that nothing did', () => {
  const previous = record();
  assert.match(upgradingSection(record({version: '0.64.0'}), previous), /What changed since v0\.63\.0\*\*\n\nNo stored or saved format changed\./);
  const next = record({
    version: '0.65.0',
    storedFormats: {chatThreads: 2, 'plc.new.v1': 1},
    databases: {'plc-docs': 2, 'plc-vault': 1},
    fileFormats: {'plc-history': {writes: 2, reads: [1, 2]}, 'plc-settings-transfer': {writes: 2, reads: [2]}, 'plc-new': {writes: 1, reads: [1]}},
    snapshots: ['0.56.1', '0.63.0', '0.65.0']
  });
  const changes = changesBetween(previous, next);
  assert.deepEqual(changes, [
    'Stored format `chatThreads` went from format 1 to format 2.',
    'Stored format `plc.new.v1` is new (format 1).',
    'Stored format `plc.voice.v2` is no longer used.',
    'Database `plc-docs` went from version 1 to version 2.',
    'File format `plc-history` went from writes 1, reads 1 to writes 2, reads 1 and 2.',
    'File format `plc-new` is new (writes 1, reads 1).',
    'Tested to open saved data from `0.65.0` as well.'
  ]);
  const text = upgradingSection(next, previous);
  assert.match(text, /What changed since v0\.63\.0\*\*\n\n- Stored format `chatThreads` went from format 1 to format 2\./);
  assert.ok(!/No stored or saved format changed/.test(text));
  assert.deepEqual(changesBetween(next, record({...next, snapshots: ['0.63.0', '0.65.0'], upgradesFrom: {oldest: '0.63.0', note: 'n'}})).slice(-2), ['No longer tested against saved data from `0.56.1`.', 'The oldest release it upgrades directly from went from 0.56.1 to 0.63.0.']);
});

test('the command writes the notes from files, and refuses a file that is not a compat record', () => {
  const current = path.join(scratch, 'current.json'), previous = path.join(scratch, 'previous.json'), out = path.join(scratch, 'notes.md');
  writeFileSync(current, JSON.stringify(record({version: '0.64.0'})));
  writeFileSync(previous, JSON.stringify(record()));
  execFileSync('node', ['scripts/release-notes-upgrading.mjs', '--compat', current, '--previous', previous, '--out', out]);
  assert.match(readFileSync(out, 'utf8'), /What changed since v0\.63\.0\*\*\n\nNo stored or saved format changed\./);
  const stdout = execFileSync('node', ['scripts/release-notes-upgrading.mjs', '--compat', current], {encoding: 'utf8'});
  assert.match(stdout, /first release with a `compat\.json`/);
  writeFileSync(path.join(scratch, 'bad.json'), '{"format":"other"}');
  const bad = spawnSync('node', ['scripts/release-notes-upgrading.mjs', '--compat', current, '--previous', path.join(scratch, 'bad.json')], {encoding: 'utf8'});
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /--previous is not a plc-compat\/1 file/);
});
