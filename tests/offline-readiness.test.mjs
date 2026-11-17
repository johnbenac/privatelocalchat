import test from 'node:test';
import assert from 'node:assert/strict';
import {offlineReadiness,offlineHint,installHint,updateHint} from '../runtime/offline-readiness.mjs';

const ready={app:'current',mode:'local',model:{name:'Light',downloaded:true,loaded:false},runtime:{saved:8,expected:8},voice:{system:true},matching:{needed:true,downloaded:true},persisted:true};
const byId=(r,id)=>r.items.find(i=>i.id===id);

test('everything saved is ready, with no fix offered anywhere',()=>{
  const r=offlineReadiness(ready);
  assert.equal(r.summary,'ready');assert.match(r.text,/^Ready for offline use/);
  assert.ok(r.items.every(i=>i.state==='ready'&&i.fix===null));
});

test('a model that is not downloaded makes the device not ready, and says which step fixes it',()=>{
  const r=offlineReadiness({...ready,model:{name:'Light',downloaded:false}});
  assert.equal(r.summary,'not-ready');assert.equal(byId(r,'model').fix,'download-model');assert.equal(byId(r,'runtime'),undefined,'no runtime line until there is a model to run');
  assert.match(r.text,/chat model/);
});

test('the runtime files being absent or partial is shown, not hidden behind a yes',()=>{
  assert.equal(offlineReadiness({...ready,runtime:{saved:0,expected:8}}).summary,'not-ready');
  const some=offlineReadiness({...ready,runtime:{saved:3,expected:8}});
  assert.equal(some.summary,'almost');assert.equal(byId(some,'runtime').fix,'save-runtime');assert.match(byId(some,'runtime').detail,/3 of 8/);
});

test('an update waiting is "almost", with a reload fix',()=>{
  const r=offlineReadiness({...ready,app:'stale'});
  assert.equal(r.summary,'almost');assert.equal(byId(r,'app').fix,'reload');
});

test('an app that was never saved blocks, and an unsupported browser says so without a fix',()=>{
  assert.equal(offlineReadiness({...ready,app:'none'}).summary,'not-ready');
  const u=offlineReadiness({...ready,app:'unsupported'});assert.equal(u.summary,'not-ready');assert.equal(byId(u,'app').fix,null);
});

test('the matching model and the storage promise are advice, never a blocker',()=>{
  const r=offlineReadiness({...ready,matching:{needed:true,downloaded:false},persisted:false});
  assert.equal(r.summary,'ready');assert.equal(byId(r,'matching').state,'partial');assert.equal(byId(r,'storage').fix,'persist');
  assert.match(byId(r,'matching').detail,/exact words/);
});

test('matching model is not listed when nothing will ask for it',()=>{
  assert.equal(byId(offlineReadiness({...ready,matching:{needed:false}}),'matching'),undefined);
});

test('a downloaded voice is ready; a chosen voice that is not downloaded is a missing, fixable item',()=>{
  assert.equal(byId(offlineReadiness({...ready,voice:{name:'Kokoro',system:false,downloaded:true}}),'voice').state,'ready');
  const m=byId(offlineReadiness({...ready,voice:{name:'Kokoro',system:false,downloaded:false}}),'voice');
  assert.equal(m.state,'missing');assert.equal(m.fix,'download-voice');
});

test('with a connected provider the summary says it needs a connection and the model line is not applicable',()=>{
  const r=offlineReadiness({...ready,mode:'api'});
  assert.equal(r.summary,'api');assert.equal(byId(r,'model').state,'na');assert.match(r.text,/needs a connection/);
  assert.equal(byId(r,'runtime'),undefined);
});

test('nothing known yet is "checking", never a false ready or a false alarm',()=>{
  const r=offlineReadiness({});
  assert.equal(r.summary,'almost');assert.match(r.text,/Checking/);assert.ok(r.items.every(i=>i.state==='unknown'));
});

test('the first-use hint says it works, or what is left, and is silent when there is nothing to say',()=>{
  assert.equal(offlineHint(offlineReadiness(ready)).kind,'ready');
  assert.equal(offlineHint(offlineReadiness({...ready,runtime:{saved:1,expected:8}})).kind,'todo');
  assert.equal(offlineHint(offlineReadiness({...ready,app:'none'})).kind,'todo');
  assert.equal(offlineHint(offlineReadiness({...ready,mode:'api'})),null);
  assert.equal(offlineHint(offlineReadiness({})).kind,'todo','still checking is not "ready"');
  assert.equal(offlineHint(null),null);
});

test('the Home Screen hint is for iPhone and iPad with a saved model that is not on the Home Screen, and the update hint for a saved newer version',()=>{
  const m={model:{downloaded:true}};
  assert.equal(installHint({ios:true,standalone:false,...m}).kind,'install');
  assert.equal(installHint({ios:true,standalone:true,...m}),null,'already on the Home Screen');
  assert.equal(installHint({ios:false,standalone:false,...m}),null,'other browsers do not delete it this way');
  assert.equal(installHint({ios:true,standalone:false,model:{downloaded:false}}),null,'nothing to keep yet');
  assert.equal(updateHint({app:'stale'}).kind,'update');assert.equal(updateHint({app:'current'}),null);assert.equal(updateHint(null),null);
});

test('a browser window that cannot keep the app, or its models, says why in words a person can act on',()=>{
  const r=offlineReadiness({...ready,app:'unsupported'});
  assert.match(byId(r,'app').detail,/Private Browsing/);assert.match(byId(r,'app').detail,/Lockdown Mode/);assert.equal(byId(r,'app').fix,null);
  const o=offlineReadiness({...ready,opfs:false,persisted:false});
  assert.match(byId(o,'storage').detail,/may be lost when you close Safari/);assert.equal(byId(o,'storage').state,'partial');
  assert.equal(byId(offlineReadiness({...ready,opfs:true}),'storage').state,'ready','storage that works is not warned about');
});

test('a window that looks private is said first, the summary names it, and the hint says what to do',()=>{
  const r=offlineReadiness({...ready,private:{state:'likely',reasons:['file-storage-refused']}});
  assert.equal(r.items[0].id,'window');assert.equal(r.items[0].state,'missing');assert.match(r.items[0].detail,/private window/);
  assert.equal(r.summary,'not-ready');assert.match(r.text,/private window/);
  assert.match(offlineHint(r).text,/normal Safari tab/);assert.equal(offlineHint(r).kind,'private');
  const p=offlineReadiness({...ready,private:{state:'possible',reasons:['no-service-worker']}});
  assert.equal(p.items[0].id,'window');assert.equal(p.items[0].state,'partial');assert.equal(p.summary,'ready','a guess that is only possible does not block');
  assert.equal(offlineReadiness(ready).items.some(i=>i.id==='window'),false,'a normal window has no such line');
});
