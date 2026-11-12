// What a build is for: app, runkit or site (scripts/targets.mjs, docs/RUN-IT.md), and what is kept out of a build for downloading.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdtempSync,rmSync,readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {resolveTarget,TARGETS} from '../scripts/targets.mjs';

const t=env=>{try{const r=resolveTarget(env);return [r.target,r.environment,r.devTooling,r.siteDir].join('/');}catch(error){return 'ERR '+error.message;}};

test('the target follows TARGET, and without it SITE_DIR decides', () => {
  assert.deepEqual([...TARGETS],['app','runkit','site']);
  assert.equal(t({}),'runkit/local/false/run-kit');
  assert.equal(t({SITE_DIR:'site-layer'}),'site/local/false/site-layer');
  assert.equal(t({TARGET:'app'}),'app/local/false/');
  assert.equal(t({TARGET:'runkit'}),'runkit/local/false/run-kit');
  assert.equal(t({TARGET:'site',SITE_DIR:'x'}),'site/local/false/x');
  assert.equal(t({SITE_DIR:''}),'runkit/local/false/run-kit','an empty SITE_DIR is no SITE_DIR');
});

test('a combination that does not make sense is refused, in words', () => {
  assert.match(t({TARGET:'runkit',SITE_DIR:'x'}),/^ERR TARGET=runkit builds without a site directory, but SITE_DIR is set/);
  assert.match(t({TARGET:'app',SITE_DIR:'x'}),/^ERR TARGET=app builds without a site directory/);
  assert.match(t({TARGET:'site'}),/^ERR TARGET=site needs SITE_DIR/);
  assert.match(t({TARGET:'desktop'}),/^ERR TARGET must be one of app, runkit, site \(it is "desktop"\)/);
});

test('the environment a copy reports is never production or development unless it is the site target', () => {
  assert.equal(t({TARGET:'app',DEPLOY_BRANCH:'main'}),'app/release/false/');
  assert.equal(t({TARGET:'runkit',DEPLOY_BRANCH:'main'}),'runkit/release/false/run-kit');
  assert.equal(t({TARGET:'runkit',DEPLOY_BRANCH:'feature'}),'runkit/local/false/run-kit');
  assert.equal(t({SITE_DIR:'x',DEPLOY_BRANCH:'main'}),'site/production/false/x');
  assert.equal(t({SITE_DIR:'x',DEPLOY_BRANCH:'dev'}),'site/development/true/x');
  assert.equal(t({SITE_DIR:'x',GITHUB_REF_NAME:'dev'}),'site/development/true/x','the branch can come from the workflow');
});

test('a build for downloading cannot be made on the dev branch', () => {
  assert.match(t({TARGET:'app',DEPLOY_BRANCH:'dev'}),/^ERR TARGET=app cannot be built on the dev branch: the development tooling belongs to the site target/);
  assert.match(t({DEPLOY_BRANCH:'dev'}),/^ERR TARGET=runkit cannot be built on the dev branch/);
});

// ---- the built output -----------------------------------------------------------------------------------------------------------------------------
const root=path.resolve('.');
function build(env){
  const dir=mkdtempSync(path.join(root,'.tmp-tgt-'));
  const e={...process.env};for(const k of ['TARGET','SITE_DIR','DEPLOY_BRANCH','GITHUB_REF_NAME','SITE_JSON_PATH'])delete e[k];
  execFileSync('node',['scripts/build.mjs'],{stdio:'pipe',env:{...e,GITHUB_SHA:'a'.repeat(40),SOURCE_DATE_EPOCH:'1',BUILD_OUT_DIR:path.relative(root,dir),...env}});
  return dir;
}
const read=(dir,f)=>readFileSync(path.join(dir,f),'utf8');
const DEV_FILES=['_worker.js','_routes.json'];

