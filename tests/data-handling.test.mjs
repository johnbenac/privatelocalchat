import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {DEFAULTS, cli, generate, marker} from '../scripts/data-handling.mjs';

const SCRIPT = path.resolve('scripts/data-handling.mjs');
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

/** A scratch folder with copies of the document and both inventories; `edit` may change them before use. */
function scratch(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plc-data-handling-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const paths = {doc: path.join(dir, 'DATA-HANDLING.md'), storage: path.join(dir, 'storage.json'), network: path.join(dir, 'network.json')};
  for (const k of Object.keys(paths)) fs.copyFileSync(DEFAULTS[k], paths[k]);
  return paths;
}
const args = (verb, p) => [verb, '--doc', p.doc, '--storage', p.storage, '--network', p.network];
async function run(verb, p) {
  const lines = [], errors = [];
  const log = console.error;
  console.error = (m) => errors.push(m);
  try { return {code: await cli(args(verb, p), (m) => lines.push(m)), out: lines.join('\n'), err: errors.join('\n')}; } finally { console.error = log; }
}
const edit = (file, fn) => { const j = readJson(file); fn(j); fs.writeFileSync(file, JSON.stringify(j, null, 1) + '\n'); };
const replaceIn = (file, from, to) => {
  const text = fs.readFileSync(file, 'utf8');
  assert.ok(text.includes(from), 'the test text to replace is in the file: ' + from);
  fs.writeFileSync(file, text.replace(from, to));
};

test('the repository\'s own document is current', async () => {
  const r = await run('check', DEFAULTS);
  assert.equal(r.code, 0, r.out + r.err);
  assert.match(r.out, /current/);
});

test('the generated text holds every key, database, device store and host, and nothing else', () => {
  const s = readJson(DEFAULTS.storage), n = readJson(DEFAULTS.network);
  const {storage, hosts} = generate(s, n);
  const firstCells = (text) => text.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| ---')).map((l) => l.split(' | ')[0].slice(2).replace(/`/g, ''));
  const names = new Set(firstCells(storage));
  const expected = [...s.keys.map((k) => k.key), ...s.databases.map((d) => d.name), ...s.deviceStores.map((d) => d.name)];
  for (const name of expected) assert.ok(names.has(name), name + ' is in the storage block');
  const used = new Set([...s.keys, ...s.databases, ...s.deviceStores].map((i) => i.class));
  assert.deepEqual([...names].filter((x) => !expected.includes(x) && !used.has(x) && x !== 'Class' && x !== 'Key' && x !== 'Name'), []);
  assert.equal(firstCells(storage).filter((x) => expected.includes(x)).length, expected.length, 'each appears once');
  assert.ok(storage.includes('**Keys in local and session storage (' + s.keys.length + ')**'));
  assert.ok(storage.includes('**Databases (' + s.databases.length + ')**'));
  assert.ok(storage.includes('**Device stores (' + s.deviceStores.length + ')**'));
  assert.ok(storage.includes(s.files.list.length + ' source files'));

  const hostRows = firstCells(hosts).filter((x) => x !== 'Host' && x !== 'Path');
  const all = [...Object.keys(n.appHosts), ...Object.keys(n.vendorHosts), ...Object.keys(n.ownFetchPaths)];
  assert.deepEqual([...hostRows].sort(), [...all].sort());
  for (const section of ['appHosts', 'vendorHosts', 'ownFetchPaths']) {
    assert.ok(hosts.includes('(' + Object.keys(n[section]).length + ')**'));
    for (const files of Object.values(n[section])) for (const f of files) assert.ok(hosts.includes('`' + f + '`'), f + ' is shown');
  }
  assert.match(hosts, /not a host the app contacts/);
});

test('the file list of the storage inventory is counted, not listed', () => {
  const s = readJson(DEFAULTS.storage);
  const unlisted = s.files.list.filter((f) => !s.keys.some((k) => k.owner === f) && !s.deviceStores.some((d) => d.owner.includes(f)) && !s.databases.some((d) => d.owner === f));
  assert.ok(unlisted.length > 0);
  const {storage} = generate(s, readJson(DEFAULTS.network));
  for (const f of unlisted) assert.ok(!storage.includes(f), f + ' is not listed');
});

test('output is sorted in code-point order and identical across runs', () => {
  const s = readJson(DEFAULTS.storage), n = readJson(DEFAULTS.network);
  const a = generate(s, n);
  const reversed = {...s, keys: [...s.keys].reverse(), databases: [...s.databases].reverse()};
  const n2 = {...n, appHosts: Object.fromEntries(Object.entries(n.appHosts).reverse().map(([k, v]) => [k, [...v].reverse()]))};
  assert.deepEqual(generate(reversed, n2), a);
  assert.deepEqual(generate(s, n), a);
  const keys = a.storage.split('\n').filter((l) => l.startsWith('| `')).slice(7, 7 + s.keys.length).map((l) => l.split('`')[1]);
  assert.deepEqual(keys, [...keys].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0)));
  assert.ok(!a.storage.includes('\r') && a.storage.endsWith('\n') && !a.storage.endsWith('\n\n'));
  assert.ok(!a.hosts.includes('\r') && a.hosts.endsWith('\n') && !a.hosts.endsWith('\n\n'));
});

