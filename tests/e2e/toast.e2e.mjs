// A toast stays up long enough to read, is held while it is touched or the tab is hidden, and a tap puts it away. The shell's own messages reach it too.
import {launch,assert} from './harness.mjs';
const ok=n=>console.log('ok   '+n);
const h=await launch({port:18441});
try{
 const {page}=h;
 await page.waitForFunction(()=>window.plcApp?.toast);
 const shown=()=>page.evaluate(()=>document.querySelector('#toast').classList.contains('visible'));
 const long='This is a message with a fair amount of words in it, so it needs several seconds to read properly.';
 await page.evaluate(t=>window.plcApp.toast(t),long);
 assert(await shown(),'the toast shows');
 await page.waitForTimeout(6500);
 assert(await shown(),'a ~100 character message is still up after 6.5 s (the old fixed 3.2 s would have closed it)');
 await page.waitForTimeout(6000);
 assert(!(await shown()),'and goes away after its reading time');
 ok('the time follows the length of the message');

 await page.evaluate(()=>window.plcApp.toast('Held while touched.',1000));
 await page.locator('#toast').hover();
 await page.waitForTimeout(6000);
 assert(await shown(),'a toast under the pointer or finger is not closed');
 await page.mouse.move(5,5);
 await page.waitForTimeout(5000);
 assert(!(await shown()),'it goes once released');
 ok('held while touched, closes after');

 await page.evaluate(()=>window.plcApp.toast('Tap to dismiss me.',1000));
 await page.waitForTimeout(1200);
 await page.locator('#toast').click();
 await page.waitForTimeout(400);
 assert(!(await shown()),'a tap puts it away');
 await page.evaluate(()=>window.plcApp.toast('Not so fast.',1000));
 await page.locator('#toast').click({force:true,timeout:2000}).catch(()=>{});
 assert(await shown(),'a tap in the first moments (meant for something underneath) does not close it');
 ok('tap to dismiss, but not by accident');

 // the toast comes down from the top, stays clear of the drawer button (top left) and Temporary chat (top right), and uses a readable measure: about two thirds of a phone, not half of a large screen
 const text='A longer message that should fill most of the width on a phone, and stop at a readable width on a wide screen, instead of wrapping at half the window.';
 for(const [w,min,max] of [[375,0.5,0.78],[1280,0.25,0.6]]){
  await page.setViewportSize({width:w,height:800});
  await page.evaluate(t=>window.plcApp.toast(t,30000),text);await page.waitForTimeout(400);
  const box=await page.locator('#toast').boundingBox();
  assert(box&&box.x>=0&&box.x+box.width<=w+0.5,'the toast fits the screen at '+w+' px: '+JSON.stringify(box));
  assert(box.y<70,'the toast is at the top of the screen at '+w+' px: '+JSON.stringify(box));
  assert(box.x>=60&&box.x+box.width<=w-60,'the toast leaves the corner buttons free at '+w+' px: '+JSON.stringify(box));
  const frac=box.width/w;
  assert(frac>=min&&frac<=max,'the toast is '+Math.round(frac*100)+'% of a '+w+' px screen, expected between '+Math.round(min*100)+'% and '+Math.round(max*100)+'%');
  await page.locator('#toast').click({force:true,position:{x:5,y:5}}).catch(()=>{});
  await page.evaluate(()=>window.plcApp.toast(' ',10));await page.waitForTimeout(100);
 }
 ok('the toast comes from the top, clear of the corner buttons, at a readable width');
 console.log('toast e2e: ok');
}catch(e){console.error(e);process.exitCode=1;}
finally{await h.close();}
