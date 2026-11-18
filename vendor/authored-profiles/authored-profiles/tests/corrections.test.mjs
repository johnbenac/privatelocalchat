import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {registerDefinitions} from '../../src/core/content.mjs';
import {exportBundle} from '../../src/core/bundles.mjs';
import {projectPLCPreset} from '../../src/core/consumer-projections.mjs';
import {RECEIVING_DEFINITIONS} from '../receiving-definitions.mjs';
import {validateAuthored, exportAuthored, openAuthored, receivingFixture, parseDefinitions} from '../authored.mjs';
import {example,json,packaged} from './helpers.mjs';
const options = {crypto:webcrypto};
const find = (s,id) => s.document.subjects[0].aspects.find(a=>a.definition===id);
const bundle = s => exportAuthored(s.document,s.registry,{...options,
  selection:{kind:'subject',ids:[s.document.subjects[0].id]},
  byteMode:'inline',readAsset:async hash=>s.bytes.get(hash)});

test('definition parser requires one standalone value, detects duplicate keys and preserves escaped strings', () => {
  for (const text of ['{},"user:ignored":{"hidden":true}', '{} {}', '{} true',
    '{}]}}', '{"nested":{}} , "breakout":[]', '{"x":1} trailing'])
    assert.throws(()=>parseDefinitions(text),e=>e.errors.some(x=>x.code==='json'),text);
  for (const text of ['{"profiles":[],"profiles":[]}', '{"nested":{"x":1,"x":2}}'])
    assert.throws(()=>parseDefinitions(text),e=>e.errors.some(x=>x.code==='duplicate-key'),text);
  const resource={aspectDefinitions:[],profiles:[],note:'Quotes " and braces } , "ignored": true\n\\'};
  assert.deepEqual(parseDefinitions(JSON.stringify(resource)),resource);
});

test('standard and custom declared rights survive actual export/open without verification', async () => {
  for (const license of ['CC-BY-4.0','MIT',
    'LicenseRef-My-Art: Permission to share with attribution; no commercial use.']) {
    const s=await example('bex');
    find(s,'authored:media-v1').value.resources[0].license=license;
    const opened=await openAuthored(await bundle(s),options);
    assert.equal(opened.document.subjects[0].aspects.find(a=>a.definition==='authored:media-v1')
      .value.resources[0].license,license);
  }
});

test('receiver semantic snapshot equals actual accepted T15 source definitions', async () => {
  const starter=await json('../content/starter-registry.json');
  const consumer=await json('../content/bundles/consumer-definitions.json');
  for (const d of RECEIVING_DEFINITIONS.aspectDefinitions)
    assert.deepEqual(d,[...starter.aspectDefinitions,...consumer.aspectDefinitions].find(x=>x.id===d.id));
  assert.deepEqual(RECEIVING_DEFINITIONS.profiles,[starter.profiles.find(x=>x.id==='profile:character')]);
});

test('used inherited protected profile and its declared aspects cannot bypass actual bundle import', async () => {
  for (const required of [false,true]) for (const mutation of ['version','schema']) {
    const s=await example('minimal');
    s.registry=structuredClone(registerDefinitions(s.registry,{profiles:[{
      id:'user:inherited',version:'1',label:'User',definition:'User extension.',
      extends:['authored:character-v1'],aspects:[]}]}));
    s.document.subjects[0].profiles=['user:inherited'];
    if (required) s.document.subjects[0].requires=['user:inherited'];
    if (mutation==='version') s.registry.profiles.find(p=>p.id==='authored:character-v1').version='2.0.0';
    else s.registry.aspectDefinitions.find(d=>d.id==='authored:identity-v1').schema=true;
    assert.equal(validateAuthored(s.document,s.registry).valid,false);
    await assert.rejects(bundle(s));
    const unsafe=await exportBundle(s.document,s.registry,{...options,
      selection:{kind:'subject',ids:['subject:pip']}});
    await assert.rejects(openAuthored(unsafe,options),e=>e.errors.some(x=>x.code==='profile-version'));
  }
});

