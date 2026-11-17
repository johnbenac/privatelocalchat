import {launch,assert} from './harness.mjs';
import {writeFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const dir=mkdtempSync(join(tmpdir(),'plc-docs-'));
function makePdf(pages){
 const objs=[];const add=s=>{objs.push(s);return objs.length;};
 add('<< /Type /Catalog /Pages 2 0 R >>');add('PLACEHOLDER');add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
 const kids=[];
 for(const text of pages){
  const content=text?`BT /F1 11 Tf 40 740 Td 14 TL ${text.match(/.{1,80}(\s|$)/g).map(l=>`(${l.trim().replace(/[()\\]/g,' ')}) Tj T*`).join(' ')} ET`:'';
  const c=add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  kids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${c} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`));
 }
 objs[1]=`<< /Type /Pages /Kids [${kids.map(k=>k+' 0 R').join(' ')}] /Count ${kids.length} >>`;
 let out='%PDF-1.4\n';const offsets=[];
 objs.forEach((o,i)=>{offsets.push(out.length);out+=`${i+1} 0 obj\n${o}\nendobj\n`;});
 const xref=out.length;
 out+=`xref\n0 ${objs.length+1}\n0000000000 65535 f \n${offsets.map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size ${objs.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
 return Buffer.from(out,'latin1');
}
const filler=n=>('Generic filler paragraph about nothing in particular number '+n+'. ').repeat(8);
const manual=Array.from({length:40},(_,i)=>i===27?'The warranty period is twenty-four months from the date of delivery. Claims need the original receipt. '+filler(i):filler(i));
const files={
 txt:join(dir,'notes.txt'),csv:join(dir,'sales.csv'),pdf:join(dir,'manual.pdf'),scan:join(dir,'scan.pdf'),zip:join(dir,'archive.zip'),png:join(dir,'pic.png'),lib:join(dir,'handbook.md')
};
writeFileSync(files.txt,'Meeting notes: the launch date is moved to 14 March.');
writeFileSync(files.csv,'region,units,revenue\nnorth,10,500\nsouth,7,350\neast,3,120\n');
writeFileSync(files.pdf,makePdf(manual));
writeFileSync(files.scan,makePdf(['','']));
writeFileSync(files.zip,'PK');
writeFileSync(files.png,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64'));
writeFileSync(files.lib,'# Handbook\n\nVacation policy: employees receive twenty-five days of paid leave per year.\n\n'+filler(1).repeat(40));
const h=await launch({port:18271});
const {page}=h;
const ok=name=>console.log('PASS',name);
const more=async(loc,action)=>{await loc.locator('[data-action="more"]').click();await page.click(`.thread-menu [data-menu-action="${action}"]`);};

const requests=async()=>(await (await fetch(`http://127.0.0.1:${h.api.port}/__requests`)).json());
const settle=async()=>{await page.waitForFunction(()=>/^(Response complete\.|The response was interrupted)/.test(document.querySelector('#generationStatus').textContent));await page.waitForFunction(()=>!document.querySelector('#stopGeneration').offsetParent);};
const send=async text=>{await page.fill('#messageInput',text);await page.click('#sendBtn');await settle();};
// attach the way a person does: composer + menu, then "Add photos & files" opens the file picker
const attach=async f=>{await page.click('#shellPlus');const [fc]=await Promise.all([page.waitForEvent('filechooser'),page.click('.shell-pop-row:has-text("Add photos & files")')]);await fc.setFiles(f);};
const library=async()=>{await page.click('#shellRail button[aria-label="Library"]');};
const newChat=async()=>{await page.click('#newChatBtn');};
try{
 await page.waitForFunction(()=>!document.querySelector('#messageInput').disabled);

 await attach(files.txt);await page.waitForSelector('#attachmentChips .chip:has-text("notes.txt")');
 await send('When is the launch?');
 let last=(await requests()).at(-1).body.messages;
 const userMsg=last.at(-1).content;
 assert(/\[Attached file: notes\.txt\]\nMeeting notes: the launch date is moved to 14 March\.\n\[End of notes\.txt\]\n\nWhen is the launch\?/.test(userMsg),'text file sent whole with the question: '+userMsg);
 assert(/Answer from that text/.test(last[0].content),'instructions to answer from the file');
 assert(await page.locator('.message.user .message-attachments .chip').count()===1,'attachment shown on the message');
 assert(await page.locator('#attachmentChips .chip').count()===0,'composer chips cleared');
 assert(await page.locator('.message-sources button:has-text("notes.txt")').count()===1,'source listed');
 ok('text file');

 await newChat();await attach(files.csv);await page.waitForSelector('#attachmentChips .chip');
 await send('Which region sold most?');
 assert(/Table with 3 data rows and 3 columns: region, units, revenue/.test(JSON.stringify((await requests()).at(-1).body.messages)),'csv described');
 ok('csv');

 await newChat();await attach(files.pdf);await page.waitForSelector('#attachmentChips .chip:has-text("40 pages")',{timeout:30000});
 await send('How long is the warranty period?');
 last=(await requests()).at(-1).body.messages;
 assert(/\[1\] manual\.pdf, page 28:/.test(last[0].content)&&/twenty-four months/.test(last[0].content),'best passage sent with its page');
 assert(!/Generic filler paragraph about nothing in particular number 3\./.test(last[0].content)&&last[0].content.length<9000,'only a few passages sent, not the whole document');
 const cited=page.locator('.message-sources button.cited');
 assert((await cited.innerText()).includes('[1] manual.pdf, p. 28'),'answer cites page: '+await page.locator('.message-sources').innerText());
 await cited.click();
 assert(/twenty-four months/.test(await page.locator('.app-dialog').innerText()),'source dialog shows the passage');
 await page.click('.app-dialog button:has-text("Close")');
 ok('pdf with citations');

 await newChat();await attach(files.scan);
 await page.waitForSelector('#toast.visible');
 assert(/OCR/.test(await page.locator('#toast').innerText()),'scanned pdf explained: '+await page.locator('#toast').innerText());
 assert(await page.locator('#attachmentChips .chip').count()===0,'nothing attached');
 await attach(files.zip);
 await page.waitForFunction(()=>/can.t be read here/.test(document.querySelector('#toast').textContent));
 ok('unreadable files are explained');

 await newChat();await attach(files.png);await page.waitForSelector('#attachmentChips .chip:has-text("pic.png")');
 await send('What is in this picture?');
 const imgReq=(await requests()).at(-1).body.messages.at(-1);
 assert(Array.isArray(imgReq.content)&&imgReq.content.some(p=>p.type==='image_url'&&/^data:image\/jpeg;base64,/.test(p.image_url.url))&&imgReq.content.some(p=>p.type==='text'),'image sent as image_url part');
 ok('image to a provider');

 // library
 await library();{const [fc]=await Promise.all([page.waitForEvent('filechooser'),page.click('.app-dialog button:has-text("Add documents")')]);await fc.setFiles(files.lib);}
 await page.waitForSelector('.app-dialog .list-row:has-text("handbook.md")');
 await page.click('.app-dialog button:has-text("Done")');
 await newChat();await send('How many days of paid leave do employees receive?');
 last=(await requests()).at(-1).body.messages;
 assert(/handbook\.md/.test(last[0].content)&&/twenty-five days of paid leave/.test(last[0].content),'library passage supplied');
 assert(await page.locator('.message-sources button:has-text("handbook.md")').count()===1,'library source cited');
 await library();await page.selectOption('.app-dialog select[aria-label^="Where handbook"]','off');await page.click('.app-dialog button:has-text("Done")');
 await newChat();await send('How many days of paid leave do employees receive?');
 assert(!/handbook\.md/.test(JSON.stringify((await requests()).at(-1).body.messages)),'library off means not used');
 ok('document library');

 // save as a file
 await newChat();await send('markdown please');
 await more(page.locator('.message.assistant'),'save-message');
 const labels=await page.locator('.app-dialog .list-row span').allInnerTexts();
 assert(labels.some(l=>/Markdown/.test(l))&&labels.some(l=>/CSV/.test(l))&&labels.some(l=>/js/.test(l)),'save options: '+labels);
 const [download]=await Promise.all([page.waitForEvent('download'),page.click('.app-dialog .list-row:has-text("CSV") button')]);
 assert(/\.csv$/.test(download.suggestedFilename()),'csv downloaded');
 await page.click('.app-dialog button:has-text("Done")');
 ok('save outputs');

 // editor
 await more(page.locator('.message.assistant'),'open-canvas');
 assert(/# Heading/.test(await page.inputValue('#canvasText')),'answer opened in editor');
 await page.fill('#canvasText','My edited draft');await page.waitForTimeout(600);
 await page.reload();await page.waitForSelector('#messageInput');
 await page.click('#canvasBtn');
 assert((await page.inputValue('#canvasText'))==='My edited draft','draft kept across reload');
 await page.click('button:has-text("Revise with assistant")');
 await page.fill('.app-dialog input','make it formal');await page.click('.app-dialog button:has-text("Send")');
 await settle();
 assert(/make it formal[\s\S]*My edited draft/.test(JSON.stringify((await requests()).at(-1).body.messages.at(-1))),'revise request sent with the draft');
 ok('editor');

 // temporary chats keep documents in memory only; deleting a chat releases its documents
 await page.click('#canvasPane [aria-label="Close editor"]');
 await page.click('.header-temp');await attach(files.txt);await page.waitForSelector('#attachmentChips .chip');
 const stored=await page.evaluate(async()=>{const db=await new Promise((r,j)=>{const q=indexedDB.open('plc-docs',1);q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error);});return new Promise(r=>{const q=db.transaction('docs').objectStore('docs').getAll();q.onsuccess=()=>r(q.result.map(d=>d.name));});});
 assert(stored.filter(n=>n==='notes.txt').length===1,'only the earlier saved chat holds notes.txt, not the temporary one: '+JSON.stringify(stored));
 ok('temporary chat documents stay in memory');

 const unexpected=h.errors.filter(e=>!/API responded with status 500|network error/.test(e));
 assert(unexpected.length===0,'no unexpected page errors: '+JSON.stringify(unexpected));
 console.log('ALL PASS');
}catch(e){console.error(e.message);console.error(await page.locator('#messages').innerText().catch(()=>''));console.error(h.errors);process.exitCode=1;}
finally{await h.close();}
