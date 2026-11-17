import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateRawSync,inflateRawSync} from 'node:zlib';
import {convertForeign,describeForeign} from '../chat/transfer/foreign-import.mjs';
import {readConversationsJson,listEntries} from '../chat/transfer/zip.mjs';
const chatgpt=[{title:'Trip planning',create_time:1700000000,update_time:1700000100,current_node:'c',mapping:{
 a:{id:'a',parent:null,children:['b'],message:{author:{role:'system'},content:{content_type:'text',parts:['']}}},
 b:{id:'b',parent:'a',children:['c','x'],message:{author:{role:'user'},create_time:1700000010,content:{content_type:'text',parts:['Where should I go in May?']}}},
 x:{id:'x',parent:'b',children:[],message:{author:{role:'assistant'},content:{content_type:'text',parts:['abandoned branch']}}},
 c:{id:'c',parent:'b',children:[],message:{author:{role:'assistant'},create_time:1700000020,content:{content_type:'multimodal_text',parts:['Lisbon is lovely.',{content_type:'image_asset_pointer',asset_pointer:'file-service://x'}]}}}}}];
const claude=[{uuid:'u1',name:'Pasta',created_at:'2025-01-02T03:04:05Z',updated_at:'2025-01-02T03:05:05Z',chat_messages:[
 {sender:'human',text:'Boil water?',created_at:'2025-01-02T03:04:06Z',attachments:[{file_name:'recipe.txt',extracted_content:'200g pasta'}],files:[{file_name:'photo.png'}]},
 {sender:'assistant',text:'',content:[{type:'text',text:'Yes, salt it.'},{type:'tool_use',name:'x'}],created_at:'2025-01-02T03:04:09Z'}]},{uuid:'u2',name:'Empty',chat_messages:[]}];
test('ChatGPT exports follow the visible branch and report what cannot transfer',()=>{
 const r=convertForeign(chatgpt);
 assert.equal(r.format,'ChatGPT');assert.equal(r.threads.length,1);
 const t=r.threads[0];assert.equal(t.title,'Trip planning');
 assert.deepEqual(t.messages.map(m=>[m.role,m.content]),[['user','Where should I go in May?'],['assistant','Lisbon is lovely.']]);
 assert.equal(t.createdAt,1700000000000);assert.equal(r.omitted,1);
});
test('Claude exports keep text and extracted file text, and skip empty chats',()=>{
 const r=convertForeign(claude);
 assert.equal(r.format,'Claude');assert.equal(r.threads.length,1);assert.equal(r.skippedChats,1);
 assert.match(r.threads[0].messages[0].content,/Boil water\?[\s\S]*Attached file: recipe\.txt[\s\S]*200g pasta/);
 assert.equal(r.threads[0].messages[1].content,'Yes, salt it.');
 assert.equal(r.omitted,2);assert.match(describeForeign(r),/Claude export: 1 conversation/);
});
test('unrecognised data is not guessed at',()=>{
 assert.equal(convertForeign([{foo:1}]),null);assert.equal(convertForeign({}),null);assert.equal(convertForeign([]),null);
});
function zipOf(name,bytes,method){
 const data=method===8?deflateRawSync(bytes):bytes,nm=Buffer.from(name);
 const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(method,8);local.writeUInt32LE(data.length,18);local.writeUInt32LE(bytes.length,22);local.writeUInt16LE(nm.length,26);
 const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(method,10);central.writeUInt32LE(data.length,20);central.writeUInt32LE(bytes.length,24);central.writeUInt16LE(nm.length,28);central.writeUInt32LE(0,42);
 const localPart=Buffer.concat([local,nm,data]),cd=Buffer.concat([central,nm]);
 const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(cd.length,12);end.writeUInt32LE(localPart.length,16);
 return new Uint8Array(Buffer.concat([localPart,cd,end]));
}
test('conversations.json is read out of a data-export ZIP, stored or deflated',async()=>{
 const json=Buffer.from(JSON.stringify(chatgpt));
 for(const method of [0,8]){
  const text=await readConversationsJson(zipOf('export-2025/conversations.json',json,method),async raw=>new Uint8Array(inflateRawSync(raw)));
  assert.deepEqual(JSON.parse(text),chatgpt);
 }
 assert.equal(listEntries(zipOf('a.txt',Buffer.from('x'),0))[0].name,'a.txt');
 await assert.rejects(readConversationsJson(zipOf('other.json',json,0)),/not found/);
 assert.throws(()=>listEntries(new Uint8Array(10)),/ZIP/);
});
