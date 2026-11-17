import test from 'node:test';
import assert from 'node:assert/strict';
import {gatherEnv} from '../runtime/providers/capability-probe.mjs';

const nav=storage=>({gpu:undefined,deviceMemory:null,storage});
const opfsOk={estimate:async()=>({usage:1,quota:2}),getDirectory:async()=>({getDirectoryHandle:async()=>({})})};

test('the probe records whether the browser\'s file storage can be opened',async()=>{
  assert.equal((await gatherEnv(nav(opfsOk))).opfs,true);
  const broken={...opfsOk,getDirectory:async()=>{throw Object.assign(new Error('The operation failed for an unknown transient reason (e.g. out of memory).'),{name:'UnknownError'});}};
  assert.equal((await gatherEnv(nav(broken))).opfs,false,'getDirectory() rejects, as on an iPhone 11 Pro in a Safari 18 automation session');
  const noDir={...opfsOk,getDirectory:async()=>({getDirectoryHandle:async()=>{throw new Error('denied');}})};
  assert.equal((await gatherEnv(nav(noDir))).opfs,false,'a directory that cannot be created counts');
  assert.equal((await gatherEnv(nav({estimate:opfsOk.estimate}))).opfs,false,'a browser without OPFS cannot keep a model: unavailable');
});