test('same-version consumed schema substitution is omitted; required refuses before callback', async () => {
  const s=await example('bex'); s.registry=structuredClone(s.registry);
  s.registry.aspectDefinitions.find(d=>d.id==='core:identity').schema=true;
  find(s,'core:identity').value.premise='UNTRUSTED SEMANTICS';
  const r=await receivingFixture(await bundle(s),{target:'plc',subjectId:'subject:bex',...options});
  assert.ok(r.value); assert.ok(!r.value.prompt.includes('UNTRUSTED'));
  assert.ok(r.omissions.some(x=>x.id==='aspect:bex-identity'));
  find(s,'core:identity').required=true; let calls=0;
  const refused=await receivingFixture(await bundle(s),{target:'plc',subjectId:'subject:bex',...options,
    validate:()=>{calls++;return {ok:true};}});
  assert.equal(refused.value,null); assert.equal(calls,0);
});

test('optional incompatible consumed meaning preserves expression/context/typed dependency references', async () => {
  const s=await example('neri'); s.registry=structuredClone(s.registry);
  s.registry.aspectDefinitions.find(d=>d.id==='core:identity').version='2';
  const identity=find(s,'core:identity');
  identity.scope={kind:'context',id:'context:archive'};
  identity.value.premise='UNSUPPORTED CONTEXT';
  s.registry=registerDefinitions(s.registry,{aspectDefinitions:[{id:'user:aspect-link',version:'1',
    label:'Link',definition:'A typed aspect dependency.',schema:{type:'object'},
    links:[{path:'/aspect',collection:'aspects'}]}]});
  s.document.subjects[0].aspects.push({id:'aspect:user-link',definition:'user:aspect-link',
    scope:{kind:'subject'},value:{aspect:identity.id}});
  s.document.expressions=[{id:'expression:identity',kind:'text',subjects:['subject:neri'],
    contexts:['context:archive'],aspects:[identity.id]}];
  const referencedBundle=()=>exportAuthored(s.document,s.registry,{...options,
    selection:{kind:'expression',ids:['expression:identity']},
    byteMode:'inline',readAsset:async hash=>s.bytes.get(hash)});
  const b=await referencedBundle(); const before=structuredClone(b);
  const r=await receivingFixture(b,{target:'plc',subjectId:'subject:neri',...options});
  assert.ok(r.value,JSON.stringify(r));
  assert.ok(!r.value.prompt.includes('UNSUPPORTED'));
  assert.ok(r.omissions.some(x=>x.id===identity.id));
  assert.deepEqual(b,before);
  const opened=await openAuthored(b,options);
  assert.deepEqual(opened.document.expressions[0].aspects,[identity.id]);
  identity.required=true; let calls=0;
  const refused=await receivingFixture(await referencedBundle(),{target:'plc',subjectId:'subject:neri',...options,
    validate:()=>{calls++;return {ok:true};}});
  assert.equal(refused.value,null); assert.equal(calls,0);
});

test('all three PLC routes exactly preserve old subset; invalid file fields/bytes refuse atomically', async () => {
  for (const name of ['minimal','neri','bex']) {
    const s=await packaged(name);
    const subjectId=s.document.subjects[0].id;
    const r=await receivingFixture(s.bundle,{target:'plc',subjectId,...options});
    assert.deepEqual(Object.keys(r.value).sort(),['id','name','prompt']);
    assert.deepEqual(r.value,projectPLCPreset(s.document,s.registry,{subjectId}).value);
    assert.deepEqual(await receivingFixture(s.bundle,{target:'plc',subjectId,route:'fragment',...options}),r);
  }
  for (const mode of ['name','prompt','id','file']) for (const route of ['file','fragment']) {
    const s=await example('minimal');
    if(mode==='name') s.document.subjects[0].label='x'.repeat(121);
    if(mode==='prompt') s.document.subjects[0].summary='x'.repeat(8000);
    if(mode==='file') s.document.subjects[0].summary=String.fromCharCode(1).repeat(6000);
    const before=structuredClone(s.document); let calls=0;
    const r=await receivingFixture(await bundle(s),{target:'plc',subjectId:'subject:pip',route,...options,
      ...(mode==='id'?{presetId:'x'.repeat(201)}:{}),validate:()=>{calls++;return {ok:true};}});
    assert.equal(r.value,null,mode); assert.equal(calls,0);
    assert.ok(r.errors.some(e=>e.code==='plc-provisional-bounds'),mode);
    assert.deepEqual(s.document,before);
  }
});

