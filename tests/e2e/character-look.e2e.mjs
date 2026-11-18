// Keeping a Cosmogenitor character's look and seeing it in a conversation (board T706), end to end, in a real browser, with the producer's REAL first packages (tests/fixtures/presentation/).
// A package is previewed first; "Add as a preset with this look" goes through PLC's own preset review box and keeps the look for that preset only when the person presses Add. In a chat that uses the
// preset the strip under the header and the agent's message panels follow the look; the person's own messages and every control are untouched. The person can turn the whole look or one part off,
// remove it, and it goes with its preset; a damaged or newer record is the default look and is left alone. Fixtures and the real browser are recorded separately in the board note.
//   node scripts/e2e.mjs character-look
// The browser profile is a new folder under PLC_E2E_PROFILE_ROOT (default: the system temporary folder); E2E_PORT_OFFSET moves the port (base 18551).
import {readFileSync} from 'node:fs';
import {launch,assert} from './harness.mjs';
import {newProfileDir} from './profile-root.mjs';
const ok=n=>console.log('PASS '+n);
const bundle=n=>readFileSync(new URL('../fixtures/presentation/'+n+'.bundle.json',import.meta.url),'utf8');
const lantern=bundle('lantern-keeper'),ferry=bundle('ferry-clerk');
const KEY='plc.presentations.v1';
const h=await launch({port:18551,profileDir:newProfileDir('character-look')});
const {context}=h;let page=h.page;const origin=h.origin;
const outside=[];context.on('request',r=>{const u=new URL(r.url());if(u.origin!==origin&&u.port!==String(h.api.port)&&!/^(data|blob|about):/.test(r.url()))outside.push(r.method()+' '+r.url());}); // the test's own fake provider is the one expected place a chat message goes (asserted below)
const ready=async(p=page)=>{await p.waitForSelector('#messageInput');await p.waitForFunction(()=>window.__plcBooted===true&&Boolean(window.plcShell),null,{timeout:20000});await p.waitForFunction(()=>!document.querySelector('#messageInput').disabled);};
const openInstructions=async(p=page)=>{if(!await p.locator('#systemPromptInput').isVisible()){await p.click('#shellPlus');await p.click('.shell-pop .shell-pop-row:has-text("Instructions for this chat")');}await p.waitForSelector('#previewCharacterBtn',{state:'visible'});};
const chooseFile=async(name,content,p=page)=>{const [chooser]=await Promise.all([p.waitForEvent('filechooser'),p.click('#previewCharacterBtn')]);await chooser.setFiles({name,mimeType:'application/json',buffer:Buffer.from(content)});};
const dialog=(title,p=page)=>p.locator('.app-dialog:has-text("'+title+'")');
const kept=(p=page)=>p.evaluate(k=>JSON.parse(localStorage.getItem(k)||'{}'),KEY);
const presets=(p=page)=>p.evaluate(()=>JSON.parse(localStorage.getItem('plc.presets.v1')||'[]'));
const lumin=([r,g,b])=>{const f=v=>{v/=255;return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4;};return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b);};
const rgb=c=>c.match(/[\d.]+/g).slice(0,3).map(Number);
const contrast=(a,b)=>{const [x,y]=[lumin(rgb(a)),lumin(rgb(b))].sort((p,q)=>q-p);return (x+0.05)/(y+0.05);};
const requestsToModel=()=>fetch(`http://127.0.0.1:${h.api.port}/__requests`).then(r=>r.json());
const addLantern=async()=>{
  await openInstructions();await chooseFile('lantern-keeper.json',lantern);await dialog('Preview character package').waitFor();
  await page.click('.pkg-character button:has-text("Add as a preset with this look")');
  await page.waitForFunction(()=>!/Preview character package/.test(document.body.innerText)||!document.querySelector('.app-dialog')||/Review preset/.test(document.querySelector('.app-dialog').innerText));
  await dialog('Review preset').waitFor();
  return dialog('Review preset');
};
try{
 await ready();
 await page.click('#newChatBtn');await openInstructions();
 const modelBefore=(await requestsToModel()).length;

 // ---- from a package to a preset with a look ----
 const review=await addLantern();
 const text=await review.innerText();
 assert(/Read from a character package/.test(text)&&/look from the package.*kept with this preset too/s.test(text),'the review box says where it came from and that the look is kept too: '+text.slice(0,300));
 assert(await page.inputValue('#presetReviewName')==='Lantern Keeper','the name is the character\'s');
 assert(/^Portray Lantern Keeper\./.test(await page.inputValue('#presetReviewText')),'the instructions are the character\'s plain text');
 assert(Object.keys(await kept()).length===0&&(await presets()).length===0,'nothing is kept or added before the person presses Add');
 await page.click('.app-dialog .dialog-actions button:has-text("Cancel")');await page.waitForFunction(()=>!document.querySelector('.app-dialog'));
 assert(Object.keys(await kept()).length===0&&(await presets()).length===0,'Cancel keeps and adds nothing');
 await addLantern();await page.click('.app-dialog .dialog-actions .primary');
 await page.waitForFunction(()=>/Look kept for/.test(document.body.innerText),null,{timeout:10000});
 const list=await presets();assert(list.length===1&&list[0].name==='Lantern Keeper','one preset was added');
 const map=await kept();assert(Object.keys(map).join()===list[0].id,'one look is kept, for that preset id: '+Object.keys(map));
 assert(map[list[0].id].v===1&&map[list[0].id].enabled===true&&map[list[0].id].images.length===2,'the record holds the look and both pictures');
 ok('a package becomes a preset with its look, only when the person presses Add');

 // ---- the chat that uses the preset ----
 assert(await page.locator('#lookStrip').isHidden(),'before the preset is chosen the strip is hidden and the chat is as it was');
 await page.selectOption('#presetSelect',{label:'Lantern Keeper'});
 await page.waitForSelector('#lookStrip:not([hidden])');
 const strip=page.locator('#lookStrip');
 assert(await strip.getAttribute('data-palette')==='sea'&&await strip.getAttribute('data-layout')==='folio','the strip uses the look\'s palette and layout names');
 assert(await page.locator('#lookStrip img.look-portrait').getAttribute('alt')==='Flat illustration of a pale lantern disc with an amber flame on deep teal.','the portrait has its text alternative');
 assert(await page.locator('#lookStrip img.look-bg').getAttribute('alt')===''&&await page.locator('#lookStrip img.look-bg').getAttribute('aria-hidden')==='true','the background is hidden from assistive technology');
 assert(await page.evaluate(()=>[...document.querySelectorAll('#lookStrip img')].every(i=>i.complete&&i.naturalWidth>0)),'both pictures loaded');
 assert((await strip.innerText()).includes('Lantern Keeper'),'the strip names the character');
 assert(await page.getAttribute('#messages','data-look-palette')==='sea','the message area carries the palette name');
 const controls=page.locator('#lookControls');assert(await controls.isVisible(),'the controls are shown for a preset that has a look');
 for(const id of ['lookEnabled','lookPart-portrait','lookPart-background','lookPart-layout','lookPart-palette'])assert(await page.locator('#'+id).isChecked(),id+' is on');
 assert(/made by Cosmogenitor.*licence CC0-1\.0/.test(await controls.innerText()),'attribution and licence are shown');
 ok('choosing the preset shows the strip, the palette and the controls, with attribution');

 // ---- a reply: the agent's panel follows the look, nothing inside it falls below contrast, nothing from the package or the reply runs ----
 await page.fill('#messageInput','markdown please');await page.click('#sendBtn');
 await page.waitForSelector('.message.assistant:not(.streaming) .message-body a',{timeout:30000});
 const panel=await page.evaluate(()=>{const m=document.querySelector('.message.assistant'),p=getComputedStyle(m);const q=s=>{const n=m.querySelector(s);return n?getComputedStyle(n):null;};
   return {bg:p.backgroundColor,fg:p.color,body:q('.message-body').color,link:q('.message-body a').color,code:q('.message-body code')&&q('.message-body code').color,speaker:q('.speaker').color,userBg:getComputedStyle(document.querySelector('.message.user')).backgroundColor,userFg:getComputedStyle(document.querySelector('.message.user')).color};});
 assert(panel.bg==='rgb(15, 59, 68)','the agent\'s panel is solid and in the palette: '+panel.bg);
 for(const part of ['fg','body','link','code','speaker'])assert(panel[part]==='rgb(234, 246, 245)','text in the panel ('+part+') has the panel\'s own text colour, so its contrast is the palette\'s: '+panel[part]);
 assert(contrast(panel.fg,panel.bg)>=4.5,'contrast '+contrast(panel.fg,panel.bg).toFixed(2));
 assert(panel.userBg!==panel.bg,'the person\'s own message is not restyled: '+panel.userBg);
 assert(await page.evaluate(()=>window.__pwned===undefined),'no script in the reply ran');
 ok('the agent\'s message panel follows the palette with readable text everywhere inside it, and the person\'s message is untouched');

 // ---- the person\'s controls ----
 await page.uncheck('#lookPart-portrait');await page.waitForFunction(()=>!document.querySelector('#lookStrip img.look-portrait'));
 assert((await kept())[list[0].id].off.portrait===true&&await page.locator('#lookStrip img.look-bg').count()===1,'the picture is off and kept off; the background stays');
 await page.uncheck('#lookPart-palette');await page.waitForFunction(()=>!document.getElementById('lookStrip').dataset.palette);
 assert(await page.getAttribute('#messages','data-look-palette')===null,'with the palette off the message panels go back to the app\'s own colours');
 await page.uncheck('#lookEnabled');await page.waitForSelector('#lookStrip',{state:'hidden'});
 assert(await page.locator('#lookControls').isVisible()&&await page.locator('#lookPart-layout').isDisabled(),'turned off as a whole: the strip is gone, the controls stay (to turn it back on) with the parts disabled');
 await page.check('#lookEnabled');await page.waitForSelector('#lookStrip:not([hidden])');
 assert(await page.locator('#lookStrip img.look-portrait').count()===0&&await page.getAttribute('#lookStrip','data-palette')===null,'turning it back on restores exactly the choices made, not more');
 await page.check('#lookPart-portrait');await page.check('#lookPart-palette');await page.waitForFunction(()=>document.querySelector('#lookStrip img.look-portrait')&&document.getElementById('lookStrip').dataset.palette==='sea');
 ok('the whole look or one part can be turned off and on, and what is chosen is kept');

 // ---- keyboard: the controls are reachable and operable without a pointer ----
 await page.focus('#lookEnabled');await page.keyboard.press('Space');await page.waitForSelector('#lookStrip',{state:'hidden'});
 await page.keyboard.press('Space');await page.waitForSelector('#lookStrip:not([hidden])');
 assert(await page.evaluate(()=>[...document.querySelectorAll('#lookControls input,#lookControls button')].every(n=>n.labels?.length||(n.textContent||'').trim())),'every control has a name');
 ok('the look controls work from the keyboard and every one has a name');

 // ---- it survives a reload, and a damaged or newer record is the default look and is left alone ----
 await page.reload();await ready();
 await page.waitForSelector('#lookStrip:not([hidden])',{timeout:10000});
 assert(await page.getAttribute('#lookStrip','data-palette')==='sea','after a reload the chat shows the look');
 const id=list[0].id,good=await kept();
 await page.evaluate(([k,id])=>{const m=JSON.parse(localStorage.getItem(k));m[id]={v:1,enabled:'yes'};m['preset-newer']={v:2,future:{a:1}};localStorage.setItem(k,JSON.stringify(m));},[KEY,id]);
 const damaged=await page.evaluate(k=>localStorage.getItem(k),KEY);
 await page.reload();await ready();
 assert(await page.locator('#lookStrip').isHidden()&&await page.locator('#lookControls').isHidden(),'a damaged record is the default look: no strip, no controls, no error screen');
 assert(await page.evaluate(k=>localStorage.getItem(k),KEY)===damaged,'and what is stored is left exactly as it was (the damaged one and the newer one)');
 await page.evaluate(([k,id,good])=>{localStorage.setItem(k,JSON.stringify(good));},[KEY,id,good]);
 await page.reload();await ready();await page.waitForSelector('#lookStrip:not([hidden])');
 ok('the look survives a reload; a damaged or newer record shows the default and is left alone');

 // ---- a stored picture that no longer matches its checksum: the look is not drawn, the person is told, nothing is rewritten ----
 await page.evaluate(([k,id])=>{const m=JSON.parse(localStorage.getItem(k));const img=m[id].images[0];const bin=atob(img.data);const last=bin.length-1;img.data=btoa(bin.slice(0,last)+String.fromCharCode(bin.charCodeAt(last)^1));localStorage.setItem(k,JSON.stringify(m));},[KEY,id]); // one byte of the picture changed in place: same size, still valid base64
 const tampered=await page.evaluate(k=>localStorage.getItem(k),KEY);
 await page.reload();await ready();await openInstructions();
 await page.waitForSelector('#lookControls .look-warning',{timeout:10000});
 assert(/no longer matches the checksum it was kept with/.test(await page.locator('#lookControls .look-warning').innerText()),'the person is told why the look is not shown');
 assert(await page.locator('#lookStrip').isHidden()&&await page.getAttribute('#messages','data-look-palette')===null,'nothing of the look is drawn: no strip, no palette on the messages');
 assert(await page.evaluate(k=>localStorage.getItem(k),KEY)===tampered&&(await presets()).length===1,'the stored record and the preset are left exactly as they were');
 assert(await page.locator('#lookControls button:has-text("Remove look")').count()===1,'the person can still remove it');
 await page.evaluate(([k,id,good])=>{localStorage.setItem(k,JSON.stringify(good));},[KEY,id,good]);
 await page.reload();await ready();await page.waitForSelector('#lookStrip:not([hidden])',{timeout:10000});
 assert(await page.locator('#lookControls .look-warning').count()===0,'with the picture intact the look is shown again and the warning is gone');
 ok('a stored picture that no longer matches its checksum is not drawn, the person is told, and nothing is rewritten');

 // ---- remove, and removal leaves nothing behind ----
 await openInstructions(); // the section starts collapsed after a reload
 await page.click('#lookControls button:has-text("Remove look")');
 await dialog('Remove look').waitFor();await page.click('.app-dialog .dialog-actions button:has-text("Remove look")');
 await page.waitForSelector('#lookStrip',{state:'hidden'});
 assert(JSON.stringify(await kept())==='{}','removing the look leaves an empty map: no record, no picture');
 assert(await page.locator('#lookControls').isHidden()&&await page.getAttribute('#messages','data-look-palette')===null,'the controls and the palette are gone');
 assert((await presets()).length===1,'the preset and the chat stay');
 ok('Remove look deletes the look and every picture, and keeps the preset');

 // ---- deleting the preset takes its look with it ----
 await page.evaluate(([k,id,good])=>{localStorage.setItem(k,JSON.stringify(good));},[KEY,id,good]);await page.reload();await ready();
 await page.click('button[aria-label="This device menu"]');await page.click('.shell-pop .shell-pop-row:has-text("Memory & preferences")');
 await page.waitForSelector('.app-dialog:has-text("Assistant presets")');
 await page.click('.app-dialog button:has-text("Delete")');
 await page.waitForFunction(k=>{const v=JSON.parse(localStorage.getItem(k)||'{}');return Object.keys(v).length===0;},KEY,{timeout:10000});
 assert((await presets()).length===0&&JSON.stringify(await kept())==='{}','deleting the preset removed its look too');
 await page.keyboard.press('Escape');
 ok('deleting a preset deletes its look');

 // ---- ferry-clerk: the character is added, its unusable look is not kept ----
 await page.reload();await ready();await openInstructions();
 await chooseFile('ferry-clerk.json',ferry);await dialog('Preview character package').waitFor();
 assert(await page.locator('.pkg-character button:has-text("Add as a preset…")').count()===1&&await page.locator('.pkg-character button:has-text("with this look")').count()===0,'a package whose look is refused offers only the plain preset');
 await page.click('.pkg-character button:has-text("Add as a preset…")');await dialog('Review preset').waitFor();
 assert(/only the character.s text is added/.test(await dialog('Review preset').innerText()),'the box says only the text is added');
 await page.click('.app-dialog .dialog-actions .primary');await page.waitForFunction(()=>JSON.parse(localStorage.getItem('plc.presets.v1')||'[]').some(p=>p.name==='Ferry Clerk'),null,{timeout:10000});await page.waitForTimeout(500); // the preset is saved; give the (absent) look the time it would need
 assert((await presets()).some(p=>p.name==='Ferry Clerk')&&JSON.stringify(await kept())==='{}','the preset is added and no look is kept');
 ok('a package whose look is refused still gives the plain preset, with no look kept');

 assert(outside.length===0,'nothing left the origin: '+outside.join(' | '));
 assert((await requestsToModel()).length===modelBefore+1,'only the one chat request reached the provider');
 assert(h.errors.length===0,'no page errors: '+h.errors.join(' | '));
 console.log('character-look e2e: ok');
}catch(e){console.error(e);console.error(await page.locator('.app-dialog').innerText().catch(()=>''));process.exitCode=1;}
finally{await h.close();}
