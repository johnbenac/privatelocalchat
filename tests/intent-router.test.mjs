import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,statSync} from 'node:fs';
import {createIntentRouter,canonicalPhrases,encodeVector,decodeVector,vectorsMatch,normalise,tokens,stem,VECTORS_FORMAT,ROUTER_DEFAULTS} from '../chat/roberta/intent-router.mjs';
import {NODES,INTENT_PHRASES,INTENT_IDS} from '../chat/roberta/ivr-content.mjs';
import {EMBEDDING_MODEL} from '../chat/embedding/embedding-model.mjs';
import {routeAll,summarise,SPLITS} from '../scripts/eval-intent-router.mjs';

const VECTORS_URL=new URL('../chat/roberta/ivr-vectors.json',import.meta.url);
const vectors=JSON.parse(readFileSync(VECTORS_URL,'utf8'));
const queries=JSON.parse(readFileSync(new URL('./fixtures/ivr-eval-queries.json',import.meta.url),'utf8')).queries;
const REGENERATE='EMBEDDING_NODE_MODULES=<scratch>/node_modules node scripts/build-intent-vectors.mjs   (docs/EMBEDDINGS.md)';

test('the precomputed vectors were made from exactly the phrases in the content file (regenerate them after changing an example)',()=>{
 assert.equal(vectors.format,VECTORS_FORMAT);
 assert.equal(vectors.model,EMBEDDING_MODEL.id);assert.equal(vectors.revision,EMBEDDING_MODEL.revision);
 assert.equal(vectors.dim,256);assert.equal(vectors.queryPrompt,EMBEDDING_MODEL.queryPrompt);
 const hash=createHash('sha256').update(canonicalPhrases(INTENT_PHRASES)).digest('hex');
 assert.equal(vectors.phraseHash,hash,'INTENT_PHRASES changed since chat/roberta/ivr-vectors.json was made. Regenerate: '+REGENERATE);
 assert.equal(vectors.count,INTENT_PHRASES.length,'the number of phrases changed. Regenerate: '+REGENERATE);
 assert.equal(vectors.phrases.length,vectors.count);
 assert.ok(vectorsMatch(vectors,INTENT_PHRASES),'phrase order or text differs. Regenerate: '+REGENERATE);
 for(const p of vectors.phrases){assert.ok(INTENT_IDS.includes(p.intent));assert.equal(typeof p.text,'string');assert.equal(p.v.length,256,'one character per dimension');}
 assert.ok(statSync(VECTORS_URL).size<200*1024,'the vector file must stay under 200 kB');
});

test('every intent that can be reached has example phrases in the file, and the vectors are unit length after decoding',()=>{
 for(const id of INTENT_IDS)assert.ok(vectors.phrases.some(p=>p.intent===id),'no vectors for '+id);
 for(const p of vectors.phrases.slice(0,40)){
  const v=decodeVector(p.v);assert.equal(v.length,256);assert.ok(Math.abs(Math.hypot(...v)-1)<1e-5);
 }
});

test('vector coding (6 bits a dimension) moves a cosine by less than 0.01 on average and 0.03 at worst',()=>{
 let s=7;const uniform=()=>{s=(s*1664525+1013904223)%4294967296;return s/4294967296;};
 const normal=()=>{let t=0;for(let i=0;i<12;i+=1)t+=uniform();return t-6;}; // about N(0,1)
 const unitVec=()=>{const v=Float32Array.from({length:256},normal);const n=Math.hypot(...v);return v.map(x=>x/n);};
 let sum=0,max=0,count=0;
 for(let n=0;n<40;n+=1){
  const a=unitVec(),b=unitVec(),c=Float32Array.from(a.map((x,i)=>0.7*x+0.3*b[i]));
  const nc=Math.hypot(...c);for(let i=0;i<256;i+=1)c[i]/=nc;
  const db=decodeVector(encodeVector(b));
  for(const q of [a,c]){const exact=q.reduce((t,x,i)=>t+x*b[i],0),coded=q.reduce((t,x,i)=>t+x*db[i],0);const err=Math.abs(exact-coded);sum+=err;max=Math.max(max,err);count+=1;}
 }
 assert.ok(sum/count<0.01,`mean error ${sum/count}`);assert.ok(max<0.03,`max error ${max}`);
});

test('words: lower case, no punctuation, spelled-out letters joined, light stemming',()=>{
 assert.equal(normalise("What's the Cloud?!"),'whats the cloud');
 assert.equal(normalise('what about chat g p t'),'what about chatgpt');
 assert.equal(normalise('where do i enter my a p i key'),'where do i enter my api key');
 assert.equal(normalise('show me the q r code'),'show me the qr code');
 assert.equal(normalise('how do i back up my chats'),'how do i backup my chats');
 assert.equal(normalise('speech to text'),'dictation');
 assert.equal(stem('downloading'),stem('downloaded'));assert.equal(stem('stored'),stem('storage'));assert.equal(stem('chatting'),stem('chats'));
 assert.notEqual(stem('settings'),stem('setup'),'settings and set up are different topics');
 assert.deepEqual(tokens('um is this like uh private'),['privat']);
});

