// Files saved by every release, opened by the build under test (docs/FILE-COMPATIBILITY.md).
// For each folder in tests/fixtures/files: the chat history file, the passphrase-encrypted backup and the settings file are opened through the app's own import, in a browser that holds nothing,
// and everything the file was made from must arrive. Then: a file from a newer format is refused whole and nothing changes; this build's own export opens again and loses nothing, including
// fields it does not know; and an import into chats held read-only because a newer version wrote them says so instead of reporting success.
//   node scripts/e2e.mjs file-import
process.env.PLC_E2E_BRANCH??='main'; // the production build, which is what people receive
const {launch,assert}=await import('./harness.mjs');
const {readFixture,restoreInPage,probeInPage,project,mismatch}=await import('../data/lib.mjs');
const {listFileFixtures,readFileFixture}=await import('../data/files.mjs');
const ok=n=>console.log('PASS '+n);

const names=listFileFixtures();
assert(names.length>0,'there is at least one saved-file snapshot in tests/fixtures/files');
const h=await launch({port:18531});
const {page,errors,origin}=h;
const ready=async()=>{await page.waitForSelector('#messageInput');await page.waitForFunction(()=>window.__plcBooted===true&&Boolean(window.plcShell),null,{timeout:30000});await page.waitForFunction(()=>!document.querySelector('#messageInput').disabled);};
const blank=async dump=>{await page.goto(origin+'/version.json');if(dump)await page.evaluate(restoreInPage,dump);else await page.evaluate(async()=>{localStorage.clear();sessionStorage.clear();for(const {name} of await indexedDB.databases())await new Promise(r=>{const q=indexedDB.deleteDatabase(name);q.onsuccess=q.onerror=q.onblocked=()=>r();});localStorage.setItem('plc.lockSplash.v1','off');});};
const open=async dump=>{await blank(dump);await page.goto(origin+'/');await ready();};
const probe=async()=>project(await page.evaluate(probeInPage));
const dialogText=async()=>{await page.waitForSelector('.app-dialog',{timeout:15000});return page.locator('.app-dialog').innerText();};
const closeDialog=async()=>{await page.keyboard.press('Escape');await page.waitForSelector('.app-dialog',{state:'detached',timeout:5000}).catch(()=>{});};
// everything stored for the person, without the voice settings the app writes by itself a moment after it starts
const userStorage=()=>page.evaluate(()=>JSON.stringify(Object.entries(localStorage).filter(([k])=>!k.startsWith('plc.voice')).sort()));
const chooseHistory=(name,text)=>page.setInputFiles('#importInput',{name,mimeType:'application/json',buffer:Buffer.from(text)});
const rawLocal=key=>page.evaluate(k=>localStorage.getItem(k),key);
const chatsOf=p=>(p.local.chatThreads||[]).filter(t=>t.messages?.length); // a browser that holds nothing starts with one empty chat, which an import adds to
const importAll=async()=>{ // the preview, with everything ticked, then Import
  await page.waitForSelector('.app-dialog button:has-text("Import")',{timeout:15000});
  await page.click('.app-dialog button:has-text("Import")');
  await page.waitForSelector('.app-dialog',{state:'detached',timeout:10000});
  await page.waitForTimeout(1200);
};
const unlock=async pass=>{await page.waitForSelector('.app-dialog input',{timeout:15000});await page.fill('.app-dialog input',pass);await page.click('.app-dialog button:has-text("Unlock backup")');};
const sealed=(format,inner,pass)=>page.evaluate(async({format,inner,pass})=>{const c=await import(window.plcApp.moduleBase()+'chat/crypto.mjs');const env=await c.encryptString(JSON.stringify(inner),pass,{iterations:2000});return JSON.stringify(format?{...env,format}:env);},{format,inner,pass});

