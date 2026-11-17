import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyEngineError} from '../runtime/providers/errors.mjs';

// What Safari says when the page cannot be given a place to save files (seen on an iPhone 11 Pro in a Safari automation session: navigator.storage.getDirectory()
// rejected with this text). It must not be reported as "the model needs too much memory".
const webkit={name:'UnknownError',message:'The operation failed for an unknown transient reason (e.g. out of memory).'};

test('a failed storage call while saving or loading files is "storage unavailable", with advice about the browser, not about RAM',()=>{
  for(const phase of ['install','load']){
    const c=classifyEngineError(webkit,{phase});
    assert.equal(c.code,'storage-unavailable',phase);assert.equal(c.class,'load-failed');
    assert.match(c.advice,/Private Browsing/);assert.ok(!/6 GB|Light tier/.test(c.advice),'does not blame memory');
  }
});

test('the same words during a reply are still a memory problem, and real memory errors are unchanged',()=>{
  assert.equal(classifyEngineError(webkit,{phase:'generate'}).class,'out-of-memory');
  assert.equal(classifyEngineError(new Error('Out of memory'),{phase:'install'}).class,'out-of-memory');
  assert.equal(classifyEngineError(new RangeError('Array buffer allocation failed'),{phase:'load'}).class,'out-of-memory');
});
