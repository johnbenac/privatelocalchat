// Runs voice-lane.js in a Playwright browser (or in a browser you already started, over CDP) against any deployed origin.
//
//   ORIGIN=https://dev.privatelocal.chat node ops/voice/lane/lane-pw.mjs --browser chromium --out result.json
//   ORIGIN=https://dev.privatelocal.chat node ops/voice/lane/lane-pw.mjs --browser webkit --out result.json --decision-only
//   ORIGIN=https://dev.privatelocal.chat node ops/voice/lane/lane-pw.mjs --cdp-port 9222 --out result.json   # an already running Chromium
//
// Options: --browser chromium|webkit|firefox (default chromium), --out <file> (default lane-result.json), --cdp-port <n> (attach to a Chromium
// started with --remote-debugging-port=<n>; the port may be an SSH tunnel to a device), --decision-only (ask the controller, install nothing,
// request no model file). ORIGIN is required: this tool never guesses a site. Needs the `playwright` npm package (npm ci).
import {createRequire} from 'node:module';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

const {chromium,webkit,firefox}=createRequire(import.meta.url)('playwright');
const args=process.argv.slice(2);
const flag=(name)=>args.includes(name);
const value=(name,fallback)=>{const i=args.indexOf(name);return i>=0&&args[i+1]&&!args[i+1].startsWith('--')?args[i+1]:fallback;};
const origin=(process.env.ORIGIN||'').replace(/\/+$/,'');
if(!/^https?:\/\//.test(origin)){console.error('Set ORIGIN to the site to test, for example ORIGIN=https://dev.privatelocal.chat');process.exit(2);}
const which=value('--browser','chromium');
const out=value('--out','lane-result.json');
const cdp=value('--cdp-port','');
const decisionOnly=flag('--decision-only');
const types={chromium,webkit,firefox};
if(!types[which]){console.error('unknown --browser '+which);process.exit(2);}

const b=cdp?await chromium.connectOverCDP('http://127.0.0.1:'+cdp):await types[which].launch();
const ctx=cdp?(b.contexts()[0]||await b.newContext()):await b.newContext();
const p=await ctx.newPage();
const logs=[];p.on('pageerror',e=>logs.push(e.message.slice(0,160)));
try{
  await p.goto(origin+'/',{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window.APP_BUILD,null,{timeout:30000}).catch(()=>{});
  await p.waitForTimeout(1500);
  if(decisionOnly)await p.evaluate(()=>{window.__voiceDecisionOnly=true;});
  const body=fs.readFileSync(fileURLToPath(new URL('./voice-lane.js',import.meta.url)),'utf8');
  const r=await p.evaluate(`(()=>{${body}})()`);
  r.pageErrors=logs;
  fs.writeFileSync(out,JSON.stringify(r,null,1));
  const s=r.speak||{};
  console.log(which+(cdp?'-cdp':''),'| build',r.build,'| decision',JSON.stringify(r.decision),decisionOnly?'| decision only':'| install '+r.installMs+' ms | rtf '+s.realTimeFactor+' first '+s.firstAudioMs+' | fast '+(r.verdict&&r.verdict.fastEnough),'| storage',JSON.stringify(r.storageBefore),'->',JSON.stringify(r.storageAfter||r.storageBefore),r.engineError||'');
}finally{
  await p.close().catch(()=>{});
  if(!cdp)await b.close();
}
