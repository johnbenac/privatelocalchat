import test from 'node:test';
import assert from 'node:assert/strict';
import {createVault,toB64} from '../chat/vault/vault.mjs';
import {createMemoryAdapter} from '../chat/vault/vault-db.mjs';
import {createPasskeyWrap,unlockWithPasskey,passkeyMessage,passkeySupported} from '../chat/vault/passkey.mjs';

// A fake authenticator: it holds a secret per credential and answers the PRF extension with HMAC(secret, salt), the way real authenticators derive theirs.
function fakeAuthenticator({prfAtCreate=true,prf=true,cancel=false}={}){
  const creds=new Map();let prompts=0;
  const hmac=async(secret,salt)=>new Uint8Array(await crypto.subtle.sign('HMAC',await crypto.subtle.importKey('raw',secret,{name:'HMAC',hash:'SHA-256'},false,['sign']),salt));
  const result=(id,salt,withResults)=>({rawId:id.buffer,getClientExtensionResults:()=>prf?{prf:withResults?{enabled:true,results:{first:null}}:{}}:{}});
  return {prompts:()=>prompts,
    async create({publicKey}){
      prompts++;if(cancel)throw Object.assign(new Error('x'),{name:'NotAllowedError'});
      const id=crypto.getRandomValues(new Uint8Array(16)),secret=crypto.getRandomValues(new Uint8Array(32));creds.set(toB64(id),secret);
      const salt=new Uint8Array(publicKey.extensions.prf.eval.first);
      const first=prfAtCreate&&prf?await hmac(secret,salt):undefined;
      return {rawId:id.buffer,getClientExtensionResults:()=>prf?{prf:{enabled:true,...(first?{results:{first:first.buffer}}:{})}}:{}};
    },
    async get({publicKey}){
      prompts++;if(cancel)throw Object.assign(new Error('x'),{name:'NotAllowedError'});
      const id=toB64(new Uint8Array(publicKey.allowCredentials[0].id));const secret=creds.get(id);
      if(!secret)throw Object.assign(new Error('no'),{name:'NotAllowedError'});
      const first=prf?await hmac(secret,new Uint8Array(publicKey.extensions.prf.eval.first)):undefined;
      return {getClientExtensionResults:()=>({prf:first?{results:{first:first.buffer}}:{}})};
    }};
}
const FAST=1000;
const mk=async()=>{const adapter=createMemoryAdapter(),vault=createVault({adapter});const s=await vault.create('pw',{iterations:FAST});await s.setKv('k','v');return {adapter,vault,s};};

for(const prfAtCreate of [true,false])
test(`a passkey unlocks the vault (secret ${prfAtCreate?'returned at creation':'returned on the second prompt'})`,async()=>{
  const {vault,s,adapter}=await mk();const auth=fakeAuthenticator({prfAtCreate});
  const wrap=await createPasskeyWrap({dekBytes:s.dekBytes(),wrapWithSecret:vault.wrapWithSecret,credentials:auth,rpId:'privatelocal.chat',random:n=>crypto.getRandomValues(new Uint8Array(n))});
  await s.addWrap(wrap);s.lock();
  assert.equal(auth.prompts(),prfAtCreate?1:2);
  const header=await adapter.readHeader();
  const opened=await unlockWithPasskey({vault,header,credentials:auth,rpId:'privatelocal.chat'});
  assert.equal(opened.state.kv.get('k'),'v');
  // the passphrase still works beside it
  assert.ok(await vault.unlock('pw'));
});

test('the stored wrap holds no secret: the header has the credential id and salt, the sealed key, nothing that opens it',async()=>{
  const {vault,s,adapter}=await mk();const auth=fakeAuthenticator();
  const wrap=await createPasskeyWrap({dekBytes:s.dekBytes(),wrapWithSecret:vault.wrapWithSecret,credentials:auth,rpId:'x.test'});
  await s.addWrap(wrap);
  const header=await adapter.readHeader();const dek=Buffer.from(s.dekBytes()).toString('base64');
  assert.ok(!JSON.stringify(header).includes(dek));
  assert.deepEqual(Object.keys(header.wraps.find(w=>w.type==='passkey')).sort(),['createdAt','credentialId','data','id','iv','label','rpId','salt','type'].sort());
});

test('a device without PRF is refused and nothing is stored',async()=>{
  const {vault,s}=await mk();const auth=fakeAuthenticator({prf:false});
  await assert.rejects(()=>createPasskeyWrap({dekBytes:s.dekBytes(),wrapWithSecret:vault.wrapWithSecret,credentials:auth,rpId:'x.test'}),e=>e.code==='no-prf');
  assert.equal(s.header.wraps.length,1);
});

test('a cancelled prompt leaves the vault locked with a plain sentence',async()=>{
  const {vault,s,adapter}=await mk();const good=fakeAuthenticator();
  await s.addWrap(await createPasskeyWrap({dekBytes:s.dekBytes(),wrapWithSecret:vault.wrapWithSecret,credentials:good,rpId:'x.test'}));
  const header=await adapter.readHeader();
  const err=await unlockWithPasskey({vault,header,credentials:fakeAuthenticator({cancel:true}),rpId:'x.test'}).catch(e=>e);
  assert.match(err.message,/cancelled or not recognised/);
});

test('another address cannot use the passkey; another authenticator cannot open it; no passkey says so',async()=>{
  const {vault,s,adapter}=await mk();const auth=fakeAuthenticator();
  await s.addWrap(await createPasskeyWrap({dekBytes:s.dekBytes(),wrapWithSecret:vault.wrapWithSecret,credentials:auth,rpId:'privatelocal.chat'}));
  const header=await adapter.readHeader();
  await assert.rejects(()=>unlockWithPasskey({vault,header,credentials:auth,rpId:'dev.privatelocal.chat'}),e=>e.code==='no-passkey');
  await assert.rejects(()=>unlockWithPasskey({vault,header,credentials:fakeAuthenticator(),rpId:'privatelocal.chat'}),/cancelled or not recognised|did not unlock/);
  const bare=(await mk());
  const bareHeader=await bare.adapter.readHeader();
  await assert.rejects(()=>unlockWithPasskey({vault:bare.vault,header:bareHeader,credentials:auth,rpId:'x'}),e=>e.code==='no-passkey');
});

test('removing a passkey leaves the passphrase; the passphrase wrap itself cannot be removed',async()=>{
  const {vault,s}=await mk();const auth=fakeAuthenticator();
  const wrap=await createPasskeyWrap({dekBytes:s.dekBytes(),wrapWithSecret:vault.wrapWithSecret,credentials:auth,rpId:'x.test'});
  await s.addWrap(wrap);assert.equal(s.header.wraps.length,2);
  await s.removeWrap(wrap.id);assert.equal(s.header.wraps.length,1);
  await assert.rejects(()=>s.removeWrap(s.header.wraps[0].id),e=>e.code==='last-passphrase');
});

test('messages are plain sentences; support detection needs the browser pieces',()=>{
  for(const e of [{code:'no-prf'},{name:'NotAllowedError'},{name:'InvalidStateError'},{name:'SecurityError'},{code:'bad-key'},{code:'no-passkey'}])assert.ok(passkeyMessage(e).length>20);
  assert.equal(passkeySupported({}),false);
  assert.equal(passkeySupported({PublicKeyCredential:function(){},navigator:{credentials:{create(){},get(){}}}}),true);
});
