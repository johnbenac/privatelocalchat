import {launch,assert} from './harness.mjs';
// Roberta, the app's robot, on her own page: an incoming call (computers) or voicemail (phones) before any model exists, a phone menu, and a call with a keypad.
// Headless browsers have no GPU and no voices, so the model bridge, speech and recognition are scripted.
const IPHONE='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const mocks=(ua)=>{
 if(ua)Object.defineProperty(navigator,'userAgent',{get:()=>ua,configurable:true});
 window.__spoken=[];window.__recs=[];window.__speakMs=5;
 const voices=[{voiceURI:'v1',name:'Voice',lang:'en-US',localService:true}];
 Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{getVoices:()=>voices,cancel(){window.__timers?.forEach(t=>clearTimeout(t));window.__timers=[];},addEventListener(){},removeEventListener(){},speak(u){window.__spoken.push(u.text);(window.__timers||=[]).push(setTimeout(()=>u.onend&&u.onend(),window.__speakMs));}}});
 window.SpeechSynthesisUtterance=function(t){this.text=t;};
 class Rec{constructor(){window.__recs.push(this);}start(){this.started=true;}stop(){this.started=false;this.onend&&this.onend();}abort(){this.started=false;this.aborted=true;}emit(t,f=true){this.onresult&&this.onresult({resultIndex:0,results:[Object.assign([{transcript:t}],{isFinal:f})]});}}
 window.SpeechRecognition=Rec;
 window.__tones=[];window.AudioContext=class{constructor(){this.currentTime=0;this.state='running';this.destination={};}createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){}},connect(){}};}createOscillator(){const o={type:'',frequency:{value:0},connect(){},start(){},stop(){}};window.__tones.push(o);return o;}resume(){}close(){}};
};
const fakeModel=()=>{
 const lm=window.localModels,st={ready:false};
 const def=(k,get)=>Object.defineProperty(lm,k,{get,configurable:true});
 def('mode',()=>'local');def('ready',()=>st.ready);def('canPrepare',()=>true);def('supported',()=>true);def('installed',()=>st.ready);def('backend',()=>'gpu');
 lm.prepareInfo=()=>({tier:window.__tier||'default',modelName:'Qwen3.5-9B',downloadBytes:window.__tier==='light'?1.2e9:5.6e9,installed:false});
 lm.ensureReady=({onProgress}={})=>new Promise(()=>{window.__prepCalls=(window.__prepCalls||0)+1;onProgress?.({phase:'download',fraction:0.4,bytesDone:2.2e9,totalBytes:5.6e9,modelName:'Qwen3.5-9B'});Object.defineProperty(lm,'state',{get:()=>({busy:'install',transfer:{bytesDone:2.24e9,bytesTotal:5.6e9},load:{state:'unloaded'}}),configurable:true});});
 lm.cancelDownload=()=>{};lm.switchTier=async()=>{};
 window.dispatchEvent(new Event('local-model-state'));
};
const run=async(label,viewport,touch,ua)=>{
 const h=await launch({build:label==='desktop',port:18800+Math.floor(Math.random()*90),viewport,touch,init:mocks});
 const {page}=h;
 try{
  if(ua){await page.addInitScript(mocks,ua);await page.reload();}
  await page.waitForFunction(()=>!document.querySelector('#messageInput').disabled);
  await page.evaluate(fakeModel);
  const desktop=label==='desktop';
  // the empty chat is only a greeting: Roberta is a person-visible destination in the sidebar panel, not a card in the chat
  await page.waitForSelector('#emptyState');
  assert(await page.locator('.roberta-incoming, .roberta-thread').count()===0,label+': Roberta is not inside the empty chat');
  if(!desktop){await page.click('button[aria-label="Open sidebar"]');await page.waitForSelector('#robertaDot',{state:'visible'});}
  await page.click('#robertaDot');
  await page.waitForSelector('#robertaPage:not([hidden])');
  assert((await page.locator('#robertaPage .roberta-page-title').innerText()).includes('Roberta'),label+': Roberta has her own page');

  if(desktop){
   // a computer gets an incoming call, styled like a video call, before anything is set up
   await page.waitForSelector('.roberta-incoming');
   const t=await page.locator('.roberta-incoming').innerText();
   assert(/Roberta/.test(t)&&/is calling/.test(t)&&/prepared messages, not a person/.test(t),label+': incoming call: '+t);
   assert(await page.locator('#robertaAnswerBtn').isVisible()&&await page.locator('#robertaVoicemailBtn').isVisible(),label+': Answer or read the voicemail');
   await page.click('#robertaVoicemailBtn');
  }
  await page.waitForSelector('.roberta-thread .voice-note');
  assert(await page.locator('.roberta-badge').isVisible(),label+': a new voicemail');
  assert((await page.locator('.roberta-thread .vn-from').first().innerText())==='Voice note from Roberta',label+': a voice note from a named robot');
  await page.click('.roberta-thread .vn-text-toggle');
  const intro=await page.locator('.roberta-transcript').first().innerText();
  assert(/Hello, this is Roberta, the robot for Private Local Chat/.test(intro)&&/I'm a program, not a person\. I don't have feelings or awareness/.test(intro)&&/prepared messages/.test(intro),label+': who she is: '+intro);
  assert(ua?/iPhone/.test(intro)&&/on the phone itself/.test(intro)&&/about 5\.6 gigabytes/.test(intro):/computer|Mac|Windows|Linux/.test(intro)&&/this computer/.test(intro),label+': adapted to the device: '+intro);
  assert(!/Press 1 for privacy/.test(intro),label+': the menu is shown as buttons, not read in the note');
  const chips=await page.locator('.roberta-chip').allInnerTexts();
  assert(chips.length===10&&/^1\s*privacy/i.test(chips[0].replace(/\n/g,' '))&&chips.some(c=>/3/.test(c)&&/download/i.test(c))&&chips.some(c=>/4/.test(c)&&/share/i.test(c)),label+': numbered replies: '+JSON.stringify(chips));
  assert(await page.locator('.roberta-chip').first().evaluate(b=>b.getBoundingClientRect().height)>=44,label+': touch-sized');

  // nothing speaks until a tap; a number plays the answer and runs what it names
  assert((await page.evaluate(()=>window.__spoken.length))===0,label+': silent until asked');
  await page.click('.roberta-chip[data-key="1"]');
  await page.waitForFunction(()=>window.__spoken.some(t=>/your thinking stays yours/.test(t)),null,{timeout:5000});
  await page.waitForFunction(()=>document.querySelectorAll('.roberta-msg.roberta').length>=2);
  assert(await page.evaluate(()=>window.__tones.length)>=2,label+': keypad tone');
  await page.click('.roberta-chip[data-key="1"]');   // now the privacy sub-menu: 1 = the cloud
  await page.waitForFunction(()=>window.__spoken.some(t=>/nothing you type is sent to the cloud/.test(t)),null,{timeout:5000});
  await page.click('.roberta-chip[data-key="*"]');
  await page.click('.roberta-chip[data-key="4"]');
  await page.waitForSelector('.app-dialog h2');
  assert((await page.locator('.app-dialog h2').innerText())==='Share Private Local Chat',label+': pressing 4 opens the share sheet');
  await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('.app-dialog'));
  // 3 starts the download while she keeps talking
  await page.click('.roberta-chip[data-key="3"]');
  await page.waitForFunction(()=>window.__prepCalls===1,null,{timeout:5000});
  assert(await page.locator('.roberta-thread').isVisible(),label+': she keeps talking while the download starts');
  await page.click('.roberta-chip[data-key="3"]');   // asking again hears how it is going
  await page.waitForFunction(()=>window.__spoken.some(t=>/downloading: \d+ percent done/.test(t)),null,{timeout:5000});

  // the call: a window on a computer, the whole screen on a phone; keypad keys carry the menu
  await page.click('#robertaPage .roberta-call');await page.waitForSelector('#robertaCall:not([hidden])');
  assert((await page.textContent('#rcallStatus'))==='Calling…','calling first');
  await page.waitForFunction(()=>document.querySelector('#rcallStatus').textContent!=='Calling…',null,{timeout:5000});
  const box=await page.locator('.rcall').boundingBox();
  if(desktop)assert(box.width<=544&&box.x>100,label+': a window: '+JSON.stringify(box));
  else assert(box.width>=viewport.width-2&&box.height>=viewport.height-2,label+': the whole screen: '+JSON.stringify(box));
  await page.waitForFunction(()=>/^0:0[1-9]$/.test(document.querySelector('#rcallTimer').textContent),null,{timeout:6000});
  assert((await page.locator('#rk1 .rk-sub').innerText()).toLowerCase().includes('privacy')&&(await page.locator('#rk4 .rk-sub').innerText()).toLowerCase().includes('share'),label+': keys are labelled with the menu');
  await page.evaluate(()=>{window.__spoken.length=0;});
  await page.click('#rk1');await page.waitForFunction(()=>/thinking stays yours/.test(document.querySelector('#rcallLine').textContent)||window.__spoken.some(t=>/thinking stays yours/.test(t)),null,{timeout:5000});
  if(desktop){await page.keyboard.press('2');await page.waitForFunction(()=>window.__spoken.some(t=>/live in this browser's storage/.test(t)),null,{timeout:5000});}
  assert(await page.locator('#rcallSpeak').isVisible(),label+': tap to speak');
  await page.click('#rcallEnd');await page.waitForFunction(()=>document.querySelector('#robertaCall').hidden);
  ok(label);
  // not now: back to the chats, and Roberta is still one tap away from the page's call button and from Help & about
  await page.click('#robertaDismissBtn');await page.waitForFunction(()=>document.querySelector('#robertaPage').hidden);
  assert(await page.locator('#messageInput').isVisible(),label+': Not now returns to the chat');
  if(!desktop){await page.click('button[aria-label="Open sidebar"]');await page.waitForSelector('.sidebar .mobile-only',{state:'visible'});}
  if(desktop)await page.click('#shellRail .shell-icon-btn[aria-label="Explore"]');
  else await page.click('.sidebar .mobile-only:has-text("Explore")');
  await page.locator('.shell-pop-row',{hasText:'Help & about'}).click();
  await page.waitForSelector('#helpCallRoberta');await page.click('#helpCallRoberta');
  await page.waitForSelector('#robertaCall:not([hidden])');await page.keyboard.press('Escape');await page.waitForFunction(()=>document.querySelector('#robertaCall').hidden);
  const unexpected=h.errors.filter(e=>!/API responded with status|network error|Roberta is matching|Failed to load resource|intent-router|embedder|ivr-vectors/.test(e));
  assert(unexpected.length===0,label+': no unexpected page errors: '+JSON.stringify(unexpected));
 }catch(e){console.error(label,(e.stack||e.message).split('\n').filter(l=>/roberta.e2e/.test(l)||!l.startsWith('    at')).slice(0,4).join(' / '));console.error(await page.locator('#messages').innerText().catch(()=>''));console.error(h.errors);process.exitCode=1;}
 finally{await h.close();}
};
const ok=n=>console.log('PASS',n);
await run('desktop',{width:1280,height:800},false);
await run('iphone',{width:390,height:780},true,IPHONE);
if(!process.exitCode)console.log('ALL PASS');
