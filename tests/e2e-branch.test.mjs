import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
import {suiteBranch,NEUTRAL_SUITES} from '../scripts/e2e-branch.mjs';
import {resolveTarget} from '../scripts/targets.mjs';

const dir=new URL('./e2e/',import.meta.url);

test('a suite that builds a download target gets main by default, every other suite gets dev',()=>{
  assert.equal(suiteBranch('run-kit.e2e.mjs',{}),'main');
  assert.equal(suiteBranch('sharing.e2e.mjs',{}),'dev');
  assert.equal(suiteBranch('site-identity.e2e.mjs',{}),'dev');
});

test('a branch the caller chose is kept, for neutral and other suites',()=>{
  assert.equal(suiteBranch('run-kit.e2e.mjs',{PLC_E2E_BRANCH:'local'}),'local');
  assert.equal(suiteBranch('run-kit.e2e.mjs',{PLC_E2E_BRANCH:'main'}),'main');
  assert.equal(suiteBranch('sharing.e2e.mjs',{PLC_E2E_BRANCH:'main'}),'main');
  assert.equal(suiteBranch('sharing.e2e.mjs',{PLC_E2E_BRANCH:'dev'}),'dev');
});

test('dev for a neutral suite is refused, and the build would refuse it too',()=>{
  assert.throws(()=>suiteBranch('run-kit.e2e.mjs',{PLC_E2E_BRANCH:'dev'}),/cannot be built on dev/);
  for(const target of ['app','runkit'])assert.throws(()=>resolveTarget({TARGET:target,DEPLOY_BRANCH:'dev'}),/cannot be built on the dev branch/);
  assert.equal(resolveTarget({TARGET:'runkit',DEPLOY_BRANCH:suiteBranch('run-kit.e2e.mjs',{})}).target,'runkit');
});

test('every suite that sets a download TARGET is listed as neutral, and every listed suite exists',()=>{
  const files=readdirSync(dir).filter(f=>f.endsWith('.e2e.mjs'));
  for(const f of files){
    const sets=/process\.env\.TARGET\s*=/.test(readFileSync(new URL(f,dir),'utf8'));
    assert.equal(NEUTRAL_SUITES.includes(f),sets,`${f}: sets TARGET=${sets}, listed as neutral=${NEUTRAL_SUITES.includes(f)}`);
  }
  for(const f of NEUTRAL_SUITES)assert.ok(files.includes(f),f+' exists');
});
