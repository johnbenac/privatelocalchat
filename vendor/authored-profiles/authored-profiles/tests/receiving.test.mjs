// Owning code read-only, pinned to actual bytes. No browser/storage/runtime is started.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createHash,webcrypto} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {projectSonalonDesign} from '../../src/core/consumer-projections.mjs';
import {registerDefinitions} from '../../src/core/content.mjs';
import {receivingFixture,parseDefinitions,exportAuthored,openAuthored} from '../authored.mjs';
import {json,read,packaged,example} from './helpers.mjs';
const sources = await json('receiving-sources.json');
// Receiver pins name live files in the Sonalon and PLC trees. That lane is optional: it runs only with
// AUTHORED_PROFILES_RECEIVERS=1 and every pinned path present; otherwise it is reported as skipped.
const SKIP = process.env.AUTHORED_PROFILES_RECEIVERS === '1' && sources.sources.every(x => existsSync(x.path))
  ? false : 'optional receiver lane: set AUTHORED_PROFILES_RECEIVERS=1 with the pinned receiver trees present';
async function pinned(id) {
  const record=sources.sources.find(x=>x.id===id);
  assert.ok(record,'missing pin '+id);
  const bytes=await readFile(record.path);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),record.sha256);
  assert.equal(bytes.length,record.bytes);
  return record.path;
}

test('all recorded receiver source bytes still match their exact accepted references', {skip: SKIP}, async () => {
  for (const source of sources.sources) await pinned(source.id);
  assert.equal(sources.sources.length,4);
});

test('actual PLC backup helper accepts all three exact producer presets with fresh local IDs', {skip: SKIP}, async () => {
  const {createBackups}=await import(pathToFileURL(await pinned('plc-backups')));
  const assistant={customPresets:[]}; let next=0, memories=0;
  const helper=createBackups({assistant,prefs:{},folders:()=>[],saveFolders(){},savePresets(){},
    savePrefs(){},generateThreadId:()=>`synthetic-${++next}`,addMemory(){memories++;}});
  for (const name of ['minimal','neri','bex']) {
    const {bundle}=await packaged(name);
    const projection=await receivingFixture(bundle,{target:'plc',
      subjectId:`subject:${name==='minimal'?'pip':name}`,crypto:webcrypto});
    const before=structuredClone(projection.value);
    await helper.restoreExtras({presets:[projection.value]});
    const admitted=assistant.customPresets.at(-1);
    assert.equal(admitted.name,before.name);
    assert.equal(admitted.prompt,before.prompt);
    assert.equal(admitted.id,`preset-synthetic-${next}`);
    assert.notEqual(admitted.id,before.id);
    assert.deepEqual(projection.value,before);
  }
  assert.deepEqual(assistant.customPresets.map(p=>p.name),['Pip','Neri','Bex']);
  assert.equal(memories,0,'authored reports are never passed to memory restore');
});

test('actual Sonalon schema refuses three incomplete authored candidates; no generic history is invented', {skip: SKIP}, async () => {
  const {createRecordSchemas}=await import(pathToFileURL(await pinned('sonalon-jsonschema')));
  const schemas=createRecordSchemas({resident:JSON.parse(await readFile(await pinned('sonalon-schema'),'utf8'))});
  for (const name of ['minimal','neri','bex']) {
    const {bundle}=await packaged(name); let calls=0;
    const r=await receivingFixture(bundle,{target:'sonalon',subjectId:`subject:${name==='minimal'?'pip':name}`,
      crypto:webcrypto,validate:x=>{calls++;return schemas.design(x);}});
    assert.equal(r.value,null); assert.equal(calls,0);
    assert.ok(r.projection.missing.some(x=>x.source==='sonalon:authored-sections'));
    // Direct schema rejection is distinct from the producer's honest missing report.
    assert.equal(schemas.design({schema:'cognitive-fabric/resident-design',schemaVersion:'2.0.0',
      design:{name:bundle.content.subjects.find(s=>s.id===`subject:${name==='minimal'?'pip':name}`).label}}).ok,false);
  }
});

