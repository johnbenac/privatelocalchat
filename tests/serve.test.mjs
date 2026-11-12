// scripts/serve.mjs serves a build with the headers the build declares, streams what it serves, and stays inside its folder (docs/RUN-IT.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,truncateSync,openSync,closeSync,writeSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {startServer,parseRange} from '../scripts/serve.mjs';
import {HEADER_RULES,toPagesHeaders,headersFor} from '../scripts/headers.mjs';

const base=mkdtempSync(path.join(tmpdir(),'plc-serve-'));
const root=path.join(base,'app');
mkdirSync(path.join(root,'help'),{recursive:true});mkdirSync(path.join(root,'updates'),{recursive:true});mkdirSync(path.join(root,'releases/abc'),{recursive:true});
const files={'_headers':toPagesHeaders(),'index.html':'<!doctype html><title>app</title>','help/index.html':'<h1>Help</h1>','404.html':'<h1>Not found</h1>','sw.js':'self.x=1;','version.json':'{"commit":"abc"}','build-info.js':'x','sitemap.xml':'<urlset/>','updates/rss.xml':'<rss/>','LICENSE':'GPL text','THIRD-PARTY-NOTICES.md':'# notices','releases/abc/app.mjs':'export const a=1;','releases/abc/model.gguf':'0123456789abcdefghij'};
for(const [name,text] of Object.entries(files))writeFileSync(path.join(root,name),text);
writeFileSync(path.join(base,'secret.txt'),'OUTSIDE THE FOLDER');
const {server,port}=await startServer({dir:root,quiet:true});
const url=p=>`http://127.0.0.1:${port}${p}`;
test.after(()=>{server.close();rmSync(base,{recursive:true,force:true});});

test('every rule of the build\'s _headers is on every response it matches, and on errors and redirects too', async () => {
  for(const rule of HEADER_RULES.filter(r=>!r.path.includes('*'))){
    const res=await fetch(url(rule.path));
    assert.equal(res.status,200,rule.path);
    const want=headersFor(HEADER_RULES,rule.path);
    for(const [name,value] of Object.entries(want))assert.equal(res.headers.get(name),value,rule.path+' '+name);
    await res.arrayBuffer();
  }
  for(const [p,status] of [['/help',308],['/nothing-here',404]]){
    const res=await fetch(url(p),{redirect:'manual'});assert.equal(res.status,status,p);
    assert.equal(res.headers.get('cross-origin-opener-policy'),'same-origin',p+' (isolation headers on every answer)');assert.equal(res.headers.get('cross-origin-embedder-policy'),'require-corp',p);
    await res.arrayBuffer();
  }
  const page=await fetch(url('/help/'));assert.equal(page.headers.get('cache-control'),'public, max-age=0, must-revalidate','what no rule says is revalidated, like Pages');await page.arrayBuffer();
  assert.equal((await fetch(url('/LICENSE'))).headers.get('content-type'),'text/plain; charset=utf-8');
  assert.equal((await fetch(url('/updates/rss.xml'))).headers.get('content-type'),'application/rss+xml');
});

test('directories are resolved the way Pages does it, and the 404 page is served with a 404', async () => {
  assert.equal(await (await fetch(url('/'))).text(),files['index.html']);
  assert.equal(await (await fetch(url('/help/'))).text(),files['help/index.html']);
  const r=await fetch(url('/help?x=1'),{redirect:'manual'});assert.equal(r.status,308);assert.equal(r.headers.get('location'),'/help/?x=1');
  const missing=await fetch(url('/missing.js'));assert.equal(missing.status,404);assert.equal(await missing.text(),files['404.html']);
  assert.equal((await fetch(url('/releases/abc/'),{redirect:'manual'})).status,404,'a folder without an index is not listed');
});

test('HEAD answers like GET without a body, other methods are refused', async () => {
  const head=await fetch(url('/releases/abc/app.mjs'),{method:'HEAD'});
  assert.equal(head.status,200);assert.equal(head.headers.get('content-length'),String(files['releases/abc/app.mjs'].length));assert.equal(head.headers.get('content-type'),'application/javascript');assert.equal((await head.text()),'');
  const post=await fetch(url('/'),{method:'POST',body:'x'});assert.equal(post.status,405);assert.equal(post.headers.get('allow'),'GET, HEAD');await post.arrayBuffer();
});

test('Range: a prefix, a window, an open end, a suffix; an unsatisfiable one; forms it does not take', async () => {
  const get=(range)=>fetch(url('/releases/abc/model.gguf'),{headers:range?{Range:range}:{}});
  let r=await get('bytes=0-3');assert.equal(r.status,206);assert.equal(await r.text(),'0123');assert.equal(r.headers.get('content-range'),'bytes 0-3/20');assert.equal(r.headers.get('content-length'),'4');
  r=await get('bytes=5-9');assert.equal(await r.text(),'56789');
  r=await get('bytes=15-');assert.equal(await r.text(),'fghij');assert.equal(r.headers.get('content-range'),'bytes 15-19/20');
  r=await get('bytes=-4');assert.equal(await r.text(),'ghij');
  r=await get('bytes=10-999');assert.equal(await r.text(),'abcdefghij','an end past the file is cut to the file');
  r=await get('bytes=20-30');assert.equal(r.status,416);assert.equal(r.headers.get('content-range'),'bytes */20');await r.arrayBuffer();
  r=await get('bytes=5-2');assert.equal(r.status,416);await r.arrayBuffer();
  r=await get('bytes=0-1,3-4');assert.equal(r.status,200,'several ranges are answered with the whole file');assert.equal((await r.text()).length,20);
  r=await get('items=0-1');assert.equal(r.status,200);await r.arrayBuffer();
  r=await get();assert.equal(r.headers.get('accept-ranges'),'bytes');await r.arrayBuffer();
  assert.deepEqual(parseRange('bytes=0-0',1),{start:0,end:0});assert.equal(parseRange('bytes=-0',5),'bad');assert.equal(parseRange('bytes=',5),null);
});

