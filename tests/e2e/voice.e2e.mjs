import {launch,assert} from './harness.mjs';
// Speech mocks: a recogniser the test can talk through, a voice that takes a configurable time per sentence, and a microphone permission switch.
const speechMocks=()=>{
 const spoken=[];window.__spoken=spoken;window.__recs=[];window.__speakMs=5;window.__mic='granted';
 const voices=[{voiceURI:'local-1',name:'Device Voice',lang:'en-US',localService:true}];
 Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{getVoices:()=>voices,cancel(){window.__cancels=(window.__cancels||0)+1;window.__timers?.forEach(t=>clearTimeout(t));},addEventListener(){},removeEventListener(){},speak(u){spoken.push(u.text);(window.__timers||=[]).push(setTimeout(()=>u.onend&&u.onend(),window.__speakMs));}}});
 window.SpeechSynthesisUtterance=function(t){this.text=t;};
 class Rec{constructor(){this.continuous=false;this.interimResults=false;window.__recs.push(this);}
  start(){this.started=true;if(window.__startError){const e=window.__startError;setTimeout(()=>this.onerror&&this.onerror({error:e}),0);}}
  stop(){this.started=false;this.onend&&this.onend();}abort(){this.started=false;this.aborted=true;}
  emit(text,final=true){this.onresult&&this.onresult({resultIndex:0,results:[Object.assign([{transcript:text}],{isFinal:final})]});}}
 window.SpeechRecognition=Rec;
 window.__tones=[];
 window.AudioContext=class{constructor(){this.currentTime=0;this.state='running';this.destination={};}createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){}},connect(){}};}createOscillator(){const o={type:'',frequency:{value:0},connect(){},start(){},stop(){}};window.__tones.push(o);return o;}resume(){}close(){}};
 Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>{if(window.__mic==='denied'){const e=new Error('denied');e.name='NotAllowedError';throw e;}return {getTracks:()=>[{stop(){}}]};}}});
};
const h=await launch({init:speechMocks,port:18271});
const {page}=h;
const ok=name=>console.log('PASS',name);
const openMemory=async()=>{await page.click('button[aria-label="This device menu"]');await page.click('.shell-pop .shell-pop-row:has-text("Memory & preferences")');await page.waitForSelector('.app-dialog');};
const live=()=>page.evaluate(()=>window.__recs.filter(r=>r.started).length);
const state=()=>page.getAttribute('#voiceSheet','data-state');
const waitState=(s,timeout=15000)=>page.waitForFunction(v=>document.querySelector('#voiceSheet')?.dataset.state===v,s,{timeout});
const requests=async()=>(await (await fetch(`http://127.0.0.1:${h.api.port}/__requests`)).json());
try{
 await page.waitForFunction(()=>!document.querySelector('#messageInput').disabled);
 assert(await page.locator('#voiceModeBtn').count()===1,'the call button exists');
 assert((await page.getAttribute('#voiceModeBtn','aria-label'))==='Voice call'&&await page.locator('#voiceModeBtn').isVisible()&&await page.locator('#voiceModeBtn svg').count()===1,'a visible call button with an icon and a call name');

 // it rings first ("Calling..."), then connects and the timer starts
 await page.click('#voiceModeBtn');
 await waitState('connecting',3000);
 assert((await page.textContent('#callStatus'))==='Calling\u2026'&&(await page.locator('.call-name').innerText())==='Private Local Chat','calling the assistant');
 assert(await page.locator('#voiceEnd').isVisible()&&(await page.locator('#voiceEnd').getAttribute('aria-label'))==='End call','End call is there while it rings');
 assert(await page.evaluate(()=>window.__tones.map(t=>t.frequency.value).join())==='440,480','a ringback tone');
 await waitState('listening');
 assert(await page.evaluate(()=>window.__tones.length)===4&&await page.evaluate(()=>window.__tones.slice(2).map(t=>t.frequency.value).join())==='880,1175','a pick-up blip once connected');
 assert((await page.textContent('#callTimer'))==='0:00'||(await page.textContent('#callTimer'))==='0:01','the call timer has started');
 await page.waitForFunction(()=>/^0:0[1-9]$/.test(document.querySelector('#callTimer').textContent),null,{timeout:6000});
 ok('call rings, connects and times itself');

 // a whole turn: listen, send after a pause, speak the reply sentence by sentence, listen again
 assert(await page.locator('#voiceSheet').isVisible(),'the voice sheet is shown');
 assert(!(await page.locator('#messageInput').isVisible()),'the typing box makes room for it');
 assert(await page.evaluate(()=>window.__recs.length===1&&window.__recs[0].started),'microphone on (opened by the tap that started the call)');
 await page.evaluate(()=>window.__recs[0].emit('speak about cats',false));
 assert((await page.textContent('#voiceCaption')).includes('speak about cats'),'what is heard is shown');
 await page.evaluate(()=>window.__recs[0].emit('speak about cats'));
 await waitState('thinking');
 assert(await page.evaluate(()=>window.__recs[0].aborted===true),'the microphone is off while the app thinks and speaks');
 await waitState('speaking');
 await waitState('listening');
 const spoken=await page.evaluate(()=>window.__spoken.filter(t=>t.trim()));
 assert(spoken.includes('Cats are small animals.')&&spoken.includes('They sleep a lot during the day.')&&spoken.at(-1)==='Dogs differ a great deal.','spoken sentence by sentence: '+JSON.stringify(spoken));
 assert((await page.locator('.message.user').last().innerText()).includes('speak about cats'),'the spoken prompt was sent as a message');
 const system=(await requests()).at(-1).body.messages.filter(m=>m.role==='system').map(m=>m.content).join('\n');
 assert(/read aloud/.test(system),'the model is told to answer for speaking');
 assert(await live()===1,'listening again for the next turn');
 ok('voice turn');

 // interrupt in the middle of a long reply
 await page.evaluate(()=>{window.__speakMs=400;window.__spoken.length=0;});
 await page.evaluate(()=>window.__recs.filter(r=>r.started).at(-1).emit('speak-long please'));
 await waitState('speaking');
 await page.waitForFunction(()=>window.__spoken.length>=1);
 assert(await page.locator('#voiceInterrupt').isVisible(),'interrupt offered while speaking');
 await page.click('#voiceInterrupt');
 await waitState('listening');
 const count=await page.evaluate(()=>window.__spoken.length);
 await page.waitForTimeout(1200);
 assert(await page.evaluate(()=>window.__spoken.length)===count,'nothing more is spoken after interrupting');
 assert(!(await page.locator('#voiceInterrupt').isVisible()),'interrupt is not shown while listening');
 assert(await page.evaluate(()=>!document.querySelector('#stopGeneration').offsetParent),'the reply was stopped');
 ok('voice interrupt');

 // mute, then leave with Escape
 await page.click('#voiceMute');
 assert(await state()==='paused'&&await live()===0,'muted: microphone off');
 assert((await page.textContent('#callStatus'))==='Muted'&&(await page.getAttribute('#voiceMute','aria-label'))==='Unmute microphone'&&(await page.getAttribute('#voiceMute','aria-pressed'))==='true','the mute button says what it will do');
 await page.click('#voiceMute');await waitState('listening');
 await page.keyboard.press('Escape');
 await waitState('ended',3000);
 assert((await page.textContent('#callStatus'))==='Call ended'&&/^\d+:\d\d$/.test(await page.textContent('#callTimer')),'hanging up shows how long the call lasted');
 assert(await page.evaluate(()=>window.__tones.length)>=6,'a hang-up tone');
 await page.waitForFunction(()=>document.querySelector('#voiceSheet').hidden,null,{timeout:6000});
 assert(await live()===0,'ended: microphone off');
 assert(await page.locator('#messageInput').isVisible(),'the typing box is back');
 ok('voice mute and end');

 // the call sounds can be turned off
 await openMemory();await page.uncheck('#callSoundsPref');await page.click('.app-dialog button:has-text("Done")');
 const tonesBefore=await page.evaluate(()=>window.__tones.length);
 await page.click('#voiceModeBtn');await waitState('listening');await page.click('#voiceEnd');await page.waitForFunction(()=>document.querySelector('#voiceSheet').hidden,null,{timeout:6000});
 assert(await page.evaluate(()=>window.__tones.length)===tonesBefore,'no sounds when they are off');
 ok('call sounds preference');

 // a microphone the browser blocks: the sheet explains it, and the controls stay when it is only a matter of allowing it
 await page.evaluate(()=>{window.__mic='denied';window.__startError='not-allowed';});
 await page.click('#voiceModeBtn');
 await waitState('error');
 await page.waitForFunction(()=>/blocked for this site/.test(document.querySelector('.voice-hint').textContent));
 assert((await page.textContent('#callStatus'))==='Call failed'&&(await page.locator('#voiceEnd + .call-control-label').innerText())==='Close','a failed call says so and offers Close');
 await page.click('#voiceEnd');
 assert(await page.locator('#voiceModeBtn').count()===1&&await page.locator('#micBtn').count()===1,'still offered when the person can fix it');
 ok('blocked microphone is explained');

 // a browser that keeps refusing speech recognition: the first failure asks to try again, the second explains what to check. The controls are
 // NEVER removed or remembered as unusable (an older version hid them for days, which locked people out with no explanation).
 await page.evaluate(()=>{window.__mic='granted';});
 await page.click('#micBtn');
 await page.waitForFunction(()=>/allowed now/.test(document.querySelector('#toast').textContent));
 await page.click('#micBtn');
 await page.waitForFunction(()=>/did not let the page use speech recognition/.test(document.querySelector('#toast').textContent));
 assert(await page.locator('#micBtn').count()===1&&await page.locator('#voiceModeBtn').count()===1,'the controls stay after repeated refusals');
 assert((await page.evaluate(()=>localStorage.getItem('plc.speechInputUnusable')))===null,'nothing is remembered about the failure');
 await page.evaluate(()=>localStorage.setItem('plc.speechInputUnusable',String(Date.now()))); // a flag left by an older version
 await page.reload();await page.waitForSelector('#messageInput');
 assert(await page.locator('#micBtn').count()===1&&await page.locator('#voiceModeBtn').count()===1,'an old stored block no longer hides the controls');
 assert((await page.evaluate(()=>localStorage.getItem('plc.speechInputUnusable')))===null,'and it is cleared');
 ok('speech input is never locked out');

 const unexpected=h.errors.filter(e=>!/API responded with status 500|network error|aborted/i.test(e));
 assert(unexpected.length===0,'no unexpected page errors: '+JSON.stringify(unexpected));
 console.log('ALL PASS');
}catch(e){console.error(e.message);console.error(await page.locator('#messages').innerText().catch(()=>''));console.error(await page.locator('#voiceSheet').innerText().catch(()=>''));console.error(h.errors);process.exitCode=1;}
finally{await h.close();}
