// runtime/providers is a read-only copy of the published package model-runtime (owner plc), and tools/vendor-check is a read-only copy of
// the package vendor-check (owner devops): see /cosmoshot/tools/docs/VENDORING.md and tools/vendor-check/VENDORING.md. vendor.lock.json pins
// each by exact version and SHA-256 of every file. The check itself is the vendored tool; PLC holds no copy of its rule. An edited, added or
// removed file in either folder, or a change that was not published as a new version and pinned, fails here.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';

const TOOL='tools/vendor-check/vendor_check.py';
const run=(args)=>spawnSync('python3',['-I',TOOL,...args],{encoding:'utf8',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
const lock=JSON.parse(readFileSync('vendor.lock.json','utf8'));

test('the lock pins both components by an exact version and a package SHA-256',()=>{
  assert.equal(lock.schema,'aiofourown-vendor-lock/1');
  const byName=Object.fromEntries(lock.components.map((c)=>[c.name,c]));
  assert.deepEqual(Object.keys(byName).sort(),['model-runtime','vendor-check']);
  for(const [name,owner,vendored] of [['model-runtime','plc','runtime/providers'],['vendor-check','devops','tools/vendor-check']]){
    const c=byName[name];
    assert.equal(c.owner,owner);assert.equal(c.path,vendored);
    assert.match(c.version,/^\d+\.\d+\.\d+$/,name+': an exact version, never a range or latest');
    assert.match(c.tree_sha256,/^[0-9a-f]{64}$/);
    assert.match(c.package.sha256,/^[0-9a-f]{64}$/);
    assert.equal(c.package.file,`${name}-${c.version}.tar.gz`);
  }
});

test('every vendored file matches its pin: nothing edited, added or removed in runtime/providers or tools/vendor-check',()=>{
  const r=run(['check','--root','.']);
  assert.equal(r.status,0,r.stdout+r.stderr);
});

test('negative control: the same tool refuses an edited, an added and a removed file, and names it',()=>{
  const root=mkdtempSync(path.join(tmpdir(),'plc-vendor-'));
  try{
    mkdirSync(path.join(root,'vend/sub'),{recursive:true});
    writeFileSync(path.join(root,'vend/a.mjs'),'one');writeFileSync(path.join(root,'vend/sub/b.mjs'),'two');
    const pin=run(['pin','--root',root,'--name','probe','--owner','plc','--version','1.0.0','--path','vend','--license','AGPL-3.0']);
    assert.equal(pin.status,0,pin.stdout+pin.stderr);
    assert.equal(run(['check','--root',root]).status,0);
    writeFileSync(path.join(root,'vend/a.mjs'),'edited');
    let r=run(['check','--root',root]);assert.equal(r.status,1);assert.match(r.stdout+r.stderr,/a\.mjs/);
    writeFileSync(path.join(root,'vend/a.mjs'),'one');
    writeFileSync(path.join(root,'vend/new.mjs'),'x');
    r=run(['check','--root',root]);assert.equal(r.status,1);assert.match(r.stdout+r.stderr,/new\.mjs/);
    rmSync(path.join(root,'vend/new.mjs'));rmSync(path.join(root,'vend/sub/b.mjs'));
    r=run(['check','--root',root]);assert.equal(r.status,1);assert.match(r.stdout+r.stderr,/b\.mjs/);
  }finally{rmSync(root,{recursive:true,force:true});}
});
