import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {ICON_NAMES,splitIcon} from '../chat/icons.mjs';
test('a leading @name becomes an icon and the label is kept',()=>{
 assert.deepEqual(splitIcon('@copy Copy'),{name:'copy',rest:'Copy'});
 assert.deepEqual(splitIcon('@ghost Temporary'),{name:'ghost',rest:'Temporary'});
 assert.deepEqual(splitIcon('@close'),{name:'close',rest:''});
 assert.deepEqual(splitIcon('Plain'),{name:null,rest:'Plain'});
 assert.deepEqual(splitIcon('@nonsense Plain'),{name:null,rest:'@nonsense Plain'});
 assert.ok(ICON_NAMES.includes('down'));
});
// No emoji as a control or a control's label (copy review T1230): controls are drawn icons from chat/icons.mjs.
const EMOJI=/[\u{1F300}-\u{1FAFF}\u{2705}\u{274C}\u{2795}\u{2796}\u{23F9}\u{23ED}\u{2600}-\u{2604}\u{2B07}\u{267B}\u{270F}\u{2728}\u{FE0F}]/u;
const walk=d=>readdirSync(d).flatMap(n=>{const p=join(d,n);if(statSync(p).isDirectory())return n==='vendor'?[]:walk(p);return /\.(mjs|js|html)$/.test(n)?[p]:[];});
test('no emoji is used as a control or a control label in the app shell and its modules',()=>{
 const files=[...walk('chat'),'index.html','local-models.js'];
 const hits=[];
 for(const f of files){
  readFileSync(f,'utf8').split('\n').forEach((line,i)=>{if(EMOJI.test(line))hits.push(f+':'+(i+1)+' '+line.trim().slice(0,100));});
 }
 assert.deepEqual(hits,[],'emoji found; use a drawn icon from chat/icons.mjs');
});
