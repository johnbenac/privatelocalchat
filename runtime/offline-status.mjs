// Keep the current probe alive and reject replies from superseded controllers. onResult(isCurrent, details): details carries what the worker
// also reports (bulkSaved, bulkExpected: the model runtime files saved so far).
export function createOfflineStatusProbe({getController,expectedCache,onResult,makeChannel=()=>new MessageChannel()}) {
 let serial=0,pending=null;
 return function checkOffline(){
  const request=++serial,worker=getController();
  pending?.port1.close();pending=null;
  if(!worker)return;
  const channel=makeChannel();pending=channel;
  channel.port1.onmessage=event=>{
   channel.port1.close();
   if(request!==serial||worker!==getController())return;
   pending=null;
   if(typeof event.data?.cache==='string')onResult(event.data.cache===expectedCache,event.data);
  };
  worker.postMessage({type:'offline-status'},[channel.port2]);
 };
}
