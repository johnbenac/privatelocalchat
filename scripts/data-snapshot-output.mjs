// Where a captured data snapshot goes, and how it is allocated a number and published (used by scripts/data-snapshot.mjs; test: tests/data-snapshot-output.test.mjs).
//
// A capture is written into a private staging folder inside the output folder (".staging-*", never numbered, never listed) and becomes a numbered fixture in ONE step: a rename
// of the finished folder to "NNN-<release>-<commit>". The kernel makes that rename atomic, so a reader and a later writer see either no folder or a whole one, and a writer that dies
// at any point before the rename leaves only a dot-folder that nothing reads. Choosing the number and renaming happen under one short lock per output folder (a kernel flock on
// ".publish.lock", taken by a few lines of the Python 3 standard library's fcntl.flock in a helper process that lives as long as the pipe to it; Python 3 is a stated prerequisite of this repository and
// nothing else is needed, no flock(1)); the kernel releases the lock when its holder dies, however it dies, so a killed writer never blocks the next one and there is no marker to go stale. The
// allocator never overwrites: an existing folder, a number that is not the next one, or a lock that stays held past the wait is a clear error, never a silent replacement. If Python 3 is missing there
// is no unlocked fallback: the capture stops with a clear error.
import {mkdirSync,mkdtempSync,openSync,writeSync,fsyncSync,closeSync,renameSync,readdirSync,readFileSync,existsSync,statSync,cpSync,rmSync,realpathSync} from 'node:fs';
import {join,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';

export const REQUIRED_FILES=['meta.json','plain.json','vault.json'];
export const LOCK_NAME='.publish.lock';
export const LOCK_PYTHON='/usr/bin/python3';
const BUSY_EXIT=75;
// argv: lock file, seconds to wait. Takes the exclusive kernel lock (polling the non-blocking form, so the wait is bounded), says "held", then keeps the lock until its stdin is closed (EOF, however the owner died).
const LOCK_HELPER=[
  'import fcntl,os,sys,time',
  'fd=os.open(sys.argv[1],os.O_CREAT|os.O_RDWR,0o644)',
  'end=time.monotonic()+float(sys.argv[2])',
  'while True:',
  '    try:',
  '        fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)',
  '        break',
  '    except BlockingIOError:',
  `        if time.monotonic()>=end:sys.exit(${BUSY_EXIT})`,
  '        time.sleep(0.005)',
  'sys.stdout.write("held\\n");sys.stdout.flush()',
  'sys.stdin.buffer.read()',
].join('\n');
const pad=n=>String(n).padStart(3,'0');
export class OutputError extends Error{constructor(code,message){super(message);this.code=code;}}

/** The numbered fixture folders of a directory (whole folders only: staging folders start with a dot). */
export const numberedFolders=dir=>existsSync(dir)?readdirSync(dir,{withFileTypes:true}).filter(e=>e.isDirectory()&&/^\d{3}-/.test(e.name)).map(e=>e.name).sort():[];
/** The next serial number over every given directory. */
export const nextNumber=(...dirs)=>1+Math.max(0,...dirs.flatMap(d=>numberedFolders(d).map(n=>Number(n.slice(0,3)))));

export function writeDurable(file,content){const fd=openSync(file,'wx');try{writeSync(fd,content);fsyncSync(fd);}finally{closeSync(fd);}}
export function newStaging(out){mkdirSync(out,{recursive:true});return mkdtempSync(join(out,'.staging-'));}

/** What is wrong with a fixture folder, as a list (empty: it is whole). */
export function checkComplete(dir){
  const problems=[];
  for(const f of REQUIRED_FILES){
    const p=join(dir,f);
    try{if(statSync(p).size<2){problems.push(f+' is empty');continue;}JSON.parse(readFileSync(p,'utf8'));}catch(e){problems.push(f+': '+(e.code==='ENOENT'?'missing':e.message));}
  }
  return problems;
}

/**
 * Run fn while holding the output folder's publish lock: the kernel's flock on <out>/.publish.lock, held by a small Python 3 helper process (`python`, default /usr/bin/python3) that stays alive until this
 * process closes its stdin. If this process dies in any way (SIGKILL included) the pipe closes, the helper exits and the kernel frees the lock. Waits up to waitMs, then fails with a clear error;
 * a missing Python 3 is a clear error too (code 'lock'), never a silent go-ahead without the lock.
 */
export async function withLock(out,fn,{waitMs=30000,python=LOCK_PYTHON}={}){
  mkdirSync(out,{recursive:true});
  const helper=spawn(python,['-c',LOCK_HELPER,join(out,LOCK_NAME),String(Math.max(0.05,waitMs/1000))],{stdio:['pipe','pipe','pipe']});
  helper.stdin.on('error',()=>{});
  let problem='';helper.stderr.on('data',d=>{if(problem.length<500)problem+=d;});
  const outcome=await new Promise(resolve=>{
    let seen='';
    helper.stdout.on('data',d=>{seen+=d;if(seen.includes('held'))resolve('held');});
    helper.on('close',code=>resolve(code===BUSY_EXIT?'busy':`failed: the lock helper exited with ${code}${problem?' ('+problem.trim().split('\n').pop()+')':''}`));
    helper.on('error',e=>resolve(`failed: ${python} cannot be run (${e.code||e.message}); the output folder is locked with Python 3's standard library, which this repository lists as a prerequisite`));
  });
  if(outcome==='busy')throw new OutputError('busy',`the output folder ${out} stayed locked for ${waitMs} ms`);
  if(outcome!=='held')throw new OutputError('lock',`could not take the lock on ${out}: ${outcome}`);
  try{return await fn();}
  finally{helper.stdin.end();await new Promise(r=>{if(helper.exitCode!==null||helper.signalCode!==null)r();else helper.on('close',r);});}
}

/**
 * Make a finished staging folder the next numbered fixture of `out`. The number is the next one over `out` and every folder of `also` (the repository's own fixtures, read only);
 * `fixedNumber` insists on one number (accepting an already numbered fixture). Never overwrites. hooks: test-only callbacks (afterLock, beforeRename).
 */
export async function publish({staging,out,tail,fixedNumber=null,also=[],hooks={},waitMs,python}){
  const problems=checkComplete(staging);
  if(problems.length)throw new OutputError('incomplete','refusing to publish an incomplete snapshot: '+problems.join('; '));
  return withLock(out,async()=>{
    await hooks.afterLock?.();
    const number=nextNumber(out,...also);
    if(fixedNumber!==null&&fixedNumber!==number)throw new OutputError('number-conflict',`this snapshot is number ${pad(fixedNumber)} but the next free number in ${out} is ${pad(number)}`);
    const name=`${pad(number)}-${tail}`,final=join(out,name);
    if(existsSync(final))throw new OutputError('exists',final+' exists; nothing was overwritten');
    await hooks.beforeRename?.();
    try{renameSync(staging,final);}catch(e){throw new OutputError('exists',`could not publish ${final} without overwriting: ${e.code||e.message}`);}
    const same=numberedFolders(out).filter(n=>n.startsWith(pad(number)+'-'));
    if(same.length!==1)throw new OutputError('duplicate-number',`number ${pad(number)} was allocated twice in ${out}: ${same.join(', ')}`);
    return {path:final,number,name};
  },{waitMs,python});
}

/**
 * What a capture may truthfully call its source. `root` is the repository root the scripts live in; `git` runs git there (null when it fails).
 * A folder with a .git is a real checkout, and then NOTHING an override says can change what it is: the commit is the checked-out HEAD (--commit may only name that same commit), the release is the exact
 * tag at HEAD or else the nearest earlier release (--release may only name that one: no invented release), and a commit that is not exactly a release is a private, unpublished build that needs a clean tree
 * (the page's APP_BUILD is then checked against the commit by the caller). Only a tree with no .git (an extracted release) takes --release and --commit as given, and both are then required.
 */
export function resolveProvenance({root,release=null,commit=null,rehearsal=false,git}){
  git??=((...a)=>{try{return execFileSync('git',a,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{return null;}});
  const refuse=m=>{throw new OutputError('provenance',m);};
  const semver=/^v\d+\.\d+\.\d+$/;
  if(!existsSync(join(root,'.git'))){
    if(rehearsal)refuse('--rehearsal needs a git checkout');
    if(!release||!commit)refuse('Give --release and --commit when this is not a git checkout');
    if(!semver.test(release))refuse(`--release ${release} is not a release tag name (vX.Y.Z)`);
    if(!/^[0-9a-f]{40}$/.test(commit))refuse('--commit must be the full 40-character commit id of the extracted release');
    return {extracted:true,commitFull:commit,release,exactTag:null,privateBuild:false};
  }
  const head=git('rev-parse','HEAD'),top=git('rev-parse','--show-toplevel');
  if(!head||!top||realpathSync(top)!==realpathSync(root))refuse('cannot read the git checkout this script is in');
  if(commit!==null&&git('rev-parse','--verify','--quiet',commit+'^{commit}')!==head)refuse(`--commit ${commit} is not the checked-out commit ${head}; a capture is of the commit that is checked out`);
  const exactTag=git('describe','--tags','--exact-match','HEAD'),nearest=exactTag||git('describe','--tags','--abbrev=0');
  if(!nearest||!semver.test(nearest))refuse('no release tag (vX.Y.Z) is reachable from the checked-out commit, so its baseline release cannot be named');
  if(release!==null&&release!==nearest)refuse(`--release ${release} is not this checkout's release: ${exactTag?'it is exactly':'its nearest earlier release is'} ${nearest}`);
  const privateBuild=!exactTag;
  // EVERY capture from a git checkout, tagged release or private build, needs a clean tree (tracked, staged and untracked); only an explicit rehearsal may be dirty, and `accept` refuses a rehearsal.
  const dirty=git('status','--porcelain');
  if(dirty===null||(dirty&&!rehearsal))refuse('A capture is taken from a clean, committed tree (git status --porcelain must be empty)'+(dirty?':\n'+dirty:''));
  return {extracted:false,commitFull:head,release:nearest,exactTag,privateBuild};
}

/**
 * The build the page reports (window.APP_BUILD) must be the declared source commit, for every kind of capture (release, private build, extracted, rehearsal). A missing or different build is a clear error.
 */
export function checkBuildIdentity(app,declaredCommit){
  const seen=app&&typeof app==='object'?app.commit:undefined;
  if(typeof seen!=='string'||!seen)throw new OutputError('build','the page reports no build commit (window.APP_BUILD.commit is missing), so it cannot be shown to be the declared source '+declaredCommit);
  if(seen!==declaredCommit)throw new OutputError('build',`the page reports build ${seen}, not the declared source commit ${declaredCommit}`);
  return seen;
}

const hashFolder=dir=>REQUIRED_FILES.map(f=>createHash('sha256').update(readFileSync(join(dir,f))).digest('hex')).join(' ');

/** Take a finished fixture folder (a capture's output) into a fixtures folder under its own number; never overwrites, and refuses a rehearsal. */
export async function accept({from,into,hooks={}}){
  const name=basename(from),m=/^(\d{3})-(v\d+\.\d+\.\d+-[0-9a-f]{7})$/.exec(name);
  if(!m)throw new OutputError('name',`${name} is not a numbered fixture folder`);
  const problems=checkComplete(from);if(problems.length)throw new OutputError('incomplete',name+': '+problems.join('; '));
  const meta=JSON.parse(readFileSync(join(from,'meta.json'),'utf8'));
  if(meta.captureKind==='rehearsal')throw new OutputError('rehearsal',name+' is a rehearsal capture and cannot be accepted');
  const staging=newStaging(into);
  try{
    cpSync(from,staging,{recursive:true,errorOnExist:true});
    if(hashFolder(staging)!==hashFolder(from))throw new OutputError('copy','the copy differs from the original');
    for(const f of REQUIRED_FILES){const fd=openSync(join(staging,f),'r');try{fsyncSync(fd);}finally{closeSync(fd);}}
    return await publish({staging,out:into,tail:m[2],fixedNumber:Number(m[1]),hooks});
  }catch(e){rmSync(staging,{recursive:true,force:true});throw e;}
}
