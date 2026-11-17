// Phase 0.3 and 0.4 of docs/ENCRYPTION-AT-REST-PLAN.md: how long the passphrase key takes and how big a heavy user's chats are.
//   node scripts/encryption-baseline.mjs [label]        runs here (WebCrypto in Node) and in Chromium, writes docs/evidence/encryption/baseline-<label>.json
// The same measurement function is used by the device probe page (docs/evidence/encryption/README.md).
import {writeFile,mkdir} from 'node:fs/promises';
import os from 'node:os';
import {createRequire} from 'node:module';
const label=process.argv[2]||os.hostname();

export const measureSource=`async function measure(){
  const enc=new TextEncoder(),subtle=crypto.subtle,now=()=>performance.now();
  const out={userAgent:typeof navigator!=='undefined'?navigator.userAgent:'node '+process.version,cores:typeof navigator!=='undefined'?(navigator.hardwareConcurrency||null):null,kdf:[],aes:{}};
  const material=await subtle.importKey('raw',enc.encode('correct horse battery staple'),'PBKDF2',false,['deriveKey']);
  for(const iterations of [100000,300000,600000,1000000]){
    const runs=[];
    for(let i=0;i<5;i++){const salt=crypto.getRandomValues(new Uint8Array(16));const t=now();await subtle.deriveKey({name:'PBKDF2',salt,iterations,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);runs.push(Math.round(now()-t));}
    out.kdf.push({iterations,ms:runs,median:runs.slice().sort((a,b)=>a-b)[2]});
  }
  const key=await subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  for(const [name,size] of [['1KB',1024],['100KB',102400],['1MB',1048576]]){
    const data=new Uint8Array(size).map((_,i)=>i*31%251),iv=crypto.getRandomValues(new Uint8Array(12));
    const t=now();let c;for(let i=0;i<10;i++)c=await subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode('x')},key,data);
    const e=(now()-t)/10;const t2=now();for(let i=0;i<10;i++)await subtle.decrypt({name:'AES-GCM',iv,additionalData:enc.encode('x')},key,c);
    out.aes[name]={encryptMs:+e.toFixed(3),decryptMs:+((now()-t2)/10).toFixed(3)};
  }
  return out;
}`;

// a heavy user, synthetic: 500 chats, 10,000 messages, replies of a few paragraphs
export function syntheticThreads(chats=500,messages=10000){
  const words='the quick brown fox jumps over a lazy dog while reading about local models and private chats'.split(' ');
  const text=n=>Array.from({length:n},(_,i)=>words[(i*7+n)%words.length]).join(' ');
  const threads=[];let made=0;
  for(let c=0;c<chats;c++){
    const per=Math.min(messages-made,Math.ceil(messages/chats));made+=per;
    threads.push({id:'t'+c,title:'Chat number '+c,systemPrompt:'',createdAt:Date.now(),messages:Array.from({length:per},(_,m)=>({id:'m'+c+'-'+m,role:m%2?'assistant':'user',content:text(m%2?180:25),timestamp:Date.now()}))});
  }
  return threads;
}

if(import.meta.url===`file://${process.argv[1]}`){
  const result={label,measuredAt:new Date().toISOString(),node:{},chromium:{}};
  result.node=await (new Function('return ('+measureSource+')')())();
  const threads=syntheticThreads();const t=performance.now();const json=JSON.stringify(threads);const stringifyMs=performance.now()-t;
  result.size={chats:threads.length,messages:threads.reduce((n,x)=>n+x.messages.length,0),jsonBytes:json.length,utf16Bytes:json.length*2,stringifyMs:Math.round(stringifyMs),localStorageLimitBytes:'~5 MB per origin (10 MB in UTF-16 units in most browsers)'};
  const {chromium}=createRequire(import.meta.url)('playwright');
  const {createServer}=await import('node:http');
  const server=createServer((q,r)=>{r.writeHead(200,{'content-type':'text/html'});r.end('<!doctype html><title>probe</title>');});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch();const page=await browser.newPage();
  await page.goto('http://127.0.0.1:'+server.address().port+'/');
  result.chromium=await page.evaluate(`(${measureSource})()`);
  await browser.close();server.close();
  await mkdir('docs/evidence/encryption',{recursive:true});
  await writeFile(`docs/evidence/encryption/baseline-${label}.json`,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({label,nodeKdf600k:result.node.kdf.find(k=>k.iterations===600000).median,chromiumKdf600k:result.chromium.kdf.find(k=>k.iterations===600000).median,jsonMB:+(result.size.jsonBytes/1e6).toFixed(2),stringifyMs:result.size.stringifyMs},null,1));
}
