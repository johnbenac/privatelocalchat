import test from 'node:test';
import assert from 'node:assert/strict';
import {guessPrivate} from '../chat/connection/private-mode.mjs';

const IPHONE='Mozilla/5.0 (iPhone; CPU iPhone OS 18_6_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';
const MAC='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15';
const CHROME='Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
const CHROME_IOS='Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1';
const FIREFOX='Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0';

test('a normal Safari window is not private: everything works',()=>{
  assert.equal(guessPrivate({userAgent:IPHONE,opfs:true,idbBlob:true,serviceWorker:'ok'}).state,'no');
  assert.equal(guessPrivate({userAgent:MAC,opfs:true,idbBlob:true,serviceWorker:'ok'}).state,'no');
});

test('what the iPhone 11 Pro private tab did (file storage refused, no service worker) is "likely private"',()=>{
  const g=guessPrivate({userAgent:IPHONE,opfs:false,idbBlob:null,serviceWorker:'missing'});
  assert.equal(g.state,'likely');assert.deepEqual(g.reasons,['file-storage-refused','no-service-worker']);
});

test('the Safari automation session and Playwright WebKit (no OPFS, no Blob in IndexedDB) look private, which is what they are',()=>{
  assert.equal(guessPrivate({userAgent:IPHONE,opfs:false,idbBlob:false,serviceWorker:'ok'}).state,'likely');
  assert.equal(guessPrivate({userAgent:MAC,opfs:null,idbBlob:false,serviceWorker:'ok'}).state,'likely');
});

test('one strong sign is likely, a missing service worker alone is only possible (Lockdown Mode does that too)',()=>{
  assert.equal(guessPrivate({userAgent:IPHONE,opfs:false,idbBlob:true,serviceWorker:'ok'}).state,'likely');
  assert.equal(guessPrivate({userAgent:IPHONE,opfs:true,idbBlob:true,serviceWorker:'missing'}).state,'possible');
  assert.equal(guessPrivate({userAgent:IPHONE,opfs:true,idbBlob:true,serviceWorker:'failed'}).state,'possible');
});

test('unknown (null) is never taken as a sign',()=>{
  assert.equal(guessPrivate({userAgent:IPHONE}).state,'no');
  assert.equal(guessPrivate({userAgent:IPHONE,opfs:null,idbBlob:null,serviceWorker:null}).state,'no');
});

test('Chrome keeps working in incognito: only a small quota or refused storage is a hint, and never more than possible',()=>{
  assert.equal(guessPrivate({userAgent:CHROME,opfs:true,quotaBytes:34e9}).state,'no');
  assert.deepEqual(guessPrivate({userAgent:CHROME,opfs:true,quotaBytes:120e6}),{state:'possible',reasons:['small-storage-quota']});
  assert.equal(guessPrivate({userAgent:CHROME,opfs:false,quotaBytes:34e9}).state,'possible');
  assert.equal(guessPrivate({userAgent:CHROME_IOS,opfs:true,idbBlob:true,serviceWorker:'ok'}).state,'no','Chrome on iPhone is not judged by Safari\'s rules');
});

test('Firefox private windows have no service worker; that is a hint at most',()=>{
  assert.equal(guessPrivate({userAgent:FIREFOX,serviceWorker:'missing'}).state,'possible');
  assert.equal(guessPrivate({userAgent:FIREFOX,serviceWorker:'ok',idbBlob:true}).state,'no');
});
