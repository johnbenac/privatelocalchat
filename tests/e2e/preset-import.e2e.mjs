// Importing a preset candidate (docs/PRESET-IMPORT.md), end to end, with the producer's real output (tests/fixtures/presets/): a file and a link are only REVIEWED until the person
// presses Add; Add makes a new preset; it is chosen in a chat by hand and survives a reload; equal names and repeats need an explicit answer; bad, oversized, richer and credential-bearing
// input changes nothing; unreadable or malformed saved presets, and a browser without Web Locks, disable adding and leave the stored bytes alone; nothing is fetched and no model is asked;
// the same holds with the encrypted vault on, locked and unlocked.
// The browser profile is a new folder under PLC_E2E_PROFILE_ROOT (default: the system temporary folder); E2E_PORT_OFFSET moves the port (base 18461).
//   node scripts/e2e.mjs preset-import
import {readFileSync} from 'node:fs';
import {launch,assert} from './harness.mjs';
import {newProfileDir} from './profile-root.mjs';
import {encodePresetFragment,PRESET_LIMITS} from '../../chat/assistant/preset-candidate.mjs';
const ok=n=>console.log('PASS '+n);
const fixture=n=>readFileSync(new URL('../fixtures/presets/'+n+'.plc-preset-candidate.json',import.meta.url),'utf8');
const minimalText=fixture('emma-minimal'),richText=fixture('emma-rich');
const minimal=JSON.parse(minimalText),rich=JSON.parse(richText);
const h=await launch({port:18461,profileDir:newProfileDir('preset-import')});
const {context}=h;let page=h.page;
const origin=h.origin;
const outside=[];context.on('request',r=>{const u=new URL(r.url());if(u.origin!==origin&&!/^(data|blob|about):/.test(r.url()))outside.push(r.method()+' '+r.url());});
const ready=async(p=page)=>{await p.waitForSelector('#messageInput');await p.waitForFunction(()=>window.__plcBooted===true&&Boolean(window.plcShell),null,{timeout:20000});await p.waitForFunction(()=>!document.querySelector('#messageInput').disabled);};
const stored=(p=page)=>p.evaluate(()=>localStorage.getItem('plc.presets.v1'));
const storedList=async()=>JSON.parse(await stored()||'[]');
const openInstructions=async(p=page)=>{if(!await p.locator('#systemPromptInput').isVisible()){await p.click('#shellPlus');await p.click('.shell-pop .shell-pop-row:has-text("Instructions for this chat")');}await p.waitForSelector('#importPresetBtn',{state:'visible'});};
const chooseFile=async(name,content,p=page)=>{const [chooser]=await Promise.all([p.waitForEvent('filechooser'),p.click('#importPresetBtn')]);await chooser.setFiles({name,mimeType:'application/json',buffer:Buffer.from(content)});};
const review=(p=page)=>p.locator('.app-dialog:has-text("Review preset")');
const dismissAlert=async()=>{await page.click('.app-dialog button:has-text("OK")');await page.waitForFunction(()=>!document.querySelector('.app-dialog'));};
const refused=async(label,name,content,pattern)=>{
 const before=await stored();await chooseFile(name,content);
 await page.waitForSelector('.app-dialog:has-text("Preset not added")');
 assert(pattern.test(await page.locator('.app-dialog').innerText()),label+': message '+await page.locator('.app-dialog').innerText());
 assert(await review().count()===0,label+': no review box is offered');
 await dismissAlert();assert(await stored()===before,label+': stored presets are byte-for-byte unchanged');
};
const requestsToModel=()=>fetch(`http://127.0.0.1:${h.api.port}/__requests`).then(r=>r.json());
const dump=()=>page.evaluate(async()=>{const out={local:{},session:{},idb:{}};for(let i=0;i<localStorage.length;i++)out.local[localStorage.key(i)]=localStorage.getItem(localStorage.key(i));
 for(let i=0;i<sessionStorage.length;i++)out.session[sessionStorage.key(i)]=sessionStorage.getItem(sessionStorage.key(i));
 for(const {name} of await indexedDB.databases()){const db=await new Promise((res,rej)=>{const r=indexedDB.open(name);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});out.idb[name]={};
  for(const store of [...db.objectStoreNames])out.idb[name][store]=await new Promise((res,rej)=>{const r=db.transaction(store).objectStore(store).getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});db.close();}return out;});
