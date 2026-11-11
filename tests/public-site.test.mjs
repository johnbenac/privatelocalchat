import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,rm,mkdir,access} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {
 PAGES,EMPTY_CONFIG,ROBOTS_TXT,renderPage,renderRss,renderSitemap,loadEntries,checkEntries,checkSiteConfig,siteConfigScript,formatDate,rfc822
} from '../scripts/public-site.mjs';

const ORIGIN='https://privatelocal.chat';
const decode=text=>text.replace(/&nbsp;/g,'\u00a0').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&ldquo;/g,'\u201c').replace(/&rdquo;/g,'\u201d').replace(/&middot;/g,'\u00b7').replace(/&amp;/g,'&');
const strip=html=>decode(html.replace(/<[^>]*>/g,'')).replace(/\s+/g,' ').trim();
const ids=html=>[...html.matchAll(/\sid="([^"]+)"/g)].map(m=>m[1]);
const meta=(html,attr,name)=>new RegExp('<meta '+attr+'="'+name+'" content="([^"]*)"').exec(html)?.[1];
const source=Object.fromEntries(await Promise.all(PAGES.map(async p=>[p.name,await readFile(p.name+'/index.html','utf8')])));
const data=await loadEntries();

// ---- the FAQ is published word for word, under stable anchors ----------------------------------------------------------------------------
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
 'share':"Open Share and choose your device's sharing option, copy the link, or display the QR code. The public address is https://privatelocal.chat/. Each person uses their own device and browser storage.",
 'transfer-settings':'Open Transfer settings, review the included fields, and choose whether to include your API token. An included token is encrypted with the password you enter. Create the link or QR code and communicate the password separately. The other listed settings remain readable to the recipient.',
 'unlock-token':'Import the ordinary settings and choose Continue without API token. You can retry the password later, enter a token manually, or create a new transfer from a device that still has the original token. A provider requiring authentication needs a usable token before it can answer.',
 'transfer-chats':"Open Transfer chats and backups, review the file's included data and protection, and export it. Import the file on the receiving device and review the Merge or Replace choice. Transfer provider configuration separately through Transfer settings.",
 'install':"Use your browser's Install or Add to Home Screen option where available. Check app and model readiness before relying on offline use."
};
test('every FAQ answer is published verbatim under its anchor',()=>{
 const html=source.help;
 for(const [anchor,answer] of Object.entries(FAQ)){
  const item=new RegExp('<details class="faq-item" id="'+anchor+'"[^>]*>([\\s\\S]*?)</details>').exec(html);
  assert.ok(item,'FAQ item #'+anchor);
  const found=/<p class="faq-answer">([\s\S]*?)<\/p>/.exec(item[1]);
  assert.ok(found,'answer for #'+anchor);
  assert.equal(strip(found[1]),answer,'answer text for #'+anchor);
 }
 const faq=/<section id="faq"[\s\S]*?<\/section>/.exec(html)[0];
 assert.equal([...faq.matchAll(/<details /g)].length,Object.keys(FAQ).length,'no unexpected FAQ items');
});

test('help has every anchor the app and the spec rely on, each id once',()=>{
 const list=ids(source.help);
 for(const anchor of ['getting-started','faq','troubleshooting','known-issues','contact','install','share','transfer-settings','unlock-token','transfer-chats','stalled-download','load-failure','unexpected-reload','offline-readiness','model-storage','backup-restoration','speech-availability',...Object.keys(FAQ)])assert.ok(list.includes(anchor),'#'+anchor);
 assert.equal(list.length,new Set(list).size,'duplicate ids: '+list.filter((x,i)=>list.indexOf(x)!==i));
 assert.ok(!list.includes('community'),'community is published only when configured');
 assert.equal([...source.help.matchAll(/\sid="install"/g)].length,1);
});

test('known issues carry device, browser, model, symptom, status, verification date and workaround',()=>{
 assert.ok(data.knownIssues.length>=1);
 for(const issue of data.knownIssues){
  for(const key of ['devices','browsers','models','symptom','status','workaround'])assert.ok(issue[key].length>5,issue.id+' '+key);
  assert.match(issue.verified,/^2026-\d\d-\d\d$/);
  assert.ok(new RegExp('id="issue-'+issue.id+'"').test(source.help),'rendered in help: '+issue.id);
 }
 for(const label of ['Affected devices','Browsers','Models','What you see','Status','Last verified','Workaround'])assert.ok(source.help.includes('<dt>'+label+'</dt>'),label);
});

