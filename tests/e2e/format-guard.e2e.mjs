// A version that finds stored data from a newer version leaves it alone and says so (docs/DATA-COMPATIBILITY.md).
// Newer data is made the way a newer version would leave it: a higher format in the browser's record, a store that moved to a newer key name, a document database with a higher version.
//   node scripts/e2e.mjs format-guard
process.env.PLC_E2E_BRANCH??='main';
const {launch,assert}=await import('./harness.mjs');
const ok=n=>console.log('PASS '+n);
const h=await launch({port:18491});
const {page,errors,origin}=h;
const ready=async()=>{await page.waitForSelector('#messageInput');await page.waitForFunction(()=>window.__plcBooted===true&&Boolean(window.plcShell),null,{timeout:30000});await page.waitForFunction(()=>!document.querySelector('#messageInput').disabled);};
const blank=async(setup,arg)=>{await page.goto(origin+'/version.json');await page.evaluate(async()=>{localStorage.clear();sessionStorage.clear();for(const {name} of await indexedDB.databases())await new Promise(r=>{const q=indexedDB.deleteDatabase(name);q.onsuccess=q.onerror=q.onblocked=()=>r();});});await page.evaluate(setup,arg);};
const open=async()=>{await page.goto(origin+'/');await ready();};
const dialog=async()=>{await page.waitForSelector('.app-dialog',{timeout:15000});return page.locator('.app-dialog').innerText();};
const dismiss=async()=>{await page.keyboard.press('Escape');await page.waitForSelector('.app-dialog',{state:'detached',timeout:5000}).catch(()=>{});};
const ls=key=>page.evaluate(k=>localStorage.getItem(k),key);
const NEWER_MEMORY=JSON.stringify({enabled:true,items:[{id:'n1',text:'Written by a newer version.',at:1}],v:2});

try{
  // 1. a store marked newer in the browser's record
  await blank(m=>{localStorage.setItem('plc.memory.v1',m);localStorage.setItem('plc.formats.v1',JSON.stringify({v:1,formats:{'plc.memory.v1':2}}));localStorage.setItem('plc.lockSplash.v1','off');},NEWER_MEMORY);
  await open();
  let text=await dialog();
  assert(/memory/.test(text)&&/newer version/.test(text)&&/will not change them/.test(text),'the message names the memory and says it is left alone: '+text);
  assert(/Reload now/.test(await page.locator('.app-dialog button').allInnerTexts().then(t=>t.join('|'))),'it offers to reload');
  await dismiss();
  await page.click('button[aria-label="This device menu"]');await page.click('.shell-pop-row:has-text("Memory & preferences")');
  const shownMemory=await page.locator('.app-dialog').innerHTML();
  assert(shownMemory.includes('Written by a newer version.'),'the newer memory can still be read: '+shownMemory.slice(0,500));
  await page.fill('.app-dialog input[aria-label="New memory"]','This must not be saved.');await page.click('.app-dialog button:has-text("Add")');
  await page.click('.app-dialog button:has-text("Done")');await page.waitForTimeout(800);
  assert(await ls('plc.memory.v1')===NEWER_MEMORY,'the newer memory is exactly as it was: '+await ls('plc.memory.v1'));
  assert(JSON.parse(await ls('plc.formats.v1')).formats['plc.memory.v1']===2,'the record still says 2');
  ok('a store the record marks as newer is readable, announced, and never written');

  // 2. the rest of the app still saves normally
  await page.click('#threadList .list-add[aria-label="New project"]');await page.fill('.app-dialog input','Still works');await page.click('.app-dialog button:has-text("Create")');
  await page.waitForTimeout(800);
  assert(/Still works/.test(await ls('plc.folders.v1')),'projects are still saved: '+await ls('plc.folders.v1'));
  assert(await ls('plc.memory.v1')===NEWER_MEMORY,'and the newer memory is still untouched');
  ok('other stores are not affected');

  // 3. a store that moved to a newer key name blocks the older key of its family
  await blank(()=>{localStorage.setItem('plc.voice.v2','{"id":"system"}');localStorage.setItem('plc.voice.v3','{"id":"future"}');localStorage.setItem('plc.lockSplash.v1','off');});
  await open();
  text=await dialog();
  assert(/voice settings/.test(text),'the message names the voice settings: '+text);
  assert(await ls('plc.voice.v2')==='{"id":"system"}'&&await ls('plc.voice.v3')==='{"id":"future"}','both voice keys are untouched');
  await dismiss();
  ok('a newer key name is noticed from the keys alone');

  // 4. a document database from a newer version cannot be opened here, and is left alone
  await blank(async()=>{
    localStorage.setItem('plc.lockSplash.v1','off');
    await new Promise((res,rej)=>{const r=indexedDB.open('plc-docs',7);r.onupgradeneeded=()=>{const os=r.result.createObjectStore('docs',{keyPath:'id'});os.put({id:'d1',name:'from-newer.txt',text:'newer'});};r.onsuccess=()=>{r.result.close();res();};r.onerror=()=>rej(r.error);});
  });
  await open();
  // the message appears when the document store is first opened: at start, or when the Library is
  if(!await page.waitForSelector('.app-dialog',{timeout:4000}).then(()=>true,()=>false))await page.click('#shellRail button[aria-label="Library"]');
  text=await dialog();
  assert(/documents/.test(text)&&/newer version/.test(text),'the message names the documents: '+text);
  await dismiss();
  const version=await page.evaluate(()=>new Promise(res=>{const r=indexedDB.open('plc-docs');r.onsuccess=()=>{const v=r.result.version,n=r.result.objectStoreNames.length;r.result.close();res({v,n});};}));
  assert(version.v===7&&version.n===1,'the newer database is still version 7: '+JSON.stringify(version));
  ok('a newer document database is announced and left alone');

  // 5. nothing newer: no message, and the record is written
  await blank(()=>{localStorage.setItem('plc.lockSplash.v1','off');});
  await open();await page.waitForTimeout(1000);
  assert(await page.locator('.app-dialog').count()===0,'no message when nothing is newer');
  assert(JSON.parse(await ls('plc.formats.v1')).formats.chatThreads===1,'the record is written');
  ok('no newer data, no message');

  assert(!errors.length,'page errors: '+errors.join(' | '));
  console.log('ALL PASS');
}catch(error){
  console.error('FAIL '+(error.stack||error));
  await page.screenshot({path:'/tmp/format-guard-failure.png'}).catch(()=>{});
  process.exitCode=1;
}finally{
  await h.close();
}
