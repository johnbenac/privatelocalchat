// runtime/providers is a read-only copy of the published package model-runtime (T685, docs: /cosmoshot/tools/docs/VENDORING.md).
// vendor.lock.json pins its exact version and the SHA-256 of every file. An edited, added or removed file, or a change that was not published
// as a new version and pinned, fails here. The shared check (/cosmoshot/tools/ops/vendor_check.py) is run too when this machine has it; the
// re-hash below is the same rule, so the check also runs where that tool is absent (the deploy workflow's runner).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync,existsSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';

const sha=(b)=>createHash('sha256').update(b).digest('hex');
const walk=(root,dir=root)=>readdirSync(dir).sort().flatMap((n)=>{const p=path.join(dir,n);const s=statSync(p);return s.isDirectory()?walk(root,p):[path.relative(root,p).split(path.sep).join('/')];});
const treeHash=(files)=>sha(Buffer.from(Object.entries(files).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([p,h])=>`${h}  ${p}\n`).join('')));

/** Problems (strings naming the file) between a vendored folder and its lock entry. [] means the folder is exactly the pinned package. */
export function problems(root,entry){
  const dir=path.join(root,entry.path);const out=[];
  const have=Object.fromEntries(walk(dir).map((p)=>[p,sha(readFileSync(path.join(dir,p)))]));
  for(const [p,h] of Object.entries(entry.files)){if(!(p in have))out.push('missing: '+p);else if(have[p]!==h)out.push('changed: '+p);}
  for(const p of Object.keys(have))if(!(p in entry.files))out.push('added: '+p);
  if(!out.length&&treeHash(have)!==entry.tree_sha256)out.push('tree hash differs from the lock');
  return out;
}

const lock=JSON.parse(readFileSync('vendor.lock.json','utf8'));
const model=lock.components.find((c)=>c.name==='model-runtime');

test('the lock pins model-runtime by an exact version and a package SHA-256',()=>{
  assert.equal(lock.schema,'aiofourown-vendor-lock/1');
  assert.ok(model,'vendor.lock.json has a model-runtime entry');
  assert.match(model.version,/^\d+\.\d+\.\d+$/,'an exact version, never a range or latest');
  assert.equal(model.path,'runtime/providers');
  assert.equal(model.owner,'plc');
  assert.match(model.tree_sha256,/^[0-9a-f]{64}$/);
  assert.match(model.package.sha256,/^[0-9a-f]{64}$/);
  assert.equal(model.package.file,`model-runtime-${model.version}.tar.gz`);
});

test('runtime/providers is exactly the pinned package: no file edited, added or removed',()=>{
  assert.deepEqual(problems('.',model),[]);
});

test('the shared vendor check agrees, where this machine has it',{skip:!existsSync('/cosmoshot/tools/ops/vendor_check.py')&&'the shared check is not on this machine'},()=>{
  const r=spawnSync('/usr/bin/python3',['-I','/cosmoshot/tools/ops/vendor_check.py','check','--root','.'],{encoding:'utf8'});
  assert.equal(r.status,0,r.stdout+r.stderr);
});

test('negative control: an edited, an added and a removed file are each reported by name',()=>{
  const root=mkdtempSync(path.join(tmpdir(),'plc-vendor-'));
  try{
    const files={'a.mjs':Buffer.from('one'),'sub/b.mjs':Buffer.from('two')};
    for(const [p,b] of Object.entries(files)){mkdirSync(path.dirname(path.join(root,'runtime/providers',p)),{recursive:true});writeFileSync(path.join(root,'runtime/providers',p),b);}
    const hashes=Object.fromEntries(Object.entries(files).map(([p,b])=>[p,sha(b)]));
    const entry={path:'runtime/providers',files:hashes,tree_sha256:treeHash(hashes)};
    assert.deepEqual(problems(root,entry),[]);
    writeFileSync(path.join(root,'runtime/providers/a.mjs'),'edited');
    assert.deepEqual(problems(root,entry),['changed: a.mjs']);
    writeFileSync(path.join(root,'runtime/providers/a.mjs'),'one');
    writeFileSync(path.join(root,'runtime/providers/new.mjs'),'x');
    assert.deepEqual(problems(root,entry),['added: new.mjs']);
    rmSync(path.join(root,'runtime/providers/new.mjs'));rmSync(path.join(root,'runtime/providers/sub/b.mjs'));
    assert.deepEqual(problems(root,entry),['missing: sub/b.mjs']);
  }finally{rmSync(root,{recursive:true,force:true});}
});
