// The data snapshots in tests/fixtures/data/ are what the data upgrade suite loads (docs/DATA-COMPATIBILITY.md). These tests keep the set honest.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {listFixtures,readFixture,PROJECTION} from './data/lib.mjs';
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
    const vault=JSON.stringify(f.vault.storage);
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
    if(/\.v\d+$/.test(key))assert.ok(written.has(info.format),`${key} (format ${info.format}) is not in any snapshot: capture one with scripts/data-snapshot.mjs`);
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
