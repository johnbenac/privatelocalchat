import test from 'node:test';
import assert from 'node:assert/strict';
import {createVoiceRecorder} from '../chat/voice/voice-recorder.mjs';
function rig(opts={}){
 let t=0,timers=[],id=0;const states=[];let rec=null,opens=0,aborts=0;
 const setTimer=(fn,ms)=>{timers.push({id:++id,at:t+ms,fn});return id;},clearTimer=i=>{timers=timers.filter(x=>x.id!==i);};
 const advance=ms=>{const end=t+ms;for(;;){const n=timers.filter(x=>x.at<=end).sort((a,b)=>a.at-b.at)[0];if(!n)break;t=n.at;timers=timers.filter(x=>x!==n);n.fn();}t=end;};
 const r=createVoiceRecorder({listen:h=>{opens++;rec={...h,abort(){aborts++;}};return rec;},onChange:s=>states.push(s),now:()=>t,setTimer,clearTimer,...opts});
 return {r,advance,states,get rec(){return rec;},get opens(){return opens;},get aborts(){return aborts;}};
}
test('recording keeps the words, live and final, with a running time',()=>{
 const x=rig();x.r.start();assert.equal(x.r.state,'recording');
 x.rec.onText({final:'',interim:'hello there'});assert.equal(x.r.text,'hello there');
 x.rec.onText({final:'hello there',interim:''});x.advance(3000);x.rec.onText({final:'this is a long message',interim:'with more'});
 assert.equal(x.r.text,'hello there this is a long message with more');assert.equal(x.r.seconds,3);
 const out=x.r.stop();assert.equal(out.text,'hello there this is a long message with more');assert.equal(out.seconds,3);assert.equal(x.r.state,'stopped');assert.ok(x.aborts>=1);
 assert.ok(x.states.some(s=>s.state==='recording'&&s.seconds===3));
});
test('the browser ending a session after a pause does not end the recording: it listens again',()=>{
 const x=rig();x.r.start();x.advance(5000);x.rec.onText({final:'first part',interim:''});
 x.rec.onEnd();x.advance(250);assert.equal(x.opens,2,'a fresh session');
 x.rec.onText({final:'second part',interim:''});assert.equal(x.r.text,'first part second part');assert.equal(x.r.state,'recording');
});
test('a session that keeps ending at once stops the note and keeps what was heard',()=>{
 const x=rig();x.r.start();x.rec.onText({final:'kept words',interim:''});
 for(let i=0;i<8;i++){x.rec.onEnd();x.advance(250);}
 assert.equal(x.r.state,'stopped');assert.equal(x.r.text,'kept words');
 assert.match(x.states.at(-1).error.message,/kept/);
});
test('a refused microphone stops it with the reason; a network error keeps the words; cancel discards',()=>{
 let x=rig();x.r.start();x.rec.onError({code:'not-allowed',message:'blocked'});assert.equal(x.r.state,'stopped');assert.equal(x.states.at(-1).error.code,'not-allowed');
 x=rig();x.r.start();x.rec.onText({final:'saved',interim:''});x.rec.onError({code:'network'});assert.equal(x.r.state,'stopped');assert.equal(x.r.text,'saved');
 x=rig();x.r.start();x.rec.onError({code:'no-speech'});assert.equal(x.r.state,'recording','silence is not an error');
 x=rig();x.r.start();x.rec.onText({final:'discard me',interim:''});x.r.cancel();assert.equal(x.r.state,'idle');assert.equal(x.r.text,'');
});
test('a note has a longest length',()=>{
 const x=rig({maxSeconds:5});x.r.start();x.rec.onText({final:'words',interim:''});x.advance(6000);
 assert.equal(x.r.state,'stopped');assert.match(x.states.at(-1).error.message,/longest/);assert.equal(x.r.text,'words');
});
