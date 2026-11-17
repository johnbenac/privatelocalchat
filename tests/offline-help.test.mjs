import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ITEM_LABELS,offlineReadiness} from '../runtime/offline-readiness.mjs';
import {STATE_WORDS,FIX_LABEL} from '../chat/shell/offline-checklist.mjs';

// The offline checklist and the Help page must use the same words (offline plan 3.5): what the app calls a line, a state and a button is what
// Help explains. A word changed in one place and not the other fails here.
const text=h=>h.replace(/<[^>]+>/g,' ').replace(/&rsquo;/g,'’').replace(/&hellip;/g,'…').replace(/&amp;/g,'&').replace(/\s+/g,' ');
const help=text(await readFile(new URL('../run-kit/pages/help/index.html',import.meta.url),'utf8'));
const section=help.slice(help.indexOf('Checking that it will work offline'),help.indexOf('Freeing memory or removing a model'));

test('Help names every line of the offline checklist the app shows ',()=>{
  for(const [id,label] of Object.entries(ITEM_LABELS)){ assert.ok(section.includes(label),'Help explains "'+label+'"'); }
});
test('Help uses the state words the checklist uses',()=>{
  for(const [state,word] of Object.entries(STATE_WORDS))assert.ok(section.includes(word),'Help uses "'+word+'" ('+state+')');
});
test('Help says what happens when a model cannot fit in the room the browser allows',()=>{assert.match(section,/will not let this site save enough/);});
test('Help explains the buttons the checklist offers in Settings and the pill',()=>{
  for(const label of [FIX_LABEL['save-runtime'],FIX_LABEL.persist])assert.ok(section.includes(label),'Help explains the "'+label+'" button');
});
test('Help names the pill, its words and where the checklist lives',()=>{
  for(const phrase of ['Ready for offline use','Offline','Back online','Settings','Models','airplane mode'])assert.ok(section.includes(phrase),phrase);
});
test('every line the checklist can produce has a label Help knows, and nothing is empty',()=>{
  const r=offlineReadiness({app:'stale',mode:'local',model:{name:'M',downloaded:true},runtime:{saved:1,expected:2},voice:{system:true},persisted:false});
  for(const i of r.items){assert.ok(i.label&&i.detail,i.id);assert.ok(Object.values(ITEM_LABELS).includes(i.label),i.id);}
});
