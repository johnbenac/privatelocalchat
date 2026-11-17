import {encodeObject} from './conversation-capture.mjs';
const SETTINGS='plc.dev.telemetry.v1';
const LIMIT=2000;
const allowed=new Set(['model','tier','host','load','busy','phase','state','code','reason','durationMs','characters','chunks','online','visibility','memory','deviceMemoryGB','shaderF16','files','filesDone','filesTotal','bytesDone','bytesTotal','outcome','previousPhase','pageRestart','version','commit','browser','received','saved','lost','quota','usage','loadAttempt','source','line','column','errorName','pending','retryInMs','remembered','nativeBuildId','runtimeVariant','runtimeSha256','callKind','speaking','speechPending','heardChars','captionChars','turn','resultCount','sentenceChars','sinceStartMs']);
function numbers(value,depth=0){if(depth>5)return null;if(typeof value==='number')return Number.isFinite(value)?value:null;if(!value||typeof value!=='object')return undefined;const result={};for(const [k,v]of Object.entries(value)){const n=numbers(v,depth+1);if(n!==undefined)result[k.slice(0,80)]=n;}return result;}
export function safeData(data={}){
 const result={};for(const [key,value]of Object.entries(data)){
  if(key==='nativeLines'&&Array.isArray(value)){result.nativeLines=value.filter(line=>typeof line==='string'&&!/prompt|messages|authorization|api.key|content|token.text/i.test(line)).slice(-6).map(line=>line.slice(0,180));continue;}
  if(!allowed.has(key))continue;
  if(key==='memory'){result.memory=numbers(value);continue;}
  if(typeof value==='number'||typeof value==='boolean'||value===null)result[key]=value;
  else if(typeof value==='string')result[key]=value.slice(0,180);
 }return result;
}
function openDB({factory=globalThis.indexedDB,timeoutMs=2500}={}){
 return new Promise((resolve,reject)=>{
  let settled=false;const timer=setTimeout(()=>finish(new Error('Diagnostic database open timed out')),timeoutMs);
  const finish=(error,db)=>{if(settled){db?.close();return;}settled=true;clearTimeout(timer);error?reject(error):resolve(db);};
  let req;try{req=factory.open('plc-dev-telemetry');}catch(e){finish(e);return;}
  req.onupgradeneeded=()=>{if(settled){req.transaction.abort();return;}const s=req.result.createObjectStore('events',{keyPath:'id'});s.createIndex('at','at');s.createIndex('retention',['retention','at']);};
  req.onsuccess=()=>finish(null,req.result);req.onerror=()=>finish(req.error);req.onblocked=()=>finish(new Error('Diagnostic database is blocked by another page'));
 });
}
export class DiskJournal{
 constructor({limit=LIMIT,factory=globalThis.indexedDB,timeoutMs=2500,retryMs=30000}={}){Object.assign(this,{limit,factory,timeoutMs,retryMs});this.unavailableUntil=0;}
 async transaction(mode,fn){
  if(Date.now()<this.unavailableUntil)throw new Error('Diagnostic storage is waiting to recover');
  let db;
  try{db=await openDB(this);return await new Promise((resolve,reject)=>{
   const tx=db.transaction('events',mode),store=tx.objectStore('events');let value,settled=false;
   const timer=setTimeout(()=>{try{tx.abort();}catch{}finish(new Error('Diagnostic storage transaction timed out'));},this.timeoutMs);
   const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(value);};
   tx.oncomplete=()=>finish();tx.onerror=()=>finish(tx.error);tx.onabort=()=>finish(tx.error||new Error('Diagnostic storage aborted'));
   try{fn(store,v=>{value=v;});}catch(e){try{tx.abort();}catch{}finish(e);}
  });}catch(e){this.unavailableUntil=Date.now()+this.retryMs;throw e;}finally{db?.close();}
 }
 async add(event){return this.transaction('readwrite',(store,set)=>{
  store.put({...event,retention:event.type==='conversation-object'?1:0});const count=store.count();
  count.onsuccess=()=>{let extra=count.result-this.limit,contentLost=0;if(extra<=0){set({contentLost});return;}
   if(store.indexNames.contains('retention')){const cursor=store.index('retention').openCursor();cursor.onsuccess=()=>{const c=cursor.result;if(c&&extra-->0){if(c.value.type==='conversation-object')contentLost++;c.delete();if(extra>0)c.continue();else set({contentLost});}else set({contentLost});};}
   else{const all=store.getAll();all.onsuccess=()=>{const sorted=all.result.sort((a,b)=>(a.type==='conversation-object')-(b.type==='conversation-object')||a.at.localeCompare(b.at));for(const old of sorted.slice(0,extra)){if(old.type==='conversation-object')contentLost++;store.delete(old.id);}set({contentLost});};}
  };
 });}
 async list(limit=100,{includeContent=true}={}){return this.transaction('readonly',(store,set)=>{
  const indexed=!includeContent&&store.indexNames.contains('retention');const r=indexed?store.index('retention').getAll(IDBKeyRange.bound([0,''],[0,'\uffff']),limit):store.index('at').getAll(null,includeContent?limit:this.limit);
  r.onsuccess=()=>set(r.result.filter(e=>includeContent||e.type!=='conversation-object').slice(0,limit));
 });}
 async remove(ids){return this.transaction('readwrite',store=>ids.forEach(id=>store.delete(id)));}
 async clear(){return this.transaction('readwrite',store=>store.clear());}
 async count(){return this.transaction('readonly',(store,set)=>{const r=store.count();r.onsuccess=()=>set(r.result);});}
}
export class Telemetry{
 constructor({store=new DiskJournal(),settings=globalThis.localStorage,fetchImpl=(...args)=>fetch(...args),now=()=>Date.now(),onStatus=()=>{}}={}){
  this.store=store;this.settings=settings;this.fetch=fetchImpl;this.now=now;this.onStatus=onStatus;this.memory=[];this.sending=false;this.page=crypto.randomUUID();this.objectSequence=0;this.config={enabled:false,disk:false,url:'',captureContent:false,contentConsent:null,contentDropped:0,remoteControl:false,controlConsent:null};
  try{Object.assign(this.config,JSON.parse(settings?.getItem(SETTINGS)||'{}'));}catch{}
  this.config.enabled=Boolean(this.config.url);
 }
 configure(config){const next={...this.config,...config},urlChanged=next.url!==this.config.url;if(urlChanged){if(this.config.contentConsent==='receiver'){next.captureContent=false;next.contentConsent=null;}if(this.config.controlConsent==='receiver'){next.remoteControl=false;next.controlConsent=null;}}if(next.url){const u=new URL(next.url);if(u.protocol!=='https:')throw new Error('The diagnostic receiver must use HTTPS.');}next.enabled=Boolean(next.url);const contentStopped=this.config.captureContent&&!next.captureContent;this.config=next;if(urlChanged||!next.enabled||contentStopped)this.controller?.abort();try{this.settings?.setItem(SETTINGS,JSON.stringify(next));}catch{this.onStatus('Settings could not be saved on this device.');}}
 async refreshPolicy(){
  if(!this.config.enabled||(this.config.contentConsent==='local'&&!this.config.captureContent))return;
  const url=this.config.url,controller=new AbortController(),timer=setTimeout(()=>controller.abort(),3000);
  try{const r=await this.fetch(url,{method:'GET',credentials:'omit',signal:controller.signal});if(!r.ok)return;const p=await r.json();if(this.config.url!==url||p.format!=='plc-dev-policy/1')return;if(this.config.contentConsent!=='local'&&(p.captureContent===true||this.config.contentConsent==='receiver'))this.configure({captureContent:p.captureContent===true,contentConsent:'receiver'});if(this.config.controlConsent!=='local'&&(p.remoteControl===true||this.config.controlConsent==='receiver'))this.configure({remoteControl:p.remoteControl===true&&this.config.captureContent,controlConsent:'receiver'});}catch{}finally{clearTimeout(timer);}
 }
 event(type,data){return {id:crypto.randomUUID(),page:this.page,at:new Date(this.now()).toISOString(),elapsedMs:Math.round(performance.now()),type,data};}
 async enqueue(event){
  let lost=0;
  if(this.config.disk){try{lost=(await this.store.add(event))?.contentLost||0;}catch{this.memory.push(event);this.onStatus('Local diagnostic storage is unavailable; unsaved events remain in memory.');}}
  else this.memory.push(event);
  while(this.memory.length>300){let i=this.memory.findIndex(e=>e.type!=='conversation-object'&&e.type!=='capture-loss');if(i<0)i=0;if(this.memory.splice(i,1)[0].type==='conversation-object')lost++;}
  if(lost){this.configure({contentDropped:(this.config.contentDropped||0)+lost});this.memory=this.memory.filter(e=>e.type!=='capture-loss');this.memory.push(this.event('capture-loss',{lost:this.config.contentDropped}));this.onStatus('Conversation diagnostic frames were dropped: '+this.config.contentDropped+'. The saved stream contains gaps.');}
  queueMicrotask(()=>this.flush());
 }
 async recordObject(kind,requestId,object){
  if(!this.config.enabled||!this.config.captureContent)return;
  try{const frames=await encodeObject(kind,requestId,object,this.objectSequence++);for(const frame of frames){if(!this.config.enabled||!this.config.captureContent)return;const event=this.event('conversation-object',frame);if(new TextEncoder().encode(JSON.stringify(event)).length>2048)throw new Error('Conversation frame exceeds event limit');await this.enqueue(event);}return {payloadId:frames[0].payloadId,parts:frames.length,bytes:frames[0].bytes,sha256:frames[0].sha256};}
  catch(e){await this.record('capture-error',{code:e.code||e.name,state:'conversation-object-not-saved'});}
 }
 async record(type,data={}){
  if(!this.config.enabled)return;
  const event={id:crypto.randomUUID(),page:this.page,at:new Date(this.now()).toISOString(),elapsedMs:Math.round(performance.now()),type:String(type).slice(0,64),data:safeData(data)};
  if(new TextEncoder().encode(JSON.stringify(event)).length>2048)event.data={state:'event-metadata-too-large'};
  await this.enqueue(event);
 }
 async flush({force=false}={}){
  if(this.sending){if(force)this.forcePending=true;return;}
  if((!this.config.enabled&&!force)||!this.config.url||globalThis.navigator?.onLine===false)return;
  this.sending=true;
  try{
   for(;;){
    const disk=await this.store.list(50,{includeContent:this.config.captureContent}).catch(()=>[]);const events=[...disk,...this.memory].filter(e=>this.config.captureContent||e.type!=='conversation-object').slice(0,50);if(!events.length)break;
    const id=events[0].id+'_'+events.at(-1).id;
    const controller=this.controller=new AbortController();const timer=setTimeout(()=>controller.abort(),10000);
    let response;try{response=await this.fetch(this.config.url,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'omit',body:JSON.stringify({format:'plc-dev-telemetry/1',id,events}),signal:controller.signal});}finally{clearTimeout(timer);}
    if(!response.ok)throw new Error('Receiver HTTP '+response.status);
    const ack=await response.json();if(ack.accepted!==events.length)throw new Error('Receiver did not acknowledge the complete batch');
    const ids=new Set(events.map(e=>e.id));await this.store.remove([...ids]).catch(()=>{});this.memory=this.memory.filter(e=>!ids.has(e.id));this.onStatus('Uploaded '+events.length+' diagnostic events.');
    if(!this.config.url||(!this.config.enabled&&!force))break;
   }
  }catch(error){this.onStatus('Upload pending: '+error.message+'. Saved events will be retried when online.');}
  finally{this.sending=false;if(this.forcePending){this.forcePending=false;queueMicrotask(()=>this.flush({force:true}));}}
 }
 async count(){return (await this.store.count().catch(()=>0))+this.memory.length;}
 async export(){return {format:'plc-dev-telemetry/1',events:[...await this.store.list(LIMIT).catch(()=>[]),...this.memory]};}
 async clear(){await this.store.clear();this.memory=[];}
}
