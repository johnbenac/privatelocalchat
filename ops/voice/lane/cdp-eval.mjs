// Evaluates one script in ONE already open page of a browser that listens for the Chrome DevTools Protocol (a phone over `adb forward`, or an
// SSH tunnel, or a desktop Chromium started with --remote-debugging-port). The page is picked by the start of its URL, so no other tab is touched.
//
//   node ops/voice/lane/cdp-eval.mjs <port> <urlPrefix> <scriptFile> <outFile> [--decision-only]
//   node ops/voice/lane/cdp-eval.mjs 9222 https://dev.privatelocal.chat/ ops/voice/lane/lane0-collect.js lane0.json
//   node ops/voice/lane/cdp-eval.mjs 9222 https://dev.privatelocal.chat/ ops/voice/lane/voice-lane.js lane.json --decision-only
//
// <scriptFile> is lane0-collect.js or voice-lane.js (a function body that starts with `return`). With --decision-only, voice-lane.js stops
// after asking the controller: nothing is installed and no model file is fetched. Needs the `ws` package (already in node_modules via npm ci).
import {createRequire} from 'node:module';
import fs from 'node:fs';

const WebSocket=createRequire(import.meta.url)('ws');
const [port,prefix,scriptFile,outFile]=process.argv.slice(2).filter(a=>!a.startsWith('--'));
const decisionOnly=process.argv.includes('--decision-only');
if(!port||!prefix||!scriptFile||!outFile){console.error('usage: node cdp-eval.mjs <port> <urlPrefix> <scriptFile> <outFile> [--decision-only]');process.exit(2);}
const list=await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const t=list.find(x=>x.type==='page'&&x.url.startsWith(prefix));
if(!t){console.log('no matching page');process.exit(2);}
const ws=new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r,j)=>{ws.on('open',r);ws.on('error',j);});
const expr=`(()=>{${decisionOnly?'window.__voiceDecisionOnly=true;':''}${fs.readFileSync(scriptFile,'utf8').replace(/^(\s*\/\/.*\n)*\s*return /,'return ')}})()`;
ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression:expr,awaitPromise:true,returnByValue:true}}));
const res=await new Promise(r=>ws.on('message',m=>{const d=JSON.parse(m);if(d.id===1)r(d);}));
ws.close();
const v=res.result&&res.result.result&&res.result.result.value;
if(!v){console.log('eval failed',JSON.stringify(res).slice(0,200));process.exit(3);}
fs.writeFileSync(outFile,JSON.stringify(v,null,1));
const w=v.webgpu||{},sp=v.speech||{};
console.log('| build',v.build||'','| decision',JSON.stringify(v.decision||null),'| cores',v.cores,'mem',v.deviceMemoryGB,'| webgpu api',w.api,'adapter',w.adapter,'| simd',v.wasmSimd,'| isolated',v.crossOriginIsolated,'| storage',JSON.stringify(v.storage||v.storageBefore),'| voices',sp.total,'en',sp.english,'| loopMs',v.jsLoopMs,'|',(v.ua||'').slice(0,60));
