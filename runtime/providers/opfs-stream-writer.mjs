// Model cache writes must release their worker even when open, write, close or cancellation fails.
export async function writeOpfsStream(key,stream,{directory,createWorker=()=>new Worker(new URL('./opfs-write-worker.mjs',import.meta.url),{type:'module'}),timeoutMs=30000,readTimeoutMs=60000}={}){
 let worker,reader,pending,sequence=0,completed=false;
 const fail=error=>{if(pending){const p=pending;pending=null;clearTimeout(p.timer);p.reject(error);}};
 try{
  worker=createWorker();
  worker.onmessage=({data})=>{
   if(!pending||data.id!==pending.id)return;
   const p=pending;pending=null;clearTimeout(p.timer);
   if(data.error)p.reject(Object.assign(new Error(data.error.message),{name:data.error.name||'Error',phase:data.error.operation,code:'opfs-write-failed'}));else p.resolve();
  };
  worker.onerror=event=>fail(Object.assign(new Error(event.message||'Model cache worker failed'),{code:'opfs-worker-failed'}));
  worker.onmessageerror=()=>fail(Object.assign(new Error('Model cache worker message could not be read'),{code:'opfs-worker-message-failed'}));
  const call=(operation,extra={})=>new Promise((resolve,reject)=>{
   const id=++sequence,timer=setTimeout(()=>fail(Object.assign(new Error('Model cache '+operation+' timed out'),{code:'opfs-write-timeout',phase:operation})),timeoutMs);
   pending={id,timer,resolve,reject};try{worker.postMessage({id,operation,...extra});}catch(error){fail(error);}
  });
  await call('open',{key,directory});reader=stream.getReader();
  for(;;){
   let timer;
   const result=await Promise.race([reader.read(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(new Error('Model download stalled'),{code:'download-read-timeout'})),readTimeoutMs);})]).finally(()=>clearTimeout(timer));
   if(result.done)break;await call('write',{chunk:result.value});
  }
  await call('close');completed=true;
 }finally{
  if(pending){clearTimeout(pending.timer);pending=null;}
  if(!completed){try{const cancelled=reader?reader.cancel():stream.cancel();cancelled?.catch(()=>{});}catch{}}
  try{reader?.releaseLock();}catch{}
  worker?.terminate();
 }
}
