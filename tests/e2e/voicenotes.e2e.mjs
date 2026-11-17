import {launch,assert} from './harness.mjs';
const mocks=()=>{
 window.__spoken=[];window.__recs=[];window.__speakMs=30;
 const voices=[{voiceURI:'v1',name:'Voice',lang:'en-US',localService:true}];
 Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{getVoices:()=>voices,cancel(){window.__timers?.forEach(t=>clearTimeout(t));window.__timers=[];},addEventListener(){},removeEventListener(){},speak(u){window.__spoken.push({text:u.text,rate:u.rate});(window.__timers||=[]).push(setTimeout(()=>u.onend&&u.onend(),window.__speakMs));}}});
 window.SpeechSynthesisUtterance=function(t){this.text=t;};
 class Rec{constructor(){window.__recs.push(this);}start(){this.started=true;}stop(){this.started=false;this.onend&&this.onend();}abort(){this.started=false;this.aborted=true;}emit(t,f=true){this.onresult&&this.onresult({resultIndex:0,results:[Object.assign([{transcript:t}],{isFinal:f})]});}}
 window.SpeechRecognition=Rec;
};
const h=await launch({init:mocks,port:18271});const {page}=h;
const ok=n=>console.log('PASS',n);
const plusItem=async label=>{await page.click('#shellPlus');await page.click(`.shell-pop .shell-pop-row:has-text("${label}")`);};
const settle=()=>page.waitForFunction(()=>/Response complete\./.test(document.querySelector('#generationStatus').textContent));
try{
 await page.waitForFunction(()=>!document.querySelector('#messageInput').disabled);
 await page.fill('#messageInput','first question');await page.click('#sendBtn');await settle();

 // any reply becomes a voice note
 await page.evaluate(()=>{window.__spoken.length=0;});
 await page.click('.message.assistant [data-action="voice-note"]');
 await page.waitForSelector('.message.assistant .voice-note');
 assert(await page.locator('.message.assistant .message-body').isHidden(),'the words are tucked under the note');
 assert((await page.locator('.vn-from').innerText())==='Voice note from Roberta','named, and not a person');
 assert(/^\d+:\d\d$/.test(await page.textContent('.vn-clock'))||/\d+:\d\d \/ \d+:\d\d/.test(await page.textContent('.vn-clock')),'an estimated length');
 await page.waitForFunction(()=>window.__spoken.length>0,null,{timeout:5000});
 assert(/Reply to: first question/.test(await page.evaluate(()=>window.__spoken.map(s=>s.text).join(' '))),'converting a reply plays it');
 await page.waitForFunction(()=>document.querySelector('.voice-note').dataset.state==='ended',null,{timeout:5000});
 await page.click('.vn-text-toggle');assert(await page.locator('.message.assistant .message-body').isVisible()&&(await page.textContent('.vn-text-toggle'))==='Hide text','Show text reveals the words');
 await page.click('.vn-text-toggle');
 // play, change speed, pause
 await page.evaluate(()=>{window.__speakMs=400;window.__spoken.length=0;});
 await page.click('.vn-play');await page.waitForFunction(()=>document.querySelector('.voice-note').dataset.state==='playing');
 await page.click('.vn-speed');assert((await page.textContent('.vn-speed')).startsWith('1.25'),'speed steps up');
 await page.waitForFunction(()=>window.__spoken.some(s=>s.rate>1),null,{timeout:3000});
 await page.click('.vn-play');assert(await page.getAttribute('.voice-note','data-state')==='paused','pause');
 assert((await page.getAttribute('.vn-play','aria-label')).startsWith('Play voice note from Roberta'),'accessible name');
 ok('reply as voice note');

 // it stays a voice note after a reload, and can be shown as text again
 await page.reload();await page.waitForFunction(()=>!document.querySelector('#messageInput').disabled);
 await page.waitForSelector('.message.assistant .voice-note');
 await page.click('.message.assistant [data-action="voice-note"]');
 await page.waitForFunction(()=>!document.querySelector('.message.assistant .voice-note')&&document.querySelector('.message.assistant .message-body').offsetParent!==null);
 ok('persists and reverts');

 // recording a long voice note: live words, a review step, then it is sent as a message with its length
 await plusItem('Record a voice note');await page.waitForSelector('#voiceRecorder:not([hidden])');
 assert((await page.locator('#vnrText').innerText()).includes('start talking'),'prompting');
 await page.evaluate(()=>window.__recs.at(-1).emit('this is the first part of a long message',false));
 assert((await page.locator('#vnrText').innerText()).includes('first part of a long'),'live words');
 await page.evaluate(()=>window.__recs.at(-1).emit('this is the first part of a long message'));
 await page.waitForTimeout(1200);
 await page.click('#vnrStop');
 assert(await page.locator('#vnrEdit').isVisible()&&(await page.inputValue('#vnrEdit')).includes('first part of a long message'),'what was heard can be reviewed');
 await page.fill('#vnrEdit','this is the corrected long message');
 await page.click('#vnrSend');await settle();
 const last=page.locator('.message.user').last();
 assert((await last.innerText()).includes('this is the corrected long message'),'the transcript is the message');
 assert(/Voice note · \d+:\d\d/.test(await last.locator('.voice-badge').innerText())&&/audio was not saved/.test(await last.locator('.voice-badge').innerText()),'marked as a voice note, honest about audio');
 assert((await page.evaluate(()=>JSON.parse(localStorage.getItem('chatThreads')).flatMap(t=>t.messages).filter(m=>m.voice).length))===1,'saved with its length');
 ok('record, review, send');

 // cancel discards; nothing heard says so
 await plusItem('Record a voice note');await page.evaluate(()=>window.__recs.at(-1).emit('throw this away'));await page.click('#vnrCancel');
 assert(await page.locator('#voiceRecorder').isHidden()&&(await page.inputValue('#messageInput'))==='','cancel discards');
 await plusItem('Record a voice note');await page.click('#vnrStop');
 assert(/Nothing was heard/.test(await page.locator('#vnrError').innerText())&&await page.locator('#vnrSend').isHidden(),'an empty note cannot be sent');
 await page.keyboard.press('Escape');await page.waitForFunction(()=>document.querySelector('#voiceRecorder').hidden);
 ok('cancel and empty');

 const unexpected=h.errors.filter(e=>!/API responded with status|network error/.test(e));
 assert(unexpected.length===0,'no unexpected page errors: '+JSON.stringify(unexpected));
 console.log('ALL PASS');
}catch(e){console.error(e.message);console.error(await page.locator('#messages').innerText().catch(()=>''));console.error(h.errors);process.exitCode=1;}
finally{await h.close();}
