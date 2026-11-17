// Files a person saves outside the browser, and what a build does with a file from another version (docs/FILE-COMPATIBILITY.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import {FILE_FORMATS,parseFormat,checkFormat,refuseIfNewer,newerMessage,buildHistoryFile} from '../chat/transfer/file-formats.mjs';
import {validateHistory,normalizeThread,normalizeMessage} from '../chat/threads.mjs';
import {readConfigFile,readEnvelope,TRANSFER_FORMAT} from '../chat/transfer/settings-transfer.mjs';
import {BACKUP_FORMAT} from '../chat/crypto.mjs';

test('a format name is name/number, and anything else is not a format', () => {
  assert.deepEqual(parseFormat('plc-backup/1'),{name:'plc-backup',n:1});
  assert.deepEqual(parseFormat('plc-settings-transfer/12'),{name:'plc-settings-transfer',n:12});
  for(const bad of ['plc-backup','plc-backup/','plc-backup/x','backup/1','plc-backup/1.5',' plc-backup/1',null,undefined,5,{}])assert.equal(parseFormat(bad),null,String(bad));
});

test('a file says whether its format is current, older, newer, unknown, or not named at all', () => {
  assert.equal(checkFormat({format:'plc-backup/1'}).state,'current');
  assert.equal(checkFormat({format:'plc-settings-transfer/2'}).state,'current');
  assert.equal(checkFormat({format:'plc-settings-transfer/1'}).state,'older');
  assert.equal(checkFormat({format:'plc-backup/2'}).state,'newer');
  assert.equal(checkFormat({format:'plc-encrypted-backup/99'}).state,'newer');
  assert.equal(checkFormat({format:'plc-from-the-future/1'}).state,'unknown');
  for(const none of [[],[{id:'a'}],null,'text',7,{},{threads:[]},{format:5},{format:'chatgpt'}])assert.equal(checkFormat(none).state,'none');
});

test('the formats this build writes are the numbers in the table', () => {
  assert.equal(checkFormat(buildHistoryFile([])).state,'current');
  assert.equal(parseFormat(BACKUP_FORMAT).n,FILE_FORMATS['plc-encrypted-backup'].current);
  assert.equal(parseFormat(TRANSFER_FORMAT).n,FILE_FORMATS['plc-settings-transfer'].current);
});

test('a newer file is refused whole, in one plain sentence, before anything else is judged', () => {
  for(const [format,label] of [['plc-history/2','chat history file'],['plc-backup/2','backup'],['plc-encrypted-backup/2','encrypted backup'],['plc-settings-transfer/3','settings file or link']]){
    assert.throws(()=>refuseIfNewer({format,threads:[{id:'x'}]}),error=>error.code==='newer-format'&&error.message===newerMessage(label)&&/newer version/.test(error.message)&&/Nothing was changed/.test(error.message),format);
  }
  assert.doesNotThrow(()=>refuseIfNewer([]));
  assert.doesNotThrow(()=>refuseIfNewer({format:'plc-backup/1'}));
  assert.doesNotThrow(()=>refuseIfNewer({format:'plc-from-the-future/1'}),'a name this build has never had is not called newer: the importer judges it');
});

test('the history file names its format and build, and is read by this build and by builds that read { threads }', () => {
  const threads=[{id:'a',title:'One',systemPrompt:'',messages:[{id:'m',role:'user',content:'hello',at:1}],createdAt:1,updatedAt:1}];
  const file=buildHistoryFile(threads,{app:{version:'2.0.0',commit:'c'.repeat(40)},now:5});
  assert.deepEqual(file,{format:'plc-history/1',exportedAt:5,app:{version:'2.0.0',commit:'c'.repeat(40)},threads});
  const read=validateHistory(JSON.parse(JSON.stringify(file)));
  assert.ok(read.ok&&read.threads.length===1&&read.threads[0].messages[0].content==='hello');
  assert.deepEqual(buildHistoryFile([],{}).app,{version:null,commit:null});
  assert.ok(validateHistory(threads).ok,'the older bare list is still read');
});

test('a settings file from a newer version says so; a file that merely differs keeps its old message', () => {
  const newer=readConfigFile(JSON.stringify({format:'plc-settings-transfer/3',settings:{endpoint:'https://x.example/v1',model:'m'}}));
  assert.equal(newer.ok,false);assert.equal(newer.code,'newer-format');assert.match(newer.message,/newer version/);
  assert.equal(readEnvelope({format:'plc-settings-transfer/1',settings:{endpoint:'https://x.example/v1',model:'m'}}).code,'unsupported-version');
  const current=readConfigFile(JSON.stringify({format:TRANSFER_FORMAT,settings:{endpoint:'https://x.example/v1',model:'m',theme:'light'}}));
  assert.ok(current.ok);
});

test('fields this build does not know are kept on a chat and its messages, so nothing a newer version added is lost', () => {
  const raw={id:'t',title:'T',systemPrompt:'',createdAt:1,updatedAt:2,futureThread:{a:[1,2,{b:true}]},messages:[
    {id:'m1',role:'user',content:'hi',at:1,futureMessage:'x',reaction:{kind:'up'}},
    {id:'m2',role:'assistant',content:'hello',at:2,model:'q',confidence:0.5}]};
  const t=normalizeThread(raw);
  assert.deepEqual(t.futureThread,{a:[1,2,{b:true}]});
  assert.equal(t.messages[0].futureMessage,'x');assert.deepEqual(t.messages[0].reaction,{kind:'up'});assert.equal(t.messages[1].confidence,0.5);
  assert.deepEqual(normalizeThread(JSON.parse(JSON.stringify(t))),t,'normalizing a second time changes nothing');
  assert.equal(t.title,'T');assert.equal(t.messages[1].model,'q');
});

test('kept fields never replace what the build handles itself, and are limited', () => {
  const t=normalizeThread({id:'t',title:'Real',messages:[{role:'user',content:'c'}],streaming:true,deletedAt:'not a number',summary:{text:'s',upTo:'x'},folderId:''});
  assert.equal(t.title,'Real');assert.ok(!('deletedAt' in t)&&!('summary' in t)&&!('folderId' in t),'known fields that fail their checks stay dropped');
  assert.equal(t.streaming,true);
  const bomb={id:'b',title:'B',messages:[{role:'user',content:'c'}]};
  for(let i=0;i<200;i++)bomb['x'+i]=i;
  assert.ok(Object.keys(normalizeThread(bomb)).length<=7+40,'at most 40 unknown fields');
  assert.ok(!('big' in normalizeThread({id:'b',title:'B',messages:[{role:'user',content:'c'}],big:'x'.repeat(30000)})),'a field over the size limit is left out');
  const hostile=JSON.parse('{"id":"h","title":"H","messages":[{"role":"user","content":"c","__proto__":{"polluted":1},"constructor":{"x":1}}],"__proto__":{"polluted":2}}');
  const h=normalizeThread(hostile);
  assert.equal({}.polluted,undefined);assert.ok(!Object.prototype.hasOwnProperty.call(h,'__proto__')&&!('constructor' in h&&Object.prototype.hasOwnProperty.call(h,'constructor')));
  const m=normalizeMessage({role:'user',content:'c',nope:()=>1,undef:undefined});
  assert.ok(!('nope' in m)&&!('undef' in m),'only data is kept');
});
