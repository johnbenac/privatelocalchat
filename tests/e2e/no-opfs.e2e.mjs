// A model must still download, load and answer where the browser's file storage (OPFS) cannot be opened, as on an iPhone 11 Pro's Safari 18 (navigator.storage.getDirectory()
// rejects with "unknown transient reason" while the Cache API works). The model worker's OPFS is made to fail by serving the adapter with a line in front of it that
// does that; the page itself keeps its OPFS so the test can show that nothing was written there. A RELEASE CHECK: it downloads the 105 MB model from the CDN.
//
//   node tests/e2e/no-opfs.e2e.mjs
import {launch,assert} from './harness.mjs';
const ok=n=>console.log('ok   '+n);
const h=await launch({port:18431});
try{
 const {page,context}=h;
 const BREAK="try{Object.defineProperty(self.navigator.storage,'getDirectory',{configurable:true,value:()=>Promise.reject(Object.assign(new Error('The operation failed for an unknown transient reason (e.g. out of memory).'),{name:'UnknownError'}))});}catch(e){}\n";
 await context.route('**/runtime/providers/adapters/wllama.mjs',async route=>{const r=await route.fetch();route.fulfill({response:r,body:BREAK+await r.text()});});
 await page.reload();
 await page.waitForFunction(()=>window.localModels?.state?.device&&window.localModels.supported!==undefined,null,{timeout:60000});
 await page.evaluate(()=>window.localModels.setMode('local'));
 await page.evaluate(()=>window.localModels.switchTier('nano'));
 await page.evaluate(()=>window.localModels.ensureReady());
 const st=await page.evaluate(()=>({load:window.localModels.state.load.state,err:window.localModels.state.lastError&&window.localModels.state.lastError.message,installed:window.localModels.installed}));
 assert(st.load==='ready'&&st.installed&&!st.err,'the model downloaded and loaded with OPFS unusable in the worker: '+JSON.stringify(st));
 const a=await page.evaluate(async()=>String(await window.localModels.generate([{role:'user',content:'What is the capital of France? One short sentence.'}],{})).slice(0,160));
 assert(/Paris/i.test(a),'and answered: '+a);
 const where=await page.evaluate(async()=>{
  const names=await caches.keys();const store=names.includes('plc-model-files-v1')?await caches.open('plc-model-files-v1'):null;
  const entries=store?(await store.keys()).map(r=>decodeURIComponent(new URL(r.url).pathname.slice(1))).filter(k=>!k.endsWith('.__size')):[];
  let opfs=[];try{const d=await navigator.storage.getDirectory();const c=await d.getDirectoryHandle('cache').catch(()=>null);if(c)for await(const [n] of c.entries())opfs.push(n);}catch{}
  return {cacheApi:entries.map(k=>k.replace(/^(__metadata__)?[0-9a-f]+_/,'')),opfs};
 });
 assert(where.cacheApi.some(n=>/SmolLM2.*\.gguf$/.test(n)),'the model file is in the Cache API: '+JSON.stringify(where));
 assert(!where.opfs.some(n=>/SmolLM2/.test(n)),'and not in OPFS: '+JSON.stringify(where));
 ok('with OPFS unusable the model is kept in the Cache API, loads and answers ("'+a.replace(/\s+/g,' ')+'")');
 // OPFS works again at the next launch (the failure was "transient"): the model saved in the Cache API is still found and used, not downloaded again
 await context.unroute('**/runtime/providers/adapters/wllama.mjs');
 let downloaded=0;page.on('request',r=>{if(/assets\.privatelocal\.chat\/models\//.test(r.url())&&/\.gguf/.test(r.url()))downloaded++;});
 await page.reload();await page.waitForFunction(()=>window.localModels?.state?.device&&window.localModels.supported!==undefined,null,{timeout:60000});
 await page.evaluate(()=>window.localModels.inspectAll());
 assert(await page.evaluate(()=>window.localModels.state.tiers.nano.install.ok),'with OPFS working again the model saved earlier is still found');
 await page.evaluate(()=>window.localModels.switchTier('nano'));await page.evaluate(()=>window.localModels.ensureReady());
 assert(downloaded===0,'and not downloaded again ('+downloaded+' downloads)');
 ok('a model saved while OPFS was unusable is still used when OPFS works again');
 await context.route('**/runtime/providers/adapters/wllama.mjs',async route=>{const r=await route.fetch();route.fulfill({response:r,body:BREAK+await r.text()});});
 // it survives a reload (saved, not in memory), and removing it frees the Cache API
 await page.reload();await page.waitForFunction(()=>window.localModels?.state?.device&&window.localModels.supported!==undefined,null,{timeout:60000});
 await page.evaluate(()=>window.localModels.inspectAll());
 assert(await page.evaluate(()=>window.localModels.state.tiers.nano.install.ok),'after a reload the saved model is found');
 await page.evaluate(()=>window.localModels.removeTier('nano'));await page.evaluate(()=>window.localModels.inspectAll());
 assert(await page.evaluate(()=>window.localModels.state.tiers.nano.install.ok)===false,'removing it works');
 const left=await page.evaluate(async()=>{const s=await caches.open('plc-model-files-v1');return (await s.keys()).length;});
 assert(left===0,'and leaves nothing in the Cache API: '+left);
 ok('the saved model survives a reload and removal cleans up');
 console.log('no-opfs e2e: ok');
}catch(e){console.error(e);process.exitCode=1;}
finally{await h.close();}
