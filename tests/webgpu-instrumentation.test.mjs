import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {instrumentWebGpu} from '../ops/native/instrument-webgpu.mjs';

test('WebGPU instrumentation counts successful creations and preserves returned objects and failures',()=>{
  const source='function bufferMake(device,desc){let buffer;try{buffer=device.createBuffer(desc)}catch(ex){return false}return buffer;}function pipelineMake(device,desc){return device.createComputePipeline(desc);}function errors(device){device.onuncapturederror=ev=>{var type=5;throw ev.error;};}';
  const counters={bytes:0,pipelines:0}, buffer={}, pipeline={};
  const context=vm.createContext({__flightGpuBufferCreated:n=>counters.bytes+=n,__flightGpuPipelineCreated:()=>counters.pipelines++});
  vm.runInContext(instrumentWebGpu(source),context);
  const device={createBuffer:()=>buffer,createComputePipeline:()=>pipeline};
  assert.equal(context.bufferMake(device,{size:42}),buffer);
  assert.equal(context.pipelineMake(device,{}),pipeline);
  assert.deepEqual(counters,{bytes:42,pipelines:1});
  assert.equal(context.bufferMake({createBuffer(){throw Error('failed');}},{size:99}),false);
  assert.throws(()=>context.pipelineMake({createComputePipeline(){throw Error('failed');}},{}));
  assert.deepEqual(counters,{bytes:42,pipelines:1});
  assert.throws(()=>instrumentWebGpu(source+source),/site changed/);
});