test('a pipe in a note is escaped and a newline never reaches a cell', () => {
  const s = readJson(DEFAULTS.storage);
  s.keys[0].note = 'a | b\nsecond line';
  const {storage} = generate(s, readJson(DEFAULTS.network));
  assert.ok(storage.includes('a \\| b second line'));
  for (const l of storage.split('\n').filter((x) => x.includes('a \\| b'))) assert.equal(l.replace(/\\\|/g, '').split('|').length, 8);
});

test('a new key in the storage inventory fails check and names it', async (t) => {
  const p = scratch(t);
  edit(p.storage, (j) => j.keys.push({key: 'plc.newThing.v1', store: 'localStorage', class: 'user', owner: 'index.html', note: 'new', format: 1, since: 'v9.9.9'}));
  const r = await run('check', p);
  assert.equal(r.code, 1);
  assert.match(r.out, /plc\.newThing\.v1/);
  assert.match(r.out, /node scripts\/data-handling\.mjs write/);
});

test('a removed host fails check', async (t) => {
  const p = scratch(t);
  edit(p.network, (j) => { delete j.appHosts['github.com']; });
  const r = await run('check', p);
  assert.equal(r.code, 1);
  assert.match(r.out, /github\.com/);
});

test('check shows only the first few differences', async (t) => {
  const p = scratch(t);
  edit(p.storage, (j) => { for (const k of j.keys) k.note = 'changed ' + k.note; });
  const r = await run('check', p);
  assert.equal(r.code, 1);
  assert.ok(r.out.split('\n').length < 40, 'not the whole table');
  assert.match(r.out, /and \d+ more/);
});

test('an edited cell inside a block fails check; text outside the blocks does not', async (t) => {
  const p = scratch(t);
  replaceIn(p.doc, 'every saved chat', 'every saved chat, edited');
  assert.equal((await run('check', p)).code, 1);
  const q = scratch(t);
  replaceIn(q.doc, '# Data handling', '# Data handling (edited)');
  replaceIn(q.doc, '# Data handling', '# Data handling, edited');
  assert.equal((await run('check', q)).code, 0);
});

test('write repairs a changed block and leaves the text outside byte for byte', async (t) => {
  const p = scratch(t);
  replaceIn(p.doc, 'every saved chat', 'every saved chat, edited');
  replaceIn(p.doc, '# Data handling', '# Data handling\r\nodd line\tending  ');
  const before = fs.readFileSync(p.doc, 'utf8');
  const outside = (text) => text.replace(/(<!-- data-handling:(?:storage|hosts):start -->\n)[\s\S]*?(<!-- data-handling:(?:storage|hosts):end -->)/g, '$1$2');
  assert.equal((await run('write', p)).code, 0);
  const after = fs.readFileSync(p.doc, 'utf8');
  assert.equal(outside(after), outside(before));
  assert.equal(after, fs.readFileSync(DEFAULTS.doc, 'utf8').replace('# Data handling', '# Data handling\r\nodd line\tending  '));
  assert.equal((await run('check', p)).code, 0);
});

test('write twice changes nothing the second time', async (t) => {
  const p = scratch(t);
  replaceIn(p.doc, 'every saved chat', 'x');
  await run('write', p);
  const first = fs.readFileSync(p.doc);
  const mtime = fs.statSync(p.doc).mtimeMs;
  const r = await run('write', p);
  assert.equal(r.code, 0);
  assert.ok(fs.readFileSync(p.doc).equals(first));
  assert.equal(fs.statSync(p.doc).mtimeMs, mtime);
});

const DOC_REFUSALS = {
  'a missing start marker': (d) => d.replace(marker('storage', 'start') + '\n', ''),
  'a missing end marker': (d) => d.replace(marker('hosts', 'end') + '\n', ''),
  'a duplicated marker': (d) => d.replace(marker('storage', 'start'), marker('storage', 'start') + '\n' + marker('storage', 'start')),
  'an end before its start': (d) => d.replace(marker('storage', 'start'), 'TMP').replace(marker('storage', 'end'), marker('storage', 'start')).replace('TMP', marker('storage', 'end')),
  'blocks out of order': (d) => d.replaceAll('storage', 'TMP').replaceAll('data-handling:hosts', 'data-handling:storage').replaceAll('data-handling:TMP', 'data-handling:hosts'),
  'a marker that shares its line': (d) => d.replace(marker('hosts', 'start'), 'text ' + marker('hosts', 'start'))
};
for (const [name, mutate] of Object.entries(DOC_REFUSALS)) {
  test('refusal: ' + name + ' exits 2 and leaves the document unchanged', async (t) => {
    const p = scratch(t);
    const original = mutate(fs.readFileSync(p.doc, 'utf8'));
    assert.notEqual(original, fs.readFileSync(p.doc, 'utf8'), 'the test changed the document');
    fs.writeFileSync(p.doc, original);
    for (const verb of ['write', 'check']) {
      const r = await run(verb, p);
      assert.equal(r.code, 2, verb + ': ' + r.err);
      assert.match(r.err, /data-handling|marker|block|DATA-HANDLING/);
      assert.equal(fs.readFileSync(p.doc, 'utf8'), original);
    }
  });
}

