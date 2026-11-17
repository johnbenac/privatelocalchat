// Runs voice-lane.js through a W3C WebDriver server (geckodriver for Firefox, safaridriver for Safari, chromedriver for Chrome), for browsers
// Playwright cannot drive. Start the driver yourself, then:
//
//   geckodriver --port 4444 &
//   ORIGIN=https://dev.privatelocal.chat node ops/voice/lane/lane-wd.mjs --driver http://127.0.0.1:4444 --out result.json
//   ORIGIN=... node ops/voice/lane/lane-wd.mjs --driver http://127.0.0.1:4444 --out result.json --decision-only
//
// Options: --driver <url> (required; may be an SSH tunnel to the machine that runs the driver), --browser firefox|safari|chrome (default firefox),
// --out <file>, --decision-only (install nothing, fetch no model file), --headed (Firefox only: do not pass -headless). ORIGIN is required.
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

const args=process.argv.slice(2);
const value=(name,fallback)=>{const i=args.indexOf(name);return i>=0&&args[i+1]&&!args[i+1].startsWith('--')?args[i+1]:fallback;};
const driver=(value('--driver','')).replace(/\/+$/,'');
const origin=(process.env.ORIGIN||'').replace(/\/+$/,'');
const browserName={firefox:'firefox',safari:'safari',chrome:'chrome'}[value('--browser','firefox')];
const out=value('--out','lane-result.json');
const decisionOnly=args.includes('--decision-only');
if(!driver||!/^https?:\/\//.test(origin)||!browserName){console.error('usage: ORIGIN=<site> node lane-wd.mjs --driver <webdriver url> [--browser firefox|safari|chrome] [--out file] [--decision-only]');process.exit(2);}

const body=fs.readFileSync(fileURLToPath(new URL('./voice-lane.js',import.meta.url)),'utf8');
const j=async(m,p,b)=>{const r=await fetch(driver+p,{method:m,headers:{'content-type':'application/json'},body:b?JSON.stringify(b):undefined});const t=await r.json();if(!r.ok)throw new Error(JSON.stringify(t).slice(0,300));return t.value;};
const alwaysMatch={browserName};
if(browserName==='firefox'&&!args.includes('--headed'))alwaysMatch['moz:firefoxOptions']={args:['-headless']};
const s=await j('POST','/session',{capabilities:{alwaysMatch}});
const id=s.sessionId;
try{
  await j('POST',`/session/${id}/timeouts`,{script:280000,pageLoad:60000});
  await j('POST',`/session/${id}/url`,{url:origin+'/'});
  await new Promise(r=>setTimeout(r,3000));
  const pre=decisionOnly?'window.__voiceDecisionOnly=true;':'';
  const r=await j('POST',`/session/${id}/execute/async`,{script:`const done=arguments[arguments.length-1];${pre}(function(){${body}})().then(v=>done(v),e=>done({error:String(e&&e.message||e).slice(0,300)}));`,args:[]});
  fs.writeFileSync(out,JSON.stringify(r,null,1));
  const sp=r.speak||{};
  console.log(browserName,'| build',r.build,'| decision',JSON.stringify(r.decision),decisionOnly?'| decision only':'| install '+r.installMs+' ms | rtf '+sp.realTimeFactor+' first '+sp.firstAudioMs+' | fast '+(r.verdict&&r.verdict.fastEnough),r.engineError||'');
}finally{
  await fetch(driver+`/session/${id}`,{method:'DELETE'}).catch(()=>{});
}
