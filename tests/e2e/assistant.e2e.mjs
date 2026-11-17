import {launch,assert} from './harness.mjs';
const speechMocks=()=>{
 const spoken=[];window.__spoken=spoken;window.__recs=[];
 const voices=[{voiceURI:'remote-1',name:'Cloud Voice',lang:'en-US',localService:false},{voiceURI:'local-1',name:'Device Voice',lang:'en-US',localService:true}];
 Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{getVoices:()=>window.__voiceMode==='none'?[]:window.__voiceMode==='remote'?[voices[0]]:voices,cancel(){},addEventListener(){},removeEventListener(){},speak(u){spoken.push({text:u.text,voice:u.voice?.voiceURI});setTimeout(()=>u.onend&&u.onend(),5);}}});
 window.SpeechSynthesisUtterance=function(t){this.text=t;};
 class Rec{constructor(){this.continuous=false;this.interimResults=false;this._pl=false;window.__recs.push(this);}
  start(){this.started=true;}stop(){this.started=false;this.onend&&this.onend();}abort(){this.started=false;this.aborted=true;}
  emit(text,final=true){this.onresult&&this.onresult({resultIndex:0,results:[Object.assign([{transcript:text}],{isFinal:final})]});}}
 window.SpeechRecognition=Rec;
};
const h=await launch({init:speechMocks,port:18271});
const {page}=h;
const ok=name=>console.log('PASS',name);
const more=async(loc,action)=>{await loc.locator('[data-action="more"]').click();await page.click(`.thread-menu [data-menu-action="${action}"]`);};

