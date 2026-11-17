process.env.PLC_E2E_BRANCH='dev'; // the shortened sentence limit is a development hook
import {launch,assert} from './harness.mjs';
// A call that gets stuck on "Speaking" with nothing coming out (a sentence the browser never reports as finished) must move on by itself, and the orb says what is going on
// and does something sensible when it is tapped. The speech engine here is a mock whose sentences can be made to never end.
const mocks=()=>{
 const spoken=[];window.__spoken=spoken;window.__recs=[];window.__speakMs=20;window.__hang=0;window.__plcCallSentenceMs=2500;window.__mic='granted';
 const voices=[{voiceURI:'local-1',name:'Device Voice',lang:'en-US',localService:true}];
 Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{getVoices:()=>voices,paused:false,speaking:false,pending:false,resume(){},cancel(){window.__cancels=(window.__cancels||0)+1;window.__timers?.forEach(t=>clearTimeout(t));},addEventListener(){},removeEventListener(){},
  speak(u){spoken.push(u.text);if(window.__hang>0){window.__hang--;return;} /* a sentence that never starts and never ends */ (window.__timers||=[]).push(setTimeout(()=>u.onstart&&u.onstart(),20));(window.__timers||=[]).push(setTimeout(()=>u.onend&&u.onend(),window.__speakMs));}}});
 window.SpeechSynthesisUtterance=function(t){this.text=t;};
 class Rec{constructor(){this.continuous=false;this.interimResults=false;window.__recs.push(this);}start(){this.started=true;}stop(){this.started=false;this.onend&&this.onend();}abort(){this.started=false;this.aborted=true;}
  emit(text,final=true){this.onresult&&this.onresult({resultIndex:0,results:[Object.assign([{transcript:text}],{isFinal:final})]});}}
 window.SpeechRecognition=Rec;
 window.AudioContext=class{constructor(){this.currentTime=0;this.state='running';this.destination={};}createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){}},connect(){}};}createOscillator(){return {frequency:{setValueAtTime(){}},connect(){},start(){},stop(){},type:''};}resume(){return Promise.resolve();}close(){return Promise.resolve();}};
 Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})}});
};
const h=await launch({init:mocks,port:19440});
const {page}=h;
const ok=n=>console.log('PASS',n);
const sheet=()=>page.evaluate(()=>{const r=document.querySelector('#voiceSheet');return {state:r?.dataset.state,glyph:r?.dataset.glyph,phase:r?.dataset.phase};});
const waitState=(s,timeout=20000)=>page.waitForFunction(v=>document.querySelector('#voiceSheet')?.dataset.state===v,s,{timeout});
const say=text=>page.evaluate(t=>window.__recs.filter(r=>r.started).at(-1).emit(t),text);
// say something, wait for the call to leave listening (it is thinking or speaking), then for it to come back
const turn=async(text,ms)=>{await say(text);await page.waitForFunction(()=>document.querySelector('#voiceSheet').dataset.state!=='listening',null,{timeout:15000});await waitState('listening',ms);};
try{
 await page.waitForFunction(()=>window.__plcBooted===true&&!document.querySelector('#messageInput').disabled);
 await page.click('#voiceModeBtn');await waitState('listening');

 // the orb shows a different picture for listening, and a tap does what it says
 assert((await sheet()).glyph==='listen','listening shows the listening picture: '+JSON.stringify(await sheet()));
 assert(/Mute/.test(await page.getAttribute('#callOrb','aria-label')),'nothing heard yet: the orb offers to mute');
 await page.click('#callOrb');await page.waitForFunction(()=>document.querySelector('#voiceSheet').dataset.glyph==='muted');
 assert(/Unmute/.test(await page.getAttribute('#callOrb','aria-label')),'muted: the orb offers to unmute');
 await page.click('#callOrb');await waitState('listening');assert((await sheet()).glyph==='listen');
 ok('the orb shows the state and a tap mutes and unmutes');

 // one sentence that never ends: tried again after it is stopped, then heard
 await page.evaluate(()=>{window.__hang=1;});
 await turn('tell me about cats please',30000);
 const spoken1=(await page.evaluate(()=>window.__spoken.slice())).filter(t=>t.trim()); // (the silent unlock utterance is not a sentence)
 assert(spoken1.length>=2&&spoken1[0]===spoken1[1],'the stuck sentence was tried again: '+JSON.stringify(spoken1));
 assert(!(await page.locator('.call-notice:not([hidden])').count()),'a retry that works says nothing');
 ok('a sentence that never ends is stopped and tried again');

 // a sentence that never ends, twice: skipped, the person is told, and the call listens again
 await page.evaluate(()=>{window.__hang=2;window.__spoken.length=0;});
 await turn('and what about dogs please',40000);
 assert(await page.locator('.call-notice:not([hidden])').count()===1,'the person is told a sentence was skipped');
 assert(/did not finish a sentence/.test(await page.locator('.call-notice').innerText()),'in plain words');
 ok('a sentence that never ends twice is skipped, with a notice, and the call carries on');

 // tapping the orb while a reply is being spoken skips it
 await page.evaluate(()=>{window.__speakMs=600000;window.__hang=0;});
 await say('one more question for you');
 await page.waitForFunction(()=>document.querySelector('#voiceSheet').dataset.state==='speaking',null,{timeout:20000});
 assert(/Skip/.test(await page.getAttribute('#callOrb','aria-label')),'speaking: the orb offers to skip');
 await page.click('#callOrb');await waitState('listening');
 ok('a tap on the orb while it speaks skips the rest');
 assert(h.errors.length===0,'no page errors: '+h.errors.join(' | '));
 console.log('voice-hang e2e: ok');
}catch(e){console.error(e);process.exitCode=1;}
finally{await h.close();}