const openSettings=async section=>{if(!await page.locator('#settingsPage').isVisible()){await page.click('button[aria-label="This device menu"]');await page.click('.shell-pop-row:has-text("Settings")');}await page.click(`.settings-nav-item[data-section="${section}"]`);};
const closeSettings=async()=>{if(await page.locator('#settingsPage').isVisible())await page.click('button[aria-label="Close settings"]');};
const unlock=async pass=>{await page.fill('#unlockPass',pass);await page.press('#unlockPass','Enter');};
const addDisabledWith=async(p,pattern,label)=>{
 await review(p).waitFor();
 await p.waitForFunction(()=>/./.test(document.querySelector('.preset-review-status')?.textContent||''));
 assert(pattern.test(await p.locator('.preset-review-status').innerText()),label+': the reason is shown: '+await p.locator('.preset-review-status').innerText());
 assert(await p.locator('.app-dialog .dialog-actions .primary').isDisabled(),label+': adding is disabled');
};
try{
 await ready();
 const modelBefore=(await requestsToModel()).length;
 await page.click('#newChatBtn');await openInstructions();
 assert(await stored()===null,'no custom presets to start with');

 // 1. a file: reviewed, cancelled (nothing written), reviewed again, added
 await chooseFile('emma.plc-preset-candidate.json',minimalText);
 await review().waitFor();
 assert(await page.inputValue('#presetReviewName')===minimal.name,'the name is shown');
 assert(await page.inputValue('#presetReviewText')===minimal.prompt,'the instructions are shown exactly as the producer wrote them');
 assert(await page.locator('#presetReviewText').evaluate(n=>n.readOnly),'the instructions cannot be edited in the review');
 assert(/not applied to any chat|Nothing has been added yet/.test(await review().innerText()),'it says nothing has been added');
 assert(await stored()===null,'reviewing writes nothing');
 await page.click('.app-dialog button:has-text("Cancel")');
 assert(await review().count()===0&&await stored()===null,'cancel closes the review and writes nothing');
 await chooseFile('emma.plc-preset-candidate.json',minimalText);await review().waitFor();
 assert(await page.inputValue('#presetSelect')==='','importing does not apply anything to the open chat');
 await page.click('.app-dialog button:has-text("Add preset")');
 await page.waitForFunction(()=>!document.querySelector('.app-dialog'));
 let list=await storedList();
 assert(list.length===1&&list[0].name==='Emma'&&list[0].prompt===minimal.prompt,'one new preset with the exact instructions');
 assert(list[0].id!==minimal.id&&/^preset-/.test(list[0].id),'it has a fresh local id; the producer\'s id is not used: '+list[0].id);
 assert(Object.keys(list[0]).sort().join()==='id,name,prompt','stored in the existing preset format');
 assert(await page.inputValue('#presetSelect')==='','the open chat is still without a preset after adding');
 assert((await page.locator('#presetSelect option').allInnerTexts()).includes('Emma'),'the new preset is offered in the chat\'s preset list');
 ok('file: reviewed, cancel writes nothing, Add makes one fresh preset and applies it to nothing');

 // 2. chosen in a chat by hand, exact after a whole reload
 await page.selectOption('#presetSelect',{label:'Emma'});
 assert(await page.inputValue('#systemPromptInput')===minimal.prompt,'choosing it fills the chat\'s instructions exactly');
 await page.reload();await ready();await openInstructions();
 assert(await page.inputValue('#systemPromptInput')===minimal.prompt,'the exact instructions are still there after a reload');
 assert(await page.inputValue('#presetSelect')===list[0].id,'and the preset is still the one chosen');
 assert((await storedList())[0].prompt===minimal.prompt,'stored instructions equal the producer\'s prompt after the reload');
 ok('selected in a chat; exact instructions after reload');

 // 3. equal names and repeats: explicit answer, never a silent replace
 await page.click('#newChatBtn');await openInstructions();
 await chooseFile('emma-rich.json',richText);await review().waitFor();
 assert(/already have a preset called “Emma”/.test(await review().innerText()),'an equal name is called out');
 assert((await page.locator('.app-dialog .dialog-actions .primary').innerText())==='Keep as a separate preset','the explicit answer is the button');
 await page.click('.app-dialog button:has-text("Cancel")');assert((await storedList()).length===1,'cancel leaves one preset');
 await chooseFile('emma-rich.json',richText);await review().waitFor();
 await page.click('.app-dialog button:has-text("Keep as a separate preset")');await page.waitForFunction(()=>!document.querySelector('.app-dialog'));
 list=await storedList();
 assert(list.length===2&&list[0].prompt===minimal.prompt&&list[1].prompt===rich.prompt&&list[0].id!==list[1].id,'both kept; the first was not replaced');
 await chooseFile('again.json',minimalText);await review().waitFor();
 assert(/same instructions/.test(await review().innerText()),'importing the very same candidate again says so');
 await page.click('.app-dialog button:has-text("Cancel")');assert((await storedList()).length===2,'the repeat is not added unless asked');
 await chooseFile('again.json',minimalText);await review().waitFor();
 await page.fill('#presetReviewName','Emma (copy)');
 assert((await page.locator('.app-dialog .dialog-actions .primary').innerText())==='Add preset','a new name clears the collision');
 await page.click('.app-dialog button:has-text("Add preset")');await page.waitForFunction(()=>!document.querySelector('.app-dialog'));
 assert((await storedList()).length===3&&(await storedList())[2].name==='Emma (copy)','the renamed copy was added');
 await openInstructions();
 const dblBefore=(await storedList()).length;
 await chooseFile('double.json',JSON.stringify({name:'Twice',prompt:'Say it once.'}));await review().waitFor();
 await page.locator('.app-dialog button:has-text("Add preset")').dblclick();await page.waitForFunction(()=>!document.querySelector('.app-dialog'));
 assert((await storedList()).length===dblBefore+1,'a double click adds one preset, not two');
 ok('equal names, repeats, cancel and double click: explicit, nothing replaced');

 // 4. bad, oversized and richer input changes nothing
 const keep=JSON.stringify(await storedList());
 await refused('malformed','x.json','{"name":',/not a preset file|valid JSON/i);
 await refused('empty','x.json','',/not a preset file|valid JSON/i);
 await refused('not an object','x.json','[1,2]',/not a preset/i);
 await refused('missing instructions','x.json',JSON.stringify({name:'A'}),/needs a name and instructions/i);
 await refused('oversized',  'big.json',JSON.stringify({name:'Big',prompt:'x'.repeat(PRESET_LIMITS.fileBytes)}),/too large/i);
 await refused('long instructions','long.json',JSON.stringify({name:'Long',prompt:'x'.repeat(PRESET_LIMITS.promptChars+1)}),/longer than/i);
 await refused('rich package','bundle.json',JSON.stringify({schema:'cosmogenitor/bundle',records:[],name:'Emma',prompt:'x'}),/backup or a richer character package/i);
 await refused('a backup','backup.json',JSON.stringify({format:'plc-backup/1',threads:[],presets:[{name:'N',prompt:'p'}]}),/backup or a richer character package/i);
 await refused('unknown field','extra.json',JSON.stringify({...minimal,mood:'wry'}),/fields this version does not understand/i);
 await refused('credential','cred.json',JSON.stringify({...minimal,apiKey:'sk-test-should-never-be-shown'}),/key, token or address/i);
 assert(!(await page.content()).includes('sk-test-should-never-be-shown'),'a refused secret is not drawn on the page');
 assert(JSON.stringify(await storedList())===keep,'after every refusal the presets are exactly as before');
 ok('malformed, oversized, richer and credential-bearing files are refused without any change');

 // 5. a link: review only; adding is a click; the address is cleaned; a reload offers nothing
 const link=encodePresetFragment({id:rich.id,name:'From a link',prompt:rich.prompt});
 const beforeLink=JSON.stringify(await storedList());
 await page.goto(origin+'/version.json');await page.goto(origin+'/'+link);await ready();
 await review().waitFor({timeout:10000});
 assert(await page.inputValue('#presetReviewName')==='From a link'&&await page.inputValue('#presetReviewText')===rich.prompt,'the link\'s name and exact instructions are shown for review');
 assert(await page.evaluate(()=>location.hash)===link,'the app does not rewrite its own address (the link stays as it was opened)');
 await page.waitForTimeout(800);assert(JSON.stringify(await storedList())===beforeLink,'opening the link added nothing by itself');
 await page.reload();await ready();await review().waitFor({timeout:10000});await page.waitForTimeout(500);assert(JSON.stringify(await storedList())===beforeLink,'a reload shows the same review again and still adds nothing');
 await page.goto(origin+'/version.json');await page.goto(origin+'/'+link);await ready();await review().waitFor();
 await page.click('.app-dialog button:has-text("Add preset")');await page.waitForFunction(()=>!document.querySelector('.app-dialog'));
 assert((await storedList()).some(p=>p.name==='From a link'&&p.prompt===rich.prompt),'added by the click');
 const hugeUnrelated='#x='+'a'.repeat(1000000)+'&preset=e30';
 for(const [label,hash,pattern] of [['not decodable','#preset=%%%',/does not carry a readable preset/],['not json','#preset='+Buffer.from('hello').toString('base64url'),/not valid JSON/],
  ['oversized value','#preset='+'A'.repeat(PRESET_LIMITS.fragmentChars+1),/too long/],['a million unrelated characters around a tiny preset',hugeUnrelated,/too long/],
  ['a credential','#preset='+Buffer.from(JSON.stringify({...minimal,token:'t'})).toString('base64url'),/key, token or address/]]){
  const before=await stored();await page.goto(origin+'/version.json');await page.goto(origin+'/'+hash);await ready();
  await page.waitForSelector('.app-dialog:has-text("Preset not added")');assert(await review().count()===0,label+': no review box');
  assert(pattern.test(await page.locator('.app-dialog').innerText()),label+': says '+await page.locator('.app-dialog').innerText());
  await dismissAlert();assert(await stored()===before,label+': link refused, nothing changed');
 }
 // an ordinary long fragment that names no preset is somebody else's: no dialog, no refusal
 await page.goto(origin+'/version.json');await page.goto(origin+'/#x='+'a'.repeat(50000));await ready();await page.waitForTimeout(500);
 assert(await page.locator('.app-dialog').count()===0,'a long fragment without a preset is left alone');
 ok('link: opens a review only, leaves the address alone, adds on click; bad and oversized links refused before any decoding');

 // 6. nothing was fetched and no model was asked
 assert(outside.length===0,'no request left the origin: '+outside.join(', '));
 assert((await requestsToModel()).length===modelBefore,'no request reached the model server during any import');
 ok('no network or model side effects');

 // 7. the preset is used by a chat like any other: exactly its instructions go to the model when the person sends
 await page.click('#newChatBtn');await openInstructions();
 await page.selectOption('#presetSelect',{label:'From a link'});
 await page.fill('#messageInput','hello');await page.click('#sendBtn');
 await page.waitForFunction(()=>/^Response complete\./.test(document.querySelector('#generationStatus').textContent),null,{timeout:20000});
 const sent=(await requestsToModel()).at(-1).body.messages;
 assert(sent[0].role==='system'&&sent[0].content.includes(rich.prompt),'the reviewed instructions are what the chat sends as its system prompt');
 ok('the imported preset is used as written');

 // 8. saved presets that cannot be read: the review says why, adding is disabled, the stored bytes stay exactly as they were
 const good=await stored();
 const MALFORMED='{"presets": not a list';
 await page.evaluate(v=>localStorage.setItem('plc.presets.v1',v),MALFORMED);
 await page.reload();await ready();await openInstructions();
 await chooseFile('emma.json',minimalText);
 await addDisabledWith(page,/not in a form this version can read/,'malformed saved presets');
 assert(await stored()===MALFORMED,'malformed saved presets are untouched by the review');
 await page.click('.app-dialog button:has-text("Cancel")');
 await page.fill('#systemPromptInput','Some instructions.');await page.click('#savePresetBtn');await page.fill('.app-dialog input','Blocked');await page.click('.app-dialog button:has-text("Save preset")');
 await page.waitForFunction(()=>/not in a form this version can read/.test(document.querySelector('#toast, .toast, [role=status]')?.textContent||document.body.innerText));
 assert(await stored()===MALFORMED,'a manual Save as preset does not overwrite malformed saved presets either');
 await page.evaluate(v=>localStorage.setItem('plc.presets.v1',v),good);await page.reload();await ready();await openInstructions();
 // storage that throws when read: the page is running, then the browser starts refusing the read
 await page.evaluate(()=>{const get=Storage.prototype.getItem;window.__realGet=get;Storage.prototype.getItem=function(k){if(k==='plc.presets.v1')throw new DOMException('denied','SecurityError');return get.call(this,k);};});
 await chooseFile('emma.json',minimalText);
 await addDisabledWith(page,/could not be read/,'a storage read error');
 await page.click('.app-dialog button:has-text("Cancel")');
 await page.evaluate(()=>{Storage.prototype.getItem=window.__realGet;});
 assert(await stored()===good,'after unreadable or malformed saved presets the stored bytes are exactly what they were');
 assert(h.errors.length===0,'the review of unreadable presets raised no page error: '+h.errors.join(' | '));
 ok('unreadable and malformed saved presets: explained, adding disabled, stored bytes preserved, no crash');

 // 9. a browser without Web Locks cannot make safe cross-tab changes: use is unchanged, every change says so and writes nothing
 const noLocks=await context.newPage();
 await noLocks.addInitScript(()=>{Object.defineProperty(Navigator.prototype,'locks',{get(){return undefined;},configurable:true});});
 await noLocks.goto(origin+'/');await ready(noLocks);await openInstructions(noLocks);
 assert(await noLocks.evaluate(()=>navigator.locks)===undefined,'this tab really has no Web Locks');
 assert((await noLocks.locator('#presetSelect option').allInnerTexts()).includes('Emma'),'saved presets are still shown and usable without Web Locks');
 await chooseFile('emma.json',minimalText,noLocks);
 await addDisabledWith(noLocks,/Web Locks/,'no Web Locks');
 await noLocks.click('.app-dialog button:has-text("Cancel")');
 await noLocks.fill('#systemPromptInput','More instructions.');await noLocks.click('#savePresetBtn');await noLocks.fill('.app-dialog input','Unsafe');await noLocks.click('.app-dialog button:has-text("Save preset")');
 await noLocks.waitForFunction(()=>/Web Locks/.test(document.body.innerText));
 assert(await stored()===good,'no preset change was written by the tab without Web Locks');
 await noLocks.close();
 ok('no Web Locks: presets usable, every change refused with the reason, nothing written');

 // 10. with the encrypted vault: import while unlocked, nothing readable at rest, locked and unlocked, reload
 await openSettings('security');await page.click('.set-row:has-text("App lock") button');
 await page.check('#lockEncrypt');await page.fill('#lockNew1','correct horse');await page.fill('#lockNew2','correct horse');await page.click('.app-dialog button:has-text("Lock the app")');
 await page.waitForSelector('.app-dialog:has-text("Remove the unencrypted copy")',{timeout:30000});await page.click('.app-dialog button:has-text("Remove it")');
 await page.waitForFunction(()=>!localStorage.getItem('chatThreads')&&!localStorage.getItem('plc.presets.v1'),null,{timeout:20000});await closeSettings();
 const VAULT_TEXT='Vaulted marker instructions ZEBRA-5531.';
 await page.click('#newChatBtn');await openInstructions();
 await chooseFile('vaulted.json',JSON.stringify({id:'x',name:'Vaulted preset',prompt:VAULT_TEXT}));await review().waitFor();
 assert(await stored()===null,'the review writes nothing with the vault on either');
 await page.click('.app-dialog button:has-text("Add preset")');await page.waitForFunction(()=>!document.querySelector('.app-dialog'));
 assert((await page.locator('#presetSelect option').allInnerTexts()).includes('Vaulted preset'),'added with the vault on');
 await page.waitForTimeout(1500);
 let d=await dump();assert(!JSON.stringify(d).includes('ZEBRA-5531')&&!d.local['plc.presets.v1'],'the new preset is nowhere readable at rest');
 await page.selectOption('#presetSelect',{label:'Vaulted preset'});
 await openSettings('security');await page.click('.set-row:has-text("App lock") button');await page.click('.app-dialog button:has-text("Lock now")');
 await page.waitForSelector('#lockScreen',{state:'visible'});assert(!(await page.content()).includes('ZEBRA-5531'),'locked: the instructions are not in the page');
 await unlock('correct horse');await page.waitForSelector('#lockScreen',{state:'hidden'});await ready();
 await page.reload();await page.waitForSelector('#lockScreen',{state:'visible'});assert(!(await page.content()).includes('ZEBRA-5531'),'a fresh visit is locked first');
 await unlock('correct horse');await page.waitForSelector('#lockScreen',{state:'hidden'});await ready();await openInstructions();
 assert((await page.locator('#presetSelect option').allInnerTexts()).includes('Vaulted preset'),'the preset is back after unlocking and reloading');
 assert(await page.inputValue('#systemPromptInput')===VAULT_TEXT,'the chat still holds the exact instructions');
 ok('vault: add, nothing readable at rest, lock, unlock, reload');

 // 11. a second tab holds the vault read-only: an import there is refused and changes nothing
 const second=await context.newPage();await second.goto(origin+'/');
 await second.waitForSelector('#lockScreen',{state:'visible'});await second.fill('#unlockPass','correct horse');await second.press('#unlockPass','Enter');
 await second.waitForSelector('#lockScreen',{state:'hidden'});await second.waitForFunction(()=>window.__plcBooted===true&&Boolean(window.plcShell),null,{timeout:20000});
 await second.waitForFunction(()=>!document.querySelector('#messageInput').disabled).catch(()=>{});
 await second.click('#shellPlus');await second.click('.shell-pop .shell-pop-row:has-text("Instructions for this chat")');
 await chooseFile('ro.json',JSON.stringify({name:'Read only try',prompt:'p'}),second);
 await addDisabledWith(second,/open in another tab/,'read-only vault tab');
 assert(await second.locator('#presetSelect option:has-text("Read only try")').count()===0,'nothing was added in the read-only tab');
 await second.close();
 ok('a read-only vault tab refuses to import and says why');

 assert(h.errors.length===0,'no page errors: '+h.errors.join(' | '));
 console.log('preset-import e2e: ok');
}catch(e){console.error(e);console.error(await page.locator('.app-dialog').innerText().catch(()=>''));process.exitCode=1;}
finally{await h.close();}
