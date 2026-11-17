import {launch,assert} from './harness.mjs';
const h=await launch();
try{
 const {page}=h;
 await page.waitForFunction(()=>!document.querySelector('#messageInput').disabled,null,{timeout:10000});
 await page.fill('#messageInput','hello there');await page.click('#sendBtn');
 await page.waitForFunction(()=>document.querySelector('#generationStatus').textContent==='Response complete.',null,{timeout:10000});
 const text=await page.locator('#messages').innerText();
 console.log(JSON.stringify(text));
 assert(/Reply to: hello there/.test(text),'echoed reply');
 console.log('errors',h.errors);
}finally{await h.close();}
