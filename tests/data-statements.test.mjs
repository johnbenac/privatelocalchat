// The register of what the app tells people about their data (docs/evidence/data-statements.json): every privacy answer is in it, every registered text is still in its file,
// and every section it cites is a heading of docs/DATA-HANDLING.md. A new free-text note written elsewhere cannot be found by a test; the register says so.
import './helpers/install-app-config.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { NODES } from '../chat/roberta/ivr-content.mjs';

const root = new URL('../', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, root), 'utf8');
const REGISTER = JSON.parse(read('docs/evidence/data-statements.json'));
const KINDS = new Set(['assistant-answer', 'ui-note']);
const VERDICTS = new Set(['true', 'corrected', 'partly']);
// the phrase the register must keep: what it cannot catch
export const LIMIT_PHRASE = 'cannot catch a new free-text note';

const headingNumbers = () => new Set([...read('docs/DATA-HANDLING.md').matchAll(/^## (\d+)\./gm)].map((m) => m[1]));

/** Problems with the register itself (empty when it is sound). `fileExists` and `readFile` are parameters so a control can use a copy. */
export function registerProblems(register, { sections, fileExists = (f) => existsSync(new URL(f, root)), readFile = read } = {}) {
  const out = [];
  if (register?.format !== 'plc-data-statements/1') out.push('format is not plc-data-statements/1');
  if (!Array.isArray(register?.statements) || !register.statements.length) return [...out, 'there are no statements'];
  const seen = new Set();
  for (const s of register.statements) {
    const id = s?.id;
    if (typeof id !== 'string' || !id) { out.push('a statement has no id'); continue; }
    if (seen.has(id)) out.push(`${id}: the id is listed twice`); seen.add(id);
    if (!KINDS.has(s.kind)) out.push(`${id}: kind ${s.kind} is not assistant-answer or ui-note`);
    if (!VERDICTS.has(s.verified)) out.push(`${id}: verified ${s.verified} is not true, corrected or partly`);
    if (typeof s.says !== 'string' || !s.says) out.push(`${id}: it does not say what it tells the person`);
    if (!/^[1-6]$/.test(String(s.section))) out.push(`${id}: section ${s.section} is not a number from 1 to 6`);
    else if (!sections.has(String(s.section))) out.push(`${id}: section ${s.section} is not a heading of docs/DATA-HANDLING.md`);
    if (typeof s.file !== 'string' || !fileExists(s.file)) { out.push(`${id}: the file ${s.file} does not exist`); continue; }
    if (!Array.isArray(s.pieces) || !s.pieces.length || s.pieces.some((p) => typeof p !== 'string' || !p)) { out.push(`${id}: pieces must be a list of non-empty strings`); continue; }
    const text = readFile(s.file);
    for (const p of s.pieces) if (!text.includes(p)) out.push(`${id}: the text "${p.slice(0, 60)}" no longer appears in ${s.file}; look at the statement, then this register and DATA-HANDLING.md`);
  }
  return out;
}

/** The ids of privacy answers (the node `privacy` and every `privacy.*`) that the register does not list. */
export function unregisteredAnswers(nodeIds, register) {
  const listed = new Set((register.statements || []).filter((s) => s.kind === 'assistant-answer').map((s) => s.id));
  return nodeIds.filter((id) => (id === 'privacy' || id.startsWith('privacy.')) && !listed.has(id));
}

const clone = () => structuredClone(REGISTER);
const sections = headingNumbers();
const realIds = Object.keys(NODES);

test('the document has the six headings the register cites', () => {
  assert.deepEqual([...sections].sort(), ['1', '2', '3', '4', '5', '6']);
});

test('the register is sound: format, ids, kinds, files, sections, and every piece is in its file', () => {
  assert.deepEqual(registerProblems(REGISTER, { sections }), []);
});

test('every privacy answer of the assistant is in the register', () => {
  assert.ok(realIds.filter((id) => id === 'privacy' || id.startsWith('privacy.')).length >= 5, 'the node list was not read');
  assert.deepEqual(unregisteredAnswers(realIds, REGISTER), []);
});

test('control: a register without one privacy entry fails and names it', () => {
  const r = clone(); r.statements = r.statements.filter((s) => s.id !== 'privacy.provider');
  assert.deepEqual(unregisteredAnswers(realIds, r), ['privacy.provider']);
});

test('control: a node list with an extra privacy.new id fails and names it', () => {
  assert.deepEqual(unregisteredAnswers([...realIds, 'privacy.new'], REGISTER), ['privacy.new']);
});

test('control: a ui-note with the id of an answer does not count as registering it', () => {
  const r = clone(); r.statements.find((s) => s.id === 'privacy.cloud').kind = 'ui-note';
  assert.deepEqual(unregisteredAnswers(realIds, r), ['privacy.cloud']);
});

test('control: a piece edited to text that is not in the file fails and names the id', () => {
  const r = clone(); r.statements.find((s) => s.id === 'privacy.storage').pieces[0] += ' (edited)';
  const p = registerProblems(r, { sections });
  assert.equal(p.length, 1); assert.match(p[0], /^privacy\.storage: the text/);
});

test('control: a section 9 fails', () => {
  const r = clone(); r.statements[0].section = '9';
  assert.match(registerProblems(r, { sections }).join('\n'), /section 9 is not a number from 1 to 6/);
});

test('control: a section the document lacks fails', () => {
  const r = clone(); r.statements[0].section = '3';
  assert.match(registerProblems(r, { sections: new Set(['1', '2']) }).join('\n'), /section 3 is not a heading of docs\/DATA-HANDLING\.md/);
});

test('control: a file that does not exist fails', () => {
  const r = clone(); r.statements[0].file = 'chat/no-such-file.mjs';
  assert.match(registerProblems(r, { sections }).join('\n'), /the file chat\/no-such-file\.mjs does not exist/);
});

test('control: a duplicate id fails', () => {
  const r = clone(); r.statements.push(structuredClone(r.statements[0]));
  assert.match(registerProblems(r, { sections }).join('\n'), new RegExp(`${r.statements[0].id}: the id is listed twice`));
});

test('control: a wrong format, a bad kind, empty pieces and a bad verdict fail', () => {
  const r = clone(); r.format = 'x/1'; r.statements[0].kind = 'other'; r.statements[1].pieces = []; r.statements[2].verified = 'yes';
  const p = registerProblems(r, { sections }).join('\n');
  assert.match(p, /format is not/); assert.match(p, /kind other/); assert.match(p, /pieces must be a list/); assert.match(p, /verified yes/);
});

test('the register states what a test cannot catch', () => {
  assert.ok(REGISTER.about.includes(LIMIT_PHRASE), `about must contain "${LIMIT_PHRASE}"`);
  assert.ok(REGISTER.about.includes('free-text'));
});
