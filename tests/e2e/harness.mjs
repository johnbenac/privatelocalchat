// Builds the app, serves dist/, starts the fake provider and returns a Playwright page already configured for API mode.
import {execFileSync,spawn} from 'node:child_process';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('playwright');
import {startFakeApi} from './fake-api.mjs';
import {setTimeout as sleep} from 'node:timers/promises';
import {devSite} from '../helpers/dev-site.mjs';
const PORT_OFFSET=Number(process.env.E2E_PORT_OFFSET||0); // lets several suites run side by side on one machine
// profileDir: keep the browser's data in that folder (a persistent profile, for a test that closes and reopens the browser, or shares one browser's storage and locks between pages);
// the machine's rule is a dedicated folder on /media/Vivarium, chosen by the caller (tests/e2e/profile-root.mjs reads PLC_E2E_PROFILE_ROOT).
export async function launch({build=true,port:basePort=18271,viewport={width:1280,height:800},storage={},init=null,touch=false,serviceWorkers='block',launchArgs=[],profileDir=null}={}){
 const port=basePort+PORT_OFFSET;
 if(build)execFileSync('node',['scripts/build.mjs'],{stdio:'pipe',env:{...process.env,DEPLOY_BRANCH:process.env.PLC_E2E_BRANCH||'local',...devSite(process.env.PLC_E2E_BRANCH)}});
 const web=spawn('node',['scripts/serve.mjs'],{env:{...process.env,PORT:String(port)},stdio:'pipe'});
 const api=await startFakeApi();
 for(let i=0;i<50;i++){try{if((await fetch(`http://127.0.0.1:${port}/`)).ok)break;}catch{}await sleep(100);}
 const contextOptions={viewport,serviceWorkers,...(touch?{isMobile:true,hasTouch:true,deviceScaleFactor:2}:{})};
 const browser=profileDir?null:await chromium.launch({args:launchArgs});
 const context=profileDir?await chromium.launchPersistentContext(profileDir,{...contextOptions,args:launchArgs}):await browser.newContext(contextOptions);
 const page=profileDir?(context.pages()[0]||await context.newPage()):await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource|WebGPU|webgpu/i.test(m.text()))errors.push(m.text());});
 await page.addInitScript(({endpoint,storage})=>{
  if(!sessionStorage.getItem('chatConfig'))sessionStorage.setItem('chatConfig',JSON.stringify({endpoint,token:'',model:'fake-model',theme:'light'}));
  if(!sessionStorage.getItem('chatModels'))sessionStorage.setItem('chatModels',JSON.stringify(['fake-model']));
  if(!localStorage.getItem('plc.inferenceMode.v1'))localStorage.setItem('plc.inferenceMode.v1','api');
  if(!('plc.lockSplash.v1' in storage)&&!localStorage.getItem('plc.lockSplash.v1'))localStorage.setItem('plc.lockSplash.v1','off'); // the not-locked reminder is tested on its own
  for(const [k,v] of Object.entries(storage))if(!localStorage.getItem(k))localStorage.setItem(k,v);
 },{endpoint:`http://127.0.0.1:${api.port}/v1`,storage});
 if(init)await page.addInitScript(init);
 await page.goto(`http://127.0.0.1:${port}/`);
 await page.waitForSelector('#messageInput');
 await page.waitForFunction(()=>(window.__plcBooted===true&&Boolean(window.plcShell))||window.__plcVaultLocked===true,null,{timeout:10000}).catch(()=>{}); // the page finished starting and drew its shell (fresh.e2e strips the flag, so this only waits, it does not fail)
 const close=async()=>{await (browser||context).close();web.kill();await api.close();};
 return {page,context,browser,api,errors,close,web,origin:`http://127.0.0.1:${port}`}; // web: the static server process (stopping it makes the origin truly unreachable, even for the service worker)
}
export const assert=(cond,msg)=>{if(!cond)throw new Error('E2E assertion failed: '+msg);};
