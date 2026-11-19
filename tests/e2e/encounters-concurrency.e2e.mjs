// Several real tabs saving conversations at once (chat/encounters/thread-commit.mjs: the Web Lock "plc-encounters", a fresh read of chatThreads and the ledger, a patch of this tab's changes, an intent
// between the two writes). Every writer here is an ordinary app path: the real Send button, a real prompt edit (Save and resend), the real history Import dialog, the real chat-menu Delete, the real
// "Delete all chat history" button, and the app's own facade (plcApp.encounters) for an explicit receiver. Real Chromium tabs share one profile (one localStorage, one lock manager) and are released
// together by a BroadcastChannel. The answering provider is the fake OpenAI-compatible server (record pathways, not model behaviour). REPEATS = 20 each. E2E_PORT_OFFSET moves the port (base 18527).
//
// Invariants (stated before the run), checked on BOTH stores read from a separate reader tab:
//   no lost update   every Send, edit, import, delete and receive that the UI/facade reported is in the stored transcript exactly once, and (except legacy/imported lines) has one final ledger event
//   no corruption    chatThreads and the ledger always parse; no intent is left after the run
//   no torn read     a reader tab polling the whole time never sees unparseable text and never sees a stored message vanish that nobody removed (an explicit edit removes the answer after its prompt)
//   no duplicates    message ids are unique in a chat; one event per message version
//   no silent refusal  nothing is refused or in conflict in the plain race (different messages); after Clear, a tab whose save was refused says so in words (and its last result is 'stale')
//   no resurrection  after "Delete all chat history" nothing of the cleared chats exists in either store, whatever the other tabs were doing
//   no deadlock      a tab torn down (no unload handlers) while holding the lock does not block the others; everything finishes inside a timeout
//   the lock is the path  while another tab holds "plc-encounters" a Send writes nothing and goes through when the holder goes
//   (a SIGKILL of a writer process around the real modules: tests/encounters-crash.test.mjs. Tab teardown here is orderly; it is not a process kill.)
//   control: the earlier whole-list write (each tab writes the list it loaded) loses acknowledged messages under the same release, so these checks can fail
//   node scripts/e2e.mjs encounters-concurrency
import {launch,assert} from './harness.mjs';
import {newProfileDir} from './profile-root.mjs';
import {legacyEventId} from '../../chat/encounters/records.mjs';   // legacy event ids are derived handles (a tuple digest), never hand-built strings
const REPEATS=Number(process.env.PLC_E2E_REPEATS||20),ok=n=>console.log('PASS '+n);
const h=await launch({port:18527,profileDir:newProfileDir('encounters-concurrency')});
const {context,origin}=h;
const LEDGER='plc.encounters.v1';
const ready=async page=>{await page.waitForSelector('#messageInput');await page.waitForFunction(()=>window.__plcBooted===true&&Boolean(window.plcShell),null,{timeout:20000});await page.waitForFunction(()=>!document.querySelector('#messageInput').disabled);};
const within=(promise,ms,what)=>Promise.race([promise,new Promise((_,rej)=>setTimeout(()=>rej(new Error('no deadlock: '+what+' did not finish in '+ms+' ms')),ms))]);
// a new tab needs the fake provider too (sessionStorage is per tab; the harness only configured the first one)
const newTab=async()=>{const p=await context.newPage();p.on('pageerror',e=>h.errors.push(e.message));
 await p.addInitScript(({endpoint})=>{if(!sessionStorage.getItem('chatConfig'))sessionStorage.setItem('chatConfig',JSON.stringify({endpoint,token:'',model:'fake-model',theme:'light'}));if(!sessionStorage.getItem('chatModels'))sessionStorage.setItem('chatModels',JSON.stringify(['fake-model']));},{endpoint:`http://127.0.0.1:${h.api.port}/v1`});
 await p.goto(origin+'/');await ready(p);return p;};