test('accepted T15 Emma plus optional T415 traverses actual bundle and receiving schema; required refuses', {skip: SKIP}, async () => {
  const {createRecordSchemas}=await import(pathToFileURL(await pinned('sonalon-jsonschema')));
  const {createInstance}=await import(pathToFileURL(await pinned('sonalon-create')));
  const schemas=createRecordSchemas({resident:JSON.parse(await readFile(await pinned('sonalon-schema'),'utf8'))});
  const control=await example('minimal');
  const registry=registerDefinitions(control.registry,
    parseDefinitions(await read('../content/bundles/consumer-definitions.json')));
  const source=await json('../content/bundles/emma-rich.json');
  const meta=source.subjects[0].aspects.find(a=>a.definition==='sonalon:design-metadata');
  meta.value.designId='design:t415-mapping-control'; meta.value.designVersion='4.2.0';
  source.subjects[0].profiles.push('authored:character-v1');
  source.subjects[0].aspects.push({id:'aspect:emma-t415-guidance',definition:'authored:guidance-v1',
    scope:{kind:'subject'},required:false,value:{version:'1.0.0',adapter:'plain-text-v1',
      instructions:['Integration-only authored guidance; receiver does not consume it.']}});
  const exported=await exportAuthored(source,registry,{crypto:webcrypto,
    selection:{kind:'subject',ids:['subject:emma']}});
  const opened=await openAuthored(JSON.stringify(exported),{crypto:webcrypto});
  assert.ok(opened.document.subjects[0].aspects.some(a=>a.id==='aspect:emma-t415-guidance'));
  let calls=0;
  const result=await receivingFixture(exported,{target:'sonalon',subjectId:'subject:emma',
    crypto:webcrypto,validate:x=>{calls++;return schemas.design(x);}});
  assert.equal(calls,1); assert.equal(result.shapeAccepted,true);
  assert.equal(result.admissionReady,false); assert.equal(result.runtimeReady,false);
  assert.ok(result.omissions.some(x=>x.id==='aspect:emma-t415-guidance'));
  assert.ok(result.omissions.some(x=>x.id==='authored:character-v1'));
  assert.deepEqual(result.value,projectSonalonDesign(source,registry,
    {subjectId:'subject:emma',validate:schemas.design}).value);
  assert.equal(result.value.design.designId,'design:t415-mapping-control');
  assert.equal(result.value.design.designVersion,'4.2.0');
  assert.notEqual(result.value.design.designId,source.subjects[0].id);
  const a=await createInstance(result.value,{residentId:'r-t415-control-a',now:'2026-11-16T21:00:00Z'},{schemas});
  const b=await createInstance(result.value,{residentId:'r-t415-control-b',now:'2026-11-16T21:00:00Z'},{schemas});
  assert.equal(a.instance.residentId,'r-t415-control-a');
  assert.equal(b.instance.residentId,'r-t415-control-b');
  assert.notEqual(a.instance.residentId,b.instance.residentId);
  assert.equal(a.events[0].transition,'instance-created');
  assert.ok(a.memory.items.every(m=>m.source.kind==='authored'));
  assert.equal(a.design.designId,'design:t415-mapping-control');
  assert.notEqual(a.design.designId,a.instance.residentId);
  source.subjects[0].aspects.at(-1).required=true;
  const required=await exportAuthored(source,registry,{crypto:webcrypto,
    selection:{kind:'subject',ids:['subject:emma']}});
  const refusal=await receivingFixture(required,{target:'sonalon',subjectId:'subject:emma',
    crypto:webcrypto,validate:x=>{calls++;return schemas.design(x);}});
  assert.equal(refusal.value,null); assert.equal(calls,1);
  assert.ok(refusal.errors.some(e=>e.code==='required-aspect'));
});
