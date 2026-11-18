// Kept looks in a backup (chat/presentation/backup-looks.mjs): which go out, and how each finds its preset again when restore gives presets new ids.
import test from 'node:test';
import assert from 'node:assert/strict';
import {looksForBackup,idMapForRestore,looksToRestore} from '../chat/presentation/backup-looks.mjs';
import {mergeBackupPresets} from '../chat/assistant/preset-candidate.mjs';

const ids=()=>{let n=0;return()=>'preset-new-'+(++n);};

test('only the looks that can be used go into a backup, one per own preset',()=>{
  const have={a:{v:1,tag:'A'},c:{v:1,tag:'C'}};
  const out=looksForBackup([{id:'a'},{id:'b'},{id:'c'},null,{name:'no id'},{id:7}],(id)=>have[id]??null);
  assert.deepEqual(out,{a:{v:1,tag:'A'},c:{v:1,tag:'C'}});
  assert.deepEqual(looksForBackup(null,()=>({})),{});assert.deepEqual(looksForBackup([{id:'x'}],()=>null),{});
});

test('after a restore the look follows its preset to the new id, and not a preset the person already had',()=>{
  const mine=[{id:'mine-1',name:'Emma',prompt:'mine'}];
  const items=[{id:'old-1',name:'Emma',prompt:'theirs'},{id:'old-2',name:'Lantern Keeper',prompt:'l'},{id:'old-3',name:'Ferry Clerk',prompt:'f'}];
  const merged=mergeBackupPresets(mine,items,ids());
  const map=idMapForRestore(mine,merged.list,items);
  assert.deepEqual([...map.entries()].sort(),[['old-2','preset-new-1'],['old-3','preset-new-2']],'only the two added presets map; Emma already existed and gets nothing');
  assert.ok(![...map.values()].includes('mine-1'),'a preset the person already had is never a target');
});

test('an id used by two presets of the backup is ambiguous, so neither gets a look',()=>{
  const items=[{id:'old-1',name:'Emma',prompt:'a'},{id:'old-1',name:'Ben',prompt:'b'},{id:'old-2',name:'Cy',prompt:'c'}];
  const merged=mergeBackupPresets([],items,ids());
  assert.deepEqual([...idMapForRestore([],merged.list,items).entries()],[['old-2','preset-new-3']]);
});

test('a preset that was skipped because its name exists gets no look',()=>{
  const mine=[{id:'mine-1',name:'Emma',prompt:'mine'}];
  const items=[{id:'old-1',name:'Emma',prompt:'theirs'}];
  const merged=mergeBackupPresets(mine,items,ids());
  assert.equal(merged.added,0);
  assert.equal(idMapForRestore(mine,merged.list,items).size,0);
});

test('odd input gives no mapping and no restore, never an exception',()=>{
  for(const args of [[null,null,null],[undefined,[],'x'],[[{id:'a',name:'N'}],[{id:'a',name:'N'}],[{id:'o',name:'N'}]],[[],[{id:'n',name:'N'}],[{id:7,name:'N'},{id:'o',name:7},null,{}]]])assert.equal(idMapForRestore(...args).size,0);
  const map=new Map([['old','new']]);
  assert.deepEqual(looksToRestore({old:{v:1}},map),[['new',{v:1}]]);
  for(const bad of [null,undefined,'x',[],7])assert.deepEqual(looksToRestore(bad,map),[]);
  assert.deepEqual(looksToRestore({old:{v:1}},null),[]);assert.deepEqual(looksToRestore({old:{v:1}},{}),[]);
  assert.deepEqual(looksToRestore({other:{v:1}},map),[],'a look for an id the map does not have is ignored');
  const hostile=JSON.parse('{"__proto__":{"v":1},"old":{"v":2}}');
  assert.deepEqual(looksToRestore(hostile,new Map([['old','new']])),[['new',{v:2}]],'an own property named __proto__ is just a key nobody asked for');
  assert.deepEqual(looksToRestore(hostile,new Map([['__proto__','x']])),[['x',{v:1}]],'and a look is only taken for an id the restore actually mapped');
  assert.equal(({}).polluted,undefined);
});
