import test from 'node:test';
import assert from 'node:assert/strict';
import {createHost} from '../runtime/providers/host-core.mjs';
import {MockAdapter} from '../runtime/providers/adapters/mock.mjs';
async function ready(){
 const host=createHost({adapters:{mock:()=>new MockAdapter()}}),waiting=new Map(),port={postMessage(m){waiting.get(m.id)?.(m);}};
 const call=(msg)=>new Promise(resolve=>{const events=[];waiting.set(msg.id,m=>{if(m.type==='event')events.push(m.event);if(m.type==='done'||m.type==='result'||m.type==='error')resolve({events,m});});host.attach(port);port.onmessage({data:msg});});
 const loaded=await call({id:1,op:'load',config:{adapter:'mock',modelId:'m',mock:{loadSteps:1}}});
 assert.equal(loaded.m.type,'result');
 return {call,port,waiting};
}
const words=Array.from({length:2000},(_,i)=>`w${i}`).join(' ');
test('a request without maxTokens runs to the end of the reply',async()=>{
 const {call}=await ready();
 const {events}=await call({id:2,op:'generate',request:{attemptId:'a',messages:[{role:'user',content:'go'}],mock:{text:words,tokenDelayMs:0}}});
 const end=events.at(-1);
 const tokens=events.filter(e=>e.type==='token');
 assert.equal(end.type,'attempt-completed');assert.equal(end.finishReason,'stop');assert.equal(tokens.length,2000);assert.equal(end.text,tokens.map(e=>e.text).join(''));
});
test('a maxTokens that is given is still honoured, and a bad one is refused',async()=>{
 const {call}=await ready();
 const capped=await call({id:2,op:'generate',request:{attemptId:'b',maxTokens:5,messages:[{role:'user',content:'go'}],mock:{text:words,tokenDelayMs:0}}});
 assert.equal(capped.events.at(-1).finishReason,'length');
 const bad=await call({id:3,op:'generate',request:{attemptId:'c',maxTokens:0,messages:[{role:'user',content:'go'}]}});
 assert.equal(bad.events.at(-1).type,'attempt-failed');
});
test('stopping mid-reply returns exactly the text generated so far',async()=>{
 const {call,port}=await ready();
 const done=call({id:2,op:'generate',request:{attemptId:'d',messages:[{role:'user',content:'go'}],mock:{text:words,tokenDelayMs:1}}});
 await new Promise(r=>setTimeout(r,60));
 port.onmessage({data:{id:9,op:'abort',target:'d',reason:{by:'human',reason:'stop pressed'}}});
 const {events}=await done,end=events.at(-1),streamed=events.filter(e=>e.type==='token').map(e=>e.text).join('');
 assert.equal(end.type,'attempt-aborted');assert.ok(streamed.length>0&&streamed.length<words.length);assert.equal(end.partialText,streamed);
});