// ---- metadata -------------------------------------------------------------------------------------------------------------------------------
test('every public page has a unique title, description, canonical, Open Graph and Twitter card',()=>{
 const titles=new Set(),descriptions=new Set();
 for(const page of PAGES){
  const html=source[page.name],url=ORIGIN+page.path;
  const title=/<title>([^<]+)<\/title>/.exec(html)?.[1];
  assert.ok(title&&!titles.has(title),'unique title '+title);titles.add(title);
  const description=meta(html,'name','description');
  assert.ok(description&&description.length>50&&description.length<=200&&!descriptions.has(description),'description '+page.name);descriptions.add(description);
  assert.equal(new RegExp('<link rel="canonical" href="([^"]+)"').exec(html)[1],url,'canonical '+page.name);
  assert.equal(meta(html,'property','og:type'),'website');
  assert.equal(meta(html,'property','og:site_name'),'Private Local Chat');
  assert.equal(meta(html,'property','og:title'),title);
  assert.ok(meta(html,'property','og:description').length>20);
  assert.equal(meta(html,'property','og:url'),url);
  assert.equal(meta(html,'property','og:image'),ORIGIN+'/brand/social-card-1200x630.png');
  assert.equal(meta(html,'property','og:image:type'),'image/png');
  assert.equal(meta(html,'property','og:image:width'),'1200');
  assert.equal(meta(html,'property','og:image:height'),'630');
  assert.ok(meta(html,'property','og:image:alt').length>20);
  assert.equal(meta(html,'name','twitter:card'),'summary_large_image');
  assert.equal(meta(html,'name','twitter:title'),title);
  assert.equal(meta(html,'name','twitter:description'),meta(html,'property','og:description'));
  assert.equal(meta(html,'name','twitter:image'),ORIGIN+'/brand/social-card-1200x630.png');
  assert.equal(meta(html,'name','twitter:image:alt'),meta(html,'property','og:image:alt'));
 }
});

test('pages are semantic documents with one h1, a way into the app and shared navigation',()=>{
 for(const page of PAGES){
  const html=source[page.name];
  assert.match(html,/^<!doctype html>\n<html lang="en">/);
  assert.equal([...html.matchAll(/<h1[ >]/g)].length,1,'one h1 on '+page.name);
  assert.ok(/<a class="button primary" href="\/">Open Private Local Chat<\/a>/.test(html),'open action on '+page.name);
  assert.ok(html.includes('<main id="main">')&&html.includes('class="skip-link"'),'landmarks on '+page.name);
  for(const other of PAGES)assert.ok(html.includes('href="'+other.path+'"'),page.name+' links to '+other.path);
  assert.equal([...html.matchAll(/aria-current="page"/g)].length,2,'current page marked in both navs on '+page.name);
  assert.ok(!/<script(?![^>]*type="module"[^>]*src="\/chat\/transfer\/public-pages\.mjs")[^>]*>/.test(html),'only the page script on '+page.name);
  for(const ref of html.matchAll(/<(?:link rel="stylesheet"|script|img|source)[^>]*\s(?:href|src|srcset)="([^"]+)"/g))assert.ok(ref[1].startsWith('/'),'same-origin only: '+ref[1]);
 }
 assert.ok(source.updates.includes('<link rel="alternate" type="application/rss+xml"')&&source.updates.includes('href="/updates/rss.xml"'));
});

