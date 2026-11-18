// The character presentation view model (T444). Inputs are built here in the exact shapes of Cosmogenitor's T415 definitions
// (authored:presentation-v1, authored:media-v1); their fixture files are not copied into PLC. A test against the real neri and bex bundles
// belongs to the step that vendors the authored-profiles package (T705).
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPresentationView,buildCharacterPresentation,LAYOUTS,PALETTES,IMAGE_TYPES,MAX_IMAGE_BYTES} from '../chat/presentation/view-model.mjs';

const HASH='sha256:'+'a'.repeat(64);
const asset=(over={})=>({mediaType:'image/png',size:76,sha256:HASH,verified:true,...over});
const resource=(over={})=>({asset:'asset:chart',required:true,purpose:'illustration',alt:'Two by two dark and cream squares.',author:'T415 original synthetic fixture',license:'CC0-1.0',...over});
const presentation=(over={})=>({version:'1.0.0',layout:'folio',palette:'paper',reducedMotion:true,alt:'An abstract two-colour chart.',assets:['asset:chart'],...over});
const media=(...resources)=>({version:'1.0.0',resources});

test('the closed v1 vocabulary is exactly what Cosmogenitor fixed',()=>{
  assert.deepEqual([...LAYOUTS],['dialogue','folio']);
  assert.deepEqual([...PALETTES],['dusk','paper','sea']);
  assert.deepEqual([...IMAGE_TYPES],['image/png','image/webp','image/jpeg']);
  assert.equal(MAX_IMAGE_BYTES,1024*1024);
});

test('a neri-shaped presentation gives layout, palette, and one portrait with its attribution',()=>{
  const v=buildPresentationView({presentation:presentation(),media:media(resource(),resource({asset:'asset:card',purpose:'document',alt:'A synthetic tide card.'})),assets:{'asset:chart':asset(),'asset:card':asset()}});
  assert.equal(v.usesDefault,false);assert.equal(v.refused,null);
  assert.equal(v.layout,'folio');assert.equal(v.palette,'paper');assert.equal(v.reducedMotion,true);assert.equal(v.alt,'An abstract two-colour chart.');
  assert.equal(v.images.length,1,'the card is described in media but not used by this presentation');
  assert.deepEqual({role:v.images[0].role,assetId:v.images[0].assetId,author:v.images[0].author,license:v.images[0].license,alt:v.images[0].alt},{role:'portrait',assetId:'asset:chart',author:'T415 original synthetic fixture',license:'CC0-1.0',alt:'Two by two dark and cream squares.'});
  assert.equal(v.images[0].hideFromAssistiveTech,false);
  assert.deepEqual(v.omissions,[]);
});

test('no presentation means the default look, with nothing named',()=>{
  for(const input of [{},{presentation:null},{presentation:undefined,media:media(resource())}]){
    const v=buildPresentationView(input);
    assert.equal(v.usesDefault,true);assert.equal(v.refused,null);assert.equal(v.layout,null);assert.equal(v.images.length,0);assert.deepEqual(v.omissions,[]);
  }
});

test('an unknown layout or palette is not used and is named; the rest is still used',()=>{
  const v=buildPresentationView({presentation:presentation({layout:'masonry',palette:'sea'}),media:media(resource()),assets:{'asset:chart':asset()}});
  assert.equal(v.layout,null);assert.equal(v.palette,'sea');assert.equal(v.usesDefault,false);
  assert.deepEqual(v.omissions,[{kind:'layout',id:'masonry',reason:'unknown-value'}]);
  const w=buildPresentationView({presentation:presentation({palette:'neon'})});
  assert.deepEqual(w.omissions.map((o)=>o.kind+':'+o.id),['palette:neon','asset:asset:chart']);
});

test('a presentation or media value PLC does not understand is refused whole, never half-used',()=>{
  assert.equal(buildPresentationView({presentation:'folio'}).refused.reason,'presentation-not-an-object');
  assert.equal(buildPresentationView({presentation:presentation({version:'2.0.0'})}).refused.reason,'presentation-version-not-supported');
  assert.equal(buildPresentationView({presentation:presentation(),media:{version:'9'}}).refused.reason,'media-not-supported');
  for(const v of [buildPresentationView({presentation:'x'}),buildPresentationView({presentation:presentation({version:'2.0.0'})})]){assert.equal(v.usesDefault,true);assert.equal(v.layout,null);assert.equal(v.images.length,0);}
});

