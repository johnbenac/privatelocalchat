import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import path from 'node:path';
import {devSite} from './helpers/dev-site.mjs';

// Offline plan 0.1: everything the app can load is saved by the service worker. A file the worker leaves out fails only
// when someone opens the app cold with no connection, so no other test sees it. This builds the app and checks the saved list
// against the files that ship and against the imports between them.

const root=process.cwd();
// Left out on purpose: fetched when first used and saved then (chat/vendor/voice), and files that only the host reads.
const ON_DEMAND=[/^\/chat\/vendor\/voice\//,/^\/(_headers|_worker\.js|_redirects|_routes\.json|sw\.js)$/,/^\/(LICENSE|THIRD-PARTY-NOTICES\.md)$/,/^\/404\.html$/];
async function files(dir,base=dir,list=[]){for(const ent of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,ent.name);if(ent.isDirectory())await files(p,base,list);else list.push('/'+path.relative(base,p).split(path.sep).join('/'));}return list;}
const left=f=>ON_DEMAND.some(r=>r.test(f.replace(/^\/releases\/[^/]+/,'')));
const shipped=async(out)=>(await files(out)).filter(f=>!left(f));

for(const branch of ['main','dev']){
 test('the service worker saves every shipped file ('+branch+' build)',async()=>{
  await mkdir(path.join(root,'work'),{recursive:true});
  const out=await mkdtemp(path.join(root,'work','precache-'));
  try{
   execFileSync('node',['scripts/build.mjs'],{cwd:root,stdio:'pipe',env:{...process.env,DEPLOY_BRANCH:branch,BUILD_OUT_DIR:out,...devSite(branch)}});
   const sw=await readFile(path.join(out,'sw.js'),'utf8');
   const list=JSON.parse(/const SHELL=(\[.*?\])\.filter/s.exec(sw)[1]);
   const saved=new Set(list);
   const missing=(await shipped(out)).filter(f=>!saved.has(f));
   assert.deepEqual(missing,[],'shipped but not saved for offline use: '+missing.slice(0,10).join(', '));
   // Every relative import between saved JavaScript files must point at a saved file.
   const broken=[];
   for(const f of list.filter(f=>/\.(m?js)$/.test(f))){
    const text=await readFile(path.join(out,f),'utf8').catch(()=>null);
    if(text===null)continue;
    for(const m of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*|\bimport\s+)(['"])(\.{1,2}\/[^'"]+)\1/g)){
     const target=path.posix.normalize(path.posix.join(path.posix.dirname(f),m[2]));
     if(!saved.has(target)&&!left(target))broken.push(f+' -> '+m[2]);
    }
   }
   assert.deepEqual(broken,[],'imports that offline use cannot satisfy: '+broken.slice(0,10).join('; '));
  }finally{await rm(out,{recursive:true,force:true});}
 });
}