const requests=async()=>(await (await fetch(`http://127.0.0.1:${h.api.port}/__requests`)).json());
const settle=async()=>{await page.waitForFunction(()=>/^(Response complete\.|The response was interrupted|Answered on this device)/.test(document.querySelector('#generationStatus').textContent));await page.waitForFunction(()=>!document.querySelector('#stopGeneration').offsetParent);};
const send=async text=>{await page.fill('#messageInput',text);await page.click('#sendBtn');await settle();};
const openMemory=async()=>{await page.click('button[aria-label="This device menu"]');await page.click('.shell-pop .shell-pop-row:has-text("Memory & preferences")');await page.waitForSelector('.app-dialog');};
const plusItem=async label=>{await page.click('#shellPlus');await page.click(`.shell-pop .shell-pop-row:has-text("${label}")`);};
const newChat=async()=>{await page.click('#newChatBtn');};
const systemOfLast=async()=>{const r=(await requests()).at(-1).body.messages;return r[0].role==='system'?r[0].content:'';};
try{
 await page.waitForFunction(()=>!document.querySelector('#messageInput').disabled);

 // personal instructions + memory + presets
 await openMemory();
 await page.fill('#prefInstructions','Reply in British English and keep it short.');
 await page.fill('.app-dialog input[aria-label="New memory"]','I live in Lisbon');await page.click('.app-dialog button:has-text("Add")');
 assert(await page.locator('.app-dialog input[aria-label="Memory 1"]').inputValue()==='I live in Lisbon','memory listed');
 await page.click('.app-dialog button:has-text("Done")');
 await send('hello');
 let sys=await systemOfLast();
 assert(/standing preferences[\s\S]*Reply in British English/.test(sys),'standing preferences sent: '+sys);
 assert(/asked you to remember[\s\S]*- I live in Lisbon/.test(sys),'memory sent');
 await page.reload();await page.waitForSelector('#messageInput');await page.waitForFunction(()=>!document.querySelector('#messageInput').disabled);
 await newChat();await send('after reload');
 assert(/Reply in British English/.test(await systemOfLast()),'preferences survive a reload');
 ok('personal instructions and memory');

 await page.click('.header-temp');await send('private question');
 sys=await systemOfLast();
 assert(/standing preferences/.test(sys)&&!/Lisbon/.test(sys),'temporary chat: preferences yes, memory no');
 await page.locator('.message.user').last().locator('[data-action="more"]').click();assert(await page.locator('.thread-menu [data-menu-action="remember"]').count()===0,'no Remember in a temporary chat');await page.keyboard.press('Escape');
 await newChat();
 await send('/remember my cat is called Miso');
 assert(/Remembered: Miso|Remembered: my cat is called Miso/.test(await page.locator('.message.assistant').innerText()),'remember command answered locally');
 await send('who am I?');
 assert(/my cat is called Miso/.test(await systemOfLast()),'new memory used');
 await more(page.locator('.message.user').last(),'remember');
 await page.fill('.app-dialog textarea','I prefer metric units');await page.click('.app-dialog button:has-text("Remember")');
 await openMemory();
 assert(await page.locator('.app-dialog input[aria-label="Memory 3"]').inputValue()==='I prefer metric units','remember action stored an edited memory');
 await page.click('.app-dialog button:has-text("Forget")>>nth=0');
 assert(await page.locator('.app-dialog input[aria-label^="Memory"]').count()===2,'forgetting removes it');
 await page.click('.app-dialog button:has-text("Done")');
 ok('memory is explicit and editable');

 await newChat();
 await plusItem('Instructions for this chat');
 await page.selectOption('#presetSelect',{label:'Brief answers'});
 assert(/Answer as briefly as possible/.test(await page.inputValue('#systemPromptInput')),'preset fills the instructions');
 await send('define entropy');
 assert(/Answer as briefly as possible/.test(await systemOfLast()),'preset instructions sent');
 await page.fill('#systemPromptInput','Talk like a pirate.');await page.click('#savePresetBtn');
 await page.fill('.app-dialog input','Pirate');await page.click('.app-dialog button:has-text("Save preset")');
 assert((await page.locator('#presetSelect option').allInnerTexts()).includes('Pirate'),'custom preset saved');
 ok('presets');

 // exact tools
 await newChat();
 const before=(await requests()).length;
 await send('/calc 12*(3+4)');
 assert(/84/.test(await page.locator('.message.assistant').innerText())&&/Computed on this device/.test(await page.locator('.message.assistant').innerText()),'calc answered');
 await send('/convert 5 km to miles');await send('/date 2026-03-05');
 assert(/3\.10685596119 miles/.test(await page.locator('#messages').innerText())&&/Thursday, 5 March 2026/.test(await page.locator('#messages').innerText()),'convert and date answered');
 assert((await requests()).length===before,'no model request for slash commands');
 await send('/calc 1/0');assert(/Division by zero/.test(await page.locator('.message.assistant').last().innerText()),'errors explained');
 await send('Quick check: what is 1234 * 5678?');
 assert(/1234 \* 5678 = 7006652/.test(await page.locator('.message.user').last().innerText()),'exact result shown on the prompt');
 assert(/\[Exact result computed by the app: 1234 \* 5678 = 7006652/.test((await requests()).at(-1).body.messages.at(-1).content),'exact result sent to the model');
 await send('Nothing to compute here, in 2026-03-05 or 10-20.');
 assert(!/Exact result/.test((await requests()).at(-1).body.messages.at(-1).content),'ordinary text is left alone');
 ok('exact tools');

 // read aloud: local voices only, markdown stripped
 await newChat();await send('markdown please');
 await page.locator('.message.assistant [data-action="speak"]').click();
 await page.waitForFunction(()=>window.__spoken.length>0);
 const spoken=await page.evaluate(()=>window.__spoken);
 assert(spoken.every(s=>s.voice==='local-1'),'only the on-device voice: '+JSON.stringify(spoken));
 assert(!/[#*`]/.test(spoken.map(s=>s.text).join(' '))&&/Heading/.test(spoken[0].text),'markdown not read out');
 await page.waitForFunction(()=>document.querySelector('.message.assistant [data-action="speak"]').getAttribute('aria-pressed')==='false');
 // only an online voice installed: it is used, because the browser offers it
 await page.evaluate(()=>{window.__voiceMode='remote';window.__spoken.length=0;});
 await page.locator('.message.assistant [data-action="speak"]').click();
 await page.waitForFunction(()=>window.__spoken.length>0);
 assert((await page.evaluate(()=>window.__spoken.every(s=>s.voice==='remote-1'))),'uses the voice the browser has');
 await page.waitForFunction(()=>document.querySelector('.message.assistant [data-action="speak"]').getAttribute('aria-pressed')==='false');
 // no voice at all: say so
 await page.evaluate(()=>{window.__voiceMode='none';window.__spoken.length=0;});
 await page.locator('.message.assistant [data-action="speak"]').click();
 await page.waitForFunction(()=>/no voice installed/.test(document.querySelector('#toast').textContent));
 await page.evaluate(()=>{window.__voiceMode='both';});
 ok('read aloud prefers on-device voices and still works without one');

 // dictation
 await newChat();
 await page.click('#micBtn');
 await page.waitForFunction(()=>window.__recs.length===1&&window.__recs[0].started);
 assert(await page.evaluate(()=>window.__recs[0].continuous===true&&window.__recs[0].interimResults===true),'continuous dictation with live text');
 await page.evaluate(()=>window.__recs[0].emit('hello wor',false));assert((await page.inputValue('#messageInput'))==='hello wor','interim text shown');
 await page.evaluate(()=>window.__recs[0].emit('hello world'));assert((await page.inputValue('#messageInput')).trim()==='hello world','final text committed');
 await page.click('#micBtn');assert(await page.getAttribute('#micBtn','aria-pressed')==='false','stopped');
 ok('dictation');

 // sending clears the composer and silences the microphone: words from the old recogniser never reach the next message
 await page.fill('#messageInput','');
 await page.click('#micBtn');
 await page.waitForFunction(()=>window.__recs.length===2&&window.__recs[1].started);
 await page.evaluate(()=>window.__recs[1].emit('knock knock'));
 assert((await page.inputValue('#messageInput')).trim()==='knock knock','dictated text is in the composer');
 await page.click('#sendBtn');await settle();
 assert((await page.inputValue('#messageInput'))==='','the composer is empty after sending');
 assert(await page.evaluate(()=>window.__recs[1].aborted===true),'the recogniser was aborted on send');
 assert(await page.getAttribute('#micBtn','aria-pressed')==='false','the microphone shows as off');
 await page.evaluate(()=>window.__recs[1].emit('knock knock again'));
 assert((await page.inputValue('#messageInput'))==='','late words from the old recogniser are dropped');
 await page.click('#micBtn');
 await page.waitForFunction(()=>window.__recs.length===3&&window.__recs[2].started);
 await page.evaluate(()=>window.__recs[2].emit('who is there'));
 assert((await page.inputValue('#messageInput')).trim()==='who is there','the next message holds only the new words');
 // typing while dictating is kept, and the next words go after it
 await page.fill('#messageInput','Note: who is there');
 await page.evaluate(()=>window.__recs[2].emit('please'));
 assert((await page.inputValue('#messageInput')).trim()==='Note: who is there please','typed edits are kept');
 await page.click('#micBtn');await page.fill('#messageInput','');
 ok('dictation clears on send and ignores late words');

 const unexpected=h.errors.filter(e=>!/API responded with status 500|network error/.test(e));
 assert(unexpected.length===0,'no unexpected page errors: '+JSON.stringify(unexpected));
 console.log('ALL PASS');
}catch(e){console.error(e.message);console.error(await page.locator('#messages').innerText().catch(()=>''));console.error(h.errors);process.exitCode=1;}
finally{await h.close();}

// a browser with no speech recognition or voices simply does not show the controls
const h2=await launch({build:false,port:18272,init:()=>{delete window.SpeechRecognition;delete window.webkitSpeechRecognition;Object.defineProperty(window,'speechSynthesis',{configurable:true,value:undefined});}});
try{
 await h2.page.waitForFunction(()=>!document.querySelector('#messageInput').disabled);
 const count=async sel=>h2.page.locator(sel).count();
 if(await count('#micBtn')!==0||await count('#voiceModeBtn')!==0)throw new Error('mic and voice buttons should not exist without speech recognition');
 await h2.page.fill('#messageInput','hi');await h2.page.click('#sendBtn');
 await h2.page.waitForFunction(()=>/Response complete/.test(document.querySelector('#generationStatus').textContent));
 if(await count('[data-action="speak"]')!==0)throw new Error('Listen should not exist without speech synthesis');
 console.log('PASS unsupported speech controls are not shown');
}catch(e){console.error(e.message);process.exitCode=1;}finally{await h2.close();}
