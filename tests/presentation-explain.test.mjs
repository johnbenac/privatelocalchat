// Every reason the view model or the package opener can give has a plain sentence, and no sentence can turn package text into markup.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {explainRefusal,explainOmission,explainOpenFailure,LAYOUT_MEANING,PALETTE_MEANING} from '../chat/presentation/explain.mjs';
import {LAYOUTS,PALETTES} from '../chat/presentation/view-model.mjs';

const source=(n)=>readFileSync(new URL('../chat/presentation/'+n,import.meta.url),'utf8');
// every quoted reason in the sources, e.g. reason: "asset-not-in-bundle"
const codes=(text)=>[...text.matchAll(/reason: "([a-z][a-z-]+(?::)?)"/g)].map((m)=>m[1]);

test('every layout and palette the view model accepts has a meaning',()=>{
  assert.deepEqual(Object.keys(LAYOUT_MEANING).sort(),[...LAYOUTS].sort());
  assert.deepEqual(Object.keys(PALETTE_MEANING).sort(),[...PALETTES].sort());
});

test('every asset reason in the view model has its own sentence (not the fallback)',()=>{
  const assetReasons=[...source('view-model.mjs').matchAll(/return \{ shown: false,[^}]*reason: "([a-z-]+)"/g)].map((m)=>m[1]);
  assert.ok(assetReasons.length>=10,'found '+assetReasons.length+' asset reasons: '+assetReasons);
  const fallback=explainOmission({kind:'asset',id:'x',reason:'nope-not-a-reason'});
  for(const r of [...new Set(assetReasons)]){
    const s=explainOmission({kind:'asset',id:'asset:x',reason:r});
    assert.notEqual(s,fallback.replace('“x”','“asset:x”'),'no sentence for asset reason '+r);
    assert.ok(s.length>10&&!/undefined|\[object/.test(s),r+': '+s);
    const refusal=explainRefusal({reason:'required-asset-unavailable:'+r,asset:'asset:x'});
    assert.match(refusal,/own look is used instead/,r); assert.match(refusal,/still in the package/,r);
  }
});

test('every refusal and omission kind the view model and opener use has a sentence',()=>{
  for(const code of ['presentation-not-an-object','presentation-version-not-supported','media-not-supported']){
    assert.ok(source('view-model.mjs').includes('"'+code+'"'),code+' is still a reason in the view model');
    assert.ok(!/cannot be used\./.test(explainRefusal({reason:code}).split(' The app')[0])||false,code+' has its own sentence');
    assert.match(explainRefusal({reason:code}),/own look is used instead/);
  }
  for(const kind of ['layout','palette','alt','characters']) assert.notEqual(explainOmission({kind,id:'z',reason:'unknown-value'}),'Something in the package was left out.',kind);
  assert.match(explainOpenFailure({reason:'too-large'}),/too large/);
  assert.match(explainOpenFailure({reason:'not-a-package'}),/not a character package/);
  assert.match(explainOpenFailure({reason:'refused-by-validator',message:'This package could not be opened: x. Nothing was used.'}),/Nothing was used/);
  assert.match(explainOpenFailure({}),/could not be opened/);
});

test('package text inside a sentence is cut short and stays plain text',()=>{
  const long='<img src=x onerror=alert(1)>'.repeat(20);
  const s=explainOmission({kind:'asset',id:long,reason:'asset-not-in-bundle'});
  assert.ok(s.length<140,'cut: '+s.length);
  assert.ok(s.includes('…'));
  assert.equal(explainOmission({kind:'asset',id:undefined,reason:'asset-not-in-bundle'}).includes('undefined'),false);
});
