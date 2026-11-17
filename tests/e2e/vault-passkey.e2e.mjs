// Unlocking the vault with a passkey (Face ID / Touch ID in a real browser), driven by Chromium's virtual platform authenticator: no person involved
// (docs/ENCRYPTION-AT-REST-PLAN.md, step 5.3). The real Face ID check on a phone is step 5.4.
//   node scripts/e2e.mjs vault-passkey
import {launch,assert} from './harness.mjs';
const ok=n=>console.log('PASS '+n);
const h=await launch({port:18422});
const {context}=h;let page=h.page;
const ready=async()=>{await page.waitForSelector('#messageInput');await page.waitForFunction(()=>window.__plcBooted===true&&Boolean(window.plcShell),null,{timeout:20000});await page.waitForFunction(()=>!document.querySelector('#messageInput').disabled);};
const openSettings=async section=>{if(!await page.locator('#settingsPage').isVisible()){await page.click('button[aria-label="This device menu"]');await page.click('.shell-pop-row:has-text("Settings")');}await page.click(`.settings-nav-item[data-section="${section}"]`);};
const closeSettings=async()=>{if(await page.locator('#settingsPage').isVisible())await page.click('button[aria-label="Close settings"]');};
const origin=h.origin.replace('127.0.0.1','localhost'); // a passkey needs a domain name, not an IP address
let cdp,authenticatorId;
const authenticator=async(options)=>{
 cdp=await context.newCDPSession(page);await cdp.send('WebAuthn.enable');
 ({authenticatorId}=await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',ctap2Version:'ctap2_1',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true,...options}}));
};
try{
 await page.goto(origin+'/');await ready();
 await page.fill('#messageInput','hello '+'PASSKEY-MARK');await page.click('#sendBtn');
 await page.waitForFunction(()=>/^Response complete/.test(document.querySelector('#generationStatus').textContent),null,{timeout:20000});
 await authenticator({hasPrf:true});

 // turn the vault on, then add the passkey from the Encryption dialog
 await openSettings('security');await page.click('.set-row:has-text("App lock") button');
 await page.fill('#lockNew1','pass one');await page.fill('#lockNew2','pass one');await page.check('#lockEncrypt');await page.click('.app-dialog button:has-text("Lock the app")');
 await page.waitForSelector('.app-dialog:has-text("Remove the unencrypted copy")',{timeout:30000});await page.click('.app-dialog button:has-text("Remove it")');
 await page.waitForFunction(()=>!localStorage.getItem('chatThreads'));
 await openSettings('security');await page.click('.set-row:has-text("App lock") button');
 await page.waitForSelector('#addPasskey');await page.click('#addPasskey');
 await page.waitForFunction(()=>/unlock with Face ID or Touch ID/.test(document.body.innerText),null,{timeout:20000});
 const creds=(await cdp.send('WebAuthn.getCredentials',{authenticatorId})).credentials;
 assert(creds.length===1,'the authenticator holds one credential');
 await page.click('.app-dialog button:has-text("Save")');await page.waitForSelector('.app-dialog',{state:'detached'});
 ok('a passkey is added from Settings');

 // a new visit: the passkey button unlocks without typing
 await closeSettings();await page.reload();
 await page.waitForSelector('#lockScreen',{state:'visible'});
 await page.waitForSelector('#unlockPasskey',{state:'visible'});
 await page.click('#unlockPasskey');
 await page.waitForSelector('#lockScreen',{state:'hidden'});await ready();
 await page.waitForFunction(()=>[...document.querySelectorAll('.message.user')].some(n=>n.textContent.includes('PASSKEY-MARK')),null,{timeout:15000}); // the chat is there after unlocking with the passkey
 ok('unlock with the passkey');

 // the passphrase still works
 await page.reload();await page.waitForSelector('#lockScreen',{state:'visible'});
 await page.fill('#unlockPass','pass one');await page.press('#unlockPass','Enter');await page.waitForSelector('#lockScreen',{state:'hidden'});await ready();
 ok('the passphrase still unlocks');

 // not recognised: the vault stays locked and says so
 await page.reload();await page.waitForSelector('#unlockPasskey',{state:'visible'});
 await cdp.send('WebAuthn.setUserVerified',{authenticatorId,isUserVerified:false});
 await page.click('#unlockPasskey');
 await page.waitForFunction(()=>/cancelled or not recognised|did not work|Type your passphrase/.test(document.querySelector('#lockScreen [role=alert]').textContent),null,{timeout:20000});
 assert(await page.locator('#lockScreen').isVisible(),'still locked');
 await cdp.send('WebAuthn.setUserVerified',{authenticatorId,isUserVerified:true});
 ok('not recognised leaves it locked, with a plain sentence');

 // a device that cannot do PRF is refused when adding, and nothing is stored
 await page.fill('#unlockPass','pass one');await page.press('#unlockPass','Enter');await page.waitForSelector('#lockScreen',{state:'hidden'});await ready();
 await cdp.send('WebAuthn.removeVirtualAuthenticator',{authenticatorId});
 await authenticator({hasPrf:false});
 await openSettings('security');await page.click('.set-row:has-text("App lock") button');
 await page.waitForSelector('#addPasskey');await page.click('#addPasskey');
 await page.waitForFunction(()=>/cannot use Face ID|cannot make a passkey|cancelled or not recognised/.test(document.querySelector('.app-dialog [role=alert]').textContent),null,{timeout:20000});
 ok('a device without PRF is refused with a clear message');
 assert(h.errors.length===0,'no page errors: '+h.errors.join(' | '));
 console.log('vault-passkey e2e: ok');
}catch(e){console.error(e);process.exitCode=1;}
finally{await h.close();}
