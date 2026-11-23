// SPDX-License-Identifier: AGPL-3.0-only
// The four accessibility fixes of the T463 review, in a real phone-sized browser with touch:
// (P1) a closed drawer holds no tab stops, (P2) the page has one h1, (P3) the thread list keeps its list semantics,
// (P4 is checked in resource-open.e2e.mjs: the checksum is shown in full), (P5) every control is at least 44 px on a coarse pointer.
//   node scripts/e2e.mjs a11y-touch
import {launch,assert} from './harness.mjs';
const ok=n=>console.log('PASS '+n);
const h=await launch({port:18441,viewport:{width:390,height:844},touch:true});
const {page}=h;
try{
 await page.waitForFunction(()=>window.__plcBooted===true&&Boolean(window.plcShell),null,{timeout:20000});
 // P1: the closed drawer
 const drawer=await page.evaluate(()=>{const s=document.querySelector('aside.sidebar');const focusable=[...s.querySelectorAll('button,a[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter(e=>!e.disabled);
  return {hidden:s.getAttribute('aria-hidden'),inert:s.inert,focusable:focusable.length};});
 assert(drawer.hidden==='true'&&drawer.inert===true,'the closed drawer is aria-hidden and inert: '+JSON.stringify(drawer));
 let reachable=0;await page.evaluate(()=>document.activeElement?.blur());
 for(let i=0;i<40;i++){await page.keyboard.press('Tab');if(await page.evaluate(()=>Boolean(document.activeElement?.closest('aside.sidebar'))))reachable++;}
 assert(reachable===0,'a Tab walk never lands inside the closed drawer: '+reachable+' stops');
 ok('closed drawer: no tab stops');
 // the drawer works again when opened
 await page.click('button[aria-label="Open sidebar"]');
 assert(await page.evaluate(()=>document.querySelector('aside.sidebar').inert===false),'an open drawer is not inert');
 assert(await page.locator('#newChatBtn').isVisible(),'and its New chat button is reachable');
 ok('open drawer is usable');
 await page.click('#closeSidebarBtn');
 // P2: one h1
 assert(await page.locator('h1').count()===1,'one h1 on the page');
 ok('one h1');
 // P3: the thread list has only list items, none with a changed role
 await page.click('button[aria-label="Open sidebar"]');
 const list=await page.evaluate(()=>[...document.querySelectorAll('#threadList > *')].map(e=>({tag:e.tagName,role:e.getAttribute('role')})));
 assert(list.every(e=>e.tag==='LI'&&e.role===null),'every thread list child is a plain li: '+JSON.stringify(list.slice(0,4)));
 ok('thread list semantics');
 // P5: touch targets
 const small=await page.evaluate(()=>[...document.querySelectorAll('aside.sidebar button, aside.sidebar [role=button], .thread-list li[data-id], #newChatBtn, .composer button, button[aria-label]')]
  .filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden'&&!e.closest('[inert]');})
  .map(e=>({n:(e.getAttribute('aria-label')||e.textContent||e.className).trim().slice(0,24),w:Math.round(e.getBoundingClientRect().width),h:Math.round(e.getBoundingClientRect().height)})).filter(e=>e.h<43.5||e.w<43.5));
 assert(small.length===0,'every visible control is at least 44 px on a touch device: '+JSON.stringify(small.slice(0,6)));
 ok('44 px touch targets');
 assert(h.errors.length===0,'no page errors: '+h.errors.join(' | '));
 console.log('a11y-touch e2e: ok');
}catch(e){console.error(e);process.exitCode=1;}
finally{await h.close();}
