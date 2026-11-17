import {launch,assert} from './harness.mjs';
// Headless browsers have no GPU, so the model bridge is scripted: it reports the same progress phases the real one does.
const fakeModel=()=>{
 window.__installFake=()=>{
  const lm=window.localModels,st={ready:false};
  const def=(k,get)=>Object.defineProperty(lm,k,{get,configurable:true});
  def('mode',()=> 'local');def('ready',()=>st.ready);def('canPrepare',()=>true);def('supported',()=>true);def('installed',()=>st.ready);
  window.__setReady=v=>{st.ready=v;window.dispatchEvent(new Event('local-model-state'));};
  lm.prepareInfo=()=>({tier:window.__tier||'default',modelName:'Qwen3.5-9B',downloadBytes:window.__tier==='light'?2e9:5.6e9});
  lm.ensureReady=({signal,onProgress}={})=>new Promise((resolve,reject)=>{
   window.__prepCalls=(window.__prepCalls||0)+1;
   const steps=[{phase:'starting'},{phase:'download',fraction:0.25,bytesDone:1.4e9,totalBytes:5.6e9,etaSeconds:300,modelName:'Qwen3.5-9B'},{phase:'download',fraction:0.75,bytesDone:4.2e9,totalBytes:5.6e9,etaSeconds:80,modelName:'Qwen3.5-9B'},{phase:'check'},{phase:'load'}];
   let i=0;
   const tick=()=>{
    if(signal?.aborted)return reject(Object.assign(new Error('Stopped.'),{name:'AbortError'}));
    if(window.__cancelled){window.__cancelled=false;return reject(Object.assign(new Error('The download was stopped.'),{code:'cancelled'}));}
    if(st.ready&&i===0){onProgress?.({phase:'ready',fraction:1});return resolve();}
    if(window.__failPrep&&i>=2)return reject(new Error('The download could not finish. Check your connection.'));
    if(window.__holdPrep&&i>=3){setTimeout(tick,100);return;}
    if(i<steps.length){onProgress?.(steps[i++]);setTimeout(tick,window.__stepMs||250);}
    else{st.ready=true;onProgress?.({phase:'ready',fraction:1});window.dispatchEvent(new Event('local-model-state'));resolve();}
   };
   tick();
  });
  lm.switchTier=async t=>{window.__switched=t;};
  lm.cancelDownload=()=>{window.__cancelCalls=(window.__cancelCalls||0)+1;window.__cancelled=true;};
  lm.generate=async(messages,{onToken,onFinish}={})=>{window.__generateCalls=(window.__generateCalls||0)+1;if(window.__failFirstGenerate){window.__failFirstGenerate=false;throw new Error('model not ready yet');}const text='Local answer to: '+messages.at(-1).content;onToken?.(text);onFinish?.({finishReason:'stop'});return text;};
  window.dispatchEvent(new Event('local-model-state'));
 };
};
const run=async(label,viewport,touch)=>{
 const h=await launch({build:label==='desktop',viewport,touch,port:18700+Math.floor(Math.random()*90)});
 const {page}=h;
 try{
  await page.waitForFunction(()=>!document.querySelector('#messageInput').disabled);
  await page.evaluate(fakeModel);await page.evaluate(()=>window.__installFake());
  const status=()=>page.locator('#generationStatus').innerText();

  // 1. a person with no model sees the plain greeting (no setup wall) and a model pill that says nothing is downloaded yet
  await page.waitForSelector('#emptyState');
  assert(await page.locator('#emptySetup').count()===0&&await page.locator('.starter-prompts').count()===0,label+': the empty chat is just a greeting');
  assert(await page.locator('#emptyState').isVisible()&&(await page.locator('#emptyState h2').innerText()).trim().length>0,label+': the greeting is shown');
  assert(await page.locator('#modelPill').isVisible()&&/Not downloaded/.test(await page.locator('#modelPill').getAttribute('title')),label+': the model pill says the model is not downloaded: '+await page.locator('#modelPill').getAttribute('title'));

  // 2. a first message with nothing downloaded starts the download and is answered by itself
  await page.evaluate(()=>{window.__setReady(false);window.__tier='default';window.__stepMs=250;window.__holdPrep=true;});
  await page.fill('#messageInput','Hello from my wife');
  await page.click('#sendBtn');
  await page.waitForSelector('.message.assistant .prep-card');
  const waitingCard=await page.locator('.message.assistant .prep-card').innerText();
  assert(/Your message is saved/.test(waitingCard)&&/Waiting to send:\s*.?Hello from my wife/.test(waitingCard),label+': names the message that is waiting: '+waitingCard);
  assert(await page.locator('.message.assistant .prep-card button:has-text("Cancel message")').isVisible()&&await page.locator('.message.assistant .prep-card button:has-text("Cancel download")').isVisible(),label+': both cancels offered');
  assert(/Hello from my wife/.test(await page.locator('.message.user').innerText()),label+': her message is in the chat at once');
  assert(await page.locator('#stopGeneration').isVisible()&&!(await page.locator('#sendBtn').isVisible()),label+': Stop is available while waiting');
  await page.waitForFunction(()=>document.querySelector('.message.assistant .prep-bar')?.getAttribute('aria-valuenow')==='75',null,{timeout:8000});
  const card=await page.locator('.message.assistant .prep-card').innerText();
  assert(/Downloading the chat model/.test(card)&&/75%/.test(card)&&/4\.2 GB of 5\.6 GB/.test(card)&&/about 5\.6 GB/.test(card)&&/works without a connection/.test(card),label+': card says what is happening: '+card);
  assert(await page.locator('.message.assistant .prep-actions .link-btn:has-text("smaller")').innerText()==='Use the smaller model instead (faster to download)',label+': escape hatch on the larger model');
  await page.click('.message.assistant .prep-actions .link-btn:has-text("smaller")');
  assert(await page.evaluate(()=>window.__switched)==='light',label+': switched to the smaller model');
  await page.evaluate(()=>{window.__holdPrep=false;});
  const box=await page.locator('.message.assistant .prep-card').boundingBox();
  assert(box.x>=0&&box.x+box.width<=viewport.width+1,label+': card fits the screen '+JSON.stringify(box));
  await page.waitForFunction(()=>/Local answer to: Hello from my wife/.test(document.querySelector('.message.assistant')?.innerText||''),null,{timeout:15000});
  assert(await page.locator('.prep-card').count()===0,label+': progress card replaced by the answer');
  assert(/Response complete/.test(await status()),label+': completes normally');

  // 3. Stop while preparing leaves her message and no half-made reply
  await page.evaluate(()=>{window.__setReady(false);window.__holdPrep=true;});
  await page.fill('#messageInput','second question');await page.click('#sendBtn');
  await page.waitForSelector('.message.assistant:last-of-type .prep-card');
  await page.click('.message.assistant:last-of-type .prep-card button:has-text("Cancel message")');
  await page.waitForFunction(()=>/Response stopped/.test(document.querySelector('#generationStatus').textContent));
  assert(!(await page.evaluate(()=>window.__cancelCalls)),label+': cancelling the message does not cancel the download');
  assert(await page.locator('.prep-card').count()===0,label+': card gone after Stop');
  assert(await page.locator('.message.user').count()===2&&await page.locator('.message.assistant').count()===1,label+': her question stays, no empty reply');

  // 3b. cancelling the download stops the waiting reply too, without calling it an error
  await page.evaluate(()=>{window.__holdPrep=true;});
  await page.fill('#messageInput','a message while downloading');await page.click('#sendBtn');
  await page.waitForSelector('.message.assistant:last-of-type .prep-card');
  await page.click('.message.assistant:last-of-type .prep-card button:has-text("Cancel download")');
  await page.waitForFunction(()=>/The download was stopped/.test(document.querySelector('#generationStatus').textContent));
  assert((await page.evaluate(()=>window.__cancelCalls))===1,label+': the download was cancelled');
  assert(await page.locator('.message-meta.failed').count()===0&&await page.locator('.prep-card').count()===0,label+': no error shown for a cancel');
  assert(/a message while downloading/.test(await page.locator('#messages').innerText()),label+': her message is still there');

  // 4. a failed download is explained and Retry does not duplicate her message
  await page.evaluate(()=>{window.__holdPrep=false;window.__failPrep=true;});
  await page.fill('#messageInput','third question');await page.click('#sendBtn');
  await page.waitForSelector('.message-meta.failed',{timeout:10000});
  assert(/could not finish/.test(await page.locator('.message-meta.failed').innerText()),label+': failure explained');
  await page.evaluate(()=>{window.__failPrep=false;});
  const users=await page.locator('.message.user').count();
  await page.click('[data-action="retry"]');
  await page.waitForFunction(()=>/Local answer to: third question/.test(document.querySelector('#messages').innerText),null,{timeout:15000});
  assert(await page.locator('.message.user').count()===users,label+': retry adds nothing');

  // 4b. the first request after loading fails once: the app retries by itself, no Retry button
  await page.evaluate(()=>{window.__setReady(false);window.__holdPrep=false;window.__failPrep=false;window.__failFirstGenerate=true;window.__generateCalls=0;});
  await page.fill('#messageInput','after a hiccup');await page.click('#sendBtn');
  await page.waitForFunction(()=>/Local answer to: after a hiccup/.test(document.querySelector('#messages').innerText),null,{timeout:15000});
  assert((await page.evaluate(()=>window.__generateCalls))===2,label+': generated twice, the person saw one answer');
  assert(await page.locator('[data-action="retry"]').count()===0&&await page.locator('.message-meta.failed').count()===0,label+': no failure and no Retry for a transient hiccup');

  // 5. once the model is loaded, sending is instant again
  await page.fill('#messageInput','fourth');await page.click('#sendBtn');
  await page.waitForFunction(()=>/Local answer to: fourth/.test(document.querySelector('#messages').innerText));
  assert(await page.locator('.prep-card').count()===0,label+': no progress card once ready');

  const unexpected=h.errors.filter(e=>!/network error|The download could not finish|Retrying the first request once|model not ready yet/.test(e));
  assert(unexpected.length===0,label+': no unexpected errors '+JSON.stringify(unexpected));
  console.log('PASS',label);
 }catch(e){console.error(label,e.message);console.error(await page.locator('#messages').innerText().catch(()=>''));console.error(h.errors);process.exitCode=1;}
 finally{await h.close();}
};
await run('desktop',{width:1280,height:800},false);
await run('phone',{width:390,height:760},true);
