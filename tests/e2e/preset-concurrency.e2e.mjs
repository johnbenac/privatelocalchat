// Several tabs changing the one stored preset list at once (chat/assistant/preset-store.mjs: the Web Lock "plc-presets", a fresh read, one change, a checked write). Every writer of the
// key goes through that store: a preset import, a manual Save as preset, edit and delete, and the presets of a restored backup.
// Real Chromium pages share one profile (so one localStorage and one lock manager), are released together by a BroadcastChannel and run the app's own modules and, in the UI races,
// the app's own buttons. REPEATS = 20 each. The profile is a new folder under PLC_E2E_PROFILE_ROOT; E2E_PORT_OFFSET moves the port (base 18462).
//
// Invariants (stated before the run):
//   no lost update   every import, manual save, edit, delete and backup restore that reported success is in the stored list, exactly once, at the end
//   no corruption    the stored text always parses as a list of {id,name,prompt} with unique ids, also when a tab is closed (torn down, no unload handlers) in the middle
//   no torn read     a reader tab that polls the whole time never sees unparseable text, and never sees an id vanish that nobody deleted
//   no silent conflict  two tabs importing the same name at once: one wins, the other is told (a conflict), nothing is added or dropped quietly
//   no silent overwrite two Edit dialogs opened on the same record: the one committed edit survives, the stale submit is told and stores nothing, its text is kept for a retry
//   no deadlock      a tab closed (torn down, not a process kill) while holding the lock does not block the others; every actor finishes inside a timeout
//                    (actual SIGKILL of a writer process around the real store: tests/preset-crash.test.mjs)
//   the lock is the path  while another tab holds "plc-presets" a change waits and writes nothing; it proceeds when the holder goes (the selected path is the Web Lock, not a bare write)
//   no rollback      nothing restores an earlier copy: a failed or unconfirmed write leaves whatever is stored
//   node scripts/e2e.mjs preset-concurrency
import {launch,assert} from './harness.mjs';
import {newProfileDir} from './profile-root.mjs';
const REPEATS=20,ok=n=>console.log('PASS '+n);
const h=await launch({port:18462,profileDir:newProfileDir('preset-concurrency')});
const {context}=h;const origin=h.origin;
const KEY='plc.presets.v1';
const ready=async page=>{await page.waitForSelector('#messageInput');await page.waitForFunction(()=>window.__plcBooted===true&&Boolean(window.plcShell),null,{timeout:20000});};
const within=(promise,ms,what)=>Promise.race([promise,new Promise((_,rej)=>setTimeout(()=>rej(new Error('no deadlock: '+what+' did not finish in '+ms+' ms')),ms))]);
const newTab=async()=>{const p=await context.newPage();p.on('pageerror',e=>h.errors.push(e.message));await p.goto(origin+'/');await ready(p);return p;};
const base=page=>page.evaluate(()=>'/releases/'+window.APP_BUILD.commit+'/chat/assistant/');
const storedList=async page=>JSON.parse(await page.evaluate(k=>localStorage.getItem(k)||'[]',KEY));
const seed=[{id:'seed-edit',name:'Edit me',prompt:'v0'},{id:'seed-del',name:'Delete me',prompt:'gone'},{id:'seed-keep',name:'Keep me',prompt:'k'}];
const reset=async(pages,list)=>{for(const p of pages)await p.evaluate(()=>{window.__listening=false;window.__stop=false;});await pages[0].evaluate(([k,l])=>localStorage.setItem(k,JSON.stringify(l)),[KEY,list]);};
// an actor runs its operations through the app's real store module as soon as the channel fires
const actor=(page,b,ops)=>page.evaluate(async({ops,b,KEY})=>{
  const {createPresetStore,editPresetChange}=await import(b+'preset-store.mjs'),{admitPreset,mergeBackupPresets}=await import(b+'preset-candidate.mjs');
  const store=createPresetStore({storage:localStorage,key:KEY});
  await new Promise(r=>{const c=new BroadcastChannel('t465-go');c.onmessage=()=>r();window.__listening=true;});
  const out=[];
  for(const op of ops){
    const makeId=()=>'preset-'+op.tag+'-'+crypto.randomUUID().slice(0,8);
    let r;
    if(op.kind==='import')r=await store.mutate(list=>{const a=admitPreset(list,{name:op.name,prompt:op.prompt},{makeId,keepSeparate:Boolean(op.keep)});return a.ok?{list:a.list,result:{ok:true,id:a.preset.id}}:{result:{ok:false,code:a.code}};});
    else if(op.kind==='restore')r=await store.mutate(list=>{const m=mergeBackupPresets(list,op.items,makeId);return m.added?{list:m.list,result:{ok:true,added:m.added}}:{result:{ok:true,added:0}};});
    else if(op.kind==='save')r=await store.mutate(list=>({list:[...list,{id:op.id,name:op.name,prompt:op.prompt}],result:{ok:true,id:op.id}}));
    else if(op.kind==='edit'){r=await store.mutate(editPresetChange({id:op.id,name:op.expectedName,prompt:op.expectedPrompt},op.prompt));if(r.ok)r={...r,result:{ok:r.result.status==='saved',code:r.result.status}};}
    else if(op.kind==='delete')r=await store.mutate(list=>({list:list.filter(p=>p.id!==op.id),result:{ok:true,id:op.id}}));
    out.push({kind:op.kind,name:op.name,ok:r.ok,result:r.result,code:r.code});
  }
  return out;
},{ops,b,KEY});
const release=async(pages)=>{for(const p of pages)await within(p.waitForFunction(()=>window.__listening===true),10000,'an actor to start listening');await pages[0].evaluate(()=>{const c=new BroadcastChannel('t465-go');c.postMessage(1);c.close();});};
const reader=(page)=>page.evaluate(async(KEY)=>{
  const seen=new Set(),vanished=[],stats={reads:0,torn:0,invalid:0};
  while(!window.__stop){
    const raw=localStorage.getItem(KEY);stats.reads++;
    if(raw){let list;try{list=JSON.parse(raw);}catch{stats.torn++;list=null;}
      if(list){if(!Array.isArray(list)||list.some(p=>!p||typeof p.id!=='string'||typeof p.name!=='string'||typeof p.prompt!=='string')||new Set(list.map(p=>p.id)).size!==list.length)stats.invalid++;
        else{const ids=new Set(list.map(p=>p.id));for(const id of seen)if(!ids.has(id)&&id!=='seed-del')vanished.push(id);for(const id of ids)seen.add(id);}}}
    await new Promise(r=>setTimeout(r,0));
  }
  return {...stats,vanished};
},KEY);

