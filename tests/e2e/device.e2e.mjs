import {launch,assert} from './harness.mjs';
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const dir=mkdtempSync(join(tmpdir(),'plc-dev-'));
const h=await launch({port:18271});
const {page}=h;
const ok=name=>console.log('PASS',name);
const more=async(loc,action)=>{await loc.locator('[data-action="more"]').click();await page.click(`.thread-menu [data-menu-action="${action}"]`);};

const requests=async()=>(await (await fetch(`http://127.0.0.1:${h.api.port}/__requests`)).json());
const settle=async()=>{await page.waitForFunction(()=>/^(Response complete\.|The response was interrupted|Answered on this device|Earlier messages summarized|Summary)/.test(document.querySelector('#generationStatus').textContent));await page.waitForFunction(()=>!document.querySelector('#stopGeneration').offsetParent);};
const send=async text=>{await page.fill('#messageInput',text);await page.click('#sendBtn');await settle();};
const newChat=async()=>{await page.click('#newChatBtn');};
// the places a person reaches things: the profile menu, the Settings page, the rail's Explore menu
const openSettings=async section=>{if(!await page.locator('#settingsPage').isVisible()){await page.click('button[aria-label="This device menu"]');await page.click('.shell-pop-row:has-text("Settings")');}await page.click(`.settings-nav-item[data-section="${section}"]`);};
const closeSettings=async()=>{if(await page.locator('#settingsPage').isVisible())await page.click('button[aria-label="Close settings"]');};
const profileItem=async label=>{await page.click('button[aria-label="This device menu"]');await page.click(`.shell-pop-row:has-text("${label}")`);};
const importFile=async file=>{await openSettings('data');const [fc]=await Promise.all([page.waitForEvent('filechooser'),page.click('#importBtn')]);await fc.setFiles(file);};
const names=async()=>page.locator('#threadList li[data-id] .thread-name').allInnerTexts();
try{
 await page.waitForFunction(()=>!document.querySelector('#messageInput').disabled);

 // ---- context meter and summary
 await send('first topic: '+'alpha '.repeat(800));
 assert(/uses about \d+%/.test(await page.locator('#contextMeter span').first().innerText()),'meter shown');
 for(const t of ['second','third','fourth'])await send(t+' topic: '+'beta '.repeat(800));
 assert(/getting long|full/.test(await page.locator('#contextMeter span').first().innerText()),'meter warns: '+await page.locator('#contextMeter').innerText());
 await page.waitForSelector('#summarizeBtn:not([hidden])');
 const fullCount=await page.locator('.message').count();
 await page.click('#summarizeBtn');
 await page.waitForFunction(()=>/Earlier messages summarized/.test(document.querySelector('#generationStatus').textContent),null,{timeout:20000});
 assert(await page.locator('.context-divider').count()===1,'divider shown');
 assert(await page.locator('.message').count()===fullCount,'the full transcript is still on screen');
 await send('and now a follow-up');
 let sent=(await requests()).at(-1).body.messages;
 assert(/Summary of the earlier part of this conversation:\nSUMMARY-TEXT/.test(sent[0].content),'summary sent: '+JSON.stringify(sent[0]).slice(0,200));
 assert(!JSON.stringify(sent).includes('alpha alpha alpha'),'summarized messages not sent');
 assert(sent.at(-1).content==='and now a follow-up','latest exchange still live');
 assert(/uses about|getting long/.test(await page.locator('#contextMeter span').first().innerText()),'meter recovered');
 await page.click('.context-divider button');
 await page.fill('.app-dialog textarea','');await page.click('.app-dialog button:has-text("Save")');
 assert(await page.locator('.context-divider').count()===0,'summary can be cleared');
 ok('context meter and summary');

 // excluded messages leave the model's view but stay on screen
 await newChat();await send('keep this one');await send('hide this one');
 await more(page.locator('.message.user').nth(1),'toggle-context');
 await send('what did I say?');
 assert(!(await requests()).at(-1).body.messages.some(m=>m.role==='user'&&m.content==='hide this one'),'excluded message not sent');
 assert(/hide this one/.test(await page.locator('#messages').innerText()),'still shown');
 ok('choose what stays in context');

 // ---- local-mode readiness (Settings > Models, where the connection form lives)
 await openSettings('models');
 await page.click('#replyModeSeg button:has-text("On this device")');
 await page.waitForSelector('#modelReadiness li.no');
 assert(await page.locator('#modelReadiness li').count()===3&&await page.locator('#modelReadiness li.yes').count()===0,'three states, none reached');
 assert(await page.locator('#advancedModels').evaluate(d=>!d.open),'advanced controls collapsed');
 assert(await page.locator('#installedModels button:has-text("Unload")').count()===0,'nothing to free yet, so no Unload button');
 // this browser has no usable graphics card, so the small model is offered on the processor (slower), with the way to make it faster
 assert(await page.locator('#installedModels .model-row[data-state="none"] button:has-text("Download")').first().isVisible(),'download is offered: the processor can run the small model');
 assert(/processor/.test(await page.locator('#languageDetails').innerText())&&await page.locator('#languageDeviceHelp').isVisible(),'the slower processor path is explained, with what to try for speed');
 // a browser that can run neither (no WebAssembly SIMD) is told so instead of being offered a setup that cannot work
 await page.click('#replyModeSeg button:has-text("Connected provider")');
 await page.addInitScript(()=>{const v=WebAssembly.validate.bind(WebAssembly);WebAssembly.validate=()=>false;});
 await page.reload();await page.waitForSelector('#shellRail');
 await openSettings('models');
 await page.click('#replyModeSeg button:has-text("On this device")');
 await page.waitForFunction(()=>window.localModels?.supported===false);
 assert(await page.locator('#installedModels button.primary').count()===0,'controls that cannot work here are not shown');
 await closeSettings();
 await page.click('#newChatBtn');
 await page.waitForSelector('#emptyState #emptyProvider',{timeout:5000});
 assert(/cannot run|WebAssembly|graphics/i.test(await page.locator('#emptyState').innerText())&&await page.locator('#emptyProvider').isVisible(),'the empty chat explains that this browser cannot run an on-device model and offers a provider');
 await page.click('#replyModeSeg button:has-text("Connected provider")').catch(()=>{});
 ok('readiness states');

 // ---- storage and backups
 await openSettings('data');await page.click('.set-row:has-text("Storage & backups") button');
 const text=await page.locator('.app-dialog').innerText();
 assert(/Conversations/.test(text)&&/Browser storage/.test(text)&&/Last backup/.test(text)&&/Never/.test(text),'storage screen content: '+text.slice(0,300));
 await page.click('.app-dialog button:has-text("Back up chats")');await page.waitForSelector('#exportChatsBtn');
 assert(/Transfer chats and backups/.test(await page.locator('.app-dialog h2').innerText())&&/Anyone able to open the file can read its included content/.test(await page.locator('.app-dialog').innerText())&&/Provider settings: Not included/.test(await page.locator('.app-dialog').innerText()),'the export is reviewed first, with its real scope');
 const [dl]=await Promise.all([page.waitForEvent('download'),page.click('#exportChatsBtn')]);
 assert(/chat-history\.json$/.test(dl.suggestedFilename()),'plain backup downloaded');
 await page.keyboard.press('Escape');await page.click('.set-row:has-text("Storage & backups") button');
 await page.waitForFunction(()=>!/Never/.test(document.querySelector('.app-dialog')?.innerText||''));
 await page.click('.app-dialog button:has-text("Done")');await closeSettings();
 assert(await page.locator('#backupNudge').isHidden(),'no nudge after a backup');
 ok('storage screen and backup');

 // ---- encrypted backup round trip
 await profileItem('Memory & preferences');
 await page.fill('.app-dialog input[aria-label="New memory"]','my favourite colour is green');await page.click('.app-dialog button:has-text("Add")');await page.click('.app-dialog button:has-text("Done")');
 const before=await names();
 await openSettings('data');await page.click('.set-row:has-text("Storage & backups") button');await page.click('.app-dialog button:has-text("Protected backup")');
 await page.waitForSelector('#createBackupBtn');
 assert(/protected with your chosen password. Keep the password available for restoration/.test(await page.locator('.app-dialog').innerText()),'the backup review says what it holds and how it is protected');
 await page.fill('#bkPass1','short');await page.fill('#bkPass2','short');await page.click('#createBackupBtn');
 assert(/at least 8/.test(await page.locator('.app-dialog [role=alert]').innerText()),'weak passphrase refused');
 await page.fill('#bkPass1','correct horse battery');await page.fill('#bkPass2','different');await page.click('#createBackupBtn');
 assert(/do not match/.test(await page.locator('.app-dialog [role=alert]').innerText()),'mismatch refused');
 await page.fill('#bkPass2','correct horse battery');
 const [enc]=await Promise.all([page.waitForEvent('download'),page.click('#createBackupBtn')]);
 const file=join(dir,'backup.encrypted.json');await enc.saveAs(file);
 const raw=readFileSync(file,'utf8');
 assert(!raw.includes('hide this one')&&!raw.includes('green')&&JSON.parse(raw).format==='plc-encrypted-backup/1','backup file is ciphertext');
 // wipe everything and restore
 await page.evaluate(async()=>{localStorage.clear();await new Promise(r=>{const q=indexedDB.deleteDatabase('plc-docs');q.onsuccess=q.onerror=q.onblocked=()=>r();});});
 await page.reload();await page.waitForSelector('#messageInput');await page.waitForFunction(()=>!document.querySelector('#messageInput').disabled);
 assert(!(await page.evaluate(()=>localStorage.getItem('plc.memory.v1')||'')).includes('green'),'wiped');
 await importFile(file);
 await page.waitForSelector('.app-dialog input[type=text]');
 await page.fill('.app-dialog input[type=text]','wrong passphrase');await page.click('.app-dialog button:has-text("Unlock backup")');
 await page.waitForFunction(()=>/did not unlock/.test(document.querySelector('#toast').textContent));
 await page.waitForSelector('.app-dialog input[type=text]');
 await page.fill('.app-dialog input[type=text]','correct horse battery');await page.click('.app-dialog button:has-text("Unlock backup")');
 await page.waitForSelector('#importSummary');
 assert(await page.locator('#importExtras').isChecked(),'settings restore offered');
 await page.click('.app-dialog button:has-text("Import")');
 await page.waitForFunction(()=>[...document.querySelectorAll('#threadList .thread-name')].length>=3);
 const after=await names();
 assert(before.filter(n=>!/New chat/i.test(n)).every(n=>after.includes(n)),'chats restored: '+JSON.stringify({before,after}));
 await page.waitForFunction(()=>(localStorage.getItem('plc.memory.v1')||'').includes('green'));
 ok('encrypted backup round trip');

 // ---- app lock
 await openSettings('security');await page.click('.set-row:has-text("App lock") button');
 await page.uncheck('#lockEncrypt');await page.click('.app-dialog button:has-text("Lock the app")');
 assert(/Type a passphrase/.test(await page.locator('.app-dialog [role=alert]').innerText()),'an empty passphrase is refused');
 await page.fill('#lockNew1','one');await page.fill('#lockNew2','two');await page.uncheck('#lockEncrypt');await page.click('.app-dialog button:has-text("Lock the app")');
 assert(/do not match/.test(await page.locator('.app-dialog [role=alert]').innerText()),'a mismatch is refused');
 // any passphrase is allowed, even a single character
 await page.fill('#lockNew1','x');await page.fill('#lockNew2','x');await page.uncheck('#lockEncrypt');await page.click('.app-dialog button:has-text("Lock the app")');
 await page.waitForSelector('#lockScreen',{state:'visible'});
 assert(await page.locator('#lockScreen .padlock.closed').count()===1&&/Passcode set/.test(await page.locator('#lockScreen').innerText()),'it locks at once and shows the closed padlock');
 await page.fill('#unlockPass','x');await page.press('#unlockPass','Enter');await page.waitForSelector('#lockScreen',{state:'hidden'});
 // a longer one for the rest of the test
 await closeSettings();await page.click('#lockNowBtn');await page.fill('#unlockPass','x');await page.press('#unlockPass','Enter');await page.waitForSelector('#lockScreen',{state:'hidden'});
 await openSettings('security');await page.click('.set-row:has-text("App lock") button');
 await page.fill('#lockCurrent','x');await page.click('.app-dialog button:has-text("Turn lock off")');await page.waitForFunction(()=>!localStorage.getItem('plc.lock.v1'));
 await page.click('.set-row:has-text("App lock") button');
 await page.fill('#lockNew1','open sesame');await page.fill('#lockNew2','open sesame');await page.uncheck('#lockEncrypt');await page.click('.app-dialog button:has-text("Lock the app")');
 await page.waitForSelector('#lockScreen',{state:'visible'});await page.fill('#unlockPass','open sesame');await page.press('#unlockPass','Enter');await page.waitForSelector('#lockScreen',{state:'hidden'});
 await page.waitForSelector('#lockNowBtn');
 assert(!(await page.evaluate(()=>localStorage.getItem('plc.lock.v1'))).includes('open sesame'),'passphrase not stored');
 await closeSettings();await page.click('#lockNowBtn');
 assert(await page.locator('#lockScreen').isVisible()&&await page.evaluate(()=>document.querySelector('#app').inert===true),'locked and inert');
 await page.fill('#unlockPass','nope');await page.press('#unlockPass','Enter');
 await page.waitForFunction(()=>/not right/.test(document.querySelector('#lockScreen').innerText));
 await page.fill('#unlockPass','open sesame');await page.press('#unlockPass','Enter');
 await page.waitForSelector('#lockScreen',{state:'hidden'});
 await page.reload();
 await page.waitForSelector('#lockScreen',{state:'visible'});assert(await page.evaluate(()=>document.documentElement.classList.contains('locked')&&document.querySelector('#app').inert===true),'locked again after a reload, with the app out of reach');
 assert(await page.evaluate(()=>getComputedStyle(document.querySelector('#app')).visibility==='hidden'),'chats not visible while locked');
 await page.fill('#unlockPass','open sesame');await page.press('#unlockPass','Enter');
 await page.waitForSelector('#lockScreen',{state:'hidden'});
 // forgot the passphrase: erase and start over
 await page.click('#lockNowBtn');
 await page.click('#lockScreen button:has-text("Forgot")');
 await page.click('.app-dialog button:has-text("Erase everything")');
 // erasing reloads the page: wait for that to finish (the old page can still answer for a moment) instead of racing it
 await page.waitForFunction(()=>!localStorage.getItem('plc.lock.v1'),null,{timeout:15000}).catch(()=>{});
 await page.waitForSelector('#lockScreen',{state:'hidden',timeout:15000}).catch(()=>{}); // the old page answers until the reload lands
 await page.waitForSelector('#messageInput');await page.waitForFunction(()=>!document.querySelector('#messageInput').disabled);
 {const st={hidden:await page.locator('#lockScreen').isHidden(),key:await page.evaluate(()=>localStorage.getItem('plc.lock.v1'))};assert(st.hidden&&!st.key,'lock removed by erasing: '+JSON.stringify(st).slice(0,200));}
 assert((await names()).every(n=>/New chat|^$/i.test(n)),'chats erased: '+JSON.stringify(await names()));
 ok('app lock');

 const unexpected=h.errors.filter(e=>!/API responded with status 500|network error/.test(e));
 assert(unexpected.length===0,'no unexpected page errors: '+JSON.stringify(unexpected));
 console.log('ALL PASS');
}catch(e){console.error(e.message);console.error(await page.locator('body').innerText().then(t=>t.slice(0,800)).catch(()=>''));console.error(h.errors);process.exitCode=1;}
finally{await h.close();}
