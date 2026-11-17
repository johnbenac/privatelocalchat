// What the app is configured with (docs/APP-CONFIG.md): the module's rules, the build's checks, the operator override.
import './helpers/install-app-config.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CONFIG_FORMAT,validBase,checkAppConfig,readSources,buildAppConfig,appConfig} from '../runtime/config/app-config.mjs';

const DEFAULTS=JSON.parse(readFileSync(new URL('../app-config.json',import.meta.url),'utf8'));
const mine={modelSources:[{id:'mine',label:'My models',base:'https://models.example.org/m'}]};

test('a base is an https address or a path on this host, and nothing else', () => {
  for(const good of ['https://a.example/models/','https://a.example','/models/','/m'])assert.ok(validBase(good),good);
  for(const bad of ['','models/','//a.example/','http://a.example/','javascript:alert(1)','/a b','https://','https:///x',null,5,{},'/'+'x'.repeat(2000)])assert.ok(!validBase(bad),String(bad));
});

test('the shipped defaults are valid and name one source', () => {
  assert.deepEqual(checkAppConfig(DEFAULTS),[]);
  assert.equal(DEFAULTS.format,CONFIG_FORMAT);
  assert.equal(DEFAULTS.modelSources.length,1);
});

test('the build refuses a configuration with a mistake in it, in words', () => {
  const bad=c=>checkAppConfig(c).join(' | ');
  assert.match(bad(null),/must be an object/);
  assert.match(bad({format:'plc-app-config/2',modelSources:DEFAULTS.modelSources}),/format must be/);
  assert.match(bad({format:CONFIG_FORMAT}),/modelSources must be a list/);
  assert.match(bad({format:CONFIG_FORMAT,modelSources:[]}),/at least one/);
  assert.match(bad({format:CONFIG_FORMAT,modelSources:[{id:'A',label:'x',base:'/m/'}]}),/id must be/);
  assert.match(bad({format:CONFIG_FORMAT,modelSources:[{id:'a',label:'',base:'/m/'}]}),/label must be/);
  assert.match(bad({format:CONFIG_FORMAT,modelSources:[{id:'a',label:'x',base:'http://insecure.example/'}]}),/base must be/);
  assert.match(bad({format:CONFIG_FORMAT,modelSources:[{id:'a',label:'x',base:'/m/'},{id:'a',label:'y',base:'/n/'}]}),/used twice/);
  assert.match(bad({format:CONFIG_FORMAT,modelSources:[{id:'a',label:'x',base:'/m/',extra:1}]}),/not a source setting/);
  assert.match(bad({format:CONFIG_FORMAT,modelSources:DEFAULTS.modelSources,speed:'fast'}),/not a setting this app knows/);
});

test('an operator\'s list replaces the shipped list whole, and says it did', () => {
  const shipped=buildAppConfig(DEFAULTS);
  assert.equal(shipped.overridden,false);assert.equal(shipped.modelSources[0].id,'project-cdn');
  const op=buildAppConfig(DEFAULTS,mine);
  assert.equal(op.overridden,true);
  assert.deepEqual(op.modelSources,[{id:'mine',label:'My models',base:'https://models.example.org/m/'}],'only theirs, and the base gains its trailing slash');
  assert.throws(()=>buildAppConfig(DEFAULTS,{modelSources:[{id:'x',label:'x',base:'ftp://nope/'}]}),/config\/app-config.json has problems/);
  assert.throws(()=>buildAppConfig({format:'nope'}),/app-config.json has problems/);
});

test('the app asks for the root, and without a configuration it fails in words instead of using an address of ours', () => {
  const c=appConfig(buildAppConfig(DEFAULTS));
  assert.ok(c.isDefaultSource());assert.equal(c.activeSource().label,'Private Local Chat project CDN');assert.ok(c.modelRoot().endsWith('/models/'));
  const o=appConfig(buildAppConfig(DEFAULTS,mine));
  assert.ok(!o.isDefaultSource());assert.equal(o.modelRoot(),'https://models.example.org/m/');
  for(const nothing of [null,{},{modelSources:'x'},{modelSources:[{id:'A',label:'x',base:'/m/'}]}]){
    const n=appConfig(nothing);assert.equal(n.activeSource(),null);assert.ok(!n.isDefaultSource());
    assert.throws(()=>n.modelRoot(),/No model source is configured/);
  }
  assert.deepEqual(readSources({modelSources:[{id:'ok',label:'ok',base:'/m'},{id:'BAD',label:'x',base:'/m'}]}).map(s=>s.id),['ok'],'a broken entry is skipped, a good one kept');
});

test('a path source is made absolute when the page knows its origin', () => {
  const saved=globalThis.location;
  globalThis.location={origin:'https://copy.example'};
  try{assert.equal(appConfig(buildAppConfig(DEFAULTS,{modelSources:[{id:'local',label:'This host',base:'/models/'}]})).modelRoot(),'https://copy.example/models/');}
  finally{if(saved===undefined)delete globalThis.location;else globalThis.location=saved;}
});
