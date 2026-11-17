import {launch,assert} from './harness.mjs';
// Nothing in the app uses the browser's own confirm / alert / prompt boxes: they cannot be styled, and some embedded browsers drop them. Every question, message and
// "copy this" fallback is the page's own dialog. Any native dialog during this test fails it.
const h=await launch({port:19440});
const {page}=h;
const ok=n=>console.log('PASS',n);
let native=[];page.on('dialog',d=>{native.push(d.type()+': '+d.message());d.dismiss();});
const dialog=()=>page.locator('.app-dialog');
const openData=async()=>{await page.evaluate(()=>window.plcShell.openSettings('data'));await page.waitForSelector('#clearHistoryBtn');};
try{
 await page.waitForFunction(()=>!document.querySelector('#messageInput').disabled);
 await page.fill('#messageInput','a message to delete');await page.click('#sendBtn');
 await page.waitForFunction(()=>/Response complete/.test(document.querySelector('#generationStatus').textContent));
 // delete all chat history: asks in the page's dialog; Cancel keeps it, the red button deletes it
 await openData();await page.click('#clearHistoryBtn');await dialog().waitFor();
 assert(/Delete all chat history/.test(await dialog().innerText())&&/cannot be undone/.test(await dialog().innerText()),'the question is in the page\'s own dialog');
 await dialog().locator('button',{hasText:'Cancel'}).click();await dialog().waitFor({state:'detached'});
 assert(await page.evaluate(()=>JSON.parse(localStorage.getItem('chatThreads')||'[]').length>0),'Cancel keeps the chats');
 await page.click('#clearHistoryBtn');await dialog().waitFor();await dialog().locator('button',{hasText:'Delete everything'}).click();
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('chatThreads')||'[]').length===0);
 ok('delete all chat history');
 // reset settings
 await page.keyboard.press('Escape');await openData();
 await page.click('#clearSettingsBtn');await dialog().waitFor();
 assert(/Reset all settings/.test(await dialog().innerText()),'reset asks first');
 await dialog().locator('button',{hasText:'Cancel'}).click();await dialog().waitFor({state:'detached'});
 assert(await page.evaluate(()=>Boolean(JSON.parse(sessionStorage.getItem('chatConfig')||'{}').endpoint)),'Cancel keeps the settings');
 await page.click('#clearSettingsBtn');await dialog().waitFor();await dialog().locator('button',{hasText:'Reset settings'}).click();
 await page.waitForFunction(()=>{try{return !JSON.parse(sessionStorage.getItem('chatConfig')||'{}').endpoint;}catch{return true;}});
 ok('reset all settings');
 // copying a token when the browser refuses: a box with the text selected, not window.prompt
 await page.reload();await page.waitForFunction(()=>!document.querySelector('#messageInput').disabled);
 await page.waitForFunction(()=>window.plcShell);await page.evaluate(()=>window.plcShell.openSettings('models'));await page.evaluate(()=>window.localModels.setMode('api'));
 await page.waitForSelector('#tokenInput');await page.fill('#tokenInput','sk-test-token-123');
 await page.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>Promise.reject(new Error('blocked'))}});});
 await page.click('#copyTokenBtn');await dialog().waitFor();
 assert(/Copy your API token/.test(await dialog().innerText())&&(await dialog().locator('textarea').inputValue())==='sk-test-token-123','the token is shown to copy by hand');
 await dialog().locator('button',{hasText:'Close'}).click();
 ok('copy fallback');
 // removing a model asks in the page's dialog too (Settings > Models, Details and repair)
 await page.evaluate(()=>window.localModels.setMode('local'));await page.waitForSelector('#advancedModels');
 await page.evaluate(()=>{document.querySelector('#advancedModels').open=true;});
 await page.locator('#advancedModels button',{hasText:'Remove this download'}).click();await dialog().waitFor();
 assert(/Remove this download/.test(await dialog().innerText()),'removing a download asks first');
 await dialog().locator('button',{hasText:'Cancel'}).click();
 ok('remove a model asks in the page');
 assert(native.length===0,'no native dialog was ever shown: '+JSON.stringify(native));
 assert(h.errors.length===0,'no page errors: '+h.errors.join('|'));
 console.log('dialogs e2e passed');
}catch(e){console.error(e);console.error(native,h.errors);process.exitCode=1;}finally{await h.close();}
