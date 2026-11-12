// The neutral pages that ship with the app (run-kit/), and the generator that builds the pages of any site directory (docs/SITE-LAYER.md).
// Tests that pin the wording and policy of one particular site live in that site's repository.
import './helpers/install-app-config.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,rm,mkdir,access} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {PAGES,EMPTY_CONFIG,pagesPresent,renderPage,loadData,buildPublicSite,checkEntries,siteConfigScript,robotsTxt} from '../scripts/public-site.mjs';

const RUNKIT='run-kit',FIXTURE='tests/fixtures/site';
const decode=text=>text.replace(/&nbsp;/g,'\u00a0').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&ldquo;/g,'\u201c').replace(/&rdquo;/g,'\u201d').replace(/&middot;/g,'\u00b7').replace(/&amp;/g,'&');
const strip=html=>decode(html.replace(/<[^>]*>/g,'')).replace(/\s+/g,' ').trim();
const ids=html=>[...html.matchAll(/\sid="([^"]+)"/g)].map(m=>m[1]);
const exists=async file=>{try{await access(file);return true;}catch{return false;}};
const pages=await pagesPresent(RUNKIT);
const source=Object.fromEntries(await Promise.all(pages.map(async p=>[p.name,await readFile(path.join(RUNKIT,'pages',p.name,'index.html'),'utf8')])));
const data=await loadData({siteDir:RUNKIT});

// ---- the neutral pages ----------------------------------------------------------------------------------------------------------------------------------
const FAQ={
 'what-is-private-local-chat':'Private Local Chat lets you use AI in your web browser. Run a supported model on your own device or choose to connect an outside provider. Use it to draft, ask questions, explore ideas, and work through information.',
 'cost-and-account':'The app is free to use. On-device chat works without a Private Local Chat account or API key. Optional outside providers may require their own accounts and may charge for service.',
 'model-downloads':'Model files let your device generate replies locally. The first download can be substantial. Saved files can be reused while they remain in browser storage. Check the displayed download size and device guidance during setup.',
 'offline':'On a supported device, on-device text chat can work offline after the app and model are saved and ready. Check the readiness indicators and try it without a connection before relying on it while traveling. Connected providers and some voice features require network access.',
 'messages-and-providers':'In on-device text mode, the model processes conversation content on your device. When you choose a connected provider, the messages, instructions, document excerpts, and other context included in a request go to that provider. Its data practices apply to those requests.',
 'voice':"Voice uses the speech services available in your browser. Dictation and voice conversation may send audio to the browser's speech service. Speech processing and the location where text replies are generated are separate capabilities.",
 'compatibility':'Compatibility and performance depend on the device, browser, available memory, and selected model. Follow the setup guidance and consult the dated known-issues section. Include your device, browser, and model when reporting setup or performance problems.',
 'saved-conversations':"Saved conversations are kept in this browser's storage. Each browser and device has its own storage. Back up important work before clearing site data or moving devices. Browser storage removal or loss of the device can affect what remains available.",
 'app-lock':"App lock puts a passphrase screen over the app. You can also encrypt everything the app saves on this device with the same passphrase: conversations, documents, memory and settings are then unreadable without it, or without Face ID or Touch ID if you turn that on. Without encryption, App lock is a screen lock only, and saved data remains readable to someone with access to the browser's stored files. A forgotten passphrase cannot be recovered. Encrypted backups provide a separately protected copy of the included data.",
 'storage':'Unload (or clicking the loaded model in the model menu) unloads the model from working memory and keeps its downloaded files. Remove download deletes the saved model files, which can be downloaded again later. Back up important conversations before clearing all site data.',
 'checking-answers':'Review generated work and check facts that matter. Models differ in capability and can make mistakes, misunderstand a question, or invent details.',
 'transfer-settings':'Open Transfer settings, review the included fields, and choose whether to include your API token. An included token is encrypted with the password you enter. Create the link or QR code and communicate the password separately. The other listed settings remain readable to the recipient.',
 'unlock-token':'Import the ordinary settings and choose Continue without API token. You can retry the password later, enter a token manually, or create a new transfer from a device that still has the original token. A provider requiring authentication needs a usable token before it can answer.',
 'transfer-chats':"Open Transfer chats and backups, review the file's included data and protection, and export it. Import the file on the receiving device and review the Merge or Replace choice. Transfer provider configuration separately through Transfer settings.",
 'install':"Use your browser's Install or Add to Home Screen option where available. Check app and model readiness before relying on offline use."
};

