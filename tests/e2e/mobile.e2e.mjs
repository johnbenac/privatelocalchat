import {launch,assert} from './harness.mjs';
const profiles=[['phone portrait',{width:390,height:664},true],['phone landscape',{width:844,height:340},true],['tablet',{width:820,height:1000},true],['desktop',{width:1280,height:800},false]];
let first=true;
for(const [name,viewport,touch] of profiles){
 const h=await launch({build:first,viewport,touch,port:18400+Math.floor(Math.random()*90)});first=false;
 try{
  const {page}=h;
  await page.waitForFunction(()=>!document.querySelector('#messageInput').disabled);
  for(let i=0;i<4;i++){await page.fill('#messageInput','message '+i);await page.click('#sendBtn');await page.waitForFunction(()=>/Response complete/.test(document.querySelector('#generationStatus').textContent));await page.waitForFunction(()=>!document.querySelector('#stopGeneration').offsetParent);}
  const box=async sel=>page.locator(sel).first().boundingBox();
  await page.fill('#messageInput','a draft');   // the send button only appears once there is text
  const form=await box('#messageForm'),send=await box('#sendBtn'),input=await box('#messageInput');
  assert(form.y+form.height<=viewport.height+1,name+': composer inside viewport '+JSON.stringify(form));
  assert(send.y+send.height<=viewport.height+1&&send.x+send.width<=viewport.width+1,name+': send button reachable');
  assert(input.width>120,name+': input usable width '+input.width);
  assert((await box('#messages')).height>=60,name+': transcript has room: '+(await box('#messages')).height);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),name+': no horizontal page scroll');
  assert(!/user-scalable=no|maximum-scale/.test(await page.getAttribute('meta[name=viewport]','content')),name+': text zoom is allowed');

  // no control is ever shown disabled: if it cannot be used it is not shown
  const disabled=await page.evaluate(()=>[...document.querySelectorAll('button')].filter(b=>b.offsetParent&&(b.disabled||b.getAttribute('aria-disabled')==='true')).map(b=>b.id||b.textContent.trim().slice(0,30)));
  assert(disabled.length===0,name+': visible disabled buttons: '+JSON.stringify(disabled));
  await page.fill('#messageInput','');
  const compact=!(await page.evaluate(()=>matchMedia('(min-width: 900px)').matches));
  // on a phone or tablet the panel is a drawer; on a desktop it is already beside the chat
  if(compact){await page.click('button[aria-label="Open sidebar"]');await page.waitForSelector('.sidebar[aria-hidden="false"]');await page.waitForTimeout(400);}
  assert(await page.locator('.sidebar').isVisible()&&await page.locator('#newChatBtn').isVisible()&&await page.locator('#robertaDot').isVisible(),name+': the panel shows New chat and Roberta');
  assert(compact?!(await page.locator('#shellRail').isVisible()):await page.locator('#shellRail').isVisible(),name+': the icon rail is '+(compact?'replaced by the drawer':'shown'));
  const disabledSidebar=await page.evaluate(()=>[...document.querySelectorAll('.sidebar button')].filter(b=>b.offsetParent&&(b.disabled||b.getAttribute('aria-disabled')==='true')).map(b=>b.id||b.textContent.trim().slice(0,30)));
  assert(disabledSidebar.length===0,name+': disabled buttons in the sidebar: '+JSON.stringify(disabledSidebar));
  if(compact){await page.click('#closeSidebarBtn');await page.waitForSelector('.sidebar[aria-hidden="true"]',{state:'attached'});await page.waitForTimeout(400);}

  // the Enter-sends hint does not clutter the composer
  assert(!(await page.locator('#messageForm').innerText()).match(/Shift\+Enter|Make Enter/),name+': no keyboard hint in the composer');

  if(touch){
   // finger-sized targets for the things people tap most
   await page.fill('#messageInput','tap targets');
   const sizes=await page.evaluate(()=>{const sel=['#sendBtn','#shellPlus','#modelPill','#composerTools button','.message:last-child .message-actions button','button.show-panel','.header-temp'];const out=[];for(const s of sel)for(const el of document.querySelectorAll(s)){const r=el.getBoundingClientRect();if(r.width&&r.height)out.push({s,w:Math.round(r.width),h:Math.round(r.height)});}return out;});
   await page.fill('#messageInput','');
   assert(['#sendBtn','#shellPlus','#modelPill','button.show-panel','.header-temp'].every(s=>sizes.some(x=>x.s===s)),name+': the composer and header controls are on screen: '+JSON.stringify(sizes.map(x=>x.s)));
   const small=sizes.filter(x=>(x.h<43.5||x.w<43.5)&&x.s!=='#modelPill');
   assert(small.length===0,name+': tap targets are at least 44px: '+JSON.stringify(small));
   assert(sizes.filter(x=>x.s==='#modelPill').every(x=>x.h>=32),name+': the model pill is a usable height');
   // Enter is a new line on a touch device
   await page.fill('#messageInput','first line');await page.press('#messageInput','Enter');await page.keyboard.type('second');
   assert((await page.inputValue('#messageInput'))==='first line\nsecond',name+': Enter adds a new line on touch');
   await page.fill('#messageInput','');
   // actions on older messages appear when the message is tapped
   const hidden=await page.evaluate(()=>{const m=document.querySelector('.message.assistant');const a=m.querySelector('.message-actions');return getComputedStyle(a).display==='none';});
   assert(hidden,name+': older messages do not carry a permanent row of buttons');
   await page.locator('.message.assistant .message-body').first().tap();
   assert(await page.evaluate(()=>getComputedStyle(document.querySelector('.message.assistant .message-actions')).display!=='none'),name+': tapping a message shows its actions');
  }else{
   await page.fill('#messageInput','typed');await page.press('#messageInput','Enter');
   await page.waitForFunction(()=>/Response complete/.test(document.querySelector('#generationStatus').textContent)&&document.querySelectorAll('.message.user').length===5);
   assert(true,'Enter sends on a desktop keyboard');
  }
  await page.fill('#messageInput','markdown');await page.press('#messageInput',touch?'Enter':'Enter');
  if(touch)await page.click('#sendBtn');
  await page.waitForFunction(()=>document.querySelector('.message.assistant:last-of-type .code-block'),null,{timeout:15000});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),name+': code/table do not widen the page');
  // the Settings page and Roberta's page fit the same screen (opened the way a person does: rail profile menu, or the phone drawer)
  const compact2=!(await page.evaluate(()=>matchMedia('(min-width: 900px)').matches));
  if(compact2){await page.click('button[aria-label="Open sidebar"]');await page.waitForSelector('.sidebar[aria-hidden="false"]');await page.waitForTimeout(400);await page.click('.sidebar .mobile-only:has-text("Settings")');}
  else{await page.click('button[aria-label="This device menu"]');await page.locator('.shell-pop-row',{hasText:'Settings'}).click();}
  await page.waitForSelector('#settingsPage:not([hidden])');
  const sp=await page.locator('#settingsPage').boundingBox();
  assert(sp.x>=-1&&sp.x+sp.width<=viewport.width+1&&sp.y+sp.height<=viewport.height+1,name+': the Settings page fits the screen '+JSON.stringify(sp));
  assert(await page.locator('.settings-nav-item').first().isVisible()&&await page.locator('.settings-close').isVisible(),name+': settings sections and the close button are reachable');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),name+': Settings does not widen the page');
  await page.click('.settings-close');await page.waitForFunction(()=>document.querySelector('#settingsPage').hidden);
  if(compact2){await page.click('button[aria-label="Open sidebar"]');await page.waitForSelector('.sidebar[aria-hidden="false"]');await page.waitForTimeout(400);}
  await page.click('#robertaDot');await page.waitForSelector('#robertaPage:not([hidden])');
  const rp=await page.locator('#robertaPage').boundingBox();
  assert(rp.x>=-1&&rp.x+rp.width<=viewport.width+1&&rp.y+rp.height<=viewport.height+1,name+': Roberta\'s page fits the screen '+JSON.stringify(rp));
  assert(await page.locator('#robertaPage .roberta-call').isVisible(),name+': the Call button is reachable on her page');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),name+': Roberta\'s page does not widen the page');
  console.log('PASS',name);
 }catch(e){console.error(name,e.message);process.exitCode=1;}
 finally{await h.close();}
}
