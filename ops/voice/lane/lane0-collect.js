return (async()=>{
  const out={at:new Date().toISOString(),url:location.origin};
  const n=navigator;
  out.ua=n.userAgent;
  out.platform=n.platform;
  out.cores=n.hardwareConcurrency??null;
  out.deviceMemoryGB=n.deviceMemory??null;
  out.touchPoints=n.maxTouchPoints;
  out.secureContext=window.isSecureContext;
  out.crossOriginIsolated=window.crossOriginIsolated===true;
  out.sharedArrayBuffer=typeof SharedArrayBuffer!=='undefined';
  try{const e=await n.storage.estimate();out.storage={usageMB:Math.round(e.usage/1e6),quotaMB:Math.round(e.quota/1e6)};}catch(e){out.storage={error:String(e.message||e)};}
  try{out.persisted=await n.storage.persisted?.();}catch{}
  out.opfs=!!(n.storage&&n.storage.getDirectory);
  // WebGPU
  try{
    if(!n.gpu){out.webgpu={api:false};}
    else{
      const a=await n.gpu.requestAdapter();
      if(!a){out.webgpu={api:true,adapter:false};}
      else{
        let info=a.info;if(!info&&a.requestAdapterInfo){try{info=await a.requestAdapterInfo();}catch{}}
        out.webgpu={api:true,adapter:true,fallback:!!a.isFallbackAdapter,shaderF16:a.features.has('shader-f16'),
          vendor:info&&info.vendor,architecture:info&&info.architecture,device:info&&info.device,description:info&&info.description,
          maxBufferMB:Math.round((a.limits.maxBufferSize||0)/1e6),maxStorageBufferMB:Math.round((a.limits.maxStorageBufferBindingSize||0)/1e6)};
      }
    }
  }catch(e){out.webgpu={error:String(e.message||e)};}
  // WASM features
  try{out.wasmSimd=WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,10,1,8,0,65,0,253,15,253,98,11]));}catch{out.wasmSimd=null;}
  // Speech synthesis voices (names and languages only)
  try{
    const s=window.speechSynthesis;
    if(!s){out.speech={synth:false};}
    else{
      let v=s.getVoices();
      if(!v.length){await new Promise(r=>{const d=()=>r();s.addEventListener('voiceschanged',d,{once:true});setTimeout(r,2500);});v=s.getVoices();}
      const en=v.filter(x=>/^en/i.test(x.lang));
      out.speech={synth:true,total:v.length,english:en.length,localEnglish:en.filter(x=>x.localService).length,
        sample:v.slice(0,40).map(x=>({name:x.name,lang:x.lang,local:x.localService,def:x.default}))};
    }
  }catch(e){out.speech={error:String(e.message||e)};}
  // Time a small compute loop so the probe has a first number to compare (not a calibrated benchmark)
  try{const t=performance.now();let x=0;for(let i=0;i<3e7;i++){x+=Math.sqrt(i);}out.jsLoopMs=Math.round(performance.now()-t);out._x=x>0;delete out._x;}catch{}
  return out;
})()
