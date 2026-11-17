import test from 'node:test';
import assert from 'node:assert/strict';
import {encryptString,decryptString,isEncryptedBackup,createLock,verifyLock,lockDelaySeconds,toB64,fromB64,BACKUP_FORMAT} from '../chat/crypto.mjs';
const fast={iterations:2000};
test('a backup opens only with its passphrase',async()=>{
 const plain=JSON.stringify({threads:[{title:'Ünïcode 漢字 🦉'}]});
 const env=await encryptString(plain,'correct horse',{...fast,meta:{exportedAt:1}});
 assert.equal(env.format,BACKUP_FORMAT);assert.ok(isEncryptedBackup(env));assert.ok(!env.data.includes('Ünï'));assert.ok(!JSON.stringify(env).includes('漢字'));
 assert.equal(await decryptString(env,'correct horse'),plain);
 await assert.rejects(decryptString(env,'wrong'),e=>e.code==='bad-passphrase');
});
test('a changed file is refused, not half-read',async()=>{
 const env=await encryptString('secret','pw',fast);
 const bytes=fromB64(env.data);bytes[0]^=1;
 await assert.rejects(decryptString({...env,data:toB64(bytes)},'pw'),e=>e.code==='bad-passphrase');
 await assert.rejects(decryptString({...env,meta:{tampered:true}},'pw'),e=>e.code==='bad-passphrase');
 await assert.rejects(decryptString({...env,iterations:1},'pw'),/damaged/);
 await assert.rejects(decryptString({format:'other'},'pw'),/not an encrypted backup/);
 await assert.rejects(encryptString('x',''),/passphrase is required/);
});
test('each encryption uses a fresh salt and nonce',async()=>{
 const a=await encryptString('same','pw',fast),b=await encryptString('same','pw',fast);
 assert.notEqual(a.salt,b.salt);assert.notEqual(a.iv,b.iv);assert.notEqual(a.data,b.data);
});
test('the lock verifies the passphrase without storing it',async()=>{
 const lock=await createLock('open sesame',fast);
 assert.ok(!JSON.stringify(lock).includes('open sesame'));
 assert.equal(await verifyLock(lock,'open sesame'),true);assert.equal(await verifyLock(lock,'Open sesame'),false);assert.equal(await verifyLock({...lock,data:'AAAA'},'open sesame'),false);
 assert.deepEqual([0,4,5,6,7,20].map(lockDelaySeconds),[0,0,2,4,8,60]);
});
test('base64 round trip for large data',()=>{ const big=new Uint8Array(300000).map((_,i)=>i%251); assert.deepEqual(fromB64(toB64(big)),big); });
