import test from 'node:test';
import assert from 'node:assert/strict';
import {createVoiceSession,createSpeaker} from '../chat/voice/voice.mjs';

// The call must never end up waiting for something that is not coming. These drive the real turn-taking with a hand-driven clock and a fake voice, microphone
// and reply, and throw the failures seen on phones at it: a voice that never says it has finished, a reply that never starts or never ends, a recogniser
// that stops at once. Whatever happens, the call is listening again (or says it needs a tap) within a bounded time.
function rig(opts={}){
  let now=0,timers=[],id=0;const states=[],notes=[],spoken=[],sent=[];let rec=null,listens=0,voiceMode='ok';
  const setTimer=(fn,ms)=>{const t={id:++id,at:now+ms,fn};timers.push(t);return t.id;};
  const clearTimer=i=>{timers=timers.filter(t=>t.id!==i);};
  const advance=async ms=>{const end=now+ms;for(;;){const next=timers.filter(t=>t.at<=end).sort((a,b)=>a.at-b.at)[0];if(!next)break;now=next.at;timers=timers.filter(t=>t!==next);next.fn();await Promise.resolve();await Promise.resolve();}now=end;await Promise.resolve();};
  const session=createVoiceSession({
    listen:h=>{listens++;rec={...h,abort(){}};return rec;},
    speakOne:text=>{spoken.push(text);let stop=()=>{};const done=new Promise((resolve,reject)=>{stop=resolve;if(voiceMode==='ok')setTimer(resolve,400);else if(voiceMode==='throw')setTimer(()=>reject(new Error('no voice')),10);/* 'hang': never */});return {done,stop:()=>stop()};},
    send:async t=>{sent.push(t);},abortReply:()=>{},onState:(s,i)=>states.push(s+(i.reason?':'+i.reason:'')),onNote:(k)=>notes.push(k),
    setTimer,clearTimer,now:()=>now,silenceMs:1000,restartMs:200,thinkingMs:30000,sentenceMs:()=>10000,retryStalled:0,...opts});
  return {session,advance,states,notes,spoken,sent,get rec(){return rec;},get listens(){return listens;},setVoice:m=>{voiceMode=m;},get now(){return now;}};
}
const say=async(r,text)=>{r.rec.onText({final:text,interim:''});await r.advance(1100);};

test('a sentence the voice never finishes is skipped after its limit, and the rest is still said',async()=>{
  const r=rig();r.setVoice('hang');r.session.start();await say(r,'tell me something');
  r.session.replyStarted();r.session.replyText('First sentence here is long enough. Second sentence is also long enough.');
  r.session.replyEnded({text:'First sentence here is long enough. Second sentence is also long enough.'});
  await r.advance(9000);assert.equal(r.session.state,'speaking','still within the limit');
  await r.advance(25000);
  assert.deepEqual(r.spoken,['First sentence here is long enough.','Second sentence is also long enough.'],'the second one was reached');
  assert.equal(r.session.state,'listening','and then the call listens again');
  assert.ok(r.notes.includes('sentence-stalled'),'the person is told');
});

test('a reply that never starts does not end the call: it goes back to listening and says so',async()=>{
  const r=rig();r.session.start();await say(r,'are you there');
  assert.equal(r.session.state,'thinking');
  await r.advance(29000);assert.equal(r.session.state,'thinking');
  await r.advance(2000);assert.equal(r.session.state,'listening');assert.ok(r.notes.includes('reply-stalled'));
});

test('a reply that stops growing while it is being spoken, and never ends, is also given up on',async()=>{
  const r=rig();r.session.start();await say(r,'tell me a story');
  r.session.replyStarted();r.session.replyText('Once upon a time there was a small robot. It lived');
  await r.advance(1000);assert.equal(r.session.state,'speaking');
  await r.advance(40000);
  assert.equal(r.session.state,'listening');assert.ok(r.notes.includes('reply-stalled'));
});

test('while a model is still loading the call keeps waiting instead of giving up',async()=>{
  let loading=true;const r=rig({holdThinking:()=>loading});r.session.start();await say(r,'hello there friend');
  await r.advance(200000);assert.equal(r.session.state,'thinking');assert.deepEqual(r.notes,[]);
  loading=false;await r.advance(31000);assert.equal(r.session.state,'listening');
});

test('a recogniser that stops at once, again and again, says so and waits for a tap instead of retrying for ever',async()=>{
  const r=rig();r.session.start();
  for(let i=0;i<8&&r.session.state==='listening';i++){r.rec.onEnd();await r.advance(300);}
  assert.equal(r.session.state,'paused');assert.ok(r.states.includes('paused:tap'));assert.ok(r.notes.includes('listening-failed'));
  r.session.tap();assert.equal(r.session.state,'listening','a tap brings it back');
});

