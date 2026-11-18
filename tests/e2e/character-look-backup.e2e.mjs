// A character's kept look travels in a protected backup (board T706): the backup carries a `looks` section beside the presets, and a restore puts each look back on the preset that restore just added, under
// the id that restore gave it. A preset the person already had is never given a look; a look that is not in a valid shape and a backup from before looks existed are both restored without any look and with no error.
// Everything through visible controls (Settings > Transfer chats and backups > Create protected backup, a real download; Import chats or backup in separate FRESH persistent profiles); the backup is also opened here
// with the app's own crypto module to check what it holds. Fixtures: Cosmogenitor's real lantern-keeper package.
//   node scripts/e2e.mjs character-look-backup
// Browser profiles are new folders under PLC_E2E_PROFILE_ROOT (default: the system temporary folder); E2E_PORT_OFFSET moves the ports (base 18561).
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {launch,assert} from './harness.mjs';
import {newProfileDir} from './profile-root.mjs';
import {encryptString,decryptString} from '../../chat/crypto.mjs';
const ok=n=>console.log('PASS '+n);
const lantern=readFileSync(new URL('../fixtures/presentation/lantern-keeper.bundle.json',import.meta.url),'utf8');
const PASS='look-backup-synthetic-passphrase-1',KEY='plc.presentations.v1';
const downloads=mkdtempSync(join((mkdirSync(process.env.PLC_E2E_PROFILE_ROOT||tmpdir(),{recursive:true}),process.env.PLC_E2E_PROFILE_ROOT||tmpdir()),'look-downloads-'));
const ready=async p=>{await p.waitForSelector('#messageInput');await p.waitForFunction(()=>window.__plcBooted===true&&Boolean(window.plcShell),null,{timeout:30000});await p.waitForFunction(()=>!document.querySelector('#messageInput').disabled);};
const profileItem=async(p,l)=>{await p.click('button[aria-label="This device menu"]');await p.click(`.shell-pop-row:has-text("${l}")`);};
const closeDialogs=async p=>{for(let i=0;i<4;i++){await p.keyboard.press('Escape');await p.waitForTimeout(150);}const c=p.locator('button[aria-label="Close settings"]');if(await c.count()&&await c.first().isVisible())await c.first().click();};
const openTransfer=async p=>{await profileItem(p,'Settings');await p.waitForSelector('#settingsPage',{state:'visible'});await p.click('.settings-nav-item[data-section="data"]');const t=p.locator('#settingsPage #transferChatsBtn');await t.first().waitFor({state:'visible',timeout:15000});await t.first().click();await p.waitForSelector('#exportChatsBtn',{timeout:15000});};
const importFile=async(p,file)=>{await closeDialogs(p);await openTransfer(p);const [fc]=await Promise.all([p.waitForEvent('filechooser',{timeout:15000}),p.click('#importChatsBtn')]);await fc.setFiles(file);
  await p.waitForSelector('.app-dialog input',{timeout:15000});await p.fill('.app-dialog input',PASS);await p.click('.app-dialog button:has-text("Unlock backup")');
  await p.waitForSelector('.app-dialog button:has-text("Import")',{timeout:20000});await p.click('.app-dialog button:has-text("Import")');await p.waitForSelector('.app-dialog',{state:'detached',timeout:15000});await p.waitForTimeout(1500);};
