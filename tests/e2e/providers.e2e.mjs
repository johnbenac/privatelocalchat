// The three ways to talk to a connected provider, end to end against the fake provider: Chat Completions, the Responses API and Anthropic Messages.
// Checks what was really sent (URL, key header, browser-access header, required fields) and that the streamed reply shows in the chat.
//   node scripts/e2e.mjs providers
import {launch,assert} from './harness.mjs';
const ok=n=>console.log('PASS '+n);
const h=await launch({port:18391});
const {page}=h;
const reqs=async()=>(await fetch(`http://127.0.0.1:${h.api.port}/__requests`)).json();
const done=()=>page.waitForFunction(()=>/^(Response complete\.|Response stopped|The response was interrupted|The response reached)/.test(document.querySelector('#generationStatus').textContent),null,{timeout:20000});
const configure=async(cfg)=>{
 await page.evaluate(c=>{const old=JSON.parse(sessionStorage.getItem('chatConfig')||'{}');sessionStorage.setItem('chatConfig',JSON.stringify({...old,...c}));},cfg);
 await page.reload();await page.waitForSelector('#messageInput');await page.waitForFunction(()=>window.__plcBooted===true&&Boolean(window.plcShell));await page.waitForFunction(()=>!document.querySelector('#messageInput').disabled);
};
const ask=async text=>{await page.click('#newChatBtn');await page.fill('#messageInput',text);await page.click('#sendBtn');await done();};
const lastChat=async(re)=>{const all=await reqs();return [...all].reverse().find(r=>re.test(r.url));};
try{
 const base=`http://127.0.0.1:${h.api.port}/v1`;

 await configure({endpoint:base,token:'sk-chat-key',format:'chat'});
 await ask('hello chat');
 let r=await lastChat(/chat\/completions$/);
 assert(r&&r.headers.authorization==='Bearer sk-chat-key','Chat Completions sends a bearer key');
 assert(Array.isArray(r.body.messages)&&r.body.stream===true,'Chat Completions body');
 assert(/Reply to: hello/.test(await page.locator('.message.assistant .message-body').innerText()),'chat reply shown');
 ok('chat completions');

 await configure({endpoint:base+'/responses',token:'sk-resp-key',format:'responses'});
 await ask('hello responses');
 r=await lastChat(/\/responses$/);
 assert(r,'a request went to /responses');
 assert(r.headers.authorization==='Bearer sk-resp-key','Responses sends a bearer key');
 assert(r.body.store===false&&r.body.stream===true&&Array.isArray(r.body.input),'Responses body: store false, stream, input items');
 assert(!r.body.messages,'no chat messages field');
 assert(/Reply to: hello/.test(await page.locator('.message.assistant .message-body').innerText()),'responses reply streamed into the chat');
 ok('responses api');

 await configure({endpoint:base+'/messages',token:'sk-ant-key',format:'anthropic'});
 await ask('hello anthropic');
 r=await lastChat(/\/messages$/);
 assert(r,'a request went to /messages');
 assert(r.headers['x-api-key']==='sk-ant-key'&&!r.headers.authorization,'Anthropic sends x-api-key, not a bearer');
 assert(/^\d{4}-\d{2}-\d{2}$/.test(r.headers['anthropic-version']||''),'anthropic-version header');
 assert(r.headers['anthropic-dangerous-direct-browser-access']==='true','browser-access header');
 assert(r.body.max_tokens>0&&r.body.stream===true&&Array.isArray(r.body.messages),'Anthropic body: max_tokens, stream, messages');
 assert(/Reply to: hello/.test(await page.locator('.message.assistant .message-body').innerText()),'anthropic reply streamed into the chat');
 ok('anthropic messages');

 // a reply cut off by the limit is reported as such in each format
 await ask('hello anthropic length');
 assert(/reached/i.test(await page.locator('#generationStatus').innerText()),'a length stop is reported (anthropic)');
 await configure({format:'responses'});
 await ask('hello responses length');
 assert(/reached/i.test(await page.locator('#generationStatus').innerText()),'a length stop is reported (responses)');
 ok('length stop in every format');

 // the format select is there, offers all three, and keeps the choice
 await page.evaluate(()=>window.plcApp?.openSettings?.());
 const options=await page.evaluate(()=>[...document.querySelectorAll('#apiFormatSelect option')].map(o=>o.value));
 assert(['chat','responses','anthropic'].every(v=>options.includes(v)),'format select offers all three: '+options.join(','));
 assert(await page.evaluate(()=>document.querySelector('#apiFormatSelect').value)==='responses','the chosen format is kept');
 ok('format select');
 assert(h.errors.length===0,'no page errors: '+h.errors.join(' | '));
 console.log('providers e2e: ok');
}catch(e){console.error(e);process.exitCode=1;}
finally{await h.close();}