test('the About page uses the intro verbatim, three examples, ownership, source and resources',()=>{
 const intro='Private Local Chat is a free place to use AI in your browser. Run a supported model on your own device, or choose an outside provider. Use it to draft, explore ideas, and work through information.';
 const html=source.about;
 assert.equal(strip(/<p class="lede" id="introduction">([\s\S]*?)<\/p>/.exec(html)[1]),intro);
 assert.equal(strip(/<p id="resource-intro">([\s\S]*?)<\/p>/.exec(html)[1]),intro);
 assert.equal([...html.matchAll(/<li><strong>/g)].length>=3,true);
 for(const text of ['Turn rough notes into a clear message','Explain a passage with follow-up questions','Compare a set of options'])assert.ok(html.includes(text),text);
 for(const href of ['https://github.com/johnbenac/privatelocalchat','https://github.com/johnbenac/privatelocalchat/releases','/help/#install','/brand/social-card-1200x630.png','/brand/wordmark-light.svg','/brand/wordmark-dark.svg','/brand/screenshot-demo-1.png'])assert.ok(html.includes('"'+href+'"'),href);
 assert.ok(html.includes('Install on this device')&&html.includes('Share resources')&&html.includes('Share Private Local Chat'));
 assert.ok(html.includes('Free AI chat in your browser. Run a supported model on your device, or choose an outside provider.'));
 assert.match(html,/<img src="\/brand\/screenshot-demo-1\.png" alt="[^"]{30,}"/,'screenshot has alt text');
 assert.doesNotMatch(html,/video|youtube|vimeo|\brating|\bstars\b|\breviews\b/i,'no demonstration video or rating claims');
});

test('the share panel is mounted on Help and About only',()=>{
 for(const name of ['help','about']){assert.equal([...source[name].matchAll(/data-product-share/g)].length,1,name);assert.ok(source[name].includes('<h2 id="share-title">Share Private Local Chat</h2>'));assert.ok(source[name].includes('/chat/transfer/public-pages.mjs'));}
 for(const name of ['privacy','updates'])assert.ok(!source[name].includes('data-product-share'));
});

test('the Privacy page covers every required topic and records its review date',()=>{
 const html=source.privacy;
 for(const anchor of ['on-device','providers','speech','downloads','storage','app-lock','backups','chat-exports','product-sharing','settings-transfers','support','logging'])assert.ok(ids(html).includes(anchor),'#'+anchor);
 assert.ok(html.includes('Last reviewed: <time class="last-updated" datetime="2026-11-11">2026-11-11</time>'));
 for(const text of ['assets.privatelocal.chat','huggingface.co','raw.githubusercontent.com','chatThreads','plc-docs','Session storage','chatConfig','chatEndpointTokens','Cloudflare Pages','https://www.cloudflare.com/privacypolicy/','no analytics, advertising or tracking scripts','Cloudflare Web Analytics','Page-load counting at privatelocal.chat','after the <code>#</code>','public'])assert.ok(html.includes(text),text);
 assert.doesNotMatch(html,/\b\d+\s*(days|day|hours|months)\b.{0,40}(log|retention)/i,'no unverified retention periods');
});

// ---- the updates source, its HTML and the feed ----------------------------------------------------------------------------------------
test('updates entries are valid, dated and include the new release entry',()=>{
 const first=data.entries.find(e=>e.id==='share-transfer-help');
 assert.equal(first.date,'2026-11-01');assert.equal(first.title,'Share, transfer settings, and help');
 const text=JSON.stringify(first);
 for(const topic of ['Share Private Local Chat','QR code','Transfer settings','password','separately','Transfer chats and backups','Help, About, Privacy and Updates'])assert.ok(text.includes(topic),topic);
 assert.deepEqual(data.entries.map(e=>e.date),[...data.entries.map(e=>e.date)].sort().reverse());
 assert.throws(()=>checkEntries({entries:[{...first,date:'1 Nov'}],knownIssues:data.knownIssues}),/date/);
 assert.throws(()=>checkEntries({entries:[first,first],knownIssues:data.knownIssues}),/duplicate/i);
});

test('the committed pages match what the build generates from entries.json with no configuration',()=>{
 for(const page of PAGES)assert.equal(renderPage(page.name,source[page.name],{config:EMPTY_CONFIG,data}),source[page.name],page.name+' is out of date: run node scripts/public-site.mjs sync');
});

