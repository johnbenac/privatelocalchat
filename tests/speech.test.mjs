import test from 'node:test';
import assert from 'node:assert/strict';
import {speechChunks,speechSupport,voices,bestVoice,speak,startDictation,probeMicrophone} from '../chat/voice/speech.mjs';
const clean=()=>{for(const k of ['speechSynthesis','SpeechSynthesisUtterance','SpeechRecognition','webkitSpeechRecognition'])delete globalThis[k];};
test('text is read in sentence-sized pieces',()=>{
 const text='First sentence here. Second one follows! And a question? '+'word '.repeat(80)+'\nNew paragraph.';
 const c=speechChunks(text,120);
 assert.ok(c.length>=5);assert.ok(c.every(x=>x.length<=125),JSON.stringify(c.map(x=>x.length)));
 assert.equal(c[0],'First sentence here. Second one follows! And a question?');
 assert.equal(c.at(-1),'New paragraph.');
});
test('support is reported so unsupported buttons can stay hidden',()=>{
 clean();assert.deepEqual(speechSupport(),{synth:false,recognition:false});
 globalThis.webkitSpeechRecognition=class{};assert.equal(speechSupport().recognition,true);
 globalThis.speechSynthesis={};globalThis.SpeechSynthesisUtterance=class{};assert.equal(speechSupport().synth,true);
 clean();
});
test('voices on the device come first but any voice will do',()=>{
 globalThis.speechSynthesis={getVoices:()=>[{voiceURI:'remote-en',localService:false,lang:'en-US'},{voiceURI:'local-fr',localService:true,lang:'fr-FR'},{voiceURI:'local-en',localService:true,lang:'en-GB'}],cancel(){},addEventListener(){}};
 assert.deepEqual(voices().map(v=>v.voiceURI),['local-fr','local-en','remote-en']);
 assert.equal(bestVoice(undefined,'en-US').voiceURI,'local-en');assert.equal(bestVoice('local-fr','en-US').voiceURI,'local-fr');
 globalThis.speechSynthesis.getVoices=()=>[{voiceURI:'remote-en',localService:false,lang:'en-US'}];
 assert.equal(bestVoice(undefined,'en-US').voiceURI,'remote-en');
 globalThis.speechSynthesis.getVoices=()=>[];assert.equal(bestVoice(),null);
 clean();
});
test('read-aloud speaks with what the browser has, and says so when there is nothing',async()=>{
 const said=[];
 globalThis.SpeechSynthesisUtterance=class{constructor(t){this.text=t;}};
 globalThis.speechSynthesis={getVoices:()=>[{voiceURI:'remote-en',localService:false,lang:'en-US'}],cancel(){},addEventListener(){},speak(u){said.push([u.text,u.voice.voiceURI]);setTimeout(()=>u.onend(),1);}};
 await speak('Hello there. Second.').done;
 assert.deepEqual(said,[['Hello there. Second.','remote-en']]);
 globalThis.speechSynthesis.getVoices=()=>[];
 await assert.rejects(speak('hello').done,/no voice installed/);
 clean();
});
test('dictation reports results and gives readable errors',()=>{
 const got=[],errors=[];let rec;
 globalThis.webkitSpeechRecognition=class{constructor(){rec=this;}start(){this.started=true;}stop(){this.onend();}};
 const d=startDictation({lang:'en-US',onText:t=>got.push(t),onError:e=>errors.push(e.message)});
 assert.equal(rec.started,true);assert.equal(rec.lang,'en-US');assert.equal(rec.continuous,true);
 rec.onresult({resultIndex:0,results:[Object.assign([{transcript:'hello'}],{isFinal:false})]});
 rec.onresult({resultIndex:0,results:[Object.assign([{transcript:'hello world'}],{isFinal:true})]});
 assert.deepEqual(got,[{final:'',interim:'hello'},{final:'hello world',interim:''}]);
 rec.onerror({error:'no-speech'});rec.onerror({error:'not-allowed'});
 assert.equal(errors.length,1);assert.match(errors[0],/did not allow speech recognition/);
 d.stop();clean();
});

test('abort drops results that arrive after it, so they never reach the next message',()=>{
 const got=[];let rec,aborted=0;
 globalThis.webkitSpeechRecognition=class{constructor(){rec=this;}start(){}stop(){}abort(){aborted++;}};
 const d=startDictation({onText:t=>got.push(t),onEnd:()=>got.push('end'),onError:()=>got.push('err')});
 const late=rec.onresult;
 d.abort();
 late({resultIndex:0,results:[Object.assign([{transcript:'knock knock'}],{isFinal:true})]});
 assert.equal(aborted,1);assert.deepEqual(got,[]);
 clean();
});
test('errors carry their code so the app can tell a block from an unsupported browser',()=>{
 let rec,err;globalThis.webkitSpeechRecognition=class{constructor(){rec=this;}start(){}stop(){}};
 startDictation({onError:e=>{err=e;}});rec.onerror({error:'service-not-allowed'});
 assert.equal(err.code,'service-not-allowed');assert.match(err.message,/Enable Dictation/);clean();
});
test('the microphone probe separates blocked, missing and available',async()=>{
 const nav=globalThis.navigator;const set=(v)=>Object.defineProperty(globalThis,'navigator',{value:v,configurable:true});
 try{
  set({mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})}});assert.equal((await probeMicrophone()).state,'granted');
  set({mediaDevices:{getUserMedia:async()=>{throw Object.assign(new Error('x'),{name:'NotAllowedError'});}}});assert.equal((await probeMicrophone()).state,'denied');
  set({mediaDevices:{getUserMedia:async()=>{throw Object.assign(new Error('x'),{name:'NotFoundError'});}}});assert.equal((await probeMicrophone()).state,'none');
  set({});assert.equal((await probeMicrophone()).state,'unsupported');
 }finally{set(nav);}
});
