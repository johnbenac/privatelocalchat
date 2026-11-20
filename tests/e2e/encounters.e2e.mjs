// Conversation records in the real app (docs/ENCOUNTERS.md): the ordinary send, regenerate, edit, undo and reload paths, a legacy chat, equal-name participants, a shared link, supplied audio with
// derived text and nested corrections through the app-internal facade, a temporary chat, newer stored data, and the encrypted vault, all in real Chromium on the built app.
// SCOPE, said once: the answering model is the suite's fake OpenAI-compatible provider (tests/e2e/fake-api.mjs). That qualifies the RECORD PATHWAYS (what gets recorded, kept, shown and reloaded). It is not
// evidence of any real model's or resident's behaviour. The facade rows (equal names, shared link, supplied audio, derived text, corrections) are explicit app-facade input, not hosted receiving.
//   node scripts/e2e.mjs encounters
import {launch,assert} from './harness.mjs';
import {newProfileDir} from './profile-root.mjs';
import {legacyEventId} from '../../chat/encounters/records.mjs';   // legacy event ids are derived handles (a tuple digest), never hand-built strings
const ok=n=>console.log('PASS '+n);
const h=await launch({port:18511,profileDir:newProfileDir('encounters')});
const {page}=h;
const LEDGER='plc.encounters.v1',PASSPHRASE='correct horse battery staple 418';
const ready=async()=>{await page.waitForSelector('#messageInput');await page.waitForFunction(()=>window.__plcBooted===true&&Boolean(window.plcShell),null,{timeout:20000});await page.waitForFunction(()=>!document.querySelector('#messageInput').disabled);};
const settle=async()=>{await page.waitForFunction(()=>/^(Response complete\.|Response stopped|The response was interrupted)/.test(document.querySelector('#generationStatus').textContent)&&!document.querySelector('#stopGeneration').offsetParent,null,{timeout:30000});};
const send=async text=>{await page.fill('#messageInput',text);await page.click('#sendBtn');await settle();};
const read=()=>page.evaluate(L=>({chat:JSON.parse(localStorage.getItem('chatThreads')||'[]'),ledger:JSON.parse(localStorage.getItem(L)||'null'),raw:localStorage.getItem(L)}),LEDGER);
const until=async(fn,what,ms=15000)=>{const end=Date.now()+ms;let last;while(Date.now()<end){last=await fn();if(last)return last;await new Promise(r=>setTimeout(r,50));}throw new Error('timed out waiting for '+what);};
const events=(l,mid)=>Object.values(l?.events||{}).filter(e=>e.message===mid);
const attrs=()=>page.evaluate(()=>Object.fromEntries([...document.querySelectorAll('#messages .message[data-id]')].map(n=>[n.dataset.id,{speaker:n.dataset.attrSpeaker,event:n.dataset.attrEvent,standing:n.dataset.attrStanding,expression:n.dataset.attrExpression,modality:n.dataset.attrModality,legacy:n.dataset.attrLegacy,name:n.querySelector('.speaker')?.textContent,line:n.querySelector('.message-attribution')?.textContent||''}])));
const threadId=()=>page.evaluate(()=>window.plcApp.currentThreadId());
const chatMenu=async(text,item)=>{await page.locator('#threadList li[data-id]').filter({hasText:text}).locator('.thread-menu-btn').click();await page.locator('.thread-menu button',{hasText:item}).click();};
const editFirstPrompt=async(text)=>{await page.locator('.message.user').first().locator('[data-action="edit-message"]').click();await page.fill('.edit-box textarea',text);await page.click('.edit-box button:has-text("Save and resend")');await settle();};
const f=(fn,arg)=>page.evaluate(fn,arg);