let found,bad;
try{
  for(const name of names){
    const fx=readFileFixture(name);
    const data=readFixture(fx.meta.dataFixture).plain.expected;
    const label=`${fx.meta.release} (${fx.meta.commit})`;

    // 1. the chat history file
    await open();
    await chooseHistory('chat-history.json',fx.text('history.json'));
    await importAll();
    found=await probe();
    bad=mismatch(chatsOf(data),chatsOf(found));
    assert(!bad,label+': the chat history file lost something: '+bad);
    assert(!errors.filter(e=>!/Failed to refresh models/.test(e)).length,label+': errors: '+errors.join(' | '));
    ok(label+': the chat history file opens with every chat');

    // 2. the encrypted backup: chats, projects, memory, presets, preferences, documents
    await open();
    await chooseHistory('backup.encrypted.json',fx.text('encrypted-backup.json'));
    await unlock(fx.meta.passphrase);
    await importAll();
    found=await probe();
    bad=mismatch(chatsOf(data),chatsOf(found));
    assert(!bad,label+': the backup lost a chat: '+bad);
    const want=(list,pick)=>(list||[]).map(pick).sort(),have=(list,pick)=>(list||[]).map(pick).sort();
    assert(JSON.stringify(want(data.local['plc.folders.v1'],f=>f.name))===JSON.stringify(have(found.local['plc.folders.v1'],f=>f.name)),label+': projects: '+JSON.stringify(found.local['plc.folders.v1']));
    assert(JSON.stringify(want(data.local['plc.memory.v1']?.items,i=>i.text))===JSON.stringify(have(found.local['plc.memory.v1']?.items,i=>i.text)),label+': memory: '+JSON.stringify(found.local['plc.memory.v1']));
    assert(JSON.stringify(want(data.local['plc.presets.v1'],p=>p.name+'|'+p.prompt))===JSON.stringify(have(found.local['plc.presets.v1'],p=>p.name+'|'+p.prompt)),label+': presets: '+JSON.stringify(found.local['plc.presets.v1']));
    assert(JSON.stringify(want(data.docs,d=>d.name+'|'+d.text))===JSON.stringify(have(found.docs,d=>d.name+'|'+d.text)),label+': documents: '+JSON.stringify(found.docs.map(d=>d.name)));
    ok(label+': the encrypted backup opens with chats, projects, memory, presets and documents');

    // 3. a wrong passphrase changes nothing
    await open();
    await chooseHistory('backup.encrypted.json',fx.text('encrypted-backup.json'));
    await unlock('not the passphrase');
    await page.waitForFunction(()=>/did not unlock/.test(document.body.innerText),null,{timeout:15000});
    await closeDialog();
    assert(await rawLocal('chatThreads')===null||JSON.parse(await rawLocal('chatThreads')).filter(t=>t.messages?.length).length===0,label+': nothing was imported after a wrong passphrase');
    ok(label+': a wrong passphrase imports nothing');

    // 4. the settings file
    await open();
    await page.setInputFiles('#importConfigInput',{name:'private-local-chat-settings.json',mimeType:'application/json',buffer:Buffer.from(fx.text('settings.json'))});
    await page.waitForSelector('#importSettingsBtn',{timeout:15000});
    const review=await dialogText();
    assert(/fake-model/.test(review),label+': the review shows the model: '+review);
    await page.click('#importSettingsBtn');
    await page.waitForFunction(()=>JSON.parse(sessionStorage.getItem('chatConfig')||'{}').model==='fake-model',null,{timeout:10000});
    ok(label+': the settings file opens and applies');
  }

  // 5. a file from a newer format is refused whole, and nothing changes
  const newest=readFileFixture(names[names.length-1]);
  const history=JSON.parse(newest.text('history.json'));
  const newer={
    history:JSON.stringify({format:'plc-history/9',exportedAt:1,app:{version:'9.0.0',commit:null},threads:Array.isArray(history)?history:history.threads}),
    settings:JSON.stringify({format:'plc-settings-transfer/9',settings:{endpoint:'https://x.example/v1',model:'future-model'}})
  };
  await open();
  const before={threads:await rawLocal('chatThreads'),all:await userStorage()};
  await chooseHistory('chat-history.json',newer.history);
  let text=await dialogText();
  assert(/Import failed/.test(text)&&/newer version/.test(text)&&/Nothing was changed/.test(text),'a newer chat history file is refused in plain words: '+text);
  await closeDialog();
  await chooseHistory('backup.encrypted.json',await sealed('plc-encrypted-backup/9',{threads:[]},'correct horse'));
  text=await dialogText();
  assert(/newer version/.test(text)&&/Nothing was changed/.test(text)&&!/not an encrypted backup/.test(text),'a newer encrypted backup is called newer, not "not a backup": '+text);
  assert(await page.locator('.app-dialog input').count()===0,'and no passphrase is asked for first');
  await closeDialog();
  await chooseHistory('backup.encrypted.json',await sealed(null,{format:'plc-backup/9',threads:history.threads||history,memory:{items:[{text:'from the future'}]}},'correct horse'));
  await unlock('correct horse');
  text=await dialogText();
  assert(/newer version/.test(text)&&/Nothing was changed/.test(text),'a backup of a newer format inside a readable envelope is refused after unlocking: '+text);
  await closeDialog();
  await page.setInputFiles('#importConfigInput',{name:'s.json',mimeType:'application/json',buffer:Buffer.from(newer.settings)});
  await page.waitForSelector('.app-dialog',{timeout:15000});
  text=await dialogText();
  assert(/newer version/.test(text),'a newer settings file says so: '+text);
  await closeDialog();
  const afterAll=await userStorage();
  const diff=(a,b)=>{const x=Object.fromEntries(JSON.parse(a)),y=Object.fromEntries(JSON.parse(b));return [...new Set([...Object.keys(x),...Object.keys(y)])].filter(k=>x[k]!==y[k]).map(k=>k+': '+String(x[k]).slice(0,80)+' -> '+String(y[k]).slice(0,80));};
  assert(afterAll===before.all,'nothing was written by any refused file: '+diff(before.all,afterAll).join(' | '));
  assert(!/future-model|from the future/.test(await page.evaluate(()=>JSON.stringify([localStorage,sessionStorage]))),'nothing of the refused files arrived');
  ok('a file from a newer format is refused whole, in plain words, and nothing changes');

  // 6. this build's own export opens again and loses nothing, including fields it does not know
  const data=readFixture(newest.meta.dataFixture);
  await open(data.plain.storage);
  await page.evaluate(()=>document.getElementById('transferChatsBtn').click());
  await page.waitForSelector('#exportChatsBtn');
  const exportFile=async()=>{const [d]=await Promise.all([page.waitForEvent('download',{timeout:30000}),page.click('#exportChatsBtn')]);return (await import('node:fs')).readFileSync(await d.path(),'utf8');};
  const exported=await exportFile();
  const file=JSON.parse(exported);
  assert(file.format==='plc-history/1'&&file.app&&file.app.commit&&Array.isArray(file.threads),'the history file names its format and build: '+exported.slice(0,200));
  file.threads[0].futureField={kept:[1,2,3]};file.threads[0].messages[0].futureReaction='thumbs-up';
  await open();
  await chooseHistory('chat-history.json',JSON.stringify(file));
  await importAll();
  found=await probe();
  bad=mismatch(chatsOf(data.plain.expected),chatsOf(found));
  assert(!bad,'this build\'s own export lost something on the way back in: '+bad);
  const imported=JSON.parse(await rawLocal('chatThreads'));
  const back=imported.find(t=>t.id===file.threads[0].id);
  assert(back&&JSON.stringify(back.futureField)==='{"kept":[1,2,3]}'&&back.messages[0].futureReaction==='thumbs-up','fields this build does not know survive the import: '+JSON.stringify(back||imported).slice(0,300));
  await page.evaluate(()=>document.getElementById('transferChatsBtn').click());
  await page.waitForSelector('#exportChatsBtn');
  const again=JSON.parse(await exportFile());
  const byId=list=>Object.fromEntries(list.map(t=>[t.id,JSON.stringify(t)]));
  const a=byId(file.threads),b=byId(again.threads); // the empty chat a fresh browser starts with is extra and is not compared
  const changed=Object.keys(a).filter(id=>a[id]!==b[id]);
  assert(!changed.length,'export, import and export again changes nothing: '+changed.map(id=>a[id].slice(0,200)+' => '+String(b[id]).slice(0,200)).join(' || '));
  await closeDialog();
  ok('this build\'s own export opens again with nothing lost, unknown fields included');

  // 7. chats held read-only because a newer version wrote them: an import says so and saves nothing
  const held=JSON.parse(JSON.stringify(data.plain.storage));
  held.local['plc.formats.v1']=JSON.stringify({v:1,formats:{chatThreads:2}});
  await open(held);
  await closeDialog(); // the message that this browser holds newer data
  const heldBefore=await rawLocal('chatThreads');
  await chooseHistory('chat-history.json',exported);
  text=await dialogText();
  assert(/Import failed/.test(text)&&/newer version/.test(text)&&/Nothing was changed/.test(text),'an import into chats held for a newer version is refused in words: '+text);
  assert(await rawLocal('chatThreads')===heldBefore,'and the chats are exactly as they were');
  await closeDialog();
  ok('an import into chats a newer version wrote says so, and saves nothing');

  const unexpected=errors.filter(e=>!/Failed to refresh models/.test(e)); // applying a settings file refreshes the models of its endpoint, which was a test server that no longer exists
  assert(!unexpected.length,'page errors: '+unexpected.join(' | '));
  console.log(`ALL PASS (${names.length} saved-file snapshot${names.length===1?'':'s'})`);
}catch(error){
  console.error('FAIL '+(error.stack||error));
  await page.screenshot({path:'/tmp/file-import-failure.png'}).catch(()=>{});
  process.exitCode=1;
}finally{
  await h.close();
}
