// Roberta's semantic matching in a real browser: the REAL worker and the REAL model (downloaded from the asset host, about 37 MB with the
// WASM runtime) through chat/embedding/embedder.mjs, then the held-out queries through chat/roberta/intent-router.mjs. Network dependent by design: it fails
// with a clear message if the asset host cannot be reached. It also proves the Cache API keeps the model: a second page load asks the asset
// host for nothing.
//
//   node tests/e2e/ivr-semantic.e2e.mjs              (builds dist/, serves it, drives headless Chromium)
import '../helpers/install-app-config.mjs'; // the model sources the build writes into the page (docs/APP-CONFIG.md)
import {readFileSync} from 'node:fs';
import {launch,assert} from './harness.mjs';
import {summarise,SPLITS} from '../../scripts/eval-intent-router.mjs';
import {EMBEDDING_ASSET_HOST} from '../../chat/embedding/embedding-config.mjs';

const queries=JSON.parse(readFileSync(new URL('../fixtures/ivr-eval-queries.json',import.meta.url),'utf8')).queries;
const CDN_HOST=new URL(EMBEDDING_ASSET_HOST).host;
const h=await launch({port:18291});
const cdnRequests=[];
h.context.on('request',r=>{if(new URL(r.url()).host===CDN_HOST)cdnRequests.push({url:r.url(),at:Date.now()});});
const cdnFailures=[];
h.context.on('requestfailed',r=>{if(new URL(r.url()).host===CDN_HOST)cdnFailures.push(r.url()+' '+(r.failure()?.errorText||''));});

// The page imports the modules from the versioned release path the build rewrites assets to, exactly as the app does.
const releaseBase=async page=>page.evaluate(()=>new URL(/^(.*\/releases\/[^/]+\/)/.exec(document.querySelector('link[href*="/releases/"]').getAttribute('href'))[1],location.href).href);

async function loadEmbedder(page,base){
 return page.evaluate(async base=>{
  const {createEmbedder}=await import(base+'chat/embedding/embedder.mjs');
  const embedder=createEmbedder({force:true});
  window.__embedder=embedder;
  const t0=performance.now();
  try{await embedder.ready();}catch(e){return {ok:false,error:String(e?.message||e),state:embedder.state};}
  const initMs=Math.round(performance.now()-t0);
  const v=await embedder.embedQuery('is this sending information to the cloud');
  return {ok:true,initMs,state:embedder.state,dim:v.length,norm:Math.hypot(...v),lastInit:embedder.lastInit};
 },base);
}

