import {cp,readFile,writeFile,readdir,mkdir,rm,rename} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {buildPublicSite,loadSiteConfig,siteConfigScript} from './public-site.mjs';
const LICENCE_FILES=['LICENSE','THIRD-PARTY-NOTICES.md'];
const root=process.cwd(), out=path.resolve(root,process.env.BUILD_OUT_DIR||'dist'); // BUILD_OUT_DIR is for tests that must not touch dist/
if(out===root||!out.startsWith(root+path.sep))throw new Error('The build output must be a folder inside the repository');
// Release configuration (support address, discussion space, ...). Nothing is assumed: every value is null until the owner verifies it.
const siteConfig=await loadSiteConfig(path.resolve(root,process.env.SITE_CONFIG_PATH||'site-config.json'));
await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
for(const p of ['index.html','local-models.js','local-models.css','conversation-messages.mjs','chat','runtime','brand']) await cp(p,path.join(out,p),{recursive:true});
const pkg=JSON.parse(await readFile('package.json','utf8'));
const commit=process.env.GITHUB_SHA || execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const branch=process.env.DEPLOY_BRANCH || process.env.GITHUB_REF_NAME || 'local';
// SOURCE_DATE_EPOCH (seconds) makes the build time, and the sitemap's date for the home page, reproducible; unset, they are the clock and the last commit date.
const buildTime=()=>process.env.SOURCE_DATE_EPOCH?new Date(Number(process.env.SOURCE_DATE_EPOCH)*1000):new Date();
const build={version:pkg.version,commit,branch,environment:branch==='main'?'production':branch==='dev'?'development':'local',builtAt:buildTime().toISOString()};
const developmentNative=branch==='dev'?JSON.parse(await readFile('dev-tools/native-runtime/manifest.json','utf8')):null;
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
html=html.replace('<script src="/build-info.js"></script>',appBuildScript+siteConfigScript(siteConfig));
html=html.replace('href="/chat/page.css"','href="/'+releasePath+'/chat/page.css"').replace('href="/chat/chat.css"','href="/'+releasePath+'/chat/chat.css"').replace('href="/chat/brand.css"','href="/'+releasePath+'/chat/brand.css"').replace('href="/chat/shell.css"','href="/'+releasePath+'/chat/shell.css"').replace('href="/local-models.css"','href="/'+releasePath+'/local-models.css"').replace('src="/local-models.js"','src="/'+releasePath+'/local-models.js"');
if(branch==='dev') {
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
await writeFile(path.join(out,'index.html'),html);

// The public documents (help/, about/, privacy/, updates/), sitemap.xml, robots.txt and updates/rss.xml are generated from their sources by
// scripts/public-site.mjs: regions are filled from site-config.json and updates/entries.json, /chat/... references are rewritten to this
// release's folder and every stylesheet, script and image a page names must exist in the output. See docs/PUBLIC-SITE.md.
const rootLastmod=process.env.SOURCE_DATE_EPOCH?buildTime().toISOString().slice(0,10):execFileSync('git',['show','-s','--format=%cs','HEAD'],{encoding:'utf8'}).trim();
await buildPublicSite({root,outDir:out,releasePath,config:siteConfig,rootLastmod});
// The licence documents are published at /LICENSE and /THIRD-PARTY-NOTICES.md (GPL text and source offer; see docs/PUBLIC-SITE.md).
for(const file of LICENCE_FILES)await cp(file,path.join(out,file));
await writeFile(path.join(out,'404.html'),'<!doctype html><title>Not found</title><h1>Page not found</h1><a href="/">Open Private Local Chat</a>');
await writeFile(path.join(out,'version.json'),JSON.stringify(build,null,2)+'\n');
await writeFile(path.join(out,'manifest.webmanifest'),JSON.stringify({name:'PrivateLocal.Chat',short_name:'PrivateLocal',description:'Free AI chat on your device. Choose a supported model, keep on-device conversations local, or connect a provider when you choose.',start_url:'/',scope:'/',display:'standalone',background_color:'#F6F8FB',theme_color:'#F6F8FB',categories:['productivity','utilities'],icons:[{src:'/brand/app-icon-192.png',sizes:'192x192',type:'image/png',purpose:'any'},{src:'/brand/app-icon-512.png',sizes:'512x512',type:'image/png',purpose:'any'},{src:'/brand/app-icon-maskable-512.png',sizes:'512x512',type:'image/png',purpose:'maskable'}]}));
await writeFile(path.join(out,'_headers'),'/*\n  Cross-Origin-Opener-Policy: same-origin\n  Cross-Origin-Embedder-Policy: require-corp\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n\n/sw.js\n  Cache-Control: no-cache\n\n/build-info.js\n  Cache-Control: no-cache\n\n/version.json\n  Cache-Control: no-cache\n\n/sitemap.xml\n  Cache-Control: public, max-age=3600\n\n/updates/rss.xml\n  Cache-Control: public, max-age=3600\n\n/LICENSE\n  Content-Type: text/plain; charset=utf-8\n  Cache-Control: public, max-age=3600\n\n/THIRD-PARTY-NOTICES.md\n  Content-Type: text/markdown; charset=utf-8\n  Cache-Control: public, max-age=3600\n');
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
if(branch!=='dev')template=template.replace(/\/\* DEV_DIAGNOSTICS_START \*\/[\s\S]*?\/\* DEV_DIAGNOSTICS_END \*\//g,'');
template=template.replace('__DEV_OFFLINE_FAULT__',branch==='dev'?await readFile('dev-tools/offline-fault-sw.js','utf8'):'');
await writeFile(path.join(out,'sw.js'),template.replace('__CACHE_NAME__',JSON.stringify('plc-shell-'+commit)).replace('__SHELL_FILES__',JSON.stringify(shell)).replace('__DEVELOPMENT_NATIVE__',JSON.stringify(branch==='dev')));
console.log(JSON.stringify({...build,files:shell.length}));