try{
 await ready();

 // 1. a normal send: the person's words and the answer are recorded in full, as what they are
 await send('hello there');
 let tid=await threadId();
 let s=await until(async()=>{const r=await read();return r.ledger&&Object.values(r.ledger.events).filter(e=>e.state==='final').length>=2&&r;},'two final events');
 let [u]=s.chat.find(t=>t.id===tid).messages,msgs=s.chat.find(t=>t.id===tid).messages;
 const uev=events(s.ledger,msgs[0].id),aev=events(s.ledger,msgs[1].id);
 assert(uev.length===1&&aev.length===1,'one event per message');
 assert(uev[0].expression==='person'&&uev[0].content.text==='hello there'&&uev[0].speaker===`p:${tid}:person`&&uev[0].authority==='local-device'&&uev[0].standing==='recorded','the person event');
 assert(aev[0].expression==='model'&&aev[0].content.text==='Reply to: hello there'&&aev[0].outcome==='complete'&&aev[0].speaker===`p:${tid}:assistant`&&aev[0].runtime?.label,'the model event has its full text, outcome and runtime label: '+JSON.stringify(aev[0]));
 assert(s.ledger.participants[`p:${tid}:person`].individualId===null&&s.ledger.participants[`p:${tid}:assistant`].individualId===null,'no individual is invented');
 let at=await attrs();
 assert(at[msgs[0].id].speaker===`p:${tid}:person`&&at[msgs[0].id].event===uev[0].id&&at[msgs[1].id].expression==='model'&&at[msgs[0].id].name==='You'&&at[msgs[1].id].name==='AI response','the screen shows the records: '+JSON.stringify(at));
 ok('send: both messages recorded in full with expression, outcome, runtime and stable speakers; rendered from the records');

 // 2. regenerate adds a version event; the first answer's event is untouched
 await page.click('[data-action="regenerate"]');await settle();
 s=await until(async()=>{const r=await read();return r.ledger&&events(r.ledger,msgs[1].id).length===2&&events(r.ledger,msgs[1].id).every(e=>e.state==='final')&&r;},'regenerated events');
 const [v0,v1]=events(s.ledger,msgs[1].id).sort((a,b)=>a.clock.position-b.clock.position);
 assert(v0.id===aev[0].id&&v0.content.text===aev[0].content.text&&v1.standing==='regenerated'&&v1.version===1&&v1.causes.includes(uev[0].id),'regenerate: the original answer event is untouched, the new one is a regeneration caused by the prompt');
 ok('regenerate keeps the original answer event and adds a regeneration');

 // 3. edit the prompt: a correction, the original kept; the dropped answer stays in the record, no longer in the transcript; undo restores it
 await editFirstPrompt('hello there, edited');
 s=await until(async()=>{const r=await read();return r.ledger&&events(r.ledger,msgs[0].id).length===2&&Object.values(r.ledger.events).filter(e=>e.state==='final'&&e.inTranscript&&e.expression==='model').length>=1&&r;},'the correction');
 const fix=events(s.ledger,msgs[0].id).find(e=>e.standing==='correction');
 assert(fix.corrects===uev[0].id&&fix.content.text==='hello there, edited','the correction points at the original');
 const orig=s.ledger.events[uev[0].id];
 assert(orig.content.text==='hello there'&&orig.outcome==='complete'&&orig.content.digest===uev[0].content.digest,'the original keeps its text, digest and outcome');
 assert(s.ledger.events[aev[0].id].content.text==='Reply to: hello there'&&s.ledger.events[aev[0].id].inTranscript===false,'the answer to the old prompt is kept in the record, no longer in the transcript');
 ok('edit: correction keeps the original; dropped answer kept, presence flag cleared');
 await page.click('.toast-action');
 await until(async()=>{const r=await read();const t=r.chat.find(x=>x.id===tid);return t.messages[0].content==='hello there'&&r.ledger.events[aev[0].id].inTranscript===true&&r;},'undo');
 ok('undo restores the transcript and the presence flags; nothing is deleted from the record');

 // 4. reload: the same records, the same labels
 await page.waitForTimeout(400);   // the labels follow the save (refreshAttribution)
 const before=await read(),atBefore=await attrs();
 await page.reload();await ready();
 await page.waitForFunction(()=>document.querySelectorAll('#messages .message').length>=2);
 const after=await read(),atAfter=await attrs();
 assert(before.raw===after.raw,'the ledger is byte-identical after a reload (nothing rewrites itself)');
 assert(JSON.stringify(atBefore)===JSON.stringify(atAfter),'the screen shows the same attribution after a reload: '+JSON.stringify([atBefore,atAfter]));
 ok('reload: ledger unchanged, same attribution on screen');

 // 5. a legacy chat (saved before records existed): honest projection with stable ids; first rewrite writes that exact id down
 const legacy={id:'legacy-t',title:'Legacy chat',systemPrompt:'',createdAt:5,updatedAt:5,messages:[{id:'lm1',role:'user',content:'legacy question',at:5},{id:'lm2',role:'assistant',content:'legacy answer',at:6,model:'OldModel'}]};
 await f(([l,L])=>{const c=JSON.parse(localStorage.getItem('chatThreads')||'[]');c.push(l);localStorage.setItem('chatThreads',JSON.stringify(c));},[legacy,LEDGER]);
 await page.reload();await ready();
 await page.locator('#threadList li[data-id]').filter({hasText:'Legacy chat'}).locator('.thread-name').click();
 await page.waitForFunction(()=>document.querySelector('#messages .message[data-id="lm1"]'));
 at=await attrs();
 assert(at.lm1.legacy==='true'&&at.lm1.event===legacyEventId('legacy-t','lm1')&&at.lm2.event===legacyEventId('legacy-t','lm2')&&at.lm1.name==='You','legacy messages project under stable ids: '+JSON.stringify(at));
 s=await read();assert(events(s.ledger,'lm1').length===0&&events(s.ledger,'lm2').length===0,'nothing was recorded for legacy messages just by opening them');
 await editFirstPrompt('legacy question, edited');
 s=await until(async()=>{const r=await read();return r.ledger?.events[legacyEventId('legacy-t','lm1')]&&events(r.ledger,'lm1').length===2&&r;},'the legacy original');
 const lev=s.ledger.events[legacyEventId('legacy-t','lm1')];
 assert(lev.content.text==='legacy question'&&lev.standing==='legacy'&&lev.authority==='none'&&lev.observed===false,'the legacy original is written down under its stable id, not claimed as observed: '+JSON.stringify(lev));
 assert(events(s.ledger,'lm1').find(e=>e.standing==='correction').corrects===lev.id,'the correction points at the stable legacy id');
 await page.reload();await ready();
 await page.locator('#threadList li[data-id]').filter({hasText:'Legacy chat'}).locator('.thread-name').click();
 await page.waitForFunction(()=>document.querySelector('#messages .message[data-id="lm1"]'));
 assert((await read()).ledger.events[legacyEventId('legacy-t','lm1')].id===lev.id,'the legacy event id survives a reload and the rewrite');
 ok('legacy chat: stable ids before and after the first rewrite, no invented individual or authority');

 // 6. equal-name participants, a shared link, supplied audio + derived text, nested corrections, refusals: explicit app-facade input
 await page.locator('#threadList li[data-id]').filter({hasText:'hello there'}).first().locator('.thread-name').click();
 tid=await threadId();
 const run=await f(async([tid])=>{const e=window.plcApp.encounters,out={};
  const A=(await e.registerParticipant({thread:tid,name:'Chris',kind:'human'})).participant,B=(await e.registerParticipant({thread:tid,name:'Chris',kind:'human'})).participant,R=(await e.registerParticipant({thread:tid,name:'Emma',kind:'agent',individualId:'individual:supplied-by-receiver'})).participant;
  out.ids=[A.id,B.id,R.id];
  out.map=[(await e.mapHolder({participant:A.id,holder:'link-one'})).ok,(await e.mapHolder({participant:A.id,holder:'link-forwarded'})).ok,(await e.mapHolder({participant:B.id,holder:'link-one'})).code];
  out.holders=[e.resolveHolder({thread:tid,holder:'link-one'}),e.resolveHolder({thread:tid,holder:'link-forwarded'}),e.resolveHolder({thread:tid,holder:'link-nobody'})];
  const r1=await e.receive({thread:tid,speaker:A.id,expression:'external',modality:'text',text:'Hello from A',occurrence:{source:'surface:test',id:'e1'},transcript:true});
  const r2=await e.receive({thread:tid,speaker:B.id,expression:'external',modality:'text',text:'Hello from B',occurrence:{source:'surface:test',id:'e2'},transcript:true});
  const au=await e.receive({thread:tid,speaker:A.id,expression:'external',modality:'supplied-audio',text:null,occurrence:{source:'cp:test',id:'au1',digest:'sha256:'+'a'.repeat(64)},transcript:true,audience:[A.id,R.id]});
  const dr=await e.receive({thread:tid,speaker:A.id,expression:'external',modality:'derived-text',standing:'derived',text:'Come in.',derivedFrom:[au.event.id],occurrence:{source:'surface:transcriber',id:'d1'},transcript:true});
  const wide=await e.receive({thread:tid,speaker:A.id,expression:'external',modality:'derived-text',standing:'derived',text:'wider',derivedFrom:[au.event.id],audience:[A.id,B.id,R.id],occurrence:{source:'surface:transcriber',id:'d2'},transcript:true});
  const c1=await e.receive({thread:tid,speaker:A.id,expression:'external',modality:'text',standing:'correction',text:'Hello from A, corrected',corrects:r1.event.id,occurrence:{source:'surface:test',id:'e1c'},transcript:true});
  const c2=await e.receive({thread:tid,speaker:A.id,expression:'external',modality:'text',standing:'correction',text:'Hello from A, corrected again',corrects:c1.event.id,occurrence:{source:'surface:test',id:'e1cc'},transcript:true});
  const conflict=await e.receive({thread:tid,speaker:A.id,expression:'external',modality:'text',text:'other bytes',occurrence:{source:'surface:test',id:'e1'},transcript:true});
  const twin=await e.receive({thread:tid,speaker:B.id,expression:'external',modality:'text',text:'Hello from B',occurrence:{source:'surface:test',id:'e2-again'},transcript:true});
  const participantConflict=await e.registerParticipant({thread:tid,id:A.id,name:'Chris',kind:'agent'});
  out.rows={r1:r1.ok,r2:r2.ok,au:au.ok,auText:au.event?.content.text,dr:dr.ok,wide:wide.code,c1:c1.ok,c2:c2.ok,conflict:conflict.code,twin:twin.ok,twinDistinct:twin.event?.id!==r2.event.id,participantConflict:participantConflict.code};
  out.events={r1:r1.event.id,r2:r2.event.id,au:au.event.id,dr:dr.event.id,c1:c1.event.id,c2:c2.event.id,twin:twin.event.id};out.msgs={r1:r1.messageId,r2:r2.messageId,au:au.messageId,dr:dr.messageId,c1:c1.messageId,twin:twin.messageId};
  return out;},[tid]);
 assert(run.map[0]&&run.map[1]&&run.map[2]==='holder-mapped','shared link: two holders map to one participant, a holder cannot be moved: '+JSON.stringify(run.map));
 assert(run.holders[0]===run.ids[0]&&run.holders[1]===run.ids[0]&&run.holders[2]===null,'holders resolve to the same participant, an unknown holder to nobody');
 assert(run.rows.r1&&run.rows.r2&&run.rows.au&&run.rows.dr&&run.rows.c1&&run.rows.c2&&run.rows.twin&&run.rows.twinDistinct,'explicit input accepted: '+JSON.stringify(run.rows));
 assert(run.rows.auText===null,'supplied audio keeps text null');
 assert(run.rows.wide==='audience-widened'&&run.rows.conflict==='occurrence-conflict'&&run.rows.participantConflict==='participant-conflict','widening, a conflicting occurrence and a conflicting participant id are refused: '+JSON.stringify(run.rows));
 s=await until(async()=>{const r=await read();return r.ledger?.events[run.events.c2]&&r;},'facade events stored');
 const L=s.ledger,msgsNow=s.chat.find(t=>t.id===tid).messages;
 assert(L.events[run.events.au].content.text===null&&L.events[run.events.au].modality==='supplied-audio'&&msgsNow.find(m=>m.id===run.msgs.au).content==='','audio: source text null in the record (and no invented text in the transcript line)');
 assert(L.events[run.events.dr].derivedFrom[0]===run.events.au&&L.events[run.events.dr].content.text==='Come in.'&&L.events[run.events.au].content.text===null,'derived text is a separate event; the audio original stays null');
 assert(L.events[run.events.c2].corrects===run.events.c1&&L.events[run.events.c1].corrects===run.events.r1&&L.events[run.events.r1].content.text==='Hello from A','nested corrections chain to the original, which keeps its text');
 assert(!Object.values(L.events).some(e=>e.occ.id==='e1'&&e.content.text==='other bytes')&&!msgsNow.some(m=>m.content==='other bytes'),'the conflicting occurrence stored nothing and added no transcript line');
 assert(L.participants[run.ids[2]].individualId==='individual:supplied-by-receiver'&&L.participants[run.ids[0]].individualId===null,'the supplied individual reference is stored as given, nobody else gets one');
 at=await attrs();
 assert(at[run.msgs.r1].speaker===run.ids[0]&&at[run.msgs.r2].speaker===run.ids[1]&&at[run.msgs.r1].name!==at[run.msgs.r2].name&&/^Chris/.test(at[run.msgs.r1].name)&&/^Chris/.test(at[run.msgs.r2].name),'two Chris on screen, told apart: '+at[run.msgs.r1].name+' | '+at[run.msgs.r2].name);
 assert(/supplied audio, no text/.test(at[run.msgs.au].line)&&/text derived from audio/.test(at[run.msgs.dr].line)&&at[run.msgs.au].expression==='external','the audio and derived text are labelled as what they are: '+JSON.stringify([at[run.msgs.au],at[run.msgs.dr]]));
 const atFacade=await attrs();
 await page.reload();await ready();
 await page.locator('#threadList li[data-id]').filter({hasText:'hello there'}).first().locator('.thread-name').click();
 await page.waitForFunction(m=>document.querySelector('#messages .message[data-id="'+m+'"]'),run.msgs.c1);
 assert(JSON.stringify(await attrs())===JSON.stringify(atFacade),'the same attribution after a reload');
 ok('equal-name participants, shared link, supplied audio + derived text, nested corrections, refusals: stored, shown and reloaded');

 // 7. a temporary chat: records in memory only, nothing stored
 await f(()=>window.plcApp.newThread({temporary:true}));await page.waitForFunction(()=>window.plcApp.currentThread()?.temporary===true);
 await send('a secret temporary question');
 const ttid=await threadId();
 await new Promise(r=>setTimeout(r,800));
 s=await read();
 assert(!s.raw.includes('secret temporary')&&!JSON.stringify(s.chat).includes('secret temporary')&&!s.chat.some(t=>t.id===ttid),'temporary chat: neither chat nor ledger stored it');
 const tmem=await f(([t])=>({events:window.plcApp.encounters.events(t).length,proj:Object.keys(window.plcApp.encounters.project(t)).length}),[ttid]);
 assert(tmem.events>=2&&tmem.proj>=2,'but it has records in memory: '+JSON.stringify(tmem));
 const tp=await f(async([t])=>{const e=window.plcApp.encounters;const p=await e.registerParticipant({thread:t,name:'Temp guest',kind:'human'});return {memoryOnly:p.memoryOnly,ok:p.ok};},[ttid]);
 assert(tp.ok&&tp.memoryOnly,'a participant in a temporary chat is memory only');
 await page.reload();await ready();
 s=await read();assert(!s.raw.includes('Temp guest')&&!s.raw.includes('secret temporary'),'after a reload nothing of the temporary chat exists');
 ok('temporary chat: records only in memory, nothing persisted');

 // 8. data from a newer version is left alone; chats keep working
 const newerLedger=JSON.stringify({v:2,rev:99,epoch:0,future:{keep:'me'}});
 await f(([L,t])=>{localStorage.setItem(L,t);},[LEDGER,newerLedger]);
 await page.reload();await ready();
 await page.fill('#messageInput','a message while the ledger is from a newer version');await page.click('#sendBtn');await settle();
 await until(async()=>(await read()).chat.some(t=>t.messages.some(m=>m.content==='a message while the ledger is from a newer version')),'the chat save');
 assert((await read()).raw===newerLedger,'a ledger written by a newer version is never touched');
 await f(([L])=>{localStorage.removeItem(L);},[LEDGER]);
 await f(()=>{localStorage.setItem('plc.encounters.v2',JSON.stringify({v:2}));});
 await page.reload();await ready();
 await page.waitForSelector('.app-dialog',{timeout:15000});
 assert(/conversation records saved by a newer version/.test(await page.locator('.app-dialog').innerText()),'the guard names the store in words: '+await page.locator('.app-dialog').innerText());
 await page.keyboard.press('Escape');await page.waitForSelector('.app-dialog',{state:'detached',timeout:5000});
 await page.fill('#messageInput','and while a newer key exists');await page.click('#sendBtn');await settle();
 await until(async()=>(await read()).chat.some(t=>t.messages.some(m=>m.content==='and while a newer key exists')),'the chat save with a newer key');
 s=await read();assert(s.raw===null,'with a newer plc.encounters.v2 present the v1 ledger is not written');
 const blocked=await f(()=>window.__plcFormatGuard?.blocked||[]);assert(blocked.includes('plc.encounters.v1'),'the format guard blocks the older key: '+JSON.stringify(blocked));
 await f(()=>{localStorage.removeItem('plc.encounters.v2');const r=JSON.parse(localStorage.getItem('plc.formats.v1')||'{}');if(r.formats)delete r.formats['plc.encounters.v1'];localStorage.setItem('plc.formats.v1',JSON.stringify(r));});
 ok('newer data: a newer ledger and a newer key are left exactly as they are, chats still save, the guard names the store');

 // 9. the encrypted vault: records go through the vault, not plain storage; they reload after unlocking
 await page.reload();await ready();
 await page.click('button[aria-label="This device menu"]');await page.click('.shell-pop-row:has-text("Settings")');await page.click('.settings-nav-item[data-section="security"]');await page.click('.set-row:has-text("App lock") button');
 await page.check('#lockEncrypt');await page.fill('#lockNew1',PASSPHRASE);await page.fill('#lockNew2',PASSPHRASE);await page.click('.app-dialog button:has-text("Lock the app")');
 await page.waitForSelector('.app-dialog:has-text("Remove the unencrypted copy")',{timeout:30000});await page.click('.app-dialog button:has-text("Remove it")');
 await page.waitForFunction(L=>!localStorage.getItem('chatThreads')&&!localStorage.getItem(L),LEDGER,{timeout:20000});
 await page.click('button[aria-label="Close settings"]').catch(()=>{});
 await page.click('#newChatBtn');await send('vault question');
 await until(async()=>f(()=>window.plcApp.encounters.summary().events>=2),'records in the vault');
 const plain=await f(()=>JSON.stringify({...localStorage}));assert(!plain.includes('vault question')&&!plain.includes('hello there'),'nothing readable in plain storage with the vault on');
 await page.waitForTimeout(2500);
 await page.reload();
 await page.waitForSelector('#lockScreen',{state:'visible',timeout:20000});await page.fill('#unlockPass',PASSPHRASE);await page.press('#unlockPass','Enter');await page.waitForSelector('#lockScreen',{state:'hidden',timeout:30000});
 await ready();
 const vs=await f(()=>{const e=window.plcApp.encounters;const t=window.plcApp.threads().find(x=>x.messages.some(m=>m.content==='vault question'));return {summary:e.summary(),proj:t?Object.values(e.project(t.id)).map(p=>[p.legacy,p.expression]):null};});
 assert(vs.summary.events>=2&&vs.proj&&vs.proj.every(p=>p[0]===false),'after unlocking the vault the records are there and attribute the messages: '+JSON.stringify(vs));
 ok('vault: records are stored encrypted, not in plain storage, and are back after unlocking');

 const unexpected=h.errors.filter(e=>!/ResizeObserver|API responded with status 500|network error/.test(e));
 assert(unexpected.length===0,'no unexpected page errors: '+JSON.stringify(unexpected));
 console.log('encounters e2e: ok');
}catch(e){console.error(e);console.error(await page.locator('#messages').innerText().catch(()=>''));console.error(h.errors);
 console.error('DIALOGS:',await page.evaluate(()=>[...document.querySelectorAll('.app-dialog,.toast,#chatNotice')].map(n=>n.className+': '+n.textContent.slice(0,200))).catch(()=>''));
 try{const r=await read();console.error(JSON.stringify(Object.values(r.ledger?.events||{}).map(x=>[x.id.slice(0,12),x.message,x.version,x.standing,x.state,x.outcome,x.inTranscript,(x.content?.text||'').slice(0,20)])),JSON.stringify(r.chat.map(t=>t.messages.map(m=>[m.id,m.role,m.status,m.versionIndex,(m.versions||[]).map(v=>v.status)]))));}catch{}
 process.exitCode=1;}
finally{await h.close();}
