process.env.PLC_E2E_BRANCH = 'dev'; // the voice test hook lives inside the dev diagnostics markers
import {launch,assert} from './harness.mjs';
// Model memory: the "One model at a time" switch in Settings > Models, the list of what is in memory, the swap when a voice reads, and the offer after a failure.
const mocks=()=>{
 window.__fake={files:{kitten:true},speaks:[]};
 const factory=async id=>({
  async status(){return {installed:true,bytes:27.6e6};},
  async install(){},async remove(){},async load(){},async unload(){},terminate(){},
  async speak(t,{onChunk}){window.__fake.speaks.push(id);onChunk({samples:new Float32Array(2400).fill(0.1),sampleRate:24000,index:0,count:1,text:t});return {audioSeconds:4,synthSeconds:1,realTimeFactor:4,firstAudioMs:200};}
 });
 factory.inputs={env:()=>({deviceMemoryGB:8,cores:8,webgpu:{available:false}}),loadModule:async()=>({runComputeProbe:async()=>({ms:100})})};
 window.__plcVoiceEngineFactory=factory;
};
const h=await launch({init:mocks,port:19402,storage:{'plc.test.voice':'1','plc.voice.v2':JSON.stringify({v:2,selected:'kitten',failures:{}})}});const {page}=h;
const ok=n=>console.log('PASS',n);
try{
 await page.waitForFunction(()=>!document.querySelector('#messageInput').disabled);
 await page.waitForSelector('#voicePill:not([hidden])',{timeout:15000});
 // a stand-in for another model kind (image generation, OCR, ...) that is in memory
 await page.evaluate(async()=>{const m=await window.plcMemoryReady();window.__other={st:'loaded',unloads:0};
  m.register({id:'other',kind:'image',label:'the image model',state:()=>window.__other.st,isBusy:()=>false,unload:async()=>{window.__other.unloads++;window.__other.st='unloaded';}});});

 // Settings > Models: the switch is off by default and the list names each model with its state
 await page.evaluate(()=>window.plcShell.openSettings('models'));
 await page.waitForSelector('#oneAtATime');
 assert(!(await page.locator('#oneAtATime').isChecked()),'off by default');
 const card=await page.textContent('#memoryCard');
 assert(/the image model/i.test(card)&&/In memory/.test(card),'the card lists a loaded model: '+card);
 assert(/Kitten voice/.test(card)&&/Not in memory/.test(card),'and the voice as not in memory: '+card);
 ok('the Memory card lists every model with its state');

 // switch off: a voice reading does not unload anything, the app just tries
 await page.evaluate(()=>window.plcShell.closeSettings?.());
 await page.evaluate(async()=>{const m=await window.plcMemoryReady();const l=await m.acquire('voice');l.release();});
 assert(await page.evaluate(()=>window.__other.unloads===0),'with the switch off nothing is unloaded for another model');
 ok('switch off: nothing is unloaded');

 // switch on: using the voice unloads the other model first, and says so
 await page.evaluate(()=>window.plcShell.openSettings('models'));
 await page.waitForSelector('#oneAtATime');await page.locator('#oneAtATime').check();
 assert(await page.evaluate(()=>JSON.parse(localStorage.getItem('plc.modelMemory.v1')).policy==='one-at-a-time'),'the choice is stored');
 await page.evaluate(()=>{window.__seen=[];window.plcMemoryReady().then(m=>m.subscribe(s=>{if(s.activity)window.__seen.push(s.activity.text);}));});
 await page.evaluate(()=>window.plcShell.closeSettings?.());
 await page.evaluate(async()=>{const m=await window.plcMemoryReady();const l=await m.acquire('voice');l.release();});
 assert(await page.evaluate(()=>window.__other.unloads===1&&window.__other.st==='unloaded'),'the other model was unloaded for the voice');
 assert(await page.evaluate(()=>window.__seen.some(t=>/Unloading the image model to make room for the Kitten voice/.test(t))),'and the swap was explained: '+await page.evaluate(()=>window.__seen.join('|')));
 ok('switch on: the other model is unloaded and the swap is explained');

 // the embedding model (Roberta, search) gets no exception: using it unloads the others, and it is unloaded for them
 await page.evaluate(()=>{window.__other.st='loaded';});
 await page.evaluate(async()=>{const e=await window.plcApp.getEmbedder();await e.ready().catch(()=>{});});
 assert(await page.evaluate(()=>window.__other.st==='unloaded'),'using the embedding model unloaded the other model');
 ok('the embedding model is not an exception');

 // the offer after a failure: once per kind, Not now closes, Turn on switches it on, Don't ask again is remembered
 await page.evaluate(()=>window.plcMemoryReady().then(m=>m.setPolicy('keep')));
 await page.evaluate(()=>window.plcMemoryReady().then(m=>m.offerFailure('voice','the Kitten voice')));
 await page.waitForSelector('#memoryOffer');
 assert(/Kitten voice did not work/.test(await page.textContent('#memoryOffer')),'the offer names what failed');
 const col=await page.evaluate(()=>{const o=document.getElementById('memoryOffer'),b=o.querySelector('button.primary')||o.querySelector('button');return {card:getComputedStyle(o).backgroundColor+'|'+getComputedStyle(o).color,btn:getComputedStyle(o.querySelectorAll('button')[1]).color+'|'+getComputedStyle(o).backgroundColor};});
 assert(col.card.split('|')[0]!==col.card.split('|')[1]&&col.btn.split('|')[0]!==col.btn.split('|')[1],'the offer is readable (text differs from its background): '+JSON.stringify(col));
 await page.getByRole('button',{name:'Not now'}).click();
 assert(await page.locator('#memoryOffer').count()===0,'Not now closes it');
 await page.evaluate(()=>window.plcMemoryReady().then(m=>m.offerFailure('voice','the Kitten voice')));
 assert(await page.locator('#memoryOffer').count()===0,'it is not offered twice for the same kind in one page');
 await page.evaluate(()=>window.plcMemoryReady().then(m=>m.offerFailure('chat','the chat model')));
 await page.getByRole('button',{name:'Turn on'}).click();
 assert(await page.evaluate(()=>window.plcMemoryReady().then(m=>m.policy==='one-at-a-time')),'Turn on switches it on');
 await page.evaluate(()=>window.plcMemoryReady().then(m=>{m.setPolicy('keep');return m.offerFailure('image','the image model');}));
 await page.getByRole('button',{name:"Don't ask again"}).click();
 assert(await page.evaluate(()=>JSON.parse(localStorage.getItem('plc.modelMemory.v1')).offerDeclined===true),"Don't ask again is stored");
 ok('the failure offer');
 assert(h.errors.length===0,'no page errors: '+h.errors.join('|'));
 console.log('memory e2e passed');
}catch(e){console.error(e);console.error(h.errors);process.exitCode=1;}finally{await h.close();}
