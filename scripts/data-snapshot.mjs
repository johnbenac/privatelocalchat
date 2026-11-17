#!/usr/bin/env node
// Capture a data snapshot of the current build: the real app, in a real browser, is used the way a person uses it, and everything the browser then holds
// is written to tests/fixtures/data/<n>-<release>-<commit>/ together with what the app reads back from it.
//
//   node scripts/data-snapshot.mjs capture [--release v0.57.0] [--commit <full sha>] [--out tests/fixtures/data]
//
// Run this on the commit that becomes a release (or on an extracted release tag, with --release and --commit) and commit the folder it writes. tests/e2e/data-upgrade.e2e.mjs then loads every folder, oldest first, into the build under
// test and checks that nothing the person had is missing or changed (docs/DATA-COMPATIBILITY.md).
import {mkdirSync,writeFileSync,mkdtempSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
process.env.PLC_E2E_BRANCH??='main'; // the production build, which is what people receive
const {launch,assert}=await import('../tests/e2e/harness.mjs');
const {dumpInPage,probeInPage,project,listFixtures,FIXTURES,PASSPHRASE}=await import('../tests/data/lib.mjs');

const args=process.argv.slice(2);
if(args[0]!=='capture'){console.error('Usage: data-snapshot.mjs capture [--release vX.Y.Z] [--commit SHA] [--out DIR]');process.exit(2);}
const opt=name=>{const i=args.indexOf('--'+name);return i>=0?args[i+1]:null;};
const git=(...a)=>{try{return execFileSync('git',a,{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{return null;}};
const release=opt('release')||git('describe','--tags','--abbrev=0');
const commitFull=opt('commit')||git('rev-parse','HEAD');
if(!release||!commitFull){console.error('Give --release and --commit when this is not a git checkout');process.exit(2);}
const commit=commitFull.slice(0,7);
const out=opt('out')||FIXTURES;
const next=String(listFixtures(out).length+1).padStart(3,'0');
const folder=join(out,`${next}-${release}-${commit}`);
if(existsSync(folder)){console.error(folder+' exists');process.exit(1);}

const h=await launch({port:18471});
const {page}=h;
const settle=async()=>{await page.waitForFunction(()=>/^(Response complete\.|The response was interrupted)/.test(document.querySelector('#generationStatus').textContent),null,{timeout:30000});await page.waitForFunction(()=>!document.querySelector('#stopGeneration').offsetParent);};
const send=async text=>{await page.fill('#messageInput',text);await page.click('#sendBtn');await settle();};
const plusItem=async label=>{await page.click('#shellPlus');await page.click(`.shell-pop .shell-pop-row:has-text("${label}")`);};
const profileItem=async label=>{await page.click('button[aria-label="This device menu"]');await page.click(`.shell-pop-row:has-text("${label}")`);};
const openSettings=async section=>{if(!await page.locator('#settingsPage').isVisible()){await page.click('button[aria-label="This device menu"]');await page.click('.shell-pop-row:has-text("Settings")');}await page.click(`.settings-nav-item[data-section="${section}"]`);};
const closeSettings=async()=>{if(await page.locator('#settingsPage').isVisible())await page.click('button[aria-label="Close settings"]');};
const ready=async()=>{await page.waitForSelector('#messageInput');await page.waitForFunction(()=>window.__plcBooted===true&&Boolean(window.plcShell),null,{timeout:20000});await page.waitForFunction(()=>!document.querySelector('#messageInput').disabled);};
const chatMenu=async(text,item)=>{await page.locator('#threadList li[data-id]').filter({hasText:text}).locator('.thread-menu-btn').click();await page.locator('.thread-menu button',{hasText:item}).click();};
const probe=async()=>project(await page.evaluate(probeInPage));
const notes=mkdtempSync(join(tmpdir(),'plc-snap-'));

try{
  await ready();
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
  await page.fill('#messageInput','an unsent draft about the snapshot');
  await page.waitForTimeout(1500);
  await settle().catch(()=>{});

  const plainProbe=await probe();
  // the same content again after a reload, so anything that changes by itself is found now and not by a later release
  await page.reload();await ready();await page.waitForTimeout(800);
  const reloadProbe=await probe();
  assert(JSON.stringify(reloadProbe)===JSON.stringify(plainProbe),'what the app reads back changes by itself across a reload: '+JSON.stringify([plainProbe,reloadProbe]).slice(0,400));
  const plain={storage:await page.evaluate(dumpInPage),expected:plainProbe};

  // the same person, with the encrypted vault turned on
  await openSettings('security');await page.click('.set-row:has-text("App lock") button');
  await page.check('#lockEncrypt');
  await page.fill('#lockNew1',PASSPHRASE);await page.fill('#lockNew2',PASSPHRASE);await page.click('.app-dialog button:has-text("Lock the app")');
  await page.waitForSelector('.app-dialog:has-text("Remove the unencrypted copy")',{timeout:30000});
  await page.click('.app-dialog button:has-text("Remove it")');
  await page.waitForFunction(()=>!localStorage.getItem('chatThreads'),null,{timeout:20000});
  await closeSettings();await page.waitForTimeout(2500);
  const vaultProbe=await probe();
  const vault={storage:await page.evaluate(dumpInPage),expected:vaultProbe,passphrase:PASSPHRASE};
  assert(JSON.stringify(vaultProbe.local.chatThreads)===JSON.stringify(plainProbe.local.chatThreads),'the chats read back the same with the vault on');
  assert(JSON.stringify(vaultProbe.docs)===JSON.stringify(plainProbe.docs),'the documents read back the same with the vault on');

  const text=JSON.stringify(plain);
  for(const needle of ['Lisbon','Travel','launch notes','pirate','favourite colour','Pirate'])assert(text.toLowerCase().includes(needle.toLowerCase()),'the scenario did not create: '+needle);
  assert(plainProbe.docs.length===1,'one document');assert(JSON.parse(JSON.stringify(plainProbe.local.chatThreads)).length>=3,'at least three chats');
  assert(!JSON.stringify(vault.storage).includes('Lisbon'),'nothing readable in the vault snapshot');

  mkdirSync(folder,{recursive:true});
  // the format of every key as the capturing build understood it (older builds have no table: a key named ...vN is format N, anything else format 1)
  const formats=await page.evaluate(async()=>{const {KEY_CLASSES}=await import(window.plcApp.moduleBase()+'chat/vault/key-classes.mjs');return Object.fromEntries(Object.entries(KEY_CLASSES).filter(([,i])=>['user','setting'].includes(i.class)).map(([k,i])=>[k,i.format??(/\.v(\d+)$/.exec(k)?Number(/\.v(\d+)$/.exec(k)[1]):1)]));});
  const meta={format:'plc-data-snapshot/1',release,commit,commitFull,capturedAt:new Date().toISOString().slice(0,10),app:await page.evaluate(()=>window.APP_BUILD),formats,scenario:'two chats (one with a document), a project, a pinned chat, memory, a preset, an unsent draft; then the encrypted vault',projection:plainProbe.projection};
  writeFileSync(join(folder,'meta.json'),JSON.stringify(meta,null,1)+'\n');
  writeFileSync(join(folder,'plain.json'),JSON.stringify(plain,null,1)+'\n');
  writeFileSync(join(folder,'vault.json'),JSON.stringify(vault,null,1)+'\n');
  console.log('wrote '+folder);
}catch(error){
  await page.screenshot({path:join(notes,'failure.png')}).catch(()=>{});
  console.error('capture failed: '+(error.stack||error)+'\nscreenshot: '+join(notes,'failure.png'));
  process.exitCode=1;
}finally{
  await h.close();
}
