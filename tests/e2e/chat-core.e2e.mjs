import {launch,assert} from './harness.mjs';
const h=await launch({});
const {page}=h;
const ok=name=>console.log('PASS',name);
const send=async text=>{await page.fill('#messageInput',text);await page.click('#sendBtn');};
const done=async(re=/^(Response complete\.|Response stopped|The response was interrupted|The response reached)/)=>page.waitForFunction(s=>new RegExp(s).test(document.querySelector('#generationStatus').textContent),re.source,{timeout:20000});
const count=sel=>page.locator(sel).count();
try{
 await page.context().grantPermissions(['clipboard-read','clipboard-write']);
 await page.waitForFunction(()=>!document.querySelector('#messageInput').disabled);

 // Markdown is rendered, and hostile content is inert
 const tracker=[];page.on('request',r=>{if(/tracker\.invalid/.test(r.url()))tracker.push(r.url());});
 await send('markdown please');await done();
 assert(await count('.message.assistant h3')===1,'heading rendered');
 assert(await count('.message.assistant strong')===1,'bold rendered');
 assert(await count('.message.assistant table th')===2,'table rendered');
 assert(await count('.message.assistant ul li')===2,'list rendered');
 assert((await page.locator('.code-block code').innerText()).includes('const answer = 42;'),'code block');
 assert(await count('.message.assistant script')===0&&await count('.message.assistant img')===0,'no script/img elements');
 assert(await page.evaluate(()=>window.__pwned)===undefined,'no script ran');
 assert(await count('.message.assistant a[href^="javascript"]')===0,'no javascript: link');
 assert(tracker.length===0,'no remote image request');
 assert(/<script>/.test(await page.locator('.message.assistant').innerText()),'script tag shown as text');
 ok('markdown renders safely');

 // Copy answer and copy code
 await page.click('.message.assistant [data-action="copy-message"]');
 assert((await page.evaluate(()=>navigator.clipboard.readText())).includes('# Heading'),'copy answer');
 await page.click('.code-action[data-action="copy-code"]');
 assert((await page.evaluate(()=>navigator.clipboard.readText()))==='const answer = 42;','copy code only');
 ok('copy answer and code');

 // Title comes from the first prompt
 assert((await page.inputValue('#threadTitleInput'))==='markdown please','derived title');
 ok('title derived from first prompt');

 // Streaming happens in the answer bubble; Stop keeps what was written; Continue appends
 await page.click('#newChatBtn');
 await send('slow story');
 await page.waitForFunction(()=>/word3/.test(document.querySelector('.message.assistant .message-body')?.textContent||''),null,{timeout:10000});
 assert(await page.locator('#stopGeneration').isVisible(),'stop visible');
 assert(await page.locator('#messageInput').isEnabled(),'composer stays usable while generating');
 assert(!(await page.locator('#sendBtn').isVisible())&&await page.locator('#stopGeneration').isVisible(),'Send gives way to Stop while an answer is written');
 await page.click('#stopGeneration');await done();
 const stopped=await page.locator('.message.assistant .message-body').innerText();
 assert(/word0/.test(stopped)&&!/word199/.test(stopped),'partial answer kept');
 assert(/Response stopped/.test(await page.locator('.message-meta').first().innerText()),'stopped marker');
 await page.click('[data-action="continue"]');
 await page.waitForFunction(()=>/Response complete/.test(document.querySelector('#generationStatus').textContent),null,{timeout:20000});
 const cont=await page.locator('.message.assistant .message-body').innerText();
 assert(cont.length>stopped.length&&cont.startsWith(stopped.trim().slice(0,20)),'continued text appended to the same answer');
 const reqs=await (await fetch(`http://127.0.0.1:${h.api.port}/__requests`)).json();
 assert(/Continue exactly where/.test(JSON.stringify(reqs.at(-1).body.messages.at(-1))),'continue prompt sent');
 assert(JSON.stringify(reqs.at(-1).body.messages).includes('word0'),'partial answer sent as context');
 assert(await count('.message.assistant')===1,'one assistant message');
 ok('stream, stop, continue');

 // A stop before anything arrives leaves nothing behind
 // Failure keeps the prompt, Retry does not duplicate it
 await page.click('#newChatBtn');
 await send('fail-once please');await done();
 assert(/interrupted/.test(await page.locator('.message-meta.failed').innerText()),'failure shown on the message');
 assert(await count('.message.user')===1,'one user message');
 await page.click('[data-action="retry"]');await done();
 assert(await count('.message.user')===1&&await count('.message.assistant')===1,'retry adds nothing');
 assert(/Reply to: fail-once/.test(await page.locator('.message.assistant').innerText()),'retry succeeded');
 ok('failed request retried in place');

 // Connection dropped mid-answer: what arrived is kept
 await page.click('#newChatBtn');
 await send('fail-mid please');await done();
 const mid=await page.locator('.message.assistant .message-body').innerText();
 assert(/Partial text before/.test(mid),'partial text kept after a dropped connection');
 assert(await count('[data-action="continue"]')===1,'continue offered');
 ok('partial output survives a failure');

 // Length-limited answers are distinguished
 await page.click('#newChatBtn');
 await send('length test');await done(/The response reached|Response complete/);
 assert(/context limit/.test(await page.locator('.message-meta').first().innerText()),'length marker');
 ok('length-limited answer is marked');

 // Regenerate keeps the earlier answer
 await page.click('#newChatBtn');
 await send('first');await done();
 await page.click('[data-action="regenerate"]');await page.waitForFunction(()=>/Response complete/.test(document.querySelector('#generationStatus').textContent)&&document.querySelector('.version-switch'));
 assert(/2\/2/.test(await page.locator('.version-switch').innerText()),'two versions');
 await page.click('[data-action="prev-version"]');
 assert(await count('.message.assistant')===1,'still one bubble');
 assert((await page.locator('.version-switch').innerText()).includes('1/2'),'switched back to the first answer');
 ok('regenerate keeps earlier answers');

 // Edit an earlier prompt: later messages are replaced, Undo restores them
 await page.click('#newChatBtn');
 await send('alpha');await done();await send('beta');await done();
 assert(await count('.message')===4,'four messages');
 await page.locator('.message.user').first().locator('[data-action="edit-message"]').click();
 await page.fill('.edit-box textarea','alpha edited');await page.click('.edit-box button:has-text("Save and resend")');
 await page.waitForFunction(()=>/Response complete/.test(document.querySelector('#generationStatus').textContent)&&document.querySelectorAll('.message').length===2,null,{timeout:15000});
 assert(/alpha edited/.test(await page.locator('#messages').innerText())&&!/beta/.test(await page.locator('#messages').innerText()),'tail replaced');
 await page.click('.toast-action');
 await page.waitForFunction(()=>document.querySelectorAll('.message').length===4&&/beta/.test(document.querySelector('#messages').textContent));
 assert(/alpha/.test(await page.locator('.message.user').first().innerText())&&!/edited/.test(await page.locator('#messages').innerText()),'undo restored');
 ok('edit and undo');

 // Drafts are per conversation and survive a reload
 await page.click('#newChatBtn');
 await page.fill('#messageInput','draft for chat B');
 const threadsBefore=await page.locator('#threadList li[data-id]').count();
 await page.locator('#threadList li[data-id]').nth(1).click();
 assert((await page.inputValue('#messageInput'))==='','other chat has no draft');
 await page.fill('#messageInput','draft for chat A');
 await page.locator('#threadList li[data-id]').nth(0).click();
 assert((await page.inputValue('#messageInput'))==='draft for chat B','first chat draft restored');
 await page.reload();await page.waitForSelector('#messageInput');await page.waitForFunction(()=>document.querySelector('#messageInput').value!=='');
 assert((await page.inputValue('#messageInput'))==='draft for chat B','draft survives reload');
 ok('drafts per conversation');

 // Switching away while a reply is being written does not move it
 await page.click('#newChatBtn');
 await send('slow routing');
 await page.waitForFunction(()=>/word2/.test(document.querySelector('.message.assistant .message-body')?.textContent||''));
 const titleA=await page.inputValue('#threadTitleInput');
 await page.click('#newChatBtn');
 assert(await count('.message')===0,'new chat is empty');
 await page.waitForFunction(()=>/Response complete/.test(document.querySelector('#generationStatus').textContent),null,{timeout:20000});
 assert(await count('.message')===0,'reply did not land in the other chat');
 await page.locator('#threadList li[data-id]').filter({hasText:titleA}).first().click();
 assert(/word199/.test(await page.locator('.message.assistant').innerText()),'reply is in its own chat');
 ok('replies stay in their own conversation');

 // Enter sends, Shift+Enter adds a line
 await page.click('#newChatBtn');
 await page.fill('#messageInput','line one');await page.press('#messageInput','Shift+Enter');await page.keyboard.type('line two');
 assert((await page.inputValue('#messageInput'))==='line one\nline two','shift+enter newline');
 await page.press('#messageInput','Enter');await done();
 assert(await count('.message.user')===1,'enter sent');
 ok('enter convention');

 // The composer stays on screen with a long conversation; the transcript scrolls; Jump to latest
 await page.click('#newChatBtn');
 for(let i=0;i<8;i++){await send('filler '+i+' '.repeat(1));await done();}
 const box=await page.locator('#messageForm').boundingBox();
 assert(box.y+box.height<=800+1,'composer inside the viewport: '+JSON.stringify(box));
 assert(await page.evaluate(()=>{const m=document.querySelector('#messages');return m.scrollHeight>m.clientHeight&&document.documentElement.scrollHeight<=window.innerHeight+1;}),'only the transcript scrolls');
 await page.evaluate(()=>{document.querySelector('#messages').scrollTop=0;});
 await page.waitForSelector('#jumpLatest:not([hidden])');
 await page.click('#jumpLatest');
 assert(await page.evaluate(()=>{const m=document.querySelector('#messages');return m.scrollHeight-m.scrollTop-m.clientHeight<5;}),'jumped to latest');
 ok('layout and scrolling');

 const unexpected=h.errors.filter(e=>!/API responded with status 500|network error/.test(e));
 assert(unexpected.length===0,'no unexpected page errors: '+JSON.stringify(unexpected));
 console.log('ALL PASS');
}catch(e){console.error(e.message);console.error(await page.locator('#messages').innerText().catch(()=>''));console.error(h.errors);process.exitCode=1;}
finally{await h.close();}
