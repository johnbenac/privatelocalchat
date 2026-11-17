// The in-page part of the voice lane harness. It is a function BODY (it starts with `return`), evaluated inside an app page by one of the
// drivers next to it (lane-pw.mjs, lane-wd.mjs, cdp-eval.mjs). It returns one JSON object per run.
//
//   1. Asks the real voice controller for its advice on this device (which voice it recommends, and which it warns may be slow). Nothing is installed by this step.
//   2. Unless `window.__voiceDecisionOnly` is true: installs the voice from the hosted files, speaks one sentence, measures it,
//      then unloads and removes it again and reports the storage estimate before and after.
//
// The drivers set `window.__voiceDecisionOnly = true` for their `--decision-only` mode. In that mode this script returns right after step 1:
// it never calls createVoiceEngine, install, speak or remove. (No model file is ever fetched and nothing is written.)
return (async()=>{
  const out={at:new Date().toISOString(),origin:location.origin,ua:navigator.userAgent.slice(0,90)};
  const base=(window.APP_BUILD&&window.APP_BUILD.commit)?'/releases/'+window.APP_BUILD.commit+'/':'/';
  out.build=window.APP_BUILD&&window.APP_BUILD.commit&&window.APP_BUILD.commit.slice(0,7);
  const est=async()=>{try{const e=await navigator.storage.estimate();return {usageMB:+(e.usage/1e6).toFixed(1),quotaMB:Math.round(e.quota/1e6)};}catch{return null;}};
  out.storageBefore=await est();
  try{
    // 1. the device advice from the real voice controller (the picker's "recommended" / "may be slow" labels). It never blocks a choice, and nothing is installed here.
    const choice=await import(base+'chat/voice/voice-choice.mjs');
    const env=async()=>{let webgpu={available:false};try{const a=await navigator.gpu?.requestAdapter();if(a)webgpu={available:true,isFallbackAdapter:!!a.isFallbackAdapter};}catch{}return {deviceMemoryGB:navigator.deviceMemory,cores:navigator.hardwareConcurrency,webgpu};};
    const store={};const scratch={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=v;},removeItem:k=>{delete store[k];}};
    const ctl=choice.createVoiceChoice({factory:async()=>{throw new Error('advice only');},env,storage:scratch});
    const adv=await ctl.advise();
    out.decision={recommended:adv&&adv.recommended||null,notes:adv&&adv.notes||null,probeMs:adv&&adv.probeMs||null,candidate:adv&&adv.recommended||'kitten'};
  }catch(e){out.decision={error:String(e&&e.message||e).slice(0,200)};}
  if(window.__voiceDecisionOnly){out.decisionOnly=true;return out;}
  // 2. the real engine, hosted files: install, speak, measure, remove
  try{
    const id=(out.decision&&out.decision.candidate)||'kitten';const kk=id==='kokoro';
    const [eng,man]=await Promise.all([import(base+'chat/voice/voice-engine.mjs'),import(base+(kk?'chat/voice/voice-manifest-kokoro.mjs':'chat/voice/voice-manifest.mjs'))]);
    const engine=eng.createVoiceEngine({engine:id,baseUrl:kk?man.KOKORO_Q8_BASE_URL:man.KITTEN_NANO_BASE_URL,workerUrl:base+(kk?'chat/vendor/voice/worker-kokoro.js':'chat/vendor/voice/worker.js')});out.engineUsed=id;
    const t0=performance.now();
    await engine.install(()=>{});
    out.installMs=Math.round(performance.now()-t0);
    out.afterInstall=await engine.status();out.storageInstalled=await est();
    const chunks=[];let firstAt=null;const ts=performance.now();
    const text='The capital of France is Paris. This is a short test of on device speech.';
    const r=await engine.speak(text,{onChunk:(c)=>{if(firstAt===null)firstAt=performance.now()-ts;chunks.push(c.samples.length);}});
    out.speak={audioSeconds:r.audioSeconds,synthSeconds:r.synthSeconds,realTimeFactor:r.realTimeFactor,firstAudioMs:r.firstAudioMs,chunks:chunks.length,samples:chunks.reduce((a,b)=>a+b,0)};
    const vp=await import(base+'runtime/voice-pick.mjs');
    out.verdict={fastEnough:vp.voiceIsFastEnough({realTimeFactor:r.realTimeFactor,firstAudioMs:r.firstAudioMs}),startDelayMs:Math.round(vp.startDelayMs({audioSeconds:20,realTimeFactor:r.realTimeFactor,firstAudioMs:r.firstAudioMs}))};
    await engine.unload?.();
    await engine.remove();
    out.afterRemove=await engine.status();out.storageAfter=await est();
  }catch(e){out.engineError=String(e&&e.message||e).slice(0,300);}
  return out;
})()
