import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {instrumentWebGpuErrors} from '../ops/native/instrument-webgpu.mjs';
import {createProvider} from '../runtime/providers/client.mjs';
import {encodeObject,decodeObjects} from '../dev-tools/conversation-capture.mjs';

test('device error capture precedes the original fatal callback and cannot suppress it',()=>{
 const source="function bind(device){device.onuncapturederror=ev=>{var type=5;fatal(ev);};}";
 const posted=[],order=[],fatal=new Error('native abort');
 const context=vm.createContext({postMessage:m=>{order.push('capture');posted.push(m);},fatal:()=>{order.push('fatal');throw fatal;}});
 vm.runInContext(instrumentWebGpuErrors(source),context);
 const device={};context.bind(device);const error={name:'GPUOutOfMemoryError',message:'allocation failed '+ 'x'.repeat(9000)};
 assert.throws(()=>device.onuncapturederror({error}),e=>e===fatal);
 assert.deepEqual(order,['capture','fatal']);assert.equal(posted[0].args[0].plcDeviceError.name,error.name);assert.equal(posted[0].args[0].plcDeviceError.message.length,8192);
 for(let i=0;i<10;i++)assert.throws(()=>device.onuncapturederror({error}),e=>e===fatal);
 assert.equal(posted.length,8);assert.equal(order.filter(x=>x==='fatal').length,11);
 const blocked=vm.createContext({postMessage:()=>{throw Error('channel closed');},fatal:()=>{throw fatal;}});vm.runInContext(instrumentWebGpuErrors(source),blocked);const other={};blocked.bind(other);assert.throws(()=>other.onuncapturederror({error}),e=>e===fatal);
 assert.throws(()=>instrumentWebGpuErrors(source+source),/site changed/);
});
test('provider diagnostics arrive after load completion and before a subsequent worker fault',async()=>{
 const target={postMessage(){},terminate(){}};const provider=createProvider(target),events=[];provider.onProviderEvent(e=>events.push(e));
 target.onmessage({data:{type:'ready',state:'unloaded'}});await provider.ready();
 const load=provider.load({});target.onmessage({data:{type:'result',id:1,value:{loaded:true}}});await load;
 const error={name:'GPUValidationError',message:'invalid tensor buffer'};target.onmessage({data:{type:'native-device-error',error}});
 assert.equal(events[0].error,error);target.onerror({message:'Aborted()',preventDefault(){}});assert.equal(provider.fault().code,'provider-fault');assert.equal(events.at(-1).state,'faulted');provider.terminate();
});
test('full native errors survive diagnostic framing without losing Unicode or message text',async()=>{
 const error={name:'GPUValidationError',message:'shader λ invalid\n'.repeat(300)};
 const frames=await encodeObject('native-error','native-failure',error,0);const decoded=await decodeObjects(frames.map(data=>({type:'conversation-object',at:'2026-10-30T00:00:00Z',data})));
 assert.deepEqual(decoded[0].object,error);assert.deepEqual(decoded[0].missingParts,[]);assert.ok(frames.length>1);
});