test('actual Unicode bundle remains an exact file candidate when its fragment is unavailable', async () => {
  const s=await example('minimal');
  s.document.subjects[0].summary='💡'.repeat(2400);
  const original=structuredClone(s.document), b=await bundle(s), before=structuredClone(b);
  const expected=projectPLCPreset(s.document,s.registry,{subjectId:'subject:pip'}).value;
  assert.ok(expected.prompt.length <= 8000);
  assert.ok(Buffer.byteLength(JSON.stringify(expected),'utf8') <= 32768);
  assert.ok(Buffer.from(JSON.stringify(expected),'utf8').toString('base64url').length > 12288);
  let calls=0;
  const validate=()=>{calls++;return {ok:true};};
  for (const selected of [{},{route:'file'}]) {
    const result=await receivingFixture(b,{target:'plc',subjectId:'subject:pip',...options,...selected,validate});
    assert.deepEqual(result.value,expected);
    assert.deepEqual(Object.keys(result.value).sort(),['id','name','prompt']);
    assert.equal(result.shapeAccepted,true);
    assert.equal(result.admissionReady,false); assert.equal(result.runtimeReady,false);
  }
  assert.equal(calls,2);
  const refused=await receivingFixture(b,{target:'plc',subjectId:'subject:pip',route:'fragment',...options,validate});
  assert.equal(refused.value,null); assert.equal(calls,2);
  assert.ok(refused.errors.some(e=>e.code==='plc-provisional-bounds' && e.message.includes('fragment')));
  await assert.rejects(receivingFixture(b,{target:'plc',subjectId:'subject:pip',route:'url',...options,validate}),
    e=>e.errors.some(x=>x.code==='route'));
  assert.equal(calls,2);
  assert.deepEqual(b,before); assert.deepEqual(s.document,original);
  assert.equal((await openAuthored(b,options)).document.subjects[0].summary,original.subjects[0].summary);
});

test('fragment boundary matches actual unpadded UTF-8 base64url length in each byte remainder', async () => {
  for (const byteCount of [9214,9215,9216,9217,9218]) {
      const s=await example('minimal'); s.document.subjects[0].summary='界'.repeat(3000);
      const base=projectPLCPreset(s.document,s.registry,{subjectId:'subject:pip'}).value;
      s.document.subjects[0].summary+='x'.repeat(byteCount-Buffer.byteLength(JSON.stringify(base),'utf8'));
      const expected=projectPLCPreset(s.document,s.registry,{subjectId:'subject:pip'}).value;
      assert.equal(Buffer.byteLength(JSON.stringify(expected),'utf8'),byteCount);
      const encoded=Buffer.from(JSON.stringify(expected),'utf8').toString('base64url');
      let calls=0;
      const result=await receivingFixture(await bundle(s),{target:'plc',subjectId:'subject:pip',
        route:'fragment',...options,validate:()=>{calls++;return {ok:true};}});
      const fits=encoded.length<=12288 && ('preset='+encoded).length<=12544;
      assert.equal(calls,fits?1:0);
      assert.deepEqual(result.value,fits?expected:null);
  }
});

