// The saved files in tests/fixtures/files are what the file import suite opens (docs/FILE-COMPATIBILITY.md). These tests keep the set honest.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {listFileFixtures,readFileFixture} from './data/files.mjs';
import {listFixtures,readFixture} from './data/lib.mjs';
import {FILE_FORMATS,parseFormat} from '../chat/transfer/file-formats.mjs';
import {validateHistory} from '../chat/threads.mjs';
import {readConfigFile} from '../chat/transfer/settings-transfer.mjs';

const names=listFileFixtures();
const fixtures=names.map(n=>readFileFixture(n));
const MAX_RELEASES_BEHIND=15;
const semver=t=>t.replace(/^v/,'').split('.').map(Number);
const newer=(a,b)=>{const x=semver(a),y=semver(b);for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]>y[i];return false;};
// Formats the code writes now that no released build has written yet: the first snapshot of a release that writes them removes the entry (this test then fails until it does).
const NOT_YET_RELEASED=new Set([]);

test('the file snapshots are numbered from 001 without gaps, each with metadata and its three files', () => {
  assert.ok(names.length>=1);
  names.forEach((n,i)=>assert.match(n,new RegExp('^'+String(i+1).padStart(3,'0')+'-v\\d+\\.\\d+\\.\\d+-[0-9a-f]{7}$'),n));
  for(const f of fixtures){
    assert.equal(f.meta.format,'plc-file-snapshot/1',f.name);assert.match(f.meta.release,/^v\d+\.\d+\.\d+$/,f.name);assert.equal(f.meta.commitFull.slice(0,7),f.meta.commit,f.name);
    assert.ok(listFixtures().includes(f.meta.dataFixture),f.name+' names the data snapshot it was made from');
    for(const file of ['history.json','encrypted-backup.json','settings.json'])assert.ok(f.meta.files[file]&&f.text(file).length>2,f.name+' has '+file);
    for(const file of Object.keys(f.meta.files)){
      const v=JSON.parse(f.text(file));
      assert.equal(Array.isArray(v)?'bare-list':v.format,f.meta.files[file].format,f.name+' '+file+' says what the metadata says');
    }
  }
});

test('every format number the code reads was written by some snapshot, so each can be opened', () => {
  const written=new Set(fixtures.flatMap(f=>Object.values(f.meta.files).flatMap(x=>[x.format,x.inner].filter(Boolean))));
  for(const [name,info] of Object.entries(FILE_FORMATS)){
    for(let n=info.first??1;n<=info.current;n++){
      const key=`${name}/${n}`;
      if(NOT_YET_RELEASED.has(key)){assert.ok(!written.has(key),`${key} is in a snapshot now: remove it from NOT_YET_RELEASED`);continue;}
      assert.ok(written.has(key),`no snapshot holds ${key}: capture one from a build that writes it (scripts/file-snapshot.mjs) before the format moves on`);
    }
  }
  assert.ok(written.has('bare-list'),'the older chat history file (a bare list) is in a snapshot');
});

test('what the current build reads from a snapshot matches the data it was made from', () => {
  for(const f of fixtures){
    const data=readFixture(f.meta.dataFixture);
    const expected=data.plain.expected.local.chatThreads;
    const read=validateHistory(JSON.parse(f.text('history.json')));
    assert.ok(read.ok,f.name);
    assert.deepEqual(read.threads.map(t=>t.title).sort(),expected.map(t=>t.title).sort(),f.name+' titles');
    const flat=ts=>ts.flatMap(t=>t.messages.map(m=>`${t.title}|${m.role}|${m.content}`)).sort();
    assert.deepEqual(flat(read.threads),flat(expected),f.name+' messages');
    const settings=readConfigFile(f.text('settings.json'));
    assert.ok(settings.ok&&settings.settings.model==='fake-model',f.name+' settings');
  }
});

test('the backup inside each encrypted file opens with the passphrase and is the format the metadata says', async () => {
  const {decryptString}=await import('../chat/crypto.mjs');
  for(const f of fixtures){
    const inner=JSON.parse(await decryptString(JSON.parse(f.text('encrypted-backup.json')),f.meta.passphrase));
    assert.equal(inner.format,f.meta.files['encrypted-backup.json'].inner,f.name);
    const expected=readFixture(f.meta.dataFixture).plain.expected;
    assert.equal(inner.threads.length,expected.local.chatThreads.length,f.name+' chats');
    assert.equal(inner.docs.length,expected.docs.length,f.name+' documents');
    assert.ok(inner.memory.items.length>=1&&inner.presets.length>=1&&inner.folders.length>=1,f.name+' memory, presets and projects');
  }
});

test('no snapshot file holds readable chat text in the encrypted backup, or an API key anywhere', () => {
  for(const f of fixtures){
    const backup=f.text('encrypted-backup.json');
    for(const word of ['Lisbon','launch notes','pirate','favourite colour'])assert.ok(!backup.toLowerCase().includes(word.toLowerCase()),f.name+': '+word+' is readable in the backup');
    assert.ok(parseFormat(JSON.parse(backup).format)?.name==='plc-encrypted-backup');
    for(const file of ['history.json','settings.json'])assert.ok(!/"token"\s*:\s*"[^"]/.test(f.text(file))&&!/sk-[A-Za-z0-9]{10,}/.test(f.text(file)),f.name+' '+file+' holds no API key');
  }
});

test(`the newest file snapshot is at most ${MAX_RELEASES_BEHIND} releases behind the newest release`, () => {
  let tags=[];
  try{tags=execFileSync('git',['tag','--list','v*'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).split('\n').filter(t=>/^v\d+\.\d+\.\d+$/.test(t));}catch{/* not a git checkout */}
  if(!tags.length)return;
  const newestSnapshot=fixtures.map(f=>f.meta.release).reduce((a,b)=>newer(b,a)?b:a);
  const behind=tags.filter(t=>newer(t,newestSnapshot)).length;
  assert.ok(behind<=MAX_RELEASES_BEHIND,`the newest file snapshot is ${newestSnapshot} and ${behind} releases have followed it: capture a new one (node scripts/file-snapshot.mjs capture) and commit it`);
});
