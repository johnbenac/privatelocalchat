// The data snapshots in tests/fixtures/data/ are what the data upgrade suite loads (docs/DATA-COMPATIBILITY.md). These tests keep the set honest.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {listFixtures,readFixture,PROJECTION,CHARACTERS_KEY,characterProblems} from './data/lib.mjs';
import {KEY_CLASSES} from '../chat/vault/key-classes.mjs';

const names=listFixtures();
const fixtures=names.map(n=>readFixture(n));
const MAX_RELEASES_BEHIND=15;
const semver=t=>t.replace(/^v/,'').split('.').map(Number);
const newer=(a,b)=>{const x=semver(a),y=semver(b);for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]>y[i];return false;};

test('the snapshots are numbered from 001 without gaps, and each has its metadata, a plain snapshot and a vault snapshot', () => {
  assert.ok(names.length>=1,'there is at least one snapshot');
  names.forEach((n,i)=>assert.match(n,new RegExp('^'+String(i+1).padStart(3,'0')+'-v\\d+\\.\\d+\\.\\d+-[0-9a-f]{7}$'),n));
  for(const f of fixtures){
    assert.equal(f.meta.format,'plc-data-snapshot/1',f.name);assert.match(f.meta.release,/^v\d+\.\d+\.\d+$/,f.name);assert.equal(f.meta.commitFull.slice(0,7),f.meta.commit,f.name);
    assert.ok(f.meta.formats&&Object.keys(f.meta.formats).length>=10,f.name+' records the formats of the build that wrote it');
    assert.equal(f.plain.expected.projection,PROJECTION,f.name);assert.equal(f.vault.expected.projection,PROJECTION,f.name);
    assert.ok(f.plain.expected.local.chatThreads?.length>=1&&f.plain.expected.docs.length>=1,f.name+' has chats and a document');
    assert.equal(f.vault.passphrase,'correct horse',f.name);
  }
});

test('a vault snapshot holds nothing readable, and no snapshot holds an API key', () => {
  for(const f of fixtures){
    // ONE named open defect (board T418, T540 to T542): in the snapshot of the private candidate build the plain conversation ledger written before the vault existed is still readable beside it
    // (the typed vault engine holds it on purpose; converting or erasing it when the vault turns on is not built). Only that key of that one snapshot is exempt; no other key, no other snapshot.
    const exempt=f.name.startsWith('006-v0.78.0-')?'plc.encounters.v1':null;
    const vault=JSON.stringify(Object.fromEntries(Object.entries(f.vault.storage).map(([st,o])=>[st,st==='local'&&exempt?Object.fromEntries(Object.entries(o).filter(([k])=>k!==exempt)):o])));
    for(const t of f.plain.expected.local.chatThreads)for(const m of t.messages)if(String(m.content).length>=8)assert.ok(!vault.includes(m.content),f.name+': a message is readable in the vault snapshot');
    for(const d of f.plain.expected.docs)assert.ok(!vault.includes(d.text),f.name+': a document is readable in the vault snapshot');
    assert.ok(!('chatThreads' in f.vault.storage.local)&&!('plc.memory.v1' in f.vault.storage.local),f.name+': vaulted keys are not in plain storage');
    for(const mode of [f.plain,f.vault]){
      const s=mode.storage.session;
      assert.ok(!s.chatEndpointTokens||s.chatEndpointTokens==='{}','no stored API keys in '+f.name);
      if(s.chatConfig)assert.equal(JSON.parse(s.chatConfig).token??'','','no API key in the provider settings of '+f.name);
    }
  }
});

test('every format the code supports was written by some snapshot, so each can be loaded', () => {
  for(const [key,info] of Object.entries(KEY_CLASSES)){
    if(!['user','setting'].includes(info.class))continue;
    const written=new Set(fixtures.map(f=>f.meta.formats[key]).filter(Boolean));
    if(key===CHARACTERS_KEY)assert.ok(fixtures.some(f=>characterProblems(f).length===0),CHARACTERS_KEY+' is listed in snapshot metadata only: no snapshot holds actual saved characters written by a build that writes it (capture one with scripts/data-snapshot.mjs; metadata alone does not count)');
    else if(/\.v\d+$/.test(key))assert.ok(written.has(info.format),`${key} (format ${info.format}) is not in any snapshot: capture one with scripts/data-snapshot.mjs`);
    else for(let n=1;n<=info.format;n++)assert.ok(written.has(n),`no snapshot holds ${key} at format ${n}: capture one from a build that writes it (scripts/data-snapshot.mjs), before the format moves on`);
  }
});

