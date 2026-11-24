// Where the app downloads models from is the configured model source, and only that (docs/APP-CONFIG.md). Builds with different configurations are started in a real browser and a download is begun:
//   shipped source on our site     asks the project's CDN, shows no notice
//   shipped source, no site        shows the model-source notice first, once; declining downloads nothing
//   an operator's source           asks only that source; wrong bytes from it are refused (the pins stay in the app); no notice
//   node scripts/e2e.mjs model-sources
process.env.PLC_E2E_BRANCH??='main';
import {writeFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
const {launch,assert}=await import('./harness.mjs');
const ok=n=>console.log('PASS '+n);

const DEFAULT_ROOT='https://cdn.aiofourown.com/models/';
const OTHER_ROOT='https://models.example.org/m/';
const dir=mkdtempSync(path.join(tmpdir(),'plc-sources-'));
const overrideFile=path.join(dir,'app-config.json');
const curatedSite=path.join(dir,'curated-site.json');
writeFileSync(curatedSite, JSON.stringify({modelSourcePosture:'curated'}));
writeFileSync(overrideFile,JSON.stringify({modelSources:[{id:'mine',label:'My models',base:OTHER_ROOT}]}));

/** Start the app built with `env`, answer every model request with bytes that are not the model, and hand the page and the list of requests to `run`. */
async function variant(name,env,port,run){
  for(const k of ['SITE_JSON_PATH','APP_CONFIG_OVERRIDE','SITE_CONFIG_PATH'])delete process.env[k];
  process.env.SITE_DIR='tests/fixtures/site'; // a site that names itself, so "our site" below means this one
  Object.assign(process.env,env);
  const h=await launch({port});
  const requests=[];
  try{
    await h.page.route(/^https:\/\/(cdn\.aiofourown\.com|models\.example\.org)\//,route=>{requests.push(route.request().url());route.fulfill({status:200,body:'these bytes are not the model',headers:{'access-control-allow-origin':'*','cross-origin-resource-policy':'cross-origin','content-type':'application/octet-stream'}});});
    await h.page.waitForFunction(()=>window.__plcBooted===true&&Boolean(window.plcShell),null,{timeout:30000});
    await run(h.page,requests,h);
    assert(!h.errors.filter(e=>!/Failed to load resource|Download|download|integrity|hash|checksum|mismatch|stalled/i.test(e)).length,name+': page errors: '+h.errors.join(' | '));
    ok(name);
  }finally{await h.close();}
}
// inspectAll() resolves when the app has finished starting (the device probe), which is when downloads may begin; how long that takes varies
const startDownload=page=>page.evaluate(async()=>{await window.localModels.inspectAll();window.localModels.setMode('local');await window.localModels.selectTier('nano');window.localModels.download();});
const noticeShown=async page=>{try{await page.waitForSelector('.app-dialog:has-text("Where the models come from")',{timeout:45000});return true;}catch{console.log('dialogs on the page: '+JSON.stringify(await page.evaluate(()=>[...document.querySelectorAll('.app-dialog')].map(d=>d.innerText.slice(0,120))))+' phase '+JSON.stringify(await page.evaluate(()=>window.localModels.downloadRecovery)));return false;}};
const until=async(cond,ms=45000)=>{const end=Date.now()+ms;while(Date.now()<end){if(await cond())return true;await new Promise(r=>setTimeout(r,200));}return false;};
const installed=page=>page.evaluate(()=>Boolean(window.localModels.state?.tiers?.nano?.install?.ok));
const phase=page=>page.evaluate(()=>window.localModels.downloadRecovery.phase);
const LINE='This copy is updated by whoever hosts it.';
const sourceRow=async page=>{await page.evaluate(()=>window.plcShell.openSettings('models'));await page.waitForSelector('#modelSourceSection',{timeout:15000});return page.locator('#modelSourceSection').innerText();};

try{
  await variant('the shipped source on our site: the project\'s CDN is asked, with no notice',{},18561,async(page,requests)=>{
    await startDownload(page);
    await until(()=>requests.length>0);await page.waitForTimeout(1500);
    assert(requests.length>0,'a download asked for files');
    for(const u of requests)assert(u.startsWith(DEFAULT_ROOT),'a request went elsewhere: '+u);
    assert(await page.locator('.app-dialog:has-text("Where the models come from")').count()===0,'no notice on our own site');
    assert(!await installed(page),'wrong bytes were not accepted as the model');
    const row=await sourceRow(page);
    assert(/Private Local Chat project CDN \(cdn\.aiofourown\.com\)/.test(row)&&!/set by whoever runs this copy/.test(row)&&/checked against its published size and SHA-256/.test(row),'the Model source row says what is in use: '+row);
    assert(!row.includes(LINE),'no "updated by whoever hosts it" line on a build with our site identity: '+row);
  });

  await variant('a copy that is not our site shows the notice first, once',{SITE_JSON_PATH:''},18562,async(page,requests)=>{
    await startDownload(page);
    assert(await noticeShown(page),'the model-source notice appears before the download');
    const text=await page.locator('.app-dialog').innerText();
    assert(/cdn\.aiofourown\.com/.test(text)&&/config\/app-config\.json/.test(text)&&/Model source/.test(text),'it names the host and where to set another source: '+text);
    await page.waitForTimeout(2500);
    assert(requests.length===0,'nothing is requested while the notice is open: '+requests.length);
    await page.click('.app-dialog button:has-text("Download")');
    await until(()=>requests.length>0);
    assert(requests.length>0&&requests.every(u=>u.startsWith(DEFAULT_ROOT)),'after Download the project\'s CDN is asked: '+requests.slice(0,2));
    assert(await page.evaluate(()=>localStorage.getItem('plc.modelSourceNotice.v1'))==='1','it is remembered');
    assert((await sourceRow(page)).includes(LINE),'a copy that is not our site says who updates it');
    await page.evaluate(()=>window.localModels.cancelDownload());
    const before=requests.length;
    await startDownload(page);
    await until(()=>requests.length>before);
    assert(await page.locator('.app-dialog:has-text("Where the models come from")').count()===0,'it is not shown again');
    assert(requests.length>before,'and the next download simply starts');
  });

  await variant('declining the notice downloads nothing',{SITE_JSON_PATH:''},18563,async(page,requests)=>{
    await startDownload(page);
    assert(await noticeShown(page),'the notice appears');
    await page.click('.app-dialog button:has-text("Cancel")');
    await page.waitForTimeout(3000);
    assert(requests.length===0,'nothing was requested: '+requests.length);
    assert((await phase(page))==='cancelled','the download is cancelled: '+await phase(page));
    assert(await page.evaluate(()=>localStorage.getItem('plc.modelSourceNotice.v1'))===null,'and the notice will be shown again');
  });

  await variant('an operator\'s source is the only one asked, its bytes are checked against the pins, and nothing is announced',{APP_CONFIG_OVERRIDE:overrideFile},18564,async(page,requests)=>{
    await startDownload(page);
    await until(()=>requests.length>0);await page.waitForTimeout(1500);
    assert(requests.length>0,'a download asked for files');
    for(const u of requests)assert(u.startsWith(OTHER_ROOT)&&!u.includes('privatelocal.chat'),'a request went elsewhere: '+u);
    assert(await page.locator('.app-dialog:has-text("Where the models come from")').count()===0,'no notice when the operator chose the source');
    assert(!await installed(page),'wrong bytes from the operator\'s source were refused');
    assert(['retrying','downloading','pending'].includes(await phase(page)),'the download did not complete: '+await phase(page));
    const row=await sourceRow(page);
    assert(/My models \(models\.example\.org\), set by whoever runs this copy/.test(row),'the Model source row names the operator\'s source: '+row);
  });

  await variant('an operator\'s source on a copy that is not our site also says who updates it',{SITE_JSON_PATH:'',APP_CONFIG_OVERRIDE:overrideFile},18565,async(page)=>{
    const row=await sourceRow(page);
    assert(/My models \(models\.example\.org\), set by whoever runs this copy/.test(row)&&row.includes(LINE),'the line is there beside the operator\'s source: '+row);
    assert(row.split(LINE).length===2,'once');
  });

  await variant('personal source order survives reload and selects the download destination', {SITE_JSON_PATH:''}, 18566, async (page, requests) => {
    await sourceRow(page);
    const section = page.locator('#modelSourceSection');
    for (const [name, address] of [['First mirror', OTHER_ROOT], ['Second mirror', OTHER_ROOT + 'other/']]) {
      await section.getByLabel('Source name').fill(name);
      await section.getByLabel('Source address').fill(address);
      await section.getByRole('button', {name:'Add source'}).click();
      await section.getByText(name, {exact:true}).waitFor();
    }
    await section.getByRole('button', {name:'Move up', exact:true}).last().click();
    await section.getByText('Selected for language model downloads. ' + OTHER_ROOT + 'other/', {exact:true}).waitFor();
    await page.reload();
    await page.waitForFunction(() => window.__plcBooted === true && window.plcShell);
    assert((await sourceRow(page)).includes('Selected for language model downloads. ' + OTHER_ROOT + 'other/'));
    await startDownload(page);
    assert(await until(() => requests.length > 0), 'selected mirror received the model request');
    assert(requests.every((url) => url.startsWith(OTHER_ROOT + 'other/')), 'only the selected mirror received requests');
    await section.getByRole('button', {name:'Remove', exact:true}).first().click();
    await section.getByText('Selected for language model downloads. ' + OTHER_ROOT, {exact:true}).waitFor();
  });

  await variant('parallel source edits and tab loss preserve a complete list', {SITE_JSON_PATH:''}, 18567, async (page, requests, harness) => {
    const boot = target => target.waitForFunction(() => window.__plcBooted && window.localModels?.editModelSources);
    const edit = (target, action) => target.evaluate(action => window.localModels.editModelSources(action), action);
    const add = id => ({kind:'add', source:{id, label:id, base:`https://models.example.org/${id}/`}});
    const list = () => page.evaluate(() => window.localModels.modelSources().map(({id}) => id));
    const peer = await harness.context.newPage();
    await peer.goto(harness.origin);
    await boot(peer);
    for (let i = 0; i < 20; i++) {
      const a = `a-${i}`, b = `b-${i}`;
      // Queue both writers on the real browser lock before releasing the barrier.
      await page.evaluate(() => {
        window.holdSourceWrite = navigator.locks.request('plc.personalModelSources.v1', () =>
          new Promise(resolve => { window.releaseSourceWrite = resolve; }));
      });
      await page.waitForFunction(() => Boolean(window.releaseSourceWrite));
      const pending = Promise.all([edit(page, add(a)), edit(peer, add(b))]);
      await page.waitForFunction(async () => (await navigator.locks.query()).pending
        .filter(lock => lock.name === 'plc.personalModelSources.v1').length === 2);
      await page.evaluate(() => { window.releaseSourceWrite(); delete window.releaseSourceWrite; });
      await pending;
      assert(JSON.stringify((await list()).sort()) === JSON.stringify([a,b]), 'both parallel edits committed exactly once');
      await Promise.all([edit(page, {kind:'remove',id:a}), edit(peer, {kind:'remove',id:b})]);
      assert((await list()).length === 0, 'parallel removals both committed');
    }
    await peer.close();
    for (let i = 0; i < 20; i++) {
      const leaving = await harness.context.newPage();
      await leaving.goto(harness.origin);
      await leaving.evaluate(() => {
        navigator.locks.request('plc.personalModelSources.v1', () => {
          window.heldSourceWrite = true;
          return new Promise(() => {});
        });
      });
      await leaving.waitForFunction(() => window.heldSourceWrite);
      const id = `after-close-${i}`;
      const pending = edit(page, add(id));
      await page.waitForFunction(async () => (await navigator.locks.query()).pending
        .some(lock => lock.name === 'plc.personalModelSources.v1'));
      await leaving.close();
      await pending;
      assert(JSON.stringify(await list()) === JSON.stringify([id]), 'tab close released lock and left no partial settings');
      await edit(page, {kind:'remove',id});
    }
    assert(requests.length === 0, 'editing settings did not fetch model bytes');
  });

  await variant('encrypted vault persists source edits across an unlock', {SITE_JSON_PATH:''}, 18570, async (page, requests) => {
    const pass = 'scratch-source-vault';
    await page.evaluate(() => window.plcShell.openSettings('security'));
    await page.click('.set-row:has-text("App lock") button');
    await page.check('#lockEncrypt');
    await page.fill('#lockNew1', pass);
    await page.fill('#lockNew2', pass);
    await page.click('.app-dialog button:has-text("Lock the app")');
    await page.waitForSelector('.app-dialog:has-text("Remove the unencrypted copy")');
    await page.click('.app-dialog button:has-text("Remove it")');
    await sourceRow(page);
    const section = page.locator('#modelSourceSection');
    await section.getByLabel('Source name').fill('Vault-only source');
    await section.getByLabel('Source address').fill(OTHER_ROOT);
    await section.getByRole('button', {name:'Add source'}).click();
    await section.getByText('Vault-only source', {exact:true}).waitFor();
    assert(await page.evaluate(() => !localStorage.getItem('plc.personalModelSources.v1')), 'no plain source descriptor');
    await page.reload();
    await page.waitForSelector('#lockScreen', {state:'visible'});
    await page.fill('#unlockPass', pass);
    await page.press('#unlockPass', 'Enter');
    await page.waitForSelector('#lockScreen', {state:'hidden'});
    await page.waitForFunction(() => window.__plcBooted && window.localModels?.modelSources);
    assert((await sourceRow(page)).includes('Vault-only source'), 'the durable descriptor survived unlock');
    assert(requests.length === 0, 'settings edits and unlock made no model requests');
  });

  await variant('curated site rejects an unapproved personal source without fetching', {SITE_CONFIG_PATH:curatedSite}, 18571, async (page, requests) => {
    await sourceRow(page);
    const section = page.locator('#modelSourceSection');
    await section.getByLabel('Source name').fill('Unapproved mirror');
    await section.getByLabel('Source address').fill(OTHER_ROOT);
    await section.getByRole('button', {name:'Add source'}).click();
    await section.getByRole('status').filter({hasText:'This site has not approved that source.'}).waitFor();
    assert(await page.evaluate(() => window.localModels.modelSources().length === 0), 'the refused source was not saved');
    assert(requests.length === 0, 'the refused source was not contacted');
  });

  console.log('ALL PASS');
}catch(error){
  console.error('FAIL '+(error.stack||error));
  process.exitCode=1;
}
