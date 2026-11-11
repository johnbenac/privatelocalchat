import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';

// docs/evidence/encryption/storage-inventory.json lists every browser storage key and every file that touches browser storage, each with the class the
// encryption plan gives it (docs/ENCRYPTION-AT-REST-PLAN.md). This test is what makes "every new key is classified" true: a key the source uses that the
// inventory does not know, a file that starts using storage, or an inventory line for something that is gone, all fail here.
const inv=JSON.parse(await readFile(new URL('../docs/evidence/encryption/storage-inventory.json',import.meta.url),'utf8'));
const ROOT=new URL('../',import.meta.url);
const SKIP=new Set(['node_modules','dist','work','.git','vendor','tests','docs','ops','dev-tools','scripts','privacy','about','help','updates','releases']);
async function walk(dir,rel=''){
  const out=[];
  for(const e of await readdir(new URL(rel||'.',ROOT),{withFileTypes:true})){
    if(e.name.startsWith('.')||SKIP.has(e.name))continue;
    const path=rel+e.name;
    if(e.isDirectory())out.push(...await walk(dir,path+'/'));
    else if(/\.(mjs|js|html)$/.test(e.name)&&!/(^|\/)(sw|_worker)\.js$/.test(path)&&!/\.min\.js$/.test(path))out.push(path);
  }
  return out;
}
const files=[...await walk(ROOT),'scripts/service-worker.js'];
const sources=Object.fromEntries(await Promise.all(files.map(async f=>[f,await readFile(new URL(f,ROOT),'utf8')])));
const INFRA=new Set(['chat/vault/key-classes.mjs','chat/vault/vault-store.mjs']); // the vault's own files name keys on purpose (tests/vault-store.test.mjs checks them against the inventory)
const keySources=Object.fromEntries(Object.entries(sources).filter(([f])=>!INFRA.has(f)));
const API=/\b(localStorage|sessionStorage|indexedDB|appLocal|appSession)\b/;
const LEGACY=['chatThreads','chatConfig','chatModels','chatEndpointTokens','promoDismissed'];

