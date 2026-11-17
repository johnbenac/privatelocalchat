// docs/DATA-HANDLING.md names files and, in its last section, the place in a file that makes each statement true. This test keeps those references from rotting:
// every file the document writes in backticks exists, and every row of the table of section 6 names a file that exists and a symbol or text that is in it.
// It checks that the place is there, not that the sentence is still true of it. The prose itself is checked by reading (see section 6 of the document).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {RELEASE_TOOLS} from '../scripts/package-release.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOC = path.join(ROOT, 'docs', 'DATA-HANDLING.md');

// Files that exist in a release zip or in an operator's folder but not in the repository. They are listed by hand so that a mistyped path still fails.
const ZIP_ROOT_ONLY = new Set(['models.json', 'compat.json']);
const OPERATOR_FILES = new Set(['config/app-config.json', 'config/site.json', 'current.json']);
const OPERATOR_PREFIXES = ['pages/']; // the operator's own pages: pages/<name>/index.html
// Files a later task of the same stage creates. The entry must go when the file exists (the test below fails then, on purpose), so this cannot hide a file that never came.
const PENDING = new Map(); // a file the document names before it exists goes here with the reason; the test fails once the file exists, so the entry gets removed

const FILE_EXTENSIONS = /\.(mjs|js|json|md|yml)$/;
// What a repository path looks like inside backticks: no leading slash (that is an address on a host, like /version.json), no space, no colon, no angle brackets.
const PATH_LIKE = /^[A-Za-z0-9_][A-Za-z0-9_.-]*(\/[A-Za-z0-9_.-]+)*\/?$/;

const exists = (root, rel, kind) => { try { const s = fs.statSync(path.join(root, rel)); return kind === 'dir' ? s.isDirectory() : s.isFile(); } catch { return false; } };

/** The paths written in backticks, with their line numbers. */
export function pathTokens(text) {
  const found = [];
  text.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(/`([^`\n]+)`/g)) {
      const token = m[1];
      if (!PATH_LIKE.test(token)) continue;
      const folder = token.endsWith('/');
      if (folder || FILE_EXTENSIONS.test(token)) found.push({line: i + 1, token, folder});
    }
  });
  return found;
}

function checkPath({line, token, folder}, root, pending) {
  if (pending.has(token)) return exists(root, token, 'file') ? `line ${line}: \`${token}\` exists now. Remove it from PENDING in tests/data-handling-references.test.mjs.` : null;
  if (OPERATOR_FILES.has(token) || OPERATOR_PREFIXES.some((p) => token.startsWith(p))) return null;
  if (folder) return exists(root, token, 'dir') ? null : `line ${line}: the folder \`${token}\` does not exist in the repository. Fix the path in docs/DATA-HANDLING.md or restore the folder.`;
  if (!token.includes('/')) {
    // a file of the release zip root is written without a folder: the tools are checked against the list the packager uses, the others against the repository root or scripts/
    if (RELEASE_TOOLS.includes(token) || ZIP_ROOT_ONLY.has(token) || exists(root, token, 'file') || exists(root, 'scripts/' + token, 'file')) return null;
    return `line ${line}: \`${token}\` is not in the repository root, in scripts/, or in the list of tools a release carries. Fix the name in docs/DATA-HANDLING.md.`;
  }
  return exists(root, token, 'file') ? null : `line ${line}: the file \`${token}\` does not exist in the repository. Fix the path in docs/DATA-HANDLING.md or restore the file.`;
}

const HEADER = /^\|\s*Statement\s*\|\s*File\s*\|\s*Symbol or text\s*\|\s*$/;
const unquote = (cell) => { const t = cell.trim(); return t.length > 1 && t.startsWith('`') && t.endsWith('`') ? t.slice(1, -1) : t; };

