import {createDownloadRecovery} from './runtime/download-recovery.mjs';
import {shouldAutoLoad} from './runtime/auto-load.mjs';
import {explainGpu} from './runtime/gpu-help.mjs';
import {createPreparer} from './runtime/prepare.mjs';
import {cpuBackendSupport,gpuRunsLight} from './runtime/auto-tier.mjs';
import {createOfflineStatusProbe} from './runtime/offline-status.mjs';
import {createModelHost} from './runtime/providers/model-host.mjs';
import {gatherEnv} from './runtime/providers/capability-probe.mjs';
import {bootVault,appLocal,appSession} from './chat/vault/vault-store.mjs';

// If the person has an encrypted vault, nothing below may read a saved setting until it is unlocked (the page's own script waits for the same answer).
await bootVault();

const $ = id => document.getElementById(id);
const base = 'https://assets.privatelocal.chat/models/';
const variants = {q4f16_1:'c7c5d3f5a81e37b8facbb72970940a1b131314a8',q4f32_1:'f8f042bfb68cb88573af4c8e0ef9b1a26bef4ad0'};
const webllm = Object.fromEntries(Object.entries(variants).map(([v,r]) => [v,base+'Qwen3.5-9B-'+v+'-MLC/resolve/'+r+'/']));
const host = createModelHost({sources:{webllmModelBase:webllm,webllmLibBase:webllm,wllamaModelBase:base+'Qwen3.5-2B/15852e8c16360a2fea060d615a32b45270f8a8fc/'}});
/* DEV_DIAGNOSTICS_START */
window.__plcDebugModelHost=host;
let diagnosticsStarted;
const diagnosticsReady=new Promise(resolve=>{diagnosticsStarted=resolve;});
window.__plcDiagnosticsStarted=diagnosticsStarted;
/* DEV_DIAGNOSTICS_END */
let state, env, downloadRecovery, preparer, activeGeneration = false;
let initDone;const initFinished=new Promise(resolve=>{initDone=resolve;});
let resetPromptAfterAbort=false;
const modeKey = 'plc.inferenceMode.v1';
let updatePending = false, quality = null, qualityAvailable = true, offlineAppReady = false, autoLoadTried = false, userFreed = false;
// What the service worker last reported about the saved copy of the app (the offline checklist reads it through window.localModels.offlineApp).
let checkOffline = null; // set when the service worker is available
let offlineApp = { checked: false, supported: 'serviceWorker' in navigator, controlled: false, current: false, bulkSaved: 0, bulkExpected: 0 };
let existingApi = false;
try {existingApi = Boolean(JSON.parse(appSession.getItem('chatConfig') || '{}').endpoint);} catch {}
let mode = existingApi ? 'api' : 'local';
try {mode=appLocal.getItem(modeKey)||mode;} catch(e) {console.warn('Mode storage unavailable:',e.name);}
if (!['local','api'].includes(mode)) mode = 'local';
const gb = n => (n/1e9).toFixed(2)+' GB';
// What the page's own UI (Settings > Models, the pickers) shows is kept here, not in page elements: window.localModels.view.
const V={status:'',statusError:false,details:'',progress:null,gpuHelp:null,readiness:{downloaded:false,loaded:false,offline:false},setupStep:'',setupHint:'',diagnostics:'',
  can:{download:false,load:false,cancel:false,free:false,repair:false,restart:false,remove:false,reload:false}};
