import {Telemetry} from './telemetry-core.mjs';
import {readCheckpoints} from './native-journal.mjs';
import {captureProvider} from './conversation-capture.mjs';
import {RemoteControl} from './remote-control.mjs';
export async function startDiagnostics(){
 if(location.hostname!=='dev.privatelocal.chat')return;
 const panel=document.createElement('details');panel.id='devDiagnostics';panel.innerHTML=`<summary>Development diagnostics</summary><p>Enter a receiver URL to start streaming immediately. It stays on across reloads and restarts. Clear the URL to stop. Full local conversation objects are sent only when content capture is enabled. API settings and authorization headers are not recorded.</p><label for="debugReceiver">Diagnostic receiver URL</label><input id="debugReceiver" type="url" placeholder="https://your-receiver.example/session" autocomplete="off"><label><input id="debugDisk" type="checkbox"> Save diagnostics on this device, including airplane mode</label><p>Up to about 5 MB is retained, including native construction checkpoints. Saved events upload after reconnecting and clear only after acknowledgement.</p><div class="model-actions"><button type="button" id="debugSend">Send saved events now</button><button type="button" id="debugExport">Export saved events</button><button type="button" id="debugClear">Clear saved events</button></div><p id="debugStatus" role="status">Enter a receiver URL to enable diagnostics.</p>`;
 // The panel lives in Settings > Models, after "Details and repair" (#advancedModels). The old model panel it was anchored to is gone (the model UI rework), and the
 // shell builds the Settings page a moment after start-up (and may rebuild it), so the panel is placed when the anchor appears and kept after it.
 const place=()=>{const anchor=document.querySelector('#advancedModels')||document.querySelector('#localModelPanel');if(anchor&&anchor.nextElementSibling!==panel)anchor.after(panel);};
 const holder=document.createElement('div');holder.hidden=true;holder.id='devDiagnosticsHolder';document.body.append(holder);holder.append(panel); // in the document at once (the setup below finds its fields by id); moved when the anchor appears
 place();new MutationObserver(place).observe(document.documentElement,{childList:true,subtree:true});
 const content=document.createElement('label');content.innerHTML='<input id="debugCapture" type="checkbox"> Include full local requests, streamed responses, and the active saved chat';panel.querySelector('#debugStatus').before(content);
 const remoteLabel=document.createElement('label');remoteLabel.innerHTML='<input id="debugRemote" type="checkbox"> Allow remote local-model prompts and controls through this receiver (includes conversation content)';panel.querySelector('#debugStatus').before(remoteLabel);const remoteStatus=document.createElement('p');remoteStatus.id='debugRemoteStatus';panel.querySelector('#debugStatus').before(remoteStatus);
 const badge=document.createElement('p');badge.id='debugBadge';badge.setAttribute('role','status');panel.querySelector('summary').after(badge); // (it used to follow the old model status line, which is gone)
 const $=id=>document.getElementById(id);let lastStatus='',generating=false,sampling=false,lastSample=0,lastHeartbeat=0,lastNative='';
 let checkpointTask=null,lastSequence=-1;
 const t=new Telemetry({onStatus:text=>{lastStatus=text;update();}});
 $('debugReceiver').value=t.config.url;$('debugDisk').checked=t.config.disk;$('debugCapture').checked=t.config.captureContent;$('debugRemote').checked=t.config.remoteControl;
 async function update(){
  const count=await t.count();const mode=t.config.enabled?'ON · '+(t.config.disk?'saving to device':'memory queue only'):'OFF';
  panel.querySelector('summary').textContent='Development diagnostics — '+mode;
  badge.textContent='Diagnostics '+mode+' · '+count+' queued events. '+(t.config.captureContent?'Full conversation objects included.':'Conversation content excluded.');
  $('debugStatus').textContent=lastStatus||'Enter a receiver URL to enable diagnostics.';
 }
 const record=(type,data)=>t.record(type,{version:window.APP_BUILD.version,commit:window.APP_BUILD.commit,...data});
 window.__plcDiagCall=(kind,data)=>{if(t.config.enabled)record('call',{callKind:kind,...data});}; // the voice call's own trace (states, timings, lengths: never what was said); chat/call/call.mjs calls it between its development markers
 const runtime=window.APP_BUILD.developmentRuntime;
 const runtimeIdentity=runtime?{nativeBuildId:runtime.nativeBuildId,runtimeVariant:runtime.variant,runtimeSha256:runtime.wasmSha256}:{};
 if(runtime){const identity=document.createElement('p');identity.id='debugRuntime';identity.textContent='Runtime experiment: '+runtime.variant+' · Wasm '+runtime.wasmSha256.slice(0,12);panel.querySelector('summary').after(identity);}
 let snapshotSent=false,policyTask=null,policyUrl='',lastPolicyAt=0;
 async function captureSnapshot(){
  if(snapshotSent||!t.config.enabled||!t.config.captureContent||!window.__plcDebugCurrentConversation)return;
  const snapshot=window.__plcDebugCurrentConversation();if(!snapshot)return;snapshotSent=true;
  await t.recordObject('conversation-snapshot',crypto.randomUUID(),snapshot);
 }
 function refreshContentPolicy(){
  if(policyTask)return policyUrl===t.config.url?policyTask:policyTask.then(()=>refreshContentPolicy());
  policyUrl=t.config.url;lastPolicyAt=Date.now();
  policyTask=(async()=>{await t.refreshPolicy();$('debugCapture').checked=t.config.captureContent;$('debugRemote').checked=t.config.remoteControl;await captureSnapshot();await update();})().finally(()=>{policyTask=null;});return policyTask;
 }
 $('debugCapture').addEventListener('change',async()=>{t.configure({captureContent:$('debugCapture').checked,contentConsent:'local',...(!$('debugCapture').checked?{remoteControl:false,controlConsent:'local'}:{})});$('debugRemote').checked=t.config.remoteControl;snapshotSent=false;await record('content-capture-setting',{state:t.config.captureContent?'enabled':'disabled',source:'local'});await captureSnapshot();update();});
 $('debugRemote').addEventListener('change',async()=>{const enabled=$('debugRemote').checked;t.configure({remoteControl:enabled,controlConsent:'local',...(enabled?{captureContent:true,contentConsent:'local'}:{})});$('debugCapture').checked=t.config.captureContent;await captureSnapshot();update();});
 function applySettings(){
  try{
   const url=$('debugReceiver').value.trim(),changed=url!==t.config.url||$('debugDisk').checked!==t.config.disk;
   t.configure({url,disk:$('debugDisk').checked});
   if(changed&&url){record('diagnostics-configured',{online:navigator.onLine,browser:navigator.userAgent,...runtimeIdentity});lastStatus='Streaming is enabled and will resume automatically after reconnecting.';}
   else if(!url)lastStatus='Receiver cleared. Streaming is off; saved events are kept.';
   if(changed&&url&&t.config.disk)checkpoints(true);
   if(changed&&url){snapshotSent=false;refreshContentPolicy();}
   update();
  }catch(e){lastStatus=e.message;update();}
 }
 $('debugReceiver').addEventListener('input',applySettings);
 $('debugReceiver').addEventListener('change',applySettings);
 $('debugDisk').addEventListener('change',applySettings);
 $('debugSend').onclick=async()=>{applySettings();await refreshContentPolicy();await captureSnapshot();t.flush({force:true});};
 $('debugExport').onclick=async()=>{const data=await t.export();const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='private-local-diagnostics.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 $('debugClear').onclick=async()=>{if(await window.plcDialogs.confirm('Clear saved diagnostic events?','Your chats and models will be kept.','Clear',{danger:true})){await t.clear();update();}};
 for(const event of ['online','offline','pageshow','pagehide'])window.addEventListener(event,()=>{record(event,{online:navigator.onLine,visibility:document.visibilityState});if(event==='online'){refreshContentPolicy();t.flush();}});
 document.addEventListener('visibilitychange',()=>record('visibility',{visibility:document.visibilityState}));
 window.addEventListener('error',event=>{let source='';try{source=new URL(event.filename).pathname;}catch{}record('page-error',{errorName:event.error?.name||'Error',source,line:event.lineno,column:event.colno});});
 window.addEventListener('unhandledrejection',event=>record('page-error',{errorName:event.reason?.name||'Error',code:event.reason?.code||'unhandled-rejection'}));
 window.addEventListener('download-recovery',event=>record('download-recovery',event.detail));
 await record('page-start',{online:navigator.onLine,browser:navigator.userAgent,pageRestart:true,...runtimeIdentity});
 function checkpoints(recovered=false){
  if(!t.config.enabled||!t.config.disk)return Promise.resolve();
  if(checkpointTask)return checkpointTask;
  checkpointTask=(async()=>{
   try{const records=(await readCheckpoints()).filter(r=>r.sequence>lastSequence).slice(-64);for(const memory of records){await record(recovered?'native-checkpoint-recovered':'native-checkpoint',{memory});lastSequence=memory.sequence;}}
   catch(e){await record('native-journal-unavailable',{code:e.name});}
  })().finally(()=>{checkpointTask=null;});
  return checkpointTask;
 }

 await checkpoints(true);
 const waitUntil=Date.now()+20000;while(!window.localModels&&Date.now()<waitUntil)await new Promise(r=>setTimeout(r,100));
 const host=window.__plcDebugModelHost;if(!host){lastStatus='Model controls did not initialize.';await update();return;}
 const phoneProfile=/iPhone|iPad|iPod/.test(navigator.userAgent);
 // The CPU placement control exceeded the phone's process limit during construction.
 // Keep it available explicitly; the full GPU control completed retained long replies.
 let gpuLayerOverride=phoneProfile?-1:null;
 const profileNotice=document.createElement('p');
 function describeProfile(){profileNotice.textContent=gpuLayerOverride===0?'iPhone resource experiment: model layers run on CPU, with some weights still on GPU. Replies may be slower. Existing downloaded files are reused.':'Resource experiment: full GPU layer offload requested. Existing downloaded files are reused.';}
 if(phoneProfile){describeProfile();panel.querySelector('summary').after(profileNotice);}
 window.__plcDebugSetComputeProfile=async({gpuLayers})=>{if(![0,-1].includes(gpuLayers))throw Error('Unsupported GPU profile');const state=host.getState();if(state.busy||state.load.state==='ready'||state.load.state==='loading'||generating)throw Error('Unload the model before changing its profile');gpuLayerOverride=gpuLayers;describeProfile();if(!profileNotice.isConnected)panel.querySelector('summary').after(profileNotice);await record('compute-profile',{state:gpuLayers===0?'zero-layer-offload':'full-gpu-offload',memory:{requestedGpuLayers:gpuLayers}});return {gpuLayers,context:host.tierConfig().context};};
 if(phoneProfile)record('compute-profile',{state:'full-gpu-offload',memory:{requestedGpuLayers:-1}});
 const tierConfig=host.tierConfig.bind(host);
 host.tierConfig=(...args)=>{const config=tierConfig(...args);if(config.adapter==='wllama'){config.knobs={...config.knobs,devDiagnostics:t.config.enabled,devDiagnosticsDisk:t.config.enabled&&t.config.disk};if(gpuLayerOverride!==null)config.context={...config.context,n_gpu_layers:gpuLayerOverride};}return config;};
 async function sample(){
  if(sampling||!t.config.enabled)return;sampling=true;
  try{
   const s=host.getState();await record('runtime-state',{host:s.host.state,load:s.load.state,busy:s.busy,phase:s.load.progress?.phase,loadAttempt:s.load.loadAttempt});
   const stats=await host.provider().stats();await record('runtime-memory',{memory:{runtime:stats.engine?.runtimeMemory,source:stats.engine?.sourceCounters,context:stats.engine?.info?.context,generation:stats.engine?.lastGenerationDiagnostics}});
   if(s.load.state==='loading'){
    const lines=stats.engine?.nativeLinesSample||[],key=JSON.stringify(lines);
    if(key!==lastNative){lastNative=key;await record('native-load-log',{nativeLines:lines});}
   }
  }catch(e){await record('runtime-sample-unavailable',{code:e.code||e.name});}finally{sampling=false;}
 }
 let previous='',lastProgress=0,previousLoadPhase='';
 host.subscribe(s=>{
  if(s.load.progress?.phase!==previousLoadPhase){previousLoadPhase=s.load.progress?.phase;if(previousLoadPhase)record('load-progress',{phase:previousLoadPhase,memory:s.load.progress.memory});}
  const key=[s.host.state,s.load.state,s.busy,s.selection.tier,s.tiers[s.selection.tier].install.state].join('|');
  if(key!==previous){previous=key;record('model-state',{host:s.host.state,load:s.load.state,busy:s.busy,tier:s.selection.tier,state:s.tiers[s.selection.tier].install.state,code:s.lastError?.code});}
  if(s.transfer&&Date.now()-lastProgress>250){lastProgress=Date.now();record('download-progress',{phase:s.transfer.kind,bytesDone:s.transfer.bytesDone,bytesTotal:s.transfer.bytesTotal,filesDone:s.transfer.filesDone,filesTotal:s.transfer.filesTotal});}
 });
 for(const name of ['load','install','repair','remove','restartHost','selectTier']){
  const original=host[name].bind(host);host[name]=async(...args)=>{applySettings();await record(name+'-start',{tier:host.getState().selection.tier});const started=performance.now();try{if(name==='load'){await t.recordObject('runtime-config',crypto.randomUUID(),host.tierConfig());await checkpoints(true);}const result=await original(...args);if(name==='load')await checkpoints();await record(name+'-complete',{durationMs:Math.round(performance.now()-started)});return result;}catch(e){await record(name+'-failed',{code:e.code||e.name,phase:e.phase,reason:e.reason});throw e;}};
 }
 await refreshContentPolicy();
 const getProvider=host.provider.bind(host),capturedProviders=new WeakSet();
 host.provider=(...args)=>{const provider=getProvider(...args);if(!capturedProviders.has(provider)){captureProvider(provider,t);provider.onProviderEvent(event=>{if(event.type==='native-device-error'){record('native-device-error',{errorName:event.error?.name,code:'webgpu-uncaptured',phase:'native-worker'});t.recordObject('native-error',crypto.randomUUID(),event.error);}});capturedProviders.add(provider);}return provider;};
 host.subscribe(()=>{try{host.provider();}catch{}});
 const remote=new RemoteControl({telemetry:t,buildId:window.APP_BUILD.commit,execute:(action,args)=>window.__plcDebugControl(action,args),onStatus:text=>{$('debugRemoteStatus').textContent=text;}});remote.start();
 window.__plcRemoteControl=remote;
 setTimeout(()=>captureSnapshot(),500);
 const original=window.localModels.generate.bind(window.localModels);
 window.localModels.generate=async(messages,options={})=>{
  applySettings();await refreshContentPolicy();await captureSnapshot();generating=true;const started=performance.now();await record('generation-start',{model:host.getState().load.info?.modelId,online:navigator.onLine});let chunks=0,last=0;
  try{const result=await original(messages,{...options,onToken:text=>{chunks++;options.onToken?.(text);if(chunks===1||Date.now()-last>250){last=Date.now();record(chunks===1?'first-token':'generation-progress',{chunks,characters:text.length,durationMs:Math.round(performance.now()-started)});}}});await record('generation-complete',{durationMs:Math.round(performance.now()-started),characters:result.length,chunks});return result;}
  catch(e){await record(e.name==='AbortError'?'generation-cancelled':'generation-failed',{code:e.code||e.name,phase:e.phase,reason:e.reason,durationMs:Math.round(performance.now()-started)});throw e;}
  finally{generating=false;sample();}
 };
 window.__plcDiagnosticsStarted?.();
 setInterval(async()=>{
  if(!t.config.enabled)return;if(Date.now()-lastPolicyAt>=5000)void refreshContentPolicy();const s=host.getState(),now=Date.now(),active=Boolean(s.busy)||generating;
  if(now-lastHeartbeat>=(active?250:1000)){lastHeartbeat=now;await record('heartbeat',{host:s.host.state,load:s.load.state,busy:s.busy,phase:generating?'generate':s.busy,online:navigator.onLine,visibility:document.visibilityState,memory:performance.memory?{jsHeapUsed:performance.memory.usedJSHeapSize,jsHeapTotal:performance.memory.totalJSHeapSize}:undefined});}
  if(now-lastSample>=(active?250:1000)){lastSample=now;sample();}
  t.flush();update();
 },250);
 await update();if(t.config.enabled){t.flush();sample();}
 // A tester on a phone can open /?diag=<session id> instead of typing the receiver URL. Only a session id is accepted (a UUID), and it always means this site's own
 // receiver, so a crafted link cannot point the stream anywhere else. Metadata only: content capture and remote control stay off unless the tester ticks them.
 const diag=new URLSearchParams(location.search).get('diag');
 if(diag&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(diag)){
  const receiver=location.origin+'/api/debug/'+diag;
  $('debugReceiver').value=receiver;$('debugReceiver').dispatchEvent(new Event('input',{bubbles:true}));
  history.replaceState(null,'',location.pathname+location.hash);
 }
}
