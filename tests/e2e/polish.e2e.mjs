import {launch,assert} from './harness.mjs';
// Layout regressions found in the visual polish pass: the backup reminder, long chat titles, the phone action row, the Help list.
const now=Date.now();
const mk=(id,title,n)=>({id,title,createdAt:now-n*1000,updatedAt:now-n*1000,messages:[{id:id+'u',role:'user',content:'Hello there',at:now-n*1000},{id:id+'a',role:'assistant',status:'complete',content:'A reply with a little text.',at:now-n*1000+1}]});
const threads=[mk('t1','A very long conversation title that cannot possibly fit in the sidebar width',1),mk('t2','Short',2)];
const openDrawer=async page=>{if(await page.locator('.sidebar[aria-hidden="false"]').count())return;await page.click('button[aria-label="Open sidebar"]');await page.waitForSelector('.sidebar[aria-hidden="false"]');await page.waitForTimeout(400);};
const closeDrawer=async page=>{await page.click('#closeSidebarBtn');await page.waitForSelector('.sidebar[aria-hidden="true"]',{state:'attached'});await page.waitForTimeout(400);};
// the rail's Explore button on a computer; the drawer's Explore row on a phone
const openExplore=async(page,touch,row)=>{
 if(touch){await openDrawer(page);await page.click('.sidebar .mobile-only:has-text("Explore")');}
 else await page.click('#shellRail .shell-icon-btn[aria-label="Explore"]');
 await page.locator('.shell-pop-row',{hasText:row}).click();
};
const run=async(label,viewport,touch)=>{
 const h=await launch({build:label==='desktop',port:19300+(touch?1:0),viewport,touch,storage:{chatThreads:JSON.stringify(threads)}});
 const {page}=h;
 try{
  if(touch)await openDrawer(page);
  await page.waitForSelector('#backupNudge',{state:'visible',timeout:15000}); // the page flags itself started a moment before it has drawn the saved chats
  const nudge=await page.locator('#backupNudge').boundingBox();
  assert(nudge&&nudge.width>200,label+': the backup reminder is visible');
  const [a,b]=await page.locator('#backupNudge .backup-nudge-actions button').evaluateAll(bs=>bs.map(x=>{const r=x.getBoundingClientRect();return {w:r.width,h:r.height,x:r.x,r:r.right,t:r.top};}));
  assert(Math.abs(a.w-b.w)<=1&&Math.abs(a.h-b.h)<=1&&Math.abs(a.t-b.t)<=1,label+': the two buttons are the same size on one row '+JSON.stringify([a,b]));
  assert(a.x>=nudge.x&&b.r<=nudge.x+nudge.width,label+': the buttons stay inside the card');
  assert((await page.locator('#backupNudge strong').innerText())==='Back up your chats',label+': has a heading');
  const clipped=await page.locator('.thread-list li .thread-name').first().evaluate(n=>({ell:getComputedStyle(n).textOverflow,over:n.scrollWidth>n.clientWidth,ws:getComputedStyle(n).whiteSpace}));
  assert(clipped.ell==='ellipsis'&&clipped.ws==='nowrap',label+': long titles end in an ellipsis '+JSON.stringify(clipped));
  if(touch){await closeDrawer(page);
   const tops=await page.locator('.message:last-child .message-actions > button:visible').evaluateAll(bs=>bs.map(x=>Math.round(x.getBoundingClientRect().top)));
   assert(tops.length>=3&&new Set(tops).size===1,label+': the message actions are one row '+JSON.stringify(tops));}
  // Help: rows, not bare links (Explore -> Help & about)
  await openExplore(page,touch,'Help & about');await page.waitForSelector('.help-links');
  const rows=await page.locator('.help-links a').evaluateAll(as=>as.map(a=>({h:a.getBoundingClientRect().height,d:getComputedStyle(a).textDecorationLine})));
  assert(rows.length>=6&&rows.every(r=>r.h>=44&&r.d==='none'),label+': help links are tappable rows '+JSON.stringify(rows[0]));
  const sheet=await page.locator('.app-dialog .sheet').boundingBox();
  assert(sheet.x>=0&&sheet.x+sheet.width<=viewport.width+1,label+': the Help sheet fits the screen');
  assert(await page.locator('#helpCallRoberta').isVisible(),label+': Roberta is one tap from the Help sheet');
  await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('.app-dialog'));
  // Memory & preferences (Explore): the checkbox sits beside its words
  await openExplore(page,touch,'Memory & preferences');await page.waitForSelector('label.list-row > input[type=checkbox]');
  const box=await page.locator('label.list-row > input[type=checkbox]').first().evaluate(c=>c.getBoundingClientRect().width);
  assert(box<=30,label+': the memory checkbox sits beside its words, not stretched across the row ('+Math.round(box)+'px)');
  assert(h.errors.length===0,label+': no page errors '+JSON.stringify(h.errors));
  console.log('PASS',label);
 }catch(e){console.error(label,e.message);process.exitCode=1;}finally{await h.close();}
};
await run('desktop',{width:1280,height:800},false);
await run('phone',{width:390,height:844},true);
if(!process.exitCode)console.log('ALL PASS');
