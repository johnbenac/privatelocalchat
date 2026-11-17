import {launch,assert} from './harness.mjs';
// Old saved copies repair themselves, and a page that cannot start says so instead of sitting there with dead buttons.
const ok=name=>console.log('PASS',name);
const h=await launch();
const {page}=h;
try{
 await page.waitForFunction(()=>!document.querySelector('#messageInput').disabled);
 const build=await page.evaluate(()=>window.APP_BUILD);
 assert(build?.commit,'the build knows its commit');
 await page.waitForTimeout(4600);
 assert(await page.locator('#startupBanner').count()===0,'a healthy start shows no banner');
 ok('healthy start');

 // a newer build is published than the one running: clear the saved copy and reload, once; then offer a button instead of looping
 let versionRequests=0,navigations=0;
 await page.route('**/version.json*',route=>{versionRequests++;route.fulfill({contentType:'application/json',body:JSON.stringify({...build,commit:'f'.repeat(40)})});});
 page.on('framenavigated',f=>{if(f===page.mainFrame())navigations++;});
 await page.evaluate(()=>sessionStorage.removeItem('plc.update.tried'));
 await page.reload();
 await page.waitForSelector('#updateNotice',{timeout:15000});
 assert(/new version/.test(await page.textContent('#updateNotice')),'offers the update when it already tried');
 assert(navigations<=3,'no reload loop: '+navigations);
 await page.waitForTimeout(1500);const settled=navigations;await page.waitForTimeout(1500);
 assert(navigations===settled,'stable after the repair');
 ok('stale build repairs itself once');
 await page.unroute('**/version.json*');

 // the app script stops short of finishing: the banner says so
 await page.route('**/',async route=>{const r=await route.fetch();const body=(await r.text()).replace('window.__plcBooted = true;','');route.fulfill({response:r,body});});
 await page.evaluate(()=>sessionStorage.clear());
 await page.goto(h.origin+'/');
 await page.waitForSelector('#startupBanner',{timeout:15000});
 assert(/did not start properly/.test(await page.textContent('#startupBanner')),'says the app did not start');
 assert(await page.locator('#startupBanner button').count()===1,'with a way to fix it');
 ok('failed start is reported');
 console.log('ALL PASS');
}catch(e){console.error(e.message);console.error(h.errors);process.exitCode=1;}
finally{await h.close();}
