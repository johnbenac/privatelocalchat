import {launch,assert} from './harness.mjs';
import {get} from 'node:http';
// The public pages (Help, About, Privacy, Updates): each loads straight from the served build, has its content in the initial HTML without
// JavaScript, loads no model code, shares correctly, fits small screens and large text, and opens offline once the app is saved.
const ok=name=>console.log('PASS',name);
const h=await launch({port:18281});
const {browser,origin}=h;
const PAGES=[
 {path:'/help/',heading:'Help',text:['Getting started','Frequently asked questions','Private Local Chat lets you use AI in your web browser.','A model download stalls or keeps restarting','Known issues','Report a bug or ask for a feature on GitHub']},
 {path:'/about/',heading:'About Private Local Chat',text:['Private Local Chat is a free place to use AI in your browser. Run a supported model on your own device, or choose an outside provider. Use it to draft, explore ideas, and work through information.','Turn rough notes into a clear message','Share resources']},
 {path:'/privacy/',heading:'Privacy',text:['Last reviewed: 2026-11-11','Text processing on your device','Hosting, logs and analytics']},
 {path:'/updates/',heading:'Updates',text:['Share, transfer settings, and help','On-device chat without a graphics card','Known issues']}
];
const raw=path=>new Promise((resolve,reject)=>{get({host:'127.0.0.1',port:18281,path},res=>{res.resume();res.on('end',()=>resolve(res));}).on('error',reject);});
try{
 // ---- served directly: directory indexes, the feed, sitemap and robots, and the path guard ------------------------------------------------
 for(const {path,heading} of PAGES){
  const response=await fetch(origin+path);
  assert(response.status===200&&/text\/html/.test(response.headers.get('content-type')),'served '+path);
  assert(new RegExp('<h1>'+heading+'</h1>').test(await response.text()),'initial HTML has the heading for '+path);
  const bare=await fetch(origin+path.slice(0,-1),{redirect:'manual'});
  assert(bare.status===308&&bare.headers.get('location')===path,'/'+path.slice(1,-1)+' is sent to '+path);
 }
 assert(/application\/(rss\+)?xml/.test((await fetch(origin+'/updates/rss.xml')).headers.get('content-type')),'feed type');
 assert(/xml/.test((await fetch(origin+'/sitemap.xml')).headers.get('content-type')),'sitemap type');
 const robots=await fetch(origin+'/robots.txt');
 assert(/text\/plain/.test(robots.headers.get('content-type'))&&(await robots.text())==='User-agent: *\nAllow: /\n\nSitemap: https://privatelocal.chat/sitemap.xml\n','robots.txt');
 assert((await raw('/..%2fpackage.json')).statusCode===404&&(await raw('/%2e%2e/%2e%2e/etc/passwd')).statusCode===404,'path traversal is refused');
 ok('served from the build');

 // ---- the content is in the initial HTML: no JavaScript at all --------------------------------------------------------------------------
 const plain=await browser.newContext({javaScriptEnabled:false,serviceWorkers:'block'});
 const plainPage=await plain.newPage();
 for(const {path,heading,text} of PAGES){
  await plainPage.goto(origin+path);
  assert(await plainPage.locator('h1').innerText()===heading,'h1 without JavaScript on '+path);
  const body=(await plainPage.locator('main').innerText()).replace(/\s+/g,' ');
  for(const part of text)assert(body.includes(part),path+' shows "'+part+'" without JavaScript');
  assert(await plainPage.locator('a:has-text("Open Private Local Chat")').first().getAttribute('href')==='/','open action on '+path);
 }
 await plainPage.goto(origin+'/help/#stalled-download');
 assert(await plainPage.locator('#stalled-download').isVisible(),'a troubleshooting anchor is visible');
 for(const anchor of ['getting-started','faq','troubleshooting','known-issues','contact','install','share','transfer-settings','unlock-token','transfer-chats'])assert(await plainPage.locator('#'+anchor).count()===1,'#'+anchor+' exists');
 assert(await plainPage.locator('details.faq-item[open]').count()===16,'all sixteen FAQ answers are open and readable');
 await plainPage.goto(origin+'/updates/');
 assert(await plainPage.locator('link[rel=alternate][type="application/rss+xml"]').count()===1,'feed is linked from the page head');
 assert(await plainPage.locator('a[href="/updates/rss.xml"]').first().isVisible(),'feed is linked visibly');
 await plain.close();
 ok('content is in the initial HTML');

 // ---- no model code on the public pages -------------------------------------------------------------------------------------------------
 const requests=[];
 h.page.on('request',r=>requests.push(r.url()));
 requests.length=0;
 for(const {path} of PAGES){await h.page.goto(origin+path);await h.page.waitForLoadState('networkidle');}
 assert(requests.length>0&&requests.every(u=>u.startsWith(origin)),'only same-origin requests');
 assert(!requests.some(u=>/\/runtime\/|local-models|\.wasm|assets\.privatelocal\.chat|vendor\/(wllama|webllm)|\/chat\/(stream|threads|documents)/.test(u)),'no model or chat code was loaded: '+requests.filter(u=>/runtime|local-models|wasm/.test(u)));
 ok('independent of model setup');

 // ---- the share panel on Help and About -------------------------------------------------------------------------------------------------
 await h.context.grantPermissions(['clipboard-read','clipboard-write']);
 for(const path of ['/help/','/about/']){
  await h.page.goto(origin+path);
  await h.page.waitForSelector('#productCopyBtn');
  assert(await h.page.locator('.product-share').count()===1,'one share panel on '+path);
  assert(await h.page.locator('#productShareBtn').count()===0,'no Share button where the browser cannot share');
  assert(/primary/.test(await h.page.locator('#productCopyBtn').getAttribute('class')),'Copy link is the main action without native sharing');
  await h.page.click('#productCopyBtn');
  await h.page.waitForFunction(()=>/Link copied/.test(document.querySelector('.product-share-status').textContent));
  assert(await h.page.evaluate(()=>navigator.clipboard.readText())==='https://privatelocal.chat/','the copied link is the public address on '+path);
  await h.page.click('#productQrBtn');
  await h.page.waitForSelector('.product-share-qr:not([hidden]) .product-share-qr-image img, .product-share-qr:not([hidden]) .product-share-qr-image canvas',{timeout:15000});
  assert((await h.page.locator('.product-share-destination').innerText())==='https://privatelocal.chat/','the QR destination is shown beneath it on '+path);
  assert(/Hide QR code/.test(await h.page.locator('#productQrBtn').innerText()),'QR toggle');
 }
 ok('Copy link and Show QR code');

 const shares=await browser.newContext({serviceWorkers:'block',permissions:['clipboard-read','clipboard-write']});
 await shares.addInitScript(()=>{
  window.__shares=[];
  navigator.canShare=()=>true;
  navigator.share=data=>{window.__shares.push(data);return Promise.reject(new DOMException('The user closed the share sheet','AbortError'));};
 });
 const sharePage=await shares.newPage();
 for(const path of ['/help/','/about/']){
  await sharePage.goto(origin+path);
  await sharePage.waitForSelector('#productShareBtn');
  assert(/primary/.test(await sharePage.locator('#productShareBtn').getAttribute('class')),'Share is the main action where native sharing exists');
  await sharePage.click('#productShareBtn');
  await sharePage.waitForFunction(()=>window.__shares.length>0);
  assert(JSON.stringify(await sharePage.evaluate(()=>window.__shares.at(-1)))===JSON.stringify({url:'https://privatelocal.chat/',title:'Private Local Chat',text:'Free AI chat in your browser. Run a supported model on your device, or choose an outside provider.'}),'the fixed public payload was shared on '+path);
  await sharePage.waitForTimeout(150);
  assert((await sharePage.locator('.product-share-status').innerText())==='','a dismissed share sheet is not an error');
  assert(await sharePage.locator('#productShareBtn').isEnabled()&&await sharePage.locator('#productShareBtn').isVisible(),'Share stays usable');
  await sharePage.click('#productCopyBtn');
  await sharePage.waitForFunction(()=>/Link copied/.test(document.querySelector('.product-share-status').textContent));
  assert(await sharePage.locator('#productQrBtn').isEnabled(),'QR stays usable');
 }
 await shares.close();
 ok('cancelling the native share leaves the panel usable');

 // ---- small screens, large text, dark mode, touch targets --------------------------------------------------------------------------------
 const phone=await browser.newContext({viewport:{width:360,height:740},isMobile:true,hasTouch:true,deviceScaleFactor:2,serviceWorkers:'block'});
 const phonePage=await phone.newPage();
 for(const {path} of PAGES){
  await phonePage.goto(origin+path);
  assert(await phonePage.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'no sideways scrolling on a phone: '+path);
  await phonePage.evaluate(()=>{document.documentElement.style.fontSize='200%';});
  assert(await phonePage.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'no sideways scrolling at 200% text: '+path);
  const small=await phonePage.evaluate(()=>[...document.querySelectorAll('.site-nav-list a, .button, .faq-item > summary, .toc a')].filter(el=>el.offsetParent&&el.getBoundingClientRect().height<43.5).map(el=>el.textContent.trim()));
  assert(small.length===0,'touch targets are at least 44px on '+path+': '+small);
 }
 await phone.close();
 const dark=await browser.newContext({colorScheme:'dark',serviceWorkers:'block'});
 const darkPage=await dark.newPage();
 await darkPage.goto(origin+'/help/');
 assert(await darkPage.evaluate(()=>getComputedStyle(document.body).backgroundColor)==='rgb(16, 24, 32)','dark theme background');
 assert(await darkPage.evaluate(()=>document.querySelector('.brand img').currentSrc.endsWith('/brand/wordmark-dark.svg')),'dark wordmark');
 await darkPage.keyboard.press('Tab');
 assert(await darkPage.evaluate(()=>document.activeElement.className==='skip-link'),'keyboard focus reaches the skip link first');
 assert(parseFloat(await darkPage.evaluate(()=>getComputedStyle(document.activeElement).outlineWidth))>=2||await darkPage.evaluate(()=>document.activeElement.getBoundingClientRect().top>=0),'focus is visible');
 await dark.close();
 const light=await browser.newContext({colorScheme:'light',serviceWorkers:'block'});
 const lightPage=await light.newPage();
 await lightPage.goto(origin+'/about/');
 assert(await lightPage.evaluate(()=>getComputedStyle(document.body).backgroundColor)==='rgb(246, 248, 251)','light theme background');
 await light.close();
 ok('phone width, 200% text, dark and light themes, touch targets, focus');

 // ---- offline: with the app saved, each public page opens its own document ------------------------------------------------------------
 const saved=await browser.newContext({serviceWorkers:'allow'});
 const savedPage=await saved.newPage();
 await savedPage.goto(origin+'/');
 await savedPage.waitForFunction(async()=>{
  for(const key of await caches.keys()){
   const cache=await caches.open(key);
   if(await cache.match('/index.html')&&await cache.match('/help/index.html')&&await cache.match('/about/index.html')&&await cache.match('/privacy/index.html')&&await cache.match('/updates/index.html'))return true;
  }
  return false;
 },null,{timeout:90000});
 await savedPage.waitForFunction(()=>navigator.serviceWorker.controller||navigator.serviceWorker.ready.then(()=>true),null,{timeout:30000});
 await saved.setOffline(true);
 for(const {path,heading} of PAGES.slice(0,3)){
  await savedPage.goto(origin+path);
  assert(await savedPage.locator('h1').innerText()===heading,'offline '+path+' opens its own page');
  assert(await savedPage.locator('#messageInput').count()===0,'offline '+path+' is not the app shell');
 }
 await savedPage.goto(origin+'/help');
 assert(await savedPage.locator('h1').innerText()==='Help','offline /help (no slash) opens Help');
 await savedPage.goto(origin+'/updates/');
 assert(await savedPage.locator('h1').innerText()==='Updates','offline /updates/ opens Updates');
 await savedPage.goto(origin+'/');
 assert(await savedPage.locator('#messageInput').count()===1,'offline / still opens the app');
 await savedPage.goto(origin+'/no-such-page/');
 assert(await savedPage.locator('#messageInput').count()===1,'an unknown path still falls back to the app');
 await saved.setOffline(false);
 await saved.close();
 ok('public pages open offline');
 assert(h.errors.length===0,'no page errors: '+h.errors);
 console.log('ALL PASS');
}catch(e){console.error(e.message);console.error(h.errors);process.exitCode=1;}
finally{await h.close();}
