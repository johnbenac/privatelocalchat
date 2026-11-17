import {launch,assert} from './harness.mjs';
import {writeFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const h=await launch({port:18271});
const {page}=h;
const ok=name=>console.log('PASS',name);
const more=async(loc,action)=>{await loc.locator('[data-action="more"]').click();await page.click(`.thread-menu [data-menu-action="${action}"]`);};

const send=async text=>{await page.fill('#messageInput',text);await page.click('#sendBtn');await page.waitForFunction(()=>/^(Response complete\.|The response was interrupted)/.test(document.querySelector('#generationStatus').textContent));await page.waitForFunction(()=>!document.querySelector('#stopGeneration').offsetParent);};
const newChat=async()=>{await page.click('#newChatBtn');};
// the places a person reaches things: the profile menu and the Settings page
const openSettings=async section=>{if(!await page.locator('#settingsPage').isVisible()){await page.click('button[aria-label="This device menu"]');await page.click('.shell-pop-row:has-text("Settings")');}await page.click(`.settings-nav-item[data-section="${section}"]`);};
const closeSettings=async()=>{if(await page.locator('#settingsPage').isVisible())await page.click('button[aria-label="Close settings"]');};
// Archived and Recently deleted are lists reached from Settings > Data controls; the panel then shows a way back to active chats
const view=async name=>{if(name==='active'){await page.click('.thread-filter button[data-view="active"]');return;}await openSettings('data');await page.click(`.set-row:has-text("${name==='archived'?'Archived chats':'Recently deleted'}") button`);};
// import the way a person does: Settings > Data controls > "Import chats or backup" opens the file picker
const importFile=async file=>{await openSettings('data');const [fc]=await Promise.all([page.waitForEvent('filechooser'),page.click('#importBtn')]);await fc.setFiles(file);};
const search=async q=>{await page.keyboard.press('Control+k');await page.fill('.search-input',q);};
const names=async()=>page.locator('#threadList li[data-id] .thread-name').allInnerTexts();
const menu=async(title,item)=>{await page.locator('#threadList li[data-id]').filter({hasText:title}).locator('.thread-menu-btn').click();await page.locator('.thread-menu button',{hasText:item}).click();};
try{
 await page.waitForFunction(()=>!document.querySelector('#messageInput').disabled);
 // recent first, titles from the first prompt
 await send('Tell me about the Hermitage museum');
 await newChat();await send('Recipe for crème brûlée please');
 await newChat();await send('Plan a trip to Lisbon');
 assert(JSON.stringify((await names()).slice(0,3))===JSON.stringify(['Plan a trip to Lisbon','Recipe for crème brûlée please','Tell me about the Hermitage museum']),'recent first: '+JSON.stringify(await names()));
 await page.locator('#threadList li[data-id]').filter({hasText:'Hermitage'}).locator('.thread-name').click();
 await send('And its collections?');
 assert((await names())[0].includes('Hermitage'),'used chat moves to the top');
 ok('titles and recency');

 // search (Ctrl+K) finds titles and messages, accent-insensitively, and opens the passage
 await search('creme brulee');
 await page.waitForSelector('.search-item .search-item-title:has-text("Recipe")');
 await page.keyboard.press('Escape');
 await search('collections');
 await page.waitForSelector('.search-item mark.search-hit');
 assert(/collections/i.test(await page.locator('.search-item mark.search-hit').first().innerText()),'search shows the matching words');
 await page.locator('.search-item').first().click();
 assert(await page.locator('#searchOverlay').isHidden(),'search closes on choose');
 await page.waitForSelector('.message mark.search-hit');
 assert(/collections/i.test(await page.locator('.message mark.search-hit').first().innerText()),'passage highlighted');
 assert((await page.inputValue('#threadTitleInput')).includes('Hermitage'),'opened the right chat');
 await search('zzzz');await page.waitForSelector('.search-empty');
 assert(/No chats match/.test(await page.locator('.search-empty').innerText()),'empty result message');
 await page.fill('.search-input','');
 await page.waitForSelector('.search-group:has-text("Recent chats")');
 assert(await page.locator('.search-item').count()>=3,'an empty query lists recent chats');
 await page.keyboard.press('Escape');
 assert(await page.locator('#searchOverlay').isHidden(),'search closes with Escape');
 ok('search');

 // pin and archive
 await menu('Lisbon','Pin to top');
 assert((await names())[0].includes('Lisbon'),'pinned first');
 await menu('crème','Archive');
 assert(!(await names()).some(n=>n.includes('crème')),'archived chat left the list');
 await view('archived');
 assert((await names()).some(n=>n.includes('crème')),'archived view lists it');
 await search('brûlée');await page.waitForSelector('.search-item .search-item-title:has-text("Recipe")',{state:'detached',timeout:1500}).catch(()=>{});
 assert(await page.locator('.search-item:has-text("Recipe")').count()===0,'archived chats stay out of the default search');
 await page.click('.search-top button:has-text("Filters")');await page.selectOption('.search-filters select[aria-label="Include"]','only');
 await page.waitForSelector('.search-item:has-text("Recipe") .search-tag:has-text("archived")');
 await page.keyboard.press('Escape');
 await menu('crème','Unarchive');
 await view('active');
 assert((await names()).some(n=>n.includes('crème')),'unarchived');
 ok('pin and archive');

 // delete goes to Trash, Undo and Restore work, permanent delete asks first
 await menu('Lisbon','Delete');
 assert(!(await names()).some(n=>n.includes('Lisbon')),'deleted from list');
 await page.click('.toast-action');
 assert((await names()).some(n=>n.includes('Lisbon')),'undo restored');
 await menu('Lisbon','Delete');
 await view('trash');
 assert((await names()).some(n=>n.includes('Lisbon')),'in trash');
 await menu('Lisbon','Restore');
 await view('active');
 assert((await names()).some(n=>n.includes('Lisbon')),'restored from trash');
 await menu('Lisbon','Delete');
 await view('trash');
 await menu('Lisbon','Delete permanently');
 assert(await page.locator('.app-dialog').isVisible(),'confirmation shown');
 await page.click('.app-dialog button:has-text("Delete permanently")');
 assert(!(await names()).some(n=>n.includes('Lisbon')),'gone for good');
 await view('active');
 ok('trash, undo, restore');

 // temporary chats are not saved
 await page.click('.header-temp');
 assert(/Temporary chat/.test(await page.locator('#messages').innerText()),'banner');
 await send('this must not be saved');
 assert(!(await page.evaluate(()=>localStorage.getItem('chatThreads'))).includes('this must not be saved'),'not in storage');
 await page.reload();await page.waitForSelector('#messageInput');
 assert(!(await page.locator('#threadList').innerText()).includes('this must not be saved'),'gone after reload');
 ok('temporary chat');

 // projects: grouping and instructions reach the model
 await page.click('#threadList .list-add[aria-label="New project"]');
 await page.fill('.app-dialog input','Museums');await page.click('.app-dialog button:has-text("Create")');
 assert(/museums/i.test(await page.locator('#threadList').innerText()),'project heading');
 await page.locator('#threadList li.folder-heading .thread-menu-btn').click();
 await page.locator('.thread-menu button',{hasText:'Project instructions'}).click();
 await page.fill('.app-dialog textarea','Always answer in exactly one sentence.');await page.click('.app-dialog button:has-text("Save")');
 await page.locator('#threadList li[data-id]').filter({hasText:'Hermitage'}).locator('.thread-name').click();
 await page.click('#shellPlus');await page.click('.shell-pop-row:has-text("Work in a project")');
 await page.selectOption('#folderPick',{label:'Museums'});await page.click('.app-dialog button:has-text("Move")');
 await send('One more question');
 const reqs=await (await fetch(`http://127.0.0.1:${h.api.port}/__requests`)).json();
 assert(/Always answer in exactly one sentence/.test(JSON.stringify(reqs.at(-1).body.messages[0])),'project instructions sent');
 await search('Hermitage');await page.click('.search-top button:has-text("Filters")');await page.selectOption('.search-filters select[aria-label="Project"]',{label:'Museums'});
 await page.waitForSelector('.search-item:has-text("Hermitage")');
 await page.keyboard.press('Escape');
 ok('projects');

 // duplicate and branch
 await menu('Hermitage','Duplicate');
 assert((await names()).filter(n=>n.includes('Hermitage')).length===2,'duplicate listed');
 await more(page.locator('.message.user').first(),'branch-here');
 await page.waitForFunction(()=>document.querySelectorAll('.message').length===1);
 assert(/branch/.test(await page.inputValue('#threadTitleInput')),'branch titled');
 ok('duplicate and branch');

 // import: invalid files change nothing; a ChatGPT export previews and merges; replace is explicit
 const dir=mkdtempSync(join(tmpdir(),'plc-'));
 const bad=join(dir,'bad.json');writeFileSync(bad,'{"hello":1}');
 const before=await names();
 await importFile(bad);
 await page.waitForSelector('.app-dialog');
 assert(/Import failed/.test(await page.locator('.app-dialog').innerText()),'invalid file reported');
 await page.click('.app-dialog button:has-text("OK")');
 assert(JSON.stringify(await names())===JSON.stringify(before),'nothing changed');
 const gpt=join(dir,'conversations.json');
 writeFileSync(gpt,JSON.stringify([{title:'From ChatGPT',create_time:1700000000,current_node:'b',mapping:{a:{id:'a',parent:null,children:['b'],message:null},b:{id:'b',parent:'a',children:[],message:{author:{role:'user'},content:{content_type:'text',parts:['imported question']}}}}}]));
 await importFile(gpt);
 await page.waitForSelector('#importSummary');
 assert(/ChatGPT export/.test(await page.locator('.app-dialog').innerText()),'foreign format named');
 assert(/1 conversation will be added/.test(await page.locator('#importSummary').innerText()),'summary: '+await page.locator('#importSummary').innerText());
 await page.check('#importReplace');
 assert(/will be removed/.test(await page.locator('#importSummary').innerText()),'replace is explicit');
 await page.check('#importMerge');
 await page.click('.app-dialog button:has-text("Import")');
 await page.waitForFunction(()=>[...document.querySelectorAll('#threadList .thread-name')].some(n=>n.textContent.includes('From ChatGPT')));
 assert((await names()).filter(n=>n.includes('Hermitage')).length===3,'existing chats untouched by merge');
 ok('safe import');

 const unexpected=h.errors.filter(e=>!/API responded with status 500|network error/.test(e));
 assert(unexpected.length===0,'no unexpected page errors: '+JSON.stringify(unexpected));
 console.log('ALL PASS');
}catch(e){console.error(e.message);console.error(await page.locator('#threadList').innerText().catch(()=>''));console.error(h.errors);process.exitCode=1;}
finally{await h.close();}