// A control that cannot be used right now is not offered.
const CAN={downloadModel:'download',loadModel:'load',repairModel:'repair',restartModel:'restart',removeModel:'remove',freeMemory:'free'};
const show = (id,on) => {V.can[CAN[id]]=Boolean(on);};
const notify = () => window.dispatchEvent(new Event('local-model-state'));
function showError(error) {
  V.status = (error?.message || String(error)) + (error?.advice ? ' '+error.advice : ' Try Verify / repair or reload the model.');
  V.statusError = true;
  notify();
}
function render(s) {
  state = s;
  if(s.device) env=s.device;
  const tier=s.selection.tier, item=s.tiers[tier], t=s.transfer;
  V.details=gb(item.info.downloadBytes)+' download · '+gb(item.info.memory.steadyBytes)+' estimated working memory. '+(tier==='default'?'Requires a capable GPU; larger memory use.':onCpu(s)?'Smaller model. No usable graphics card was found, so it runs on your processor: it works, but replies are slower.':(tier==='light'?'Smaller model; lower memory use.':item.info.strengths));
  V.statusError=false;
  const modelName='the chat model '+(item.info.modelId||'');
  if(s.busy==='inspect') V.status='Checking the saved files…';
  else if(s.busy) V.status=(t&&(s.busy==='install'||s.busy==='repair')) ? `Downloading ${modelName}: ${gb(t.bytesDone || 0)} of ${gb(t.bytesTotal || item.info.downloadBytes)} downloaded${t.bytesKept ? ' · '+gb(t.bytesKept)+' already saved' : ''}` : s.busy==='load'?`Loading ${modelName} into memory…`:s.busy==='install'?`Downloading ${modelName}…`:s.busy==='repair'?'Repairing the model download…':s.busy==='remove'?'Removing model files…':s.busy+'…';
  else if(s.lastError) showError(s.lastError);
  else if(s.load.state==='ready') V.status='Loaded \u00B7 ready on this device';
  else V.status=item.install.ok?'Downloaded \u00B7 not loaded':'Download a model to use on-device chat.';
  if(s.busy&&t?.phase==='retry-wait') V.status+=` · Retrying download ${t.retryAttempt}/${t.retryLimit} in ${t.retryDelayMs/1000}s. Saved files are kept.`;
  const ready=s.load.state==='ready';
  const supported=isSupported(s);
  renderGpuHelp(s,supported);
  V.progress=t?(t.bytesDone || 0)/Math.max(1,t.bytesTotal || 1):null;
  const recovery=downloadRecovery?.state, idle=!s.busy&&!activeGeneration&&!recovery?.pending;
  show('downloadModel',supported&&idle&&item.install.ok!==true);
  show('loadModel',supported&&idle&&item.install.ok===true&&!ready);
  show('repairModel',idle);
  show('restartModel',idle);
  show('removeModel',idle&&(item.install.ok===true||(item.install.bytesPresent||0)>0));
  $('reloadApp').hidden=!(updatePending&&idle);V.can.reload=updatePending&&idle;
  V.can.cancel=['install','repair'].includes(s.busy)||Boolean(recovery?.pending);
  if(recovery?.pending&&!s.busy)V.status+=(recovery.phase==='offline'?' · Download will continue when connected.':' · Download will continue automatically; completed files are kept.');
  // Lost the connection while a download is wanted: say it is waiting (not "Failed to fetch"), as soon as the app knows (the connection layer, not only the stall timeout).
  const waitingForConnection=recovery?.pending&&(recovery.phase==='offline'||(['install','repair'].includes(s.busy)&&window.plcApp?.offline?.connection?.state==='offline'));
  if(waitingForConnection){V.statusError=false;V.status='Waiting for a connection. The download carries on by itself, and what is saved is kept'+(t?.bytesDone?' ('+gb(t.bytesDone)+' of '+gb(t.bytesTotal||item.info.downloadBytes)+' so far)':'')+'.';}
  if(recovery?.pending&&String(recovery.reason||'').startsWith('repeated:'))V.status+=` · The download keeps failing (${recovery.reason.slice(10)}). The browser may have no room left to save files for this site: free some space, close other tabs, or choose a smaller model. Saved files are kept and it keeps trying.`;
  if(recovery?.pending&&!recovery.remembered)V.status+=' Keep this page open: the browser could not save the download request yet.';
  qualityAvailable=!(!env?.webgpu.available || (env.deviceMemoryGB !== null && env.deviceMemoryGB < 8) || /iPhone|iPad|iPod|Android/.test(navigator.userAgent));
  V.diagnostics=JSON.stringify({device:env,selection:s.selection,variant:s.variant,storage:s.storage,host:s.host,load:s.load,lastError:s.lastError},null,2);
  renderReadiness(s,supported,ready);
  notify();
}
// Say what is actually wrong with the graphics support, and what to try, instead of one blanket message.
function renderGpuHelp(s,supported) {
  const g=env?explainGpu(env,{tier:s.selection.tier}):null;
  const blocked=Boolean(env&&!supported&&!s.busy&&g&&g.kind!=='ok');
  // with no usable card the model still runs, on the processor: the same help is offered as a way to make it faster
  const slower=Boolean(env&&supported&&onCpu(s)&&!s.busy&&g&&g.kind!=='ok');
  V.gpuHelp=(blocked||slower)?{lead:(slower?'Chat runs on your processor, which is slower. A graphics card would make replies much faster. ':'')+g.headline+(g.detail?' '+g.detail:''),steps:[...g.steps]}:null;
  if(blocked){V.status=g.headline;V.statusError=true;}
}
// Downloaded, loaded and ready-for-offline are different facts; one button always does the next useful step.
function renderReadiness(s,supported,ready) {
  const tier=s.selection.tier, item=s.tiers[tier], downloaded=item.install.ok===true;
  V.readiness={downloaded,loaded:ready,offline:downloaded&&offlineAppReady};
  const step=!downloaded?'download':!ready?'load':'ready', recovery=downloadRecovery?.state;
  V.setupStep=step;
  V.setupHint=step==='download'?'Downloads '+gb(item.info.downloadBytes)+' once. After that, chatting needs no connection.'
    :step==='load'?'Loads the downloaded model into memory (about '+gb(item.info.memory.steadyBytes)+') so it can answer.'
    :downloaded&&offlineAppReady?'Everything needed is saved on this device. You can use it without a connection.':'The model is saved. Reload the app once while online so the app itself is saved for offline use too.';
  show('freeMemory',ready&&!s.busy&&!activeGeneration);
}
// The wllama models run on the graphics card, or on the processor when there is no usable card (slower); the tiny ones can on iPhone and iPad too. The WebLLM model needs the card.
const cpuOk=(tier)=>Boolean(env)&&cpuBackendSupport({env,userAgent:navigator.userAgent,maxTouchPoints:navigator.maxTouchPoints||0,tier}).ok;
const isWllama=t=>t==='light'||t==='lfm'||t==='granite'||t==='mini'||t==='nano';
const isSupported=s=>{const tier=s.selection.tier;return isWllama(tier)?gpuRunsLight(env)||cpuOk(tier):!!env?.webgpu.available;};
const onCpu=s=>isWllama(s.selection.tier)&&!gpuRunsLight(env)&&cpuOk(s.selection.tier);
// The model memory manager (runtime/memory-manager.mjs) is created by the page; with "One model at a time" on, using the chat model first unloads the others.
const memoryLease=async(options)=>{try{const m=await window.plcMemoryReady?.();if(m)return await m.acquire('chat-llm',options);}catch{/* the manager is optional */}return {release(){}};};
// A downloaded model loads by itself when the app opens (or when on-device chat is chosen), so chatting just works.
function maybeAutoLoad() {
  if(!state)return;
  const s=host.getState(), item=s.tiers[s.selection.tier];
  if(!shouldAutoLoad({mode,alreadyTried:autoLoadTried,userFreed:userFreed||window.plcOneAtATime===true,supported:isSupported(s),busy:s.busy,generating:activeGeneration,installed:item.install.ok,loadState:s.load.state,downloadPending:Boolean(downloadRecovery?.state?.pending)}))return;
  autoLoadTried=true;
  action(()=>host.load());
}
function applyMode() {
  $('apiSettings').hidden=mode!=='api';
  try {appLocal.setItem(modeKey,mode);} catch(e) {showError(new Error('The browser cannot save settings: '+e.name));}
  if(mode==='local')autoLoadTried=false;
  notify();
  maybeAutoLoad();
}
async function action(fn) {try {await fn();} catch(e) {showError(e);} }
downloadRecovery=createDownloadRecovery({host,
/* DEV_DIAGNOSTICS_START */
 beforeLoad:()=>new Promise(resolve=>{const timeout=setTimeout(resolve,5000);diagnosticsReady.then(()=>{clearTimeout(timeout);resolve();});}),
/* DEV_DIAGNOSTICS_END */
 onState:detail=>{if(state)render(host.getState());
/* DEV_DIAGNOSTICS_START */
 window.dispatchEvent(new CustomEvent('download-recovery',{detail}));
/* DEV_DIAGNOSTICS_END */
 }});