/** The rows of the table of section 6: { line, statement, file, symbol, columns }. Empty when the document has no such table. */
export function tableRows(text) {
  const lines = text.split('\n');
  const head = lines.findIndex((l) => HEADER.test(l));
  if (head < 0) return [];
  const rows = [];
  for (let i = head + 2; i < lines.length && lines[i].startsWith('|'); i++) {
    const cells = lines[i].trim().replace(/^\|/, '').replace(/\|$/, '').split('|');
    rows.push({line: i + 1, columns: cells.length, statement: (cells[0] || '').trim(), file: unquote(cells[1] || ''), symbol: unquote(cells[2] || '')});
  }
  return rows;
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// A name made of word characters must appear as a word (so `siteLinks` is not satisfied by `siteLinksOld`); any other text must appear as it is written.
const appearsIn = (symbol, source) => (/^[A-Za-z_$][\w$]*$/.test(symbol) ? new RegExp('(?<![\\w$])' + escapeRegExp(symbol) + '(?![\\w$])').test(source) : source.includes(symbol));

function checkRow(row, root) {
  if (row.columns !== 3) return `line ${row.line}: the row has ${row.columns} columns, not 3 (Statement, File, Symbol or text). A | inside a cell splits it: leave it out.`;
  if (!row.statement || !row.file || !row.symbol) return `line ${row.line}: the row has an empty cell. Give the statement, the file and the symbol or text.`;
  if (!exists(root, row.file, 'file')) return `line ${row.line}: the file \`${row.file}\` of the row "${row.statement}" does not exist in the repository.`;
  const source = fs.readFileSync(path.join(root, row.file), 'utf8');
  return appearsIn(row.symbol, source) ? null : `line ${row.line}: \`${row.symbol}\` is not in \`${row.file}\` (row "${row.statement}"). Update the row to where the code is now.`;
}

/** Everything wrong with the references of a document, as readable lines. Empty means fine. */
export function checkDocument(text, {root = ROOT, pending = PENDING} = {}) {
  const problems = [];
  for (const token of pathTokens(text)) { const p = checkPath(token, root, pending); if (p) problems.push(p); }
  for (const row of tableRows(text)) { const p = checkRow(row, root); if (p) problems.push(p); }
  return problems;
}

const realText = fs.readFileSync(DOC, 'utf8');

/** A temporary copy of the document with `change` applied to its text; the copy is what the checker reads. */
function withCopy(t, change) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plc-data-handling-refs-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const file = path.join(dir, 'DATA-HANDLING.md');
  fs.writeFileSync(file, change(realText));
  return fs.readFileSync(file, 'utf8');
}
const firstRow = () => tableRows(realText)[0];

