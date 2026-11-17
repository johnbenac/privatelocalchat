import test from 'node:test';
import assert from 'node:assert/strict';
import {messagesForInference} from '../conversation-messages.mjs';
test('legacy error notices stay in history and do not enter inference requests',()=>{
 const thread={systemPrompt:'Be helpful.',messages:[{role:'user',content:'Hello'},{role:'system',content:'Error: Generation stopped.'},{role:'assistant',content:'Hello!'},{role:'system',content:'An internal warning',notice:true},{role:'user',content:'Ready?'}]};
 const before=structuredClone(thread);assert.deepEqual(messagesForInference(thread),[{role:'system',content:'Be helpful.'},{role:'user',content:'Hello'},{role:'assistant',content:'Hello!'},{role:'user',content:'Ready?'}]);assert.deepEqual(thread,before);
});
test('leading imported system instructions are preserved together',()=>{
 const thread={systemPrompt:'Be concise.',messages:[{role:'system',content:'Error: never expose private information.'},{role:'user',content:'Hello'}]};assert.deepEqual(messagesForInference(thread),[{role:'system',content:'Be concise.\n\nError: never expose private information.'},{role:'user',content:'Hello'}]);
});
test('ordinary messages retain their role and content',()=>{
 assert.deepEqual(messagesForInference({messages:[{role:'user',content:'one'},{role:'assistant',content:'two'}]}),[{role:'user',content:'one'},{role:'assistant',content:'two'}]);
});