test('public selection refuses opaque unknown meanings and unfamiliar audience labels', async () => {
  const s=await example('minimal');
  s.document.subjects[0].extensions={'unknown:opaque':{privateMeaning:'cannot infer'}};
  assert.equal(validateAuthored(s.document,s.registry,{visibility:'public'}).valid,false);
  await assert.rejects(exportAuthored(s.document,s.registry,{...options,visibility:'public'}));
  assert.equal(validateAuthored(s.document,s.registry).valid,true);
  const lore=await example('neri');
  for (const a of lore.document.subjects[0].aspects) {
    delete a.value.privateNote; delete a.value.authorBackstory;
    for (const e of a.value.entries || []) e.audience=['unfamiliar-team'];
  }
  await assert.rejects(exportAuthored(lore.document,lore.registry,{...options,visibility:'public'}));
});

test('prepared duplicate declarations, values, conditions, states and variants refuse', async () => {
  for (const mode of ['variable','values','condition','state','variant']) {
    const s=await example('bex'); const v=find(s,'authored:prepared-v1').value;
    if(mode==='variable') v.variables.push(structuredClone(v.variables[0]));
    if(mode==='values') v.variables[0].values.push(v.variables[0].values[0]);
    if(mode==='condition') v.states[0].when.push(structuredClone(v.states[0].when[0]));
    if(mode==='state') v.states.push(structuredClone(v.states[0]));
    if(mode==='variant') v.states[0].variants.push(structuredClone(v.states[0].variants[0]));
    assert.equal(validateAuthored(s.document,s.registry).valid,false,mode);
  }
});

test('malformed and unbounded rights declarations refuse before export', async () => {
  for (const license of ['', '   ', null, {}, 4, 'x'.repeat(8193), 'bad'+String.fromCharCode(0)]) {
    const s=await example('bex');
    find(s,'authored:media-v1').value.resources[0].license=license;
    assert.equal(validateAuthored(s.document,s.registry).valid,false);
    await assert.rejects(bundle(s));
  }
});

test('ordinary reported assertion roundtrips with separate unverified attribution', async () => {
  const s=await example('bex');
  const e=find(s,'authored:evidence-v1').value.entries[0];
  Object.assign(e,{standing:'reported',text:'The source reports a completed rehearsal.',
    source:'source:local-notes',occurrence:'occurrence:rehearsal-7',
    individual:'individual:source-bex',run:'run:source-7',participant:'participant:host'});
  const opened=await openAuthored(await bundle(s),options);
  assert.deepEqual(opened.document.subjects[0].aspects.find(a=>a.definition==='authored:evidence-v1')
    .value.entries[0],e);
  const r=await receivingFixture(await bundle(s),{target:'plc',subjectId:'subject:bex',...options});
  assert.ok(r.value); assert.equal(r.admissionReady,false);
  assert.ok(!r.value.prompt.includes(e.text));
});

test('reports require each attribution; derivatives cannot duplicate, cycle or widen audience', async () => {
  for (const field of ['author','design','source','occurrence','individual','run','participant','audience']) {
    const s=await example('bex');
    const e=find(s,'authored:evidence-v1').value.entries[0];
    e.standing='reported'; delete e[field];
    assert.equal(validateAuthored(s.document,s.registry).valid,false,field);
    await assert.rejects(bundle(s));
  }
  for (const mode of ['duplicate-entry','duplicate-parent','cycle','widen','false-firsthand','false-authority']) {
    const s=await example('bex');
    const entries=find(s,'authored:evidence-v1').value.entries;
    if (mode==='duplicate-entry') entries.push(structuredClone(entries[0]));
    if (mode==='duplicate-parent') entries[1].derivedFrom.push(entries[1].derivedFrom[0]);
    if (mode==='cycle') entries[1].derivedFrom=[entries[1].id];
    if (mode==='widen') entries[1].audience=['public'];
    if (mode==='false-firsthand') entries[0].standing='firsthand';
    if (mode==='false-authority') entries[0].authenticated=true;
    assert.equal(validateAuthored(s.document,s.registry).valid,false,mode);
  }
});
