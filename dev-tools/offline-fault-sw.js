// Development-only, origin-scoped network denial for unattended USB testing.
// Radios stay on. Cache hits remain readable; every cache miss and POST fails.
const FAULT_CACHE='plc-dev-network-fault';
const FAULT_KEY=new URL('/__plc-dev-network-fault',location.origin).href;
let faultEnabled=false;
const faultReady=(async()=>{
 if(location.hostname!=='dev.privatelocal.chat')return;
 try{const r=await(await caches.open(FAULT_CACHE)).match(FAULT_KEY);faultEnabled=r?(await r.json()).enabled===true:false;}
 catch{faultEnabled=false;}
})();
self.addEventListener('message',event=>{
 if(event.data?.type!=='dev-network-fault'||location.hostname!=='dev.privatelocal.chat')return;
 let source;try{source=new URL(event.source.url);}catch{return;}
 if(source.origin!==location.origin||typeof event.data.enabled!=='boolean')return;
 event.waitUntil((async()=>{
  await faultReady;
  const enabled=event.data.enabled;
  await(await caches.open(FAULT_CACHE)).put(FAULT_KEY,new Response(JSON.stringify({enabled}),{headers:{'Content-Type':'application/json'}}));
  faultEnabled=enabled;event.ports[0]?.postMessage({enabled,scope:'service-worker network denial; radios unchanged'});
 })());
});
async function developmentOfflineResponse(event,url){
 await faultReady;if(!faultEnabled)return;
 if(event.request.method==='GET'){
  const saved=event.request.mode==='navigate'&&url.origin===location.origin
   ?await(await caches.open(CACHE)).match(offlinePage(url.pathname)):await caches.match(event.request);
  if(saved)return event.request.mode==='navigate'
   ?new Response(saved.body,{status:200,headers:saved.headers}):saved;
 }
 return Response.error();
}
