// Every place the app draws a link to one of our pages (docs/PLAN, stage 3): each surface is opened in a real browser and the links on it are listed.
// Shared by scripts/links-snapshot.mjs (records the baseline from a build) and tests/e2e/site-links.e2e.mjs (compares a build with it).
import {fileURLToPath} from 'node:url';
export const BASELINE=fileURLToPath(new URL('../../docs/evidence/split/links-baseline.json',import.meta.url));

const linksIn=selector=>({selector});
/** The links inside `selector`: their visible text (without the screen-reader note), address and target. */
const read=(page,selector)=>page.evaluate(sel=>[...document.querySelectorAll(sel)].map(a=>({text:[...a.childNodes].filter(n=>!(n.nodeType===1&&n.classList.contains('sr-only'))).map(n=>n.textContent).join('').trim(),href:a.getAttribute('href'),target:a.getAttribute('target')||null})),selector);
const closeDialogs=async page=>{await page.keyboard.press('Escape');await page.waitForSelector('.app-dialog',{state:'detached',timeout:3000}).catch(()=>{});};
const settings=async(page,section)=>{await page.evaluate(s=>window.plcShell.openSettings(s),section);await page.waitForSelector('#settingsPage',{state:'visible'});await page.waitForTimeout(300);};
const closeSettings=async page=>{if(await page.locator('#settingsPage').isVisible())await page.click('button[aria-label="Close settings"]');};

/**
 * Open every surface and return { surface: [links] }. `page` has the app started and idle. Nothing is changed in the app's data except one seeded chat, which is why this
 * runs in a browser of its own.
 */
export async function collectLinks(page,origin){
  const out={};
  // the welcome screen (an empty chat)
  out.welcome=await read(page,'a.cta-link');
  // Help & about
  await page.evaluate(()=>window.plcApp.openHelp());
  await page.waitForSelector('.app-dialog',{timeout:10000});
  out.help=await read(page,'.app-dialog a');
  await closeDialogs(page);
  // Settings: About, and the model page
  await settings(page,'about');out.settingsAbout=await read(page,'#settingsPage .set-card a, #settingsPage .set-row a, #settingsPage a.set-btn');
  await settings(page,'models');out.modelPage=await read(page,'#settingsPage .hint-text a');
  await closeSettings(page);
  // a failed reply while the model runs on this device: the "Get help" link under it
  await page.evaluate(()=>{Object.defineProperty(window.localModels,'mode',{get:()=>'local',configurable:true});});
  await page.locator('#threadList li[data-id]').filter({hasText:'Seeded failed reply'}).locator('.thread-name').click();
  await page.waitForSelector('.message-meta.failed',{timeout:10000});
  out.failedReply=await read(page,'.message-meta.failed a');
  // the new-version notice
  await page.route('**/version.json*',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({commit:'f'.repeat(40)})}));
  await page.evaluate(()=>window.dispatchEvent(new Event('plc-check-update')));
  await page.waitForSelector('#updateNotice',{timeout:10000});
  out.updateNotice=await read(page,'#updateNotice a');
  await page.unroute('**/version.json*');
  return out;
}

/** A chat whose last reply failed in a way that has a Help section (the download stalled). Put in storage before the app starts. */
export const SEEDED_THREADS=JSON.stringify([{id:'seeded-failed',title:'Seeded failed reply',systemPrompt:'',createdAt:1,updatedAt:2,messages:[
  {id:'m1',role:'user',content:'hello',at:1},
  {id:'m2',role:'assistant',content:'',at:2,status:'failed',error:'The download stalled and the connection was lost.'}]}]);