test('the RSS feed agrees with the Updates page',()=>{
 const rss=renderRss(data);
 assert.match(rss,/^<\?xml version="1.0" encoding="UTF-8"\?>\n<rss version="2.0"/);
 const items=[...rss.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m=>m[1]);
 const articles=[...source.updates.matchAll(/<article class="update" id="([^"]+)"[\s\S]*?<h3[^>]*><a href="#[^"]+">([^<]+)<\/a><\/h3>\s*<p class="update-meta"><time datetime="([^"]+)">([^<]+)<\/time>/g)];
 assert.equal(items.length,data.entries.length);assert.equal(articles.length,items.length);
 articles.forEach(([,id,title,date,shown],i)=>{
  const item=items[i];
  assert.equal(decode(/<title>([^<]*)<\/title>/.exec(item)[1]),decode(title));
  assert.equal(/<guid isPermaLink="true">([^<]*)<\/guid>/.exec(item)[1],ORIGIN+'/updates/#'+id);
  assert.equal(/<link>([^<]*)<\/link>/.exec(item)[1],ORIGIN+'/updates/#'+id);
  assert.equal(/<pubDate>([^<]*)<\/pubDate>/.exec(item)[1],rfc822(date));
  assert.equal(shown,formatDate(date));
  assert.equal(id,data.entries[i].id);
 });
 assert.match(rss,/<atom:link href="https:\/\/privatelocal\.chat\/updates\/rss\.xml" rel="self" type="application\/rss\+xml"\/>/);
 assert.equal(rfc822('2026-11-01'),'Sun, 01 Nov 2026 12:00:00 GMT');
});

test('sitemap and robots follow the published policy',()=>{
 const sitemap=renderSitemap([{loc:ORIGIN+'/',lastmod:'2026-10-31'},...PAGES.map(p=>({loc:ORIGIN+p.path,lastmod:'2026-11-01'}))]);
 assert.deepEqual([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]),[ORIGIN+'/',ORIGIN+'/help/',ORIGIN+'/about/',ORIGIN+'/privacy/',ORIGIN+'/updates/']);
 assert.equal([...sitemap.matchAll(/<lastmod>\d{4}-\d\d-\d\d<\/lastmod>/g)].length,5);
 assert.equal(ROBOTS_TXT,'User-agent: *\nAllow: /\n\nSitemap: https://privatelocal.chat/sitemap.xml\n');
});

// ---- the configuration ----------------------------------------------------------------------------------------------------------------------
test('site-config.json has exactly the agreed keys, all unverified',async()=>{
 const config=JSON.parse(await readFile('site-config.json','utf8'));
 assert.deepEqual(Object.keys(config).sort(),['demo','discussionsOwner','discussionsUrl','hostingLogs','supportEmail','supportOwner','verifiedOn']);
 for(const value of Object.values(config))assert.equal(value,null);
});
test('configuration values are checked, never guessed',()=>{
 assert.throws(()=>checkSiteConfig({supportEmail:'not an address'}),/email/);
 assert.throws(()=>checkSiteConfig({discussionsUrl:'http://insecure.example'}),/https/);
 assert.throws(()=>checkSiteConfig({surprise:1}),/Unknown/);
 assert.throws(()=>checkSiteConfig({verifiedOn:'yesterday'}),/YYYY/);
 assert.deepEqual(checkSiteConfig({}),EMPTY_CONFIG);
 assert.equal(siteConfigScript({...EMPTY_CONFIG,supportOwner:'</script><b>'}),'<script>window.SITE_CONFIG={"supportEmail":null,"supportOwner":"\\u003c/script>\\u003cb>","discussionsUrl":null};</script>');
});

// ---- built output ---------------------------------------------------------------------------------------------------------------------------
async function buildTo(name,configPath){
 const dir=path.join('work',name);
 await rm(dir,{recursive:true,force:true});await mkdir('work',{recursive:true});
 execFileSync('node',['scripts/build.mjs'],{stdio:'pipe',env:{...process.env,DEPLOY_BRANCH:'main',BUILD_OUT_DIR:dir,...(configPath?{SITE_CONFIG_PATH:configPath}:{})}});
 return dir;
}
const read=(dir,file)=>readFile(path.join(dir,file),'utf8');
const exists=async file=>{try{await access(file);return true;}catch{return false;}};
const built=await buildTo('public-site-default');
const configured=await (async()=>{
 const file=path.join('work','public-site-test-config.json');
 await writeFile(file,JSON.stringify({...EMPTY_CONFIG,supportEmail:'help@example.org',supportOwner:'Test Owner',discussionsUrl:'https://discussions.example.org/privatelocalchat',discussionsOwner:'Community Owner',verifiedOn:'2026-11-02'}));
 return buildTo('public-site-configured',file);
})();
test.after(async()=>{await rm(built,{recursive:true,force:true});await rm(configured,{recursive:true,force:true});await rm(path.join('work','public-site-test-config.json'),{force:true});});

