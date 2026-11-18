import './helpers/install-app-config.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createModelHost} from '../runtime/providers/model-host.mjs';

// The model-runtime component names no storage of the application (T683): the page passes its own settings store, or null for none.
test('createModelHost refuses to start without a settings store argument',()=>{
  assert.throws(()=>createModelHost({}),(e)=>e instanceof TypeError&&/settings store/.test(e.message));
  assert.throws(()=>createModelHost(),(e)=>e instanceof TypeError&&/settings store/.test(e.message));
});

test('createModelHost accepts null (no store) and a store with getItem and setItem',()=>{
  assert.doesNotThrow(()=>createModelHost({settings:null,createWorker:()=>({})}));
  const kept=new Map();
  assert.doesNotThrow(()=>createModelHost({settings:{getItem:(k)=>kept.get(k)??null,setItem:(k,v)=>kept.set(k,v)},createWorker:()=>({})}));
});
