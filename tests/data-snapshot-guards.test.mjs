// Capture guards of scripts/data-snapshot.mjs, tested through the REAL exported functions of scripts/data-snapshot-output.mjs on real scratch git repositories (no supplied git contract, no browser):
//   1 every accepted git capture is clean, tagged release or private build, with or without --release/--commit; only an explicit rehearsal may be dirty and `accept` refuses a rehearsal
//   2 the page's APP_BUILD commit must equal the declared source for EVERY kind (release, private build, extracted, rehearsal); missing or different is a clear error; the CLI calls it unconditionally, before the scenario and at the end
//   3 the generated lock, staging and notes artifacts of the fixtures folder are ignored by git (so a capture leaves the tree clean) while fixture folders stay visible, and the lock file is never unlinked
// Not claimed: a real browser/tag-creating capture. The shared-state writers (lock, publish) are unchanged here; their 4/8/16-actor x20 tests stay in tests/data-snapshot-output.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,writeFileSync,readFileSync,existsSync,rmSync,copyFileSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {resolveProvenance,checkBuildIdentity,withLock,newStaging,publish,accept,writeDurable,LOCK_NAME,REQUIRED_FILES} from '../scripts/data-snapshot-output.mjs';

const SCRATCH_ROOT=process.env.SNAPSHOT_OUTPUT_SCRATCH||process.env.PLC_E2E_PROFILE_ROOT||null;
const scratch=()=>{const root=SCRATCH_ROOT||fileURLToPath(new URL('../work/',import.meta.url));mkdirSync(root,{recursive:true});return mkdtempSync(join(root,'snapshot-guards-'));};
const gitIn=(cwd,...a)=>{const r=spawnSync('git',a,{cwd,encoding:'utf8',env:{...process.env,GIT_AUTHOR_NAME:'t',GIT_AUTHOR_EMAIL:'',GIT_COMMITTER_NAME:'t',GIT_COMMITTER_EMAIL:''}});assert.equal(r.status,0,a.join(' ')+': '+r.stderr);return r.stdout.trim();};
function makeRepo(){
  const root=scratch();
  gitIn(root,'init','-q','--template=','-b','main');gitIn(root,'config','commit.gpgsign','false');
  writeFileSync(join(root,'a.txt'),'one\n');writeFileSync(join(root,'index.html'),'<p>one</p>\n');gitIn(root,'add','a.txt','index.html');gitIn(root,'commit','-q','-m','one');gitIn(root,'tag','v1.2.3');
  return {root,tagged:gitIn(root,'rev-parse','HEAD')};
}
const refused=(args,re)=>assert.throws(()=>resolveProvenance(args),e=>e.code==='provenance'&&re.test(e.message),String(re));
const CLEAN=/clean, committed tree/;

test('a tagged release checkout that is dirty (tracked, staged or untracked) is refused for every override combination; only an explicit rehearsal may run dirty',()=>{
  const {root,tagged}=makeRepo();
  try{
    const flags=[{},{release:'v1.2.3'},{commit:tagged},{release:'v1.2.3',commit:tagged}];
    const expected={extracted:false,commitFull:tagged,release:'v1.2.3',exactTag:'v1.2.3',privateBuild:false};
    for(const o of flags)assert.deepEqual(resolveProvenance({root,...o}),expected,'clean and tagged is accepted: '+JSON.stringify(o));
    const dirtiers={
      'a modified tracked file':()=>writeFileSync(join(root,'index.html'),'<p>edited</p>\n'),
      'a staged change':()=>{writeFileSync(join(root,'a.txt'),'staged\n');gitIn(root,'add','a.txt');},
      'an untracked file':()=>writeFileSync(join(root,'stray.txt'),'x\n'),
    };
    for(const [what,dirty] of Object.entries(dirtiers)){
      dirty();
      for(const o of flags)refused({root,...o},CLEAN);
      // an explicit rehearsal may run dirty, and says what it is
      assert.equal(resolveProvenance({root,rehearsal:true}).exactTag,'v1.2.3',what+': the rehearsal runs');
      gitIn(root,'reset','-q','--hard');gitIn(root,'clean','-q','-fd');
      assert.deepEqual(resolveProvenance({root}),expected,what+': clean again, accepted again');
    }
  }finally{rmSync(root,{recursive:true,force:true});}
});

test('a private build is clean-only too, and a rehearsal capture is never accepted into the fixtures',async()=>{
  const {root}=makeRepo();
  const out=scratch();
  try{
    writeFileSync(join(root,'a.txt'),'two\n');gitIn(root,'commit','-q','-am','two');
    assert.equal(resolveProvenance({root}).privateBuild,true);
    writeFileSync(join(root,'a.txt'),'three\n');
    refused({root},CLEAN);refused({root,release:'v1.2.3'},CLEAN);
    assert.equal(resolveProvenance({root,rehearsal:true}).privateBuild,true);
    // accept refuses the folder a rehearsal writes
    const from=join(out,'001-v1.2.3-aaaaaaa');mkdirSync(from);
    writeFileSync(join(from,'meta.json'),JSON.stringify({captureKind:'rehearsal'}));writeFileSync(join(from,'plain.json'),'{"a":1}');writeFileSync(join(from,'vault.json'),'{"a":1}');
    await assert.rejects(accept({from,into:join(out,'into')}),e=>e.code==='rehearsal');
    assert.equal(existsSync(join(out,'into','001-v1.2.3-aaaaaaa')),false,'nothing was published');
  }finally{rmSync(root,{recursive:true,force:true});rmSync(out,{recursive:true,force:true});}
});

