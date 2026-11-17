process.env.PLC_E2E_BRANCH='dev'; // the stall hook lives inside the dev diagnostics markers
import {launch,assert} from './harness.mjs';
// The call screen says what is going on: the orb has a state and a phase (thinking, writing the reply, making the sound, speaking), the chat model and the voice
// are shown with their memory state, the call's messages fade as they get older, and a spoken reply that never gets any sound is explained.
const speechMocks=()=>{
 const spoken=[];window.__spoken=spoken;window.__recs=[];window.__speakMs=5;window.__mic='granted';
 const voices=[{voiceURI:'local-1',name:'Device Voice',lang:'en-US',localService:true}];
 Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{getVoices:()=>voices,cancel(){window.__cancels=(window.__cancels||0)+1;window.__timers?.forEach(t=>clearTimeout(t));},addEventListener(){},removeEventListener(){},speak(u){spoken.push(u.text);(window.__timers||=[]).push(setTimeout(()=>u.onstart&&u.onstart(),window.__startMs||30));(window.__timers||=[]).push(setTimeout(()=>u.onend&&u.onend(),window.__speakMs));}}});
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
const h=await launch({init:speechMocks,port:19420});
const {page}=h;
const ok=name=>console.log('PASS',name);
const waitState=(s,timeout=15000)=>page.waitForFunction(v=>document.querySelector('#voiceSheet')?.dataset.state===v,s,{timeout});
try{
 await page.waitForFunction(()=>!document.querySelector('#messageInput').disabled);
 // record every (state:phase) the call screen shows, in order
 await page.evaluate(()=>{window.__seq=[];new MutationObserver(()=>{const r=document.querySelector('#voiceSheet');if(!r)return;const k=r.dataset.state+':'+(r.dataset.phase||'');if(window.__seq.at(-1)!==k)window.__seq.push(k);}).observe(document.body,{attributes:true,subtree:true,attributeFilter:['data-state','data-phase']});});
 await page.click('#voiceModeBtn');await waitState('listening');
 // the models are shown from the start
 const chips=await page.evaluate(()=>({chat:document.querySelector('#callChipChat')?.textContent||'',voice:document.querySelector('#callChipVoice')?.textContent||''}));
 assert(/Replies:|Chat model/.test(chips.chat),'the chat model chip is there: '+chips.chat);
 assert(/Voice/.test(chips.voice),'the voice chip is there: '+chips.voice);
 ok('the models are on the call screen');
 // a turn, with a slow voice so every phase can be seen
 await page.evaluate(()=>{window.__speakMs=300;window.__startMs=250;window.__recs.filter(r=>r.started).at(-1).emit('speak about cats');});
 await waitState('thinking');await waitState('speaking');await page.waitForFunction(()=>document.querySelector('#voiceSheet').dataset.phase==='playing',null,{timeout:8000});
 await page.waitForFunction(()=>document.querySelectorAll('.call-log-item').length>=2,null,{timeout:8000});
 const seq=await page.evaluate(()=>window.__seq);
 const order=['thinking:','speaking:preparing','speaking:playing'].map(k=>seq.findIndex(x=>x.startsWith(k)));
 assert(order.every(i=>i>=0)&&order[0]<order[1]&&order[1]<order[2],'the call went from thinking, to making the voice, to speaking: '+JSON.stringify(seq));
 assert(seq.indexOf('speaking:preparing')<seq.indexOf('speaking:playing'),'the voice is "preparing" before it is "speaking"');
 ok('thinking, writing, preparing the voice and speaking are different phases');
 // the status words match the phases
 const words=await page.evaluate(()=>{const r=document.querySelector('#voiceSheet');return {phase:r.dataset.phase,status:document.querySelector('#callStatus').textContent};});
 assert(words.phase==='playing'&&words.status==='Speaking','speaking says Speaking: '+JSON.stringify(words));
 // the messages of the call, fading as they age
 await page.waitForFunction(()=>document.querySelector('#voiceSheet').dataset.state==='listening',null,{timeout:15000});
 await page.evaluate(()=>window.__recs.filter(r=>r.started).at(-1).emit('and about dogs'));
 await page.waitForFunction(()=>document.querySelectorAll('.call-log-item').length>=3,null,{timeout:15000});
 const ops=await page.evaluate(()=>[...document.querySelectorAll('.call-log-item')].map(li=>Number(li.style.opacity)));
 assert(ops.length>=3&&ops.every((o,i)=>i===0||o>=ops[i-1])&&ops[ops.length-1]===1&&ops[0]<ops[ops.length-1],'older messages are more transparent, the newest is solid: '+JSON.stringify(ops));
 assert(await page.evaluate(()=>/speak about cats/.test(document.querySelector('.call-log').textContent)),'what was said is in the list');
 ok('the call keeps a fading list of messages');
 // a reply whose sound never starts: it is given up on, said so on screen, and the reply stays as text
 await page.waitForFunction(()=>document.querySelector('#voiceSheet').dataset.state==='listening',null,{timeout:15000});
 await page.evaluate(()=>{window.__plcCallStallMs=700;window.__startMs=600000;window.__speakMs=600000;window.__recs.filter(r=>r.started).at(-1).emit('one more question');});
 await page.waitForFunction(()=>document.querySelector('#voiceSheet').dataset.phase==='preparing',null,{timeout:15000});
 assert(/Preparing the voice/.test(await page.textContent('#callStatus')),'while the sound is being made it says so, not "Speaking"');
 await page.waitForFunction(()=>!document.querySelector('.call-notice').hidden,null,{timeout:15000});
 const notice=await page.textContent('.call-notice');
 assert(/stalled/i.test(notice)&&/text instead/i.test(notice),'the stall is explained: '+notice);
 assert(await page.evaluate(()=>document.querySelector('#voiceSheet').dataset.state==='listening'),'and the call goes back to listening');
 assert(await page.evaluate(()=>/one more question/.test(document.querySelector('.call-log').textContent)&&document.querySelectorAll('.call-log-item.them').length>=2),'the reply is still on screen as text');
 ok('a spoken reply that stalls is explained and kept as text');
 await page.click('#voiceEnd');
 assert(h.errors.length===0,'no page errors: '+h.errors.join('|'));
 console.log('voice-call-ui e2e passed');
}catch(e){console.error(e);console.error(h.errors);process.exitCode=1;}finally{await h.close();}