const stored=page=>page.evaluate(L=>({chat:JSON.parse(localStorage.getItem('chatThreads')||'null'),ledger:JSON.parse(localStorage.getItem(L)||'null')}),LEDGER);
const until=async(fn,what,ms=20000)=>{const end=Date.now()+ms;let last;while(Date.now()<end){last=await fn();if(last)return last;await new Promise(r=>setTimeout(r,60));}throw new Error('timed out waiting for '+what);};
const msg=(id,role,content,extra={})=>({id,role,content,at:1,...extra});
const seedThreads=()=>[{id:'ct',title:'Concurrent chat',systemPrompt:'',createdAt:10,updatedAt:10,messages:[msg('u1','user','seed question'),msg('a1','assistant','seed answer',{model:'M'})]},{id:'ct2',title:'Second chat',systemPrompt:'',createdAt:9,updatedAt:9,messages:[msg('n1','user','second chat question')]}];
const importFile=r=>JSON.stringify({format:'plc-history/1',threads:[{id:'imp-'+r,title:'Imported '+r,created:1,updated:1,messages:[{role:'user',content:'imported words '+r}]}]});
const reseed=async(pages,{keepLedger=false}={})=>{ // the stored state a person would have before the race, then every tab loads it
 await pages[0].evaluate(([L,list,keep])=>{localStorage.setItem('chatThreads',JSON.stringify(list));if(!keep)localStorage.removeItem(L);localStorage.removeItem('plc.activeThread.v1');},[LEDGER,seedThreads(),keepLedger]);
 // the fixture write is itself a cross-process write: every tab must SEE it (before and after its reload) or an old tab/old value would be saved over it
 const want=JSON.stringify(seedThreads()),sees=p=>p.waitForFunction(([L,w,keep])=>localStorage.getItem('chatThreads')===w&&(keep||localStorage.getItem(L)===null),[LEDGER,want,keepLedger],{timeout:10000});
 await within(Promise.all(pages.map(sees)),15000,'every tab to see the fixture');
 await within(Promise.all(pages.map(async p=>{await p.reload();await ready(p);await sees(p);})),30000,'the tabs to reload');
};
const open=(page,id)=>page.locator('#threadList li[data-id="'+id+'"] .thread-name').click();
const toasts=page=>page.evaluate(()=>document.body.innerText);
// an actor waits for the release, then does one thing with the app's own controls/modules in the page
const arm=(page,name,arg)=>page.evaluate(({name,arg})=>{
 window.__out=null;
 const idle=()=>new Promise(r=>{const t=setInterval(()=>{if(/^(Response complete\.|Response stopped|The response was interrupted)/.test(document.querySelector('#generationStatus').textContent)&&!document.querySelector('#stopGeneration').offsetParent){clearInterval(t);r();}},20);});
 // a refused save is a visible outcome of its own (no reply is asked for): the actor is done when the app SAID so in words
 const refusedInWords=()=>new Promise(r=>{const t=setInterval(()=>{if(/was not saved|not saved|cleared in another tab|did not overwrite|could not be saved/i.test(document.body.innerText)){clearInterval(t);r();}},20);});
 const fresh=(L,pid)=>{try{const l=JSON.parse(localStorage.getItem(L)||'null');return l?Boolean(l.participants[pid]):null;}catch{return 'unparseable';}};
 const acts={
  async send(){const i=document.querySelector('#messageInput');i.value=arg.text;i.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#sendBtn').click();await new Promise(r=>setTimeout(r,60));const how=await Promise.race([idle().then(()=>'answered'),refusedInWords().then(()=>'refused')]);return {ok:true,how,selected:window.plcApp.currentThreadId()};},
  async edit(){document.querySelector('.message.user [data-action="edit-message"]').click();const ta=document.querySelector('.edit-box textarea');ta.value=arg.text;[...document.querySelectorAll('.edit-box button')].find(b=>/Save and resend/.test(b.textContent)).click();await new Promise(r=>setTimeout(r,60));const how=await Promise.race([idle().then(()=>'answered'),refusedInWords().then(()=>'refused')]);return {ok:true,how,selected:window.plcApp.currentThreadId()};},
  async receive(){const e=window.plcApp.encounters,tid=window.plcApp.currentThreadId();
    // registration and receive are reported SEPARATELY, with the participant as storage holds it right before and after each step
    const reg=await e.registerParticipant({thread:tid,id:arg.participant,name:'Remote',kind:'human'});const afterReg=fresh(arg.L,arg.participant);
    const r=await e.receive({thread:tid,speaker:arg.participant,expression:'external',modality:'text',text:arg.text,occurrence:{source:'surface:race',id:arg.occurrence},transcript:true});
    return {ok:reg.ok&&r.ok,code:r.code||reg.code||null,messageId:r.messageId,selected:tid,registration:{ok:reg.ok,code:reg.code||null,existing:Boolean(reg.existing)},receive:{ok:r.ok,code:r.code||null},participantStoredAfterRegistration:afterReg,participantStoredAfterReceive:fresh(arg.L,arg.participant)};},
  async importNow(){[...document.querySelectorAll('.app-dialog button')].find(b=>/^Import$/.test(b.textContent.trim())).click();await new Promise(r=>setTimeout(r,300));return {ok:true};},
  async trash(){document.querySelector('#threadList li[data-id="ct2"] .thread-menu-btn').click();[...document.querySelectorAll('.thread-menu button')].find(b=>b.querySelector('.btn-label')?.textContent==='Delete').click();await new Promise(r=>setTimeout(r,200));return {ok:true};},
  async clear(){document.getElementById('clearHistoryBtn').click();const end=Date.now()+5000;let b;while(!(b=[...document.querySelectorAll('.app-dialog button')].find(x=>/Delete everything/.test(x.textContent)))&&Date.now()<end)await new Promise(r=>setTimeout(r,20));if(!b)return {ok:false,code:'no-dialog'};b.click();await new Promise(r=>setTimeout(r,400));return {ok:true};},
 };
 window.__armed=new Promise(res=>{const c=new BroadcastChannel('t418-go');c.onmessage=async()=>{try{window.__out=await acts[name]();}catch(e){window.__out={ok:false,code:'exception',message:String(e&&e.message||e)};}res();};window.__listening=true;});
},{name,arg});
const release=async pages=>{for(const p of pages)await within(p.waitForFunction(()=>window.__listening===true),10000,'an actor to start listening');await pages[0].evaluate(()=>{const c=new BroadcastChannel('t418-go');c.postMessage(1);c.close();});};
const finish=async pages=>{await within(Promise.all(pages.map(p=>p.evaluate(()=>window.__armed))),40000,'the actors').catch(async e=>{
  const states=await Promise.all(pages.map(p=>p.evaluate(()=>({out:window.__out,status:document.querySelector('#generationStatus')?.textContent,stop:Boolean(document.querySelector('#stopGeneration')?.offsetParent),dialog:document.querySelector('.app-dialog')?.textContent.slice(0,80)||null})).catch(x=>String(x))));
  throw new Error(e.message+' '+JSON.stringify(states));});return Promise.all(pages.map(p=>p.evaluate(()=>{window.__listening=false;return window.__out;})));};
const reader=page=>page.evaluate(L=>{window.__stop=false;return (async()=>{const seen=new Map(),vanished=[],stats={reads:0,torn:0};
 while(!window.__stop){for(const key of ['chatThreads',L]){const raw=localStorage.getItem(key);if(raw==null)continue;stats.reads++;let v;try{v=JSON.parse(raw);}catch{stats.torn++;continue;}
   if(key==='chatThreads'&&Array.isArray(v)){const now=new Set(v.flatMap(t=>t.messages.map(m=>t.id+'/'+m.id)));for(const id of seen.keys())if(!now.has(id))vanished.push(id);for(const id of now)seen.set(id,1);}}
  await new Promise(r=>setTimeout(r,0));}
 return {...stats,vanished};})();},LEDGER);
const stopReader=async(page,promise)=>{await page.evaluate(()=>{window.__stop=true;});return within(promise,10000,'the reading tab');};
const unique=ids=>new Set(ids).size===ids.length;

try{
 const main=h.page;await ready(main);
 const writers=[];for(let i=0;i<6;i++)writers.push(await newTab());
 const [A,B,C,D,E,F]=writers,watcher=main,all=[...writers,watcher];
 for(const p of all)assert(await p.evaluate(()=>Boolean(navigator.locks&&navigator.locks.request)),'every tab has Web Locks: the lock path is the one under test');

 // 0. control: the earlier way (each tab writes the whole chat list it loaded) loses acknowledged messages under the same release
 let lossy=0;
 for(let r=0;r<REPEATS;r++){
  await reseed(all);
  const olds=[A,B,C,D].map((p,i)=>p.evaluate(async({i})=>{const mine=JSON.parse(localStorage.getItem('chatThreads'));await new Promise(r=>{const c=new BroadcastChannel('t418-go');c.onmessage=()=>r();window.__listening=true;});
    await new Promise(r=>setTimeout(r,Math.random()*5));mine[0].messages.push({id:'old-'+i,role:'user',content:'old '+i,at:2});localStorage.setItem('chatThreads',JSON.stringify(mine));},{i}));
  await release([A,B,C,D]);await within(Promise.all(olds),10000,'the control tabs');
  const t=(await stored(main)).chat.find(x=>x.id==='ct');if(t.messages.filter(m=>m.id.startsWith('old-')).length<4)lossy++;
 }
 assert(lossy>0,'the control never lost a message in '+REPEATS+' tries, so it proves nothing');
 ok('control: the earlier whole-list write lost an acknowledged message in '+lossy+' of '+REPEATS+' releases');

 // 1. the real paths at once: 6 writing tabs and 1 reading tab
 let conflictsSeen=0;
 for(let r=0;r<REPEATS;r++){
  await reseed(all);
  await Promise.all([A,B,C,D].map(p=>open(p,'ct')));await open(E,'ct');await open(F,'ct2');
  // E: stage the real Import dialog; every other writer arms its action
  await E.setInputFiles('#importInput',{name:'history.json',mimeType:'application/json',buffer:Buffer.from(importFile(r))});await E.locator('.app-dialog:has-text("Import")').waitFor();
  const watching=reader(watcher);
  await Promise.all([arm(A,'send',{text:'from A '+r}),arm(B,'send',{text:'from B '+r}),arm(C,'edit',{text:'edited by C '+r}),arm(D,'receive',{participant:'p:d-'+r,text:'received '+r,occurrence:'rx-'+r,L:LEDGER}),arm(E,'importNow',{}),arm(F,'trash',{})]);
  await release(writers);
  const out=await finish(writers);const seen=await stopReader(watcher,watching);
  const s=await until(async()=>{const v=await stored(main);const t=v.chat?.find(x=>x.id==='ct');return v.ledger&&!v.ledger.intent&&t&&t.messages.filter(m=>m.role==='assistant'&&/^Reply to: (from A|from B|edited by C)/.test(m.content)).length>=3&&v;},'the writers to be stored (repeat '+r+')');
  const t=s.chat.find(x=>x.id==='ct'),ids=t.messages.map(m=>m.id),L=s.ledger,ofMsg=id=>Object.values(L.events).filter(e=>e.message===id);
  assert(out.every(o=>o?.ok),'repeat '+r+': every actor was acknowledged: '+JSON.stringify(out));
  assert(out[3].registration.ok&&out[3].receive.ok&&out[3].participantStoredAfterRegistration===true&&out[3].participantStoredAfterReceive===true,'repeat '+r+': the facade actor\'s registration and receive are each acknowledged and the participant was stored fresh after each step: '+JSON.stringify(out[3]));
  assert(out.every((o,i)=>i===3||i>3||o.how==='answered')&&out.slice(0,3).every(o=>o.selected==='ct'),'repeat '+r+': the senders and the editor were answered (none refused) on the chat they had open: '+JSON.stringify(out));
  assert(unique(ids),'repeat '+r+': message ids unique '+ids.join());
  for(const [who,text] of [['A','from A '+r],['B','from B '+r]]){
   const m=t.messages.filter(x=>x.role==='user'&&x.content===text);assert(m.length===1,'repeat '+r+': '+who+'\'s message is stored once, found '+m.length);
   const ev=ofMsg(m[0].id);assert(ev.length===1&&ev[0].state==='final'&&ev[0].content.text===text&&ev[0].standing==='recorded','repeat '+r+': '+who+'\'s message has one final event: '+JSON.stringify(ev.map(e=>[e.state,e.standing])));
   const reply=t.messages.find(x=>x.role==='assistant'&&x.content==='Reply to: '+text);assert(reply&&ofMsg(reply.id).length===1&&ofMsg(reply.id)[0].content.text==='Reply to: '+text&&ofMsg(reply.id)[0].expression==='model','repeat '+r+': '+who+'\'s answer is stored and recorded in full');
  }
  const u1=t.messages.find(x=>x.id==='u1');assert(u1.content==='edited by C '+r,'repeat '+r+': the edit is stored');
  const legacy=L.events[legacyEventId('ct','u1')],fix=ofMsg('u1').find(e=>e.standing==='correction');
  assert(legacy&&legacy.content.text==='seed question'&&legacy.standing==='legacy'&&fix&&fix.corrects===legacy.id&&fix.content.text==='edited by C '+r,'repeat '+r+': the edit kept the legacy original under its stable id and corrected it');
  assert(!ids.includes('a1'),'repeat '+r+': the edited prompt dropped the old answer (an explicit edit)');
  assert(t.messages.some(x=>x.role==='assistant'&&x.content==='Reply to: edited by C '+r),'repeat '+r+': the answer to the edit is stored');
  const rx=t.messages.filter(x=>x.id===out[3].messageId);assert(rx.length===1&&ofMsg(rx[0].id).length===1&&ofMsg(rx[0].id)[0].expression==='external'&&ofMsg(rx[0].id)[0].speaker==='p:d-'+r,'repeat '+r+': the received message is stored once and attributed');
  const imp=s.chat.find(x=>x.id==='imp-'+r);assert(imp&&imp.messages.length===1,'repeat '+r+': the import is stored');assert(Object.values(L.events).every(e=>e.thread!=='imp-'+r)&&L.encounters['enc:imp-'+r]?.origin==='imported','repeat '+r+': the imported chat stays legacy (no event of its own)');
  assert(s.chat.find(x=>x.id==='ct2')?.deletedAt!=null,'repeat '+r+': the delete (to Trash) is stored');
  for(const e of Object.values(L.events))if(e.inTranscript&&e.message)assert(s.chat.some(c=>c.messages.some(m=>m.id===e.message)),'repeat '+r+': event '+e.id+' says in transcript but its message is not stored');
  assert(seen.torn===0,'repeat '+r+': the reading tab never saw torn state: '+JSON.stringify(seen));
  assert(seen.vanished.every(v=>v==='ct/a1'),'repeat '+r+': nothing vanished from the transcript except the answer an edit dropped: '+seen.vanished.join());
  for(const p of writers){const text=await toasts(p);if(/did not overwrite|not saved|was not cleared|could not be saved/i.test(text))conflictsSeen++;}
 }
 assert(conflictsSeen===0,'no tab was told of a conflict or refusal in the plain race: '+conflictsSeen);
 ok('6 writing tabs (Send, Send, prompt edit, history import, chat delete, facade receive) + 1 reading tab, '+REPEATS+' repeats: no lost update, no duplicate, no torn read, no silent refusal, transcript and ledger agree');

 // 2. Delete all chat history against senders and a facade receive: nothing comes back, a refused tab says so
 let cleared=0,refusedTold=0;
 for(let r=0;r<REPEATS;r++){
  await reseed(all);
  await Promise.all([A,B,C,D].map(p=>open(p,'ct')));
  const watching=reader(watcher);
  await Promise.all([arm(A,'send',{text:'before clear A '+r}),arm(B,'send',{text:'before clear B '+r}),arm(C,'clear',{}),arm(D,'receive',{participant:'p:c-'+r,text:'late '+r,occurrence:'late-'+r,L:LEDGER})]);
  await release([A,B,C,D]);
  const out=await finish([A,B,C,D]);const seen=await stopReader(watcher,watching);
  await new Promise(res=>setTimeout(res,600));
  const s=await stored(main);
  assert(seen.torn===0,'clear repeat '+r+': no torn read');
  const wasCleared=s.ledger&&s.ledger.epoch>=1;assert(wasCleared,'clear repeat '+r+': the Clear took effect (epoch moved): '+JSON.stringify(s.ledger&&{epoch:s.ledger.epoch}));cleared++;
  assert(!s.chat||s.chat.length===0,'clear repeat '+r+': no chat exists after Clear (nothing resurrected): '+JSON.stringify((s.chat||[]).map(t=>t.id)));
  assert(Object.keys(s.ledger.events).length===0&&Object.keys(s.ledger.encounters).filter(k=>!k.startsWith('enc:ext:')).length===0,'clear repeat '+r+': no record exists after Clear');
  assert(!s.ledger.intent,'clear repeat '+r+': no intent left');
  for(const [p,o,name] of [[A,out[0],'A'],[B,out[1],'B'],[D,out[3],'D']]){
   const last=await p.evaluate(()=>window.plcApp.encounters.lastResult());
   if(last&&!last.ok){assert(last.code==='stale','clear repeat '+r+': '+name+' was refused with an explicit code: '+last.code);assert(/cleared in another tab/.test(await toasts(p)),'clear repeat '+r+': '+name+' says so in words');refusedTold++;}
   if(name==='D'&&o&&!o.ok)assert(['stale','no-such-conversation'].includes(o.code),'clear repeat '+r+': the late receive was refused explicitly: '+o.code);
  }
 }
 ok('Delete all chat history against 2 Sends and a receive, '+REPEATS+' repeats: cleared every time, nothing resurrected in either store, '+refusedTold+' refused saves were told in words');

 // 3. the lock is the path, and a tab torn down holding it does not block the others
 for(let r=0;r<REPEATS;r++){
  await reseed(all);
  await open(A,'ct');
  const holder=await newTab();
  await holder.evaluate(()=>new Promise(res=>{navigator.locks.request('plc-encounters',()=>{res();return new Promise(()=>{});});}));
  const before=await stored(main);
  await A.fill('#messageInput','waiting for the lock '+r);await A.click('#sendBtn');
  await new Promise(res=>setTimeout(res,350));
  const during=await stored(main);
  assert(JSON.stringify(during.chat)===JSON.stringify(before.chat)&&JSON.stringify(during.ledger)===JSON.stringify(before.ledger),'repeat '+r+': nothing is written while another tab holds the lock (the save waits on it)');
  assert(await A.locator('.message.user:has-text("waiting for the lock")').count()===1,'repeat '+r+': the message is on screen meanwhile');
  await holder.close({runBeforeUnload:false});
  const after=await within(until(async()=>{const v=await stored(main);const t=v.chat?.find(x=>x.id==='ct');return t?.messages.some(m=>m.content==='waiting for the lock '+r)&&v.ledger&&Object.values(v.ledger.events).some(e=>e.content?.text==='waiting for the lock '+r)&&v;},'the waiting save'),25000,'the save after the holder was gone');
  assert(unique(after.chat.find(x=>x.id==='ct').messages.map(m=>m.id)),'repeat '+r+': no duplicate after the wait');
 }
 ok('the Web Lock is the path: a Send waits for another tab\'s hold, writes nothing meanwhile, completes when the holder is torn down (tab teardown, not a process kill), '+REPEATS+' repeats');

 assert(h.errors.filter(e=>!/ResizeObserver|API responded with status 500|network error/.test(e)).length===0,'no page errors: '+h.errors.join(' | '));
 console.log('encounters-concurrency e2e: ok');
}catch(e){console.error(e);process.exitCode=1;}
finally{await h.close();}
