// scripts/data-snapshot-output.mjs allocates numbers and publishes capture output to a folder several writers may share (a capture's --out, the repository's fixtures when one is accepted).
// This runs REAL writer processes (4, 8 and 16 at once, released together by a barrier) on a scratch copy of a fixtures folder, 20 repeats of each scenario (SNAPSHOT_OUTPUT_REPEAT overrides it).
// Invariants, stated before the test:
//   no duplicate allocation  - every successful writer gets its own number; the numbers are contiguous from the next free one; no number appears twice, whatever the folder tails are
//   no overwrite             - the folders that were there are byte-identical afterwards; a second accept of the same fixture, or one with a wrong number, is refused with a clear code
//   whole fixtures only      - every numbered folder holds all three files, each parsing, with the payload of exactly one writer; an incomplete staging folder is refused
//   abrupt exit              - a writer killed (SIGKILL) while staging, while holding the lock, or just before its rename publishes nothing, leaves only dot folders no reader lists,
//                              and the other writers still publish (the dead owner's lock is taken over); the next legitimate writer proceeds
//   no deadlock              - every writer finishes inside the timeout, and no lock is left behind
//   conflicts are reported   - a refused writer says so with a code, never silently
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,readdirSync,readFileSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {publish,accept,newStaging,writeDurable,numberedFolders,nextNumber,checkComplete,LOCK_NAME,REQUIRED_FILES} from '../scripts/data-snapshot-output.mjs';
import {listFixtures} from './data/lib.mjs';

const ACTOR=fileURLToPath(new URL('./helpers/data-snapshot-output-actor.mjs',import.meta.url));
const REPEAT=Number(process.env.SNAPSHOT_OUTPUT_REPEAT||20);
const SCRATCH_ROOT=process.env.SNAPSHOT_OUTPUT_SCRATCH||process.env.PLC_E2E_PROFILE_ROOT||null;   // a disk folder (never the memory-backed /tmp); unset: the system's temporary folder
const scratch=()=>{const root=SCRATCH_ROOT||fileURLToPath(new URL('../work/',import.meta.url));mkdirSync(root,{recursive:true});return mkdtempSync(join(root,'snapshot-output-'));};   // work/ is the repository's git-ignored scratch folder
const sha=f=>createHash('sha256').update(readFileSync(f)).digest('hex');
const seed=(dir,names)=>{mkdirSync(dir,{recursive:true});for(const n of names){mkdirSync(join(dir,n));for(const f of REQUIRED_FILES)writeFileSync(join(dir,n,f),JSON.stringify({seed:n,file:f})+'\n');}};
const digest=dir=>Object.fromEntries(numberedFolders(dir).map(n=>[n,REQUIRED_FILES.map(f=>sha(join(dir,n,f))).join()]));

/** Start the writers, wait until each is ready, release them together, and collect every report (a writer that cannot finish in time is a deadlock). */
async function run(specs,{timeoutMs=60000}={}){
  const dir=scratch(),startFile=join(dir,'go');
  const procs=specs.map(s=>{
    const p=spawn(process.execPath,[ACTOR,s.mode,s.out,s.label,startFile,s.tail||'v9.0.0-bbbbbbb'],{stdio:['ignore','pipe','pipe']});
    const o={spec:s,out:'',err:'',ready:null,exit:null};
    o.ready=new Promise(r=>{p.stdout.on('data',d=>{o.out+=d;if(o.out.includes('ready'))r();});p.on('close',r);});
    o.done=new Promise(r=>p.on('close',(code,signal)=>{o.exit={code,signal};r();}));
    p.stderr.on('data',d=>o.err+=d);o.p=p;return o;
  });
  const timer=setTimeout(()=>procs.forEach(o=>o.p.kill('SIGKILL')),timeoutMs);
  await Promise.all(procs.map(o=>o.ready));writeFileSync(startFile,'go');
  await Promise.all(procs.map(o=>o.done));clearTimeout(timer);
  rmSync(dir,{recursive:true,force:true});
  return procs.map(o=>{const line=o.out.split('\n').filter(l=>l.startsWith('{')).pop();return {spec:o.spec,exit:o.exit,err:o.err,report:line?JSON.parse(line):null};});
}
const wholeAndOwned=(out,labels)=>{
  for(const n of numberedFolders(out)){
    if(/^00[12]-/.test(n)&&JSON.parse(readFileSync(join(out,n,'meta.json'),'utf8')).seed)continue;
    assert.deepEqual(checkComplete(join(out,n)),[],n+' is whole');
    const meta=JSON.parse(readFileSync(join(out,n,'meta.json'),'utf8')),plain=JSON.parse(readFileSync(join(out,n,'plain.json'),'utf8')),vault=JSON.parse(readFileSync(join(out,n,'vault.json'),'utf8'));
    assert.ok(labels.has(meta.label)&&plain.label===meta.label&&vault.label===meta.label+':vault','the three files of '+n+' belong to one writer');
    labels.delete(meta.label);
  }
};
const noLeftovers=out=>{assert.equal(spawnSync('flock',['-n','-x',join(out,LOCK_NAME),'true']).status,0,'the lock is free: nothing holds it after the writers are done or dead');};

