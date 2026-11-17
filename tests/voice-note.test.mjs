import test from 'node:test';
import assert from 'node:assert/strict';
import {splitSegments,estimateSeconds,wordCount,formatClock,waveformBars,createVoicePlayer,SPEEDS} from '../chat/voice/voice-note.mjs';
test('text is split into sentences to speak, with tiny ones joined and no empties',()=>{
 assert.deepEqual(splitSegments('First sentence is long enough to stand alone. Second one is also quite long here! Third?'),['First sentence is long enough to stand alone.','Second one is also quite long here! Third?']);
 assert.deepEqual(splitSegments('Hi. Yes. This one is a reasonably long sentence that stays whole.'),['Hi. Yes. This one is a reasonably long sentence that stays whole.']);
 assert.deepEqual(splitSegments('One line here that is long enough.\nAnother line that is also long enough.'),['One line here that is long enough.','Another line that is also long enough.']);
 assert.deepEqual(splitSegments('   '),[]);assert.deepEqual(splitSegments(null),[]);
 assert.equal(splitSegments('A short tail. ok.').length,1);
});
test('length is estimated from the words and the speed, and shown as m:ss',()=>{
 assert.equal(wordCount("It's a well-known fact, isn't it?"),6);
 const text=Array(260).fill('word').join(' ');
 assert.equal(estimateSeconds(text,1),100);assert.equal(estimateSeconds(text,2),50);assert.equal(estimateSeconds('hi',1),1);
 assert.equal(formatClock(0),'0:00');assert.equal(formatClock(65),'1:05');assert.equal(formatClock(754),'12:34');assert.deepEqual(SPEEDS,[1,1.25,1.5,2]);
});
test('a note always has the same waveform, with plausible heights',()=>{
 const a=waveformBars('hello',36),b=waveformBars('hello',36),c=waveformBars('other text',36);
 assert.deepEqual(a,b);assert.notDeepEqual(a,c);assert.equal(a.length,36);assert.ok(a.every(h=>h>=0.25&&h<=1));assert.ok(new Set(a).size>8,'varied');
});
function rig(segments,{rate=1,failAt=-1}={}){
 const log=[],states=[];let stopped=0;const pending=[];
 const speakOne=(text,r)=>{const i=log.length;log.push([text,r]);let stop;const done=new Promise((res,rej)=>{stop=()=>res();pending.push({finish:()=>res(),fail:()=>rej(new Error('no voice')),i});});return {done,stop:()=>{stopped++;stop();}};};
 const player=createVoicePlayer({segments,speakOne,rate,onChange:s=>states.push(s)});
 const next=async()=>{await new Promise(r=>setTimeout(r,0));const p=pending.shift();return p;};
 return {player,log,states,get stopped(){return stopped;},pending,next};
}
const SEG=['Alpha one two three.','Beta four five six seven.','Gamma eight nine.'];
test('a note plays its sentences in order and ends',async()=>{
 const r=rig(SEG);r.player.play();assert.equal(r.player.state,'playing');
 for(let i=0;i<3;i++){await new Promise(x=>setTimeout(x,0));assert.equal(r.log.length,i+1);assert.equal(r.log[i][0],SEG[i]);r.pending.shift().finish();}
 await new Promise(x=>setTimeout(x,0));assert.equal(r.player.state,'ended');assert.equal(r.player.fraction,1);
 r.player.play();await new Promise(x=>setTimeout(x,0));assert.equal(r.log.at(-1)[0],SEG[0],'playing an ended note starts over');
});
test('pause stops the sentence and resume says it again from its start; progress follows the words',async()=>{
 const r=rig(SEG);r.player.play();await new Promise(x=>setTimeout(x,0));r.pending.shift().finish();await new Promise(x=>setTimeout(x,0));
 assert.equal(r.player.index,1);assert.ok(r.player.fraction>0&&r.player.fraction<1);
 r.player.pause();assert.equal(r.player.state,'paused');assert.ok(r.stopped>=1);
 r.player.play();await new Promise(x=>setTimeout(x,0));assert.equal(r.log.at(-1)[0],SEG[1]);
 r.player.toggle();assert.equal(r.player.state,'paused');
});
test('seeking jumps to a sentence, also while playing; seeking by fraction picks the sentence by words',async()=>{
 const r=rig(SEG);r.player.play();await new Promise(x=>setTimeout(x,0));
 r.player.seek(2);await new Promise(x=>setTimeout(x,0));assert.equal(r.log.at(-1)[0],SEG[2]);assert.equal(r.player.index,2);
 r.player.seek(99);assert.equal(r.player.index,2);r.player.seek(-4);assert.equal(r.player.index,0);
 r.player.pause();r.player.seekFraction(0.95);assert.equal(r.player.index,2);r.player.seekFraction(0);assert.equal(r.player.index,0);
});
test('changing the speed applies from the sentence being said, and the estimate follows',async()=>{
 const r=rig(SEG);r.player.play();await new Promise(x=>setTimeout(x,0));
 const t1=r.player.totalSeconds();r.player.setRate(2);await new Promise(x=>setTimeout(x,0));
 assert.equal(r.log.at(-1)[1],2);assert.equal(r.log.at(-1)[0],SEG[0],'the current sentence again, faster');assert.ok(r.player.totalSeconds()<=t1);
});
test('a voice that fails pauses the note instead of skipping through it; stop resets',async()=>{
 const r=rig(SEG);r.player.play();await new Promise(x=>setTimeout(x,0));r.pending.shift().fail();await new Promise(x=>setTimeout(x,0));
 assert.equal(r.player.state,'paused');assert.equal(r.player.index,0);
 r.player.stop();assert.equal(r.player.state,'idle');
 const empty=rig([]);empty.player.play();assert.equal(empty.player.state,'idle');
});
