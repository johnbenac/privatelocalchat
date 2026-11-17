// serve.mjs lists every option with --help, and so does plc.mjs of an installed operator folder (docs/RUN-IT.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {upgrade} from '../scripts/operator.mjs';
import {makeRelease, commitOf} from './helpers/operator-fixtures.mjs';

const OPTIONS = ['--dir', '--host', '--port', '--root', '--upgrade', '--sha256', '--force', '--rollback', '--check', '--deep', '--online', '--prune', '--keep'];
const run = (args, options = {}) => spawnSync('node', args, {encoding: 'utf8', timeout: 15000, ...options});

test('serve.mjs --help and -h list every option, start no server and exit 0', () => {
  for (const flag of ['--help', '-h']) {
    const r = run(['scripts/serve.mjs', flag]);
    assert.equal(r.status, 0, r.stderr);
    for (const option of OPTIONS) assert.ok(r.stdout.includes(option), `${option} is not listed by ${flag}`);
    assert.match(r.stdout, /logs nothing about requests/);
    assert.ok(!/Serving /.test(r.stdout), 'no server started');
  }
});

test('--help wins over the other options: nothing is installed, checked or served', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'plc-help-'));
  try {
    const r = run(['scripts/serve.mjs', '--root', root, '--upgrade', '/does/not/exist', '--help']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /--rollback/);
    assert.equal(r.stderr, '');
  } finally { rmSync(root, {recursive: true, force: true}); }
});

test('negative control: an unknown option is still refused, not treated as help', () => {
  const r = run(['scripts/serve.mjs', '--root', '/tmp/does-not-matter', '--helpp']);
  assert.notEqual(r.status, 0);
  assert.ok(!r.stdout.includes('Usage:'));
});

test('plc.mjs --help in an installed operator folder prints the options of the live release', async () => {
  const scratch = mkdtempSync(path.join(tmpdir(), 'plc-help-root-'));
  try {
    const folder = await makeRelease({dir: path.join(scratch, 'src'), version: '1.0.0', target: 'runkit', commit: commitOf(7)});
    const root = path.join(scratch, 'root');
    await upgrade({root, source: folder});
    const r = run([path.join(root, 'plc.mjs'), '--help']);
    assert.equal(r.status, 0, r.stderr);
    for (const option of OPTIONS) assert.ok(r.stdout.includes(option), `${option} is not listed`);
  } finally { rmSync(scratch, {recursive: true, force: true}); }
});