for(const n of [4,8,16])test(`${n} writers at once, ${REPEAT} repeats: distinct contiguous numbers, whole fixtures, nothing overwritten, no deadlock`,{timeout:900000},async()=>{
  for(let r=0;r<REPEAT;r++){
    const out=scratch();
    try{
      seed(out,['001-v1.0.0-aaaaaaa','002-v1.1.0-aaaaaaa']);const before=digest(out);
      const same=r%2===0;   // even rounds: the same tail for everyone; odd rounds: a different tail each, so only the number can collide
      const res=await run(Array.from({length:n},(_,i)=>({mode:'publish',out,label:'w'+i,tail:same?'v2.0.0-ccccccc':`v2.0.${i}-c${String(i).padStart(6,'0')}`})));
      for(const x of res)assert.ok(x.report?.ok&&x.exit.code===0,`round ${r}: writer ${x.spec.label} did not publish: ${x.report?.code} ${x.report?.message} ${x.err}`);
      const numbers=res.map(x=>x.report.number).sort((a,b)=>a-b);
      assert.deepEqual(numbers,Array.from({length:n},(_,i)=>i+3),`round ${r}: numbers are distinct and contiguous`);
      assert.equal(numberedFolders(out).length,n+2);
      const after=digest(out);for(const [k,v] of Object.entries(before))assert.equal(after[k],v,k+' was not touched');
      wholeAndOwned(out,new Set(res.map(x=>x.spec.label)));noLeftovers(out);
      assert.deepEqual(listFixtures(out),numberedFolders(out),'the reader lists only whole numbered folders');
    }finally{rmSync(out,{recursive:true,force:true});}
  }
});

for(const [mode,what] of [['crash-staging','while staging'],['crash-locked','holding the lock'],['crash-before-rename','just before its rename']])
  test(`a writer killed ${what} publishes nothing and the other writers proceed (${REPEAT} repeats, 6 writers)`,{timeout:900000},async()=>{
    for(let r=0;r<REPEAT;r++){
      const out=scratch();
      try{
        seed(out,['001-v1.0.0-aaaaaaa']);const before=digest(out);
        const specs=Array.from({length:6},(_,i)=>({mode:i===r%6?mode:'publish',out,label:'w'+i,tail:`v2.0.${i}-d${String(i).padStart(6,'0')}`}));
        const res=await run(specs);
        const dead=res.find(x=>x.spec.mode===mode),alive=res.filter(x=>x!==dead);
        assert.equal(dead.exit.signal,'SIGKILL',`round ${r}: the crashing writer really was killed`);
        for(const x of alive)assert.ok(x.report?.ok,`round ${r}: ${x.spec.label} did not proceed: ${x.report?.code} ${x.report?.message} ${x.err}`);
        assert.deepEqual(alive.map(x=>x.report.number).sort((a,b)=>a-b),[2,3,4,5,6],`round ${r}: the survivors are numbered contiguously`);
        wholeAndOwned(out,new Set(alive.map(x=>x.spec.label)));
        assert.ok(!numberedFolders(out).some(n=>readFileSync(join(out,n,'meta.json'),'utf8').includes('"'+dead.spec.label+'"')),'the dead writer published nothing');
        assert.equal(digest(out)['001-v1.0.0-aaaaaaa'],before['001-v1.0.0-aaaaaaa']);
        assert.ok(readdirSync(out).some(n=>n.startsWith('.staging-')),'its unfinished staging folder is a dot folder, which no reader lists');
        // the next legitimate writer proceeds and gets the next number
        const next=await run([{mode:'publish',out,label:'next',tail:'v3.0.0-eeeeeee'}]);
        assert.ok(next[0].report?.ok&&next[0].report.number===7,`round ${r}: the next writer proceeds: ${JSON.stringify(next[0].report)}`);
        noLeftovers(out);
      }finally{rmSync(out,{recursive:true,force:true});}
    }
  });

