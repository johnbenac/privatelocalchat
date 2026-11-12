import {cp,readFile,writeFile,readdir,mkdir,rm,rename} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {buildPublicSite,loadSiteConfig,checkSiteConfig,siteConfigScript} from './public-site.mjs';
import {checkSiteJson,normalizedSiteLinks} from '../chat/site/site-links.mjs';
import {buildAppConfig} from '../runtime/config/app-config.mjs';
import {resolveTarget} from './targets.mjs';
import {toPagesHeaders} from './headers.mjs';
const LICENCE_FILES=['LICENSE','THIRD-PARTY-NOTICES.md'];
const root=process.cwd(), out=path.resolve(root,process.env.BUILD_OUT_DIR||'dist'); // BUILD_OUT_DIR is for tests that must not touch dist/
if(out===root||!out.startsWith(root+path.sep))throw new Error('The build output must be a folder inside the repository');
// Release configuration (support address, discussion space, ...). Nothing is assumed: every value is null until the owner verifies it.
// What this build is for (scripts/targets.mjs): the app alone, the app with the neutral pages that ship with it, or the app with a site directory (docs/SITE-LAYER.md).
// A clone, a fork or a contributor's machine with nothing set builds the neutral pages, a complete app with no setup.
const targetInfo=resolveTarget(process.env);
const siteDir=targetInfo.siteDir?path.resolve(root,targetInfo.siteDir):null;
if(siteDir&&!existsSync(siteDir))throw new Error('The site directory does not exist: '+targetInfo.siteDir);
// facts about the operator: the site's own site-config.json, or none (every value empty, which is a valid neutral configuration)
const siteConfigPath=process.env.SITE_CONFIG_PATH?path.resolve(root,process.env.SITE_CONFIG_PATH):siteDir?path.join(siteDir,'site-config.json'):null;
const siteConfig=siteConfigPath&&existsSync(siteConfigPath)?await loadSiteConfig(siteConfigPath):checkSiteConfig({});
// Where the pages of the site that serves this copy are (chat/site/site-links.mjs, docs/PLAN stage 3). SITE_JSON_PATH names the manifest: unset means ./site.json if it exists, empty means none, and a
// path that does not exist is an error. A copy without a manifest links to none of our pages. The manifest is checked here, so a typo stops the build, and the page gets it validated.
const siteJsonEnv=process.env.SITE_JSON_PATH;
const siteJsonPath=siteJsonEnv===''||!siteDir?null:path.resolve(root,siteJsonEnv??path.join(siteDir,'site.json'));
if(siteJsonEnv&&siteJsonPath&&!existsSync(siteJsonPath))throw new Error('SITE_JSON_PATH names a file that does not exist: '+siteJsonEnv);
let siteJson;
if(siteJsonPath&&existsSync(siteJsonPath)){
 let raw;try{raw=JSON.parse(await readFile(siteJsonPath,'utf8'));}catch(error){throw new Error('The site manifest is not valid JSON: '+error.message);}
 const problems=checkSiteJson(raw);
 if(problems.length)throw new Error('The site manifest '+path.relative(root,siteJsonPath)+' has problems:\n - '+problems.join('\n - '));
 siteJson=normalizedSiteLinks(raw);
}else siteJson=normalizedSiteLinks(undefined);
// What the app is configured with (runtime/config/app-config.mjs, docs/APP-CONFIG.md): the shipped defaults in app-config.json, with an operator's config/app-config.json replacing the model sources
// when there is one. APP_CONFIG_OVERRIDE names that file: unset means ./config/app-config.json if it exists, empty means none, and a path that does not exist is an error.
const configEnv=process.env.APP_CONFIG_OVERRIDE;
const overridePath=configEnv===''?null:path.resolve(root,configEnv??'config/app-config.json');
if(configEnv&&!existsSync(overridePath))throw new Error('APP_CONFIG_OVERRIDE names a file that does not exist: '+configEnv);
const readJson=async(file,what)=>{try{return JSON.parse(await readFile(file,'utf8'));}catch(error){throw new Error(what+' is not valid JSON: '+error.message);}};
const appConfigData=buildAppConfig(await readJson(path.resolve(root,'app-config.json'),'app-config.json'),overridePath&&existsSync(overridePath)?await readJson(overridePath,'The operator configuration'):null);
await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
for(const p of ['index.html','local-models.js','local-models.css','conversation-messages.mjs','chat','runtime','brand']) await cp(p,path.join(out,p),{recursive:true});
const pkg=JSON.parse(await readFile('package.json','utf8'));
const commit=process.env.GITHUB_SHA || execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const branch=targetInfo.branch;
// SOURCE_DATE_EPOCH (seconds) makes the build time, and the sitemap's date for the home page, reproducible; unset, they are the clock and the last commit date.
const buildTime=()=>process.env.SOURCE_DATE_EPOCH?new Date(Number(process.env.SOURCE_DATE_EPOCH)*1000):new Date();
const build={version:pkg.version,commit,branch,environment:targetInfo.environment,builtAt:buildTime().toISOString()};
const developmentNative=targetInfo.devTooling?JSON.parse(await readFile('dev-tools/native-runtime/manifest.json','utf8')):null;
if(developmentNative?.compilerControl)build.developmentRuntime={nativeBuildId:developmentNative.buildId,variant:developmentNative.compilerControl.id,wasmSha256:developmentNative.files['compat.wasm'].sha256};
const releasePath='releases/'+commit;
await mkdir(path.join(out,releasePath),{recursive:true});
for(const item of ['local-models.js','local-models.css','conversation-messages.mjs','chat','runtime']) await rename(path.join(out,item),path.join(out,releasePath,item));
// Both branch builds start from the pinned production runtime. Dev overlays it below.
const productionNative=JSON.parse(await readFile('ops/native/production-runtime.json','utf8'));
if(productionNative.developmentDiagnostics!==false)throw new Error('Production runtime must exclude development instrumentation');
if(productionNative.compilerControl){
 const control=JSON.parse(await readFile(productionNative.compilerControl.receipt,'utf8'));
 if(control.source.sha256!==productionNative.compilerControl.sourceSha256||control.output.sha256!==productionNative.files['compat.wasm'].sha256)throw new Error('Production compiler control receipt mismatch');
 execFileSync(process.execPath,['ops/native/compiler-control.mjs','verify',path.join(out,releasePath,'runtime/providers/vendor/wllama/v1q/compat.wasm'),productionNative.compilerControl.receipt],{stdio:'pipe'});
}
for(const [file,pin] of Object.entries(productionNative.files)){
 const bytes=await readFile(path.join(out,releasePath,'runtime/providers/vendor/wllama/v1q',file));
 if(bytes.length!==pin.bytes||createHash('sha256').update(bytes).digest('hex')!==pin.sha256)throw new Error('Production runtime checksum mismatch: '+file);
}
let html=await readFile(path.join(out,'index.html'),'utf8');
const appBuildScript='<script>window.APP_BUILD='+JSON.stringify(build)+';</script>';
html=html.replace('<script src="/build-info.js"></script>',appBuildScript+siteConfigScript(siteConfig)+'<script>window.SITE_LINKS='+JSON.stringify(siteJson).replace(/</g,'\\u003c')+';</script><script>window.APP_CONFIG='+JSON.stringify(appConfigData).replace(/</g,'\\u003c')+';</script>');
html=html.replace('href="/chat/page.css"','href="/'+releasePath+'/chat/page.css"').replace('href="/chat/chat.css"','href="/'+releasePath+'/chat/chat.css"').replace('href="/chat/brand.css"','href="/'+releasePath+'/chat/brand.css"').replace('href="/chat/shell.css"','href="/'+releasePath+'/chat/shell.css"').replace('href="/local-models.css"','href="/'+releasePath+'/local-models.css"').replace('src="/local-models.js"','src="/'+releasePath+'/local-models.js"');
if(targetInfo.devTooling) {
 const debugRuntime=path.join('dev-tools','native-runtime');
 const native=developmentNative;
 if(native.compilerControl){
  const control=JSON.parse(await readFile(native.compilerControl.receipt,'utf8'));
  if(createHash('sha256').update(await readFile(native.compilerControl.tool)).digest('hex')!==native.compilerControl.toolSha256)throw new Error('Compiler control tool checksum mismatch');
  if(control.output.sha256!==native.files['compat.wasm'].sha256||control.source.sha256!==native.compilerControl.sourceSha256)throw new Error('Compiler control receipt mismatch');
  execFileSync(process.execPath,['ops/native/compiler-control.mjs','verify',path.join(debugRuntime,'compat.wasm'),native.compilerControl.receipt],{stdio:'pipe'});
 }
 for(const [file,pin] of Object.entries(native.files)){const bytes=await readFile(path.join(debugRuntime,file));if(bytes.length!==pin.bytes||createHash('sha256').update(bytes).digest('hex')!==pin.sha256)throw new Error('Diagnostic runtime checksum mismatch: '+file);await writeFile(path.join(out,releasePath,'runtime/providers/vendor/wllama/v1q',file),bytes);}
 const catalogFile=path.join(out,releasePath,'runtime/providers/catalog.mjs');
 await writeFile(catalogFile,(await readFile(catalogFile,'utf8')).replaceAll(native.catalogBaseBuildId||native.baseBuildId,native.buildId));

 await mkdir(path.join(out,releasePath,'dev-tools'),{recursive:true});
 for(const file of ['start.js','ui.mjs','telemetry-core.mjs','native-journal.mjs','conversation-capture.mjs','remote-control.mjs'])await cp(path.join('dev-tools',file),path.join(out,releasePath,'dev-tools',file));
 await cp('dev-tools/receiver-worker.js',path.join(out,'_worker.js'));
 await writeFile(path.join(out,'_routes.json'),JSON.stringify({version:1,include:['/api/debug/*','/'+releasePath+'/dev-tools/*','/'+releasePath+'/runtime/providers/vendor/wllama/v1q/*'],exclude:[]}));
 html=html.replace('</head>','<script type="module" src="/'+releasePath+'/dev-tools/start.js"></script></head>');
} else {
 html=html.replace(/\/\* DEV_DIAGNOSTICS_START \*\/[\s\S]*?\/\* DEV_DIAGNOSTICS_END \*\//g,'');
 for(const relative of ['local-models.js','chat/call/call.mjs','chat/voice/voice-player.mjs','runtime/providers/adapters/wllama.mjs','runtime/providers/host-core.mjs','runtime/providers/client.mjs']){
 const appFile=path.join(out,releasePath,relative);
 const app=await readFile(appFile,'utf8');
 await writeFile(appFile,app.replace(/\/\* DEV_DIAGNOSTICS_START \*\/[\s\S]*?\/\* DEV_DIAGNOSTICS_END \*\//g,''));
 }
}
// The page head names the site that serves this copy (canonical, Open Graph and social-card addresses, structured data) only when the site manifest has a `site` block (chat/site/site-links.mjs):
// without one those tags are left out, so a copy names no site. The values are checked by the manifest, and escaped here for the attribute or the JSON string they land in.
{
 const info=siteJson.site;
 const htmlAttr=v=>String(v).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
 const jsonText=v=>JSON.stringify(String(v)).slice(1,-1).replace(/</g,'\\u003c');
 if(!info)html=html.replace(/[ \t]*<!--site-head-->\n[\s\S]*?[ \t]*<!--\/site-head-->\n/g,'');
 else{
  const image=info.socialImage?new URL(info.socialImage,info.url).href:null;
  html=html.replace(/[ \t]*<!--site-head-->\n([\s\S]*?)[ \t]*<!--\/site-head-->\n/g,(all,block)=>{
   if(!image&&block.includes('{{SITE_IMAGE}}'))return '';
   const esc=block.includes('application/ld+json')?jsonText:htmlAttr;
   return block.split('{{SITE_IMAGE}}').join(esc(image)).split('{{SITE_URL}}').join(esc(info.url));
  });
 }
 if(/\{\{SITE_(URL|IMAGE)\}\}|site-head-->/.test(html))throw new Error('The page head still holds a site placeholder or marker.');
}
await writeFile(path.join(out,'index.html'),html);

// The public documents (the pages of the site directory), sitemap.xml, robots.txt and updates/rss.xml are generated from their sources by
// scripts/public-site.mjs: regions are filled from the site's site-config.json and updates/entries.json and from content/known-issues.json, /chat/... references are rewritten to this
// release's folder and every stylesheet, script and image a page names must exist in the output. See docs/PUBLIC-SITE.md.
const rootLastmod=process.env.SOURCE_DATE_EPOCH?buildTime().toISOString().slice(0,10):execFileSync('git',['show','-s','--format=%cs','HEAD'],{encoding:'utf8'}).trim();
const publicSite=siteDir?await buildPublicSite({siteDir,outDir:out,releasePath,config:siteConfig,rootLastmod,origin:siteJson.site?siteJson.site.url.replace(/\/$/,''):null}):{urls:[],pages:[]}; // the app target has no pages
// The licence documents are published at /LICENSE and /THIRD-PARTY-NOTICES.md (GPL text and source offer; see docs/PUBLIC-SITE.md).
for(const file of LICENCE_FILES)await cp(file,path.join(out,file));
await writeFile(path.join(out,'404.html'),'<!doctype html><title>Not found</title><h1>Page not found</h1><a href="/">Open Private Local Chat</a>');
await writeFile(path.join(out,'version.json'),JSON.stringify(build,null,2)+'\n');
await writeFile(path.join(out,'manifest.webmanifest'),JSON.stringify({name:'PrivateLocal.Chat',short_name:'PrivateLocal',description:'Free AI chat on your device. Choose a supported model, keep on-device conversations local, or connect a provider when you choose.',start_url:'/',scope:'/',display:'standalone',background_color:'#F6F8FB',theme_color:'#F6F8FB',categories:['productivity','utilities'],icons:[{src:'/brand/app-icon-192.png',sizes:'192x192',type:'image/png',purpose:'any'},{src:'/brand/app-icon-512.png',sizes:'512x512',type:'image/png',purpose:'any'},{src:'/brand/app-icon-maskable-512.png',sizes:'512x512',type:'image/png',purpose:'maskable'}]}));
await writeFile(path.join(out,'_headers'),toPagesHeaders()); // the rules are in scripts/headers.mjs, and scripts/serve.mjs applies this file
// Pages control files at the root (_headers, _worker.js, _redirects) are not part of the app. Matched by exact name: a file such as
// vendor/noble-hashes/_md.js is an ordinary module that the app imports and must be saved for offline use.
// What is in this release's folder, with a checksum for each file. A later deploy uses it to keep this folder available while tabs that started on this build are still open
// (scripts/retain-releases.mjs, docs/UPGRADE-BEHAVIOUR.md). releases/index.json says which release folders this site holds: the current one, and the deploy adds the ones it keeps.
{
 const files=[];
 async function list(dir){for(const ent of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name<b.name?-1:1)){const p=path.join(dir,ent.name);if(ent.isDirectory())await list(p);else files.push(p);}}
 await list(path.join(out,releasePath));
 const entries=[];
 for(const file of files){const bytes=await readFile(file);entries.push({path:path.relative(path.join(out,releasePath),file).split(path.sep).join('/'),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
 await writeFile(path.join(out,releasePath,'release.json'),JSON.stringify({commit,files:entries},null,1)+'\n');
 await writeFile(path.join(out,'releases','index.json'),JSON.stringify({current:commit,retained:[]})+'\n');
}
const NOT_SHELL_ROOT_FILES=['_headers','_worker.js','_redirects','_routes.json'];
const shell=[];
async function walk(dir){for(const ent of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,ent.name);if(ent.isDirectory())await walk(p);else if(!(dir===out&&NOT_SHELL_ROOT_FILES.includes(ent.name))&&!(dir===out&&LICENCE_FILES.includes(ent.name))&&!/\/chat\/vendor\/voice\//.test('/'+path.relative(out,p).split(path.sep).join('/')))shell.push('/'+path.relative(out,p).split(path.sep).join('/'));}}
await walk(out);
let template=await readFile('scripts/service-worker.js','utf8');
if(!targetInfo.devTooling)template=template.replace(/\/\* DEV_DIAGNOSTICS_START \*\/[\s\S]*?\/\* DEV_DIAGNOSTICS_END \*\//g,'');
template=template.replace('__DEV_OFFLINE_FAULT__',targetInfo.devTooling?await readFile('dev-tools/offline-fault-sw.js','utf8'):'');
// the service worker is told which pages this build has: offline, a path of a page it does not have opens the app
await writeFile(path.join(out,'sw.js'),template.replace('__CACHE_NAME__',JSON.stringify('plc-shell-'+commit)).replace('__SHELL_FILES__',JSON.stringify(shell)).replace('__PUBLIC_PAGES__','['+publicSite.pages.map(page=>"'"+page+"'").join(',')+']').replace('__DEVELOPMENT_NATIVE__',JSON.stringify(targetInfo.devTooling)));
console.log(JSON.stringify({...build,files:shell.length}));