test('the neutral set is Help and About, and its manifest says so',async()=>{
 assert.deepEqual(pages.map(p=>p.name),['help','about']);
 const manifest=JSON.parse(await readFile(path.join(RUNKIT,'site.json'),'utf8'));
 assert.deepEqual(manifest,{format:'plc-site/1',pages:{help:'/help/',about:'/about/'}},'no site block: a neutral copy names no site');
 assert.ok(!(await exists(path.join(RUNKIT,'site-config.json'))),'no operator facts');
});

test('every FAQ answer is published verbatim under its anchor',()=>{
 const html=source.help;
 for(const [anchor,answer] of Object.entries(FAQ)){
  const item=new RegExp('<details class="faq-item" id="'+anchor+'"[^>]*>([\\s\\S]*?)</details>').exec(html);
  assert.ok(item,'FAQ item #'+anchor);
  assert.equal(strip(/<p class="faq-answer">([\s\S]*?)<\/p>/.exec(item[1])[1]),answer,'answer text for #'+anchor);
 }
 const faq=/<section id="faq"[\s\S]*?<\/section>/.exec(html)[0];
 assert.equal([...faq.matchAll(/<details /g)].length,Object.keys(FAQ).length,'no unexpected FAQ items (the share answer names a public address, which a neutral copy does not have)');
});

// every place the app links to in a Help page (docs/SITE-LINKS.md): a copy that serves this Help page must not send a link to a missing anchor
const APP_ANCHORS=['getting-started','faq','troubleshooting','contact','community','install','stalled-download','load-failure','speech-availability','model-storage','offline-readiness'];
test('help has every anchor the app links to, each id once',()=>{
 const list=ids(source.help);
 for(const anchor of [...APP_ANCHORS.filter(a=>a!=='community'),'known-issues','transfer-settings','unlock-token','transfer-chats','unexpected-reload','backup-restoration',...Object.keys(FAQ)])assert.ok(list.includes(anchor),'#'+anchor);
 assert.equal(list.length,new Set(list).size,'duplicate ids: '+list.filter((x,i)=>list.indexOf(x)!==i));
 assert.ok(/<!--plc:community-->/.test(source.help)&&/<!--plc:toc-community-->/.test(source.help),'the community section is a region that appears when a site configures one');
});

test('known issues are rendered with device, browser, model, symptom, status, date and workaround',()=>{
 assert.ok(data.knownIssues.length>=1);
 for(const issue of data.knownIssues){
  for(const key of ['devices','browsers','models','symptom','status','workaround'])assert.ok(issue[key].length>5,issue.id+' '+key);
  assert.match(issue.verified,/^20\d\d-\d\d-\d\d$/);
  assert.ok(new RegExp('id="issue-'+issue.id+'"').test(source.help),'rendered in help: '+issue.id);
 }
 for(const label of ['Affected devices','Browsers','Models','What you see','Status','Last verified','Workaround'])assert.ok(source.help.includes('<dt>'+label+'</dt>'),label);
});

test('the neutral pages are semantic documents that name no site: one h1, a way into the app, links only to pages that exist',()=>{
 const titles=new Set(),descriptions=new Set();
 for(const page of pages){
  const html=source[page.name];
  assert.match(html,/^<!doctype html>\n<html lang="en">/);
  const title=/<title>([^<]+)<\/title>/.exec(html)?.[1];assert.ok(title&&!titles.has(title),'unique title '+title);titles.add(title);
  const description=/<meta name="description" content="([^"]*)"/.exec(html)?.[1];assert.ok(description&&description.length>50&&description.length<=200&&!descriptions.has(description),'description '+page.name);descriptions.add(description);
  assert.ok(!/rel="canonical"|og:url|og:image|twitter:image|application\/ld\+json/.test(html),page.name+' carries a tag that names a site');
  assert.equal([...html.matchAll(/<h1[ >]/g)].length,1,'one h1 on '+page.name);
  assert.ok(/<a class="button primary" href="\/">Open Private Local Chat<\/a>/.test(html)&&html.includes('<main id="main">')&&html.includes('class="skip-link"'),'landmarks on '+page.name);
  for(const other of pages)assert.ok(html.includes('href="'+other.path+'"'),page.name+' links to '+other.path);
  for(const gone of ['/privacy/','/updates/'])assert.ok(!html.includes('href="'+gone),page.name+' links to a page a neutral copy does not have: '+gone);
  assert.equal([...html.matchAll(/aria-current="page"/g)].length,2,'current page marked in both navs on '+page.name);
  assert.ok(!html.includes('data-product-share'),page.name+': there is no address to share');
  assert.ok(!/<script(?![^>]*type="module"[^>]*src="\/chat\/transfer\/public-pages\.mjs")[^>]*>/.test(html),'only the page script on '+page.name);
  for(const ref of html.matchAll(/<(?:link rel="stylesheet"|script|img|source)[^>]*\s(?:href|src|srcset)="([^"]+)"/g))assert.ok(ref[1].startsWith('/'),'same-origin only: '+ref[1]);
 }
});

