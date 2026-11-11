// Shared by the data capture script and the data upgrade suite (docs/DATA-COMPATIBILITY.md).
//
// A snapshot is everything the browser holds for the app at one moment: local and session storage and every IndexedDB database with its schema and
// records. It is written by the real app in a real browser, restored byte for byte into a fresh browser by a later build, and judged by what the
// person can see: the content projection below, compared so that new fields never matter but missing or changed content always does.
import {readdirSync,readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

export const FIXTURES=fileURLToPath(new URL('../fixtures/data/',import.meta.url));
export const PASSPHRASE='correct horse';

/** The fixture folders, oldest first (their names start with a sequence number). */
export const listFixtures=(dir=FIXTURES)=>existsSync(dir)?readdirSync(dir,{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>e.name).sort():[];
export const readFixture=(name,dir=FIXTURES)=>({
  name,dir:path.join(dir,name),
  meta:JSON.parse(readFileSync(path.join(dir,name,'meta.json'),'utf8')),
  plain:JSON.parse(readFileSync(path.join(dir,name,'plain.json'),'utf8')),
  vault:JSON.parse(readFileSync(path.join(dir,name,'vault.json'),'utf8'))
});

// ---- browser side: these functions run inside the page --------------------------------------------------------------------------------------------------------------

/** Everything the browser keeps for this origin, as JSON (binary values are tagged and encoded). */
export const dumpInPage=async()=>{
  const b64=u8=>{let s='';for(const b of u8)s+=String.fromCharCode(b);return btoa(s);};
  const enc=v=>{
    if(v===null||typeof v!=='object')return typeof v==='number'&&!Number.isFinite(v)?{$num:String(v)}:v;
    if(v instanceof ArrayBuffer)return {$ab:b64(new Uint8Array(v))};
    if(ArrayBuffer.isView(v))return {$ta:v.constructor.name,b64:b64(new Uint8Array(v.buffer,v.byteOffset,v.byteLength))};
    if(v instanceof Date)return {$date:v.toISOString()};
    if(v instanceof Blob||v instanceof Map||v instanceof Set)throw new Error('The snapshot cannot hold a '+v.constructor.name);
    if(Array.isArray(v))return v.map(enc);
    return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,enc(x)]));
  };
  const out={local:{},session:{},idb:{}};
  for(let i=0;i<localStorage.length;i++)out.local[localStorage.key(i)]=localStorage.getItem(localStorage.key(i));
  for(let i=0;i<sessionStorage.length;i++)out.session[sessionStorage.key(i)]=sessionStorage.getItem(sessionStorage.key(i));
  for(const {name} of await indexedDB.databases()){
    const db=await new Promise((res,rej)=>{const r=indexedDB.open(name);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});
    const spec={version:db.version,stores:{}};
    for(const store of [...db.objectStoreNames]){
      const tx=db.transaction(store),os=tx.objectStore(store);
      const records=await new Promise((res,rej)=>{const rows=[];const c=os.openCursor();c.onsuccess=()=>{const cur=c.result;if(!cur)return res(rows);rows.push({key:enc(cur.key),value:enc(cur.value)});cur.continue();};c.onerror=()=>rej(c.error);});
      spec.stores[store]={keyPath:os.keyPath,autoIncrement:os.autoIncrement,indexes:[...os.indexNames].map(n=>{const ix=os.index(n);return {name:n,keyPath:ix.keyPath,unique:ix.unique,multiEntry:ix.multiEntry};}),records};
    }
    db.close();out.idb[name]=spec;
  }
  return out;
};

