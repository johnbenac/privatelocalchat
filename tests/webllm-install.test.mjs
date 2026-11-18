import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {storageOps} from '../runtime/providers/adapters/webllm.mjs';

// The WebLLM installer (Cache API) against a fake Cache API and a stubbed fetch.
// T587 follow-up: a real Safari 27.0 install of the 9B ended with 130 of 131 files stored, the missing one a 2 KB config (docs/evidence of the Cosmogenitor report T520).
const sha=(b)=>createHash('sha256').update(b).digest('hex');
const bytesOf=(n,v)=>new Uint8Array(n).fill(v);
const FILES=[
  {path:'mlc-chat-config.json',scope:'webllm/config',data:bytesOf(40,1)},
  {path:'params_shard_0.bin',scope:'webllm/model',data:bytesOf(300,2)},
  {path:'model.wasm',scope:'webllm/wasm',data:bytesOf(70,3)}
].map((f)=>({...f,url:'https://fixture.invalid/m/'+f.path,bytes:f.data.length,sha256:sha(f.data)}));
const catalogue=()=>FILES.map(({path,scope,url,bytes,sha256})=>({path,scope,url,bytes,sha256}));

/** A Cache API in memory. `drop(url, nth)` makes the nth put of a url resolve without keeping anything (an entry that is gone afterwards). */
function fakeCaches({drop=()=>false}={}){
  const stores=new Map(); const puts=[]; const putCount=new Map();
  return {puts,stores,
    async open(name){
      if(!stores.has(name))stores.set(name,new Map());
      const m=stores.get(name);
      return {
        async match(req){const b=m.get(req.url);return b?new Response(b.slice(0)):undefined;},
        async put(req,res){
          const buf=await res.arrayBuffer(); const n=(putCount.get(req.url)||0)+1; putCount.set(req.url,n);
          puts.push({url:req.url,bytes:buf.byteLength});
          if(drop(req.url,n))return;
          m.set(req.url,buf);
        },
        async delete(req){return m.delete(req.url);}
      };
    }
  };
}
function fakeFetch(handler){
  const calls=new Map();
  const fn=async(url)=>{
    const n=(calls.get(url)||0)+1; calls.set(url,n);
    const f=FILES.find((x)=>x.url===url);
    const body=handler(f,n);
    return new Response(body,{status:200,headers:{'content-type':'application/octet-stream'}});
  };
  fn.calls=calls;
  return fn;
}
async function withFakes({caches,fetch},fn){
  const c=globalThis.caches,f=globalThis.fetch;
  globalThis.caches=caches;globalThis.fetch=fetch;
  try{return await fn();}finally{globalThis.caches=c;globalThis.fetch=f;}
}

test('a file stored but missing at the final check is fetched once more and the install completes',async()=>{
  const caches=fakeCaches({drop:(url,n)=>url.endsWith('mlc-chat-config.json')&&n===1});
  const fetch=fakeFetch((f)=>f.data);
  const progress=[];
  const r=await withFakes({caches,fetch},()=>storageOps.install({files:catalogue()},{onProgress:(p)=>progress.push(p)}));
  assert.equal(r.ok,true);
  assert.equal(r.refetched,1);
  assert.equal(fetch.calls.get(FILES[0].url),2,'the lost file was fetched a second time');
  assert.equal(fetch.calls.get(FILES[1].url),1);assert.equal(fetch.calls.get(FILES[2].url),1);
  assert.ok(progress.some((p)=>Array.isArray(p.refetchMissing)&&p.refetchMissing.join()==='mlc-chat-config.json'));
});

test('a file that is still missing after its one extra fetch fails the install, and is fetched no more than twice',async()=>{
  const caches=fakeCaches({drop:(url)=>url.endsWith('mlc-chat-config.json')});
  const fetch=fakeFetch((f)=>f.data);
  await assert.rejects(()=>withFakes({caches,fetch},()=>storageOps.install({files:catalogue()})),(e)=>{
    assert.equal(e.code,'cache-corrupt');assert.deepEqual(e.detail.missing,['mlc-chat-config.json']);return true;
  });
  assert.equal(fetch.calls.get(FILES[0].url),2,'one extra fetch, never a loop');
});

test('a complete install fetches nothing a second time',async()=>{
  const caches=fakeCaches();const fetch=fakeFetch((f)=>f.data);
  const r=await withFakes({caches,fetch},()=>storageOps.install({files:catalogue()}));
  assert.equal(r.ok,true);assert.equal(r.refetched,0);
  for(const f of FILES)assert.equal(fetch.calls.get(f.url),1);
});

test('a cut-off response is never stored as a success: only whole, checked bytes reach the cache',async()=>{
  const caches=fakeCaches();
  const fetch=fakeFetch((f,n)=>f.path==='params_shard_0.bin'&&n===1?f.data.slice(0,100):f.data); // the first answer ends early
  const r=await withFakes({caches,fetch},()=>storageOps.install({files:catalogue()}));
  assert.equal(r.ok,true);
  for(const p of caches.puts){const f=FILES.find((x)=>x.url===p.url);assert.equal(p.bytes,f.bytes,'a short body was put into the cache: '+p.url);}
  assert.equal(fetch.calls.get(FILES[1].url),2,'the cut-off file was fetched again by the download retry');
});

test('wrong bytes of the right size are refused and never stored, and the extra fetch cannot hide it',async()=>{
  const caches=fakeCaches();
  const fetch=fakeFetch((f)=>f.path==='model.wasm'?bytesOf(f.bytes,9):f.data); // same size, other content
  await assert.rejects(()=>withFakes({caches,fetch},()=>storageOps.install({files:catalogue()})),(e)=>{
    assert.equal(e.code,'cache-corrupt');assert.match(e.message,/checksum mismatch for model\.wasm/);return true;
  });
  assert.equal(caches.puts.some((p)=>p.url.endsWith('model.wasm')),false,'bad bytes were put into the cache');
});
