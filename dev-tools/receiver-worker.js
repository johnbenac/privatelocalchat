const HOST='dev.privatelocal.chat';
const uuid=/^[a-f0-9-]{36}$/;
const headers=origin=>({'Content-Type':'application/json','Cache-Control':'no-store',...(origin==='https://'+HOST?{'Access-Control-Allow-Origin':origin,'Vary':'Origin','Access-Control-Allow-Methods':'GET, POST, PATCH, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization'}:{})});
const json=(value,status=200,origin)=>new Response(JSON.stringify(value),{status,headers:headers(origin)});
const authorized=(request,env)=>Boolean(env.DEBUG_READ_TOKEN)&&request.headers.get('Authorization')==='Bearer '+env.DEBUG_READ_TOKEN;
const actions=new Set(['state','new-chat','prompt','load','unload','profile','stop','download','cancel-download','use-model','remove-model','voice-state','voice-decide','voice-cycle']);
const statuses=['claimed','completed','failed','interrupted'];
export default {
 async fetch(request,env){
  const url=new URL(request.url),origin=request.headers.get('Origin');
  if(url.pathname.includes('/dev-tools/')||url.pathname.includes('/runtime/providers/vendor/wllama/v1q/'))return url.hostname===HOST?env.ASSETS.fetch(request):json({error:'Not found'},404);
  if(!url.pathname.startsWith('/api/debug/'))return env.ASSETS.fetch(request);
  if(url.hostname!==HOST||!env.DEBUG_LOGS)return json({error:'Not found'},404);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:headers(origin)});
  try{
   if(url.pathname==='/api/debug/admin/sessions'&&request.method==='POST'){
    if(!authorized(request,env))return json({error:'Unauthorized'},401);
    const id=crypto.randomUUID(),createdAt=new Date().toISOString();
    await env.DEBUG_LOGS.put('control/'+id+'.json',JSON.stringify({id,createdAt}));
    return json({id,receiver:'https://'+HOST+'/api/debug/'+id,createdAt});
   }
   const admin=/^\/api\/debug\/admin\/sessions\/([a-f0-9-]+)$/.exec(url.pathname);
   if(admin&&request.method==='PATCH'){
    if(!authorized(request,env))return json({error:'Unauthorized'},401);
    const object=await env.DEBUG_LOGS.get('control/'+admin[1]+'.json');if(!object)return json({error:'Not found'},404);
    const control=await object.json(),change=await request.json();if((typeof change.captureContent!=='boolean'&&typeof change.remoteControl!=='boolean')||control.disabled)return json({error:'Invalid policy'},400);
    const next={...control,...(typeof change.captureContent==='boolean'?{captureContent:change.captureContent}:{}),...(typeof change.remoteControl==='boolean'?{remoteControl:change.remoteControl}:{})};
    await env.DEBUG_LOGS.put('control/'+admin[1]+'.json',JSON.stringify(next));
    return json({captureContent:next.captureContent===true,remoteControl:next.remoteControl===true});
   }
   const commandAdmin=/^\/api\/debug\/admin\/sessions\/([a-f0-9-]{36})\/commands(?:\/([a-f0-9-]{36}))?$/.exec(url.pathname);
   if(commandAdmin){
    if(!authorized(request,env))return json({error:'Unauthorized'},401);
    const sid=commandAdmin[1],cid=commandAdmin[2],prefix='commands/'+sid+'/';
    const controlObject=await env.DEBUG_LOGS.get('control/'+sid+'.json');const control=controlObject?await controlObject.json():null;
    if(!control||control.disabled)return json({error:'Session unavailable'},403);
    if(request.method==='GET'&&cid){
     const object=await env.DEBUG_LOGS.get(prefix+'issued/'+cid+'.json');if(!object)return json({error:'Not found'},404);
     const receipts=(await Promise.all(statuses.map(async status=>{const o=await env.DEBUG_LOGS.get(prefix+'receipts/'+cid+'/'+status+'.json');return o?o.json():null;}))).filter(Boolean);
     return json({command:await object.json(),receipts});
    }
    if(request.method==='POST'&&!cid){
     if(!control.remoteControl)return json({error:'Remote control is disabled'},403);
     const raw=await request.text();if(new TextEncoder().encode(raw).length>65536)return json({error:'Command too large'},413);
     const c=JSON.parse(raw);if(!uuid.test(c.id)||!actions.has(c.action)||!c.args||typeof c.args!=='object'||Array.isArray(c.args)||!c.expectedCommit||!/^[a-f0-9]{40}$/.test(c.expectedCommit))return json({error:'Invalid command'},400);
     if(c.action==='prompt'?(typeof c.args.text!=='string'||!c.args.text.trim()||c.args.text.length>16000||Object.keys(c.args).some(k=>k!=='text')):c.action==='profile'?(![0,-1].includes(c.args.gpuLayers)||Object.keys(c.args).some(k=>k!=='gpuLayers')):['use-model','remove-model'].includes(c.action)?(!['light','lfm','granite','default'].includes(c.args.tier)||Object.keys(c.args).some(k=>k!=='tier')):Object.keys(c.args).length)return json({error:'Invalid command arguments'},400);
     const issuedKey=prefix+'issued/'+c.id+'.json';const old=await env.DEBUG_LOGS.get(issuedKey);let command;
     if(old){command=await old.json();if(command.action!==c.action||JSON.stringify(command.args)!==JSON.stringify(c.args)||command.expectedCommit!==c.expectedCommit)return json({error:'Command id conflict'},409);}
     else{const now=Date.now();command={id:c.id,action:c.action,args:c.args,expectedCommit:c.expectedCommit,issuedAt:new Date(now).toISOString(),expiresAt:new Date(now+1800000).toISOString(),pendingKey:prefix+'pending/'+String(now).padStart(13,'0')+'_'+c.id+'.json'};const won=await env.DEBUG_LOGS.put(issuedKey,JSON.stringify(command),{onlyIf:new Headers({'If-None-Match':'*'})});if(!won)command=await(await env.DEBUG_LOGS.get(issuedKey)).json();}
     const claimed=(await Promise.all(statuses.map(status=>env.DEBUG_LOGS.get(prefix+'receipts/'+c.id+'/'+status+'.json')))).some(Boolean);
     if(!claimed&&!await env.DEBUG_LOGS.get(command.pendingKey))await env.DEBUG_LOGS.put(command.pendingKey,JSON.stringify(command),{onlyIf:new Headers({'If-None-Match':'*'})});
     return json({id:command.id,action:command.action,issuedAt:command.issuedAt},202);
    }
    return json({error:'Not found'},404);
   }
   const ack=/^\/api\/debug\/([a-f0-9-]{36})\/commands\/([a-f0-9-]{36})$/.exec(url.pathname);
   if(ack&&request.method==='POST'){
    if(origin!=='https://'+HOST)return json({error:'Origin not allowed'},403,origin);
    const sid=ack[1],cid=ack[2],prefix='commands/'+sid+'/';const ctl=await env.DEBUG_LOGS.get('control/'+sid+'.json');if(!ctl||(await ctl.json()).disabled)return json({error:'Session unavailable'},403,origin);
    const object=await env.DEBUG_LOGS.get(prefix+'issued/'+cid+'.json');if(!object)return json({error:'Unknown command'},404,origin);
    const raw=await request.text();if(raw.length>8192)return json({error:'Receipt too large'},413,origin);const body=JSON.parse(raw);if(!statuses.includes(body.status))return json({error:'Invalid receipt'},400,origin);
    if(!uuid.test(body.pageId)||!uuid.test(body.installationId))return json({error:'Missing device claim'},400,origin);
    const claimKey=prefix+'receipts/'+cid+'/claimed.json';let claimObject=await env.DEBUG_LOGS.get(claimKey),claim=claimObject?await claimObject.json():null;
    if(body.status==='claimed'){
     if(!claim){const value={id:cid,status:'claimed',at:new Date().toISOString(),pageId:body.pageId,installationId:body.installationId};const won=await env.DEBUG_LOGS.put(claimKey,JSON.stringify(value),{onlyIf:new Headers({'If-None-Match':'*'})});claim=won?value:await(await env.DEBUG_LOGS.get(claimKey)).json();}
     if(claim.pageId!==body.pageId)return json({error:'Command claimed by another page'},409,origin);
    }else{
     if(!claim||!(claim.pageId===body.pageId||(body.status==='interrupted'&&claim.installationId===body.installationId&&claim.pageId===body.previousPageId)))return json({error:'Command claim mismatch'},409,origin);
     const key=prefix+'receipts/'+cid+'/'+body.status+'.json';if(!await env.DEBUG_LOGS.get(key))await env.DEBUG_LOGS.put(key,JSON.stringify({id:cid,status:body.status,at:new Date().toISOString(),pageId:body.pageId,payload:body.payload||null,code:typeof body.code==='string'?body.code.slice(0,100):null}));
    }
    await env.DEBUG_LOGS.delete((await object.json()).pendingKey);return json({accepted:true},202,origin);
   }
   if(admin&&request.method==='DELETE'){if(!authorized(request,env))return json({error:'Unauthorized'},401);await env.DEBUG_LOGS.put('control/'+admin[1]+'.json',JSON.stringify({disabled:true}));return json({disabled:true});}
   if(admin&&request.method==='GET'){
    if(!authorized(request,env))return json({error:'Unauthorized'},401);
    const id=admin[1];if(!uuid.test(id))return json({error:'Invalid session'},400);
    const events=new Map();
    const recent=url.searchParams.get('recent')==='1';
    const listed=await env.DEBUG_LOGS.list({prefix:'events/'+id+'/'+(recent?'stream/':''),limit:recent?40:100,cursor:url.searchParams.get('cursor')||undefined});
    for(let offset=0;offset<listed.objects.length;offset+=10){
     const batches=await Promise.all(listed.objects.slice(offset,offset+10).map(async item=>{const object=await env.DEBUG_LOGS.get(item.key);return object?object.json():null;}));
     for(const batch of batches)for(const event of batch?.events||[])events.set(event.id,event);
    }
    return json({id,events:[...events.values()].sort((a,b)=>a.at.localeCompare(b.at)),cursor:listed.truncated?listed.cursor:null});
   }
   const match=/^\/api\/debug\/([a-f0-9-]+)$/.exec(url.pathname);
   if(match&&request.method==='GET'&&uuid.test(match[1])){
    if(origin&&origin!=='https://'+HOST)return json({error:'Origin not allowed'},403,origin);
    const object=await env.DEBUG_LOGS.get('control/'+match[1]+'.json');if(!object)return json({error:'Not found'},404,origin);
    const control=await object.json();if(control.disabled)return json({error:'Debug session disabled'},403,origin);
    const commands=[];
    if(control.remoteControl===true&&url.searchParams.get('commands')==='1'){
     const listed=await env.DEBUG_LOGS.list({prefix:'commands/'+match[1]+'/pending/',limit:20});
     for(const item of listed.objects){const o=await env.DEBUG_LOGS.get(item.key);if(o)commands.push(await o.json());}
    }
    return json({format:'plc-dev-policy/1',captureContent:control.captureContent===true,remoteControl:control.remoteControl===true,commands},200,origin);
   }
   if(!match||request.method!=='POST'||!uuid.test(match[1]))return json({error:'Not found'},404,origin);
   if(origin!=='https://'+HOST)return json({error:'Origin not allowed'},403,origin);
   const control=await env.DEBUG_LOGS.get('control/'+match[1]+'.json');
   if(!control||(await control.json()).disabled===true)return json({error:'Debug session is missing or disabled'},403,origin);
   if(Number(request.headers.get('Content-Length'))>131072)return json({error:'Batch too large'},413,origin);
   const raw=await request.text();if(new TextEncoder().encode(raw).length>131072)return json({error:'Batch too large'},413,origin);
   const batch=JSON.parse(raw);
   if(batch.format!=='plc-dev-telemetry/1'||!Array.isArray(batch.events)||batch.events.length>100||!/^[a-f0-9_-]{20,100}$/.test(batch.id))return json({error:'Invalid batch'},400,origin);
   for(const event of batch.events){if(!uuid.test(event.id)||typeof event.type!=='string'||typeof event.at!=='string'||typeof event.data!=='object')return json({error:'Invalid event'},400,origin);}
   const firstAt=Date.parse(batch.events[0]?.at);if(!Number.isFinite(firstAt)||firstAt<0||firstAt>9999999999999)return json({error:'Invalid event time'},400,origin);
   const key=String(9999999999999-firstAt).padStart(13,'0')+'_'+batch.id;
   await env.DEBUG_LOGS.put('events/'+match[1]+'/stream/'+key+'.json',JSON.stringify({receivedAt:new Date().toISOString(),...batch}),{httpMetadata:{contentType:'application/json'}});
   return json({accepted:batch.events.length},202,origin);
  }catch{return json({error:'Invalid diagnostic request'},400,origin);}
 }
};
