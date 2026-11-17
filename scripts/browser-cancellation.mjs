import {chromium} from 'playwright';
import {writeFile} from 'node:fs/promises';
const c=await chromium.launchPersistentContext(process.env.BROWSER_PROOF_PROFILE || 'work/cancellation-browser-profile',{headless:true,executablePath:process.env.CHROME_EXECUTABLE,env:process.env,args:JSON.parse(process.env.BROWSER_ARGS || '[]')});
const p=await c.newPage();
p.on('pageerror',e=>console.log('pageerror',e.message));
const ticker=setInterval(async()=>{try{console.log('STATUS',await p.locator('#generationStatus').textContent());}catch{}},10000);
try {
 await p.goto(process.env.PROOF_ORIGIN || 'https://privatelocal.chat');await p.waitForFunction(()=>window.localModels?.state?.host.state==='running'&&!window.localModels.state.busy&&window.localModels.state.tiers[window.localModels.state.selection.tier].install.state!=='unknown',null,{timeout:120000});
 console.log('Installation inspected');await p.locator('#loadModel').click();await p.waitForFunction(()=>window.localModels.state.load.state==='ready',null,{timeout:120000});
 console.log('MODEL READY');await p.getByRole('button',{name:/start new chat/i}).click();
 await p.locator('#messageInput').fill('List the integers from 1 to 1000, one per line.');await p.locator('#sendBtn').click();
 await p.waitForFunction(()=>document.querySelector('#generationStatus').textContent.startsWith('The response was interrupted') || (document.querySelector('#generationStatus').textContent.startsWith('Generating on this device… ') && document.querySelector('#generationStatus').textContent.length>32),null,{timeout:120000});
 if((await p.locator('#generationStatus').textContent()).startsWith('The response was interrupted'))throw Error(await p.locator('#generationStatus').textContent());await p.locator('#stopGeneration').click();
 await p.waitForFunction(()=>document.querySelector('#generationStatus').textContent.startsWith('Response stopped'),null,{timeout:30000});
 console.log('CANCELLED');await p.locator('#messageInput').fill('Reply with one word: hello.');await p.locator('#sendBtn').click();await p.waitForFunction(()=>/^(Response complete\.|The response was interrupted)/.test(document.querySelector('#generationStatus').textContent),null,{timeout:120000});
 const status=await p.locator('#generationStatus').textContent();if(status!=='Response complete.')throw Error(status);
 const result={at:new Date().toISOString(),commit:await p.evaluate(()=>window.APP_BUILD.commit),cancelledDuringStreaming:true,nextGenerationCompleted:true,reply:(await p.locator('#messages').innerText()).slice(-150)};
 await writeFile('work/evidence/cancellation.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
} finally {clearInterval(ticker);await c.close();}