test('without configuration the Help page offers GitHub Issues as the public route and nothing invented',async()=>{
 const html=await read(built,'help/index.html');
 assert.ok(!html.includes('mailto:')&&!html.includes('Email the project team'));
 assert.ok(!html.includes('id="community"')&&!html.includes('href="#community"')&&!html.includes('>Community<'));
 assert.ok(html.includes('id="contact"')&&html.includes('https://github.com/johnbenac/privatelocalchat/issues/new/choose'));
 assert.match(html,/<strong>Public\.<\/strong> Issues on GitHub are public/);
 for(const page of PAGES)assert.ok(!(await read(built,page.name+'/index.html')).includes('>Community<'),page.name+' nav');
 const app=await read(built,'index.html');
 assert.ok(app.includes('<script>window.SITE_CONFIG={"supportEmail":null,"supportOwner":null,"discussionsUrl":null};</script>'));
 assert.ok(app.indexOf('window.APP_BUILD=')<app.indexOf('window.SITE_CONFIG=')&&/;<\/script><script>window\.SITE_CONFIG=/.test(app),'SITE_CONFIG follows APP_BUILD');
});

test('with configuration the Help page shows the email action with its recipient and the Community section',async()=>{
 const html=await read(configured,'help/index.html');
 assert.ok(html.includes('<a class="button primary" href="mailto:help@example.org?subject=Private%20Local%20Chat">Email the project team</a>'));
 assert.ok(html.includes('<strong>help@example.org</strong>, monitored by Test Owner'));
 assert.ok(html.includes('<section id="community"')&&html.includes('href="https://discussions.example.org/privatelocalchat"')&&html.includes('Community Owner'));
 assert.ok(html.includes('<li><a href="#community">Community</a></li>'));
 for(const page of PAGES)assert.ok((await read(configured,page.name+'/index.html')).includes('<li><a href="/help/#community">Community</a></li>'),page.name+' nav');
 assert.ok((await read(configured,'about/index.html')).includes('project community'));
 assert.ok((await read(configured,'index.html')).includes('window.SITE_CONFIG={"supportEmail":"help@example.org","supportOwner":"Test Owner","discussionsUrl":"https://discussions.example.org/privatelocalchat"};'));
});

test('the build emits the documents, sitemap, robots.txt and feed at their root paths with release-versioned assets',async()=>{
 const version=JSON.parse(await read(built,'version.json'));
 for(const page of PAGES){
  const html=await read(built,page.name+'/index.html');
  assert.ok(html.includes('href="/releases/'+version.commit+'/chat/public-pages.css"'),page.name+' stylesheet is versioned');
  assert.ok(!html.includes('href="/chat/')&&!html.includes('src="/chat/'));
  assert.ok(await exists(path.join(built,'releases',version.commit,'chat/public-pages.css')));
  assert.match(html,/<!--plc:site-nav-->\n<ul class="site-nav-list">/);
 }
 assert.ok((await read(built,'help/index.html')).includes('src="/releases/'+version.commit+'/chat/transfer/public-pages.mjs"'));
 assert.ok(await exists(path.join(built,'releases',version.commit,'chat/transfer/public-pages.mjs')));
 assert.equal(await read(built,'robots.txt'),ROBOTS_TXT);
 const sitemap=await read(built,'sitemap.xml');
 assert.deepEqual([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]),[ORIGIN+'/',...PAGES.map(p=>ORIGIN+p.path)]);
 assert.equal(await read(built,'updates/rss.xml'),renderRss(data));
 assert.ok(!(await exists(path.join(built,'updates/entries.json'))),'the source data is not published');
 const worker=await read(built,'sw.js');
 for(const file of ['/help/index.html','/about/index.html','/privacy/index.html','/updates/index.html','/updates/rss.xml','/brand/design-tokens.css','/releases/'+version.commit+'/chat/public-pages.css'])assert.ok(worker.includes('"'+file+'"'),file+' is in the offline shell');
 const headers=await read(built,'_headers');
 assert.ok(headers.includes('/sitemap.xml')&&headers.includes('/updates/rss.xml'));
});