test('a recogniser that fails to start the same way every time is treated the same',async()=>{
  const r=rig();r.session.start();
  for(let i=0;i<8&&r.session.state==='listening';i++){r.rec.onError(Object.assign(new Error('boom'),{code:'something'}));await r.advance(1100);}
  assert.equal(r.session.state,'paused');assert.ok(r.notes.includes('listening-failed'));
});

test('ordinary silence endings (the browser ends the recogniser after a while) are not counted as failures',async()=>{
  const r=rig();r.session.start();
  for(let i=0;i<20;i++){await r.advance(5000);r.rec.onEnd();await r.advance(300);}
  assert.equal(r.session.state,'listening');assert.deepEqual(r.notes,[]);
});

test('sixty turns with random trouble: the call is always listening again within a bounded time',async()=>{
  let seed=20261104;const rnd=()=>{seed=(seed*1664525+1013904223)%4294967296;return seed/4294967296;};
  const r=rig();r.session.start();
  const worst={ms:0};
  for(let turn=1;turn<=60;turn++){
    assert.equal(r.session.state,'listening','turn '+turn+' starts listening');
    const startedAt=r.now;
    await say(r,'turn number '+turn+' please answer');
    const sc=Math.floor(rnd()*5);
    r.setVoice(sc===1?'hang':'ok');
    if(sc!==2){ // 2: the reply never starts
      r.session.replyStarted();
      const text='Answer one is a sentence of fair length. Answer two is another sentence of fair length. Answer three closes it up.';
      const parts=[text.slice(0,40),text.slice(0,80),text];
      for(const p of parts){r.session.replyText(p);await r.advance(Math.floor(rnd()*600));}
      if(sc!==3)r.session.replyEnded({text}); // 3: the reply never ends
      else {} 
    }
    // whatever happened, wait (bounded) for the call to listen again
    let waited=0;while(r.session.state!=='listening'&&waited<200000){await r.advance(1000);waited+=1000;}
    assert.equal(r.session.state,'listening','turn '+turn+' (scenario '+sc+') got back to listening, state '+r.session.state);
    worst.ms=Math.max(worst.ms,r.now-startedAt);
  }
  assert.ok(worst.ms<140000,'the slowest turn took '+worst.ms+' ms');
});

test('the speaker on its own: a hung sentence does not block the queue behind it',async()=>{
  let now=0,timers=[],id=0;const stalls=[];const played=[];
  const setTimer=(fn,ms)=>{const t={id:++id,at:now+ms,fn};timers.push(t);return t.id;},clearTimer=i=>{timers=timers.filter(t=>t.id!==i);};
  const tick=async ms=>{const end=now+ms;for(;;){const n=timers.filter(t=>t.at<=end).sort((a,b)=>a.at-b.at)[0];if(!n)break;now=n.at;timers=timers.filter(t=>t!==n);n.fn();await Promise.resolve();await Promise.resolve();}now=end;await Promise.resolve();};
  const sp=createSpeaker(t=>{played.push(t);return {done:t==='hang'?new Promise(()=>{}):Promise.resolve(),stop(){}};},{setTimer,clearTimer,sentenceMs:()=>5000,retryStalled:0,onStall:t=>stalls.push(t)});
  sp.enqueue('hang');sp.enqueue('after');
  await tick(4000);assert.deepEqual(played,['hang']);
  await tick(2000);assert.deepEqual(played,['hang','after']);assert.deepEqual(stalls,['hang']);assert.equal(sp.busy,false);
});

test('a sentence that stalls once (a stuck speech queue) is tried again after the queue is cleared, and heard',async()=>{
  let now=0,timers=[],id=0;const played=[],stops=[],notes=[];let calls=0;
  const setTimer=(fn,ms)=>{const t={id:++id,at:now+ms,fn};timers.push(t);return t.id;},clearTimer=i=>{timers=timers.filter(t=>t.id!==i);};
  const tick=async ms=>{const end=now+ms;for(;;){const n=timers.filter(t=>t.at<=end).sort((a,b)=>a.at-b.at)[0];if(!n)break;now=n.at;timers=timers.filter(t=>t!==n);n.fn();await Promise.resolve();await Promise.resolve();}now=end;await Promise.resolve();};
  const sp=createSpeaker(t=>{calls++;played.push(t);const first=calls===1;return {done:first?new Promise(()=>{}):Promise.resolve(),stop(){stops.push(t);}};},{setTimer,clearTimer,sentenceMs:()=>5000,onStall:(t,a)=>notes.push(a)});
  sp.enqueue('Hello there, this is the first sentence.');sp.enqueue('And the second one.');
  await tick(6000);await tick(50);await sp.idle();
  assert.deepEqual(played,['Hello there, this is the first sentence.','Hello there, this is the first sentence.','And the second one.'],'the first was tried again, then the next');
  assert.equal(stops.length,1,'the stuck one was stopped (that clears the queue) before the retry');assert.deepEqual(notes,[0]);assert.equal(sp.busy,false);
});
