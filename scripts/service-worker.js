const CACHE=__CACHE_NAME__;
const DEVELOPMENT_NATIVE=__DEVELOPMENT_NATIVE__;
const SHELL=__SHELL_FILES__.filter(file=>DEVELOPMENT_NATIVE||!file.includes('/dev-tools/'));
__DEV_OFFLINE_FAULT__
// The small files the app needs to start are required; the multi-megabyte model runtimes are cached too, but a phone that cannot finish
// them must not be left running an old version forever, so they never block an update (they are also cached as they are first used).
const isBulk=file=>/\/vendor\/(wllama|webllm)\//.test(file);
async function cacheFile(cache,url){
  const response=await fetch(url,{cache:'reload'});
  if(!response.ok)throw new Error('Offline asset failed: '+url);
  await cache.put(url,new Response(response.body,{status:response.status,statusText:response.statusText,headers:response.headers}));
}
async function cacheAll(cache,files,{strict,workers}){
  let i=0;
  await Promise.all(Array.from({length:workers},async()=>{while(i<files.length){const url=files[i++];try{await cacheFile(cache,url);}catch(error){if(strict)throw error;try{await cacheFile(cache,url);}catch{/* cached when first used */}}}}));
}
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  await cacheAll(cache,SHELL.filter(file=>!isBulk(file)),{strict:true,workers:6});
  self.skipWaiting();
  await cacheAll(cache,SHELL.filter(isBulk),{strict:false,workers:2});
})()));
// A tab keeps the build it started on for as long as it is open (docs/UPGRADE-BEHAVIOUR.md), so a saved copy is kept while any open tab runs it. Each tab answers with its build.
async function buildsInUse(){
  const found=new Set();
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  await Promise.all(windows.map(client=>new Promise(resolve=>{
    const channel=new MessageChannel(),timer=setTimeout(resolve,1500);
    channel.port1.onmessage=event=>{clearTimeout(timer);if(typeof event.data?.commit==='string')found.add(event.data.commit);resolve();};
    try{client.postMessage({type:'which-build'},[channel.port2]);}catch{clearTimeout(timer);resolve();}
  })));
  return found;
}
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const previous=(await caches.keys()).filter(name=>name.startsWith('plc-shell-')&&name!==CACHE);
  const inUse=await buildsInUse().catch(()=>new Set());
  const keep=new Set(previous.slice(-1)); // the one before this, as before
  for(const commit of inUse)keep.add('plc-shell-'+commit);
  for(const name of previous)if(!keep.has(name))await caches.delete(name);
  await self.clients.claim();
})()));
// What the page asks for: whether this is the current saved copy and how many of the large model runtime files are saved (they are saved best-effort,
// so "the app is saved" and "the runtime is saved" are different facts), and a request to save the missing ones now.
async function runtimeStatus(){
  const cache=await caches.open(CACHE);
  const saved=new Set((await cache.keys()).map(request=>new URL(request.url).pathname));
  const bulk=SHELL.filter(isBulk);
  return {cache:CACHE,bulkExpected:bulk.length,bulkSaved:bulk.filter(file=>saved.has(file)).length,missing:bulk.filter(file=>!saved.has(file))};
}
self.addEventListener('message',event=>{
  const port=event.ports[0];
  if(event.data?.type==='offline-status')event.waitUntil(runtimeStatus().then(({missing,...status})=>port?.postMessage(status),()=>port?.postMessage({cache:CACHE})));
  if(event.data?.type==='save-runtime')event.waitUntil((async()=>{
    const {missing}=await runtimeStatus();
    await cacheAll(await caches.open(CACHE),missing,{strict:false,workers:2});
    const {missing:_,...status}=await runtimeStatus();port?.postMessage(status);
  })().catch(()=>port?.postMessage({cache:CACHE,error:true})));
  if(event.data?.type==='activate-update')self.skipWaiting();
});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 /* DEV_DIAGNOSTICS_START */
 if(location.hostname==='dev.privatelocal.chat'){
  event.respondWith((async()=>await developmentOfflineResponse(event,url)||normalResponse(event,url))());return;
 }
 /* DEV_DIAGNOSTICS_END */
 if(event.request.method!=='GET'||url.origin!==location.origin)return;
 event.respondWith(normalResponse(event,url));
});
const PUBLIC_PAGES=__PUBLIC_PAGES__;
function offlinePage(pathname){
  const page=/^\/([a-z]+)\/?(?:index\.html)?$/.exec(pathname)?.[1];
  return PUBLIC_PAGES.includes(page)?'/'+page+'/index.html':'/index.html';
}
async function normalResponse(event,url){
  if(event.request.method!=='GET'||url.origin!==location.origin)return fetch(event.request);
  const cache=await caches.open(CACHE);
  if(event.request.mode==='navigate'){
   // The public documents are separate pages. Offline, each one opens its own saved document; anything else gets the app.
   try{return await fetch(event.request);}catch{const saved=await cache.match(offlinePage(url.pathname));return saved?new Response(saved.body,{status:200,headers:saved.headers}):Response.error();}
  }
  // What says which build is current must come from the network, or an open tab would be told its own build is the newest for as long as the saved copy lasts.
  if(url.pathname==='/version.json'||url.pathname==='/releases/index.json'){
   try{return await fetch(event.request);}catch(error){if(url.search)throw error;const old=await cache.match(url.pathname);if(old)return old;throw error;} // a request with a query (the connection probe, the update check) must see a dead connection as one
  }
  const saved=await cache.match(event.request)||(url.pathname.startsWith('/releases/')?await caches.match(event.request):undefined); // a page from the previous version may still be open
  if(saved)return saved;
  const response=await fetch(event.request);
  if(response.status===200&&response.type==='basic'&&/^\/(releases|brand)\//.test(url.pathname))try{await cache.put(event.request,response.clone());}catch{/* storage full: served from the network */}
  return response;
}