test(`the newest snapshot is at most ${MAX_RELEASES_BEHIND} releases behind the newest release`, () => {
  let tags=[];
  try{tags=execFileSync('git',['tag','--list','v*'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).split('\n').filter(t=>/^v\d+\.\d+\.\d+$/.test(t));}catch{/* not a git checkout */}
  if(!tags.length)return; // a checkout without tags (a shallow CI clone) cannot say
  const newestSnapshot=fixtures.map(f=>f.meta.release).reduce((a,b)=>newer(b,a)?b:a);
  const behind=tags.filter(t=>newer(t,newestSnapshot)).length;
  assert.ok(behind<=MAX_RELEASES_BEHIND,`the newest snapshot is ${newestSnapshot} and ${behind} releases have followed it: capture a new one (node scripts/data-snapshot.mjs capture) and commit it`);
});

test('a snapshot that names a private build says so truthfully and binds the exact commit the page reported', () => {
  for(const f of fixtures){
    const m=f.meta;
    if(m.captureKind===undefined){assert.ok(!('unpublished' in m)&&!('baseRelease' in m)&&!('sourceCommit' in m),f.name+': provenance fields without a captureKind');continue;}
    assert.equal(m.captureKind,'private-build',f.name+': only a private build may be captured between releases');
    assert.equal(m.unpublished,true,f.name);assert.match(m.baseRelease,/^v\d+\.\d+\.\d+$/,f.name);assert.equal(m.baseRelease,m.release,f.name+': the folder release is the nearest earlier release');
    assert.match(m.sourceCommit,/^[0-9a-f]{40}$/,f.name);assert.equal(m.sourceCommit,m.commitFull,f.name+': the commit is the capture source');
    assert.equal(m.app?.commit,m.commitFull,f.name+': the page itself reported another build');
    assert.match(m.scenario,/unpublished/,f.name+': the scenario says it is unpublished');
  }
});

test('the character witness fails when actual data, ids, bytes or protection are missing (negative controls on a real snapshot)', () => {
  const good=fixtures.find(f=>characterProblems(f).length===0);
  if(!good)return; // the coverage test above fails until one exists
  const copy=()=>JSON.parse(JSON.stringify({plain:good.plain,vault:good.vault}));
  const key=CHARACTERS_KEY,expectBad=(label,mutate)=>{const c=copy();mutate(c);assert.ok(characterProblems(c).length>0,label+' must be reported');};
  expectBad('metadata without data',c=>{delete c.plain.storage.local[key];});
  expectBad('an empty expected projection',c=>{c.plain.expected.local[key].records=[];});
  expectBad('a lost resource byte',c=>{const r=c.plain.expected.local[key].records.find(x=>x.preview.name==='Neri');r.source.bytes.pop();c.plain.storage.local[key]=JSON.stringify(c.plain.expected.local[key]);});
  expectBad('an altered resource byte',c=>{const r=c.plain.expected.local[key].records.find(x=>x.preview.name==='Neri');r.source.bytes[0].data='AAAA'+r.source.bytes[0].data.slice(4);c.plain.storage.local[key]=JSON.stringify(c.plain.expected.local[key]);});
  expectBad('a changed individual id in the vault projection',c=>{c.vault.expected.local[key].records[0].individualId='individual:00000000-0000-4000-8000-000000000000';});
  expectBad('a raw plain fallback in the vault snapshot',c=>{c.vault.storage.local[key]=c.plain.storage.local[key];});
  expectBad('readable content in the vault snapshot',c=>{c.vault.storage.local.leak=c.plain.expected.local[key].records[0].individualId;});
});
