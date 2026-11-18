// Which builds carry the character package reader (board T444). The vendored validator names other projects and hosts, so a copy made for others (targets app and runkit)
// ships neither it nor the button; our own deployment (target site) ships exactly the modules the app loads, byte-identical to the pinned copy, and none of its tests or fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readdirSync,readFileSync,rmSync,existsSync,statSync} from 'node:fs';
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
const RUNTIME=['LICENSE','authored-profiles/authored.mjs','authored-profiles/definitions.mjs','authored-profiles/index.mjs','authored-profiles/receiving-definitions.mjs','src/core/bundles.mjs','src/core/consumer-projections.mjs','src/core/content-schema.mjs','src/core/content.mjs','src/core/providers.mjs'].sort();

for(const target of ['app','runkit']) test(`the ${target} build (a copy made for others) carries no reader and a hidden button`,()=>{
  const out=build(target);const rel='releases/'+'b'.repeat(40)+'/';
  assert.equal(existsSync(path.join(out,rel,'vendor')),false,'no vendored folder');
  assert.equal(walk(out).some(f=>/authored-profiles/.test(f)),false,'no file of the package anywhere');
  const html=readFileSync(path.join(out,'index.html'),'utf8');
  assert.equal(readFileSync(path.join(out,rel,'chat/presentation/reader.mjs'),'utf8').includes('vendor/authored-profiles'),false,'the loader names no vendored file');
  assert.match(readFileSync(path.join(out,rel,'chat/presentation/reader.mjs'),'utf8'),/export const loadValidator = null;/,'the loader is the stub');
  assert.match(html,/id="previewCharacterBtn"[^>]*\bhidden\b/,'the button is hidden');
});

test('our own site build ships exactly the modules the app loads, unchanged, and the page can load them',()=>{
  const out=build('site',{SITE_DIR:'tests/fixtures/site'});const rel='releases/'+'b'.repeat(40)+'/';
  const base=path.join(out,rel,'vendor','authored-profiles');
  const shipped=walk(base).map(f=>path.relative(base,f).split(path.sep).join('/')).sort();
  assert.deepEqual(shipped,RUNTIME,'only the runtime modules and the licence');
  for(const f of RUNTIME) assert.deepEqual(readFileSync(path.join(base,f)),readFileSync(path.join('vendor','authored-profiles',f)),f+' is byte-identical to the pinned copy');
  assert.ok(!shipped.some(f=>/tests?\/|examples|fixtures|resources|\.json$|\.md$/.test(f)),'no tests, examples, fixtures or documents');
  assert.match(readFileSync(path.join(out,rel,'chat/presentation/reader.mjs'),'utf8'),/import\('\.\.\/\.\.\/vendor\/authored-profiles\/authored-profiles\/index\.mjs'\)/,'the loader names the shipped validator');
  assert.ok(statSync(base).isDirectory());
});

test('the page shows the button only when the build gave it a reader',()=>{
  const src=readFileSync('chat/assistant/assistant.mjs','utf8');
  assert.match(src,/typeof loadValidator === 'function'/);
  assert.ok(!/addEventListener\('click', \(\) => presentationPreview/.test(src.split("if (previewButton")[0]),'the click is wired only inside that condition');
  assert.ok(!/PLC_FEATURES/.test(src),'no separate flag');
});
