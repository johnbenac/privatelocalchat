// The two tiny models from the project CDN, end to end in the real app on the processor (headless Chromium has no usable graphics card): download, SHA-256 check,
// load, a correct answer and a follow-up, unload, remove. A RELEASE CHECK: it downloads about 330 MB (mini 223 MB, nano 105 MB) and takes a few minutes.
//
//   node tests/e2e/tiny-models.e2e.mjs
import {launch,assert} from './harness.mjs';
const ok=n=>console.log('ok   '+n);
const h=await launch({port:18411});
try{
 const {page}=h;
 await page.waitForFunction(()=>window.localModels?.state?.device&&window.localModels.supported!==undefined,null,{timeout:60000});
 await page.evaluate(()=>window.localModels.setMode('local'));
 assert(await page.evaluate(()=>window.localModels.backend)==='cpu','no graphics card: the processor');
 // a device with no graphics card and a phone's user agent is given the tiny Granite by default
 const info=await page.evaluate(()=>window.localModels.prepareInfo());
 console.log('   default pick here (a desktop):',info.tier,info.reason);
 for(const [tier,expect] of [['mini',/Paris/i],['nano',/Paris/i]]){
  await page.evaluate(t=>window.localModels.switchTier(t),tier);
  const t0=Date.now();
  await page.evaluate(()=>window.localModels.ensureReady());
  const state=await page.evaluate(()=>({load:window.localModels.state.load.state,kind:window.localModels.state.load.info?.capabilities?.kind,tier:window.localModels.state.load.tier}));
  assert(state.load==='ready'&&state.kind==='local-cpu'&&state.tier===tier,tier+' loaded on the processor: '+JSON.stringify(state));
  const ask=text=>page.evaluate(async t=>{const out=await window.localModels.generate([{role:'user',content:t}],{});return String(out).slice(0,200);},text);
  const a=await ask('What is the capital of France? One short sentence.');
  assert(expect.test(a),tier+' answers: '+a);
  const b=await page.evaluate(async()=>String(await window.localModels.generate([{role:'user',content:'What is the capital of France? One short sentence.'},{role:'assistant',content:'The capital of France is Paris.'},{role:'user',content:'And of Italy?'}],{})).slice(0,200));
  assert(/Rome/i.test(b),tier+' follows the conversation: '+b);
  ok(tier+': downloaded, checked, loaded and answered twice in '+Math.round((Date.now()-t0)/1000)+' s ("'+a.replace(/\s+/g,' ')+'")');
  await page.evaluate(()=>window.localModels.freeMemory());
  await page.evaluate(t=>window.localModels.removeTier(t),tier);
  await page.evaluate(()=>window.localModels.inspectAll());
  assert(await page.evaluate(t=>window.localModels.state.tiers[t].install.ok,tier)===false,tier+' removed');
 }
 const unexpected=h.errors.filter(e=>!/WebGPU|webgpu/i.test(e));
 assert(unexpected.length===0,'no page errors: '+unexpected.join(' | '));
 console.log('tiny-models e2e: ok');
}catch(e){console.error(e);process.exitCode=1;}
finally{await h.close();}
