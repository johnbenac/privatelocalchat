// What the build ships of the vendored authored-profiles package (board T444). Every build, a copy made for others included, ships exactly the ten files of the package's NEUTRAL import
// closure (it names no other project and no web address, so tests/neutrality.test.mjs holds), unchanged from the pinned copy, and none of the package's tests, examples, fixtures or documents.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readdirSync,readFileSync,rmSync,existsSync} from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const root=path.resolve('.');
const dirs=[];test.after(()=>{for(const d of dirs)rmSync(d,{recursive:true,force:true});});
function build(target,extra={}){
  const dir=mkdtempSync(path.join(root,'.tmp-presentation-'));dirs.push(dir);
  const e={...process.env};for(const k of ['TARGET','SITE_DIR','DEPLOY_BRANCH','GITHUB_REF_NAME','SITE_JSON_PATH','RELEASE_VERSION'])delete e[k];
  execFileSync('node',['scripts/build.mjs'],{stdio:'pipe',env:{...e,TARGET:target,...extra,GITHUB_SHA:'b'.repeat(40),SOURCE_DATE_EPOCH:'1',BUILD_OUT_DIR:path.relative(root,dir)}});
  return dir;
}
const walk=(d)=>readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
const PKG='vendor/authored-profiles';

/** The files a module reaches through static and dynamic-free relative imports, from `entry` (paths relative to the package). */
function closure(entry){
  const seen=new Set();const visit=(rel)=>{if(seen.has(rel))return;seen.add(rel);
    const text=readFileSync(path.join(PKG,rel),'utf8');
    for(const m of text.matchAll(/(?:^|\n)\s*(?:import|export)\s[^'"]*?from\s*['"](\.{1,2}\/[^'"]+)['"]|(?:^|\n)\s*import\s*['"](\.{1,2}\/[^'"]+)['"]/g)){
      const spec=m[1]||m[2];const next=path.posix.normalize(path.posix.join(path.posix.dirname(rel),spec));visit(next);}};
  visit(entry);return [...seen].sort();
}
const NEUTRAL=closure('neutral/index.mjs');

test('the neutral closure is ten files, computed from the imports, and is what scripts/build.mjs ships',()=>{
  assert.equal(NEUTRAL.length,10,'ten files: '+NEUTRAL.join(', '));
  const src=readFileSync('scripts/build.mjs','utf8');
  const listed=[...src.match(/const AUTHORED_PROFILES_RUNTIME=\[(.*?)\];/)[1].matchAll(/'([^']+)'/g)].map(m=>m[1]).sort();
  assert.deepEqual(listed,NEUTRAL,'the build ships exactly what the neutral entry imports, no more and no less');
  const reader=readFileSync('chat/presentation/reader.mjs','utf8');
  assert.match(reader,/import\('\.\.\/\.\.\/vendor\/authored-profiles\/neutral\/index\.mjs'\)/,'the page loads the neutral entry');
});

for(const [target,extra] of [['app',{}],['runkit',{}],['site',{SITE_DIR:'tests/fixtures/site'}]]) test(`the ${target} build ships exactly the neutral closure, unchanged, and nothing else of the package`,()=>{
  const out=build(target,extra);const base=path.join(out,'releases','b'.repeat(40),PKG);
  const shipped=walk(base).map(f=>path.relative(base,f).split(path.sep).join('/')).sort();
  assert.deepEqual(shipped,NEUTRAL);
  for(const f of NEUTRAL) assert.deepEqual(readFileSync(path.join(base,f)),readFileSync(path.join(PKG,f)),f+' is byte-identical to the pinned copy');
  assert.ok(!shipped.some(f=>/tests?\/|examples|fixtures|resources|scripts\/|\.json$|\.md$|LICENSE|authored\.mjs|consumer-projections|receiving-definitions|content\.mjs|bundles\.mjs/.test(f)),'no tests, examples, documents, licence file or any module of the main (non-neutral) entry');
  assert.equal(existsSync(path.join(out,PKG)),false,'nothing outside the release folder');
  assert.ok(!/id="previewCharacterBtn"[^>]*\bhidden\b/.test(readFileSync(path.join(out,'index.html'),'utf8')),'the button is shown');
});

test('the page wires the button unconditionally and has no feature flag',()=>{
  const src=readFileSync('chat/assistant/assistant.mjs','utf8');
  assert.match(src,/createPresentationPreview\(\{\s*el, openAppDialog, showToast, loadValidator,/,'the reader is always passed in');
  assert.match(src,/getElementById\('previewCharacterBtn'\)\?\.addEventListener\('click', \(\) => presentationPreview\.chooseFile\(\)\)/,'the button is always wired');
  assert.ok(!/PLC_FEATURES|typeof loadValidator/.test(src));
});
