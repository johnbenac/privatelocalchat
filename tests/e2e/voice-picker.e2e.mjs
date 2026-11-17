process.env.PLC_E2E_BRANCH = 'dev'; // the engine test hook lives inside the dev diagnostics markers, which only dev builds keep
import {launch,assert} from './harness.mjs';
// The voice picker: its own pill beside the model picker. Every voice is always choosable; choosing one that is not downloaded downloads it at once with visible
// progress; a failure is explained and the next try asks once and then goes ahead; nothing is gated by a device test. Driven with an in-page fake engine.
const mocks=()=>{
 window.__fake={files:{},calls:[],failInstall:false,speaks:[]};
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const factory=async id=>({
  async status(){return {installed:!!window.__fake.files[id],bytes:window.__fake.files[id]?(id==='kitten'?27.6e6:96.5e6):0};},
  async install(p){window.__fake.calls.push('install:'+id);p({phase:'connecting',overallLoaded:0,overallTotal:100});await sleep(250);
   if(window.__fake.failInstall)throw new Error('Connection timed out');
   p({overallLoaded:50,overallTotal:100,file:'x'});await sleep(250);p({overallLoaded:100,overallTotal:100});window.__fake.files[id]=true;},
  async remove(){window.__fake.calls.push('remove:'+id);window.__fake.files[id]=false;},
  async load(){},async unload(){},terminate(){},
  async speak(t,{onChunk}){window.__fake.speaks.push(id+':'+t.slice(0,20));onChunk({samples:new Float32Array(2400).fill(0.1),sampleRate:24000,index:0,count:1,text:t});return {audioSeconds:4,synthSeconds:1,realTimeFactor:4,firstAudioMs:200};}
 });
 factory.inputs={env:()=>({deviceMemoryGB:8,cores:8,webgpu:{available:false}}),loadModule:async()=>({runComputeProbe:async()=>({ms:100})})};
 window.__plcVoiceEngineFactory=factory;
};
const h=await launch({init:mocks,port:19401,storage:{'plc.test.voice':'1'}});const {page}=h;
let confirms=[]; // the page's own confirmation dialogs (never the browser's): what each said
const answer=async label=>{await page.waitForSelector('.app-dialog');confirms.push(await page.locator('.app-dialog').innerText());await page.locator('.app-dialog button',{hasText:label}).last().click();await page.waitForSelector('.app-dialog',{state:'detached'});};
page.on('dialog',d=>{console.error('NATIVE DIALOG (not allowed):',d.message());d.dismiss();process.exitCode=1;});
const ok=n=>console.log('PASS',n);
const pill=()=>page.locator('#voicePill');
const open=async()=>{await pill().click();await page.waitForSelector('.shell-pop');};
const vrow=name=>page.locator('.shell-pop-row[role="menuitemradio"]',{hasText:name}).first(); // the voice rows, not the Remove/Hear rows
const rowText=async name=>(await vrow(name).textContent())||'';
try{
 await page.waitForFunction(()=>!document.querySelector('#messageInput').disabled);
 await page.waitForSelector('#voicePill:not([hidden])',{timeout:15000});
 assert((await pill().textContent()).includes('System'),'the pill starts on the system voice');
 assert(await page.locator('#modelPill').count()===1&&await pill().count()===1,'the voice picker is its own control beside the model picker');

 // the list: every voice is there, with its size and licence, nothing hidden
 await open();
 for(const n of ['System voice','Kitten','Kokoro'])assert(await page.locator('.shell-pop-row',{hasText:n}).count()===1,n+' is listed');
 assert(/Not downloaded \(28 MB\)/.test(await rowText('Kitten')),'Kitten shows its size: '+await rowText('Kitten'));
 assert(/Not downloaded \(97 MB\)/.test(await rowText('Kokoro')),'Kokoro shows its size');
 assert(/Apache-2\.0/.test(await rowText('Kitten')),'and its licence');
 assert(await page.locator('.shell-pop-row[aria-checked="true"]',{hasText:'System voice'}).count()===1,'the system voice is the one in use');
 ok('every voice is listed with size and licence');

 // choosing a voice that is not downloaded downloads it at once, and the pill shows it
 await vrow('Kitten').click();
 await page.waitForFunction(()=>/Kitten (connecting|\d+%|testing)/.test(document.querySelector('#voicePill').textContent),null,{timeout:5000});
 ok('the pill shows the download as it happens');
 await page.waitForFunction(()=>document.querySelector('#voicePill').textContent.trim().endsWith('Kitten')&&document.querySelector('#voicePill').dataset.status==='ready',null,{timeout:8000});
 assert(await page.evaluate(()=>window.__fake.calls.includes('install:kitten')),'it was downloaded without any other step');
 ok('choosing a voice downloads and selects it');

 // reading uses the chosen voice
 await page.fill('#messageInput','hello');await page.click('#sendBtn');
 await page.waitForFunction(()=>/Response complete\./.test(document.querySelector('#generationStatus').textContent));
 await page.click('.message.assistant [data-action="speak"]');
 await page.waitForFunction(()=>window.__fake.speaks.some(s=>s.startsWith('kitten:')),null,{timeout:8000});
 ok('Listen reads in the chosen voice');

 // the memory cue: the dot and the list say whether the voice is in memory, and the person can free it
 await page.waitForFunction(()=>document.querySelector('#voicePill').dataset.memory==='loaded',null,{timeout:8000});
 assert(/In memory, ready/.test(await page.locator('#voicePill').getAttribute('title')),'the pill says the voice is in memory');
 await open();
 assert(/In memory, ready/.test(await rowText('Kitten')),'the list says Kitten is in memory: '+await rowText('Kitten'));
 await page.locator('.shell-pop-row',{hasText:'Free the memory'}).click();
 await page.waitForFunction(()=>document.querySelector('#voicePill').dataset.memory==='unloaded',null,{timeout:5000});
 assert(await page.evaluate(()=>window.__fake.files.kitten===true),'freeing the memory keeps the downloaded files');
 assert(/Not in memory/.test(await page.locator('#voicePill').getAttribute('title')),'the pill now says it is not in memory');
 ok('the memory cue follows loaded and unloaded');

 // a click on a voice is a toggle on whether it is loaded; the menu stays open so the change is visible
 await open();
 await vrow('Kitten').click();
 await page.waitForFunction(()=>document.querySelector('#voicePill').dataset.memory==='loaded',null,{timeout:5000});
 assert(await page.locator('.shell-pop').count()===1,'the menu stays open after a click');
 assert(/In memory, ready/.test(await rowText('Kitten')),'a click on an unloaded voice loads it');
 await vrow('Kitten').click();
 await page.waitForFunction(()=>document.querySelector('#voicePill').dataset.memory==='unloaded',null,{timeout:5000});
 assert(await page.locator('.shell-pop-row[aria-checked="true"]',{hasText:'Kitten'}).count()===1,'a click on a loaded voice unloads it and it stays the chosen voice');
 assert(await page.evaluate(()=>window.__fake.files.kitten===true),'the files stay');
 await vrow('System voice').click();await vrow('System voice').click();
 assert(await page.locator('.shell-pop-row[aria-checked="true"]',{hasText:'System voice'}).count()===1,'the system voice is a plain selection, not a toggle');
 assert(!/free|instant/i.test(await rowText('System voice')),'and it is not described as free or instant: '+await rowText('System voice'));
 await vrow('Kitten').click();   // back to Kitten for the rest
 await page.waitForFunction(()=>document.querySelector('#voicePill').textContent.trim().startsWith('Kitten'));
 ok('a click toggles whether a voice is loaded');

 // a failing download is explained, the previous voice stays, and the next try asks once then goes ahead
 await page.evaluate(()=>{window.__fake.failInstall=true;});
 await open();await vrow('Kokoro').click();
 await page.waitForFunction(()=>document.querySelector('#voicePill').dataset.status==='error',null,{timeout:8000});
 await open();
 assert(/could not be set up: Connection timed out/.test(await page.locator('.shell-pop-note').first().textContent()),'the failure is explained in the menu');
 assert(await page.locator('.shell-pop-row[aria-checked="true"]',{hasText:'Kitten'}).count()===1,'the voice the person had stays selected');
 assert(/Failed: Connection timed out\. Tap to try again\./.test(await rowText('Kokoro')),'Kokoro says why it failed: '+await rowText('Kokoro'));
 confirms=[];
 await vrow('Kokoro').click();
 await answer('Try again');
 await page.waitForFunction(()=>window.__fake.calls.filter(c=>c==='install:kokoro').length===2,null,{timeout:8000});
 assert(confirms.length===1&&/already failed/.test(confirms[0]),'trying again asked once, in the page\'s own dialog: '+confirms[0]);
 ok('after a failure the next try asks once, then goes ahead');
 for(let i=0;i<3;i++){await page.waitForTimeout(700);await open();await vrow('Kokoro').click();await answer('Try again');await page.waitForTimeout(100);}
 assert(await page.evaluate(()=>window.__fake.calls.filter(c=>c==='install:kokoro').length)>=4,'there is no limit on tries');
 ok('there is no limit on tries');

 // and it can work: the voice comes in, becomes the selected one, the failure history is gone
 await page.evaluate(()=>{window.__fake.failInstall=false;});
 await page.waitForTimeout(900);
 await open();await vrow('Kokoro').click();
 await page.waitForFunction(()=>document.querySelector('#voicePill').textContent.trim().endsWith('Kokoro')&&document.querySelector('#voicePill').dataset.status==='ready',null,{timeout:8000});
 ok('a retry that works selects the voice');

 // management: total, remove
 await open();
 assert(/Voices on this device: 124 MB/.test(await page.locator('.shell-pop-heading',{hasText:'Voices on this device'}).textContent()),'the menu shows the total on the device');
 await page.locator('.shell-pop-row',{hasText:'Remove Kokoro'}).click();
 await answer('Remove');
 await page.waitForFunction(()=>window.__fake.files.kokoro===false&&/Kitten|System/.test(document.querySelector('#voicePill').textContent));
 assert((await pill().textContent()).includes('System'),'removing the selected voice returns to the system voice');
 assert(await page.evaluate(()=>window.__fake.files.kitten===true),'the other downloaded voice is untouched');
 ok('remove and total');

 // Settings shows the same list, with a button per voice
 await page.evaluate(()=>window.plcShell.openSettings('voice'));
 await page.waitForSelector('#voiceCard .set-row');
 const card=await page.textContent('#voiceCard');
 assert(/System voice/.test(card)&&/Kitten/.test(card)&&/Kokoro/.test(card),'Settings lists the voices');
 assert(await page.locator('#voiceCard .set-btn',{hasText:'Download'}).count()===1,'Kokoro offers Download');
 assert(await page.locator('#voiceCard .set-btn',{hasText:'Use'}).count()>=1,'a downloaded voice offers Use');
 assert(/Total on this device/.test(card),'Settings shows the total');
 await page.locator('#voiceCard .set-btn',{hasText:'Use'}).first().click();
 ok('Settings > Voice');
 // on a phone the composer must not overflow, and the voice pill must sit beside the model pill without covering anything
 await page.evaluate(()=>{document.querySelector('#modelPill .shell-model-name').textContent='Qwen3.5-2B (light)';}); // a realistic, long model name
 await page.setViewportSize({width:390,height:800});await page.waitForTimeout(400);
 const geo=await page.evaluate(()=>{const bar=document.querySelector('.composer-bar'),b=bar.getBoundingClientRect();
  const boxes=['#shellPlus','#modelPill','#voicePill','#micBtn','#voiceModeBtn','#sendBtn'].map(id=>{const e=document.querySelector(id);if(!e)return null;const r=e.getBoundingClientRect();return {id,l:Math.round(r.left),r:Math.round(r.right),w:Math.round(r.width),h:Math.round(r.height),shown:r.width>0&&getComputedStyle(e).display!=='none'};}).filter(x=>x&&x.shown);
  return {barW:Math.round(b.width),overflow:bar.scrollWidth>bar.clientWidth+1,pageOverflow:document.documentElement.scrollWidth>window.innerWidth+1,boxes};});
 assert(!geo.overflow&&!geo.pageOverflow,'the composer does not overflow at 390 px: '+JSON.stringify(geo));
 const vis=geo.boxes.filter(x=>x.id!=='#sendBtn').sort((a,b)=>a.l-b.l);
 for(let i=1;i<vis.length;i++)assert(vis[i].l>=vis[i-1].r-1,'no two controls overlap: '+vis[i-1].id+' and '+vis[i].id+' '+JSON.stringify(vis));
 const vp=geo.boxes.find(x=>x.id==='#voicePill');assert(vp&&vp.h>=32,'the voice pill is a comfortable target: '+JSON.stringify(vp));
 ok('phone layout');
 assert(h.errors.length===0,'no page errors: '+h.errors.join('|'));
 console.log('voice-picker e2e passed');
}catch(e){console.error(e);console.error(h.errors);process.exitCode=1;}finally{await h.close();}
