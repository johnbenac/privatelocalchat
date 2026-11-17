// Only file transfers use this policy; inference and construction never retry here.
export function retryableDownload(error) {
  if (['AbortError','QuotaExceededError','SecurityError','NotAllowedError','NotSupportedError'].includes(error?.name)) return false;
  const message=String(error?.message||'');
  if (/out of memory|allocation failed|disk.*full|no space/i.test(message)) return false;
  const status=Number(error?.status||message.match(/\bHTTP\s+(\d{3})\b/i)?.[1]);
  if (status) return [408,425,429,500,502,503,504].includes(status);
  return error?.code==='cache-corrupt'||error?.name==='TypeError'||/network|fetch|connection|timed?\s*out|load failed/i.test(message);
}
export function retryDelay(ms,signal) {
  return new Promise((resolve,reject)=>{
    const abort=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(new DOMException('Download cancelled','AbortError'));};
    const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},ms);
    signal?.addEventListener('abort',abort,{once:true});
    if(signal?.aborted)abort();
  });
}
export async function retryDownload(operation,{signal,onRetry,attempts=4,pause=retryDelay}={}) {
  for(let attempt=1;;attempt++) {
    signal?.throwIfAborted();
    try{return await operation(attempt);}
    catch(error){
      if(signal?.aborted||attempt>=attempts||!retryableDownload(error))throw error;
      const retryDelayMs=1000*2**(attempt-1);
      onRetry?.({phase:'retry-wait',retryAttempt:attempt,retryLimit:attempts-1,retryDelayMs});
      await pause(retryDelayMs,signal);
    }
  }
}