test('a required image that cannot be shown refuses the presentation (not the character) with a named reason',()=>{
  const cases=[
    ['asset-not-in-bundle',{},resource()],
    ['asset-bytes-not-verified',{'asset:chart':asset({verified:false})},resource()],
    ['unsupported-media-type',{'asset:chart':asset({mediaType:'image/svg+xml'})},resource()],
    ['image-size-out-of-bounds',{'asset:chart':asset({size:MAX_IMAGE_BYTES+1})},resource()],
    ['missing-text-alternative',{'asset:chart':asset()},resource({alt:'   '})],
    ['missing-licence',{'asset:chart':asset()},resource({license:''})],
    ['missing-author',{'asset:chart':asset()},resource({author:undefined})]
  ];
  for(const [reason,assets,res] of cases){
    const v=buildPresentationView({presentation:presentation(),media:media(res),assets});
    assert.equal(v.usesDefault,true,reason);assert.equal(v.refused.reason,'required-asset-unavailable:'+reason,reason);assert.equal(v.refused.asset,'asset:chart');
    assert.equal(v.layout,null,'a refused presentation uses nothing of the package: '+reason);
  }
});

test('an optional image that cannot be shown is a named omission and the layout and palette are still used',()=>{
  const v=buildPresentationView({presentation:presentation(),media:media(resource({required:false})),assets:{}});
  assert.equal(v.usesDefault,false);assert.equal(v.refused,null);assert.equal(v.layout,'folio');assert.equal(v.images.length,0);
  assert.deepEqual(v.omissions,[{kind:'asset',id:'asset:chart',reason:'asset-not-in-bundle'}]);
});

test('audio and documents are named omissions even when marked required: PLC does not play or show them here',()=>{
  const v=buildPresentationView({presentation:presentation({assets:undefined}),media:media(resource(),resource({asset:'asset:voice',purpose:'prepared-audio',alt:'A spoken greeting.'}),resource({asset:'asset:card',purpose:'document'})),assets:{'asset:chart':asset(),'asset:voice':asset({mediaType:'audio/mpeg'}),'asset:card':asset()}});
  assert.equal(v.refused,null);assert.equal(v.images.length,1);
  assert.deepEqual(v.omissions.map((o)=>o.id+':'+o.reason),['asset:voice:purpose-not-supported-here','asset:card:purpose-not-supported-here']);
});

test('an asset the presentation names without a media description cannot be shown (no alt text, author or licence) and is named',()=>{
  const v=buildPresentationView({presentation:presentation({assets:['asset:chart','asset:extra']}),media:media(resource()),assets:{'asset:chart':asset(),'asset:extra':asset()}});
  assert.equal(v.images.length,1);assert.deepEqual(v.omissions,[{kind:'asset',id:'asset:extra',reason:'no-media-description'}]);
});

test('a background is hidden from assistive technology by PLC policy and keeps its text alternative for the preview',()=>{
  const v=buildPresentationView({presentation:presentation({assets:['asset:sea']}),media:media(resource({asset:'asset:sea',purpose:'background',alt:'Blue-green water at dusk.'})),assets:{'asset:sea':asset({mediaType:'image/webp'})}});
  assert.equal(v.images[0].role,'background');assert.equal(v.images[0].hideFromAssistiveTech,true);assert.equal(v.images[0].alt,'Blue-green water at dusk.');
});

test('the agent and the scene fall back on their own: a missing one is the default look, the other is unaffected',()=>{
  const c=buildCharacterPresentation({aspects:{subject:{presentation:presentation({layout:'dialogue'}),media:media(resource())}},assets:{'asset:chart':asset()}});
  assert.equal(c.agent.scope,'subject');assert.equal(c.agent.layout,'dialogue');assert.equal(c.agent.usesDefault,false);
  assert.equal(c.scene.scope,'context');assert.equal(c.scene.usesDefault,true);assert.equal(c.scene.refused,null);
  assert.deepEqual(buildCharacterPresentation().agent.omissions,[]);
});

test('results are frozen and inputs are never changed',()=>{
  const input={presentation:presentation(),media:media(resource()),assets:{'asset:chart':asset()}};
  const before=JSON.stringify(input);
  const v=buildPresentationView(input);
  assert.equal(JSON.stringify(input),before);
  assert.ok(Object.isFrozen(v)&&Object.isFrozen(v.images)&&Object.isFrozen(v.images[0])&&Object.isFrozen(v.omissions));
  assert.throws(()=>{'use strict';v.layout='dialogue';});
});

test('a hostile value cannot be used as a layout, a palette, or a lookup key',()=>{
  const v=buildPresentationView({presentation:presentation({layout:{toString:()=>'folio'},palette:'__proto__',assets:['constructor']}),media:media(resource({asset:'constructor'})),assets:{}});
  assert.equal(v.layout,null);assert.equal(v.palette,null);assert.equal(v.images.length,0);
  assert.ok(v.refused!==null||v.omissions.length>0);
});
