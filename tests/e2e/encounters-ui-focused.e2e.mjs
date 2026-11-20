// T418 focused UI corrections, driven the way a person does it in real Chromium on the built app (visible controls only): a send held at the app's own Web Lock while the person
// replaces / appends to the composer, refused saves (browser-side storage failure or no Web Locks) that must not dispatch, lose typing or lose attachments, the ordinary
// conversation at the safe maximum event position (durable text once, truthful attribution warning, nothing restored or resent), Move project / Delete project with real names, instructions
// and unknown fields, and version selection / context toggle rollback.
// SCOPE, said once: the answering model is the suite's fake OpenAI-compatible provider (tests/e2e/fake-api.mjs). Failures are injected in the BROWSER only (a wrapped Storage.setItem, a
// removed navigator.locks on the next load): no production flag exists. This does NOT claim the concurrency barrier, real generation or any multi-tab result.
//   node scripts/e2e.mjs encounters-ui-focused
import {launch,assert} from './harness.mjs';
import {newProfileDir} from './profile-root.mjs';
const ok=n=>console.log('PASS '+n);
const h=await launch({port:18531,profileDir:newProfileDir('encounters-ui-focused')});
const {page}=h;
const LEDGER='plc.encounters.v1',FOLDERS='plc.folders.v1';
const ready=async()=>{await page.waitForSelector('#messageInput');await page.waitForFunction(()=>window.__plcBooted===true&&Boolean(window.plcShell),null,{timeout:20000});await page.waitForFunction(()=>!document.querySelector('#messageInput').disabled);};
const settle=async()=>{await page.waitForFunction(()=>/^(Response complete\.|Response stopped|The response was interrupted)/.test(document.querySelector('#generationStatus').textContent)&&!document.querySelector('#stopGeneration').offsetParent,null,{timeout:30000});};
const until=async(fn,what,ms=15000)=>{const end=Date.now()+ms;let last;while(Date.now()<end){last=await fn();if(last)return last;await new Promise(r=>setTimeout(r,50));}throw new Error('timed out waiting for '+what);};
const stored=()=>page.evaluate(([L,F])=>({chat:JSON.parse(localStorage.getItem('chatThreads')||'[]'),ledger:JSON.parse(localStorage.getItem(L)||'null'),folders:localStorage.getItem(F)}),[LEDGER,FOLDERS]);
const requests=async()=>(await (await fetch(`http://127.0.0.1:${h.api.port}/__requests`)).json()).length;
const count=(s,text)=>s.chat.reduce((n,t)=>n+t.messages.filter(m=>m.role==='user'&&m.content===text).length,0);
const toast=()=>page.evaluate(()=>document.querySelector('#toast')?.textContent||'');
const tid=()=>page.evaluate(()=>window.plcApp.currentThreadId());
// the person's own Web Lock boundary: hold the app's real lock name; the app's save waits behind it
const hold=()=>page.evaluate(()=>new Promise(res=>{navigator.locks.request('plc-encounters',()=>new Promise(r=>{window.__rel=r;res(true);}));}));
const release=()=>page.evaluate(()=>{window.__rel();});
const failing=keys=>page.evaluate(ks=>{window.__orig??=Storage.prototype.setItem;window.__fail=new Set(ks);Storage.prototype.setItem=function(k,v){if(window.__fail.has(k))throw new DOMException('quota','QuotaExceededError');return window.__orig.call(this,k,v);};},keys);
const typeSelectAll=async text=>{await page.click('#messageInput');await page.keyboard.press('Control+A');await page.keyboard.type(text);};
const toggleContext=async()=>{await page.locator('.message.assistant [data-action="more"]').last().click();await page.locator('.thread-menu [data-menu-action="toggle-context"]').click();};
const chatMenu=async(text,item)=>{await page.locator('#threadList li[data-id]').filter({hasText:text}).locator('.thread-menu-btn').click();await page.locator('.thread-menu button',{hasText:item}).click();};