try{
 const main=h.page;await ready(main);
 const writers=[main,await newTab(),await newTab(),await newTab()],watcher=await newTab();
 const b=await base(main);
 const all=[...writers,watcher];
 for(const p of all)assert(await p.evaluate(()=>Boolean(navigator.locks&&navigator.locks.request)),'every tab has Web Locks: the lock path is the one under test');

 // 0. control: the earlier way (each tab keeps the list it read at start and writes it whole) loses updates under the same release, so the checks below can fail
 let lossy=0;
 for(let repeat=0;repeat<REPEATS;repeat++){
  await reset(all,[]);
  const olds=writers.map((p,i)=>p.evaluate(async({i,KEY})=>{const mine=JSON.parse(localStorage.getItem(KEY)||'[]');await new Promise(r=>{const c=new BroadcastChannel('t465-go');c.onmessage=()=>r();window.__listening=true;});
    await new Promise(r=>setTimeout(r,Math.random()*5));mine.push({id:'old-'+i,name:'Old '+i,prompt:'x'});localStorage.setItem(KEY,JSON.stringify(mine));},{i,KEY}));
  await release([...writers]);await within(Promise.all(olds),10000,'the control tabs');
  if((await storedList(main)).length<writers.length)lossy++;
 }
 assert(lossy>0,'the control never lost an update in '+REPEATS+' tries, so it proves nothing');
 ok('control: the earlier whole-list write lost an update in '+lossy+' of '+REPEATS+' releases');

 // 1. same and different operations on the one record, 4 writing tabs and 1 reading tab, released together; one tab restores a backup's presets in the middle of it
 for(let repeat=0;repeat<REPEATS;repeat++){
  await reset(all,seed);
  const ops=[
   [{kind:'import',tag:'a',name:'A1',prompt:'a1'},{kind:'import',tag:'a',name:'A2',prompt:'a2'},{kind:'save',id:'manual-1',name:'Manual',prompt:'m'},{kind:'edit',id:'seed-edit',expectedName:'Edit me',expectedPrompt:'v0',prompt:'v1'}],
   [{kind:'import',tag:'b',name:'B1',prompt:'b1'},{kind:'delete',id:'seed-del'},{kind:'import',tag:'b',name:'Twin',prompt:'from b'}],
   [{kind:'import',tag:'c',name:'C1',prompt:'c1'},{kind:'import',tag:'c',name:'Twin',prompt:'from c'},{kind:'import',tag:'c',name:'C2',prompt:'c2'}],
   [{kind:'import',tag:'d',name:'D1',prompt:'d1'},{kind:'import',tag:'d',name:'D1',prompt:'d1'},{kind:'import',tag:'d',name:'D1 again',prompt:'d1',keep:true},
    {kind:'restore',tag:'r',items:[{name:'R1',prompt:'r1'},{name:'Keep me',prompt:'a backup never replaces a name already here'},{name:'R2',prompt:'r2'}]}]
  ];
  const watching=reader(watcher);
  const runs=writers.map((p,i)=>actor(p,b,ops[i]));
  await release([...writers]);
  const results=await within(Promise.all(runs),20000,'the writing tabs');
  await watcher.evaluate(()=>{window.__stop=true;});const seen=await within(watching,10000,'the reading tab');
  const final=await storedList(main),ids=final.map(p=>p.id);
  assert(new Set(ids).size===ids.length,'repeat '+repeat+': no duplicate ids '+ids.join());
  assert(final.every(p=>typeof p.id==='string'&&typeof p.name==='string'&&typeof p.prompt==='string'),'repeat '+repeat+': every record is whole');
  const flat=results.flat();
  for(const name of ['A1','A2','B1','C1','C2','R1','R2'])assert(final.filter(p=>p.name===name).length===1,'repeat '+repeat+': '+name+' is stored exactly once');
  assert(final.filter(p=>p.name==='Keep me').length===1&&final.find(p=>p.name==='Keep me').prompt==='k','repeat '+repeat+': the restore did not replace a preset of the same name');
  assert(final.some(p=>p.id==='manual-1'),'repeat '+repeat+': the manual save is there');
  assert(final.find(p=>p.id==='seed-edit')?.prompt==='v1','repeat '+repeat+': the manual edit is there');
  assert(!final.some(p=>p.id==='seed-del')&&final.some(p=>p.id==='seed-keep'),'repeat '+repeat+': the delete held and nothing else went');
  const twinsWon=final.filter(p=>p.name==='Twin').length;assert(twinsWon===1,'repeat '+repeat+': one winner for the shared name, got '+twinsWon);
  const twinResults=flat.filter(r=>r.name==='Twin');assert(twinResults.filter(r=>r.result.ok).length===1&&twinResults.filter(r=>!r.result.ok&&r.result.code==='conflict').length===1,'repeat '+repeat+': the other tab was told of the conflict: '+JSON.stringify(twinResults));
  const d1=flat.filter(r=>r.name==='D1');assert(d1.filter(r=>r.result.ok).length===1&&d1.filter(r=>r.result.code==='conflict').length===1,'repeat '+repeat+': a repeated import by one tab is reported, not silently added: '+JSON.stringify(d1));
  assert(final.filter(p=>p.name==='D1 again').length===1,'repeat '+repeat+': the explicit keep-separate answer was honoured');
  assert(flat.every(r=>r.ok),'repeat '+repeat+': every store call finished');
  assert(final.length===13,'repeat '+repeat+': the total is exactly what was meant (3 seeds - 1 deleted + manual + A1 A2 B1 C1 C2 + Twin + D1 + D1 again + R1 R2 = 13), got '+final.length);
  assert(seen.torn===0&&seen.invalid===0&&seen.vanished.length===0,'repeat '+repeat+': the reading tab saw no torn, invalid or vanishing state: '+JSON.stringify(seen));
 }
 ok('4 writing tabs + 1 reading tab, imports, manual changes and a backup restore, '+REPEATS+' repeats: no lost update, no duplicate, no torn read, conflicts reported');

 // 2. the buttons themselves: two tabs press Add at the same moment
 const [p0,p1]=[main,writers[1]];
 for(const p of [p0,p1]){await p.reload();await ready(p);await p.waitForFunction(()=>!document.querySelector('#messageInput').disabled);await p.click('#shellPlus');await p.click('.shell-pop .shell-pop-row:has-text("Instructions for this chat")');}
 const candidate=JSON.stringify({id:'cosmogenitor:subject:emma',name:'Emma',prompt:'Portray Emma.'});
 const openReview=async(p,json)=>{const [c]=await Promise.all([p.waitForEvent('filechooser'),p.click('#importPresetBtn')]);await c.setFiles({name:'c.json',mimeType:'application/json',buffer:Buffer.from(json)});await p.locator('.app-dialog:has-text("Review preset")').waitFor();};
 for(let repeat=0;repeat<REPEATS;repeat++){
  await p0.evaluate(k=>localStorage.removeItem(k),KEY);
  await Promise.all([openReview(p0,candidate),openReview(p1,candidate)]);
  await Promise.all([p0.click('.app-dialog button:has-text("Add preset")'),p1.click('.app-dialog button:has-text("Add preset")')]);
  await within(Promise.all([p0,p1].map(p=>p.waitForFunction(()=>!document.querySelector('.app-dialog')||/already have a preset/.test(document.querySelector('.preset-review-status')?.textContent||''),null,{timeout:10000}))),15000,'both Add buttons');
  let list=await storedList(p0);assert(list.length===1&&list[0].name==='Emma','UI repeat '+repeat+': one preset, not two and not none: '+JSON.stringify(list));
  let losers=0;
  for(const p of [p0,p1]){if(await p.locator('.app-dialog:has-text("Review preset")').count()){losers++;
    assert(/already have a preset called “Emma”|same instructions/.test(await p.locator('.preset-review-status').innerText()),'UI repeat '+repeat+': the second tab is told, in words');
    assert(await p.locator('.app-dialog .dialog-actions .primary').innerText()==='Keep as a separate preset','UI repeat '+repeat+': and offered the explicit answer');
    if(repeat%2===0){await p.click('.app-dialog button:has-text("Cancel")');}else{await p.click('.app-dialog button:has-text("Keep as a separate preset")');await p.waitForFunction(()=>!document.querySelector('.app-dialog'));}}}
  assert(losers===1,'UI repeat '+repeat+': exactly one tab lost the race and was asked');
  list=await storedList(p0);assert(list.length===(repeat%2===0?1:2),'UI repeat '+repeat+': the answer was honoured: '+list.length);
  assert(new Set(list.map(p=>p.id)).size===list.length,'UI repeat '+repeat+': unique ids');
 }
 ok('two tabs press Add together, '+REPEATS+' repeats: one wins, the other is asked, nothing silent');

 // 3. an import in one tab against a manual "Save as preset" in another
 for(let repeat=0;repeat<REPEATS;repeat++){
  await p0.evaluate(k=>localStorage.removeItem(k),KEY);
  await p1.fill('#systemPromptInput','Talk like a pirate.');await p1.click('#savePresetBtn');await p1.fill('.app-dialog input','Pirate');
  await openReview(p0,JSON.stringify({name:'Imported '+repeat,prompt:'Imported text.'}));
  await Promise.all([p0.click('.app-dialog button:has-text("Add preset")'),p1.click('.app-dialog button:has-text("Save preset")')]);
  await within(Promise.all([p0,p1].map(p=>p.waitForFunction(()=>!document.querySelector('.app-dialog'),null,{timeout:10000}))),15000,'import and manual save');
  // Closing the prompt precedes the asynchronous locked save. The selected fresh preset acknowledges completion.
  await p1.waitForFunction(k=>{const id=document.querySelector('#presetSelect')?.value;return JSON.parse(localStorage.getItem(k)||'[]').some(p=>p.id===id&&p.name==='Pirate'&&p.prompt==='Talk like a pirate.');},KEY,{timeout:10000});
  const list=await storedList(p0);
  assert(list.length===2&&list.some(p=>p.name==='Pirate')&&list.some(p=>p.name==='Imported '+repeat),'UI manual+import repeat '+repeat+': both are kept '+JSON.stringify(list.map(p=>p.name)));
  await p1.evaluate(()=>{document.querySelector('#systemPromptInput').value='';});
 }
 ok('an import and a manual Save as preset at the same moment, '+REPEATS+' repeats: both kept');

 // 3b. a real backup restore (the app's own import of a plc-backup/1 file with "also restore presets") in one tab against an import in another
 const backupFile=(n)=>JSON.stringify({format:'plc-backup/1',exportedAt:1,threads:[{id:'bk-'+n,title:'Backup chat '+n,created:1,updated:1,messages:[{role:'user',content:'hello'}]}],
   presets:[{name:'Restored '+n,prompt:'from the backup'},{name:'Emma',prompt:'a backup never replaces this name'}]});
 for(let repeat=0;repeat<REPEATS;repeat++){
  await p0.evaluate(([k,l])=>localStorage.setItem(k,JSON.stringify(l)),[KEY,[{id:'emma-own',name:'Emma',prompt:'mine'}]]);
  await p0.reload();await ready(p0);await p0.waitForFunction(()=>!document.querySelector('#messageInput').disabled);await p0.click('#shellPlus');await p0.click('.shell-pop .shell-pop-row:has-text("Instructions for this chat")');
  await p1.setInputFiles('#importInput',{name:'backup.json',mimeType:'application/json',buffer:Buffer.from(backupFile(repeat))});
  await p1.locator('.app-dialog:has-text("Import")').waitFor();
  await openReview(p0,JSON.stringify({name:'Imported by hand '+repeat,prompt:'Imported text.'}));
  await Promise.all([p0.click('.app-dialog button:has-text("Add preset")'),p1.click('.app-dialog .dialog-actions .primary')]);
  await within(Promise.all([p0,p1].map(p=>p.waitForFunction(()=>!document.querySelector('.app-dialog'),null,{timeout:10000}))),15000,'import and backup restore');
  await p0.waitForFunction(([k,n])=>(JSON.parse(localStorage.getItem(k)||'[]')).some(p=>p.name==='Restored '+n),[KEY,repeat],{timeout:10000});
  const list=await storedList(p0);
  assert(list.length===3&&list.filter(p=>p.name==='Emma').length===1&&list.find(p=>p.name==='Emma').prompt==='mine'&&list.some(p=>p.name==='Restored '+repeat)&&list.some(p=>p.name==='Imported by hand '+repeat),
   'UI restore+import repeat '+repeat+': the restored preset, the imported one and the existing Emma are all kept, Emma unchanged: '+JSON.stringify(list.map(p=>p.name)));
  assert(new Set(list.map(p=>p.id)).size===list.length,'UI restore+import repeat '+repeat+': unique ids');
 }
 ok('a backup restore and a preset import at the same moment, '+REPEATS+' repeats: both kept, nothing replaced');

 // 3c. two real Edit dialogs opened on the same preset (same stored v0) in two tabs, then submitted with different text. Even repeats: both Save buttons pressed at the same moment;
 //     odd repeats: A saved, then B (a stale editor submitting after a newer save). One committed edit survives; the stale tab is told in words and stores nothing; its proposed text is
 //     kept, shown again by the next Edit of that preset (now against the newer record), and a retry from there is saved. No silent overwrite, no deadlock.
 const openEdit=async(p)=>{await p.click('button[aria-label="This device menu"]');await p.click('.shell-pop .shell-pop-row:has-text("Memory & preferences")');
  await p.locator('.app-dialog .list-row:has-text("Contested") button:has-text("Edit")').click();await p.locator('.app-dialog:has-text("Edit preset")').waitFor();};
 const editBox=p=>p.locator('.app-dialog:has-text("Edit preset") textarea');
 for(let repeat=0;repeat<REPEATS;repeat++){
  const rec={id:'seed-contested',name:'Contested',prompt:'v0'};
  await p0.evaluate(([k,l])=>localStorage.setItem(k,JSON.stringify(l)),[KEY,[{id:'other',name:'Other',prompt:'o'},rec]]);
  for(const p of [p0,p1]){await p.reload();await ready(p);await p.waitForFunction(()=>!document.querySelector('#messageInput').disabled);}
  await Promise.all([openEdit(p0),openEdit(p1)]);
  await editBox(p0).fill('A '+repeat);await editBox(p1).fill('B '+repeat);
  const save=p=>p.locator('.app-dialog:has-text("Edit preset") button:has-text("Save")').click();
  if(repeat%2===0)await within(Promise.all([save(p0),save(p1)]),15000,'both Save buttons');
  else{await save(p0);await p0.waitForFunction(([k,t])=>(JSON.parse(localStorage.getItem(k)||'[]')).some(p=>p.id==='seed-contested'&&p.prompt===t),[KEY,'A '+repeat],{timeout:10000});await save(p1);}
  await within(Promise.all([p0,p1].map(p=>p.waitForFunction(()=>![...document.querySelectorAll('.app-dialog')].some(d=>/Edit preset/.test(d.textContent)),null,{timeout:10000}))),15000,'both edit dialogs to close');
  await p0.waitForFunction(k=>JSON.parse(localStorage.getItem(k)||'[]').find(p=>p.id==='seed-contested')?.prompt!=='v0',KEY,{timeout:10000}); // the dialog closes at once; the locked write follows
  let list=await storedList(p0);const won=list.find(p=>p.id==='seed-contested').prompt;
  assert(won==='A '+repeat||won==='B '+repeat,'UI edit repeat '+repeat+': exactly one committed edit survives: '+won);
  if(repeat%2===1)assert(won==='A '+repeat,'UI edit repeat '+repeat+': the stale second submit did not erase the earlier one');
  assert(list.length===2&&list.find(p=>p.id==='other').prompt==='o'&&list.find(p=>p.id==='seed-contested').name==='Contested','UI edit repeat '+repeat+': nothing else changed: '+JSON.stringify(list));
  const [winner,loser,lost]=won==='A '+repeat?[p0,p1,'B '+repeat]:[p1,p0,'A '+repeat];
  await loser.waitForFunction(()=>/was not saved/.test(document.body.innerText),null,{timeout:10000});
  assert(!/was not saved/.test(await winner.evaluate(()=>document.body.innerText)),'UI edit repeat '+repeat+': the winner was not told of a conflict');
  assert(await loser.locator('.app-dialog .list-row:has-text("Contested") .muted').innerText()===won,'UI edit repeat '+repeat+': the loser\'s list now shows the newer text');
  // retry: the next Edit opens on the newer record with the refused text kept for the person
  await loser.locator('.app-dialog .list-row:has-text("Contested") button:has-text("Edit")').click();await loser.locator('.app-dialog:has-text("Edit preset")').waitFor();
  assert(await editBox(loser).inputValue()===lost,'UI edit repeat '+repeat+': the refused text was kept for retry');
  await save(loser);await loser.waitForFunction(()=>![...document.querySelectorAll('.app-dialog')].some(d=>/Edit preset/.test(d.textContent)),null,{timeout:10000});
  await p0.waitForFunction(([k,t])=>JSON.parse(localStorage.getItem(k)||'[]').find(p=>p.id==='seed-contested')?.prompt===t,[KEY,lost],{timeout:10000});
  list=await storedList(p0);assert(list.find(p=>p.id==='seed-contested').prompt===lost&&list.length===2,'UI edit repeat '+repeat+': the retry from the newer record was saved: '+JSON.stringify(list));
 }
 ok('two Edit dialogs on one preset, '+REPEATS+' repeats: one edit committed, the stale one is told and stores nothing, its text kept, retry saved');

 // 4. abrupt ends: the lock is the path, a tab torn down while holding the lock, and a tab torn down in the middle of a stream of writes.
 //    NOTE: page.close({runBeforeUnload:false}) is an orderly tab teardown with no unload handlers. It proves a real browser frees the tab's Web Lock and that the others carry on;
 //    it is NOT a process kill. The SIGKILL of a writer process around the real store module is tests/preset-crash.test.mjs.
 const mutateNow=(page,name)=>page.evaluate(async({b,KEY,name})=>{const {createPresetStore}=await import(b+'preset-store.mjs');const store=createPresetStore({storage:localStorage,key:KEY});
   const r=await store.mutate(list=>({list:[...list,{id:'now-'+crypto.randomUUID().slice(0,8),name,prompt:'x'}]}));return {ok:r.ok,code:r.code};},{b,KEY,name});
 // 4.0 the selected path: while another tab holds the lock, a change waits and writes nothing, and it goes through once the holder is gone
 for(let repeat=0;repeat<REPEATS;repeat++){
  await main.evaluate(k=>localStorage.removeItem(k),KEY);
  const holder=await newTab();
  await holder.evaluate(()=>new Promise(res=>{navigator.locks.request('plc-presets',()=>{res();return new Promise(()=>{});});}));
  const waiting=mutateNow(main,'Waited '+repeat);
  await new Promise(r=>setTimeout(r,150));
  assert((await storedList(main)).length===0,'repeat '+repeat+': nothing was written while another tab held the lock (the change is waiting on it)');
  await holder.close({runBeforeUnload:false});
  const done=await within(waiting,20000,'a change waiting for the lock');
  assert(done.ok&&(await storedList(main)).length===1,'repeat '+repeat+': the waiting change went through once the holder was gone: '+JSON.stringify(done));
 }
 ok('the Web Lock is the path: a change waits for another tab\'s hold, writes nothing meanwhile, then completes, '+REPEATS+' repeats');
 // 4a. a tab closed (no unload handlers; teardown, not a process kill) while it holds the lock
 for(let repeat=0;repeat<REPEATS;repeat++){
  await main.evaluate(k=>localStorage.removeItem(k),KEY);
  const victim=await newTab();
  await victim.evaluate(()=>new Promise(res=>{navigator.locks.request('plc-presets',()=>{res();return new Promise(()=>{});});}));
  const held=await main.evaluate(()=>navigator.locks.query().then(q=>q.held.some(l=>l.name==='plc-presets')));
  assert(held,'repeat '+repeat+': the victim really holds the lock');
  await victim.close({runBeforeUnload:false});
  const after=await within(mutateNow(main,'After kill '+repeat),20000,'a change after a tab died holding the lock');
  assert(after.ok,'repeat '+repeat+': the next change proceeds after the holder died: '+JSON.stringify(after));
  const list=await storedList(main);assert(list.length===1&&list[0].name==='After kill '+repeat,'repeat '+repeat+': and it is stored');
 }
 ok('a tab closed without unload handlers while holding the lock does not block the next change (tab teardown, not a process kill), '+REPEATS+' repeats');
 // 4b. a tab closed (teardown, not a process kill) in the middle of a stream of acknowledged writes, while another tab keeps importing
 for(let repeat=0;repeat<REPEATS;repeat++){
  await main.evaluate(k=>localStorage.removeItem(k),KEY);
  const killed=await newTab(),acked=[];
  await killed.exposeFunction('ack',id=>{acked.push(id);});
  const stream=killed.evaluate(async({b,KEY})=>{const {createPresetStore}=await import(b+'preset-store.mjs');const store=createPresetStore({storage:localStorage,key:KEY});
   for(let i=0;;i++){const id='k-'+i;const r=await store.mutate(list=>({list:[...list,{id,name:'K'+i,prompt:'p'.repeat(2000)}]}));if(r.ok)await window.ack(id);}},{b,KEY}).catch(()=>{});
  const concurrent=[];for(let i=0;i<4;i++)concurrent.push(mutateNow(main,'Other '+repeat+'-'+i));
  const until=Date.now()+15000;while(acked.length<8&&Date.now()<until)await new Promise(r=>setTimeout(r,5));
  assert(acked.length>=8,'repeat '+repeat+': the stream was running');
  await killed.close({runBeforeUnload:false});await stream;
  const results=await within(Promise.all(concurrent),20000,'the other tab\'s imports');assert(results.every(r=>r.ok),'repeat '+repeat+': the other tab was never blocked or failed: '+JSON.stringify(results));
  const list=await storedList(main),ids=list.map(p=>p.id);
  assert(new Set(ids).size===ids.length,'repeat '+repeat+': no duplicate ids after the kill');
  assert(list.every(p=>typeof p.id==='string'&&typeof p.name==='string'&&typeof p.prompt==='string'),'repeat '+repeat+': every record whole after the kill');
  for(const id of acked)assert(ids.includes(id),'repeat '+repeat+': acknowledged write '+id+' survived the kill');
  assert(list.filter(p=>p.name.startsWith('Other '+repeat+'-')).length===4,'repeat '+repeat+': the other tab\'s four imports all survived');
  const next=await mutateNow(main,'Recovered '+repeat);assert(next.ok,'repeat '+repeat+': the store works after the kill');
 }
 ok('a tab closed in the middle of acknowledged writes (teardown, not a process kill): stored list whole, acknowledged writes kept, others unaffected, '+REPEATS+' repeats');
 assert(h.errors.filter(e=>!/ResizeObserver/.test(e)).length===0,'no page errors: '+h.errors.join(' | '));
 console.log('preset-concurrency e2e: ok');
}catch(e){console.error(e);process.exitCode=1;}
finally{await h.close();}