test('the licence documents are published, linked from every page and kept out of the precache',async()=>{
 assert.equal(await read(built,'LICENSE'),await readFile('LICENSE','utf8'));
 assert.equal(await read(built,'THIRD-PARTY-NOTICES.md'),await readFile('THIRD-PARTY-NOTICES.md','utf8'));
 const headers=await read(built,'_headers');
 assert.match(headers,/\/LICENSE\n  Content-Type: text\/plain; charset=utf-8/);
 assert.match(headers,/\/THIRD-PARTY-NOTICES\.md\n  Content-Type: text\/markdown; charset=utf-8/);
 assert.ok(headers.startsWith('/*\n  Cross-Origin-Opener-Policy: same-origin\n  Cross-Origin-Embedder-Policy: require-corp'),'COOP and COEP still apply to every path');
 const worker=await read(built,'sw.js');
 assert.ok(!worker.includes('"/LICENSE"')&&!worker.includes('"/THIRD-PARTY-NOTICES.md"'));
 for(const page of PAGES){
  const html=await read(built,page.name+'/index.html');
  assert.ok(html.includes('(GNU General Public License, version 3) &middot; <a href="/LICENSE">Licence</a> &middot; <a href="/THIRD-PARTY-NOTICES.md">Notices</a>'),page.name+' footer');
 }
 const about=strip(await read(built,'about/index.html'));
 assert.match(about,/Licence and source Private Local Chat is released under the GNU General Public License, version 3/);
 assert.ok(about.includes('johnbenac/privatelocalchat')&&about.includes('ops/voice')&&about.includes('docs/VOICE-RUNTIME.md')&&about.includes('https://github.com/espeak-ng/espeak-ng'));
});

test('every internal link and fragment in the built pages resolves',async()=>{
 const pages={};
 for(const page of PAGES)pages[page.path]=await read(built,page.name+'/index.html');
 for(const [here,html] of Object.entries(pages)){
  for(const [,href] of html.matchAll(/\shref="(\/[^"]*|#[^"]*)"/g)){
   const [pathname,fragment]=href.startsWith('#')?[here,href.slice(1)]:href.split('#');
   if(pathname.endsWith('/')){
    const target=pathname==='/'?await read(built,'index.html'):pages[pathname];
    assert.ok(target,'page for '+href+' on '+here);
    if(fragment&&pathname!=='/')assert.ok(ids(target).includes(fragment),'anchor '+href+' on '+here);
   }else assert.ok(await exists(path.join(built,pathname)),'file for '+href+' on '+here);
  }
 }
});

test('the service worker opens each public page offline and the app for anything else',async()=>{
 const worker=await readFile('scripts/service-worker.js','utf8');
 const code=/const PUBLIC_PAGES=[\s\S]*?\n}\n/.exec(worker)[0];
 const offlinePage=new Function(code+'return offlinePage;')();
 for(const page of ['help','about','privacy','updates']){
  assert.equal(offlinePage('/'+page),'/'+page+'/index.html');
  assert.equal(offlinePage('/'+page+'/'),'/'+page+'/index.html');
  assert.equal(offlinePage('/'+page+'/index.html'),'/'+page+'/index.html');
 }
 for(const other of ['/','/index.html','/unknown','/unknown/','/helpful/','/help/extra/','/updates/rss.xml'])assert.equal(offlinePage(other),'/index.html',other);
 assert.match(worker,/cache\.match\(offlinePage\(url\.pathname\)\)/);
 assert.match(worker,/__CACHE_NAME__/);assert.match(worker,/__SHELL_FILES__/);
});