// ---- the maths, with synthetic vectors --------------------------------------------------------------------------------------------
// 256 dimensions as four blocks of 64, so that the 6-bit vector coding is exercised at its real resolution
const E=(...w)=>{const v=new Array(256).fill(0);w.forEach((x,k)=>{for(let i=0;i<64;i+=1)v[k*64+i]=x/8;});const n=Math.hypot(...v);return v.map(x=>x/n);};
function synthetic(){
 // A has one close example and two far ones; B has three medium ones; C is orthogonal
 const intents=[{id:'A',keywords:[],examples:['a1','a2','a3']},{id:'B',keywords:[],examples:['b1','b2','b3']},{id:'C',keywords:[],examples:['c1']}];
 const rows=[['A',E(1,0,0,0)],['A',E(0,0,1,0)],['A',E(0,0,0,1)],['B',E(0.6,0.8,0,0)],['B',E(0.6,0,0.8,0)],['B',E(0.6,0,0,0.8)],['C',E(0,1,0,0)]];
 const v={format:VECTORS_FORMAT,phrases:rows.map(([intent,vec],i)=>({intent,text:intent.toLowerCase()+(i+1),v:encodeVector(vec)}))};
 return {intents,vectors:v};
}
const fakeEmbedder=(vec,state='ready')=>({state,ready:async()=>{},embedQuery:async()=>Float32Array.from(vec)});

test('fusion: an intent scores max-of-examples and mean-of-top-k combined, then the semantic and lexical arms are mixed',async()=>{
 const {intents,vectors:v}=synthetic();
 const cfg={semLow:0,semHigh:1,semanticWeight:1,maxWeight:0.6,topK:3,nearFloor:0};
 const router=createIntentRouter({intents,vectors:v,embedder:fakeEmbedder(E(1,0,0,0)),...cfg});
 const r=await router.route('zzz'); // unknown word: lexical is zero, so only the semantic arm speaks
 const byId=Object.fromEntries(r.candidates.map(c=>[c.intent,c]));
 // A: sims 1, 0, 0 -> 0.6*1 + 0.4*mean(1,0,0)
 assert.ok(Math.abs(byId.A.semantic-(0.6*1+0.4*(1/3)))<0.05);
 // B: sims .6 .6 .6 -> 0.6*0.6 + 0.4*0.6
 assert.ok(Math.abs(byId.B.semantic-0.6)<0.05,'B '+byId.B.semantic);
 assert.ok(byId.C.semantic<0.05);
 assert.equal(r.method,'semantic');
 // with a weight below 1 the lexical arm adds its share: 'a1' is an example word of A only
 const mixed=createIntentRouter({intents,vectors:v,embedder:fakeEmbedder(E(0,1,0,0)),semLow:0,semHigh:1,semanticWeight:0.5,nearFloor:0});
 const m=await mixed.route('a1');
 const a=m.candidates.find(c=>c.intent==='A'),c=m.candidates.find(x=>x.intent==='C');
 assert.ok(Math.abs(a.score-(0.5*a.semantic+0.5*a.lexical))<1e-9);
 assert.ok(a.lexical>0.3&&c.lexical===0);
 assert.equal(c.semantic>0.9,true,'C is the semantic match for this vector');
 assert.equal(m.candidates[0].intent,'C');assert.equal(m.method,'semantic','the winner has no lexical support');
 const lexicalWins=await createIntentRouter({intents,vectors:v,embedder:fakeEmbedder(E(0,0,1,0)),semLow:0,semHigh:1,semanticWeight:0.5,nearFloor:0}).route('a1');
 assert.equal(lexicalWins.candidates[0].intent,'A');assert.equal(lexicalWins.method,'hybrid','both arms back the winner');
});

test('with no embedder the router still answers, lexically, at once',async()=>{
 const router=createIntentRouter();
 const r=await router.route('how big is the download');
 assert.equal(r.method,'lexical');assert.equal(r.intent,'setup.size');assert.notEqual(r.confidence,'low');
 assert.ok(r.candidates.length>1&&r.candidates.every(c=>typeof c.score==='number'));
});

