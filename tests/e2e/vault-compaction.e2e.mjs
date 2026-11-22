// SPDX-License-Identifier: AGPL-3.0-only
// Deleting a chat permanently, with the encrypted vault on, really removes its sealed key record from the stored vault soon after (docs/VAULT-COMPACTION-ON-DELETE.md).
// Real browser, real IndexedDB: two chats, one deleted forever; the stored log must shrink, the pending marker must clear, the other chat must survive a reload and unlock.
//   node scripts/e2e.mjs vault-compaction
import {launch,assert} from './harness.mjs';
const ok=n=>console.log('PASS '+n);
const h=await launch({port:18431});
const {page}=h;
const send=async text=>{await page.fill('#messageInput',text);await page.click('#sendBtn');await page.waitForFunction(()=>/^(Response complete\.|The response was interrupted)/.test(document.querySelector('#generationStatus').textContent),null,{timeout:30000});await page.waitForFunction(()=>!document.querySelector('#stopBtn')||document.querySelector('#stopBtn').hidden||document.querySelector('#stopBtn').disabled,null,{timeout:30000}).catch(()=>{});};
const openSettings=async section=>{if(!await page.locator('#settingsPage').isVisible()){await page.click('button[aria-label="This device menu"]');await page.click('.shell-pop-row:has-text("Settings")');}await page.click(`.settings-nav-item[data-section="${section}"]`);};
const closeSettings=async()=>{if(await page.locator('#settingsPage').isVisible())await page.click('button[aria-label="Close settings"]');};
const ready=async()=>{await page.waitForSelector('#messageInput');await page.waitForFunction(()=>window.__plcBooted===true&&Boolean(window.plcShell),null,{timeout:20000});};
const names=async()=>page.locator('#threadList li[data-id] .thread-name').allInnerTexts();
const menu=async(title,item)=>{await page.locator('#threadList li[data-id]').filter({hasText:title}).locator('.thread-menu-btn').click();await page.locator('.thread-menu button',{hasText:item}).click();};
const logLength=()=>page.evaluate(async()=>{const db=await new Promise((res,rej)=>{const r=indexedDB.open('plc-vault');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});try{return await new Promise((res,rej)=>{const r=db.transaction('log').objectStore('log').count();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}finally{db.close();}});
const marker=()=>page.evaluate(()=>localStorage.getItem('plc.vaultCompaction.v1'));
try{
 await ready();
 await page.click('#newChatBtn');await send('KEEP-THIS-CHAT hello');
 await page.click('#newChatBtn');await send('DELETE-THIS-CHAT hello');
 await openSettings('security');await page.click('.set-row:has-text("App lock") button');
 await page.check('#lockEncrypt');
 await page.fill('#lockNew1','correct horse');await page.fill('#lockNew2','correct horse');await page.click('.app-dialog button:has-text("Lock the app")');
 await page.waitForSelector('.app-dialog:has-text("Remove the unencrypted copy")',{timeout:30000});
 await page.click('.app-dialog button:has-text("Remove it")');
 await page.waitForFunction(()=>!localStorage.getItem('chatThreads'),null,{timeout:20000});
 await closeSettings();
 await page.waitForTimeout(1500);
 const before=await logLength();
 assert(before>2,'the vault holds the data: '+before+' log records');
 assert(await marker()===null,'no compaction is pending before a delete');
 ok('vault on, two chats stored');

 // delete the second chat: to Trash, then forever
 await menu('DELETE-THIS-CHAT','Delete');
 await openSettings('data');await page.click('.set-row:has-text("Recently deleted") button');
 await menu('DELETE-THIS-CHAT','Delete permanently');
 await page.click('.app-dialog button:has-text("Delete permanently")');
 await page.waitForFunction(()=>![...document.querySelectorAll('#threadList li[data-id] .thread-name')].some(n=>n.textContent.includes('DELETE-THIS-CHAT')),null,{timeout:15000}).catch(async()=>{throw new Error('E2E assertion failed: still listed after Delete permanently: '+JSON.stringify(await names())+' dialog='+await page.locator('.app-dialog').count());});
 const early=await marker();
 ok('deleted forever'+(early?' (marker set at once)':' (marker already cleared)'));

 // the vault compacts by itself: the pending marker clears and the stored log shrinks
 await page.waitForFunction(()=>localStorage.getItem('plc.vaultCompaction.v1')===null,null,{timeout:60000});
 await page.waitForTimeout(500);
 const after=await logLength();
 assert(after<before,'the stored log shrank after the delete and compaction: '+before+' -> '+after);
 ok('the compaction ran: marker cleared, log '+before+' -> '+after);

 // the other chat is untouched, also after a reload and an unlock
 await page.reload();
 await page.waitForSelector('#lockScreen',{state:'visible'});
 await page.fill('#unlockPass','correct horse');await page.press('#unlockPass','Enter');
 await page.waitForSelector('#lockScreen',{state:'hidden'});await ready();
 await page.click('.thread-filter button[data-view="active"]').catch(()=>{});
 await page.waitForFunction(()=>[...document.querySelectorAll('#threadList li[data-id] .thread-name')].some(n=>n.textContent.includes('KEEP-THIS-CHAT')),null,{timeout:15000});
 assert(!(await names()).some(n=>n.includes('DELETE-THIS-CHAT')),'the deleted chat does not come back');
 ok('the kept chat survives, the deleted one stays gone');
 assert(h.errors.length===0,'no page errors: '+h.errors.join(' | '));
 console.log('vault-compaction e2e: ok');
}catch(e){console.error(e);process.exitCode=1;}
finally{await h.close();}
