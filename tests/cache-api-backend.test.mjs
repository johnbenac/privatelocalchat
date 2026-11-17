import test from 'node:test';
import assert from 'node:assert/strict';
import {createCacheApiBackend} from '../runtime/providers/cache-api-backend.mjs';

// A small in-memory CacheStorage (put/match/delete/keys), enough for the backend.
function fakeCaches(){
  const stores=new Map();
  return {async open(name){if(!stores.has(name))stores.set(name,new Map());const m=stores.get(name);
    return {async put(url,res){m.set(url,new Uint8Array(await res.arrayBuffer()));},
      async match(url){return m.has(url)?new Response(m.get(url)):undefined;},
      async delete(url){return m.delete(url);},
      async keys(){return [...m.keys()].map(url=>({url}));}};}};
}
const streamOf=(...parts)=>new ReadableStream({start(c){for(const p of parts)c.enqueue(new Uint8Array(p));c.close();}});

test('a file written from a stream reads back, with its size, and is listed without the size entries',async()=>{
  const b=createCacheApiBackend({cacheStorage:fakeCaches()});
  assert.equal(b.isSupported(),true);
  await b.write('abc_model.gguf',streamOf([1,2,3],[4,5]));
  const blob=await b.read('abc_model.gguf');assert.deepEqual([...new Uint8Array(await blob.arrayBuffer())],[1,2,3,4,5]);
  assert.equal(await b.getSize('abc_model.gguf'),5);
  assert.deepEqual(await b.list(),[{key:'abc_model.gguf',size:5}]);
});

test('a missing file is null and -1, a write replaces, and delete removes the file and its size',async()=>{
  const b=createCacheApiBackend({cacheStorage:fakeCaches()});
  assert.equal(await b.read('nope'),null);assert.equal(await b.getSize('nope'),-1);
  await b.write('k',streamOf([1,2,3]));await b.write('k',streamOf([9]));
  assert.equal(await b.getSize('k'),1);assert.deepEqual([...new Uint8Array(await (await b.read('k')).arrayBuffer())],[9]);
  await b.delete('k');assert.equal(await b.read('k'),null);assert.deepEqual(await b.list(),[]);
  await b.delete('k'); // deleting what is not there is fine
});

test('a stream that fails leaves nothing behind',async()=>{
  const b=createCacheApiBackend({cacheStorage:fakeCaches()});
  const bad=new ReadableStream({start(c){c.enqueue(new Uint8Array([1,2]));c.error(new Error('connection lost'));}});
  await assert.rejects(b.write('half',bad),/connection lost/);
  assert.equal(await b.read('half'),null);assert.equal(await b.getSize('half'),-1);assert.deepEqual(await b.list(),[]);
});

test('keys with odd characters survive, and a browser without the Cache API is not supported',async()=>{
  const b=createCacheApiBackend({cacheStorage:fakeCaches()});
  await b.write('__metadata__abc_a b/c?.gguf',streamOf([7]));
  assert.deepEqual(await b.list(),[{key:'__metadata__abc_a b/c?.gguf',size:1}]);
  assert.equal(createCacheApiBackend({cacheStorage:undefined}).isSupported(),false);
});

test('the same Blob comes back for the same file until forget(), a miss is not remembered, and a write or delete drops it',async()=>{
  const b=createCacheApiBackend({cacheStorage:fakeCaches()});
  assert.equal(await b.read('x'),null);
  await b.write('x',streamOf([1,2,3]));
  const first=await b.read('x'),again=await b.read('x');
  assert.ok(first&&first===again,'re-opening the file does not load it again');
  await b.read('y'); // another file replaces the held one
  const third=await b.read('x');assert.notEqual(third,first);
  b.forget();assert.notEqual(await b.read('x'),third,'forget() lets go of it');
  const held=await b.read('x');await b.write('x',streamOf([9]));
  const fresh=await b.read('x');assert.notEqual(fresh,held);assert.deepEqual([...new Uint8Array(await fresh.arrayBuffer())],[9]);
  await b.delete('x');assert.equal(await b.read('x'),null);
});