// the strings a neutral copy must not carry: our domain, our organisations, the hosts of other organisations, analytics. (The default model source in app-config.json is allowed and is not in a page.)
const FORBIDDEN=['privatelocal.chat','aiofourown','AI of Our Own','Tech of Our Own','Cyberplanetary','Sonalon','Cloudflare','huggingface.co','raw.githubusercontent.com','googletagmanager','google-analytics'];
test('the neutral pages and manifest hold none of the strings a neutral copy must not carry',async()=>{
 for(const [name,html] of Object.entries(source))for(const word of FORBIDDEN)assert.ok(!html.toLowerCase().includes(word.toLowerCase()),name+' contains '+word);
 const manifest=await readFile(path.join(RUNKIT,'site.json'),'utf8');
 for(const word of FORBIDDEN)assert.ok(!manifest.toLowerCase().includes(word.toLowerCase()),'site.json contains '+word);
});

test('the committed neutral pages match what the generator makes with no configuration',()=>{
 for(const page of pages)assert.equal(renderPage(page.name,source[page.name],{config:EMPTY_CONFIG,data,pages}),source[page.name],page.name+' is out of date: run node scripts/public-site.mjs sync');
});

// ---- the generator, on a fixture site and on the neutral set --------------------------------------------------------------------------------------------------
async function build(name,env={}){
 const dir=path.join('work',name);
 await rm(dir,{recursive:true,force:true});await mkdir('work',{recursive:true});
 execFileSync('node',['scripts/build.mjs'],{stdio:'pipe',env:{...process.env,DEPLOY_BRANCH:'main',BUILD_OUT_DIR:dir,SITE_JSON_PATH:undefined,...env}});
 return dir;
}
const read=(dir,file)=>readFile(path.join(dir,file),'utf8');
const fixture=await build('pub-fixture',{SITE_DIR:FIXTURE});
const neutral=await build('pub-neutral',{SITE_DIR:''});
test.after(async()=>{await rm(fixture,{recursive:true,force:true});await rm(neutral,{recursive:true,force:true});});

test('a site directory with an address gets its pages, a sitemap, robots.txt and a feed at that address',async()=>{
 for(const p of PAGES)assert.ok(await exists(path.join(fixture,p.name,'index.html')),p.name);
 const sitemap=await read(fixture,'sitemap.xml');
 assert.deepEqual([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]),['https://site.example/',...PAGES.map(p=>'https://site.example'+p.path)]);
 assert.equal(await read(fixture,'robots.txt'),robotsTxt('https://site.example'));
 const rss=await read(fixture,'updates/rss.xml');
 assert.match(rss,/<guid isPermaLink="true">https:\/\/site\.example\/updates\/#second-note<\/guid>/);
 assert.ok(rss.indexOf('second-note')<rss.indexOf('first-note'),'newest first');
 assert.ok(!(await exists(path.join(fixture,'updates/entries.json'))),'the source data is not published');
 assert.ok(!rss.includes('privatelocal.chat'),'no address of ours: it comes from the site');
});

test('the organisation a site belongs to appears in every footer when its configuration names one, and nowhere else',async()=>{
 for(const p of PAGES)assert.ok((await read(fixture,p.name+'/index.html')).includes('<p>Private Local Chat is part of <a href="https://example.org/">Example Org</a>.</p>'),p.name);
 for(const p of pages)assert.ok(!(await read(neutral,p.name+'/index.html')).includes('is part of'),p.name+' (neutral)');
});

test('a neutral build has Help and About and nothing that needs an address: no sitemap, no robots.txt, no feed',async()=>{
 assert.ok(await exists(path.join(neutral,'help/index.html'))&&await exists(path.join(neutral,'about/index.html')));
 for(const name of ['privacy','updates'])assert.ok(!(await exists(path.join(neutral,name))),name+' does not exist in a neutral copy');
 for(const file of ['sitemap.xml','robots.txt','updates/rss.xml'])assert.ok(!(await exists(path.join(neutral,file))),file);
 const links=/window\.SITE_LINKS=([^;]*);/.exec(await read(neutral,'index.html'))[1];
 assert.deepEqual(JSON.parse(links),{format:'plc-site/1',pages:{help:'/help/',about:'/about/'}},'the app is told only about the pages that exist');
 const html=await read(neutral,'help/index.html');
 assert.ok(!html.includes('privatelocal.chat')&&!html.includes('rel="canonical"'));
 const worker=await read(neutral,'sw.js');
 assert.ok(worker.includes('/help/index.html')&&worker.includes('/about/index.html')&&!worker.includes('/privacy/index.html')&&!worker.includes('/updates/index.html'),'the offline copy holds the pages that exist');
});

