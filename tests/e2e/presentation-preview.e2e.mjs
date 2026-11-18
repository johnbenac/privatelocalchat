// Previewing a Cosmogenitor character package (board T444), end to end, in a real browser, with the producer's REAL first packages (tests/fixtures/presentation/):
// lantern-keeper (valid: folio, sea, a portrait and a background, a chime and an extra aspect PLC cannot use) and ferry-clerk (a required portrait with no bytes).
// A preview only: nothing is stored, sent or applied; the images come from bytes the shared validator checked; keyboard, focus, reflow, reduced motion, text alternatives and contrast
// are checked as a person would meet them. Fixtures and the real browser are recorded separately in the board note.
//   node scripts/e2e.mjs presentation-preview
// The browser profile is a new folder under PLC_E2E_PROFILE_ROOT (default: the system temporary folder); E2E_PORT_OFFSET moves the port (base 18541).
import {readFileSync} from 'node:fs';
import {launch,assert} from './harness.mjs';
import {newProfileDir} from './profile-root.mjs';
const ok=n=>console.log('PASS '+n);
const bundle=n=>readFileSync(new URL('../fixtures/presentation/'+n+'.bundle.json',import.meta.url),'utf8');
const lantern=bundle('lantern-keeper'),ferry=bundle('ferry-clerk');
process.env.SITE_DIR=process.env.SITE_DIR||'tests/fixtures/site'; // the reader ships only in our own deployment (the site target), so this suite builds the fixture site
const h=await launch({port:18541,profileDir:newProfileDir('presentation-preview')});
const {context}=h;const page=h.page;const origin=h.origin;
const outside=[];context.on('request',r=>{const u=new URL(r.url());if(u.origin!==origin&&!/^(data|blob|about):/.test(r.url()))outside.push(r.method()+' '+r.url());});
await page.addInitScript(()=>{window.__pics={made:[],revoked:[]};const c=URL.createObjectURL.bind(URL),r=URL.revokeObjectURL.bind(URL);URL.createObjectURL=b=>{const u=c(b);if(b&&/^image\//.test(b.type))window.__pics.made.push(u);return u;};URL.revokeObjectURL=u=>{window.__pics.revoked.push(u);return r(u);};}); // only the preview's picture addresses are followed; the app makes others of its own
await page.reload();
const ready=async()=>{await page.waitForSelector('#messageInput');await page.waitForFunction(()=>window.__plcBooted===true&&Boolean(window.plcShell),null,{timeout:20000});await page.waitForFunction(()=>!document.querySelector('#messageInput').disabled);};
const openInstructions=async()=>{if(!await page.locator('#systemPromptInput').isVisible()){await page.click('#shellPlus');await page.click('.shell-pop .shell-pop-row:has-text("Instructions for this chat")');}await page.waitForSelector('#previewCharacterBtn',{state:'visible'});};
const chooseFile=async(name,content)=>{const [chooser]=await Promise.all([page.waitForEvent('filechooser'),page.click('#previewCharacterBtn')]);await chooser.setFiles({name,mimeType:'application/json',buffer:Buffer.isBuffer(content)?content:Buffer.from(content)});};
const preview=()=>page.locator('.app-dialog:has-text("Preview character package")');
const closePreview=async()=>{await page.click('.app-dialog .dialog-actions button:has-text("Close")');await page.waitForFunction(()=>!document.querySelector('.app-dialog'));};
const dismissAlert=async()=>{await page.click('.app-dialog button:has-text("OK")');await page.waitForFunction(()=>!document.querySelector('.app-dialog'));};
const dump=()=>page.evaluate(async()=>{const out={local:{},session:{},idb:[]};for(let i=0;i<localStorage.length;i++)out.local[localStorage.key(i)]=localStorage.getItem(localStorage.key(i));for(let i=0;i<sessionStorage.length;i++)out.session[sessionStorage.key(i)]=sessionStorage.getItem(sessionStorage.key(i));out.idb=(await indexedDB.databases()).map(d=>d.name).sort();return JSON.stringify(out);});
const requestsToModel=()=>fetch(`http://127.0.0.1:${h.api.port}/__requests`).then(r=>r.json());
const parse=c=>c.match(/\d+(\.\d+)?/g).slice(0,3).map(Number);
const lum=([r,g,b])=>{const f=v=>{v/=255;return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4;};return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b);};
const contrast=(a,b)=>{const [x,y]=[lum(parse(a)),lum(parse(b))].sort((p,q)=>q-p);return (x+0.05)/(y+0.05);};
try{
 await ready();
 const modelBefore=(await requestsToModel()).length;
 await page.click('#newChatBtn');await openInstructions();
 const before=await dump();

 // ---- lantern-keeper: the valid package ----
 await chooseFile('lantern-keeper.json',lantern);
 await preview().waitFor();
 const text=await preview().innerText();
 assert(/only a preview/i.test(text)&&/Nothing is added, saved or applied/.test(text),'it says it is only a preview and nothing is added: '+text.slice(0,200));
 assert(await page.locator('.app-dialog h3').innerText()==='Lantern Keeper','the character is named');
 const card=page.locator('.pkg-card');
 assert(await card.getAttribute('data-palette')==='sea'&&await card.getAttribute('data-layout')==='folio','the card uses the package\'s layout and palette names: '+await card.getAttribute('data-palette')+' '+await card.getAttribute('data-layout'));
 const portrait=page.locator('.pkg-card img.pkg-portrait'),bg=page.locator('.pkg-card img.pkg-bg');
 assert(await portrait.count()===1&&await bg.count()===1,'one portrait and one background are drawn');
 assert((await portrait.getAttribute('alt'))==='Flat illustration of a pale lantern disc with an amber flame on deep teal.','the portrait carries its text alternative: '+await portrait.getAttribute('alt'));
 assert((await bg.getAttribute('alt'))===''&&(await bg.getAttribute('aria-hidden'))==='true','the background is hidden from assistive technology');
 assert(await portrait.evaluate(i=>i.complete&&i.naturalWidth>0)&&await bg.evaluate(i=>i.complete&&i.naturalWidth>0),'both pictures really loaded (from checked bytes)');
 assert((await portrait.getAttribute('src')).startsWith('blob:')&&(await bg.getAttribute('src')).startsWith('blob:'),'pictures come from blob addresses, not from any server');
 for(const piece of [/Layout: folio/,/Palette: sea \(cool, blue-green\)\. The app draws it with its own colours/,/made by Cosmogenitor \(generated by tools\/make-assets\), licence CC0-1\.0/,/lantern-chime” is audio or a document/])assert(piece.test(text),'the dialog says '+piece+': '+text);
 await page.click('.pkg-other summary');
 assert(/experimental:presentation-v2/.test(await page.locator('.pkg-other').innerText()),'the part PLC does not use is named, not hidden');
 ok('lantern-keeper previews: folio and sea, portrait and background from verified bytes, attribution, omissions and unused parts named');

 // the person can see it with the app's own look instead
 await page.check('.pkg-toggle input');
 assert(await card.getAttribute('data-palette')===null&&await card.getAttribute('data-layout')===null,'the own-look toggle removes the package look');
 await page.uncheck('.pkg-toggle input');
 assert(await card.getAttribute('data-palette')==='sea','and puts it back');
 ok('the preview can be shown with the app\'s own look and back');

 // contrast, reflow, reduced motion, in the real browser
 const colours=await page.evaluate(()=>{const t=document.querySelector('.pkg-turn'),s=getComputedStyle(t);return {fg:s.color,bg:s.backgroundColor};});
 assert(contrast(colours.fg,colours.bg)>=4.5,'text contrast on the message panel is at least 4.5: '+contrast(colours.fg,colours.bg).toFixed(2)+' '+JSON.stringify(colours));
 await page.setViewportSize({width:320,height:700});
 const over=await page.evaluate(()=>{const s=document.querySelector('.app-dialog .sheet');return {scroll:s.scrollWidth,client:s.clientWidth,page:document.documentElement.scrollWidth,view:innerWidth};});
 assert(over.scroll<=over.client+1&&over.page<=over.view+1,'no sideways scrolling at 320 px: '+JSON.stringify(over));
 assert(await portrait.evaluate(i=>i.getBoundingClientRect().width)<=320,'the picture fits a 320 px screen');
 await page.setViewportSize({width:1280,height:800});
 await page.emulateMedia({reducedMotion:'reduce'});
 assert(await page.evaluate(()=>document.getAnimations().filter(a=>a.effect&&a.effect.target&&a.effect.target.closest&&a.effect.target.closest('.pkg-preview')).length)===0,'nothing in the preview moves');
 await page.emulateMedia({reducedMotion:'no-preference'});
 ok('text contrast, 320 px reflow and reduced motion hold in a real browser');

 // keyboard and focus
 assert(await page.evaluate(()=>Boolean(document.activeElement&&document.activeElement.closest('.app-dialog'))),'focus moved into the dialog');
 for(let i=0;i<12;i++){await page.keyboard.press('Tab');assert(await page.evaluate(()=>Boolean(document.activeElement.closest('.app-dialog'))),'Tab stays inside the dialog (press '+(i+1)+')');}
 const labelled=await page.evaluate(()=>[...document.querySelectorAll('.app-dialog button,.app-dialog input,.app-dialog summary')].every(n=>(n.textContent||'').trim()||n.getAttribute('aria-label')||n.labels?.length));
 assert(labelled,'every control in the dialog has a name');
 await page.keyboard.press('Escape');
 await page.waitForFunction(()=>!document.querySelector('.app-dialog'));
 assert(await page.evaluate(()=>document.activeElement?.id)==='previewCharacterBtn','focus returns to the button that opened the preview');
 ok('keyboard: focus enters the dialog, Tab stays inside, Escape closes it and focus returns');

 // pictures are released when the preview closes
 const pics=await page.evaluate(()=>window.__pics);
 assert(pics.made.length===2&&pics.made.every(u=>pics.revoked.includes(u)),'both picture addresses made for the preview are released on close: '+JSON.stringify(pics));
 ok('the picture addresses are released when the preview closes');

 // nothing was stored, sent or applied
 assert(await dump()===before,'storage is byte-for-byte unchanged by previewing (local, session, IndexedDB names)');
 assert(outside.length===0,'nothing left the origin: '+outside.join(' | '));
 assert((await requestsToModel()).length===modelBefore,'no model or provider request was made');
 ok('previewing stores nothing, sends nothing and asks no model');

 // ---- ferry-clerk: a required portrait without bytes ----
 await chooseFile('ferry-clerk.json',ferry);
 await preview().waitFor();
 const t2=await preview().innerText();
 assert(await page.locator('.app-dialog h3').innerText()==='Ferry Clerk','the character is still listed');
 assert(await page.locator('.pkg-card').getAttribute('data-palette')===null,'the package look is not used');
 assert(await page.locator('.pkg-card img').count()===0,'no picture is drawn');
 assert(/look is not used; the app's own look is shown/.test(t2)&&/needs a picture that cannot be used/.test(t2)&&/does not contain the checked file for “asset:clerk-portrait”/.test(t2)&&/character itself is still in the package/.test(t2),'the refusal is explained: '+t2);
 assert(await page.locator('.pkg-toggle').count()===0,'there is no own-look toggle when there is no package look');
 await closePreview();
 ok('ferry-clerk: the presentation is refused with a reason, the character is kept, the app\'s own look shows');

 // ---- a second open is not stacked ----
 await chooseFile('lantern-keeper.json',lantern);await preview().waitFor();
 const [second]=await Promise.all([page.waitForEvent('filechooser'),page.evaluate(()=>document.getElementById('previewCharacterBtn').click())]); // a script click: the dialog traps real focus
 await second.setFiles({name:'lantern-keeper.json',mimeType:'application/json',buffer:Buffer.from(lantern)});
 await page.waitForFunction(()=>/Close the preview you have open first/.test(document.body.innerText),null,{timeout:5000});
 assert(await page.locator('.app-dialog').count()===1,'one preview at a time: a second package is told to wait, not stacked');
 await closePreview();
 ok('a second package opened while a preview is showing is not stacked on it');

 // ---- things that must be refused, with nothing shown ----
 const flipped=JSON.parse(lantern);const a=flipped.assets.find(x=>x.data);const b=Buffer.from(a.data,'base64');b[b.length-1]^=1;a.data=b.toString('base64');
 const refused=async(label,name,content,pattern)=>{
  await chooseFile(name,content);
  await page.waitForSelector('.app-dialog:has-text("Character package not opened")');
  const msg=await page.locator('.app-dialog').innerText();
  assert(pattern.test(msg),label+': '+msg);
  assert(await preview().count()===0,label+': no preview is offered');
  await dismissAlert();assert(await dump()===before,label+': storage unchanged');
 };
 await refused('one changed byte','changed.json',JSON.stringify(flipped),/could not be opened.*Nothing was used/s);
 await refused('not a package','note.json','{"hello":"world"}',/could not be opened/);
 await refused('not JSON at all','x.json','this is not json',/could not be opened/);
 await refused('a plain preset is not a package','preset.json',JSON.stringify({name:'A',prompt:'B'}),/could not be opened/);
 await refused('too large','big.json',Buffer.alloc(2*1024*1024+10,0x20),/too large/);
 ok('a changed byte, text that is not a package, a plain preset and an oversized file are refused with a plain reason and nothing changes');

 // ---- the script in package text is never run or drawn as markup ----
 const hostile=JSON.parse(lantern);
 hostile.content.subjects[0].label='<img src=x onerror="window.__pwned=1"> Lantern';
 // (changing the label changes the content hash, so the validator refuses it: that is itself the point)
 await refused('edited content','hostile.json',JSON.stringify(hostile),/could not be opened/);
 assert(await page.evaluate(()=>window.__pwned===undefined),'no package text ran as script');
 ok('edited package text is refused by the validator and nothing in it runs');

 assert(outside.length===0,'still nothing left the origin: '+outside.join(' | '));
 assert(h.errors.length===0,'no page errors: '+h.errors.join(' | '));
 console.log('presentation-preview e2e: ok');
}catch(e){console.error(e);console.error(await page.locator('.app-dialog').innerText().catch(()=>''));process.exitCode=1;}
finally{await h.close();}