test('refusal: a missing document exits 2 and is not created', async (t) => {
  const p = scratch(t);
  fs.rmSync(p.doc);
  for (const verb of ['write', 'check']) {
    const r = await run(verb, p);
    assert.equal(r.code, 2);
    assert.match(r.err, /does not exist/);
  }
  assert.ok(!fs.existsSync(p.doc));
});

test('refusal: a missing inventory exits 2 and names the option', async (t) => {
  const p = scratch(t);
  fs.rmSync(p.network);
  const r = await run('check', p);
  assert.equal(r.code, 2);
  assert.match(r.err, /--network/);
});

for (const which of ['storage', 'network']) {
  test('refusal: ' + which + ' inventory that is not JSON exits 2 and leaves the document unchanged', async (t) => {
    const p = scratch(t);
    fs.writeFileSync(p[which], '{not json');
    const before = fs.readFileSync(p.doc);
    const r = await run('write', p);
    assert.equal(r.code, 2);
    assert.match(r.err, /not valid JSON/);
    assert.ok(fs.readFileSync(p.doc).equals(before));
  });
}

const FIELD_REFUSALS = [
  ['storage', 'classes', (j) => { delete j.classes; }],
  ['storage', 'keys', (j) => { delete j.keys; }],
  ['storage', 'databases', (j) => { delete j.databases; }],
  ['storage', 'deviceStores', (j) => { delete j.deviceStores; }],
  ['storage', 'files.list', (j) => { delete j.files; }],
  ['storage', 'keys[2].note', (j) => { delete j.keys[2].note; }],
  ['storage', 'keys[0].since', (j) => { delete j.keys[0].since; }],
  ['storage', 'databases[1].name', (j) => { delete j.databases[1].name; }],
  ['storage', 'deviceStores[0].owner', (j) => { delete j.deviceStores[0].owner; }],
  ['storage', 'class "nowhere"', (j) => { j.keys[0].class = 'nowhere'; }],
  ['network', 'appHosts', (j) => { delete j.appHosts; }],
  ['network', 'vendorHosts', (j) => { delete j.vendorHosts; }],
  ['network', 'ownFetchPaths', (j) => { delete j.ownFetchPaths; }]
];
for (const [which, field, mutate] of FIELD_REFUSALS) {
  test('refusal: ' + which + ' inventory without ' + field + ' names it', async (t) => {
    const p = scratch(t);
    edit(p[which], mutate);
    const before = fs.readFileSync(p.doc);
    const r = await run('write', p);
    assert.equal(r.code, 2);
    assert.ok(r.err.includes(field), r.err);
    assert.ok(r.err.includes(p[which]), 'names the inventory file');
    assert.ok(fs.readFileSync(p.doc).equals(before));
  });
}

test('an unknown verb or option exits 2 with a usage message', async (t) => {
  const p = scratch(t);
  assert.equal((await cli(['frobnicate'], () => {})), 2);
  assert.equal((await cli(['check', '--bogus', 'x'], () => {})), 2);
  assert.equal((await cli(['check', '--doc'], () => {})), 2);
  assert.ok(p);
});

test('the command line: check current, check differing and write', (t) => {
  const p = scratch(t);
  const node = (verb) => spawnSync(process.execPath, [SCRIPT, ...args(verb, p)], {encoding: 'utf8', cwd: os.tmpdir()});
  const current = node('check');
  assert.equal(current.status, 0, current.stderr);
  assert.match(current.stdout, /current/);

  replaceIn(p.doc, 'every saved chat', 'every saved chat, edited');
  const differing = node('check');
  assert.equal(differing.status, 1);
  assert.match(differing.stdout, /node scripts\/data-handling\.mjs write/);

  const written = node('write');
  assert.equal(written.status, 0, written.stderr);
  assert.equal(node('check').status, 0);
  assert.equal(fs.readFileSync(p.doc, 'utf8'), fs.readFileSync(DEFAULTS.doc, 'utf8'));

  assert.equal(spawnSync(process.execPath, [SCRIPT], {encoding: 'utf8'}).status, 2);
});

test('package.json has the data-handling:check script', () => {
  assert.equal(readJson('package.json').scripts['data-handling:check'], 'node scripts/data-handling.mjs check');
});