test(`accepting one capture into the fixtures from ${8} actors at once: one winner, the rest refused with a code, nothing overwritten (${REPEAT} repeats)`,{timeout:900000},async()=>{
  for(let r=0;r<REPEAT;r++){
    const root=scratch(),outDir=join(root,'capture'),fixtures=join(root,'fixtures');
    try{
      seed(fixtures,['001-v1.0.0-aaaaaaa','002-v1.1.0-aaaaaaa']);const before=digest(fixtures);
      const staging=newStaging(outDir);for(const f of REQUIRED_FILES)writeDurable(join(staging,f),JSON.stringify({label:'cap',f})+'\n');
      const made=await publish({staging,out:outDir,tail:'v1.2.0-fffffff',also:[fixtures]});
      assert.equal(made.name,'003-v1.2.0-fffffff','the capture is numbered after the repository fixtures too');
      const res=await run(Array.from({length:8},()=>({mode:'accept',out:fixtures,label:made.path})));
      const winners=res.filter(x=>x.report?.ok);
      assert.equal(winners.length,1,`round ${r}: exactly one accept wins`);
      for(const x of res.filter(x=>!x.report?.ok))assert.ok(['number-conflict','exists'].includes(x.report?.code),`round ${r}: a refused accept says why: ${JSON.stringify(x.report)}`);
      assert.deepEqual(numberedFolders(fixtures),['001-v1.0.0-aaaaaaa','002-v1.1.0-aaaaaaa','003-v1.2.0-fffffff']);
      const after=digest(fixtures);for(const [k,v] of Object.entries(before))assert.equal(after[k],v);
      assert.equal(after['003-v1.2.0-fffffff'],REQUIRED_FILES.map(f=>sha(join(made.path,f))).join(),'the accepted copy is the capture, byte for byte');
      noLeftovers(fixtures);
      assert.deepEqual(readdirSync(fixtures).filter(n=>n.startsWith('.')&&n!==LOCK_NAME),[],'no staging folder is left in the fixtures');
    }finally{rmSync(root,{recursive:true,force:true});}
  }
});

test('refusals are clear: an incomplete staging folder, a wrong number, a rehearsal, an existing folder', async()=>{
  const root=scratch();
  try{
    const out=join(root,'out');seed(out,['001-v1.0.0-aaaaaaa']);
    const half=newStaging(out);writeDurable(join(half,'meta.json'),'{"a":1}\n');writeDurable(join(half,'plain.json'),'{"a":');
    await assert.rejects(publish({staging:half,out,tail:'v1.0.1-aaaaaab'}),{code:'incomplete'});
    assert.deepEqual(numberedFolders(out),['001-v1.0.0-aaaaaaa'],'nothing was published from an incomplete folder');
    const good=newStaging(out);for(const f of REQUIRED_FILES)writeDurable(join(good,f),'{"label":"x"}\n');
    const wrong=await publish({staging:good,out,tail:'v1.0.1-aaaaaab'});
    assert.equal(wrong.number,2);
    await assert.rejects(accept({from:wrong.path,into:out}),{code:'number-conflict'});   // number 002 is already taken in out
    const rehearsal=join(root,'cap','003-v1.0.2-aaaaaac');mkdirSync(rehearsal,{recursive:true});
    for(const f of REQUIRED_FILES)writeFileSync(join(rehearsal,f),JSON.stringify({captureKind:'rehearsal'})+'\n');
    await assert.rejects(accept({from:rehearsal,into:out}),{code:'rehearsal'});
    assert.equal(nextNumber(out),3);
  }finally{rmSync(root,{recursive:true,force:true});}
});
