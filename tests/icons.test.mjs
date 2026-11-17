import test from 'node:test';
import assert from 'node:assert/strict';
import {ICON_NAMES,EMOJI_ICON,splitIcon} from '../chat/icons.mjs';
test('every emoji the app used maps to a drawn icon',()=>{ for(const [e,n] of Object.entries(EMOJI_ICON))assert.ok(ICON_NAMES.includes(n),e+' -> '+n); });
test('a leading emoji becomes an icon and the label is kept',()=>{
 assert.deepEqual(splitIcon('📋 Copy'),{name:'copy',rest:'Copy'});
 assert.deepEqual(splitIcon('🕶️ Temporary'),{name:'ghost',rest:'Temporary'});
 assert.deepEqual(splitIcon('Plain'),{name:null,rest:'Plain'});
});
