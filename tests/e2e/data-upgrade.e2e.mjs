// Data from every release, loaded by the build under test (docs/DATA-COMPATIBILITY.md).
// Each folder in tests/fixtures/data/ is a snapshot of everything the browser held after a real release was used: plain, and again with the encrypted vault on. For each one, oldest first,
// this restores it into a fresh browser, starts the current build (unlocking the vault where there is one), and checks that every chat, project, memory item, preset, draft, setting and
// document is still there, that nothing was left unreadable or blocked, that the app keeps its content when it writes, and that it survives another start.
//   node scripts/e2e.mjs data-upgrade
process.env.PLC_E2E_BRANCH??='main'; // the production build, which is what people receive
const {launch,assert}=await import('./harness.mjs');
const {listFixtures,readFixture,restoreInPage,probeInPage,project,mismatch,PASSPHRASE}=await import('../data/lib.mjs');
const ok=n=>console.log('PASS '+n);

const names=listFixtures();
assert(names.length>0,'there is at least one data snapshot in tests/fixtures/data');
const h=await launch({port:18481});
const {page,errors,origin}=h;
const ready=async()=>{await page.waitForSelector('#messageInput');await page.waitForFunction(()=>window.__plcBooted===true&&Boolean(window.plcShell),null,{timeout:30000});await page.waitForFunction(()=>!document.querySelector('#messageInput').disabled);};
const probe=async()=>project(await page.evaluate(probeInPage));
const guardShown=()=>page.evaluate(()=>({state:window.__plcFormatGuard||null,dialog:document.querySelector('.app-dialog')?.innerText||''}));
const startFrom=async(dump,vault)=>{
  // a blank page of the same origin: restore before the app has opened anything
  await page.goto(origin+'/version.json');
  await page.evaluate(restoreInPage,dump);
  await page.goto(origin+'/');
  if(vault){await page.waitForSelector('#lockScreen',{state:'visible',timeout:20000});await page.fill('#unlockPass',PASSPHRASE);await page.press('#unlockPass','Enter');await page.waitForSelector('#lockScreen',{state:'hidden',timeout:30000});}
  await ready();
};
const memoryItem=async text=>{await page.click('button[aria-label="This device menu"]');await page.click('.shell-pop-row:has-text("Memory & preferences")');await page.fill('.app-dialog input[aria-label="New memory"]',text);await page.click('.app-dialog button:has-text("Add")');await page.click('.app-dialog button:has-text("Done")');};

try{
  for(const name of names){
    const fx=readFixture(name);
    for(const [mode,snap] of [['plain',fx.plain],['vault',fx.vault]]){
      const label=`${fx.meta.release} (${fx.meta.commit}) ${mode}`;
      errors.length=0;
      await startFrom(snap.storage,mode==='vault');

      // 1. everything the person had is there
      let found=await probe();
      let bad=mismatch(snap.expected,found);
      assert(!bad,label+': content differs after the upgrade: '+bad);
      const guard=await guardShown();
      assert(!(guard.state?.blocked||[]).length&&!(guard.state?.databases||[]).length,label+': a store was blocked as newer: '+JSON.stringify(guard.state));
      assert(!/newer version/.test(guard.dialog),label+': the newer-data message was shown');
      ok(label+': every chat, project, memory item, preset, draft, setting and document is there');

      // 2. the browser's record of formats was written, and nothing else was disturbed by starting
      const registry=await page.evaluate(()=>localStorage.getItem('plc.formats.v1'));
      assert(registry&&JSON.parse(registry).formats.chatThreads===1,label+': the format record was written');
      await page.waitForTimeout(1500);
      bad=mismatch(snap.expected,await probe());
      assert(!bad,label+': content changed by itself shortly after start: '+bad);
      assert(!errors.length,label+': the page reported errors: '+errors.join(' | '));
      ok(label+': stable after start, format record written, no errors');

      // 3. it still works as a normal app: write something, restart, find old and new
      await memoryItem('Added after the upgrade.');
      await page.waitForTimeout(1200);
      await page.reload();
      if(mode==='vault'){await page.waitForSelector('#lockScreen',{state:'visible',timeout:20000});await page.fill('#unlockPass',PASSPHRASE);await page.press('#unlockPass','Enter');await page.waitForSelector('#lockScreen',{state:'hidden',timeout:30000});}
      await ready();
      found=await probe();
      const expected=JSON.parse(JSON.stringify(snap.expected));
      const items=found.local['plc.memory.v1']?.items||[];
      assert(items.some(i=>i.text==='Added after the upgrade.'),label+': what was written after the upgrade is kept: '+JSON.stringify(items));
      const before=expected.local['plc.memory.v1'];if(before)expected.local['plc.memory.v1']={...before,items:[...before.items,items[items.length-1]]};
      bad=mismatch(expected,found);
      assert(!bad,label+': old content changed when the app wrote: '+bad);
      assert(!errors.length,label+': errors after writing and restarting: '+errors.join(' | '));
      ok(label+': writes work and everything survives another start');
    }
  }
  console.log(`ALL PASS (${names.length} snapshot${names.length===1?'':'s'}, plain and vault)`);
}catch(error){
  console.error('FAIL '+(error.stack||error));
  process.exitCode=1;
}finally{
  await h.close();
}
