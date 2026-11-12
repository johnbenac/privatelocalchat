import './helpers/install-app-config.mjs'; // the model sources the build writes into the page (docs/APP-CONFIG.md)
import test from 'node:test';
import assert from 'node:assert/strict';
import {isNetworkError} from '../chat/connection/connection-glue.mjs';

test('the words browsers use for a request that never got an answer are network errors',()=>{
  for(const m of ['Failed to fetch','Load failed','NetworkError when attempting to fetch resource.','The Internet connection appears to be offline.','net::ERR_INTERNET_DISCONNECTED'])
    assert.equal(isNetworkError(new TypeError(m)),true,m);
  assert.equal(isNetworkError(new Error('Failed to fetch')),true);
  assert.equal(isNetworkError(new TypeError('')),true,'a bare TypeError from fetch has no message in some browsers');
});
test('an answer from a server, a stop and other failures are not',()=>{
  assert.equal(isNetworkError(Object.assign(new Error('Failed to fetch'),{status:401})),false,'a server said no');
  assert.equal(isNetworkError(Object.assign(new Error('Unauthorized'),{status:401})),false);
  assert.equal(isNetworkError(new DOMException('Generation stopped.','AbortError')),false);
  assert.equal(isNetworkError(new Error('The model ran out of memory')),false);
  assert.equal(isNetworkError(new TypeError('Cannot read properties of undefined')),false);
  assert.equal(isNetworkError(null),false);
});
