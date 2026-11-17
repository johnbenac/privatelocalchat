import test from 'node:test';
import assert from 'node:assert/strict';
import {readChatStream,createSseParser} from '../chat/stream.mjs';
const body=chunks=>new ReadableStream({start(c){for(const x of chunks)c.enqueue(new TextEncoder().encode(x));c.close();}});
const resp=(chunks,type='text/event-stream')=>({headers:new Headers({'content-type':type}),body:body(chunks),text:async()=>chunks.join('')});
const ev=o=>'data: '+JSON.stringify(o)+'\n\n';
test('deltas arrive in order even when events are split across network chunks',async()=>{
 const a=ev({choices:[{delta:{content:'Hel'}}]}),b=ev({choices:[{delta:{content:'lo'}}]}),c=ev({choices:[{delta:{},finish_reason:'length'}]});
 const seen=[];const r=await readChatStream(resp([a.slice(0,10),a.slice(10)+b.slice(0,7),b.slice(7)+c,'data: [DONE]\n\n']),{onDelta:(d,t)=>seen.push([d,t])});
 assert.deepEqual(seen,[['Hel','Hel'],['lo','Hello']]);assert.equal(r.text,'Hello');assert.equal(r.finishReason,'length');assert.equal(r.streamed,true);
});
test('a provider that ignores stream:true is read as one answer',async()=>{
 const r=await readChatStream({headers:new Headers({'content-type':'application/json'}),text:async()=>JSON.stringify({choices:[{message:{content:'whole'},finish_reason:'stop'}]})});
 assert.equal(r.text,'whole');assert.equal(r.streamed,false);
});
test('stopping mid-stream carries the text so far',async()=>{
 const c=new AbortController();let n=0;
 await assert.rejects(readChatStream(resp([ev({choices:[{delta:{content:'abc'}}]}),ev({choices:[{delta:{content:'def'}}]})]),{signal:c.signal,onDelta:()=>{if(++n===1)c.abort();}}),e=>e.name==='AbortError'&&e.partialText==='abc');
});
test('an error event inside the stream is reported with what was written',async()=>{
 await assert.rejects(readChatStream(resp([ev({choices:[{delta:{content:'ok '}}]}),ev({error:{message:'overloaded'}})])),e=>/overloaded/.test(e.message)&&e.partialText==='ok ');
});
test('parser handles CRLF framing and multi-line data',()=>{
 const got=[];const p=createSseParser(d=>got.push(d));p.push('data: a\r\n\r\ndata: b\ndata: c\n\n');p.push('data: tail');p.end();
 assert.deepEqual(got,['a','b\nc','tail']);
});