test('the app target has no pages, tells the app of none, and the worker opens the app for every path', () => {
  const dir=build({TARGET:'app',DEPLOY_BRANCH:'main'});
  try{
    for(const page of ['help','about','privacy','updates'])assert.ok(!existsSync(path.join(dir,page)),page);
    for(const file of ['sitemap.xml','robots.txt','updates/rss.xml'])assert.ok(!existsSync(path.join(dir,file)),file);
    assert.deepEqual(JSON.parse(/window\.SITE_LINKS=([^;]*);/.exec(read(dir,'index.html'))[1]),{format:'plc-site/1',pages:{}});
    assert.match(read(dir,'sw.js'),/const PUBLIC_PAGES=\[\];/);
    assert.equal(JSON.parse(read(dir,'version.json')).environment,'release');
    assert.ok(read(dir,'sw.js').includes('plc-shell-'+'a'.repeat(40)));
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('the runkit target has Help and About and the worker knows exactly those', () => {
  const dir=build({TARGET:'runkit',DEPLOY_BRANCH:'main'});
  try{
    assert.deepEqual(['about','help'].filter(p=>existsSync(path.join(dir,p,'index.html'))),['about','help']);
    for(const page of ['privacy','updates'])assert.ok(!existsSync(path.join(dir,page)),page);
    assert.match(read(dir,'sw.js'),/const PUBLIC_PAGES=\['help','about'\];/);
    const worker=read(dir,'sw.js');
    assert.ok(worker.includes('/help/index.html')&&worker.includes('/about/index.html')&&!worker.includes('/privacy/index.html'));
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('the site target takes its pages from the site directory, and keeps the environment it always had', () => {
  const dir=build({SITE_DIR:'tests/fixtures/site',DEPLOY_BRANCH:'main'});
  try{
    assert.match(read(dir,'sw.js'),/const PUBLIC_PAGES=\['help','about','privacy','updates'\];/);
    assert.equal(JSON.parse(read(dir,'version.json')).environment,'production');
    assert.ok(existsSync(path.join(dir,'sitemap.xml')));
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('our development tooling is in the site target on dev and in no other build', () => {
  // refused for downloading builds, so there is nothing to look inside
  for(const target of ['app','runkit'])assert.throws(()=>build({TARGET:target,DEPLOY_BRANCH:'dev'}),/Command failed/,target);
  const dev=build({SITE_DIR:'tests/fixtures/site',DEPLOY_BRANCH:'dev'});
  const prod=build({SITE_DIR:'tests/fixtures/site',DEPLOY_BRANCH:'main'});
  try{
    for(const f of DEV_FILES)assert.ok(existsSync(path.join(dev,f)),f+' is in the dev site build');
    assert.ok(existsSync(path.join(dev,'releases','a'.repeat(40),'dev-tools')),'dev-tools is in the dev site build');
    for(const f of DEV_FILES)assert.ok(!existsSync(path.join(prod,f)),f+' is not in the production site build');
    assert.ok(!existsSync(path.join(prod,'releases','a'.repeat(40),'dev-tools')));
  }finally{rmSync(dev,{recursive:true,force:true});rmSync(prod,{recursive:true,force:true});}
  for(const target of ['app','runkit']){
    const dir=build({TARGET:target,DEPLOY_BRANCH:'main'});
    try{
      for(const f of DEV_FILES)assert.ok(!existsSync(path.join(dir,f)),target+' has '+f);
      assert.ok(!existsSync(path.join(dir,'releases','a'.repeat(40),'dev-tools')),target+' has dev-tools');
      const everything=[];(function walk(d){for(const e of readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())walk(p);else if(/\.(mjs|js|html|json)$/.test(e.name))everything.push(p);}})(dir);
      for(const f of everything)assert.ok(!/DEV_DIAGNOSTICS_START|receiver-worker|__plcDebug/.test(readFileSync(f,'utf8')),target+': development code in '+path.relative(dir,f));
    }finally{rmSync(dir,{recursive:true,force:true});}
  }
});
