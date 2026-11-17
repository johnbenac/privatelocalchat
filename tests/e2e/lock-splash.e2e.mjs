import {launch,assert} from './harness.mjs';
// The not-locked reminder: when the app opens with no passcode, a short splash says so with a countdown ring and an open padlock to add one; doing nothing drops you
// into the app; adding a passcode (any passphrase) locks it at once and shows the closed padlock; with a passcode the app opens on the closed padlock.
const h=await launch({port:19430,storage:{'plc.lockSplash.v1':'on'}});
const {page}=h;
const ok=n=>console.log('PASS',n);
const splash='#lockSplash';
try{
 // 1. the splash is the first thing, before the app (the harness waited for the app on the first load, so look at a fresh one)
 await page.reload();await page.waitForSelector(splash,{timeout:5000});
 const text=await page.locator(splash).innerText();
 assert(/This app is not locked/.test(text)&&/read your chats/.test(text),'it says the app is not locked and what that means: '+text.slice(0,120));
 assert(/Add a passcode/.test(text)&&/Face ID|fingerprint/.test(text)&&/enough skill/.test(text),'the button and the device-security disclaimer are there');
 assert(await page.locator('#splashAdd .padlock.open').count()===1,'the button is an open padlock');
 const st=await page.evaluate(()=>({inert:document.querySelector('#app').inert,cls:document.documentElement.className,vis:getComputedStyle(document.querySelector('#app')).visibility}));
 assert(st.inert&&/splashing/.test(st.cls)&&st.vis==='hidden','the app waits behind it, out of sight: '+JSON.stringify(st));
 // the ring gives itself back, counterclockwise: the dash offset only grows
 const off=async()=>page.evaluate(()=>Number(getComputedStyle(document.querySelector('.lock-ring-arc')).strokeDashoffset.replace('px','')));
 const a=await off();await page.waitForTimeout(700);const b=await off();
 assert(b>a,'the ring is unfilling: '+a+' -> '+b);
 ok('the splash says the app is not locked, with a countdown ring');
 // 2. doing nothing: it moves on by itself, into the app, and nothing is locked
 await page.waitForSelector(splash,{state:'detached',timeout:6000});
 await page.waitForFunction(()=>!document.querySelector('#app').inert);
 assert(!(await page.evaluate(()=>localStorage.getItem('plc.lock.v1'))),'nothing was locked');
 await page.fill('#messageInput','still works');
 ok('doing nothing drops you into the app');
 // 3. skip is immediate, and "don't remind me again" is remembered
 await page.reload();await page.waitForSelector(splash);await page.click('#splashSkip');await page.waitForSelector(splash,{state:'detached',timeout:2000});
 await page.reload();await page.waitForSelector(splash);await page.click('#splashNever');await page.waitForSelector(splash,{state:'detached',timeout:2000});
 await page.reload();await page.waitForSelector('#messageInput');await page.waitForTimeout(600);
 assert(await page.locator(splash).count()===0,'no reminder after "Don\'t remind me again"');
 await page.evaluate(()=>window.plcShell.openSettings('security'));
 assert(!(await page.locator('#lockReminder').isChecked()),'the Security setting shows it is off');
 await page.locator('#lockReminder').check();await page.keyboard.press('Escape');
 await page.reload();await page.waitForSelector(splash);
 ok('skip, don\'t remind me again, and the setting to turn it back on');
 // 4. add a passcode: any passphrase, even one character; the app locks at once with the closed padlock
 await page.click('#splashAdd');
 await page.waitForSelector('.app-dialog');
 assert(/Choose any passphrase/.test(await page.locator('.app-dialog').innerText())&&/enough skill/.test(await page.locator('.app-dialog').innerText()),'the dialog allows any passphrase and repeats the disclaimer');
 await page.fill('#lockNew1','1');await page.fill('#lockNew2','1');await page.uncheck('#lockEncrypt');await page.click('.app-dialog button:has-text("Lock the app")');
 await page.waitForSelector('#lockScreen',{state:'visible'});
 assert(await page.locator('#lockScreen .padlock.closed').count()===1,'the closed padlock is shown');
 assert(/Passcode set/.test(await page.locator('#lockScreen').innerText()),'it says the passcode is set');
 await page.fill('#unlockPass','2');await page.press('#unlockPass','Enter');
 await page.waitForFunction(()=>/not right/.test(document.querySelector('#lockScreen').innerText));
 await page.fill('#unlockPass','1');await page.press('#unlockPass','Enter');await page.waitForSelector('#lockScreen',{state:'hidden'});
 ok('a one-character passcode locks the app and the closed padlock appears');
 // 5. with a passcode the app opens on the closed padlock, and there is no reminder
 await page.reload();await page.waitForSelector('#lockScreen',{state:'visible'});
 assert(await page.locator(splash).count()===0&&await page.locator('#lockScreen .padlock.closed').count()===1,'a locked app opens on the closed padlock, with no reminder');
 await page.fill('#unlockPass','1');await page.press('#unlockPass','Enter');await page.waitForSelector('#lockScreen',{state:'hidden'});
 ok('a locked app opens on the closed padlock');
 assert(h.errors.length===0,'no page errors: '+h.errors.join('|'));
 console.log('lock-splash e2e passed');
}catch(e){console.error(e);console.error(h.errors);process.exitCode=1;}finally{await h.close();}
