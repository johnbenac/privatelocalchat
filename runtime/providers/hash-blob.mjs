// Terminate the short-lived checksum worker on success, failure, timeout or cancellation.
export async function sha256OfBlob(blob,{signal,createWorker=()=>new Worker(new URL('./hash-blob-worker.mjs',import.meta.url),{type:'module'}),timeoutMs=30000}={}){
 signal?.throwIfAborted();
 let worker,timer,onAbort;
 try{
  worker=createWorker();
  return await new Promise((resolve,reject)=>{
   const fail=error=>reject(error);
   const arm=()=>{clearTimeout(timer);timer=setTimeout(()=>fail(new Error('Model checksum stalled')),timeoutMs);};
   onAbort=()=>fail(signal.reason||new DOMException('Cancelled','AbortError'));
   worker.onmessage=({data})=>{
    if(!data||typeof data!=='object')fail(new Error('Invalid model checksum worker response'));
    else if(data.error)fail(Object.assign(new Error(data.error.message),{name:data.error.name}));
    else if(typeof data.digest==='string'&&/^[0-9a-f]{64}$/.test(data.digest))resolve(data.digest);
    else if(Number.isSafeInteger(data.bytes)&&data.bytes>=0&&data.bytes<=blob.size)arm();
    else fail(new Error('Invalid model checksum worker response'));
   };
   worker.onerror=event=>fail(new Error(event.message||'Model checksum worker failed'));
   worker.onmessageerror=()=>fail(new Error('Model checksum worker message failed'));
   signal?.addEventListener('abort',onAbort,{once:true});
   if(signal?.aborted){onAbort();return;}
   arm();worker.postMessage({blob});
  });
 }finally{
  clearTimeout(timer);signal?.removeEventListener('abort',onAbort);worker?.terminate();
 }
}
