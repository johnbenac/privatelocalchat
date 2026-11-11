#!/usr/bin/env node
// Capture the files a build saves outside the browser, by using the real app in a real browser: the chat history file, the passphrase-encrypted backup (with documents) and the settings file.
//
//   node scripts/file-snapshot.mjs capture [--release v0.57.0] [--commit <full sha>] [--out tests/fixtures/files] [--data <data snapshot folder>]
//
// The data the files are made from is a data snapshot (tests/fixtures/data, docs/DATA-COMPATIBILITY.md) restored into the build, so what each file must hold is known: the snapshot's own
// expected content. Run this on the commit that becomes a release, or on an extracted release tag (with --release and --commit), and commit the folder it writes.
// tests/e2e/file-import.e2e.mjs then opens every file in the build under test (docs/FILE-COMPATIBILITY.md).
import {mkdirSync,writeFileSync,existsSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
process.env.PLC_E2E_BRANCH??='main'; // the production build, which is what people receive
const {launch,assert}=await import('../tests/e2e/harness.mjs');
const {listFixtures,readFixture,restoreInPage,PASSPHRASE}=await import('../tests/data/lib.mjs');
const {listFileFixtures,FILE_FIXTURES}=await import('../tests/data/files.mjs');

const args=process.argv.slice(2);
if(args[0]!=='capture'){console.error('Usage: file-snapshot.mjs capture [--release vX.Y.Z] [--commit SHA] [--out DIR] [--data NAME]');process.exit(2);}
const opt=name=>{const i=args.indexOf('--'+name);return i>=0?args[i+1]:null;};
const git=(...a)=>{try{return execFileSync('git',a,{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{return null;}};
const release=opt('release')||git('describe','--tags','--abbrev=0');
const commitFull=opt('commit')||git('rev-parse','HEAD');
if(!release||!commitFull){console.error('Give --release and --commit when this is not a git checkout');process.exit(2);}
const commit=commitFull.slice(0,7);
const out=opt('out')||FILE_FIXTURES;
const dataNames=listFixtures();
const dataName=opt('data')||dataNames[dataNames.length-1];
if(!dataName){console.error('There is no data snapshot to make files from');process.exit(2);}
const data=readFixture(dataName);
const next=String(listFileFixtures(out).length+1).padStart(3,'0');
const folder=join(out,`${next}-${release}-${commit}`);
if(existsSync(folder)){console.error(folder+' exists');process.exit(1);}

const h=await launch({port:18521});
const {page,origin}=h;
const ready=async()=>{await page.waitForSelector('#messageInput');await page.waitForFunction(()=>window.__plcBooted===true&&Boolean(window.plcShell),null,{timeout:30000});await page.waitForFunction(()=>!document.querySelector('#messageInput').disabled);};
const download=async action=>{const [d]=await Promise.all([page.waitForEvent('download',{timeout:30000}),action()]);const path=await d.path();return {name:d.suggestedFilename(),text:(await import('node:fs')).readFileSync(path,'utf8')};};
const notes=mkdtempSync(join(tmpdir(),'plc-files-'));
try{
  await page.goto(origin+'/version.json');
  await page.evaluate(restoreInPage,data.plain.storage);
  await page.goto(origin+'/');
  await ready();

  // 1. the chat history file
  await page.evaluate(()=>document.getElementById('transferChatsBtn').click());
  await page.waitForSelector('#exportChatsBtn');
  const history=await download(()=>page.click('#exportChatsBtn'));
  assert(/chat-history\.json$/.test(history.name),'the history file is named chat-history.json: '+history.name);

  // 2. the protected backup, with documents
  await page.check('#bkDocs');
  await page.fill('#bkPass1',PASSPHRASE);await page.fill('#bkPass2',PASSPHRASE);
  const backup=await download(()=>page.click('#createBackupBtn'));
  assert(/\.encrypted\.json$/.test(backup.name),'the backup is an .encrypted.json file: '+backup.name);

  // 3. the settings file
  await page.keyboard.press('Escape');
  await page.waitForSelector('.app-dialog',{state:'detached',timeout:5000}).catch(()=>{});
  await page.evaluate(()=>document.getElementById('transferSettingsBtn').click());
  await page.waitForSelector('#transferCreateBtn');
  await page.click('#transferCreateBtn');
  await page.waitForSelector('#transferFileBtn',{state:'visible'});
  const settings=await download(()=>page.click('#transferFileBtn'));

  const formatOf=text=>{const v=JSON.parse(text);return Array.isArray(v)?'bare-list':(v&&v.format)||'none';};
  // the backup travels inside the encrypted file: open it with the build's own code to record what it holds
  const crypto=await import('../chat/crypto.mjs');
  const inner=JSON.parse(await crypto.decryptString(JSON.parse(backup.text),PASSPHRASE));
  assert(inner.format&&Array.isArray(inner.docs)&&inner.docs.length>=1,'the backup holds its format and the documents');
  const meta={
    format:'plc-file-snapshot/1',release,commit,commitFull,capturedAt:new Date().toISOString().slice(0,10),app:await page.evaluate(()=>window.APP_BUILD),
    dataFixture:dataName,passphrase:PASSPHRASE,
    files:{'history.json':{name:history.name,format:formatOf(history.text)},'encrypted-backup.json':{name:backup.name,format:formatOf(backup.text),inner:inner.format},'settings.json':{name:settings.name,format:formatOf(settings.text)}}
  };
  assert(meta.files['encrypted-backup.json'].format.startsWith('plc-encrypted-backup/'),'the backup names its format');
  assert(meta.files['settings.json'].format.startsWith('plc-settings-transfer/'),'the settings file names its format');
  mkdirSync(folder,{recursive:true});
  writeFileSync(join(folder,'meta.json'),JSON.stringify(meta,null,1)+'\n');
  writeFileSync(join(folder,'history.json'),history.text.endsWith('\n')?history.text:history.text+'\n');
  writeFileSync(join(folder,'encrypted-backup.json'),backup.text.endsWith('\n')?backup.text:backup.text+'\n');
  writeFileSync(join(folder,'settings.json'),settings.text.endsWith('\n')?settings.text:settings.text+'\n');
  console.log('wrote '+folder+' ('+Object.values(meta.files).map(f=>f.format).join(', ')+')');
}catch(error){
  await page.screenshot({path:join(notes,'failure.png')}).catch(()=>{});
  console.error('capture failed: '+(error.stack||error)+'\nscreenshot: '+join(notes,'failure.png'));
  process.exitCode=1;
}finally{
  await h.close();
}
