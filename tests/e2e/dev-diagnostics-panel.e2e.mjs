// The development diagnostics panel is reachable (Settings > Models, after "Details and repair"). It was lost when the old model panel it was anchored to was removed,
// and nobody noticed because only the dev site has it. The panel only starts on the exact development hostname, so this test serves the dev build and pretends to be it.
import {launch,assert} from './harness.mjs';
const h=await launch({port:18421});
try{
 const {page,context}=h;
 // the build under test must be a dev build (PLC_E2E_BRANCH=dev); the page checks the hostname, so make the browser resolve the dev hostname to this server
 await page.close();
 const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('https://dev.privatelocal.chat/**',async route=>{const u=new URL(route.request().url());const r=await fetch('http://127.0.0.1:18421'+u.pathname+u.search);route.fulfill({status:r.status,headers:Object.fromEntries(r.headers),body:Buffer.from(await r.arrayBuffer())});});
 await p.goto('https://dev.privatelocal.chat/');
 await p.waitForSelector('#messageInput');
 await p.waitForSelector('#devDiagnostics',{state:'attached',timeout:20000});
 await p.evaluate(()=>window.plcShell.openSettings('models'));
 await p.click('#devDiagnostics summary');
 await p.waitForSelector('#debugReceiver',{state:'visible'});
 assert(await p.evaluate(()=>document.querySelector('#advancedModels').nextElementSibling===document.querySelector('#devDiagnostics')),'the panel sits right after "Details and repair"');
 assert(errors.filter(e=>/reading 'after'/.test(e)).length===0,'no "reading after" error: '+errors.join(' | '));
 console.log('ok   the development diagnostics panel is in Settings > Models');
 // /?diag=<session id> fills in this site's own receiver, and nothing else
 await p.goto('https://dev.privatelocal.chat/?diag=80a4edb5-54bc-46c6-acb2-22bdf0c4121d');await p.waitForSelector('#messageInput');
 await p.waitForFunction(()=>document.querySelector('#debugReceiver')?.value.endsWith('/api/debug/80a4edb5-54bc-46c6-acb2-22bdf0c4121d'),null,{timeout:20000});
 assert(await p.evaluate(()=>document.querySelector('#debugReceiver').value.startsWith('https://dev.privatelocal.chat/api/debug/')),'the receiver is this site\'s own');
 assert(!(await p.evaluate(()=>location.search)),'the id is removed from the address');
 await p.goto('https://dev.privatelocal.chat/?diag=https://evil.example/x');await p.waitForSelector('#messageInput');await p.waitForTimeout(3000);
 assert(!(await p.evaluate(()=>document.querySelector('#debugReceiver').value.includes('evil'))),'anything but a session id is ignored');
 console.log('ok   ?diag=<session id> sets the receiver, and only that');
 console.log('dev-diagnostics-panel e2e: ok');
}catch(e){console.error(e);process.exitCode=1;}
finally{await h.close();}
