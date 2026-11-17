// Builds probe.html, the page that measures how fast the vault's key derivation is on a device and reports what the browser supports (WebAuthn / PRF, IndexedDB durability,
// Web Locks...). It is served from http://localhost or https (the secure context WebCrypto needs) and posts its result to /result on the same server. Nothing here is shipped.
//   node scripts/encryption-probe/build-probe.mjs <out-dir>
import {writeFile,mkdir} from 'node:fs/promises';
import {measureSource} from '../encryption-baseline.mjs';

export const capabilitySource=`async function capabilities(){
  const c={userAgent:navigator.userAgent,platform:navigator.platform||null,secure:isSecureContext,subtle:!!(self.crypto&&crypto.subtle),indexedDB:!!window.indexedDB,webLocks:!!navigator.locks,broadcastChannel:typeof BroadcastChannel!=='undefined',webauthn:!!window.PublicKeyCredential};
  try{c.uvpaa=await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();}catch(e){c.uvpaa='error:'+e.name;}
  try{c.clientCapabilities=PublicKeyCredential.getClientCapabilities?await PublicKeyCredential.getClientCapabilities():'getClientCapabilities is not available';}catch(e){c.clientCapabilities='error:'+e.name;}
  try{c.storagePersisted=await navigator.storage.persisted();const e=await navigator.storage.estimate();c.storageQuotaMB=Math.round(e.quota/1e6);c.storageUsageMB=Math.round(e.usage/1e6);}catch(e){c.storage='error:'+e.name;}
  try{
    const name='plc-probe-'+Math.random().toString(16).slice(2);
    const db=await new Promise((res,rej)=>{const r=indexedDB.open(name,1);r.onupgradeneeded=()=>r.result.createObjectStore('s');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});
    try{const t=db.transaction('s','readwrite',{durability:'strict'});c.idbStrictDurability=t.durability||'accepted';await new Promise(r=>{t.oncomplete=t.onabort=r;});}catch(e){c.idbStrictDurability='error:'+e.name;}
    db.close();indexedDB.deleteDatabase(name);
  }catch(e){c.idb='error:'+e.name;}
  return c;
}`;

export const page=`<!doctype html><meta charset="utf-8"><title>vault probe</title><body style="font:14px system-ui"><pre id="o">running…</pre><script>
${measureSource}
${capabilitySource}
(async()=>{
  const out={at:new Date().toISOString()};
  try{out.capabilities=await capabilities();}catch(e){out.capabilitiesError=String(e);}
  try{out.timing=await measure();}catch(e){out.timingError=String(e);}
  document.getElementById('o').textContent=JSON.stringify(out,null,1);
  try{await fetch('/result',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(out)});}catch(e){document.title='post failed '+e;}
})();
</script>`;

if(import.meta.url===`file://${process.argv[1]}`){
  const dir=process.argv[2];if(!dir){console.error('usage: build-probe.mjs <out-dir>');process.exit(2);}
  await mkdir(dir,{recursive:true});await writeFile(dir+'/probe.html',page);console.log('wrote '+dir+'/probe.html');
}
