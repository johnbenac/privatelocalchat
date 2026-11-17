import test from 'node:test';
import assert from 'node:assert/strict';
import {searchThreads,parseQuery,matchRanges,fold} from '../chat/search.mjs';
import {normalizeThread} from '../chat/threads.mjs';
const T=(id,title,msgs,extra={})=>normalizeThread({id,title,messages:msgs.map(([role,content])=>({role,content})),...extra},1);
const threads=[
 T('a','Hermitage history',[['user','Tell me about the history of the Hermitage'],['assistant','The Hermitage is a museum in Saint Petersburg.']],{updatedAt:5}),
 T('b','Recipes',[['user','How do I cook crème brûlée?'],['assistant','Whisk the yolks, then bake in a water bath.']],{updatedAt:9,archived:true}),
 T('c','Gone',[['user','secret hermitage plan']],{deletedAt:3}),
 T('d','Scratch',[['user','hermitage']],{temporary:true})
];
test('terms are folded and quoted phrases stay together',()=>{
 assert.deepEqual(parseQuery('Crème "water bath"'),['creme','water bath']);
 assert.equal(fold('Éclair'),'eclair');
});
test('finds titles and messages, including archived chats, but not trashed or temporary ones',()=>{
 const r=searchThreads(threads,'hermitage');
 assert.deepEqual(r.map(x=>x.threadId),['a','a','a']);
 assert.equal(r[0].inTitle,true);
 assert.ok(r.every(x=>x.threadId==='a'));
 const cb=searchThreads(threads,'creme brulee');
 assert.equal(cb.length,1);assert.equal(cb[0].threadId,'b');assert.equal(cb[0].archived,true);
 assert.equal(cb[0].snippet.match.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,''),'creme');
});
test('every term has to be in the same message',()=>{
 assert.equal(searchThreads(threads,'yolks bake').length,1);
 assert.equal(searchThreads(threads,'yolks hermitage').length,0);
 assert.equal(searchThreads(threads,'').length,0);
});
test('older answers kept by regenerate remain searchable',()=>{
 const t=T('e','x',[['user','q']]);t.messages.push({id:'m',role:'assistant',content:'new text',versions:[{content:'first draft about lighthouses'},{content:'new text'}],versionIndex:1});
 assert.equal(searchThreads([t],'lighthouses')[0].messageId,'m');
});
test('highlight ranges merge overlaps',()=>{
 assert.deepEqual(matchRanges('The Hermitage hermit',['hermit','hermitage']),[[4,13],[14,20]]);
});