test('the observed APP_BUILD commit must equal the declared source for every kind of capture',()=>{
  const {root,tagged}=makeRepo();
  const extractedRoot=scratch();
  try{
    writeFileSync(join(root,'a.txt'),'two\n');gitIn(root,'commit','-q','-am','two');
    const head=gitIn(root,'rev-parse','HEAD');
    const other='0'.repeat(40);
    const kinds={
      'private build':resolveProvenance({root}),
      'rehearsal':resolveProvenance({root,rehearsal:true}),
      'extracted release':resolveProvenance({root:extractedRoot,release:'v1.2.3',commit:other.replace(/0/g,'a')}),
    };
    gitIn(root,'checkout','-q',tagged);
    kinds['tagged release']=resolveProvenance({root});
    assert.equal(Object.keys(kinds).length,4);
    for(const [kind,p] of Object.entries(kinds)){
      assert.equal(checkBuildIdentity({commit:p.commitFull,builtAt:'x'},p.commitFull),p.commitFull,kind+': the matching build is accepted');
      for(const bad of [{commit:other},{commit:p.commitFull.slice(0,7)},{commit:head===p.commitFull?tagged:head},{commit:''},{},null,undefined,'x',{commit:123}])
        assert.throws(()=>checkBuildIdentity(bad,p.commitFull),e=>e.code==='build'&&/page reports/.test(e.message),kind+': refused '+JSON.stringify(bad));
    }
    assert.throws(()=>checkBuildIdentity({commit:other},tagged),/not the declared source commit/);
    assert.throws(()=>checkBuildIdentity({},tagged),/missing/);
  }finally{rmSync(root,{recursive:true,force:true});rmSync(extractedRoot,{recursive:true,force:true});}
});

test('the capture script checks the build unconditionally: right after the page is ready, before any scenario write, and again at the end',()=>{
  const src=readFileSync(fileURLToPath(new URL('../scripts/data-snapshot.mjs',import.meta.url)),'utf8');
  const calls=[...src.matchAll(/^\s*checkBuildIdentity\(/gm)];
  assert.equal(calls.length,2,'one early check and one final check, each its own statement (not inside a condition)');
  assert.ok(!/\b(privateBuild|rehearsal)\s*(\|\||&&)[^\n]*checkBuildIdentity/.test(src)&&!/\bif\s*\([^)\n]*\)\s*checkBuildIdentity/.test(src),'no condition guards the check');
  const early=src.indexOf('checkBuildIdentity(await page.evaluate');
  assert.ok(early>0&&early<src.indexOf("await send('Packing list"),'the early check precedes the first scenario write');
  assert.ok(src.lastIndexOf('checkBuildIdentity(app,')>src.indexOf('const app=await page.evaluate'),'the final check uses the observed app');
  assert.ok(src.indexOf('checkBuildIdentity(app,')<src.indexOf('writeDurable(join(staging'),'a mismatch stops before anything is written');
});

test('generated lock, staging and notes artifacts of the fixtures folder are ignored by git, fixture folders stay visible, and the lock file is not unlinked',async()=>{
  const {root}=makeRepo();
  try{
    const dir=join(root,'tests','fixtures','data');mkdirSync(dir,{recursive:true});
    copyFileSync(fileURLToPath(new URL('./fixtures/data/.gitignore',import.meta.url)),join(dir,'.gitignore'));
    gitIn(root,'add','tests/fixtures/data/.gitignore');gitIn(root,'commit','-q','-m','ignore');
    assert.equal(gitIn(root,'status','--porcelain'),'','clean to begin with');
    // the real tooling: a staging folder, a locked section, notes, and a real publish
    const staging=newStaging(dir);
    for(const f of REQUIRED_FILES)writeDurable(join(staging,f),'{"a":1}\n');
    const notes=mkdtempSync(join(dir,'.notes-'));writeFileSync(join(notes,'failure.png'),'x');
    await withLock(dir,async()=>{});
    const ino=statSync(join(dir,LOCK_NAME)).ino;
    assert.equal(gitIn(root,'status','--porcelain'),'','generated artifacts are ignored: the tree stays clean');
    assert.equal(resolveProvenance({root}).privateBuild,true,'the capture tooling itself accepts this tree: the artifacts did not make it dirty');
    const placed=await publish({staging,out:dir,tail:'v1.2.3-bbbbbbb'});
    assert.equal(existsSync(join(dir,LOCK_NAME)),true,'the lock file is left in place, never unlinked');
    await withLock(dir,async()=>{});
    assert.equal(statSync(join(dir,LOCK_NAME)).ino,ino,'the same lock file (same inode) is used again');
    // a real fixture folder is NOT ignored: it shows up so it can be committed (or noticed)
    assert.match(gitIn(root,'status','--porcelain'),new RegExp('\\?\\? tests/fixtures/data/'+placed.name));
    assert.equal(gitIn(root,'check-ignore','tests/fixtures/data/.publish.lock'),'tests/fixtures/data/.publish.lock');
    assert.equal(spawnSync('git',['check-ignore','-q','tests/fixtures/data/001-v1.2.3-aaaaaaa/meta.json'],{cwd:root}).status,1,'fixture files are not ignored');
    assert.equal(spawnSync('git',['check-ignore','-q','tests/fixtures/data/other.json'],{cwd:root}).status,1,'no blanket ignore of other files');
  }finally{rmSync(root,{recursive:true,force:true});}
});
