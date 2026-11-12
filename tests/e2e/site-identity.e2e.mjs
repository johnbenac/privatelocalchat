// The identity of the site that serves a copy (the `site` block of the site manifest, docs/SITE-LINKS.md) decides whether the app offers to share an address:
//   our manifest   the Share entries are there and the dialog offers exactly the public address of the site
//   no site block  none of the three entries is drawn, and the dialog (reached by the assistant) says there is nothing to share
//   node scripts/e2e.mjs site-identity
process.env.PLC_E2E_BRANCH??='main';
const {launch,assert}=await import('./harness.mjs');
const ok=n=>console.log('PASS '+n);

async function variant(name,siteJsonPath,port,run){
  if(siteJsonPath===undefined)delete process.env.SITE_JSON_PATH;else process.env.SITE_JSON_PATH=siteJsonPath;
  const h=await launch({port});
  try{
    await h.page.waitForFunction(()=>window.__plcBooted===true&&Boolean(window.plcShell),null,{timeout:30000});
    await run(h.page);
    assert(!h.errors.length,name+': page errors: '+h.errors.join(' | '));
    ok(name);
  }finally{await h.close();}
}
const popText=async(page,label)=>{await page.click(`button[aria-label="${label}"]`);const t=await page.locator('.shell-pop').first().innerText();await page.keyboard.press('Escape');return t;};
const aboutText=async page=>{await page.evaluate(()=>window.plcShell.openSettings('about'));await page.waitForSelector('#settingsPage',{state:'visible'});const t=await page.locator('#settingsPage').innerText();await page.click('button[aria-label="Close settings"]');return t;};
const closeDialog=async page=>{await page.keyboard.press('Escape');await page.waitForSelector('.app-dialog',{state:'detached',timeout:5000}).catch(()=>{});};

try{
  await variant('with our manifest the app offers to share the address of the site',undefined,18581,async page=>{
    assert(/Share/.test(await popText(page,'This device menu')),'the profile menu has Share');
    assert(/Share/.test(await popText(page,'Explore')),'the Explore menu has Share');
    assert(/Share this app/.test(await aboutText(page)),'Settings, About has Share this app');
    await page.evaluate(()=>window.plcApp.openShare());
    await page.waitForSelector('#productShareAddress',{state:'attached',timeout:10000}); // shown only where the clipboard is not available
    assert((await page.inputValue('#productShareAddress'))==='https://privatelocal.chat/','the dialog offers the public address of the site');
    await closeDialog(page);
  });

  await variant('without a site block there is nothing to share and nothing offers it','',18582,async page=>{
    assert(!/Share/.test(await popText(page,'This device menu')),'the profile menu has no Share');
    assert(!/Share/.test(await popText(page,'Explore')),'the Explore menu has no Share');
    assert(!/Share this app/.test(await aboutText(page)),'Settings, About has no Share this app');
    await page.evaluate(()=>window.plcApp.openShare());
    await page.waitForSelector('.app-dialog',{timeout:10000});
    const text=await page.locator('.app-dialog').innerText();
    assert(/names no public address/.test(text)&&await page.locator('#productShareAddress').count()===0,'the dialog says there is nothing to share and shows no address: '+text);
    await closeDialog(page);
  });
  console.log('ALL PASS');
}catch(error){
  console.error('FAIL '+(error.stack||error));
  process.exitCode=1;
}
