// The headers a host must send are written once (scripts/headers.mjs) and everything else follows from that (docs/RUN-IT.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {HEADER_RULES,toPagesHeaders,parsePagesHeaders,headersFor,ruleMatches,toNginx,toCaddy} from '../scripts/headers.mjs';

// the file the build wrote before the rules had a module of their own, byte for byte
const BEFORE='/*\n  Cross-Origin-Opener-Policy: same-origin\n  Cross-Origin-Embedder-Policy: require-corp\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n\n/sw.js\n  Cache-Control: no-cache\n\n/build-info.js\n  Cache-Control: no-cache\n\n/version.json\n  Cache-Control: no-cache\n\n/sitemap.xml\n  Cache-Control: public, max-age=3600\n\n/updates/rss.xml\n  Cache-Control: public, max-age=3600\n\n/LICENSE\n  Content-Type: text/plain; charset=utf-8\n  Cache-Control: public, max-age=3600\n\n/THIRD-PARTY-NOTICES.md\n  Content-Type: text/markdown; charset=utf-8\n  Cache-Control: public, max-age=3600\n';

test('the rules make exactly the _headers file the build always wrote', () => {
  assert.equal(toPagesHeaders(),BEFORE);
});

test('a _headers file reads back into the same rules', () => {
  assert.deepEqual(parsePagesHeaders(toPagesHeaders()),HEADER_RULES.map(r=>({path:r.path,headers:r.headers.map(h=>[...h])})));
  assert.deepEqual(parsePagesHeaders('# a comment\n\n/a\n  X-One: 1\n  X-Two: two: with a colon\n'),[{path:'/a',headers:[['X-One','1'],['X-Two','two: with a colon']]}]);
  assert.throws(()=>parsePagesHeaders('/a\nnot-indented: 1\n/b\n  fine: 1\n  : broken'),/not a header/);
});

test('a request path gets every rule that matches it: the shared ones, then its own', () => {
  const h=headersFor(HEADER_RULES,'/sw.js');
  assert.equal(h['Cache-Control'],'no-cache');assert.equal(h['Cross-Origin-Opener-Policy'],'same-origin');assert.equal(h['Cross-Origin-Embedder-Policy'],'require-corp');
  assert.equal(headersFor(HEADER_RULES,'/LICENSE')['Content-Type'],'text/plain; charset=utf-8');
  assert.equal(headersFor(HEADER_RULES,'/help/')['Cache-Control'],undefined,'a page has only the shared headers');
  assert.equal(headersFor(HEADER_RULES,'/releases/abc/chat/x.mjs')['X-Content-Type-Options'],'nosniff');
  assert.ok(ruleMatches('/*','/anything/at/all')&&ruleMatches('/a/*','/a/b/c')&&!ruleMatches('/a/*','/b')&&!ruleMatches('/sw.js','/sw.js.map')&&!ruleMatches('/a.b','/aXb'));
  assert.deepEqual(headersFor([{path:'/*',headers:[['X','1']]},{path:'/a',headers:[['x','2']]}],'/a'),{x:'2'},'a later value replaces an earlier one of the same name');
});

test('the nginx and Caddy configuration carry every header of every rule', () => {
  const nginx=toNginx(),caddy=toCaddy();
  for(const rule of HEADER_RULES)for(const [name,value] of rule.headers){
    if(name==='Content-Type'){const [type,charset]=value.split('; charset=');assert.ok(nginx.includes('default_type '+type+';')&&nginx.includes('charset '+charset+';'),'nginx '+value);}
    else assert.ok(nginx.includes(`add_header ${name} "${value}" always;`),'nginx '+name+': '+value);
    assert.ok(caddy.includes(`${name} "${value}"`),'caddy '+name+': '+value);
  }
  for(const rule of HEADER_RULES.filter(r=>r.path!=='/*')){assert.ok(nginx.includes(`location = ${rule.path} {`),'nginx location '+rule.path);assert.ok(caddy.includes(`path ${rule.path}`),'caddy path '+rule.path);}
  // add_header in a nginx location replaces the inherited ones, so each location repeats the shared headers
  assert.equal([...nginx.matchAll(/add_header Cross-Origin-Opener-Policy/g)].length,HEADER_RULES.length);
});

test('the command prints each format, and refuses an unknown one', () => {
  for(const [format,expected] of [['pages',toPagesHeaders()],['nginx',toNginx()],['caddy',toCaddy()]])assert.equal(execFileSync('node',['scripts/headers.mjs',format],{encoding:'utf8'}),expected,format);
  assert.throws(()=>execFileSync('node',['scripts/headers.mjs','apache'],{stdio:'pipe'}),/Command failed/);
});

test('every target\'s build writes that same _headers file', () => {
  for(const env of [{TARGET:'app'},{TARGET:'runkit'}]){
    const dir=mkdtempSync(path.join(path.resolve('.'),'.tmp-hdr-'));
    try{
      execFileSync('node',['scripts/build.mjs'],{stdio:'pipe',env:{...process.env,...env,SITE_DIR:'',BUILD_OUT_DIR:path.relative('.',dir),GITHUB_SHA:'a'.repeat(40),DEPLOY_BRANCH:'local',SOURCE_DATE_EPOCH:'1'}});
      assert.equal(readFileSync(path.join(dir,'_headers'),'utf8'),BEFORE,env.TARGET);
    }finally{rmSync(dir,{recursive:true,force:true});}
  }
});