test('a file the browser already has is answered with 304', async () => {
  const first=await fetch(url('/releases/abc/app.mjs'));const etag=first.headers.get('etag');assert.ok(etag);await first.arrayBuffer();
  const again=await fetch(url('/releases/abc/app.mjs'),{headers:{'If-None-Match':etag}});assert.equal(again.status,304);assert.equal(again.headers.get('cross-origin-opener-policy'),'same-origin');assert.equal(await again.text(),'');
});

test('a very large file is streamed, not read into memory', async () => {
  const big=path.join(root,'releases/abc/big.gguf'),SIZE=400*1024*1024;
  const fd=openSync(big,'w');writeSync(fd,'START');closeSync(fd);truncateSync(big,SIZE);
  const before=process.memoryUsage().rss;
  const res=await fetch(url('/releases/abc/big.gguf'));
  assert.equal(res.headers.get('content-length'),String(SIZE));
  let seen=0,peak=0;for await(const chunk of res.body){seen+=chunk.length;if((seen&0xFFFFFF)<chunk.length)peak=Math.max(peak,process.memoryUsage().rss-before);}
  assert.equal(seen,SIZE);
  assert.ok(peak<250*1024*1024,'resident memory grew by '+Math.round(peak/1048576)+' MB while serving '+SIZE/1048576+' MB');
  const tail=await fetch(url('/releases/abc/big.gguf'),{headers:{Range:'bytes=-5'}});assert.equal((await tail.arrayBuffer()).byteLength,5);
  const head=await fetch(url('/releases/abc/big.gguf'),{headers:{Range:'bytes=0-4'}});assert.equal(await head.text(),'START');
  rmSync(big);
});

test('nothing outside the folder is ever served, whatever the path is made of', async () => {
  const attempts=['/../secret.txt','/%2e%2e/secret.txt','/..%2fsecret.txt','/%2e%2e%2fsecret.txt','/help/../../secret.txt','/..%5csecret.txt','/%252e%252e/secret.txt','/releases/abc/../../../secret.txt','/%00','/index.html%00.txt','//etc/passwd','/\\..\\secret.txt'];
  for(const a of attempts){
    const res=await fetch(`http://127.0.0.1:${port}${a}`,{redirect:'manual'}).catch(()=>null);
    if(!res)continue; // the client itself refused to send it
    const body=await res.text();
    assert.ok(!body.includes('OUTSIDE THE FOLDER')&&!body.includes('root:'),a+' served a file outside the folder');
    assert.ok([200,308,400,404].includes(res.status),a+' -> '+res.status);
  }
  // sent byte for byte, without the client tidying the path
  const net=await import('node:net');
  for(const raw of ['/../secret.txt','/%2e%2e/secret.txt','/..%2fsecret.txt','/%5c..%5csecret.txt']){
    const answer=await new Promise((resolve)=>{const s=net.connect(port,'127.0.0.1',()=>s.write(`GET ${raw} HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n`));let d='';s.on('data',c=>d+=c);s.on('close',()=>resolve(d));s.on('error',()=>resolve(d));});
    assert.ok(!answer.includes('OUTSIDE THE FOLDER'),raw+' served a file outside the folder');
    assert.match(answer,/^HTTP\/1\.1 (400|404)/,raw);
  }
});

test('it refuses a folder that is not a build, and says what to do', async () => {
  const empty=mkdtempSync(path.join(tmpdir(),'plc-notabuild-'));
  try{await assert.rejects(startServer({dir:empty,quiet:true}),/is not a build: it has no _headers file/);}finally{rmSync(empty,{recursive:true,force:true});}
  const out=(()=>{try{execFileSync('node',['scripts/serve.mjs','--dir',tmpdir()],{stdio:'pipe'});return '';}catch(e){return String(e.stderr);}})();
  assert.match(out,/not a build/);
});

test('the command line serves the folder it is given, listens on 127.0.0.1 by default, and logs nothing about requests', async () => {
  const {spawn}=await import('node:child_process');
  const child=spawn('node',['scripts/serve.mjs','--dir',root,'--port','18597'],{stdio:['ignore','pipe','pipe']});
  try{
    let out='',err='';child.stdout.on('data',c=>out+=c);child.stderr.on('data',c=>err+=c);
    for(let i=0;i<50&&!out.includes('Serving');i++)await new Promise(r=>setTimeout(r,100));
    assert.match(out,/Serving .* at http:\/\/127\.0\.0\.1:18597/);
    assert.equal(await (await fetch('http://127.0.0.1:18597/')).text(),files['index.html']);
    assert.ok(!/reachable from the network/.test(out),'no network warning on the local address');
    // requests of every kind, then everything the command has printed: its start line and nothing else
    for(const p of ['/help/','/missing','/sw.js','/../secret.txt'])await (await fetch('http://127.0.0.1:18597'+p)).arrayBuffer();
    await new Promise(r=>setTimeout(r,300));
    assert.equal(out.trim().split('\n').length,1,'it logs nothing about requests; it printed: '+out);
    assert.equal(err,'','and nothing on stderr: '+err);
  }finally{child.kill();}
});
