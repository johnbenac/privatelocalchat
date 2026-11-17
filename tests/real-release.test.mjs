// The helper that builds real releases for tests/e2e/operator.e2e.mjs: a mistake in it should show here, not in a browser run.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, existsSync, statSync, readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {buildRealRelease, removeRelease} from './helpers/real-release.mjs';
import {RELEASE_TOOLS} from '../scripts/package-release.mjs';
import {upgrade, check, readCurrent} from '../scripts/operator.mjs';

test('two real releases differ in their build folder, and each installs and checks out', async () => {
  const scratch = mkdtempSync(path.join(tmpdir(), 'plc-real-release-'));
  const work = mkdtempSync(path.join(process.cwd(), '.tmp-real-release-')); // the build writes inside the repository
  try {
    const a = await buildRealRelease({version: '0.0.1', commit: 'a'.repeat(40), dir: path.join(scratch, 'a'), workDir: work});
    const b = await buildRealRelease({version: '0.0.2', commit: 'b'.repeat(40), dir: path.join(scratch, 'b'), workDir: work});
    for (const r of [a, b]) {
      for (const tool of RELEASE_TOOLS) assert.ok(existsSync(path.join(r.folder, tool)), tool + ' is in the folder');
      for (const f of ['models.json', 'compat.json', 'README.md', 'LICENSE', 'THIRD-PARTY-NOTICES.md', 'SOURCE.txt']) assert.ok(existsSync(path.join(r.folder, f)), f);
      assert.ok(statSync(path.join(r.folder, 'serve.mjs')).mode & 0o100, 'serve.mjs is executable');
      assert.match(readFileSync(r.sums, 'utf8'), new RegExp(`^[0-9a-f]{64}  ${path.basename(r.zip)}$`, 'm'));
      assert.deepEqual(JSON.parse(readFileSync(path.join(r.folder, 'app', 'version.json'), 'utf8')).commit, r.commit);
    }
    assert.deepEqual(readdirSync(path.join(a.folder, 'app', 'releases')).filter((n) => /^[0-9a-f]{40}$/.test(n)), ['a'.repeat(40)]);
    assert.deepEqual(readdirSync(path.join(b.folder, 'app', 'releases')).filter((n) => /^[0-9a-f]{40}$/.test(n)), ['b'.repeat(40)]);
    assert.equal(readdirSync(work).length, 0, 'the build left nothing in its work folder');

    const root = path.join(scratch, 'root');
    await upgrade({root, source: a.zip});
    assert.equal(readCurrent(root).release, '0.0.1-runkit');
    let health = await check({root, deep: true});
    assert.equal(health.ok, true, health.problems.join('; '));
    await upgrade({root, source: b.zip});
    health = await check({root, deep: true});
    assert.equal(health.ok, true, health.problems.join('; '));
    assert.deepEqual(readdirSync(path.join(root, 'releases', '0.0.2-runkit', 'app', 'releases')).filter((n) => /^[0-9a-f]{40}$/.test(n)).sort(), ['a'.repeat(40), 'b'.repeat(40)]);
  } finally { removeRelease(scratch); removeRelease(work); }
});

test('a commit that is not 40 hex digits is refused', async () => {
  await assert.rejects(buildRealRelease({version: '0.0.1', commit: 'abc', dir: path.join(tmpdir(), 'plc-never')}), /40 hex/);
});
