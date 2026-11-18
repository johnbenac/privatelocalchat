// End to end on Cosmogenitor's first REAL exports (board T708/T444): preview, "Add as a preset with this look", choose the preset, a conversation, and the refusal path.
//   E2E_PORT_OFFSET=11 node docs/evidence/T708-first-real-export-20261118/run.mjs <good.bundle.json> <missing-portrait.bundle.json>
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {launch,assert} from '../../../tests/e2e/harness.mjs';
import {newProfileDir} from '../../../tests/e2e/profile-root.mjs';
const [goodPath,badPath]=process.argv.slice(2);const sha=b=>createHash('sha256').update(b).digest('hex');
const good=readFileSync(goodPath),bad=readFileSync(badPath);
const out={when:new Date().toISOString(),good:{bytes:good.length,sha256:sha(good)},missingPortrait:{bytes:bad.length,sha256:sha(bad)},checks:[]};
const ok=(n)=>{out.checks.push(n);console.log('PASS '+n);};
const KEY='plc.presentations.v1';
const h=await launch({port:18551,profileDir:newProfileDir('t708-real-export')});const page=h.page,origin=h.origin;
const outside=[];h.context.on('request',r=>{const u=new URL(r.url());if(u.origin!==origin&&u.port!==String(h.api.port)&&!/^(data|blob|about):/.test(r.url()))outside.push(r.url());});
const ready=async()=>{await page.waitForSelector('#messageInput');await page.waitForFunction(()=>window.__plcBooted===true&&Boolean(window.plcShell),null,{timeout:30000});await page.waitForFunction(()=>!document.querySelector('#messageInput').disabled);};
const openInstructions=async()=>{if(!await page.locator('#systemPromptInput').isVisible()){await page.click('#shellPlus');await page.click('.shell-pop .shell-pop-row:has-text("Instructions for this chat")');}await page.waitForSelector('#previewCharacterBtn',{state:'visible'});};
const choose=async(buf)=>{const [c]=await Promise.all([page.waitForEvent('filechooser'),page.click('#previewCharacterBtn')]);await c.setFiles({name:'export.json',mimeType:'application/json',buffer:buf});await page.waitForSelector('.app-dialog:has-text("Preview character package")');};
const kept=()=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)||'{}'),KEY);
const presets=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('plc.presets.v1')||'[]'));
try{
 await ready();await page.click('#newChatBtn');await openInstructions();
 await choose(good);
 const preview=await page.locator('.app-dialog').innerText();out.previewText=preview.slice(0,700);
 assert(/Harbour Clerk/.test(preview),'the preview names the character: '+preview.slice(0,200));
 assert(await page.locator('.pkg-character button:has-text("Add as a preset with this look")').count()===1,'the look is offered');
 assert((await presets()).length===0&&Object.keys(await kept()).length===0,'nothing added by previewing');ok('preview of the real export names Harbour Clerk and offers the look; nothing is added by previewing');
 await page.click('.pkg-character button:has-text("Add as a preset with this look")');await page.waitForSelector('.app-dialog:has-text("Review preset")');
 assert((await presets()).length===0,'nothing added before Add');await page.click('.app-dialog .dialog-actions .primary');
 await page.waitForFunction(()=>/Look kept for/.test(document.body.innerText),null,{timeout:15000});
 const list=await presets(),map=await kept();assert(list.length===1&&list[0].name==='Harbour Clerk'&&Object.keys(map).join()===list[0].id,'one preset and its look');
 const rec=map[list[0].id];out.record={layout:rec.look.layout,palette:rec.look.palette,reducedMotion:rec.look.reducedMotion,images:rec.images.map(i=>({role:i.role,mediaType:i.mediaType,size:i.size,license:i.license}))};
 assert(rec.look.layout==='folio'&&rec.look.palette==='sea'&&rec.images.length===2,'folio, sea, two pictures kept: '+JSON.stringify(out.record));ok('Add as a preset with this look: one preset, its look kept (folio, sea, both pictures)');
 await page.selectOption('#presetSelect',{label:'Harbour Clerk'});await page.waitForSelector('#lookStrip:not([hidden])');
 assert(await page.getAttribute('#lookStrip','data-palette')==='sea'&&await page.getAttribute('#lookStrip','data-layout')==='folio','the strip follows the look');
 assert(await page.evaluate(()=>[...document.querySelectorAll('#lookStrip img')].length===2&&[...document.querySelectorAll('#lookStrip img')].every(i=>i.complete&&i.naturalWidth>0)),'both pictures drawn');
 ok('choosing the preset shows the strip with both pictures');
 await page.fill('#messageInput','markdown please');await page.click('#sendBtn');await page.waitForSelector('.message.assistant:not(.streaming) .message-body a',{timeout:30000});
 const bg=await page.evaluate(()=>getComputedStyle(document.querySelector('.message.assistant')).backgroundColor);assert(bg==='rgb(15, 59, 68)','the reply panel is in the sea palette: '+bg);ok('a conversation: the agent\'s reply panel follows the palette');
 // refusal path, same browser, after deleting nothing: a second preview of the withheld-portrait export
 await page.reload();await ready();await openInstructions();await choose(bad);
 const t=await page.locator('.app-dialog').innerText();out.refusalText=t.slice(0,700);
 assert(await page.locator('.pkg-character button:has-text("with this look")').count()===0&&await page.locator('.pkg-character button:has-text("Add as a preset…")').count()===1,'only the plain preset is offered: '+t.slice(0,300));
 const before=Object.keys(await kept()).length;await page.click('.pkg-character button:has-text("Add as a preset…")');await page.waitForSelector('.app-dialog:has-text("Review preset")');await page.click('.app-dialog .dialog-actions .primary');
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('plc.presets.v1')||'[]').length===2,null,{timeout:15000});await page.waitForTimeout(500);
 assert(Object.keys(await kept()).length===before,'no second look was kept');ok('the withheld-portrait export: the character is kept as a plain preset, its look is refused and not kept');
 assert(outside.length===0,'nothing left the origin: '+outside.join('|'));assert(h.errors.length===0,'no page errors: '+h.errors.join('|'));ok('nothing left the page except to the test\'s own fake provider; no page errors');
 console.log(JSON.stringify(out,null,1));
}catch(e){console.error(e);console.error(await page.locator('.app-dialog').innerText().catch(()=>''));process.exitCode=1;}
finally{await h.close();}
