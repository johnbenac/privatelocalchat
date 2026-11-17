import test from 'node:test';
import assert from 'node:assert/strict';
import {shouldAutoLoad} from '../runtime/auto-load.mjs';
const ready={mode:'local',alreadyTried:false,userFreed:false,supported:true,busy:null,generating:false,installed:true,loadState:'unloaded',downloadPending:false};
test('a downloaded, supported model loads by itself when the app opens',()=>{ assert.equal(shouldAutoLoad(ready),true); });
test('nothing loads when it cannot or should not',()=>{
 for(const [k,v] of Object.entries({mode:'api',alreadyTried:true,userFreed:true,supported:false,busy:'install',generating:true,installed:false,loadState:'ready',downloadPending:true}))assert.equal(shouldAutoLoad({...ready,[k]:v}),false,k);
 assert.equal(shouldAutoLoad({...ready,loadState:'loading'}),false);assert.equal(shouldAutoLoad({...ready,loadState:'faulted'}),false);
});
