// Lane 0 inventory (read only): runs lane0-collect.js in a page of any origin and writes what the browser reports (cores, memory, WebGPU, WASM
// SIMD, storage estimate, speech voices, a timed JS loop). Installs nothing.
//
//   ORIGIN=https://privatelocal.chat node ops/voice/lane/lane0-pw.mjs --browser chromium --out lane0.json [--flag=--enable-unsafe-webgpu]
//   ORIGIN=https://privatelocal.chat node ops/voice/lane/lane0-pw.mjs --cdp-port 9222 --out lane0.json     # an already running Chromium
//
// Options: --browser chromium|webkit|firefox, --out <file>, --cdp-port <n>, and any number of --flag=<browser launch argument>.
import {createRequire} from 'node:module';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

const {chromium,webkit,firefox}=createRequire(import.meta.url)('playwright');
const args=process.argv.slice(2);
const value=(name,fallback)=>{const i=args.indexOf(name);return i>=0&&args[i+1]&&!args[i+1].startsWith('--')?args[i+1]:fallback;};
const origin=(process.env.ORIGIN||'').replace(/\/+$/,'');
if(!/^https?:\/\//.test(origin)){console.error('Set ORIGIN to the site to inspect');process.exit(2);}
const which=value('--browser','chromium'),out=value('--out','lane0-result.json'),cdp=value('--cdp-port','');
const launchArgs=args.filter(a=>a.startsWith('--flag=')).map(a=>a.slice(7));
const b=cdp?await chromium.connectOverCDP('http://127.0.0.1:'+cdp):await ({chromium,webkit,firefox}[which]).launch({args:launchArgs});
const ctx=cdp?(b.contexts()[0]||await b.newContext()):await b.newContext();
const p=await ctx.newPage();
try{
  await p.goto(origin+'/',{waitUntil:'domcontentloaded'});
  await p.waitForTimeout(1500);
  const v=await p.evaluate(`(()=>{${fs.readFileSync(fileURLToPath(new URL('./lane0-collect.js',import.meta.url)),'utf8')}})()`);
  fs.writeFileSync(out,JSON.stringify(v,null,1));
  const w=v.webgpu||{};
  console.log(which+(cdp?'-cdp':''),'| cores',v.cores,'mem',v.deviceMemoryGB,'| webgpu api',w.api,'adapter',w.adapter,'fallback',w.fallback,'vendor',w.vendor,w.architecture,'| simd',v.wasmSimd,'| isolated',v.crossOriginIsolated,'| voices',v.speech&&v.speech.total,'| loopMs',v.jsLoopMs);
}finally{
  await p.close().catch(()=>{});
  if(!cdp)await b.close();
}