const kept=p=>p.evaluate(k=>JSON.parse(localStorage.getItem(k)||'{}'),KEY);
const presets=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('plc.presets.v1')||'[]'));
const openInstructions=async p=>{if(!await p.locator('#systemPromptInput').isVisible()){await p.click('#shellPlus');await p.click('.shell-pop .shell-pop-row:has-text("Instructions for this chat")');}await p.waitForSelector('#previewCharacterBtn',{state:'visible'});};
const launched=[];
const fresh=async(name,port,build=false)=>{const h=await launch({port:18561+port,build,profileDir:newProfileDir(name)});launched.push(h);await ready(h.page);return h;};
try{
 // ---- source: a character added as a preset with its look, then a protected backup ----
 const src=await fresh('look-backup-src',0,true);const sp=src.page;
 await sp.click('#newChatBtn');await openInstructions(sp);
 const [chooser]=await Promise.all([sp.waitForEvent('filechooser'),sp.click('#previewCharacterBtn')]);await chooser.setFiles({name:'lantern-keeper.json',mimeType:'application/json',buffer:Buffer.from(lantern)});
 await sp.waitForSelector('.app-dialog:has-text("Preview character package")');await sp.click('.pkg-character button:has-text("Add as a preset with this look")');
 await sp.waitForSelector('.app-dialog:has-text("Review preset")');await sp.click('.app-dialog .dialog-actions .primary');
 await sp.waitForFunction(()=>/Look kept for/.test(document.body.innerText),null,{timeout:15000});
 const srcPreset=(await presets(sp))[0];assert(srcPreset&&Object.keys(await kept(sp)).join()===srcPreset.id,'the source has one preset with one look');
 await closeDialogs(sp);await openTransfer(sp);
 await sp.fill('#bkPass1',PASS);await sp.fill('#bkPass2',PASS);
 const [d]=await Promise.all([sp.waitForEvent('download',{timeout:60000}),sp.click('#createBackupBtn')]);
 const backupFile=join(downloads,'backup.encrypted.json');await d.saveAs(backupFile);
 const envelope=JSON.parse(readFileSync(backupFile,'utf8'));const raw=readFileSync(backupFile,'utf8');
 assert(envelope.format==='plc-encrypted-backup/1'&&!/Lantern|lantern|asset:|iVBOR/.test(raw),'the backup is an encrypted envelope with nothing readable (no name, no picture)');
 const inner=JSON.parse(await decryptString(envelope,PASS));
 assert(inner.format==='plc-backup/1','it is still a plc-backup/1');
 assert(Object.keys(inner.looks||{}).join()===srcPreset.id&&inner.looks[srcPreset.id].v===1&&inner.looks[srcPreset.id].images.length===2,'inside, a looks section names the preset id and holds the record with both pictures: '+Object.keys(inner.looks||{}));
 assert(inner.presets.some(p=>p.id===srcPreset.id&&p.name==='Lantern Keeper'),'the preset is in the backup under the same id');
 ok('a protected backup carries the look beside its preset, with nothing readable outside');

 // ---- target 1: a fresh browser: the look comes back on the NEW preset id ----
 const t1=await fresh('look-backup-t1',1);const p1=t1.page;
 await importFile(p1,backupFile);
 const list1=await presets(p1),map1=await kept(p1);
 assert(list1.length===1&&list1[0].name==='Lantern Keeper'&&list1[0].id!==srcPreset.id,'the preset was restored under a new id: '+JSON.stringify(list1.map(p=>p.id)));
 assert(Object.keys(map1).join()===list1[0].id&&map1[list1[0].id].images.length===2&&map1[list1[0].id].enabled===true,'the look is kept for the NEW id, whole: '+Object.keys(map1));
 await p1.reload();await ready(p1);await p1.click('#newChatBtn');await openInstructions(p1);await p1.selectOption('#presetSelect',{label:'Lantern Keeper'});
 await p1.waitForSelector('#lookStrip:not([hidden])',{timeout:10000});
 assert(await p1.getAttribute('#lookStrip','data-palette')==='sea'&&await p1.locator('#lookStrip img.look-portrait').count()===1,'choosing the restored preset shows the look');
 ok('restore puts the look back on the preset restore created, under its new id, and the chat shows it');

 // ---- target 2: the person already has a preset with that name: it is kept as it is and gets no look ----
 const t2=await fresh('look-backup-t2',2);const p2=t2.page;
 await p2.evaluate(()=>localStorage.setItem('plc.presets.v1',JSON.stringify([{id:'preset-mine',name:'Lantern Keeper',prompt:'My own lantern keeper.'}])));
 await p2.reload();await ready(p2);
 await importFile(p2,backupFile);
 const list2=await presets(p2);
 assert(list2.length===1&&list2[0].id==='preset-mine'&&list2[0].prompt==='My own lantern keeper.','the person\'s own preset is untouched');
 assert(JSON.stringify(await kept(p2))==='{}','and it is not given a look it never had');
 ok('a preset the person already had is neither changed nor given a look');

 // ---- targets 3 and 4: a look that is not valid, and a backup from before looks existed ----
 const reseal=async(mutate,name)=>{const copy=JSON.parse(await decryptString(envelope,PASS));mutate(copy);const f=join(downloads,name);writeFileSync(f,JSON.stringify(await encryptString(JSON.stringify(copy),PASS,{iterations:10000})));return f;};
 const bad=await reseal(c=>{c.looks[srcPreset.id].look.layout='masonry';},'bad-look.encrypted.json');
 const t3=await fresh('look-backup-t3',3);await importFile(t3.page,bad);
 assert((await presets(t3.page)).length===1&&JSON.stringify(await kept(t3.page))==='{}'&&t3.errors.length===0,'an invalid look is not kept; the preset is restored; no error: '+t3.errors.join('|'));
 ok('a look that is not valid is not kept, and the rest of the backup is restored');
 const old=await reseal(c=>{delete c.looks;},'old.encrypted.json');
 const t4=await fresh('look-backup-t4',4);await importFile(t4.page,old);
 assert((await presets(t4.page)).length===1&&JSON.stringify(await kept(t4.page))==='{}'&&t4.errors.length===0,'a backup without a looks section restores the preset and no look');
 ok('a backup from before looks existed restores its presets with no look');

 for(const h of launched)assert(h.errors.length===0,'no page errors: '+h.errors.join(' | '));
 console.log('character-look-backup e2e: ok');
}catch(e){console.error(e);for(const h of launched)console.error(await h.page.locator('.app-dialog').innerText().catch(()=>''));process.exitCode=1;}
finally{for(const h of launched.reverse())await h.close().catch(()=>{});}
