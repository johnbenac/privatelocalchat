import {createRequire} from 'node:module';
import {encodeResourceFragment} from '/cosmoshot/privatelocalchat/chat/assistant/resource-link.mjs';
const {chromium}=createRequire('/cosmoshot/privatelocalchat/package.json')('playwright');
const feed=await (await fetch('https://cosmogenitor.com/discovery/v2.json',{headers:{Accept:'application/vnd.aiofourown.discovery.v2+json'}})).json();
const out={when:new Date().toISOString(),feedPublishedAt:feed.published_at,results:[]};
const b=await chromium.launch();
for(const r of feed.resources){
  const bytes=Buffer.from(await (await fetch(r.content.url)).arrayBuffer());
  const resource={v:1,family:r.family,title:r.title,version:r.content.version,bytes:r.content.bytes,sha256:r.content.sha256.replace(/^sha256:/,''),license:r.rights.license,page:r.inspect};
  const link=encodeResourceFragment(resource);
  const ctx=await b.newContext({viewport:{width:1200,height:850}});const p=await ctx.newPage();
  const hosts=new Set();ctx.on('request',q=>{const u=new URL(q.url());if(u.host!=='privatelocal.chat'&&!/^(data|blob|about):/.test(q.url()))hosts.add(u.host)});const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto('https://privatelocal.chat/');await p.waitForFunction(()=>window.__plcBooted&&window.plcShell,null,{timeout:90000});
  const commit=await p.evaluate(()=>window.APP_BUILD.commit);
  const row={id:r.id,linkChars:link&&link.length,commit};
  if(!link){row.error='link did not fit';out.results.push(row);await ctx.close();continue;}
  await p.goto('https://privatelocal.chat/'+link);await p.reload();await p.waitForFunction(()=>window.__plcBooted&&window.plcShell,null,{timeout:90000});
  await p.waitForSelector('.app-dialog:has-text("Open a resource from a discovery page")',{timeout:30000});
  const box=await p.locator('.app-dialog').innerText();const pageHref=await p.locator('.app-dialog a').getAttribute('href');
  row.box={title:box.includes(r.title),version:box.includes(r.content.version),size:box.includes(r.content.bytes+' bytes'),pageLinkIsInspect:pageHref===r.inspect};
  row.addedBefore=await p.evaluate(()=>JSON.parse(localStorage.getItem('plc.presets.v1')||'[]').length);
  // a wrong file first (one byte shorter), then the right one
  const [f1]=await Promise.all([p.waitForEvent('filechooser'),p.click('.app-dialog button:has-text("Choose the downloaded file")')]);await f1.setFiles({name:'x.json',mimeType:'application/json',buffer:bytes.slice(0,bytes.length-1)});
  await p.waitForFunction(()=>/but the listing says/.test(document.body.innerText),null,{timeout:15000});row.wrongSizeRefused=true;
  const [f2]=await Promise.all([p.waitForEvent('filechooser'),p.click('.app-dialog button:has-text("Choose the downloaded file")')]);await f2.setFiles({name:'ok.json',mimeType:'application/json',buffer:bytes});
  await p.waitForSelector('.app-dialog:has-text("Review preset")',{timeout:30000});
  const review=await p.locator('.app-dialog').innerText();row.reviewMatches=review.includes('This file matches the listing: version '+r.content.version);
  row.addedAtReview=await p.evaluate(()=>JSON.parse(localStorage.getItem('plc.presets.v1')||'[]').length);
  await p.click('.app-dialog .dialog-actions .primary');await p.waitForFunction(()=>JSON.parse(localStorage.getItem('plc.presets.v1')||'[]').length===1,null,{timeout:20000});
  const preset=await p.evaluate(()=>JSON.parse(localStorage.getItem('plc.presets.v1'))[0]);row.presetAdded={name:preset.name,starts:preset.prompt.slice(0,24)};
  row.otherHosts=[...hosts];row.pageErrors=errs.length;out.results.push(row);await ctx.close();
}
await b.close();console.log(JSON.stringify(out,null,1));
