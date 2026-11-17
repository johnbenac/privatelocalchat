// Development-only local inference objects. No API settings or authorization headers are read.
const KINDS=new Set(['provider-request','provider-event','native-request','native-error','native-chunk','conversation-snapshot','runtime-config','remote-command','remote-result']);
const bytesToBase64=bytes=>btoa(String.fromCharCode(...bytes));
const base64ToBytes=text=>Uint8Array.from(atob(text),c=>c.charCodeAt(0));
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');

export async function encodeObject(kind,requestId,object,objectSequence){
 if(!KINDS.has(kind))throw new Error('Unsupported conversation object kind');
 const bytes=new TextEncoder().encode(JSON.stringify(object));
 if(bytes.length>1048576)throw Object.assign(new Error('Conversation object exceeds 1 MiB diagnostic limit'),{code:'content-object-too-large'});
 const payloadId=crypto.randomUUID(),sha256=await hash(bytes),parts=Math.max(1,Math.ceil(bytes.length/600)),frames=[];
 for(let part=0;part<parts;part++)frames.push({payloadId,requestId,kind,objectSequence,encoding:'json-utf8-base64',part,parts,bytes:bytes.length,sha256,data:bytesToBase64(bytes.subarray(part*600,(part+1)*600))});
 return frames;
}

export async function decodeObjects(events){
 const groups=new Map();
 for(const event of events){
  if(event.type!=='conversation-object')continue;
  const f=event.data;if(f?.encoding!=='json-utf8-base64')continue;
  let g=groups.get(f.payloadId);if(!g)groups.set(f.payloadId,g={header:f,parts:new Map(),at:event.at,page:event.page});
  if(f.sha256!==g.header.sha256||f.parts!==g.header.parts||f.bytes!==g.header.bytes||f.kind!==g.header.kind||f.requestId!==g.header.requestId)throw new Error('Conflicting conversation frames');
  if(g.parts.has(f.part)&&g.parts.get(f.part)!==f.data)throw new Error('Conflicting duplicate conversation frame');
  g.parts.set(f.part,f.data);
 }
 const result=[];
 for(const [payloadId,g]of groups){
  const f=g.header,missing=[];for(let i=0;i<f.parts;i++)if(!g.parts.has(i))missing.push(i);
  const row={payloadId,requestId:f.requestId,kind:f.kind,objectSequence:f.objectSequence,page:g.page,at:g.at,sha256:f.sha256,missingParts:missing};
  if(!missing.length){
   const chunks=Array.from({length:f.parts},(_,i)=>base64ToBytes(g.parts.get(i))),bytes=new Uint8Array(chunks.reduce((n,b)=>n+b.length,0));let at=0;
   for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
   if(bytes.length!==f.bytes||await hash(bytes)!==f.sha256)throw new Error('Conversation object digest mismatch');
   row.object=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  }
  result.push(row);
 }
 return result.sort((a,b)=>a.at.localeCompare(b.at)||a.objectSequence-b.objectSequence);
}

export function captureProvider(provider,telemetry){
 const original=provider.generate.bind(provider);
 provider.generate=(request,options={})=>{
  if(!telemetry.config.enabled||!telemetry.config.captureContent)return original(request,options);
  let actual,pendingAbort;const requestId=request.attemptId;
  const forwarded={...request,debugCapture:true};
  const ready=(async()=>{await telemetry.recordObject('provider-request',requestId,forwarded);actual=original(forwarded,options);if(pendingAbort)actual.abort(pendingAbort);return actual;})();
  const done=ready.then(async call=>{
   const it=call[Symbol.asyncIterator]();let nativeChunks=false;
   for(;;){
    const {value:event,done}=await it.next();if(done)break;
    if(event.type==='debug-object'){
     if(event.kind==='native-chunk')nativeChunks=true;
     await telemetry.recordObject(event.kind,requestId,event.object);
    }else if(event.type!=='token'||!nativeChunks)await telemetry.recordObject('provider-event',requestId,event);
   }
   return call.done;
  });
  return {attemptId:requestId,done,abort:reason=>{if(actual)actual.abort(reason);else pendingAbort=reason;},[Symbol.asyncIterator](){let it;return {async next(){it??=(await ready)[Symbol.asyncIterator]();return it.next();},async return(){return {done:true};},[Symbol.asyncIterator](){return this;}};}};
 };
}
