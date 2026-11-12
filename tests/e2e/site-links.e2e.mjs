// The links to our pages come from the site manifest (docs/PLAN, stage 3). Three builds are started in a real browser and every surface that draws such a link is opened:
//   with our site.json   every link is exactly the one recorded in docs/evidence/split/links-baseline.json before this stage changed the app
//   with no manifest     none of our pages is linked; no row, list, heading or sentence about them is left behind
//   without Privacy      only the Privacy links go
//   node scripts/e2e.mjs site-links
process.env.PLC_E2E_BRANCH??='main';
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
const {launch,assert}=await import('./harness.mjs');
const {collectLinks,BASELINE,SEEDED_THREADS}=await import('../links/surfaces.mjs');
const ok=n=>console.log('PASS '+n);

const baseline=JSON.parse(readFileSync(BASELINE,'utf8')).surfaces;
const isOurs=l=>!/^https:\/\/github\.com\//.test(l.href||'');
const without=(surfaces,keep)=>Object.fromEntries(Object.entries(surfaces).map(([k,v])=>[k,v.filter(keep)]));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const show=surfaces=>Object.entries(surfaces).map(([k,v])=>k+': '+v.map(l=>l.text+'->'+l.href).join(' | ')).join('\n');

async function variant(name,siteJsonPath,port,check){
  process.env.SITE_DIR='tests/fixtures/site'; // a site that has all four pages and names itself
  if(siteJsonPath===undefined)delete process.env.SITE_JSON_PATH;else process.env.SITE_JSON_PATH=siteJsonPath;
  const h=await launch({port,storage:{chatThreads:SEEDED_THREADS}});
  try{
    await h.page.waitForFunction(()=>window.__plcBooted===true&&Boolean(window.plcShell),null,{timeout:30000});
    const found=await collectLinks(h.page,h.origin);
    await check(found,h.page);
    // the dialogs the surfaces opened are closed again; nothing may have been reported
    assert(!h.errors.length,name+': page errors: '+h.errors.join(' | '));
    ok(name);
  }finally{await h.close();}
}
const none=await mkdtempSync(path.join(tmpdir(),'plc-site-'));
const noPrivacy=path.join(none,'site.json');
writeFileSync(noPrivacy,JSON.stringify({format:'plc-site/1',pages:{help:'/help/',about:'/about/',updates:'/updates/'}}));

try{
  await variant('with our site.json every surface links exactly as it did before the manifest',undefined,18551,async found=>{
    assert(same(found,baseline),'the links differ from the baseline.\nexpected:\n'+show(baseline)+'\nfound:\n'+show(found));
  });

  await variant('with no manifest none of our pages is linked and nothing is left behind','',18552,async (found,page)=>{
    assert(same(found,without(baseline,l=>!isOurs(l))),'only the links to GitHub remain.\nexpected:\n'+show(without(baseline,l=>!isOurs(l)))+'\nfound:\n'+show(found));
    // the surfaces collected above are closed; open the ones that could keep an empty shell and look at them
    await page.evaluate(()=>window.plcApp.openHelp());await page.waitForSelector('.app-dialog');
    const help=await page.locator('.app-dialog').innerText();
    assert(await page.locator('.app-dialog .help-links').count()===0,'Help has no empty list of links');
    assert(!/Each opens in a new tab/.test(help)&&/Information about Private Local Chat/.test(help),'and no sentence about links that are not there: '+help.slice(0,300));
    await page.keyboard.press('Escape');await page.waitForSelector('.app-dialog',{state:'detached'}).catch(()=>{});
    await page.evaluate(()=>window.plcShell.openSettings('about'));await page.waitForSelector('#settingsPage',{state:'visible'});
    const about=await page.locator('#settingsPage').innerText();
    assert(!/^Privacy\b/m.test(about),'Settings, About has no Privacy row: '+about.slice(0,400));
    assert(/Help & about/.test(about)&&/Source code/.test(about)&&/Report a problem/.test(about),'and keeps the rows that do not depend on our pages');
    await page.evaluate(()=>window.plcShell.openSettings('models'));await page.waitForTimeout(300);
    assert(!/Trouble\?/.test(await page.locator('#settingsPage').innerText()),'the model page has no "Trouble?" line');
    await page.click('button[aria-label="Close settings"]');
    assert(await page.locator('#installLink').count()===0,'the welcome screen has no Install link');
    // the new-version notice still has its buttons
    await page.route('**/version.json*',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({commit:'e'.repeat(40)})}));
    await page.evaluate(()=>{document.getElementById('updateNotice')?.remove();window.dispatchEvent(new Event('plc-check-update'));});
    await page.waitForSelector('#updateNotice');
    const notice=await page.locator('#updateNotice').innerText();
    assert(/Reload/.test(notice)&&/Later/.test(notice)&&!/What changed/.test(notice),'the notice has Reload and Later and no What changed: '+notice);
  });

  await variant('with no Privacy page only the Privacy links go',noPrivacy,18553,async (found,page)=>{
    const expected=without(baseline,l=>!/^\/privacy\//.test(l.href||''));
    assert(same(found,expected),'only Privacy is missing.\nexpected:\n'+show(expected)+'\nfound:\n'+show(found));
  });

  console.log('ALL PASS');
}catch(error){
  console.error('FAIL '+(error.stack||error));
  process.exitCode=1;
}
