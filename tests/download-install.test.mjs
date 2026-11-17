import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {storageOps} from '../runtime/providers/adapters/wllama.mjs';
import {BrowserWorker} from './hash-worker-fixture.mjs';

test('installer retries only the failed shard and keeps verified files and accurate progress',async()=>{
  const dir=await mkdtemp(tmpdir()+'/plc-download-');
  const first='https://fixture.invalid/one',second='https://fixture.invalid/two';
  const payload=new Uint8Array(10).fill(7),calls=[],progress=[];
  const entries=new Map([[first,{size:5,metadata:{originalURL:first,originalSize:5}}]]);
  let failures=1;
  globalThis.__plcFixtureCache={
    sb:{priv:{write(){}}},
    list:async()=>[...entries].map(([name,e])=>({name,...e})),getNameFromURL:async url=>url,
    delete:async url=>entries.delete(url),getMetadata:async url=>entries.get(url)?.metadata,
    getSize:async url=>entries.get(url)?.size??-1,open:async()=>new Blob([payload]),
    async download(url,{progressCallback}){
      calls.push(url);progressCallback({loaded:4});
      if(failures-->0)throw Error('HTTP 503');
      progressCallback({loaded:10});entries.set(url,{size:10,metadata:{originalURL:url,originalSize:10}});
    }
  };
  const previousSelf=globalThis.self,previousWorker=globalThis.Worker;
  globalThis.Worker=BrowserWorker;globalThis.self={location:{href:pathToFileURL(dir+'/').href}};
  try{
    await writeFile(dir+'/package.json','{"type":"module"}');
    await writeFile(dir+'/wllama.js','export class Wllama { constructor(){this.cacheManager=globalThis.__plcFixtureCache;} }');
    const files=[{path:'one',url:first,bytes:5},{path:'two',url:second,bytes:10,sha256:createHash('sha256').update(payload).digest('hex')}];
    const result=await storageOps.install({files,runtimeDir:pathToFileURL(dir+'/').href},{onProgress:p=>progress.push(p)});
    assert.equal(result.ok,true);assert.equal(result.keptBytes,5);assert.equal(result.fetchedBytes,10);
    assert.deepEqual(calls,[second,second]);assert.ok(entries.has(first));
    assert.equal(progress.filter(p=>p.phase==='retry-wait').length,1);
    assert.equal(progress.at(-1).bytesDone,15);assert.equal(progress.at(-1).filesDone,2);
  }finally{globalThis.Worker=previousWorker;globalThis.self=previousSelf;delete globalThis.__plcFixtureCache;await rm(dir,{recursive:true,force:true});}
});
