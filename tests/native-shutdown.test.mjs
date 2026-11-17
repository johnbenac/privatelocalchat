import test from 'node:test';import assert from 'node:assert/strict';
import {shutdownNativeRuntime} from '../runtime/providers/native-shutdown.mjs';

test('native cleanup acknowledges before the owned runtime is terminated',async()=>{
 const order=[];const proxy={taskId:7,worker:{terminate(){order.push('terminate');}},async pushTask(task){assert.deepEqual(task,{verb:'wllama.exit',args:[],callbackId:7});order.push('native-free');return '{"success":true}';}};
 const runtime={proxy,async exit(){proxy.worker.terminate();}};
 const result=await shutdownNativeRuntime(runtime);assert.equal(result.nativeExit,'acknowledged');assert.deepEqual(order,['native-free','terminate']);assert.equal(proxy.taskId,8);
});
test('cleanup rejection and timeout still terminate without leaving an indefinite unload',async()=>{
 for(const [pushTask,expected]of [[async()=>{throw Error('native failed');},'failed'],[()=>new Promise(()=>{}),'timed-out'],[async()=>'{"success":false}','failed'],[async()=>'{"error":true}','failed'],[async()=>'{"unrelated":true}','failed'],[async()=>'not-json','failed']]){
  let terminated=0;const runtime={proxy:{taskId:1,worker:{terminate(){terminated++;}},pushTask},async exit(){this.proxy.worker.terminate();}};
  assert.equal((await shutdownNativeRuntime(runtime,{timeoutMs:5})).nativeExit,expected);assert.equal(terminated,1);
 }
});
test('fallback also terminates if the wrapper exit itself throws; external ownership stays external',async()=>{
 let terminated=0;const worker={terminate(){terminated++;}};
 await assert.rejects(shutdownNativeRuntime({proxy:{taskId:1,worker,pushTask:async()=>true},exit:async()=>{throw Error('exit failed');}}),/exit failed/);assert.equal(terminated,1);
 assert.equal((await shutdownNativeRuntime({proxy:{worker,workerOwnedExternally:true},exit:async()=>{}})).nativeExit,'externally-owned');assert.equal(terminated,1);
});
