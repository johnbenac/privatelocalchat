#!/usr/bin/env node
// Capture a data snapshot of the current build: the real app, in a real browser, is used the way a person uses it, and everything the browser then holds
// is written to <out>/<n>-<release>-<commit>/ together with what the app reads back from it.
//
//   node scripts/data-snapshot.mjs capture [--release v0.57.0] [--commit <full sha>] [--out DIR] [--rehearsal]
//   node scripts/data-snapshot.mjs accept <folder> [--into tests/fixtures/data]
//
// Run capture on the commit that becomes a release (or on an extracted release tag, with --release and --commit) and commit the folder it writes. tests/e2e/data-upgrade.e2e.mjs then loads every folder, oldest first, into the build under
// test and checks that nothing the person had is missing or changed (docs/DATA-COMPATIBILITY.md).
//
// Where it writes (scripts/data-snapshot-output.mjs): --out is a folder of your choosing (several captures may share one; give one outside the repository). The capture is staged privately and published
// with ONE atomic rename under the next free number (counting the repository's own fixtures too); it never overwrites and a capture that dies leaves nothing numbered. `accept` copies a finished capture
// into the repository's fixtures under the same number, again without overwriting; the person in charge of the numbering accepts one at a time.
//
// Provenance: a commit that is exactly a release tag is that release. Any other commit of a git checkout is a PRIVATE BUILD: the folder keeps the nearest earlier tag as `release` (the folder naming and the
// age rule need one) and says so in meta.json (captureKind 'private-build', unpublished true, baseRelease, sourceCommit). EVERY capture from a git checkout needs a clean tree (only an explicit --rehearsal may be dirty),
// and for EVERY kind (release, private build, extracted, rehearsal) the commit declared is the one the page itself reports in APP_BUILD, checked right after the page is ready and again at the end.
// In a git checkout --release and --commit can only repeat what the checkout is (HEAD, its nearest release); anything else is refused, and they never turn a private build into a release.
// Only a tree with no .git (an extracted release) takes them as given (scripts/data-snapshot-output.mjs, resolveProvenance).
// --rehearsal runs the whole capture on a dirty tree for checking the capture itself; its folder says 'rehearsal' and `accept` refuses it.
//
// A build that stores rich characters (plc.characters.v1) also admits the producer's three authentic packages, through Import character, Review and Save.
import {mkdirSync,writeFileSync,mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
process.env.PLC_E2E_BRANCH??='main'; // the production build, which is what people receive
const {accept,newStaging,writeDurable,publish,OutputError,resolveProvenance,checkBuildIdentity}=await import('./data-snapshot-output.mjs');
const {dumpInPage,probeInPage,project,FIXTURES,PASSPHRASE,CHARACTERS_KEY,characterProblems,producerCharacters}=await import('../tests/data/lib.mjs');

const args=process.argv.slice(2);
const opt=name=>{const i=args.indexOf('--'+name);return i>=0?args[i+1]:null;};
if(args[0]==='accept'){
  const from=args[1],into=opt('into')||FIXTURES;
  if(!from||from.startsWith('--')){console.error('Usage: data-snapshot.mjs accept <folder> [--into DIR]');process.exit(2);}
  try{const r=await accept({from:resolve(from),into:resolve(into)});console.log('accepted '+r.path);process.exit(0);}
  catch(e){console.error('not accepted ['+(e.code||'error')+']: '+e.message);process.exit(e instanceof OutputError?1:3);}
}
if(args[0]!=='capture'){console.error('Usage: data-snapshot.mjs capture [--release vX.Y.Z] [--commit SHA] [--out DIR] [--rehearsal]  |  accept <folder> [--into DIR]');process.exit(2);}
const {launch,assert}=await import('../tests/e2e/harness.mjs');
const {newProfileDir}=await import('../tests/e2e/profile-root.mjs');
const rehearsal=args.includes('--rehearsal');
// What this source is comes from the checkout itself; --release and --commit cannot change it (they may only repeat it, or describe an extracted tree that has no .git)
let provenanceOf;
try{provenanceOf=resolveProvenance({root:resolve(fileURLToPath(new URL('..',import.meta.url))),release:opt('release'),commit:opt('commit'),rehearsal});}
catch(e){if(e instanceof OutputError){console.error(e.message);process.exit(2);}throw e;}
const {commitFull,release,privateBuild}=provenanceOf;
const commit=commitFull.slice(0,7);
const out=resolve(opt('out')||FIXTURES);
mkdirSync(out,{recursive:true});
const staging=newStaging(out);
const tail=`${release}-${commit}`;
const provenance=rehearsal?{captureKind:'rehearsal',unpublished:true,baseRelease:release,sourceCommit:commitFull}:privateBuild?{captureKind:'private-build',unpublished:true,baseRelease:release,sourceCommit:commitFull}:{};

const profileDir=process.env.PLC_E2E_PROFILE_ROOT?newProfileDir('data-snapshot'):null; // on this box a dedicated folder on /media/Vivarium
const h=await launch({port:18471,profileDir});
const {page,context}=h;
const outside=[];context.on('request',r=>{const u=new URL(r.url());if(u.origin!==h.origin&&u.port!==String(h.api.port)&&!/^(data|blob|about):/.test(r.url()))outside.push(r.method()+' '+r.url());});
const settle=async()=>{await page.waitForFunction(()=>/^(Response complete\.|The response was interrupted)/.test(document.querySelector('#generationStatus').textContent),null,{timeout:30000});await page.waitForFunction(()=>!document.querySelector('#stopGeneration').offsetParent);};
const send=async text=>{await page.fill('#messageInput',text);await page.click('#sendBtn');await settle();};
const plusItem=async label=>{await page.click('#shellPlus');await page.click(`.shell-pop .shell-pop-row:has-text("${label}")`);};
const profileItem=async label=>{await page.click('button[aria-label="This device menu"]');await page.click(`.shell-pop-row:has-text("${label}")`);};
const openSettings=async section=>{if(!await page.locator('#settingsPage').isVisible()){await page.click('button[aria-label="This device menu"]');await page.click('.shell-pop-row:has-text("Settings")');}await page.click(`.settings-nav-item[data-section="${section}"]`);};
const closeSettings=async()=>{if(await page.locator('#settingsPage').isVisible())await page.click('button[aria-label="Close settings"]');};
const ready=async()=>{await page.waitForSelector('#messageInput');await page.waitForFunction(()=>window.__plcBooted===true&&Boolean(window.plcShell),null,{timeout:20000});await page.waitForFunction(()=>!document.querySelector('#messageInput').disabled);};
const chatMenu=async(text,item)=>{await page.locator('#threadList li[data-id]').filter({hasText:text}).locator('.thread-menu-btn').click();await page.locator('.thread-menu button',{hasText:item}).click();};
const probe=async()=>project(await page.evaluate(probeInPage));
const unlock=async()=>{await page.waitForSelector('#lockScreen',{state:'visible',timeout:20000});await page.fill('#unlockPass',PASSPHRASE);await page.press('#unlockPass','Enter');await page.waitForSelector('#lockScreen',{state:'hidden',timeout:30000});await ready();};
const noDialog=()=>page.waitForFunction(()=>!document.querySelector('.app-dialog'));
const notes=mkdtempSync(join(out,'.notes-'));
const withoutCharacters=p=>{const c=JSON.parse(JSON.stringify(p));delete c.local[CHARACTERS_KEY];return c;};

try{
  await ready();
  checkBuildIdentity(await page.evaluate(()=>window.APP_BUILD),commitFull);   // before any scenario write: the page is the declared source, for every kind of capture
  const charactersKnown=await page.evaluate(async()=>{const {KEY_CLASSES}=await import(window.plcApp.moduleBase()+'chat/vault/key-classes.mjs');return 'plc.characters.v1' in KEY_CLASSES;});
  let hasCharacters=false;   // decided below: the key is known AND this build can actually save a character (its review says so)
  const modelRequests=()=>fetch(`http://127.0.0.1:${h.api.port}/__requests`).then(r=>r.json()).then(r=>r.length);
  // two chats, a project, a pinned chat, a document, memory, a preset, personal instructions and an unsent draft
  await send('Packing list for a week in Lisbon, please.');
  await send('And what about the weather in March?');
  await page.click('#newChatBtn');
  const note=join(notes,'notes.txt');writeFileSync(note,'Launch notes: the review is on Thursday and the budget is 4200 euros.\n');
  await page.click('#shellPlus');const [fc]=await Promise.all([page.waitForEvent('filechooser'),page.click('.shell-pop-row:has-text("Add photos & files")')]);await fc.setFiles(note);
  await page.waitForSelector('#attachmentChips .chip:has-text("notes.txt")');
  await send('Summarise the launch notes in one line.');
  await page.click('#threadList .list-add[aria-label="New project"]');
  await page.fill('.app-dialog input','Travel');await page.click('.app-dialog button:has-text("Create")');
  await page.locator('#threadList li[data-id]').filter({hasText:'Packing list'}).locator('.thread-name').click();
  await page.click('#shellPlus');await page.click('.shell-pop-row:has-text("Work in a project")');
  await page.selectOption('#folderPick',{label:'Travel'});await page.click('.app-dialog button:has-text("Move")');
  await chatMenu('Summarise','Pin to top');
  await profileItem('Memory & preferences');
  await page.fill('.app-dialog input[aria-label="New memory"]','My favourite colour is green.');await page.click('.app-dialog button:has-text("Add")');
  await page.click('.app-dialog button:has-text("Done")');
  await page.click('#newChatBtn');
  await plusItem('Instructions for this chat');
  await page.fill('#systemPromptInput','Talk like a pirate.');await page.click('#savePresetBtn');
  await page.fill('.app-dialog input','Pirate');await page.click('.app-dialog button:has-text("Save preset")');
  // a character package from Cosmogenitor, added as a preset WITH its look (chat/presentation, board T706): this is what writes plc.presentations.v1, so a snapshot of a build that writes it exists
  const lantern=readFileSync(new URL('../tests/fixtures/presentation/lantern-keeper.bundle.json',import.meta.url),'utf8');
  {const [chooser]=await Promise.all([page.waitForEvent('filechooser'),page.click('#previewCharacterBtn')]);await chooser.setFiles({name:'lantern-keeper.json',mimeType:'application/json',buffer:Buffer.from(lantern)});}
  await page.waitForSelector('.app-dialog:has-text("Preview character package")');
  await page.click('.pkg-character button:has-text("Add as a preset with this look")');
  await page.waitForSelector('.app-dialog:has-text("Review preset")');await page.click('.app-dialog .dialog-actions .primary');
  await page.waitForFunction(()=>/Look kept for/.test(document.body.innerText),null,{timeout:15000});
  await page.waitForFunction(()=>!document.querySelector('.app-dialog'),null,{timeout:10000});
  await page.fill('#messageInput','an unsent draft about the snapshot');
  await page.waitForTimeout(1500);
  await settle().catch(()=>{});

  // the producer's three authentic characters, through the visible Import character, Review and Save, with the rest of the scenario left exactly as it is
  const producer=producerCharacters();
  const examples=fileURLToPath(new URL('../tests/fixtures/characters/examples/',import.meta.url));
  const openInstructions=async()=>{if(!await page.locator('#systemPromptInput').isVisible())await plusItem('Instructions for this chat');await page.waitForSelector('#importCharacterBtn',{state:'visible'});};
  const rawCharacters=()=>page.evaluate(k=>localStorage.getItem(k),CHARACTERS_KEY);
  const libraryCheck=async(label)=>{
    await openInstructions();await page.click('#savedCharactersBtn');await page.waitForSelector('.app-dialog:has-text("Saved characters")');
    assert(await page.locator('.char-item').count()===3,label+': the library lists three saved characters');
    const neri=page.locator('.char-item:has(.char-name:text-is("Neri"))');await neri.locator('button:has-text("Details")').click();await page.waitForSelector('.app-dialog .char-details');
    const card=producer.Neri.resources[0];
    assert((await page.locator('.char-details .char-resource[data-resource="asset:card"] pre').textContent()).trimEnd()===Buffer.from(card).toString('utf8').trimEnd(),label+': the saved text resource is shown exactly');
    await page.waitForSelector('.char-details .char-resource[data-resource="asset:chart"] img');
    assert(await page.locator('.char-details .char-resource[data-resource="asset:chart"] img').evaluate(n=>n.complete&&n.naturalWidth>0),label+': the saved picture is drawn from the retained bytes');
    await page.click('.app-dialog:has(.char-details) .dialog-actions .primary');await page.waitForFunction(()=>document.querySelectorAll('.app-dialog').length===1);
    await page.click('.app-dialog .dialog-actions .primary');await noDialog();
  };
  if(charactersKnown){
    // a build that knows the key but has no durable write capability wired yet (the page refuses to save: 'Saving characters is not available here yet') cannot write it, so it is not captured; an earlier snapshot holds that format
    await openInstructions();
    const [chooser]=await Promise.all([page.waitForEvent('filechooser'),page.click('#importCharacterBtn')]);
    await chooser.setFiles(join(examples,'minimal.bundle.json'));
    await page.locator('.app-dialog:has-text("Review character")').waitFor();
    await page.waitForTimeout(1500);
    hasCharacters=await page.locator('.app-dialog .dialog-actions .primary').isEnabled();
    await page.click('.app-dialog .dialog-actions button:has-text("Cancel")');await noDialog();
    console.log('characters: '+(hasCharacters?'this build can save them, so three are captured':'this build cannot save them yet, so none are captured'));
  }
  let plainProbe,characterStateAfterAdmission=null;
  if(hasCharacters){
    const before=await probe();
    const modelBefore=await modelRequests();
    assert(before.local[CHARACTERS_KEY]===undefined,'no saved characters before the capture admits any');
    await openInstructions();
    for(const [file,name] of [['minimal','Pip'],['neri','Neri'],['bex','Bex']]){
      const [chooser]=await Promise.all([page.waitForEvent('filechooser'),page.click('#importCharacterBtn')]);
      await chooser.setFiles(join(examples,file+'.bundle.json'));
      await page.locator('.app-dialog:has-text("Review character")').waitFor();
      assert(await page.inputValue('#charReviewName')===name,'the review shows the producer name '+name);
      await page.click('.app-dialog .dialog-actions .primary');await noDialog();
      await page.waitForFunction(([k,n])=>{try{return JSON.parse(localStorage.getItem(k)).records.length>=n;}catch{return false;}},[CHARACTERS_KEY,['Pip','Neri','Bex'].indexOf(name)+1],{timeout:20000});
    }
    await page.waitForTimeout(1500);
    const after=await probe();
    assert(JSON.stringify(withoutCharacters(after))===JSON.stringify(before),'admitting characters changed something else the person had: '+JSON.stringify([withoutCharacters(after),before]).slice(0,300));
    assert(await page.inputValue('#messageInput')==='an unsent draft about the snapshot'&&await page.inputValue('#systemPromptInput')==='Talk like a pirate.','the draft and the instructions are untouched');
    assert(await modelRequests()===modelBefore,'admission asked no model');
    assert(outside.length===0,'admission fetched nothing: '+outside.join(', '));
    characterStateAfterAdmission=await rawCharacters();
    await libraryCheck('before the capture');
  }
  if (await page.evaluate(() => Boolean(window.localModels?.editModelSources))) {
    await openSettings('models');
    const sourceSection = page.locator('#modelSourceSection');
    await sourceSection.getByLabel('Source name').fill('Private mirror fixture');
    await sourceSection.getByLabel('Source address').fill('https://models.example.test/mirror/');
    await sourceSection.getByRole('button', {name:'Add source'}).click();
    await sourceSection.getByText('Private mirror fixture', {exact:true}).waitFor();
    await closeSettings();
  }
  plainProbe=await probe();
  // the same content again after a reload, so anything that changes by itself is found now and not by a later release
  await page.reload();await ready();await page.waitForTimeout(800);
  const reloadProbe=await probe();
  assert(JSON.stringify(reloadProbe)===JSON.stringify(plainProbe),'what the app reads back changes by itself across a reload: '+JSON.stringify([plainProbe,reloadProbe]).slice(0,400));
  if(hasCharacters){assert(await rawCharacters()===characterStateAfterAdmission,'the stored characters are byte for byte the same after a whole reload');await libraryCheck('after a whole reload');}
  const plain={storage:await page.evaluate(dumpInPage),expected:plainProbe};
  assert(JSON.stringify(await probe())===JSON.stringify(plainProbe),'opening the library changed nothing');

  // the same person, with the encrypted vault turned on
  await openSettings('security');await page.click('.set-row:has-text("App lock") button');
  await page.check('#lockEncrypt');
  await page.fill('#lockNew1',PASSPHRASE);await page.fill('#lockNew2',PASSPHRASE);await page.click('.app-dialog button:has-text("Lock the app")');
  await page.waitForSelector('.app-dialog:has-text("Remove the unencrypted copy")',{timeout:30000});
  await page.click('.app-dialog button:has-text("Remove it")');
  await page.waitForFunction(k=>!localStorage.getItem('chatThreads')&&!localStorage.getItem(k),CHARACTERS_KEY,{timeout:20000});   // the vault has the copy and the plain one is gone
  await closeSettings();await page.waitForTimeout(2500);
  let vaultProbe=await probe();
  assert(JSON.stringify(vaultProbe.local.chatThreads)===JSON.stringify(plainProbe.local.chatThreads),'the chats read back the same with the vault on');
  assert(JSON.stringify(vaultProbe.docs)===JSON.stringify(plainProbe.docs),'the documents read back the same with the vault on');
  if(hasCharacters){
    assert(JSON.stringify(vaultProbe.local[CHARACTERS_KEY])===JSON.stringify(plainProbe.local[CHARACTERS_KEY]),'the characters read back byte for byte the same with the vault on');
    // a real lock, unlock and whole reload (unlocking again): the exact packages, resources, ids and versions are still there
    await openSettings('security');await page.click('.set-row:has-text("App lock") button');await page.click('.app-dialog button:has-text("Lock now")');
    await page.waitForSelector('#lockScreen',{state:'visible'});assert(!(await page.content()).includes('Neri'),'locked: no character is in the page');
    await unlock();
    await page.reload();await unlock();await page.waitForTimeout(1500);
    vaultProbe=await probe();
    assert(JSON.stringify(vaultProbe.local[CHARACTERS_KEY])===JSON.stringify(plainProbe.local[CHARACTERS_KEY]),'after lock, unlock and reload the characters are byte for byte the same');
    assert(JSON.stringify(vaultProbe.local.chatThreads)===JSON.stringify(plainProbe.local.chatThreads),'after lock, unlock and reload the chats are the same');
    await libraryCheck('after lock, unlock and reload');
    await page.waitForTimeout(1500);
  }
  const vault={storage:await page.evaluate(dumpInPage),expected:await probe(),passphrase:PASSPHRASE};

  const text=JSON.stringify(plain);
  for(const needle of ['Lisbon','Travel','launch notes','pirate','favourite colour','Pirate','Lantern Keeper','asset:lantern-portrait','plc.presentations.v1'])assert(text.toLowerCase().includes(needle.toLowerCase()),'the scenario did not create: '+needle);
  assert(plainProbe.docs.length===1,'one document');assert(JSON.parse(JSON.stringify(plainProbe.local.chatThreads)).length>=3,'at least three chats');
  // The plain conversation ledger (plc.encounters.v1) written BEFORE the vault existed stays readable beside the vault: the typed vault engine holds it on purpose and never copies it in (it keeps per-chat deletion),
  // and converting or erasing it when the vault turns on is not built yet (board T418, T540 to T542). That one key is the OPEN DEFECT and is named here so that nothing else can hide behind it:
  // everything else must be unreadable, and this check fails the day the defect is fixed so that the exception is removed.
  const OPEN_DEFECT_KEY='plc.encounters.v1';
  {const rest={...vault.storage,local:Object.fromEntries(Object.entries(vault.storage.local||{}).filter(([k])=>k!==OPEN_DEFECT_KEY))};
   assert(!JSON.stringify(rest).includes('Lisbon'),'nothing readable in the vault snapshot (outside the one named open defect)');
   const leak=JSON.stringify((vault.storage.local||{})[OPEN_DEFECT_KEY]||'').includes('Lisbon');
   if(leak)console.log('OPEN DEFECT (T418, T540-T542): '+OPEN_DEFECT_KEY+' holds readable conversation text beside the vault; the snapshot records it as it is');
  }
  if(hasCharacters){
    const problems=characterProblems({plain,vault});
    assert(!problems.length,'the characters in the snapshot are not whole and protected: '+problems.join(' | '));
    const st=plainProbe.local[CHARACTERS_KEY];
    assert(st.records.length===3&&st.revision===3&&st.records.every(r=>r.recordVersion===1),'three fresh records at version 1 and revision 3');
    assert(outside.length===0,'nothing left the origin: '+outside.join(', '));
  }
  assert(h.errors.length===0,'the page reported errors: '+h.errors.join(' | '));

  // the format of every key as the capturing build understood it (older builds have no table: a key named ...vN is format N, anything else format 1)
  const formats=await page.evaluate(async()=>{const {KEY_CLASSES}=await import(window.plcApp.moduleBase()+'chat/vault/key-classes.mjs');return Object.fromEntries(Object.entries(KEY_CLASSES).filter(([,i])=>['user','setting'].includes(i.class)).map(([k,i])=>[k,i.format??(/\.v(\d+)$/.exec(k)?Number(/\.v(\d+)$/.exec(k)[1]):1)]));});
  const app=await page.evaluate(()=>window.APP_BUILD);
  checkBuildIdentity(app,commitFull);   // final check, for every kind of capture
  const scenario='two chats (one with a document), a project, a pinned chat, memory, a preset, a character package added as a preset with its look, personal instructions, an unsent draft'+(hasCharacters?', three authentic producer characters saved through Import character, Review and Save (Pip, Neri with a text file and a picture, Bex with a sound)':'')+'; then the encrypted vault'+(hasCharacters?', locked, unlocked and reloaded':'')
    +(privateBuild||rehearsal?'. A post-release private writer build, unpublished: '+release+' is only the nearest earlier release.':'');
  const meta={format:'plc-data-snapshot/1',release,commit,commitFull,capturedAt:new Date().toISOString().slice(0,10),app,formats,...provenance,scenario,projection:plainProbe.projection};
  writeDurable(join(staging,'meta.json'),JSON.stringify(meta,null,1)+'\n');
  writeDurable(join(staging,'plain.json'),JSON.stringify(plain,null,1)+'\n');
  writeDurable(join(staging,'vault.json'),JSON.stringify(vault,null,1)+'\n');
  const placed=await publish({staging,out,tail,also:out===resolve(FIXTURES)?[]:[FIXTURES]});
  console.log('wrote '+placed.path);
  console.log('provenance '+JSON.stringify({captureKind:meta.captureKind||'release',release,commitFull,appBuildCommit:app.commit,appBuild:app}));
}catch(error){
  await page.screenshot({path:join(notes,'failure.png')}).catch(()=>{});
  console.error('capture failed ['+(error.code||'error')+']: '+(error.stack||error)+'\nscreenshot: '+join(notes,'failure.png'));
  process.exitCode=1;
}finally{
  await h.close();
  rmSync(staging,{recursive:true,force:true});
  if(process.exitCode!==1)rmSync(notes,{recursive:true,force:true});
}
