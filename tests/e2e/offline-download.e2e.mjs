// A model download interrupted by losing the connection (offline plan, phase 1 variant). A RELEASE CHECK: it starts the real download of the small model,
// cuts the network once some of it has arrived, expects the app to say it is waiting (not to fail), brings the network back, expects the download to
// carry on by itself, and then cancels and removes the partial files. About 100 to 200 MB are fetched; nothing is kept.
//
//   node tests/e2e/offline-download.e2e.mjs
import {launch,assert} from './harness.mjs';

const ok=n=>console.log('ok   '+n);
const h=await launch({port:18381,serviceWorkers:'allow'});
try{
 const {page,context}=h;
 await page.waitForFunction(()=>window.localModels?.state,null,{timeout:120000});
 await page.evaluate(()=>window.localModels.setMode('local'));
 const bytes=()=>page.evaluate(()=>window.localModels.state?.transfer?.bytesDone||0);
 const recovery=()=>page.evaluate(()=>window.localModels.downloadRecovery);
 await page.evaluate(()=>window.localModels.download());
 for(let i=0;i<240&&await bytes()<60e6;i++)await page.waitForTimeout(1000);
 const before=await bytes();
 assert(before>=60e6,'the download got going ('+before+' bytes)');
 ok('online: the download is under way ('+Math.round(before/1e6)+' MB)');

 await context.setOffline(true);
 await page.waitForSelector('#connectionPill',{state:'visible',timeout:10000});
 // the app knows it is offline within a couple of seconds; the download must read as waiting at once, not as frozen or failed
 await page.waitForFunction(()=>/Waiting for a connection/.test(window.localModels.view.status),null,{timeout:15000});
 const text=await page.evaluate(()=>window.localModels.view.status);
 assert(!/failed|Failed to fetch|press Download/i.test(text),'the app says it is waiting, not that it failed: '+text);
 await page.waitForTimeout(45000); // past the stall timeout: still waiting, still wanted, still not "failed"
 const during=await recovery();
 assert(during.pending===true,'the download is still wanted, not dropped: '+JSON.stringify(during));
 const later=await page.evaluate(()=>window.localModels.view.status);
 assert(/Waiting for a connection/.test(later)&&!/failed|Failed to fetch|press Download/i.test(later),'and after the stall timeout it still says so: '+later);
 ok('offline: the download waits and the app says so ("'+text.slice(0,80)+'")');

 const atCut=await bytes();
 await context.setOffline(false);
 for(let i=0;i<120&&await bytes()<=atCut+5e6;i++)await page.waitForTimeout(1000);
 const after=await bytes();
 assert(after>atCut+5e6,'the download carried on by itself after the connection came back ('+atCut+' -> '+after+')');
 ok('back online: the download resumed by itself ('+Math.round(atCut/1e6)+' -> '+Math.round(after/1e6)+' MB)');

 await page.evaluate(()=>window.localModels.cancelDownload());
 await page.waitForFunction(()=>!window.localModels.state?.busy,null,{timeout:60000});
 await page.evaluate(()=>window.localModels.removeTier('light'));
 await page.waitForFunction(()=>!window.localModels.state?.busy,null,{timeout:60000});
 assert(await page.evaluate(()=>window.localModels.installed)===false,'the partial files were removed');
 ok('cleaned up: nothing left on this browser');
 console.log('offline-download e2e: ok');
}catch(e){console.error(e);process.exitCode=1;}
finally{await h.close();}
