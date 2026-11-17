// The encrypted vault, end to end (docs/ENCRYPTION-AT-REST-PLAN.md, phase 2): turn it on through Settings, prove nothing readable is left at rest, unlock again, survive a page
// killed in the middle of a reply, wrong and changed passphrase, lock now, and turn it off. A marker string is written into a chat and then looked for everywhere the browser keeps data.
//   node scripts/e2e.mjs vault
import {launch,assert} from './harness.mjs';
const ok=n=>console.log('PASS '+n);
const MARK='ZEBRA-MARKER-5531';
const h=await launch({port:18421});
const {context}=h;let page=h.page;
const done=()=>page.waitForFunction(()=>/^(Response complete\.|Response stopped|The response was interrupted|The response reached)/.test(document.querySelector('#generationStatus').textContent),null,{timeout:20000});
const send=async text=>{await page.fill('#messageInput',text);await page.click('#sendBtn');};
const openSettings=async section=>{if(!await page.locator('#settingsPage').isVisible()){await page.click('button[aria-label="This device menu"]');await page.click('.shell-pop-row:has-text("Settings")');}await page.click(`.settings-nav-item[data-section="${section}"]`);};
const closeSettings=async()=>{if(await page.locator('#settingsPage').isVisible())await page.click('button[aria-label="Close settings"]');};
const ready=async()=>{await page.waitForSelector('#messageInput');await page.waitForFunction(()=>window.__plcBooted===true&&Boolean(window.plcShell),null,{timeout:20000});await page.waitForFunction(()=>!document.querySelector('#messageInput').disabled);};
// everything the browser keeps: local and session storage values, the names of the databases, and every record of every IndexedDB database
const dump=()=>page.evaluate(async()=>{
  const out={local:{},session:{},idb:{}};
  for(let i=0;i<localStorage.length;i++)out.local[localStorage.key(i)]=localStorage.getItem(localStorage.key(i));
  for(let i=0;i<sessionStorage.length;i++)out.session[sessionStorage.key(i)]=sessionStorage.getItem(sessionStorage.key(i));
  for(const {name} of await indexedDB.databases()){
    const db=await new Promise((res,rej)=>{const r=indexedDB.open(name);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});
    out.idb[name]={};
    for(const store of [...db.objectStoreNames]){out.idb[name][store]=await new Promise((res,rej)=>{const r=db.transaction(store).objectStore(store).getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
    db.close();
  }
  return out;
});
const text=o=>JSON.stringify(o);
const shows=(mark)=>page.waitForFunction(m=>[...document.querySelectorAll('.message.user')].some(n=>n.textContent.includes(m)),mark,{timeout:15000}); // the page flags itself started before it has drawn the saved chat
const unlock=async(pass)=>{await page.fill('#unlockPass',pass);await page.press('#unlockPass','Enter');};
try{
 await ready();
 await send('remember '+MARK);await done();
 assert((await text(await dump())).includes(MARK),'before encrypting, the chat is readable in the browser storage (the test would otherwise prove nothing)');
 ok('baseline: plaintext present before encryption');

 // turn it on through the interface
 await openSettings('security');await page.click('.set-row:has-text("App lock") button');
 assert(!(await page.locator('#lockEncrypt').isChecked()),'encryption is offered, and not ticked by itself');
 await page.check('#lockEncrypt');
 await page.fill('#lockNew1','correct horse');await page.fill('#lockNew2','correct horse');await page.click('.app-dialog button:has-text("Lock the app")');
 await page.waitForSelector('.app-dialog:has-text("Remove the unencrypted copy")',{timeout:30000});
 let d=await dump();
 assert(text(d).includes(MARK)&&d.local.chatThreads,'until the person agrees, the old copy is still there');
 await page.click('.app-dialog button:has-text("Remove it")');
 await page.waitForFunction(()=>!localStorage.getItem('chatThreads'),null,{timeout:20000});
 ok('turned on, checked by reading back, old copy removed on request');

 // nothing readable at rest
 await closeSettings();
 await send('and this one also '+MARK);await done();
 await page.waitForTimeout(1500);
 d=await dump();
 assert(!text(d).includes(MARK),'the marker is nowhere in local storage, session storage or any IndexedDB record: '+Object.keys(d.idb).join(','));
 assert(d.local['plc.vault.v1']&&d.idb['plc-vault']?.log?.length>2,'the vault is where the data went');
 assert(!d.idb['plc-docs'],'the old document database is gone');
 assert(!Object.keys(d.session).some(k=>/chatConfig|chatEndpointTokens/.test(k)),'the provider settings are not in session storage');
 ok('no plaintext at rest');

 // a new visit asks for the passphrase
 await page.reload();
 await page.waitForSelector('#lockScreen',{state:'visible'});
 assert(await page.evaluate(()=>document.querySelector('#app').inert===true),'the app is out of reach');
 assert(!(await page.content()).includes(MARK),'nothing of the chat is in the page before unlock');
 await unlock('wrong one');
 await page.waitForFunction(()=>/not right/.test(document.querySelector('#lockScreen [role=alert]').textContent));
 assert(await page.locator('#lockScreen').isVisible(),'a wrong passphrase leaves it locked');
 await unlock('correct horse');
 await page.waitForSelector('#lockScreen',{state:'hidden'});await ready();
 await shows(MARK); // the chat is back after unlocking
 ok('unlock screen, wrong passphrase, right passphrase');

 // lock now
 await openSettings('security');await page.click('.set-row:has-text("App lock") button');
 await page.click('.app-dialog button:has-text("Lock now")');
 await page.waitForSelector('#lockScreen',{state:'visible'});
 assert(!(await page.content()).includes(MARK),'locking leaves no chat text in the page');
 await unlock('correct horse');await page.waitForSelector('#lockScreen',{state:'hidden'});await ready();
 ok('lock now forgets the key');

 // killed in the middle of a reply: what was streamed is kept
 await send('slow story');
 await page.waitForFunction(()=>/word5 /.test(document.querySelector('.message.assistant:last-of-type .message-body')?.textContent||''),null,{timeout:15000});
 await page.waitForTimeout(1200); // the page saves about every 800 ms while it streams
 await page.close({runBeforeUnload:false});
 page=await context.newPage();await page.goto(h.origin+'/');
 await page.waitForSelector('#lockScreen',{state:'visible'});await unlock('correct horse');await page.waitForSelector('#lockScreen',{state:'hidden'});await ready();
 await page.waitForFunction(()=>/word5/.test(document.querySelector('.message.assistant:last-of-type')?.textContent||''),null,{timeout:15000});
 const thread=await page.locator('.message.assistant').last().innerText();
 assert(/word0/.test(thread)&&/word5/.test(thread),'the streamed part of the reply survived the page being killed: '+thread.slice(0,80));
 ok('a page killed mid-reply keeps what was written');

 // locking while a reply is being written asks first
 const answers=await page.locator('.message.assistant').count();
 await send('slow story again');
 await page.waitForFunction(n=>document.querySelectorAll('.message.assistant').length>n&&/word3 /.test(document.querySelector('.message.assistant:last-of-type .message-body')?.textContent||''),answers,{timeout:15000}); // a NEW answer, not the earlier interrupted one
 await page.evaluate(()=>document.querySelector('#lockNowBtn').click());
 await page.waitForSelector('.app-dialog:has-text("A reply is still being written")',{timeout:10000});
 await page.click('.app-dialog button:has-text("Cancel")');
 assert(await page.locator('#lockScreen').isHidden(),'cancelling leaves it unlocked');
 await page.click('#stopGeneration');await done();
 ok('locking mid-reply asks first');

 // a second tab: it reads, says it cannot save, and the first tab keeps working
 const second=await context.newPage();
 await second.addInitScript(()=>{window.addEventListener('plc:vault-readonly',()=>{window.__ro=(window.__ro||0)+1;});});
 await second.goto(h.origin+'/');
 await second.waitForSelector('#lockScreen',{state:'visible'});await second.fill('#unlockPass','correct horse');await second.press('#unlockPass','Enter');
 await second.waitForSelector('#lockScreen',{state:'hidden'});
 await second.waitForFunction(()=>window.__plcBooted===true&&Boolean(window.plcShell),null,{timeout:20000});
 await second.fill('#messageInput','typed in the second tab');await second.click('#sendBtn');
 await second.waitForFunction(()=>window.__ro>=1,null,{timeout:20000});
 assert(await second.evaluate(()=>window.__ro)===1,'the second tab said it cannot save, once');
 const beforeSeq=await page.evaluate(async()=>{const m=await import('/releases/'+window.APP_BUILD.commit+'/chat/vault/vault-store.mjs');return m.app.vaultSession.lastSeq;});
 await second.close();
 await send('first tab still saves');await done();await page.waitForTimeout(1200);
 const afterSeq=await page.evaluate(async()=>{const m=await import('/releases/'+window.APP_BUILD.commit+'/chat/vault/vault-store.mjs');return m.app.vaultSession.lastSeq;});
 assert(afterSeq>beforeSeq,'the first tab went on writing');
 ok('a second tab is read-only and says so');

 // lock when I leave
 await openSettings('security');await page.click('.set-row:has-text("App lock") button');
 await page.locator('.app-dialog label:has-text("Lock as soon as I leave") input').check();await page.click('.app-dialog button:has-text("Save")');
 await closeSettings();
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
 await page.waitForSelector('#lockScreen',{state:'visible',timeout:15000});
 await unlock('correct horse');await page.waitForSelector('#lockScreen',{state:'hidden'});await ready();
 await openSettings('security');await page.click('.set-row:has-text("App lock") button');
 assert(/Unlocking with the passphrase took/.test(await page.locator('.app-dialog').innerText()),'the unlock time on this device is shown');
 await page.locator('.app-dialog label:has-text("Lock as soon as I leave") input').uncheck();await page.click('.app-dialog button:has-text("Save")');await closeSettings();
 ok('lock as soon as I leave, and the unlock time is shown');

 // change the passphrase
 await openSettings('security');await page.click('.set-row:has-text("App lock") button');
 await page.fill('#lockCurrent','correct horse');await page.fill('#lockNewPass','battery staple');await page.click('.app-dialog button:has-text("Change passphrase")');
 await page.waitForFunction(()=>/Passphrase changed/.test(document.body.innerText),null,{timeout:20000});
 await closeSettings();await page.reload();await page.waitForSelector('#lockScreen',{state:'visible'});
 await unlock('correct horse');await page.waitForFunction(()=>/not right/.test(document.querySelector('#lockScreen [role=alert]').textContent));
 await unlock('battery staple');await page.waitForSelector('#lockScreen',{state:'hidden'});await ready();
 ok('passphrase changed; the old one stops working');

 // turn it off
 await openSettings('security');await page.click('.set-row:has-text("App lock") button');
 await page.fill('#lockCurrent','battery staple');await page.click('.app-dialog button:has-text("Turn encryption off")');
 await page.click('.app-dialog button:has-text("Turn it off")');
 await page.waitForFunction(()=>/Encryption is off/.test(document.body.innerText),null,{timeout:30000});
 d=await dump();
 assert(d.local.chatThreads&&text(d).includes(MARK)&&!d.local['plc.vault.v1']&&!d.idb['plc-vault']?.log?.length,'everything is back in plain storage and the vault is gone');
 await page.reload();await ready();
 await shows(MARK); // and the app still shows the chat
 ok('turned off, nothing lost');
 assert(h.errors.length===0,'no page errors: '+h.errors.join(' | '));
 console.log('vault e2e: ok');
}catch(e){console.error(e);process.exitCode=1;}
finally{await h.close();}
