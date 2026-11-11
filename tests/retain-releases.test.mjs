// A deploy keeps the folders of earlier builds so that tabs started on them keep working (docs/UPGRADE-BEHAVIOUR.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {retainReleases} from '../scripts/retain-releases.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const commit=n=>String(n).padStart(40,'0');
const SITE='https://live.example';

/** A site as a deploy leaves it: releases/index.json and, for each held build, release.json and its files. */
function siteWith(builds,{current,retained=[]}){
  const files=new Map();
  files.set('/releases/index.json',JSON.stringify({current,retained}));
  for(const [c,list] of Object.entries(builds)){
    const entries=[];
    for(const [name,text] of Object.entries(list)){const bytes=Buffer.from(text);files.set(`/releases/${c}/${name}`,bytes);entries.push({path:name,bytes:bytes.length,sha256:sha(bytes)});}
    files.set(`/releases/${c}/release.json`,JSON.stringify({commit:c,files:entries}));
  }
  const fetchImpl=async url=>{
    const p=new URL(url).pathname;const body=files.get(decodeURIComponent(p));
    return body===undefined?{ok:false,status:404}:{ok:true,status:200,json:async()=>JSON.parse(body.toString()),arrayBuffer:async()=>{const buf=Buffer.from(body);return buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.length);}};
  };
  return {files,fetchImpl};
}
function newBuild(current){
  const out=mkdtempSync(path.join(tmpdir(),'plc-retain-'));
  mkdirSync(path.join(out,'releases',current),{recursive:true});
  writeFileSync(path.join(out,'releases','index.json'),JSON.stringify({current,retained:[]}));
  writeFileSync(path.join(out,'releases',current,'app.mjs'),'new');
  return out;
}
const index=out=>JSON.parse(readFileSync(path.join(out,'releases','index.json'),'utf8'));

test('the build now live and the ones it kept are copied into the new build, newest first, with their manifests', async () => {
  const [a,b,c]=[commit(1),commit(2),commit(3)];
  const {fetchImpl}=siteWith({[b]:{'app.mjs':'b app','chat/x.mjs':'b x'},[a]:{'app.mjs':'a app'}},{current:b,retained:[a]});
  const out=newBuild(c);
  const result=await retainReleases({site:SITE,out,fetchImpl});
  assert.deepEqual(result.retained,[b,a]);
  assert.deepEqual(index(out),{current:c,retained:[b,a]});
  assert.equal(readFileSync(path.join(out,'releases',b,'chat/x.mjs'),'utf8'),'b x');
  assert.equal(readFileSync(path.join(out,'releases',a,'app.mjs'),'utf8'),'a app');
  assert.ok(existsSync(path.join(out,'releases',b,'release.json')),'the kept folder keeps its manifest, so the next deploy can keep it again');
  assert.equal(readFileSync(path.join(out,'releases',c,'app.mjs'),'utf8'),'new','the new build is untouched');
  rmSync(out,{recursive:true});
});

test('only as many builds as the limit are held: the new one and the newest before it', async () => {
  const [a,b,c,d]=[commit(1),commit(2),commit(3),commit(4)];
  const {fetchImpl}=siteWith({[c]:{'app.mjs':'c'},[b]:{'app.mjs':'b'},[a]:{'app.mjs':'a'}},{current:c,retained:[b,a]});
  const out=newBuild(d);
  const result=await retainReleases({site:SITE,out,keep:3,fetchImpl});
  assert.deepEqual(result.retained,[c,b]);
  assert.ok(!existsSync(path.join(out,'releases',a)),'the oldest is dropped');
  rmSync(out,{recursive:true});
});

test('a file that does not match its checksum keeps that build out, and the others are still kept', async () => {
  const [a,b,c]=[commit(1),commit(2),commit(3)];
  const {files,fetchImpl}=siteWith({[b]:{'app.mjs':'b'},[a]:{'app.mjs':'a'}},{current:b,retained:[a]});
  files.set(`/releases/${a}/app.mjs`,Buffer.from('tampered'));
  const out=newBuild(c);
  const result=await retainReleases({site:SITE,out,fetchImpl});
  assert.deepEqual(result.retained,[b]);
  assert.equal(result.skipped.length,1);assert.match(result.skipped[0].reason,/checksum/);
  assert.deepEqual(index(out).retained,[b],'the index never names a build that was not copied');
  rmSync(out,{recursive:true});
});

test('a site with no earlier list, or one that cannot be reached, keeps nothing and does not fail', async () => {
  const out=newBuild(commit(9));
  const none=await retainReleases({site:SITE,out,fetchImpl:async()=>({ok:false,status:404})});
  assert.deepEqual(none.retained,[]);
  const down=await retainReleases({site:SITE,out,fetchImpl:async()=>{throw new Error('offline');}});
  assert.deepEqual(down.retained,[]);
  assert.deepEqual(index(out),{current:commit(9),retained:[]});
  rmSync(out,{recursive:true});
});

test('a manifest that names a path outside its folder is refused', async () => {
  const [a,c]=[commit(1),commit(3)];
  const {files,fetchImpl}=siteWith({[a]:{'app.mjs':'a'}},{current:a});
  files.set(`/releases/${a}/release.json`,JSON.stringify({commit:a,files:[{path:'../../escape.txt',bytes:1,sha256:sha(Buffer.from('x'))}]}));
  const out=newBuild(c);
  const result=await retainReleases({site:SITE,out,fetchImpl});
  assert.deepEqual(result.retained,[]);assert.match(result.skipped[0].reason,/unsafe/);
  assert.ok(!existsSync(path.join(out,'escape.txt')));
  rmSync(out,{recursive:true});
});

test('the build writes a manifest of its release folder, and an index naming only itself', async () => {
  const {execFileSync}=await import('node:child_process');
  const out=mkdtempSync(path.join(path.resolve('.'),'.tmp-build-'));
  try{
    execFileSync('node',['scripts/build.mjs'],{stdio:'pipe',env:{...process.env,BUILD_OUT_DIR:out,GITHUB_SHA:'a'.repeat(40),DEPLOY_BRANCH:'local'}});
    const idx=index(out);
    assert.match(idx.current,/^[0-9a-f]{40}$/);assert.deepEqual(idx.retained,[]);
    const manifest=JSON.parse(readFileSync(path.join(out,'releases',idx.current,'release.json'),'utf8'));
    assert.equal(manifest.commit,idx.current);
    assert.ok(manifest.files.length>50,'the manifest lists the release folder');
    assert.ok(!manifest.files.some(f=>f.path==='release.json'),'and not itself');
    for(const f of manifest.files.filter((_,i)=>i%25===0)){const bytes=readFileSync(path.join(out,'releases',idx.current,f.path));assert.equal(bytes.length,f.bytes,f.path);assert.equal(sha(bytes),f.sha256,f.path);}
    assert.ok(manifest.files.some(f=>f.path==='local-models.js')&&manifest.files.some(f=>f.path.startsWith('chat/vendor/voice/')||f.path.startsWith('runtime/')),'including files the offline copy leaves out of the saved shell');
  }finally{rmSync(out,{recursive:true,force:true});}
});