/** Put a dump back exactly as it was. Run on a blank page of the same origin, before the app has been opened. */
export const restoreInPage=async(dump)=>{
  const unb64=s=>{const bin=atob(s),u8=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u8[i]=bin.charCodeAt(i);return u8;};
  const dec=v=>{
    if(v===null||typeof v!=='object')return v;
    if(Array.isArray(v))return v.map(dec);
    if('$num' in v)return Number(v.$num);
    if('$ab' in v)return unb64(v.$ab).buffer;
    if('$ta' in v){const u8=unb64(v.b64);return new globalThis[v.$ta](u8.buffer);}
    if('$date' in v)return new Date(v.$date);
    return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,dec(x)]));
  };
  localStorage.clear();sessionStorage.clear();
  for(const {name} of await indexedDB.databases())await new Promise(r=>{const q=indexedDB.deleteDatabase(name);q.onsuccess=q.onerror=q.onblocked=()=>r();});
  for(const [k,v] of Object.entries(dump.local))localStorage.setItem(k,v);
  for(const [k,v] of Object.entries(dump.session))sessionStorage.setItem(k,v);
  for(const [name,spec] of Object.entries(dump.idb)){
    const db=await new Promise((res,rej)=>{
      const r=indexedDB.open(name,spec.version);
      r.onupgradeneeded=()=>{for(const [store,def] of Object.entries(spec.stores)){const os=r.result.createObjectStore(store,{keyPath:def.keyPath??undefined,autoIncrement:def.autoIncrement});for(const ix of def.indexes)os.createIndex(ix.name,ix.keyPath,{unique:ix.unique,multiEntry:ix.multiEntry});}};
      r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);
    });
    for(const [store,def] of Object.entries(spec.stores)){
      await new Promise((res,rej)=>{const tx=db.transaction(store,'readwrite'),os=tx.objectStore(store);for(const rec of def.records){if(def.keyPath!==null)os.put(dec(rec.value));else os.put(dec(rec.value),dec(rec.key));}tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);});
    }
    db.close();
  }
};

/** What the app itself reads back: every stored value of the kinds a person keeps or chose, and every document, through the app's own storage layer. */
export const probeInPage=async()=>{
  const base=window.plcApp.moduleBase();
  const [{appLocal,appSession},{KEY_CLASSES},{docStore}]=await Promise.all([import(base+'chat/vault/vault-store.mjs'),import(base+'chat/vault/key-classes.mjs'),import(base+'chat/documents/doc-store.mjs')]);
  const out={local:{},session:{},docs:[]};
  for(const [key,info] of Object.entries(KEY_CLASSES)){
    if(!['user','setting'].includes(info.class))continue;
    const store=info.store==='local'?appLocal:appSession;
    const v=store.getItem(key);if(v!==null)out[info.store][key]=v;
  }
  out.docs=(await docStore.all()).filter(d=>!d.temporary);
  return out;
};

// ---- node side ----------------------------------------------------------------------------------------------------------------------------------------------------------------

const parse=t=>{try{return JSON.parse(t);}catch{return t;}};
/** The content of a probe, reduced to what must survive an upgrade. The projection is versioned so it can grow without invalidating old fixtures. */
export const PROJECTION=1;
export function project(probe){
  const out={projection:PROJECTION,local:{},session:{},docs:[]};
  for(const [k,v] of Object.entries(probe.local))out.local[k]=parse(v);
  for(const [k,v] of Object.entries(probe.session)){
    let value=parse(v);
    if(k==='chatConfig'&&value&&typeof value==='object'){const {endpoint,token,...rest}=value;value=rest;}   // the test provider's address changes every run
    if(k==='chatEndpointTokens')value='(present)';                                                          // API keys are not written into fixtures
    out.session[k]=value;
  }
  out.docs=probe.docs.map(({chunks,embedding,embeddings,vectors,...rest})=>rest).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
  return out;
}

/** The first place where `actual` lacks or changes something in `expected`; extra fields and extra list entries in `actual` are fine only where noted. null means it holds. */
export function mismatch(expected,actual,at='$'){
  if(expected===null||typeof expected!=='object')return Object.is(expected,actual)||(typeof expected==='number'&&expected===actual)?null:`${at}: expected ${JSON.stringify(expected)}, found ${JSON.stringify(actual)}`;
  if(actual===null||typeof actual!=='object')return `${at}: expected ${Array.isArray(expected)?'a list':'an object'}, found ${JSON.stringify(actual)}`;
  if(Array.isArray(expected)){
    if(!Array.isArray(actual))return `${at}: expected a list`;
    if(expected.length!==actual.length)return `${at}: expected ${expected.length} entries, found ${actual.length}`;
    for(let i=0;i<expected.length;i++){const m=mismatch(expected[i],actual[i],`${at}[${i}]`);if(m)return m;}
    return null;
  }
  for(const k of Object.keys(expected)){
    if(!(k in actual))return `${at}.${k}: missing`;
    const m=mismatch(expected[k],actual[k],`${at}.${k}`);if(m)return m;
  }
  return null;
}
