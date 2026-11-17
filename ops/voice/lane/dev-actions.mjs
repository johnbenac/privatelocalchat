// Lane 5: drives the dev build's command channel (`window.__plcDebugControl`, present only in DEV_DIAGNOSTICS builds) through the real code path
// for the voice actions, on a local dev build. `voice-cycle` installs and removes a voice on THIS machine's headless browser (it needs the
// hosted files, so it needs network); drop it from the list for a decision-only run.
//
//   node ops/voice/lane/dev-actions.mjs [voice-state voice-decide voice-cycle]
import {launch} from '../../../tests/e2e/harness.mjs';

process.env.PLC_E2E_BRANCH='dev';
const actions=process.argv.slice(2);
const t=await launch({viewport:{width:1000,height:700}});
try{
  await t.page.waitForFunction(()=>window.__plcDebugControl,null,{timeout:20000});
  const out={};
  for(const a of actions.length?actions:['voice-state','voice-decide']){
    out[a]=await t.page.evaluate(x=>window.__plcDebugControl(x).catch(e=>({error:String(e.message||e).slice(0,200)})),a);
  }
  console.log(JSON.stringify(out,null,1).slice(0,4000));
}finally{await t.close();}
