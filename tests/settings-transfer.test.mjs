globalThis.location={origin:'https://privatelocal.chat'}; // a transfer link opens the copy that made it: the test copy is the public site
import test from 'node:test';
import assert from 'node:assert/strict';
import {TRANSFER_FORMAT,TOKEN_SUITE,PBKDF2_ITERATIONS,MAX_ENCODED_LENGTH,MAX_JSON_BYTES,createTransfer,readEnvelope,readTransferFragment,readTransferText,readConfigFile,readLegacyQuery,readIncoming,unlockToken,endpointIdentity,sameDestination,tokenBelongsTo,pickSettings,toBase64Url,fromBase64Url,authenticatedData} from '../chat/transfer/settings-transfer.mjs';
const SETTINGS={endpoint:'https://provider.example/v1?tenant=a',model:'big-model',theme:'dark'};
const TOKEN='sk-synthetic-token-0123456789';
const make=(over={})=>createTransfer({settings:SETTINGS,includeToken:true,token:TOKEN,password:'correct horse',...over});
const dec=b=>new TextDecoder().decode(b);
test('the package holds readable settings and an encrypted token, in the version 2 layout',async()=>{
 const t=await make();
 assert.deepEqual(Object.keys(t.envelope),['format','settings','protectedToken']);
 assert.equal(t.envelope.format,TRANSFER_FORMAT);assert.deepEqual(t.envelope.settings,SETTINGS);
 const p=t.envelope.protectedToken;
 assert.deepEqual(Object.keys(p),['suite','salt','iv','ciphertext']);assert.equal(p.suite,TOKEN_SUITE);
 assert.equal(fromBase64Url(p.salt).length,16);assert.equal(fromBase64Url(p.iv).length,12);
 assert.equal(fromBase64Url(p.ciphertext).length,new TextEncoder().encode(TOKEN).length+16,'ciphertext carries its 128-bit tag');
 for(const text of [t.url,t.encoded,t.fileText,JSON.stringify(t.envelope),dec(fromBase64Url(t.encoded))]){
  assert.ok(!text.includes(TOKEN),'no plaintext token');assert.ok(!text.includes('correct horse'),'no password');assert.ok(!text.includes(toBase64Url(new TextEncoder().encode(TOKEN))),'no encoded token');
 }
 assert.ok(!/=/.test(t.encoded),'unpadded');assert.match(t.encoded,/^[A-Za-z0-9_-]+$/);
});
test('the link, the file and the QR text are one package, and the link is the public address plus a fragment',async()=>{
 const t=await make();
 assert.equal(t.url,'https://privatelocal.chat/#settings='+t.encoded);
 assert.deepEqual(JSON.parse(dec(fromBase64Url(t.encoded))),t.envelope);
 assert.deepEqual(JSON.parse(t.fileText),t.envelope);
 assert.ok(Object.isFrozen(t)&&Object.isFrozen(t.envelope)&&Object.isFrozen(t.envelope.protectedToken),'an immutable snapshot');
 assert.deepEqual(readTransferText(t.fileText).settings,readTransferFragment(t.encoded).settings);
});
test('only endpoint, model and theme are ever included, and a token only when asked',async()=>{
 const t=await createTransfer({settings:{...SETTINGS,token:TOKEN,apiKey:'x',evil:{a:1}},includeToken:false});
 assert.deepEqual(Object.keys(t.envelope),['format','settings']);assert.deepEqual(t.envelope.settings,SETTINGS);assert.equal(t.includesToken,false);
 assert.ok(!t.fileText.includes(TOKEN));
 const none=await createTransfer({settings:{endpoint:'https://a.example',model:'m',theme:''}});
 assert.deepEqual(none.envelope.settings,{endpoint:'https://a.example',model:'m'},'a theme that is not set is left out');
 assert.deepEqual(pickSettings({endpoint:' https://a.example ',model:' m ',theme:'purple'}),{endpoint:'https://a.example',model:'m',theme:''});
 await assert.rejects(createTransfer({settings:SETTINGS,includeToken:true,token:'  ',password:'x'}),{code:'no-token'});
 await assert.rejects(createTransfer({settings:{endpoint:'',model:'m'},includeToken:true,token:TOKEN,password:'x'}),{code:'no-endpoint'});
});
test('every password string is taken exactly as entered, including 1234, one character, spaces, Unicode and nothing at all',async()=>{
 const composed='café',decomposed='café';
 for(const password of ['1234','x',' ','   ','\t','','Password','\u{1F511}pass',composed,decomposed,'密码']){
  const t=await make({password});
  const got=await unlockToken(readTransferFragment(t.encoded).envelope,password);
  assert.equal(got,TOKEN,JSON.stringify(password));
 }
 const t=await make({password:composed});const env=readTransferFragment(t.encoded).envelope;
 await assert.rejects(unlockToken(env,decomposed),{code:'bad-password'},'composed and decomposed are different passwords');
 await assert.rejects(unlockToken(env,composed+' '),{code:'bad-password'},'whitespace counts');
 await assert.rejects(unlockToken(env,'CAFÉ'),{code:'bad-password'},'case counts');
 await assert.rejects(unlockToken(env,''),{code:'bad-password'});
});
test('the cryptographic suite is the one that was promised, checked with an independent implementation',async()=>{
 const spy=[];const subtle=globalThis.crypto.subtle;const derive=subtle.deriveKey;
 subtle.deriveKey=function(algo,base,derived,extractable,usages){spy.push({algo,derived,extractable});return derive.call(this,algo,base,derived,extractable,usages);};
 let t;try{t=await make({password:'p w'});}finally{subtle.deriveKey=derive;}
 assert.equal(spy.length,1);assert.equal(spy[0].algo.name,'PBKDF2');assert.equal(spy[0].algo.iterations,600000);assert.equal(PBKDF2_ITERATIONS,600000);assert.equal(spy[0].algo.hash,'SHA-256');assert.equal(spy[0].algo.salt.length,16);
 assert.equal(spy[0].derived.name,'AES-GCM');assert.equal(spy[0].derived.length,256);assert.equal(spy[0].extractable,false,'a non-extractable key');
 const p=t.envelope.protectedToken;
 const material=await subtle.importKey('raw',new TextEncoder().encode('p w'),'PBKDF2',false,['deriveKey']);
 const key=await subtle.deriveKey({name:'PBKDF2',salt:fromBase64Url(p.salt),iterations:600000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['decrypt']);
 const aad=new TextEncoder().encode(JSON.stringify([TRANSFER_FORMAT,TOKEN_SUITE,'https://provider.example/v1?tenant=a','big-model','dark']));
 const plain=await subtle.decrypt({name:'AES-GCM',iv:fromBase64Url(p.iv),additionalData:aad,tagLength:128},key,fromBase64Url(p.ciphertext));
 assert.equal(dec(plain),TOKEN);
 assert.deepEqual(authenticatedData(TRANSFER_FORMAT,TOKEN_SUITE,SETTINGS.endpoint,SETTINGS.model,SETTINGS.theme),aad);
 const u=await make({password:'p w'});assert.notEqual(u.envelope.protectedToken.salt,p.salt);assert.notEqual(u.envelope.protectedToken.iv,p.iv);
});
test('a wrong password, changed ciphertext or changed authenticated settings never yield the token, and ordinary settings still import',async()=>{
 const t=await make();const parsed=readTransferFragment(t.encoded);
 assert.equal(parsed.ok,true);assert.equal(parsed.token.state,'locked');assert.deepEqual(parsed.settings,SETTINGS);
 await assert.rejects(unlockToken(parsed.envelope,'wrong'),{code:'bad-password'});
 const e=t.envelope,flip=s=>s.slice(0,-2)+(s.at(-2)==='A'?'B':'A')+s.at(-1);
 const variants={
  ciphertext:{...e,protectedToken:{...e.protectedToken,ciphertext:flip(e.protectedToken.ciphertext)}},
  endpointPath:{...e,settings:{...e.settings,endpoint:'https://provider.example/v2?tenant=a'}},
  endpointQuery:{...e,settings:{...e.settings,endpoint:'https://provider.example/v1?tenant=b'}},
  endpointHost:{...e,settings:{...e.settings,endpoint:'https://evil.example/v1?tenant=a'}},
  model:{...e,settings:{...e.settings,model:'other'}},
  theme:{...e,settings:{...e.settings,theme:'light'}},
 };
 for(const [name,v] of Object.entries(variants)){
  const r=readEnvelope(v);assert.equal(r.ok,true,name+': the readable settings are still reviewable');
  await assert.rejects(unlockToken(r.envelope,'correct horse'),{code:'bad-password'},name);
 }
 const same=readEnvelope({...e,settings:{...e.settings,endpoint:'https://provider.example/v1/chat/completions/?tenant=a'}});
 assert.equal(await unlockToken(same.envelope,'correct horse'),TOKEN,'trailing slash and /chat/completions are the same destination');
});
test('a damaged or unsupported token package leaves valid settings importable',()=>{
 const base={format:TRANSFER_FORMAT,settings:{endpoint:'https://a.example/v1',model:'m'}};
 const good={suite:TOKEN_SUITE,salt:toBase64Url(new Uint8Array(16)),iv:toBase64Url(new Uint8Array(12)),ciphertext:toBase64Url(new Uint8Array(40))};
 const cases={
  suite:[{...good,suite:'aes-from-the-future/9'},'unsupported'],
  shortSalt:[{...good,salt:toBase64Url(new Uint8Array(8))},'damaged'],
  longIv:[{...good,iv:toBase64Url(new Uint8Array(13))},'damaged'],
  tagOnly:[{...good,ciphertext:toBase64Url(new Uint8Array(16))},'damaged'],
  notBase64:[{...good,ciphertext:'***'},'damaged'],
  padded:[{...good,salt:good.salt+'=='},'damaged'],
  wrongType:[{...good,iv:5},'damaged'],
  notObject:['text','damaged'],
 };
 for(const [name,[token,state]] of Object.entries(cases)){
  const r=readEnvelope({...base,protectedToken:token});
  assert.equal(r.ok,true,name);assert.equal(r.token.state,state,name);assert.deepEqual(r.settings,{endpoint:'https://a.example/v1',model:'m',theme:''},name);
 }
 assert.equal(readEnvelope({...base,protectedToken:good}).token.state,'locked');
 assert.equal(readEnvelope(base).token.state,'absent');
 assert.equal(readEnvelope({format:TRANSFER_FORMAT,settings:{endpoint:'',model:'m'},protectedToken:good}).token.state,'damaged','a token with no destination cannot be authenticated');
 for(const bad of [null,[],'x',{format:'something-else'},{format:'plc-settings-transfer/3',settings:{}},{format:TRANSFER_FORMAT},{format:TRANSFER_FORMAT,settings:{endpoint:5,model:'m'}},{format:TRANSFER_FORMAT,settings:{endpoint:'javascript:alert(1)',model:'m'}},{format:TRANSFER_FORMAT,settings:{endpoint:'https://u:p@a.example',model:'m'}},{format:TRANSFER_FORMAT,settings:{endpoint:'https://a.example',model:'m',theme:'neon'}}])assert.equal(readEnvelope(bad).ok,false,JSON.stringify(bad));
 assert.equal(readEnvelope({format:'plc-settings-transfer/1',settings:{}}).code,'unsupported-version');
});
test('size limits are enforced before decoding and apply to links and files alike',()=>{
 const huge='A'.repeat(MAX_ENCODED_LENGTH+1);
 assert.equal(readTransferFragment(huge).code,'too-large');
 const realAtob=globalThis.atob;let decoded=false;globalThis.atob=(...a)=>{decoded=true;return realAtob(...a);};
 try{readTransferFragment(huge);}finally{globalThis.atob=realAtob;}
 assert.equal(decoded,false,'nothing was decoded');
 assert.equal(readTransferText('{"format":"'+TRANSFER_FORMAT+'","settings":{"endpoint":"","model":"'+'x'.repeat(MAX_JSON_BYTES)+'"}}').code,'too-large');
 assert.equal(readTransferFragment('!!!').code,'malformed');assert.equal(readTransferFragment('abcde').code,'malformed','a length that cannot be Base64URL');
 assert.equal(readTransferFragment(toBase64Url(new TextEncoder().encode('not json'))).code,'malformed');
 assert.equal(readTransferFragment(toBase64Url(new Uint8Array([0xff,0xfe]))).code,'malformed','invalid UTF-8');
});
test('endpoint identity keeps path and query and refuses what is not a plain web address',()=>{
 assert.equal(endpointIdentity('https://Provider.example:443/v1/'),'https://provider.example/v1');
 assert.equal(endpointIdentity('https://provider.example/v1/chat/completions'),'https://provider.example/v1');
 assert.equal(endpointIdentity('https://provider.example/v1?tenant=a&x=1#frag'),'https://provider.example/v1?tenant=a&x=1');
 assert.equal(endpointIdentity('http://localhost:1234/v1'),'http://localhost:1234/v1');
 for(const bad of ['','not a url','/relative','ftp://a.example','javascript:alert(1)','https://u:p@a.example/v1',null,5])assert.equal(endpointIdentity(bad),null,String(bad));
 assert.equal(sameDestination('https://a.example/v1','https://a.example/v1/'),true);
 assert.equal(sameDestination('https://a.example/v1?t=a','https://a.example/v1?t=b'),false);
 assert.equal(sameDestination('https://a.example/v1','https://a.example/v2'),false);
 assert.equal(sameDestination('bad','bad'),false);
 assert.equal(tokenBelongsTo({settings:{endpoint:'https://a.example/v1'}},'https://a.example/v1/'),true);
 assert.equal(tokenBelongsTo({settings:{endpoint:'https://a.example/v1'}},'https://b.example/v1'),false);
});
test('links and files from before version 2 are still read, and a version 2 fragment outranks old query fields',async()=>{
 const legacy=toBase64Url(new TextEncoder().encode(JSON.stringify({endpoint:'https://old.example/v1',token:'sk-old',model:'m1',theme:'light'})));
 const a=readLegacyQuery('?settings='+legacy);
 assert.deepEqual(a.settings,{endpoint:'https://old.example/v1',model:'m1',theme:'light'});assert.deepEqual(a.token,{state:'decrypted',value:'sk-old'});assert.equal(a.legacy,true);
 const b=readLegacyQuery('?endpoint=https%3A%2F%2Fq.example%2Fv1&model=m2');assert.equal(b.settings.endpoint,'https://q.example/v1');assert.deepEqual(b.token,{state:'absent'});
 assert.equal(readLegacyQuery('?other=1'),null);
 const file=readConfigFile(JSON.stringify({config:{endpoint:'https://f.example/v1',token:'sk-f',model:'m',theme:'dark'},models:['m','n',5],exportedAt:'x'}));
 assert.equal(file.ok,true);assert.equal(file.source,'legacy-file');assert.deepEqual(file.models,['m','n']);assert.equal(file.token.value,'sk-f');
 assert.equal(readConfigFile(JSON.stringify({endpoint:'https://bare.example',model:'m'})).settings.endpoint,'https://bare.example');
 assert.equal(readConfigFile('{"unrelated":1}').ok,false);assert.equal(readConfigFile('nope').ok,false);
 const t=await make();
 const v2file=readConfigFile(t.fileText);assert.equal(v2file.source,'v2');assert.equal(v2file.token.state,'locked');
 const both=readIncoming({hash:'#settings='+t.encoded,search:'?endpoint=https%3A%2F%2Flegacy.example&token=sk-legacy'});
 assert.equal(both.source,'v2');assert.equal(both.fromFragment,true);assert.equal(both.settings.endpoint,SETTINGS.endpoint);
 const damaged=readIncoming({hash:'#settings=%%%',search:'?endpoint=https%3A%2F%2Flegacy.example'});
 assert.equal(damaged.ok,false);assert.equal(damaged.fromFragment,true,'a damaged fragment is reported, not silently replaced by the old fields');
 assert.equal(readIncoming({hash:'',search:'?endpoint=https%3A%2F%2Flegacy.example'}).source,'legacy-link');
 assert.equal(readIncoming({hash:'#other=1',search:''}),null);
});