test('a cold embedder is not waited for: after the budget the answer is lexical, and the load keeps going',async()=>{
 let started=0;
 const cold={state:'loading',ready:()=>{started+=1;return new Promise(()=>{});},embedQuery:async()=>{throw new Error('not ready');}};
 const router=createIntentRouter({vectors,embedder:cold,coldBudgetMs:30});
 const t0=Date.now();
 const r=await router.route('is it free');
 assert.ok(Date.now()-t0<400,'did not block on the embedder');
 assert.equal(r.method,'lexical');assert.equal(started,1,'the load was nudged');
});

test('a ready embedder is used; one that fails, is unavailable or hangs falls back to lexical, never throws',async()=>{
  const {intents,vectors:syn}=synthetic();
 const ok=createIntentRouter({intents,vectors:syn,embedder:fakeEmbedder(E(0,0,1,0))});
 const good=await ok.route('xyzzy plugh'); // no word of it means anything, so only the vector can have chosen
 assert.equal(good.method,'semantic');assert.equal(good.candidates[0].intent,'A');assert.ok(good.candidates[0].semantic>0.9);
 for(const bad of [
  {state:'ready',ready:async()=>{},embedQuery:async()=>{throw new Error('boom');}},
  {state:'failed',ready:async()=>{throw new Error('x');},embedQuery:async()=>{throw new Error('x');}},
  {state:'unavailable',ready:async()=>{throw new Error('Data saver');},embedQuery:async()=>{throw new Error('x');}},
 ]){
  const r=await createIntentRouter({vectors,embedder:bad}).route('how big is the download');
  assert.equal(r.method,'lexical');assert.equal(r.intent,'setup.size');
 }
 const hung={state:'ready',ready:async()=>{},embedQuery:()=>new Promise(()=>{})};
 const r=await createIntentRouter({vectors,embedder:hung,warmBudgetMs:40}).route('how big is the download');
 assert.equal(r.method,'lexical');
});

test('setEmbedder switches an existing router from lexical to hybrid',async()=>{
 const router=createIntentRouter({vectors});
 assert.equal((await router.route('is it free')).method,'lexical');
 const cloud=decodeVector(vectors.phrases.find(p=>p.intent==='privacy.account').v);
 router.setEmbedder(fakeEmbedder(cloud));
 assert.notEqual((await router.route('is it free')).method,'lexical');
 router.setEmbedder(null);
 assert.equal((await router.route('is it free')).method,'lexical');
});

test('vectors can be given as a promise (loadIntentVectors) and a failed load leaves the router lexical',async()=>{
 const cloud=decodeVector(vectors.phrases.find(p=>p.intent==='setup.offline').v);
 const a=createIntentRouter({vectors:Promise.resolve(vectors),embedder:fakeEmbedder(cloud)});
 assert.notEqual((await a.route('qqq')).method,'lexical');
 const b=createIntentRouter({vectors:Promise.reject(new Error('404')),embedder:fakeEmbedder(cloud)});
 assert.equal((await b.route('how big is the download')).method,'lexical');
 const c=createIntentRouter({vectors:Promise.resolve(null),embedder:fakeEmbedder(cloud)});
 assert.equal((await c.route('how big is the download')).method,'lexical');
});

test('short utterances and filler never match a topic',async()=>{
 const router=createIntentRouter();
 for(const said of ['','   ','um','uh huh','hmm','okay','hello roberta','please','the','one','test']){
  const r=await router.route(said);
  assert.equal(r.confidence,'low',`"${said}" -> ${r.intent}`);assert.equal(r.intent,null);
 }
});

test('repeat and back phrases are recognised as controls, and "back up" is a backup, not "back"',async()=>{
 const router=createIntentRouter();
 for(const said of ['go back','back','previous menu','take me back please','never mind go back','no go back']){
  const r=await router.route(said);assert.equal(r.intent,'ctl.back',said);assert.equal(r.confidence,'high',said);
 }
 for(const said of ['repeat that','say that again','what were my choices','repeat the menu','can you go over that one more time','sorry what were the options again']){
  const r=await router.route(said);assert.equal(r.intent,'ctl.repeat',said);assert.equal(r.confidence,'high',said);
 }
 const backup=await router.route('how do i back up my chats');
 assert.notEqual(backup.intent,'ctl.back');assert.ok(backup.candidates.slice(0,2).some(c=>c.intent==='export'),'the backup topics are offered');
 assert.notEqual((await router.route('skip the menu')).intent,'ctl.repeat','skip the menu means chat');
});

test('the owner\'s questions about the cloud and the data go where they should, with no model at all',async()=>{
 const router=createIntentRouter();
 const cases={'is this sending information to the cloud':'privacy.cloud','tell me is this cloud connected':'privacy.cloud','what about the cloud':'privacy.cloud',
  'who has my data':'privacy.storage','where is my data stored':'privacy.storage','can I download models on my phone':'setup'};
 for(const [said,intent] of Object.entries(cases)){const r=await router.route(said);assert.equal(r.intent,intent,said);assert.notEqual(r.confidence,'low',said);}
});

