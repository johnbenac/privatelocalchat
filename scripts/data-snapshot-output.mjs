// Where a captured data snapshot goes, and how it is allocated a number and published (used by scripts/data-snapshot.mjs; test: tests/data-snapshot-output.test.mjs).
//
// A capture is written into a private staging folder inside the output folder (".staging-*", never numbered, never listed) and becomes a numbered fixture in ONE step: a rename
// of the finished folder to "NNN-<release>-<commit>". The kernel makes that rename atomic, so a reader and a later writer see either no folder or a whole one, and a writer that dies
// at any point before the rename leaves only a dot-folder that nothing reads. Choosing the number and renaming happen under one short lock per output folder (a kernel flock on
// ".publish.lock", taken through flock(1)); the kernel releases it when its holder dies, however it dies, so a killed writer never blocks the next one and there is no marker to go stale. The
// allocator never overwrites: an existing folder, a number that is not the next one, or a lock that stays held past the wait is a clear error, never a silent replacement.
import {mkdirSync,mkdtempSync,openSync,writeSync,fsyncSync,closeSync,renameSync,readdirSync,readFileSync,existsSync,statSync,cpSync,rmSync} from 'node:fs';
import {join,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';

export const REQUIRED_FILES=['meta.json','plain.json','vault.json'];
export const LOCK_NAME='.publish.lock';
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
 * Run fn while holding the output folder's publish lock: the kernel's flock on <out>/.publish.lock, held by a small helper process that stays alive until this process closes its stdin.
 * If this process dies in any way (SIGKILL included) the pipe closes, the helper exits and the kernel frees the lock. Waits up to waitMs, then fails with a clear error.
 */
export async function withLock(out,fn,{waitMs=30000}={}){
  mkdirSync(out,{recursive:true});
  const helper=spawn('flock',['-x','-w',String(Math.max(1,Math.ceil(waitMs/1000))),join(out,LOCK_NAME),'sh','-c','echo held; cat >/dev/null'],{stdio:['pipe','pipe','ignore']});
  const outcome=await new Promise(resolve=>{
    let seen='';
    helper.stdout.on('data',d=>{seen+=d;if(seen.includes('held'))resolve('held');});
    helper.on('close',code=>resolve(code===1?'busy':'failed:'+code));
    helper.on('error',e=>resolve('failed:'+e.message));
  });
  if(outcome==='busy')throw new OutputError('busy',`the output folder ${out} stayed locked for ${waitMs} ms`);
  if(outcome!=='held')throw new OutputError('lock',`could not take the lock on ${out}: ${outcome}`);
  try{return await fn();}
  finally{helper.stdin.end();await new Promise(r=>{if(helper.exitCode!==null)r();else helper.on('close',r);});}
}

/**
 * Make a finished staging folder the next numbered fixture of `out`. The number is the next one over `out` and every folder of `also` (the repository's own fixtures, read only);
 * `fixedNumber` insists on one number (accepting an already numbered fixture). Never overwrites. hooks: test-only callbacks (afterLock, beforeRename).
 */
export async function publish({staging,out,tail,fixedNumber=null,also=[],hooks={},waitMs}){
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
  },{waitMs});
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
