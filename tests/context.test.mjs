import test from 'node:test';
import assert from 'node:assert/strict';
import {contextUsage,planSummary,summaryPrompt,estimateTokens} from '../chat/context.mjs';
import {normalizeThread} from '../chat/threads.mjs';
const T=(msgs,extra={})=>normalizeThread({id:'t',title:'t',messages:msgs.map(([role,content])=>({role,content})),...extra},1);
test('usage rises with the conversation and respects exclusions and summaries',()=>{
 const t=T([['user','x'.repeat(3600)],['assistant','y'.repeat(3600)]]);
 const u=contextUsage(t,4096);assert.equal(u.tokens,2000);assert.equal(u.level,'ok');
 t.messages.push(...T([['user','z'.repeat(3600)]]).messages);
 assert.equal(contextUsage(t,4096).level,'warn');
 t.messages.push(...T([['assistant','q'.repeat(3600)]]).messages);
 assert.equal(contextUsage(t,4096).level,'full');
 t.messages[0].excluded=true;t.messages[1].excluded=true;assert.equal(contextUsage(t,4096).level,'ok');
 t.messages[0].excluded=t.messages[1].excluded=false;t.summary={text:'short',upTo:3};assert.ok(contextUsage(t,4096).tokens<1100);
 assert.equal(estimateTokens(36),10);
});
test('old messages are condensed in pieces that each fit, keeping the latest exchange live',()=>{
 const msgs=Array.from({length:12},(_,i)=>[i%2?'assistant':'user',`message ${i} `+'w '.repeat(300)]);
 const t=T(msgs);
 const plan=planSummary(t,2048);
 assert.equal(plan.upTo,10);assert.ok(plan.pieces.length>=2);
 assert.ok(plan.pieces.every(p=>p.length<=Math.floor(2048*0.45*3.6)),JSON.stringify(plan.pieces.map(p=>p.length)));
 assert.ok(plan.pieces[0].startsWith('User: message 0'));
 assert.ok(!plan.pieces.join('').includes('message 10')&&!plan.pieces.join('').includes('message 11'));
 t.summary={text:'s',upTo:10};assert.equal(planSummary(t,2048),null);
 assert.equal(planSummary(T([['user','a'],['assistant','b']]),4096),null);
});
test('a single huge message is split rather than dropped',()=>{
 const t=T([['user','a'.repeat(9000)],['assistant','ok'],['user','next'],['assistant','done']]);
 const plan=planSummary(t,1024);
 assert.equal(plan.pieces.join('').replace(/User: |\n\n|Assistant: ok/g,'').length>=9000,true);
});
test('the prompt carries the earlier summary forward',()=>{
 assert.match(summaryPrompt('','A'),/^Conversation:\nA/);
 assert.match(summaryPrompt('prior','B'),/Summary so far:\nprior[\s\S]*New part[\s\S]*B/);
});