test('every internal link and fragment in the built pages resolves, in the neutral build and in the fixture site',async()=>{
 for(const [dir,set] of [[neutral,pages],[fixture,PAGES]]){
  const built={};
  for(const page of set)built[page.path]=await read(dir,page.name+'/index.html');
  for(const [here,html] of Object.entries(built)){
   for(const [,href] of html.matchAll(/\shref="(\/[^"]*|#[^"]*)"/g)){
    const [pathname,fragment]=href.startsWith('#')?[here,href.slice(1)]:href.split('#');
    if(pathname.endsWith('/')){
     const target=pathname==='/'?await read(dir,'index.html'):built[pathname];
     assert.ok(target,'page for '+href+' on '+here);
     if(fragment&&pathname!=='/')assert.ok(ids(target).includes(fragment),'anchor '+href+' on '+here);
    }else assert.ok(await exists(path.join(dir,pathname)),'file for '+href+' on '+here);
   }
  }
 }
});

test('the licence documents are published and linked from every page of a build',async()=>{
 for(const dir of [neutral,fixture]){
  assert.equal(await read(dir,'LICENSE'),await readFile('LICENSE','utf8'));
  assert.equal(await read(dir,'THIRD-PARTY-NOTICES.md'),await readFile('THIRD-PARTY-NOTICES.md','utf8'));
 }
 for(const p of pages)assert.ok((await read(neutral,p.name+'/index.html')).includes('<a href="/LICENSE">Licence</a> &middot; <a href="/THIRD-PARTY-NOTICES.md">Notices</a>'),p.name+' footer');
});

test('the generator reads the pages that exist and refuses a site directory with a broken data file',async()=>{
 assert.deepEqual((await pagesPresent(FIXTURE)).map(p=>p.name),['help','about','privacy','updates']);
 assert.deepEqual(await pagesPresent('scripts'),[]);
 assert.throws(()=>checkEntries({entries:[{id:'x',date:'1 Nov',release:null,title:'t',summary:'s',points:[],help:[]}],knownIssues:[]}),/date/);
 assert.throws(()=>execFileSync('node',['scripts/build.mjs'],{stdio:'pipe',env:{...process.env,BUILD_OUT_DIR:'work/pub-missing',SITE_DIR:'no-such-folder'}}),/Command failed/);
});

test('configuration reaches the pages: the email action, the Community section and the script the app reads',async()=>{
 const file=path.join('work','pub-config.json');
 await writeFile(file,JSON.stringify({...EMPTY_CONFIG,supportEmail:'help@example.org',supportOwner:'Test Owner',discussionsUrl:'https://discussions.example.org/chat',discussionsOwner:'Community Owner',verifiedOn:'2026-11-01'}));
 const dir=await build('pub-configured',{SITE_DIR:RUNKIT,SITE_CONFIG_PATH:file});
 try{
  const html=await read(dir,'help/index.html');
  assert.ok(html.includes('href="mailto:help@example.org?subject=Private%20Local%20Chat">Email the project team</a>')&&html.includes('<strong>help@example.org</strong>, monitored by Test Owner'));
  assert.ok(html.includes('<section id="community"')&&html.includes('Community Owner'));
  assert.ok((await read(dir,'about/index.html')).includes('project community'));
  assert.ok((await read(dir,'index.html')).includes('window.SITE_CONFIG={"supportEmail":"help@example.org","supportOwner":"Test Owner","discussionsUrl":"https://discussions.example.org/chat"};'));
 }finally{await rm(dir,{recursive:true,force:true});await rm(file,{force:true});}
});

test('the service worker opens each public page offline and the app for anything else',async()=>{
 const worker=await readFile('scripts/service-worker.js','utf8');
 const code=/const PUBLIC_PAGES=[\s\S]*?\n}\n/.exec(worker)[0];
 const offlinePage=new Function(code+'return offlinePage;')();
 for(const page of ['help','about','privacy','updates'])for(const form of ['/'+page,'/'+page+'/','/'+page+'/index.html'])assert.equal(offlinePage(form),'/'+page+'/index.html');
 for(const other of ['/','/index.html','/unknown','/unknown/','/helpful/','/help/extra/','/updates/rss.xml'])assert.equal(offlinePage(other),'/index.html',other);
});