try{
 const {page}=h;
 const base=await releaseBase(page);
 console.log('release base',base);

 // ---- first load: download, init ------------------------------------------------------------------------------------------------
 const first=await loadEmbedder(page,base);
 if(!first.ok){
  const unreachable=cdnFailures.length||!cdnRequests.length;
  throw new Error(`The embedding model did not load (${first.error}). `+(unreachable?`The asset host ${CDN_HOST} may be unreachable from this machine (${cdnFailures.slice(0,2).join('; ')||'no request completed'}). This test needs the network.`:''));
 }
 console.log('first load: init',first.initMs,'ms, model',first.lastInit.model,'dim',first.dim,'norm',first.norm.toFixed(4),'cdn requests',cdnRequests.length);
 assert(first.state==='ready','embedder ready');assert(first.dim===256,'256 numbers');assert(Math.abs(first.norm-1)<1e-3,'unit length');
 assert(cdnRequests.length>=5,'the model files, tokenizer and runtime came from the asset host ('+cdnRequests.length+')');
 const firstUrls=cdnRequests.map(r=>new URL(r.url).pathname.replace(/^.*\/models\/memory\/[0-9a-f]+\//,''));
 console.log('files fetched:',firstUrls.join(', '));
 assert(!cdnRequests.some(r=>/rerank/.test(r.url)),'the reranker is not fetched');

 // ---- the held-out queries with the real embedder -------------------------------------------------------------------------------
 const rows=await page.evaluate(async ({base,queries})=>{
  const {createIntentRouter,loadIntentVectors}=await import(base+'chat/roberta/intent-router.mjs');
  const vectors=await loadIntentVectors(new URL(base+'chat/roberta/ivr-vectors.json'));
  if(!vectors)throw new Error('could not load chat/roberta/ivr-vectors.json');
  const router=createIntentRouter({vectors,embedder:window.__embedder,nearFloor:0});
  const out=[];
  for(const query of queries){const t=performance.now();const result=await router.route(query.text);out.push({query,result,ms:performance.now()-t});}
  // the same router once the embedder is shut down: the lexical answer, at once
  window.__embedder.terminate();
  const lexical=createIntentRouter({vectors,embedder:null,nearFloor:0});
  const t=performance.now();const quick=await lexical.route('is this sending information to the cloud');
  return {rows:out,lexicalMs:performance.now()-t,lexicalMethod:quick.method};
 },{base,queries});
 const latencies=rows.rows.map(r=>r.ms).sort((a,b)=>a-b);
 const pick=p=>latencies[Math.min(latencies.length-1,Math.floor(p*latencies.length))];
 console.log(`per query (embed + match): median ${pick(0.5).toFixed(1)} ms, p95 ${pick(0.95).toFixed(1)} ms, max ${latencies.at(-1).toFixed(1)} ms over ${latencies.length} queries`);
 assert(rows.lexicalMethod==='lexical','without an embedder the router answers lexically');
 const methods=new Set(rows.rows.map(r=>r.result.method));
 assert(methods.has('hybrid')||methods.has('semantic'),'the real embedder was used ('+[...methods]+')');
 assert(![...methods].includes('lexical')||rows.rows.filter(r=>r.result.method==='lexical').length<=2,'at most the odd filler query is answered without the model');
 const all=summarise(rows.rows);
 const final=summarise(rows.rows.filter(r=>SPLITS.final(r.query)));
 const valid=summarise(rows.rows.filter(r=>SPLITS.validation(r.query)));
 console.log('hybrid, real model in the browser:',JSON.stringify({all,validation:valid,final}));
 // Measured in Node and in this browser: top-1 91.9% (all), 90.9% (final set); top-3 99.4%; off-topic rejected 98%. The floors leave a margin.
 assert(all.top1Pct>=88,'top-1 '+all.top1Pct);assert(all.top3Pct>=97,'top-3 '+all.top3Pct);
 assert(all.offTopicRejectedPct>=92,'off-topic rejected '+all.offTopicRejectedPct);
 assert(all.actedBranchPct>=96,'acted on the right branch of the menu '+all.actedBranchPct);
 assert(final.top1Pct>=82,'final (blind) set top-1 '+final.top1Pct);assert(valid.top1Pct>=85,'validation set top-1 '+valid.top1Pct);
 // the owner's own questions
 const byText=Object.fromEntries(rows.rows.map(r=>[r.query.text,r.result]));
 for(const text of ['tell me is this cloud connected','so is it sending information to the cloud or not','and what about the cloud','so who actually has my data','where exactly is my data stored','can i download the models on my phone']){
  const r=byText[text];assert(r&&r.confidence!=='low','"'+text+'" was understood ('+r?.confidence+')');
 }
 assert(byText['tell me is this cloud connected'].intent==='privacy.cloud','cloud question goes to the cloud topic');
 assert(byText['so who actually has my data'].intent==='privacy.storage','data question goes to storage');

 // ---- second load: nothing is fetched again --------------------------------------------------------------------------------------
 const page2=await h.context.newPage();
 page2.on('pageerror',e=>h.errors.push(e.message));
 await page2.goto(h.origin+'/');
 const before=cdnRequests.length;
 const base2=await releaseBase(page2);
 const second=await loadEmbedder(page2,base2);
 assert(second.ok,'second load: '+second.error);
 const refetched=cdnRequests.slice(before);
 console.log('second load: init',second.initMs,'ms (first',first.initMs,'ms); requests to the asset host:',refetched.length,refetched.map(r=>r.url));
 assert(refetched.length===0,'the Cache API served the model: '+refetched.length+' request(s) to '+CDN_HOST+' on the second load: '+refetched.map(r=>r.url).join(', '));
 assert(second.dim===256&&second.state==='ready','second load works');
 const cacheNames=await page2.evaluate(async()=>{const names=await caches.keys();const out={};for(const n of names)out[n]=(await (await caches.open(n)).keys()).length;return out;});
 console.log('Cache API:',JSON.stringify(cacheNames));
 await page2.evaluate(()=>window.__embedder.terminate());

 // ---- with the asset host cut off, the model still loads from the cache (the offline case) ------------------------------------
 await h.context.route(u=>new URL(u).host===CDN_HOST,r=>r.abort('internetdisconnected'));
 const page3=await h.context.newPage();
 page3.on('pageerror',e=>h.errors.push(e.message));
 await page3.goto(h.origin+'/');
 const before3=cdnRequests.length;
 const third=await loadEmbedder(page3,await releaseBase(page3));
 assert(third.ok,'asset host blocked, model from the cache: '+third.error);
 assert(cdnRequests.length===before3,'no request to the asset host while it is blocked');
 console.log('asset host blocked, model from the cache: init',third.initMs,'ms, ok');
 await page3.evaluate(()=>window.__embedder.terminate());

 console.log('console/page errors:',h.errors);
 assert(h.errors.length===0,'no console errors: '+h.errors.join(' | '));
 console.log('OK');
}finally{await h.close();}
