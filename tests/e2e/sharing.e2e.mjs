import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {launch,assert} from './harness.mjs';
// Share, Transfer settings and Transfer chats and backups, end to end. Synthetic conversations, endpoints and tokens only.
const PRODUCT='https://privatelocal.chat/';
const h=await launch({init:()=>{
 window.__shared=[];window.__shareMode='ok';
 navigator.canShare=()=>true;
 navigator.share=data=>{window.__shared.push({...data});return window.__shareMode==='cancel'?Promise.reject(Object.assign(new Error('cancelled'),{name:'AbortError'})):Promise.resolve();};
},port:18271});
const {page,context}=h;
const dir=mkdtempSync(join(tmpdir(),'plc-sharing-'));
const ok=name=>console.log('PASS',name);
const api=`http://127.0.0.1:${h.api.port}/v1`;
await context.grantPermissions(['clipboard-read','clipboard-write'],{origin:h.origin});
const ready=()=>page.waitForFunction(()=>!document.querySelector('#messageInput').disabled);
const clip=()=>page.evaluate(()=>navigator.clipboard.readText());
const modules=()=>page.evaluate(()=>`/releases/${window.APP_BUILD.commit}/chat/`);
const makeTransfer=async(opts)=>{const base=await modules();return page.evaluate(async({base,opts})=>{const st=await import(base+'transfer/settings-transfer.mjs');const t=await st.createTransfer(opts);return {encoded:t.encoded,url:t.url,fileText:t.fileText};},{base,opts});};
const tokens=()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('chatEndpointTokens')||'{}'));
let navCount=0;
// a distinct query forces a full page load even when only the fragment differs
const fresh=async url=>{const u=new URL(url);u.searchParams.set('n',String(++navCount));await page.goto(u.toString());await ready();};
const closeDialog=async()=>{await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('.app-dialog'));if(await page.locator('#settingsPage').isVisible())await closeSettings();};
// Navigation the way a person does it: the rail Explore menu, the profile menu, the Settings page.
const phone=()=>page.viewportSize().width<900;
const pickMenu=async label=>{await page.locator('.shell-pop .shell-pop-label',{hasText:label}).first().click();};
const openExplore=async label=>{
 if(phone()){await page.click('button[aria-label="Open sidebar"]');await page.waitForSelector('.sidebar .mobile-only');await page.locator('.sidebar .mobile-only',{hasText:'Explore'}).click();}
 else await page.click('#shellRail .shell-icon-btn[aria-label="Explore"]');
 await pickMenu(label);
};
const openSettings=async section=>{
 if(phone()){await page.click('button[aria-label="Open sidebar"]');await page.waitForSelector('.sidebar .mobile-only');await page.locator('.sidebar .mobile-only',{hasText:'Settings'}).click();}
 else{await page.click('button[aria-label="This device menu"]');await pickMenu('Settings');}
 await page.waitForSelector('#settingsPage:not([hidden])');
 await page.click(`#settingsPage .settings-nav-item[data-section="${section}"]`);
};
const closeSettings=async()=>{await page.click('button[aria-label="Close settings"]');await page.waitForSelector('#settingsPage',{state:'hidden'});};
const openTransferSettings=async()=>{await openSettings('data');await page.click('#transferSettingsBtn');await page.waitForSelector('#transferCreateBtn');};
const openTransferChats=async()=>{await openSettings('data');await page.click('#transferChatsBtn');await page.waitForSelector('#exportChatsBtn');};
const importFile=async(btn,path)=>{const [fc]=await Promise.all([page.waitForEvent('filechooser'),page.click(btn)]);await fc.setFiles(path);};
try{
 await ready();

 // ---- the public Share flow never carries anything private
 await openSettings('models');
 await page.fill('#tokenInput','sk-synthetic-session-token');await page.locator('#tokenInput').blur();
 await closeSettings();
 await page.fill('#messageInput','a private question about my health');await page.click('#sendBtn');
 await page.waitForFunction(()=>/Response complete/.test(document.querySelector('#generationStatus').textContent));
 await openExplore('Share');
 await page.waitForSelector('.app-dialog');
 assert(await page.locator('.app-dialog h2').innerText()==='Share Private Local Chat','the Share dialog has its own title');
 const copyText=await page.locator('.product-share-copy').innerText();
 assert(copyText==='Share Private Local Chat with someone who might find it useful. This shares the public app address. Your conversations and settings stay on your device.','panel copy: '+copyText);
 assert(await page.locator('#productShareBtn').count()===1&&await page.locator('#productCopyBtn').count()===1&&await page.locator('#productQrBtn').count()===1,'Share, Copy link and Show QR code');
 await page.click('#productShareBtn');await page.waitForFunction(()=>window.__shared.length===1);
 const shared=await page.evaluate(()=>window.__shared[0]);
 assert(JSON.stringify(shared)===JSON.stringify({url:PRODUCT,title:'Private Local Chat',text:'Free AI chat in your browser. Run a supported model on your device, or choose an outside provider.'}),'the fixed public payload: '+JSON.stringify(shared));
 await page.click('#productCopyBtn');await page.waitForFunction(()=>/Link copied/.test(document.querySelector('.product-share-status').textContent));
 assert(await clip()===PRODUCT,'Copy link copies the public address');
 await page.click('#productQrBtn');await page.waitForSelector('.product-share-qr:not([hidden]) img, .product-share-qr:not([hidden]) canvas');
 assert((await page.locator('.product-share-destination').innerText())===PRODUCT,'the QR shows its destination');
 // cancelling the share sheet is a finished action, not an error
 await page.evaluate(()=>{window.__shareMode='cancel';});await page.click('#productShareBtn');
 await page.waitForFunction(()=>window.__shared.length===2);
 assert((await page.locator('.product-share-status').innerText()).trim()===''&&await page.locator('#productCopyBtn').isEnabled()&&await page.locator('#productShareBtn').isEnabled(),'usable after cancelling');
 await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('.app-dialog'));
 assert(await page.evaluate(()=>{const a=document.activeElement;return a&&a!==document.body&&a.getBoundingClientRect().width>0;}),'focus returns to something visible, not the page body');
 ok('public share');

 // ---- Transfer settings: one review, one affirmative action, one immutable package for link, QR and file
 await openTransferSettings();
 assert(await page.locator('.app-dialog h2').innerText()==='Transfer settings','its own title');
 const dlg=await page.locator('.app-dialog').innerText();
 assert(dlg.includes('This transfer includes the settings listed below. These settings may contain sensitive information. Anyone with the link, QR code, or settings file can read the listed settings. An included API token is encrypted with your chosen password. Communicate that password separately.'),'the danger notice copy');
 assert(/Endpoint\s+http:\/\/127\.0\.0\.1/.test(dlg)&&/Model\s+fake-model/.test(dlg)&&/API token\s+Omitted/.test(dlg),'review: '+dlg.slice(0,400));
 assert(!dlg.includes('sk-synthetic-session-token'),'the token is never shown');
 assert(await page.locator('#transferPassword').isHidden(),'no password field until the token is included');
 await page.check('#transferIncludeToken');
 assert(/Included and password protected/.test(await page.locator('.app-dialog').innerText())&&await page.locator('#transferPassword').isVisible(),'password field appears with the toggle');
 await page.fill('#transferPassword','');   // a blank password is the password the person chose
 await page.click('#transferCreateBtn');await page.waitForSelector('#transferCopyBtn');
 assert(await page.locator('#transferCopyBtn').isVisible()&&await page.locator('#transferQrBtn').isVisible()&&await page.locator('#transferShareBtn').isVisible()&&await page.locator('#transferFileBtn').isVisible(),'the four outputs');
 await page.click('#transferCopyBtn');
 const link1=await clip();
 assert(link1.startsWith('https://privatelocal.chat/#settings='),'link: '+link1.slice(0,60));
 const [file]=await Promise.all([page.waitForEvent('download'),page.click('#transferFileBtn')]);
 const filePath=join(dir,'settings.json');await file.saveAs(filePath);
 const fileJson=JSON.parse(readFileSync(filePath,'utf8'));
 const fromLink=JSON.parse(Buffer.from(link1.split('#settings=')[1].replace(/-/g,'+').replace(/_/g,'/'),'base64').toString('utf8'));
 assert(JSON.stringify(fileJson)===JSON.stringify(fromLink),'link and file are one package');
 assert(fileJson.format==='plc-settings-transfer/2'&&fileJson.settings.endpoint===api&&fileJson.settings.model==='fake-model'&&fileJson.protectedToken?.suite==='pbkdf2-sha256-aes256gcm/1','version 2 with a protected token');
 assert(!JSON.stringify(fileJson).includes('sk-synthetic-session-token'),'no plaintext token in the package');
 await page.click('#transferQrBtn');await page.waitForSelector('.flow-qr:not([hidden])');
 await page.evaluate(()=>{window.__shared.length=0;});
 await page.click('#transferShareBtn');await page.waitForFunction(()=>window.__shared.length===1);
 assert((await page.evaluate(()=>window.__shared[0].url))===link1,'sharing sends the same snapshot');
 // an edit invalidates it: nothing is offered until it is created again
 await page.uncheck('#transferIncludeToken');
 assert(await page.locator('#transferCopyBtn').isHidden()&&await page.locator('#transferCreateBtn').isVisible(),'the outputs are withdrawn after an edit');
 await page.click('#transferCreateBtn');await page.waitForSelector('#transferCopyBtn');await page.click('#transferCopyBtn');
 const link2=await clip();assert(link2!==link1&&!JSON.parse(Buffer.from(link2.split('#settings=')[1].replace(/-/g,'+').replace(/_/g,'/'),'base64').toString()).protectedToken,'a new package without the token');
 await closeDialog();
 ok('transfer settings');

 // ---- QR capacity: a package too large for a QR code keeps the link and the file
 await page.evaluate(()=>{const c=JSON.parse(sessionStorage.getItem('chatConfig'));c.endpoint='http://127.0.0.1:1/'+'p'.repeat(1900);c.model='m'.repeat(1900);sessionStorage.setItem('chatConfig',JSON.stringify(c));});
 await page.reload();await ready();
 await openTransferSettings();await page.click('#transferCreateBtn');await page.waitForSelector('#transferCopyBtn');
 assert(await page.locator('#transferQrBtn').isHidden()&&/too long for a QR code/.test(await page.locator('.app-dialog').innerText())&&await page.locator('#transferFileBtn').isVisible(),'explained, with link and file still offered');
 await closeDialog();
 ok('qr capacity');

 // ---- receiving: locked token, wrong then right password, pending token, late unlock
 const A=api,B=api+'?tenant=b';
 await page.evaluate(({A})=>{const c=JSON.parse(sessionStorage.getItem('chatConfig'));c.endpoint=A;c.model='fake-model';c.token='';sessionStorage.setItem('chatConfig',JSON.stringify(c));sessionStorage.removeItem('chatEndpointTokens');sessionStorage.removeItem('plc.pendingToken.v1');},{A});
 const locked=await makeTransfer({settings:{endpoint:A,model:'imported-model',theme:'dark'},includeToken:true,token:'sk-synthetic-transferred',password:' Pa55 é '});
 await fresh(h.origin+'/?x=1#settings='+locked.encoded);
 await page.waitForSelector('#importSettingsBtn');
 assert(await page.evaluate(()=>location.hash==='')&&await page.evaluate(()=>!location.href.includes('settings=')),'the consumed fragment is gone from the address bar');
 let review=await page.locator('.app-dialog').innerText();
 assert(/Import these settings/.test(review)&&/imported-model/.test(review)&&/Dark/.test(review)&&/protected with a password/.test(review),'review: '+review.slice(0,300));
 assert(!review.includes('sk-synthetic-transferred'),'no token in the review');
 await page.click('#importSettingsBtn');await page.waitForSelector('#unlockTokenBtn');
 assert((await page.evaluate(()=>JSON.parse(sessionStorage.getItem('chatConfig')).model))==='imported-model','ordinary settings were imported');
 assert(!(await tokens())[A],'no token yet');
 await page.fill('#unlockPassword','wrong');await page.click('#unlockTokenBtn');
 await page.waitForFunction(()=>/Couldn.t unlock the API token. Your other settings are ready./.test(document.querySelector('.app-dialog').innerText));
 assert(await page.locator('#retryUnlockBtn').isVisible()&&await page.locator('#manualTokenBtn').isVisible(),'Try again and Enter an API token manually');
 await page.click('#retryUnlockBtn');
 await page.click('#skipTokenBtn');await page.waitForFunction(()=>!document.querySelector('.app-dialog'));
 assert((await page.evaluate(()=>JSON.parse(sessionStorage.getItem('chatConfig')).model))==='imported-model','still imported after skipping the token');
 await openSettings('data');
 await page.waitForSelector('#unlockPendingBtn');
 assert(/api|127\.0\.0\.1/.test(await page.locator('#pendingTokenRow').innerText())&&await page.locator('#discardPendingBtn').isVisible(),'a pending token waits, with its destination and a Discard action');
 // late unlock after the provider changed: refused until that destination is selected again
 await page.evaluate(({B})=>{const c=JSON.parse(sessionStorage.getItem('chatConfig'));c.endpoint=B;sessionStorage.setItem('chatConfig',JSON.stringify(c));},{B});
 await page.reload();await ready();await openSettings('data');
 await page.click('#unlockPendingBtn');await page.fill('#unlockPassword',' Pa55 é ');await page.click('#unlockTokenBtn');
 await page.waitForFunction(()=>/not the endpoint selected now/.test(document.querySelector('.app-dialog').innerText));
 assert(!(await tokens())[A]&&!(await tokens())[B],'nothing attached to the wrong destination');
 await closeDialog();
 await page.evaluate(({A})=>{const c=JSON.parse(sessionStorage.getItem('chatConfig'));c.endpoint=A;sessionStorage.setItem('chatConfig',JSON.stringify(c));},{A});
 await page.reload();await ready();await openSettings('data');
 await page.click('#unlockPendingBtn');await page.fill('#unlockPassword',' Pa55 é ');await page.click('#unlockTokenBtn');
 await page.waitForFunction(()=>!document.querySelector('.app-dialog'));
 assert((await tokens())[A]==='sk-synthetic-transferred','the correct password attaches the token to its destination');
 assert(await page.locator('#pendingTokenRow').isHidden(),'the pending package is cleared once used');
 ok('locked token, retry, pending, late unlock');

 // ---- an incoming transfer without a token keeps a working token for the same endpoint; a changed authenticated field rejects the token
 const bare=await makeTransfer({settings:{endpoint:A,model:'fake-model',theme:''},includeToken:false});
 await fresh(h.origin+'/#settings='+bare.encoded);await page.waitForSelector('#importSettingsBtn');
 assert(/saved API token for this endpoint is kept/.test(await page.locator('.app-dialog').innerText()),'the review says the token is kept');
 await page.click('#importSettingsBtn');await page.waitForFunction(()=>!document.querySelector('.app-dialog'));
 assert((await tokens())[A]==='sk-synthetic-transferred','the working token for the same endpoint survived');
 const tampered=await page.evaluate(async({encoded})=>{const j=JSON.parse(atob(encoded.replace(/-/g,'+').replace(/_/g,'/')+'=='.slice(0,(4-encoded.length%4)%4)));return j;},{encoded:locked.encoded});
 tampered.settings.endpoint=A+'?tenant=evil';
 const tamperedEncoded=Buffer.from(JSON.stringify(tampered)).toString('base64url');
 await fresh(h.origin+'/#settings='+tamperedEncoded);await page.waitForSelector('#importSettingsBtn');
 await page.click('#importSettingsBtn');await page.waitForSelector('#unlockTokenBtn');await page.fill('#unlockPassword',' Pa55 é ');await page.click('#unlockTokenBtn');
 await page.waitForFunction(()=>/Couldn.t unlock the API token/.test(document.querySelector('.app-dialog').innerText));
 assert(!(await tokens())[A+'?tenant=evil'],'a changed authenticated endpoint never receives the token');
 await closeDialog();
 ok('absent token keeps existing; tampering rejected');

 // ---- damaged token envelope and a damaged link
 const damaged=JSON.parse(JSON.stringify(tampered));damaged.settings.endpoint=A;damaged.protectedToken.salt='AAAA';
 await fresh(h.origin+'/#settings='+Buffer.from(JSON.stringify(damaged)).toString('base64url'));await page.waitForSelector('#importSettingsBtn');
 await page.click('#importSettingsBtn');await page.waitForFunction(()=>/could not be read/.test(document.querySelector('.app-dialog').innerText));
 assert(await page.locator('.app-dialog button:has-text("Enter an API token manually")').isVisible(),'manual entry offered');await closeDialog();
 await fresh(h.origin+'/#settings=%%%not-valid');await page.waitForFunction(()=>/Couldn.t read these settings/.test(document.querySelector('.app-dialog')?.innerText||''));
 assert(/damaged/.test(await page.locator('.app-dialog').innerText()),'a damaged link says so');await closeDialog();
 ok('damaged envelope and link');

 // ---- earlier links and files, through the same review; a version 2 fragment outranks old query fields
 const legacy=Buffer.from(JSON.stringify({endpoint:A,token:'sk-synthetic-legacy',model:'legacy-model',theme:'light'})).toString('base64url');
 await fresh(h.origin+'/?settings='+legacy);await page.waitForSelector('#importSettingsBtn');
 assert(/Import these settings/.test(await page.locator('.app-dialog').innerText())&&/legacy-model/.test(await page.locator('.app-dialog').innerText()),'an earlier link opens the review');
 await page.click('#importSettingsBtn');await page.waitForFunction(()=>!document.querySelector('.app-dialog'));
 assert((await tokens())[A]==='sk-synthetic-legacy'&&!(await page.evaluate(()=>location.search)).includes('settings'),'applied and cleaned from the address');
 await fresh(h.origin+'/?endpoint=http%3A%2F%2Flegacy.invalid%2Fv1&model=legacy-loser#settings='+bare.encoded);await page.waitForSelector('#importSettingsBtn');
 assert(!/legacy-loser/.test(await page.locator('.app-dialog').innerText()),'the fragment decides');await closeDialog();
 writeFileSync(join(dir,'old-config.json'),JSON.stringify({config:{endpoint:A,token:'sk-synthetic-file',model:'file-model',theme:'dark'},models:['file-model','fake-model']}));
 await openSettings('data');await importFile('#importConfigBtn',join(dir,'old-config.json'));await page.waitForSelector('#importSettingsBtn');
 assert(/file-model/.test(await page.locator('.app-dialog').innerText()),'an earlier settings file opens the same review');await page.click('#importSettingsBtn');await page.waitForFunction(()=>!document.querySelector('.app-dialog'));
 await importFile('#importConfigBtn',filePath);await page.waitForSelector('#importSettingsBtn');
 assert(/protected with a password/.test(await page.locator('.app-dialog').innerText()),'a version 2 file opens the same review');await closeDialog();
 ok('legacy readers and precedence');

 // ---- Transfer chats and backups
 await openTransferChats();
 const chats=await page.locator('.app-dialog').innerText();
 assert(/Transfer chats and backups/.test(chats)&&chats.includes('This file includes the conversations and items listed below. Anyone able to open the file can read its included content. Choose where to save it and who to give it to.')&&chats.includes('This backup includes the items listed below and is protected with your chosen password. Keep the password available for restoration.'),'both reviews have their copy');
 assert(/Provider settings: Not included/.test(chats)&&/Credentials: Not included/.test(chats)&&/Encryption: None/.test(chats),'actual scope is stated');
 const [exp]=await Promise.all([page.waitForEvent('download'),page.click('#exportChatsBtn')]);assert(/chat-history\.json$/.test(exp.suggestedFilename()),'Export saved conversations downloads the history');
 await closeDialog();
 ok('transfer chats and backups');

 // ---- controls fit with enlarged text
 const box=async sel=>page.locator(sel).boundingBox();
 await page.addStyleTag({content:'html{font-size:200%}'});
 await openExplore('Share');await page.waitForSelector('.app-dialog');
 const cb=await box('.app-dialog .dialog-head button');const dlgBox=await box('.app-dialog .sheet');
 assert(cb&&cb.x+cb.width<=1280&&dlgBox.y>=0&&dlgBox.y+dlgBox.height<=800,'the dialog and its close control fit at 200% text: '+JSON.stringify({cb,dlgBox}));
 await closeDialog();
 ok('layout');

 // ---- a phone with the on-screen keyboard open (a short viewport) leaves the password field and the action reachable
 await page.setViewportSize({width:390,height:360});
 await page.evaluate(({A})=>{const c=JSON.parse(sessionStorage.getItem('chatConfig'));c.endpoint=A;c.model='fake-model';sessionStorage.setItem('chatConfig',JSON.stringify(c));},{A});
 await fresh(h.origin+'/');await openSettings('data');
 await page.click('#transferSettingsBtn');await page.waitForSelector('#transferCreateBtn');await page.check('#transferIncludeToken');
 await page.locator('#transferPassword').focus();await page.locator('#transferPassword').scrollIntoViewIfNeeded();
 const pw=await page.locator('#transferPassword').boundingBox();assert(pw&&pw.y>=0&&pw.y+pw.height<=360,'the password field can be scrolled into view with the keyboard open: '+JSON.stringify(pw));
 await page.locator('#transferCreateBtn').scrollIntoViewIfNeeded();const cr=await page.locator('#transferCreateBtn').boundingBox();assert(cr&&cr.y+cr.height<=360&&cr.height>=44,'Create transfer link is reachable and touch-sized: '+JSON.stringify(cr));
 await closeDialog();await page.setViewportSize({width:1280,height:800});
 ok('short viewport');

 const unexpected=h.errors.filter(e=>!/API responded with status|network error|Failed to fetch|ERR_|tenant/i.test(e));
 assert(unexpected.length===0,'no unexpected page errors: '+JSON.stringify(unexpected));
 console.log('ALL PASS');
}catch(e){console.error(e.message);console.error(await page.locator('.app-dialog').innerText().catch(()=>''));console.error(h.errors);process.exitCode=1;}
finally{await h.close();}