test('every file that touches browser storage is in the inventory, and every listed file still does',()=>{
  const using=Object.keys(sources).filter(f=>API.test(sources[f])||/\bcaches\.(open|match|keys|delete)\b|navigator\.storage|\.getDirectory\(/.test(sources[f])).sort();
  const listed=[...inv.files.list].sort();
  assert.deepEqual(using.filter(f=>!listed.includes(f)),[],'files use browser storage but are not in the inventory (decide how the vault will see them, then add them)');
  assert.deepEqual(listed.filter(f=>!using.includes(f)),[],'the inventory lists files that no longer touch browser storage');
});

test('every plc.* key and every older key the source uses is classified',()=>{
  const known=new Set(inv.keys.map(k=>k.key));
  const used=new Set();
  for(const [f,text] of Object.entries(keySources))for(const m of text.matchAll(/['"`](plc\.[A-Za-z0-9_.-]+)['"`]/g))used.add(m[1]);
  assert.deepEqual([...used].filter(k=>!known.has(k)).sort(),[],'keys used in the source but not in the inventory');
  for(const k of LEGACY)assert.ok(known.has(k),k+' is classified');
});

test('every classified key is still used by its owner',()=>{
  const gone=[];
  for(const k of inv.keys){
    const text=sources[k.owner];
    if(text===undefined){gone.push(k.key+' (owner file '+k.owner+' not found)');continue;}
    // the key is named in its owner, or (for the older keys that the page declares as constants) in the page itself
    const named=text.includes(`'${k.key}'`)||text.includes(`"${k.key}"`)||text.includes('`'+k.key+'`')||(LEGACY.includes(k.key)&&keySources['index.html'].includes(`'${k.key}'`));
    if(!named)gone.push(k.key+' is not named in '+k.owner);
  }
  assert.deepEqual(gone,[],'inventory lines that no longer match the source');
});

test('the inventory is well formed: unique keys, a known class, a store, an owner',()=>{
  const classes=new Set(Object.keys(inv.classes));
  const seen=new Set();
  for(const k of inv.keys){
    assert.ok(!seen.has(k.key),'duplicate '+k.key);seen.add(k.key);
    assert.ok(classes.has(k.class),k.key+' has a known class');
    assert.ok(['localStorage','sessionStorage'].includes(k.store),k.key+' store');
    assert.ok(k.owner&&k.note,k.key+' has an owner and a note');
  }
  for(const d of inv.databases)assert.ok(classes.has(d.class)&&d.owner,d.name);
});

// ---- stage 1 of the app/site split: every store has a format and a first release (docs/DATA-COMPATIBILITY.md) ------------------------------------------------------------
const RELEASE=/^v\d+\.\d+\.\d+$|^unreleased$/;
test('every key and database has a format and the release that first used it',()=>{
  for(const k of inv.keys){
    assert.ok(Number.isInteger(k.format)&&k.format>=1,k.key+' has an integer format of 1 or more');
    const suffix=/\.v(\d+)$/.exec(k.key);
    if(suffix)assert.equal(k.format,Number(suffix[1]),k.key+': a key named ...vN has format N');
    assert.match(k.since,RELEASE,k.key+' has a since release (vX.Y.Z or unreleased)');
  }
  for(const d of inv.databases){
    assert.ok(Number.isInteger(d.format)&&d.format>=1,d.name+' has an integer format');
    assert.match(d.since,RELEASE,d.name+' has a since release');
  }
});
test('the document database and the vault carry the formats the inventory states',async()=>{
  const docs=inv.databases.find(d=>d.name==='plc-docs'),vault=inv.databases.find(d=>d.name==='plc-vault');
  assert.match(sources['chat/documents/doc-store.mjs'],new RegExp('export const DB_FORMAT = '+docs.format+';'),'doc-store DB_FORMAT matches the inventory');
  assert.match(sources['chat/vault/vault.mjs'],new RegExp('export const VAULT_FORMAT = "plc-vault/'+vault.format+'"'),'VAULT_FORMAT matches the inventory');
});

test('a key is named only by its owner and the files the inventory lists in alsoIn (the model-memory switch once overwrote the memory items)',()=>{
  const extra={};
  for(const k of inv.keys){
    const named=Object.keys(keySources).filter(f=>keySources[f].includes(`'${k.key}'`)||keySources[f].includes(`"${k.key}"`));
    const allowed=new Set([k.owner,...(k.alsoIn||[])]);
    const others=named.filter(f=>!allowed.has(f));
    if(others.length)extra[k.key]=others;
  }
  assert.deepEqual(extra,{},'a file names a key that belongs to another owner: add it to alsoIn if it only reads it, otherwise give it its own key');
});

test('production builds carry no test-only key outside the page markers',async()=>{
  const test_=inv.keys.filter(k=>k.class==='test').map(k=>k.key);
  for(const k of test_){
    for(const [f,text] of Object.entries(keySources)){
      if(!text.includes(k))continue;
      assert.equal(f,'index.html',k+' appears outside the page: '+f);
      const before=text.slice(0,text.indexOf(k));
      assert.ok(before.lastIndexOf('DEV_DIAGNOSTICS_START')>before.lastIndexOf('DEV_DIAGNOSTICS_END'),k+' must sit inside DEV_DIAGNOSTICS markers');
    }
  }
});

// ---- phase 3.2 of the encryption plan: nothing the vault keeps is reached through the browser's raw storage ------------------------------------------------------------
import {KEY_CLASSES,isVaulted} from '../chat/vault/key-classes.mjs';
const stripComments=t=>t.replace(/\/\*[\s\S]*?\*\//g,'').replace(/(^|[^:'"`])\/\/.*$/gm,'$1');
const RAW=/\b(?:window\.|globalThis\.)?(localStorage|sessionStorage)\.(getItem|setItem|removeItem)\(\s*([^,)]+)/g;
function resolveKey(arg,text){
  const a=arg.trim();
  const lit=/^['"`]([^'"`]+)['"`]$/.exec(a);if(lit)return lit[1];
  const named=new RegExp(`\\b${a.replace(/[^\w$]/g,'')}\\s*=\\s*['"\`]([^'"\`]+)['"\`]`).exec(text);
  return named?named[1]:null;
}
test('no vaulted key (user, setting, transient) is read or written through raw localStorage / sessionStorage',()=>{
  const offenders=[],unresolved=[];
  for(const [f,raw] of Object.entries(sources)){
    if(INFRA.has(f))continue;
    const text=stripComments(raw);
    for(const m of text.matchAll(RAW)){
      const key=resolveKey(m[3],text);
      if(key===null){unresolved.push(`${f}: ${m[1]}.${m[2]}(${m[3].trim()})`);continue;}
      if(isVaulted(key))offenders.push(`${f}: ${m[1]}.${m[2]}('${key}') is a ${KEY_CLASSES[key].class} key: use appLocal / appSession from chat/vault/vault-store.mjs`);
    }
  }
  assert.deepEqual(offenders,[],'vaulted keys must go through the vault store');
  assert.deepEqual(unresolved,[],'a raw storage call whose key the test cannot see: use a named constant with a string literal, or the vault store');
});

test('the vault store is what the app files import, not a copy of the browser storage',()=>{
  // every file that names a vaulted key through appLocal / appSession imports them from the vault store
  const missing=[];
  for(const [f,text] of Object.entries(sources)){
    if(INFRA.has(f)||f==='index.html')continue;
    if(/\b(appLocal|appSession)\b/.test(stripComments(text))&&!/vault-store\.mjs/.test(text))missing.push(f);
  }
  assert.deepEqual(missing,[]);
});