try{
 await ready();
 await page.fill('#messageInput','seed message');await page.click('#sendBtn');await settle();

 // 1. Save held at the real Web Lock; Select All + replace alpha with alphabet; release
 await hold();
 await page.fill('#messageInput','alpha');await page.click('#sendBtn');
 await page.waitForTimeout(300);
 let s=await stored();assert(count(s,'alpha')===0,'alpha is not stored while the lock is held');
 assert(await page.inputValue('#messageInput')==='alpha','the composer still holds what is being sent');
 await typeSelectAll('alphabet');
 await release();
 await until(async()=>count(await stored(),'alpha')===1,'alpha stored');await settle();
 assert(await page.inputValue('#messageInput')==='alphabet','the whole replacement stays: '+await page.inputValue('#messageInput'));
 s=await stored();assert(count(s,'alpha')===1&&count(s,'bet')===0&&count(s,'alphabet')===0,'alpha durable exactly once, nothing else sent');
 ok('held save + Select All replacement: alphabet stays whole, alpha stored once');

 // 2. controls: unchanged clears; appended keeps the whole changed text
 await page.fill('#messageInput','');
 await hold();await page.fill('#messageInput','unchanged-control');await page.click('#sendBtn');await page.waitForTimeout(200);await release();
 await until(async()=>count(await stored(),'unchanged-control')===1,'control stored');await settle();
 assert(await page.inputValue('#messageInput')==='','an unchanged composer clears after the save');
 await hold();await page.fill('#messageInput','append-control');await page.click('#sendBtn');await page.waitForTimeout(200);
 await page.click('#messageInput');await page.keyboard.press('End');await page.keyboard.type(' plus more');await release();
 await until(async()=>count(await stored(),'append-control')===1,'append control stored');await settle();
 assert(await page.inputValue('#messageInput')==='append-control plus more','an appended composer keeps the whole changed text: '+await page.inputValue('#messageInput'));
 await page.fill('#messageInput','');
 ok('unchanged control clears; appended control keeps the whole changed text');

 // 3. refused own save (browser storage refuses chatThreads) while typing and an attachment are pending: no dispatch, nothing overwritten, nothing restored twice
 await page.setInputFiles('#attachInput',{name:'notes.txt',mimeType:'text/plain',buffer:Buffer.from('a note')});
 await page.waitForSelector('#attachmentChips .chip:has-text("notes.txt")');
 let reqBefore=await requests();
 await hold();await page.fill('#messageInput','refused text');await page.click('#sendBtn');await page.waitForTimeout(200);
 await typeSelectAll('refused text and newer typing');
 await failing(['chatThreads']);await release();
 await until(async()=>/not sent/i.test(await toast()),'the refusal is told');
 assert(await page.inputValue('#messageInput')==='refused text and newer typing','newer typing is untouched by the refusal');
 assert(await page.locator('#attachmentChips .chip:has-text("notes.txt")').count()===1,'the attachment is back in the composer, once');
 s=await stored();assert(count(s,'refused text')===0,'nothing stored');
 await page.waitForTimeout(500);assert(await requests()===reqBefore,'the model was not called');
 await page.evaluate(()=>{window.__fail=new Set();});
 await page.fill('#messageInput','');await page.locator('#attachmentChips .chip').first().locator('button').click().catch(()=>{});
 ok('refused save: no dispatch, newer typing and the attachment kept');

 // 4. ordinary conversation at the safe maximum event position: durable text once, truthful warning, no restore, no resend
 const t1=await tid();
 await page.evaluate(([L,t])=>{const l=JSON.parse(localStorage.getItem(L));const e=Object.values(l.encounters).find(x=>x.thread===t);e.seq=Number.MAX_SAFE_INTEGER;localStorage.setItem(L,JSON.stringify(l));},[LEDGER,t1]);
 await page.reload();await ready();
 await page.fill('#messageInput','max seq text');await page.click('#sendBtn');
 await until(async()=>/Saved, but not fully recorded/.test(await toast()),'the partial attribution warning is visible');
 assert(!/was not sent/.test(await toast()),'it is not reported as a failed send');
 await settle();
 s=await stored();assert(count(s,'max seq text')===1,'the transcript holds the text once');
 assert(await page.inputValue('#messageInput')==='','the composer released the stored text');
 assert(await page.locator('.message.user',{hasText:'max seq text'}).count()===1,'on screen once');
 assert(!Object.values(s.ledger.events).some(e=>e.content?.text==='max seq text'),'the records really lack it');
 await page.reload();await ready();
 s=await stored();assert(count(s,'max seq text')===1,'after a reload the text is still there once, not restored or re-sent');
 assert(await page.inputValue('#messageInput')==='','the composer is empty after reload');
 ok('safe-maximum position: durable once, visible warning (a toast: it does not persist across a reload), nothing restored or resent');

 // 5. no Web Locks: a refused save, no dispatch, input kept
 await page.evaluate(()=>sessionStorage.setItem('__t418nolocks','1'));
 await page.addInitScript(()=>{if(sessionStorage.getItem('__t418nolocks'))Object.defineProperty(Navigator.prototype,'locks',{get(){return undefined;},configurable:true});});
 await page.reload();await ready();
 reqBefore=await requests();
 await page.fill('#messageInput','no lock text');await page.click('#sendBtn');
 await until(async()=>/Web Locks/.test(await toast()),'told that locks are missing');
 assert(await page.inputValue('#messageInput')==='no lock text','input kept');
 s=await stored();assert(count(s,'no lock text')===0,'nothing stored');
 await page.waitForTimeout(500);assert(await requests()===reqBefore,'the model was not called');
 await page.evaluate(()=>sessionStorage.removeItem('__t418nolocks'));await page.fill('#messageInput','');
 await page.reload();await ready();
 ok('no Web Locks: refused, no dispatch, input kept');

 // 6. projects with real name, instructions and an unknown field
 await page.click('#threadList .list-add[aria-label="New project"]');
 await page.fill('.app-dialog input','Real Project');await page.click('.app-dialog button:has-text("Create")');
 await page.locator('#threadList li.folder-heading .thread-menu-btn').first().click();
 await page.locator('.thread-menu button',{hasText:'Project instructions'}).click();
 await page.fill('.app-dialog textarea','Keep these instructions');await page.click('.app-dialog button:has-text("Save")');
 await page.evaluate(F=>{const f=JSON.parse(localStorage.getItem(F));f[0].futureField={keep:[1,2]};localStorage.setItem(F,JSON.stringify(f));},FOLDERS);
 await page.reload();await ready();
 const folderBefore=(await stored()).folders;
 assert(/Real Project/.test(folderBefore)&&/Keep these instructions/.test(folderBefore)&&/futureField/.test(folderBefore),'the folder carries a name, instructions and an unknown field');
 const moveVia=async(chat,project)=>{await chatMenu(chat,'Move to project');await page.selectOption('#folderPick',{label:project});await page.click('.app-dialog button:has-text("Move")');};
 // refused move keeps the previous (no) project; a stored move sets it
 await failing(['chatThreads']);
 await moveVia('seed message','Real Project');
 await until(async()=>/move was not saved/i.test(await toast()),'the refused move is told');
 assert(!(await stored()).chat.find(t=>t.title&&/seed message/.test(t.title)||t.messages[0]?.content==='seed message').folderId,'nothing stored');
 assert(await page.evaluate(()=>!window.plcApp.threads().some(t=>t.messages[0]?.content==='seed message'&&t.folderId)),'and the tab did not keep the refused value');
 await page.evaluate(()=>{window.__fail=new Set();});
 await moveVia('seed message','Real Project');
 await until(async()=>(await stored()).chat.some(t=>t.messages[0]?.content==='seed message'&&t.folderId),'the stored move');
 // refused Delete project: the folder, its unknown field and every chat reference stay exactly
 const chatsBefore=JSON.stringify((await stored()).chat.map(t=>[t.id,t.folderId]));
 await failing(['chatThreads']);
 await page.locator('#threadList li.folder-heading .thread-menu-btn').first().click();
 await page.locator('.thread-menu button',{hasText:'Delete project'}).click();await page.click('.app-dialog button:has-text("Delete project")');
 await until(async()=>/project was not deleted/i.test(await toast()),'the refused delete is told');
 s=await stored();assert(s.folders===folderBefore,'the folder store is byte-identical (no write, no fabricated metadata): '+s.folders);
 assert(JSON.stringify(s.chat.map(t=>[t.id,t.folderId]))===chatsBefore,'every chat reference is unchanged');
 assert(await page.locator('#threadList li.folder-heading',{hasText:'Real Project'}).count()===1,'the project is still listed with its chat');
 // a later folder write failure after the chats were durably updated: honest partial result, real folder kept
 await page.evaluate(()=>{window.__fail=new Set(['plc.folders.v1']);});
 await page.locator('#threadList li.folder-heading .thread-menu-btn').first().click();
 await page.locator('.thread-menu button',{hasText:'Delete project'}).click();await page.click('.app-dialog button:has-text("Delete project")');
 await until(async()=>/could not be removed/.test(await toast()),'the partial outcome is told');
 s=await stored();assert(s.folders===folderBefore,'the stored folder is the real one');
 assert(!s.chat.some(t=>t.folderId==='f'||t.folderId),'the chat references were durably removed, and not faked back');
 assert(await page.locator('#threadList li.folder-heading',{hasText:'Real Project'}).count()===1,'the real (now empty) project is still listed');
 await page.evaluate(()=>{window.__fail=new Set();});
 await page.locator('#threadList li.folder-heading .thread-menu-btn').first().click();
 await page.locator('.thread-menu button',{hasText:'Delete project'}).click();await page.click('.app-dialog button:has-text("Delete project")');
 await until(async()=>(await stored()).folders==='[]',"the successful delete");
 ok('Move/Delete project: refusal keeps exact metadata and chat references; partial folder failure is reported honestly');

 // 7. version selection and context toggle roll back on a refused save, and stay when stored
 await page.fill('#messageInput','versions please');await page.click('#sendBtn');await settle();
 await page.click('[data-action="regenerate"]');await settle();
 const shown=()=>page.locator('.message.assistant').last().innerText();
 const afterRegen=await shown();
 await failing(['chatThreads']);
 await page.click('[data-action="prev-version"]');
 await until(async()=>/chosen version was not saved/i.test(await toast()),'the refused version change is told');
 assert(await shown()===afterRegen,'the refused selection is taken back on screen');
 assert(await page.evaluate(()=>{const t=window.plcApp.currentThread();const m=t.messages[t.messages.length-1];return m.versionIndex===m.versions.length-1;}),'and in memory');
 await toggleContext();
 await until(async()=>/change was not saved/i.test(await toast()),'the refused context change is told');
 assert(await page.evaluate(()=>!window.plcApp.currentThread().messages.some(m=>m.excluded)),'the refused context toggle is back');
 await page.evaluate(()=>{window.__fail=new Set();});
 await page.click('[data-action="prev-version"]');
 await until(async()=>(await stored()).chat.some(t=>t.messages.some(m=>m.versions&&m.versionIndex===0)),'the stored version selection');
 await toggleContext();
 await until(async()=>(await stored()).chat.some(t=>t.messages.some(m=>m.excluded)),'the stored context toggle');
 ok('version selection and context toggle: refused ones are taken back, stored ones stay');

 const unexpected=h.errors.filter(e=>!/ResizeObserver|API responded with status 500|network error|QuotaExceeded|quota/i.test(e));
 assert(unexpected.length===0,'no unexpected page errors: '+JSON.stringify(unexpected));
 console.log('encounters-ui-focused e2e: ok');
}catch(e){console.error(e);console.error(await page.locator('#messages').innerText().catch(()=>''));console.error(h.errors);
 console.error('DIALOGS:',await page.evaluate(()=>[...document.querySelectorAll('.app-dialog,#toast,#chatNotice')].map(n=>n.className+': '+n.textContent.slice(0,200))).catch(()=>''));
 process.exitCode=1;}
finally{await h.close();}