test('every file and folder the document names exists, and every row of the table of section 6 finds its symbol', () => {
  const problems = checkDocument(realText);
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('the document has its table, in a form this test can read, and no placeholder is left', () => {
  const rows = tableRows(realText);
  assert.ok(rows.length >= 100, 'the table of section 6 has ' + rows.length + ' rows; the statements of sections 1 to 4 need at least 100');
  for (const row of rows) assert.equal(row.columns, 3, 'line ' + row.line + ' has three columns');
  assert.doesNotMatch(realText, /^Placeholder:/m, 'a section still holds the placeholder line');
  for (const heading of ['## 1. ', '## 2. ', '## 3. ', '## 4. ', '## 5. ', '## 6. ']) assert.ok(realText.includes('\n' + heading), 'the document has the section ' + heading.trim());
});

test('a path that does not exist fails and the message names the line', (t) => {
  const text = withCopy(t, (doc) => doc.replace('# Data handling\n', '# Data handling\n\nSee `docs/NO-SUCH-DOCUMENT.md` for more.\n'));
  const line = text.split('\n').findIndex((l) => l.includes('NO-SUCH-DOCUMENT')) + 1;
  const problems = checkDocument(text);
  assert.equal(problems.length, 1, problems.join('\n'));
  assert.match(problems[0], new RegExp('^line ' + line + ': .*docs/NO-SUCH-DOCUMENT\\.md'));
});

test('a folder that does not exist fails, and one that does exist passes', (t) => {
  const bad = withCopy(t, (doc) => doc + '\nThe code is in `chat/no-such-folder/`.\n');
  assert.match(checkDocument(bad).join('\n'), /the folder `chat\/no-such-folder\/` does not exist/);
  const good = withCopy(t, (doc) => doc + '\nThe code is in `chat/vault/`.\n');
  assert.deepEqual(checkDocument(good), []);
});

test('a bare file name is checked against the tools a release carries, the repository root and scripts/', (t) => {
  assert.deepEqual(checkDocument(withCopy(t, (doc) => doc + '\nRun `plc.mjs` or `serve.mjs`, read `models.json`, open `index.html`.\n')), []);
  const bad = checkDocument(withCopy(t, (doc) => doc + '\nRun `no-such-tool.mjs`.\n'));
  assert.equal(bad.length, 1);
  assert.match(bad[0], /`no-such-tool\.mjs` is not in the repository root, in scripts\/, or in the list of tools/);
});

test('files of the operator folder are accepted only as the exact names listed, and an address on a host is not a path', (t) => {
  assert.deepEqual(checkDocument(withCopy(t, (doc) => doc + '\nPut it in `config/site.json` or `pages/privacy/index.html`; `/version.json` and `/sw.js` are asked of the host.\n')), []);
  const bad = checkDocument(withCopy(t, (doc) => doc + '\nPut it in `config/other.json`.\n'));
  assert.equal(bad.length, 1);
  assert.match(bad[0], /`config\/other\.json` does not exist/);
});

test('a symbol that is not in the file fails and the message names the line', (t) => {
  const row = firstRow();
  const text = withCopy(t, (doc) => doc.split('\n').map((l, i) => (i + 1 === row.line ? l.replace('`' + row.symbol + '`', '`ThisNameIsInNoFile`') : l)).join('\n'));
  const problems = checkDocument(text);
  assert.equal(problems.length, 1, problems.join('\n'));
  assert.match(problems[0], new RegExp('^line ' + row.line + ': `ThisNameIsInNoFile` is not in `' + row.file.replace(/[.]/g, '\\.') + '`'));
});

test('a name must appear as a word: a longer name that contains it does not count', (t) => {
  // `canonicalize` is in chat/provider/endpoint-tokens.mjs; `canonicalizeAll` is not, though it contains it
  const source = 'chat/provider/endpoint-tokens.mjs';
  const rowOf = (symbol) => `| A statement | \`${source}\` | \`${symbol}\` |`;
  const table = (symbol) => '| Statement | File | Symbol or text |\n| --- | --- | --- |\n' + rowOf(symbol) + '\n';
  assert.deepEqual(checkDocument(table('canonicalize')), []);
  assert.equal(checkDocument(table('canonicalizeAll')).length, 1);
  assert.equal(checkDocument(table('canonicali')).length, 1);
  // text that is not a name is found as written
  assert.deepEqual(checkDocument(table('is never offered to another')), []);
});

test('a row that names a missing file fails and the message names the line', (t) => {
  const row = firstRow();
  const text = withCopy(t, (doc) => doc.split('\n').map((l, i) => (i + 1 === row.line ? l.replace('`' + row.file + '`', '`chat/no-such-file.mjs`') : l)).join('\n'));
  const problems = checkDocument(text);
  // the path in backticks is wrong in the row and the row itself is wrong: both are reported, both name the line
  assert.ok(problems.length >= 1 && problems.every((p) => p.startsWith('line ' + row.line + ':')), problems.join('\n'));
  assert.ok(problems.some((p) => /file `chat\/no-such-file\.mjs` of the row/.test(p)), problems.join('\n'));
});

test('a row with the wrong number of columns, or an empty cell, fails', (t) => {
  const row = firstRow();
  const extra = withCopy(t, (doc) => doc.split('\n').map((l, i) => (i + 1 === row.line ? l + ' extra |' : l)).join('\n'));
  assert.match(checkDocument(extra).join('\n'), new RegExp('line ' + row.line + ': the row has 4 columns'));
  const empty = withCopy(t, (doc) => doc.split('\n').map((l, i) => (i + 1 === row.line ? '| ' + row.statement + ' |  | `x` |' : l)).join('\n'));
  assert.match(checkDocument(empty).join('\n'), new RegExp('line ' + row.line + ': the row has an empty cell'));
});

test('a document with no references at all passes', () => {
  assert.deepEqual(checkDocument('# Data handling\n\nOnly words, and `code` that is not a path, like `window.APP_CONFIG` or `plc.lock.v1`.\n'), []);
});

test('a file listed as pending that now exists is reported, so the entry cannot outlive its purpose', () => {
  const problems = checkDocument('Read `docs/DATA-HANDLING.md`.\n', {pending: new Map([['docs/DATA-HANDLING.md', 'a file that exists']])});
  assert.equal(problems.length, 1);
  assert.match(problems[0], /^line 1: `docs\/DATA-HANDLING\.md` exists now\. Remove it from PENDING/);
});

test('a pending file may be named while it does not exist yet', () => {
  assert.deepEqual(checkDocument('Read `docs/evidence/no-such-register.json`.\n', {pending: new Map([['docs/evidence/no-such-register.json', 'not yet made']])}), []);
});

test('no entry of PENDING names a file that exists in the repository', () => {
  for (const [file] of PENDING) assert.ok(!exists(ROOT, file, 'file'), `${file} exists now: delete its entry from PENDING in tests/data-handling-references.test.mjs, the document can name it like any other file`);
});
