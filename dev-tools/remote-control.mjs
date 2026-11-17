const KEY='plc.dev.control.v1';
const ACTIONS=new Set(['state','new-chat','prompt','load','unload','profile','stop','download','cancel-download','use-model','remove-model','voice-state','voice-decide','voice-cycle']);
export class RemoteControl{
 constructor({telemetry,execute,buildId,settings=globalThis.localStorage,fetchImpl=(...args)=>fetch(...args),locks=globalThis.navigator?.locks,onStatus=()=>{}}){
  Object.assign(this,{telemetry,execute,buildId,settings,fetch:fetchImpl,locks,onStatus});this.pageId=telemetry.page;this.polling=false;this.active=null;this.owns=false;this.acquiring=false;this.pendingAcks=new Map();this.revoked=false;
  try{this.saved=JSON.parse(settings.getItem(KEY)||'{}');}catch{this.saved={};}
  this.installationId=this.saved.installationId||crypto.randomUUID();
 }
 enabled(){const c=this.telemetry.config;return c.enabled&&c.captureContent&&c.remoteControl;}
 persist(){for(const id of Object.keys(this.ledger).slice(0,-1000))if(this.ledger[id].acknowledged)delete this.ledger[id];this.saved={installationId:this.installationId,session:this.session,commands:this.ledger};this.settings.setItem(KEY,JSON.stringify(this.saved));}
 async request(url,options={}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);this.controller=controller;
  try{const r=await this.fetch(url,{credentials:'omit',...options,signal:controller.signal});if(!r.ok)throw Object.assign(new Error('Remote channel HTTP '+r.status),{status:r.status});return await r.json();}finally{clearTimeout(timer);if(this.controller===controller)this.controller=null;}
 }
 prepare(recover){
  const saved=JSON.parse(this.settings.getItem(KEY)||'{}');this.session=this.telemetry.config.url;this.ledger=saved.session===this.session?{...saved.commands}:{};
  for(const [id,r]of Object.entries(this.ledger))if(r.status==='claimed'&&recover){const value={...r,status:'interrupted',previousPageId:r.pageId,code:'page-replaced-before-terminal'};this.ledger[id]=value;this.pendingAcks.set(id,value);}else if(r.status!=='claimed'&&!r.acknowledged)this.pendingAcks.set(id,r);
  this.persist();this.owns=true;
 }
 acquire(){
  if(this.acquiring)return;this.acquiring=true;
  if(!this.locks?.request){try{this.prepare(false);}catch{this.onStatus('Remote ownership journal unavailable.');}this.acquiring=false;return;}
  this.locks.request('plc.remote-control.'+this.telemetry.config.url,{ifAvailable:true},async lock=>{
   if(!lock){this.onStatus('Another tab owns this remote channel.');return;}
   try{this.prepare(true);await new Promise(resolve=>{this.release=resolve;});}finally{this.owns=false;this.release=null;}
  }).catch(()=>this.onStatus('Remote ownership journal unavailable.')).finally(()=>{this.acquiring=false;});
 }
 async ack(id,value){
  if(!this.enabled()||this.session!==this.telemetry.config.url)throw new Error('Remote control revoked');
  return this.request(this.session+'/commands/'+id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...value,pageId:this.pageId,installationId:this.installationId})});
 }
 async run(command){
  const id=command.id,endpoint=this.session;if(this.ledger[id])return;
  let claimed=false;
  try{
   this.ledger[id]={status:'claimed',action:command.action,pageId:this.pageId};this.persist();
   await this.ack(id,{status:'claimed'});claimed=true;
   if(!this.enabled()||this.session!==this.telemetry.config.url)throw Error('Remote control revoked');
   if(!ACTIONS.has(command.action))throw Error('Unsupported remote command');
   if(command.expectedCommit!==this.buildId)throw Object.assign(Error('Unexpected app build'),{code:'build-mismatch'});
   if(Date.parse(command.expiresAt)<Date.now())throw Object.assign(Error('Command expired'),{code:'command-expired'});
   await this.telemetry.recordObject('remote-command',id,command);
   if(!this.enabled()||this.session!==this.telemetry.config.url)throw Error('Remote control revoked');
   if(command.action==='prompt')this.promptExecuting=true;
   this.executing=command.action;this.onStatus('Remote control: '+command.action);
   const result=await this.execute(command.action,command.args||{});this.executing=null;if(command.action==='prompt')this.promptExecuting=false;
   if(endpoint!==this.telemetry.config.url||endpoint!==this.session||!this.enabled())return;
   const payload=await this.telemetry.recordObject('remote-result',id,{commandId:id,action:command.action,ok:true,result});
   const value={status:'completed',action:command.action,payload};this.ledger[id]=value;this.persist();this.pendingAcks.set(id,value);
  }catch(error){
   this.executing=null;if(command.action==='prompt')this.promptExecuting=false;
   if(endpoint!==this.telemetry.config.url||endpoint!==this.session||!this.enabled())return;
   if(!claimed&&error.status===409){this.ledger[id]={status:'claimed-elsewhere',acknowledged:true};try{this.persist();}catch{}return;}
   const payload=await this.telemetry.recordObject('remote-result',id,{commandId:id,action:command.action,ok:false,error:{name:error.name,code:error.code,message:error.message}});
   const value={status:'failed',action:command.action,payload,code:error.code||error.name};this.ledger[id]=value;try{this.persist();}catch{}
   if(claimed)this.pendingAcks.set(id,value);this.onStatus('Remote command failed: '+(error.code||error.name));
  }
 }
 async tick(){
  if(!this.enabled()){
   this.controller?.abort();if(this.promptExecuting&&!this.revoked){this.revoked=true;await this.execute('stop',{}).catch(()=>{});}this.release?.();this.owns=false;return;
  }
  this.revoked=false;
  if(this.session&&this.session!==this.telemetry.config.url){if(this.promptExecuting)await this.execute('stop',{}).catch(()=>{});this.release?.();this.owns=false;this.saved={installationId:this.installationId};this.pendingAcks.clear();}
  if(!this.owns){this.acquire();return;}if(this.polling)return;this.polling=true;
  try{
   for(const [id,value]of this.pendingAcks){try{await this.ack(id,value);this.pendingAcks.delete(id);if(this.ledger[id])this.ledger[id].acknowledged=true;this.persist();}catch(e){if(e.status===409){this.pendingAcks.delete(id);continue;}throw e;}}
   const endpoint=this.session,url=new URL(endpoint);url.searchParams.set('commands','1');
   const data=await this.request(url.href);if(endpoint!==this.telemetry.config.url||!this.enabled())return;
   if(data.remoteControl!==true){this.telemetry.configure({remoteControl:false});this.onStatus('Receiver disabled remote control.');return;}
   const commands=(data.commands||[]).filter(c=>!this.ledger[c.id]);
   for(const c of commands.filter(c=>c.action==='stop'||c.action==='state'))await this.run(c);
   if(!this.active){const command=commands.find(c=>c.action!=='stop'&&c.action!=='state');if(command){this.active=this.run(command).finally(()=>{this.active=null;});}}
  }catch{this.onStatus('Remote channel waiting for connection.');}finally{this.polling=false;}
 }
 start(){const tick=()=>this.tick().catch(()=>this.onStatus('Remote control waiting for its ownership journal.'));this.timer=setInterval(tick,1000);tick();}
 stop(){clearInterval(this.timer);this.controller?.abort();this.release?.();}
}