test('off-topic and gibberish come out low, with no invented "did you mean" for nonsense',async()=>{
 const router=createIntentRouter();
 for(const said of ["what's the weather like today",'what is two plus two','tell me a joke','give me a recipe for pancakes','sing me a song','asdf qwerty zxcv','blah blah blah']){
  const r=await router.route(said);assert.equal(r.confidence,'low',said);assert.equal(r.intent,null,said);
 }
 assert.deepEqual((await router.route('asdf qwerty zxcv')).candidates,[]);
});

test('the result has the documented shape',async()=>{
 const r=await createIntentRouter().route('is my information safe');
 assert.deepEqual(Object.keys(r).sort(),['candidates','confidence','intent','method','score']);
 assert.ok(['high','medium','low'].includes(r.confidence));assert.ok(['semantic','lexical','hybrid'].includes(r.method));
 for(const c of r.candidates){assert.ok(INTENT_IDS.includes(c.intent));assert.equal(typeof c.score,'number');}
 assert.ok(r.candidates.length<=5);
 for(let i=1;i<r.candidates.length;i+=1)assert.ok(r.candidates[i-1].score>=r.candidates[i].score);
});

// ---- the held-out set ------------------------------------------------------------------------------------------------------------
const key=s=>normalise(s);
test('the held-out set is held out: no query is an example phrase, every intent is covered, off-topic and the owner\'s questions are in',()=>{
 const phrases=new Set(INTENT_PHRASES.map(p=>key(p.text)));
 for(const q of queries)assert.ok(!phrases.has(key(q.text)),`"${q.text}" is in INTENT_PHRASES`);
 const inScope=queries.filter(q=>q.intent),off=queries.filter(q=>!q.intent);
 assert.ok(inScope.length>=80,'at least 80 in-scope queries');assert.ok(off.length>=15,'at least 15 off-topic queries');
 for(const id of INTENT_IDS)assert.ok(inScope.some(q=>q.intent===id),'no held-out query for '+id);
 for(const q of inScope)assert.ok(NODES[q.intent],'unknown intent '+q.intent);
 assert.equal(new Set(queries.map(q=>q.text)).size,queries.length,'duplicate queries');
 const texts=new Set(queries.map(q=>q.text));
 for(const owner of ['tell me is this cloud connected','where exactly is my data stored','can i download the models on my phone'])assert.ok(texts.has(owner),owner);
 assert.ok(queries.some(q=>/chat g p t/.test(q.text)),'a mis-heard "chat g p t" is in');
 for(const kind of ['plain','noisy','owner','hard','blind','blind2','off-topic','off-topic-adjacent'])assert.ok(queries.some(q=>q.kind===kind),kind);
});

test('lexical routing alone (no model loaded) meets its measured floors on the held-out set',async()=>{
 const router=createIntentRouter({nearFloor:0});
 const rows=await routeAll(router,queries);
 const all=summarise(rows),finalSet=summarise(rows.filter(r=>SPLITS.final(r.query)));
 // measured: top-1 85.5%, top-3 96.7%, acted 78% at 93.6% precision (99% on the right menu branch), high 98.2%, off-topic 98.2%; the floors leave a margin
 assert.ok(all.top1Pct>=80,`top-1 ${all.top1Pct}`);assert.ok(all.top3Pct>=92,`top-3 ${all.top3Pct}`);
 assert.ok(all.actedPrecisionPct>=90,`acted precision ${all.actedPrecisionPct}`);assert.ok(all.actedBranchPct>=95,`acted, right branch ${all.actedBranchPct}`);assert.ok(all.highPrecisionPct>=94,`high precision ${all.highPrecisionPct}`);
 assert.ok(all.offTopicRejectedPct>=93,`off-topic rejected ${all.offTopicRejectedPct}`);
 assert.ok(finalSet.top1Pct>=68,`final set top-1 ${finalSet.top1Pct}`);assert.ok(finalSet.offTopicRejectedPct>=90);
 // the noisy speech-to-text style queries and the owner's cloud/data questions are served
 for(const kind of ['noisy','owner']){
  const s=summarise(rows.filter(r=>r.query.kind===kind));assert.ok(s.top1Pct>=80,`${kind} top-1 ${s.top1Pct}`);
 }
});

test('defaults are sane',()=>{
 const d=ROUTER_DEFAULTS;
 assert.ok(d.hybrid.high>d.hybrid.medium&&d.lexical.high>d.lexical.medium);
 assert.ok(d.coldBudgetMs<=250,'a cold embedder never delays an answer by more than a quarter of a second');
});