/* DEV_DIAGNOSTICS_START */
window.__plcDebugDownloadControl = action => {
  if (action === 'cancel-download') {
    const cancelled = downloadRecovery.state.pending;
    if (cancelled) downloadRecovery.cancel();
    return {cancelled,recovery:downloadRecovery.state};
  }
  if (action !== 'download' || mode !== 'local' || activeGeneration) throw new Error('Model downloading is unavailable now');
  const current = host.getState();
  if (current.tiers[current.selection.tier].install.ok) return {requested:false,installed:true,recovery:downloadRecovery.state};
  if (current.busy && !downloadRecovery.state.pending) throw new Error('A model operation is already running');
  downloadRecovery.start(current.selection.tier);
  return {requested:true,installed:false,recovery:downloadRecovery.state};
};
/* DEV_DIAGNOSTICS_END */
// Sending a message is enough: choose a model for this device, download it, load it, then answer (see runtime/prepare.mjs).
preparer=createPreparer({host,recovery:downloadRecovery,getEnv:()=>env,subscribe:fn=>{window.addEventListener('local-model-state',fn);return()=>window.removeEventListener('local-model-state',fn);},userAgent:()=>navigator.userAgent,maxTouchPoints:()=>navigator.maxTouchPoints||0});
window.addEventListener('online',()=>downloadRecovery.wake());
window.addEventListener('connection-changed',()=>{if(state)render(host.getState());}); // the connection layer (chat/connection/) says offline or back
window.addEventListener('pageshow',()=>downloadRecovery.synchronize());
window.addEventListener('storage',event=>{if(event.key==='plc.downloadIntent.v1')downloadRecovery.synchronize();});
// What a reload would interrupt, for the "new version ready" notice in index.html (docs/UPGRADE-BEHAVIOUR.md): it asks before reloading, and keeps an unsent message across the reload.
window.plcUpdateGuard={
  reason(){
    const out=[],input=document.querySelector('#messageInput');
    if(activeGeneration||document.querySelector('#stopGeneration')?.offsetParent)out.push('a reply being written');
    if(downloadRecovery?.state.pending||state?.busy)out.push('a model download or load');
    if(window.plcApp?.voiceBusy?.())out.push('a recording or voice call');
    if(input&&input.value.trim())out.push('a message you have not sent');
    return out;
  },
  prepare(){const input=document.querySelector('#messageInput');try{if(input&&input.value)appSession.setItem('plc.draft',input.value);}catch{/* the reload still works */}}
};
window.localModels={
  get downloadRecovery(){return downloadRecovery.state;},
  get mode(){return mode;},
  get ready(){return state?.load.state==='ready';},
  get installed(){return state?.tiers[state.selection.tier].install.ok===true;},
  get state(){return state;},
  get offlineReady(){return offlineAppReady;},
  /** What the service worker reported about the saved app and the model runtime files (see runtime/offline-readiness.mjs). Fires 'offline-status' on the window when it changes. */
  get offlineApp(){return {...offlineApp};},
  /** Ask the service worker to save the model runtime files that are still missing; resolves with what is saved afterwards. */
  saveRuntime(){return new Promise(resolve=>{const worker=navigator.serviceWorker?.controller;if(!worker){resolve(null);return;}const channel=new MessageChannel();const timer=setTimeout(()=>resolve(null),600000);channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();checkOffline?.();resolve(event.data);};worker.postMessage({type:'save-runtime'},[channel.port2]);});},
  get supported(){return state?isSupported(state):undefined;},
  /** Where on-device chat runs: 'gpu' (graphics card) or 'cpu' (processor, slower). */
  get backend(){return state&&isWllama(state.selection.tier)&&onCpu(state)?'cpu':'gpu';},
  get canPrepare(){return env&&state?Boolean(preparer.choice().tier):undefined;},
  prepareInfo(){return preparer.info();},
  async ensureReady(options){await initFinished;userFreed=false;const lease=await memoryLease({signal:options?.signal});try{return await preparer.ensureReady(options);}finally{lease.release();}},
  async switchTier(tier){await initFinished;return preparer.switchTier(tier);},
  cancelDownload(){downloadRecovery.cancel();},
  get gpuHelp(){return env&&state?explainGpu(env,{tier:state.selection.tier}):null;},
  /** For the memory manager: is the chat model working right now, and unload it without the "person freed it" flag, so it loads again when it is next used. */
  get generating(){return activeGeneration;},
  get busy(){return activeGeneration||Boolean(state?.busy);},
  async unloadForMemory(){if(activeGeneration)throw new Error('The chat model is writing a reply.');await host.unload();await host.inspect();},
  // ---- the model actions the page's own UI uses (Settings > Models); the legacy buttons call the same functions ----
  get view(){return {...V,readiness:{...V.readiness},can:{...V.can},gpuHelp:V.gpuHelp?{...V.gpuHelp,steps:[...V.gpuHelp.steps]}:null};},
  get selectedTier(){return state?.selection.tier;},
  get qualityAvailable(){return qualityAvailable;},
  setMode(m){if(!['local','api'].includes(m)||m===mode)return;mode=m;applyMode();},
  selectTier(tier){return action(()=>host.selectTier(tier,{confirmed:true}));},
  download(){return action(()=>downloadRecovery.start(host.getState().selection.tier));},
  load(){return action(async()=>{const lease=await memoryLease();try{return await host.load();}finally{lease.release();}});},
  restartEngine(){return action(async()=>{await host.restartHost();await host.inspect();});},
  repair(){downloadRecovery.cancel();return action(()=>host.repair());},
  removeSelected(){downloadRecovery.cancel();return action(()=>host.remove(undefined,{confirmed:true}));},
  persist(){return action(()=>host.requestPersist());},
  async copyDetails(){const text=V.diagnostics;try{await navigator.clipboard.writeText(text);return true;}catch{window.plcDialogs?.copyText('Copy your device details',text);return false;}},
  reloadApp(){$('reloadApp').click();},
  async freeMemory(){if(activeGeneration)throw new Error('Wait for the reply to finish, or press Stop.');userFreed=true;await host.unload();await host.inspect();},
  /** Check the downloaded files of every model (storage screen, so each can be removed). Tiers are checked one after another. */
  async inspectAll(){await initFinished;for(const tier of Object.keys(host.getState().tiers)){try{await host.inspect(tier);}catch{/* recorded in the state */}}return host.getState();},
  /** Delete one model's downloaded files (the person confirmed in the page). Unloads it first when it is the loaded one. */
  async removeTier(tier){await initFinished;downloadRecovery.cancel();for(let i=0;i<1200&&host.getState().busy;i++)await new Promise(r=>setTimeout(r,100));/* the engine refuses to delete files while any model is in memory, so memory is freed first (the next message loads it again) */if(host.getState().load.state!=='unloaded'){userFreed=true;await host.unload();}await host.remove(tier,{confirmed:true});return host.getState();},
  async refreshStorage(){await host.refreshStorage();return state?.storage;},
  async requestPersist(){return host.requestPersist();},
  async generate(messages,{signal,onToken,onFinish}={}) {
    if(mode!=='local'||state?.load.state!=='ready') throw new Error('Load an on-device model before sending.');
    activeGeneration=true; render(state);
    try {
      let streamed="";
      const call=host.provider().generate({attemptId:crypto.randomUUID(),messages:messages.filter(m=>m.role!=='system'||m.content).map(m=>({role:m.role,content:m.content})),temperature:0.6,sampling:state.tiers[state.selection.tier].info.sampling,cachePrompt:!resetPromptAfterAbort},{signal,onToken:ev=>{streamed+=ev.text;onToken?.(streamed);}});
      resetPromptAfterAbort=false;
      const end=await call.done;
      if(end.type==='attempt-aborted') throw Object.assign(new DOMException('Generation stopped.','AbortError'),{partialText:streamed});
      if(end.type!=='attempt-completed') throw Object.assign(new Error(end.error?.message || 'Model generation failed.'),end.error,{partialText:streamed});
      onFinish?.({finishReason:end.finishReason});
      return end.text;
    } catch(e) {if(e.name==='AbortError')resetPromptAfterAbort=true;throw e;} finally {activeGeneration=false;render(host.getState());}
  }
};
$('reloadApp').addEventListener('click',()=>{try {appSession.setItem('plc.draft',document.querySelector('#messageInput').value);location.reload();}catch(e){showError(new Error('Copy your message draft before reloading; browser storage is unavailable.'));}});
try {const draft=appSession.getItem('plc.draft');if(draft){document.querySelector('#messageInput').value=draft;appSession.removeItem('plc.draft');}} catch {}
$('releaseInfo').textContent=`${window.APP_BUILD?.environment || 'local'} · ${window.APP_BUILD?.version || 'development'} · ${window.APP_BUILD?.commit?.slice(0,12) || 'unbuilt'}`;
applyMode();
if('serviceWorker' in navigator) {
  checkOffline=createOfflineStatusProbe({
    getController:()=>navigator.serviceWorker.controller,
    expectedCache:'plc-shell-'+window.APP_BUILD.commit,
    onResult:(current,details)=>{
      offlineApp={checked:true,supported:true,controlled:Boolean(navigator.serviceWorker.controller),current:Boolean(current),bulkSaved:details?.bulkSaved||0,bulkExpected:details?.bulkExpected||0};window.dispatchEvent(new Event('offline-status'));
      offlineAppReady=Boolean(current);if(state)renderReadiness(state,isSupported(state),state.load.state==='ready');
      $('offlineStatus').textContent=current?'Offline app ready. Downloaded models can be loaded without a connection.':'An updated app is ready. Reload while online before the offline test.';
      updatePending=!current;$('reloadApp').hidden=!updatePending;
    }
  });
  navigator.serviceWorker.addEventListener('controllerchange',checkOffline);
  navigator.serviceWorker.register('/sw.js').then(registration=>{
    const activate = worker=>worker?.postMessage({type:'activate-update'});
    activate(registration.waiting);
    registration.addEventListener('updatefound',()=>{const worker=registration.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed')activate(worker);});});
    checkOffline();
  }).catch(e=>{offlineApp={checked:true,supported:false,controlled:false,current:false,bulkSaved:0,bulkExpected:0,reason:String(e&&e.message||e).slice(0,160)};window.dispatchEvent(new Event('offline-status'));$('offlineStatus').textContent='This browser window cannot keep the app for offline use ('+offlineApp.reason+').';showError(new Error('Offline app setup failed: '+e.message));});
} else {offlineApp={checked:true,supported:false,controlled:false,current:false,bulkSaved:0,bulkExpected:0,reason:'no service worker'};window.dispatchEvent(new Event('offline-status'));$('offlineStatus').textContent='This browser window cannot keep the app for offline use (no service worker).';}
try {
  env=await gatherEnv();
  host.subscribe(render);
  await host.init({autoLoad:false});
  maybeAutoLoad();
} catch(e){showError(e);} finally {downloadRecovery.resume();initDone();}