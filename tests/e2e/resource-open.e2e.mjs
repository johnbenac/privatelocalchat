// A discovery page's "Open in Private Local Chat" link (board T461, chat/assistant/resource-link.mjs, contract agreed with aiofourown): the address DESCRIBES a file; opening it changes nothing; the person
// downloads the file and chooses it; PLC checks it is exactly the listed one (size, then SHA-256) and only then shows PLC's own preset review, where only Add adds anything. PLC never fetches the file or the page.
// The listed file is a REAL plain preset from Cosmogenitor's producer (tests/fixtures/presets/); the link is made with the same encoder aiofourown's page generator is tested against.
//   node scripts/e2e.mjs resource-open
// The browser profile is a new folder under PLC_E2E_PROFILE_ROOT (default: the system temporary folder); E2E_PORT_OFFSET moves the port (base 18571).
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {launch,assert} from './harness.mjs';
import {newProfileDir} from './profile-root.mjs';
import {encodeResourceFragment} from '../../chat/assistant/resource-link.mjs';
const ok=n=>console.log('PASS '+n);
const bytes=readFileSync(new URL('../fixtures/presets/emma-minimal.plc-preset-candidate.json',import.meta.url));
const listed={v:1,family:'preset-candidate',title:'Emma (minimal)',version:'1.0.0',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),license:'CC0-1.0',page:'https://cosmogenitor.example/characters/emma'};
const link=encodeResourceFragment(listed);
assert(link,'the link fits');
const h=await launch({port:18571,profileDir:newProfileDir('resource-open')});
const {context,page,origin}=h;
const outside=[];context.on('request',r=>{const u=new URL(r.url());if(u.origin!==origin&&!/^(data|blob|about):/.test(r.url()))outside.push(r.method()+' '+r.url());});
const ready=async()=>{await page.waitForSelector('#messageInput');await page.waitForFunction(()=>window.__plcBooted===true&&Boolean(window.plcShell),null,{timeout:20000});await page.waitForFunction(()=>!document.querySelector('#messageInput').disabled);};
const presets=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('plc.presets.v1')||'[]'));
const dialog=t=>page.locator('.app-dialog:has-text("'+t+'")');
const open=async(fragment)=>{await page.goto(origin+'/'+fragment);await page.reload();await ready();}; // the page is already loaded: going to an address that differs only by its fragment does not start it again, a link opened in a tab does
const chooseFile=async(name,content)=>{const [fc]=await Promise.all([page.waitForEvent('filechooser'),page.click('.app-dialog button:has-text("Choose the downloaded file")')]);await fc.setFiles({name,mimeType:'application/json',buffer:Buffer.isBuffer(content)?content:Buffer.from(content)});};
try{
 await open(link);
 await dialog('Open a resource from a discovery page').waitFor({timeout:15000});
 const text=await page.locator('.app-dialog').innerText();
 for(const piece of ['Emma (minimal)','A plain character preset','1.0.0',bytes.length+' bytes',listed.sha256.slice(0,8)+'…'+listed.sha256.slice(-8),'CC0-1.0','https://cosmogenitor.example/characters/emma','Nothing has been added yet','does not download this for you'])assert(text.includes(piece),'the box shows '+piece+': '+text.slice(0,500));
 assert((await presets()).length===0,'opening the link added nothing');
 assert(page.url().endsWith(link),'the address is not changed (it stays in the address bar)');
 const a=page.locator('.app-dialog a');assert(await a.getAttribute('rel')==='noopener noreferrer'&&await a.getAttribute('target')==='_blank','the page link opens on the person\'s click only, without handing over the app');
 await page.waitForTimeout(500);assert(outside.length===0,'opening the link fetched nothing: '+outside.join('|'));
 ok('the link shows what it describes and changes, fetches and adds nothing');

 // a file that is not the listed one: said plainly, the box stays, nothing changes
 await chooseFile('short.json',bytes.slice(0,bytes.length-3));
 await page.waitForFunction(()=>/but the listing says/.test(document.body.innerText),null,{timeout:10000});
 let status=await page.locator('.resource-status').innerText();
 assert(new RegExp('is '+(bytes.length-3)+' bytes, but the listing says '+bytes.length).test(status)&&/not the file that was listed/.test(status)&&!/\b(bad|invalid|corrupt)\b/i.test(status),'a file of another size is refused by saying what differed: '+status);
 const same=Buffer.from(bytes);const i=same.indexOf('Emma');same[i]=same[i]===0x45?0x46:0x45; // one letter changed, the same size
 await chooseFile('same-size.json',same);
 await page.waitForFunction(()=>/different checksum/.test(document.body.innerText),null,{timeout:10000});
 status=await page.locator('.resource-status').innerText();
 assert(/right size but a different checksum/.test(status)&&/not the file that was listed/.test(status),'a file of the same size but other content is refused by its checksum: '+status);
 assert((await presets()).length===0&&await dialog('Open a resource from a discovery page').count()===1,'nothing was added and the box offers another file');
 ok('a file that is not the listed one is refused with what differed, and the box offers another');

 // the right file: PLC's own preset review, and only Add adds
 await chooseFile('emma.json',bytes);
 await dialog('Review preset').waitFor({timeout:15000});
 const review=await dialog('Review preset').innerText();
 assert(/Read from a file from a discovery listing/.test(review)&&/This file matches the listing: version 1\.0\.0/.test(review),'the review box says where it came from and that it matched: '+review.slice(0,300));
 assert((await presets()).length===0,'nothing is added before Add');
 await page.click('.app-dialog .dialog-actions button:has-text("Cancel")');await page.waitForFunction(()=>!document.querySelector('.app-dialog'));
 assert((await presets()).length===0,'Cancel adds nothing');
 await page.reload();await ready();
 await dialog('Open a resource from a discovery page').waitFor({timeout:15000});
 await chooseFile('emma.json',bytes);await dialog('Review preset').waitFor({timeout:15000});
 await page.click('.app-dialog .dialog-actions .primary');
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('plc.presets.v1')||'[]').length===1,null,{timeout:10000});
 const added=(await presets())[0];assert(added.name==='Emma'||added.name.startsWith('Emma'),'the preset was added: '+added.name);
 ok('the listed file goes through PLC\'s own preset review, and only Add adds');

 // links that are refused: one alert, nothing changes, nothing fetched
 const before=JSON.stringify(await presets());
 const bad=[['two resources',link+'&'+link.slice(1)],['an unknown field','#resource='+Buffer.from(JSON.stringify({...listed,extra:1})).toString('base64url')],['too long','#resource='+'A'.repeat(3000)],['not JSON','#resource='+Buffer.from('nope').toString('base64url')],['another family','#resource='+Buffer.from(JSON.stringify({...listed,family:'presentation-package'})).toString('base64url')],['an http page','#resource='+Buffer.from(JSON.stringify({...listed,page:'http://x.example/a'})).toString('base64url')]];
 for(const [label,fragment] of bad){
  await open(fragment);await dialog('Link not opened').waitFor({timeout:15000});
  assert(/Nothing was changed\./.test(await page.locator('.app-dialog').innerText())&&await dialog('Open a resource').count()===0,label+': one message, no box');
  await page.click('.app-dialog button:has-text("OK")');await page.waitForFunction(()=>!document.querySelector('.app-dialog'));
  assert(JSON.stringify(await presets())===before,label+': presets unchanged');
 }
 ok('a link that is too long, doubled, unknown, another family or not https is refused once, with nothing changed');

 // a preset link and an ordinary address are not touched by the new route
 await open('#preset='+Buffer.from(JSON.stringify({name:'Via link',prompt:'p'})).toString('base64url'));
 await dialog('Review preset').waitFor({timeout:15000});assert(await dialog('Open a resource').count()===0,'a preset link still opens only the preset review');
 await page.click('.app-dialog .dialog-actions button:has-text("Cancel")');
 await open('');assert(await page.locator('.app-dialog').count()===0,'an ordinary address opens nothing');
 ok('preset links and ordinary addresses are unchanged');

 assert(outside.length===0,'nothing left the origin, the file and the page were never fetched: '+outside.join(' | '));
 assert(h.errors.length===0,'no page errors: '+h.errors.join(' | '));
 console.log('resource-open e2e: ok');
}catch(e){console.error(e);console.error(await page.locator('.app-dialog').innerText().catch(()=>''));process.exitCode=1;}
finally{await h.close();}
