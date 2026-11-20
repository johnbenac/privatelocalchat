// Shared by the data capture script and the data upgrade suite (docs/DATA-COMPATIBILITY.md).
//
// A snapshot is everything the browser holds for the app at one moment: local and session storage and every IndexedDB database with its schema and
// records. It is written by the real app in a real browser, restored byte for byte into a fresh browser by a later build, and judged by what the
// person can see: the content projection below, compared so that new fields never matter but missing or changed content always does.
import {readdirSync,readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import path from 'node:path';

export const FIXTURES=fileURLToPath(new URL('../fixtures/data/',import.meta.url));
export const PASSPHRASE='correct horse';

/** The fixture folders, oldest first (their names start with a sequence number). */
export const listFixtures=(dir=FIXTURES)=>existsSync(dir)?readdirSync(dir,{withFileTypes:true}).filter(e=>e.isDirectory()&&!e.name.startsWith('.')).map(e=>e.name).sort():[];   // dot folders are a capture's staging and lock folders (scripts/data-snapshot-output.mjs)
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

// ---- the rich character store: what a snapshot must hold to count as written by a build that writes plc.characters.v1 -----------------------------------------------------------
// Metadata that merely lists the key proves nothing (the capture's meta lists every classified key). A snapshot counts only if the real app's saved characters are in it, whole, and
// the vault copy of the same person holds them with nothing readable at rest. The same function judges a capture before it is written and the committed fixtures afterwards.
export const CHARACTERS_KEY='plc.characters.v1';
const CHARACTER_FILES=fileURLToPath(new URL('../fixtures/characters/',import.meta.url));
const sha256=b=>'sha256:'+createHash('sha256').update(b).digest('hex');
const sameJson=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
/** The authentic producer bundles and resource files the capture admits (tests/fixtures/characters/): name -> {root, resources: [bytes]} */
export function producerCharacters(){
  const root=n=>JSON.parse(readFileSync(path.join(CHARACTER_FILES,'examples',n+'.bundle.json'),'utf8')).root;
  const res=n=>readFileSync(path.join(CHARACTER_FILES,'resources',n));
  return {Pip:{root:root('minimal'),resources:[]},Neri:{root:root('neri'),resources:[res('tide-card.txt'),res('chart.png')]},Bex:{root:root('bex'),resources:[res('cue.wav')]}};
}
/** What is wrong with the characters in a snapshot ({plain, vault} as readFixture or the capture builds them), as a list; empty means it holds actual, whole, protected data. */
export function characterProblems({plain,vault}){
  const bad=[],want=producerCharacters(),state=plain?.expected?.local?.[CHARACTERS_KEY],raw=plain?.storage?.local?.[CHARACTERS_KEY];
  if(typeof raw!=='string'){bad.push('the plain snapshot holds no '+CHARACTERS_KEY+' in browser storage');return bad;}
  let stored;try{stored=JSON.parse(raw);}catch{bad.push('the stored '+CHARACTERS_KEY+' is not JSON');return bad;}
  if(!sameJson(stored,state))bad.push('the plain expected state is not what the browser stored');
  if(!state||state.format!==1||!Number.isInteger(state.revision)||!Array.isArray(state.records)||state.records.length<3){bad.push('the plain state is not a store with at least three records');return bad;}
  if(state.revision<state.records.length)bad.push('the store revision is behind its records');
  const ids=state.records.map(r=>r.individualId);
  if(!ids.every(i=>/^individual:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(i))||new Set(ids).size!==ids.length)bad.push('the records do not have distinct local individual ids');
  for(const [name,info] of Object.entries(want)){
    const r=state.records.find(x=>x.preview?.name===name);
    if(!r){bad.push(name+': no saved record');continue;}
    if(!Number.isInteger(r.recordVersion)||r.recordVersion<1)bad.push(name+': no record version');
    if(r.source?.root!==info.root)bad.push(name+': the stored package fingerprint is not the producer bundle\'s');
    if(!r.preview.instructions||r.preview.instructions.length<8)bad.push(name+': the producer instructions are missing');
    const bytes=new Map((r.source?.bytes||[]).map(b=>[b.hash,b.data]));
    for(const [h,d] of bytes)if(sha256(Buffer.from(d,'base64'))!==h)bad.push(name+': stored bytes do not match their hash '+h);
    for(const b of info.resources)if(bytes.get(sha256(b))!==Buffer.from(b).toString('base64'))bad.push(name+': the exact required resource bytes ('+sha256(b).slice(0,19)+') are not retained');
    if(bytes.size!==info.resources.length)bad.push(name+': it retains '+bytes.size+' resources, expected '+info.resources.length);
  }
  const neri=state.records.find(x=>x.preview?.name==='Neri');
  for(const k of ['lore','guidance','prepared','presentation','media','evidence'])if(!neri?.structured||!neri.structured[k]||JSON.stringify(neri.structured[k]).length<=4)bad.push('Neri: the structured '+k+' is empty');
  if(neri?.structured?.executionReady!==undefined&&neri.structured.executionReady!==false)bad.push('Neri: executionReady is not false');
  // the vault copy: the same characters through the vault, nothing at rest
  const vstate=vault?.expected?.local?.[CHARACTERS_KEY];
  if(!sameJson(vstate,state))bad.push('the vault snapshot\'s expected characters are not the plain ones');
  if(vault?.storage?.local&&CHARACTERS_KEY in vault.storage.local)bad.push('the vault snapshot keeps '+CHARACTERS_KEY+' in plain browser storage');
  if(vault?.storage?.session&&CHARACTERS_KEY in vault.storage.session)bad.push('the vault snapshot keeps '+CHARACTERS_KEY+' in session storage');
  const rest=JSON.stringify(vault?.storage??null);
  const secrets=[...ids,...state.records.map(r=>r.source?.root),'cosmogenitor/bundle',...state.records.map(r=>r.preview.instructions.slice(0,60)),...state.records.flatMap(r=>(r.source?.bytes||[]).map(b=>b.data.slice(0,48)))];
  for(const s of secrets)if(s&&rest.includes(s))bad.push('something readable is left at rest in the vault snapshot: '+String(s).slice(0,40));
  if(!/^\{.*\}$/s.test(rest)||rest.length<200)bad.push('the vault snapshot holds no storage');
  const plainRest=JSON.stringify(plain.storage);
  if(!ids.every(i=>plainRest.includes(i)))bad.push('the plain snapshot lacks its own ids (control)');
  return bad;
}
