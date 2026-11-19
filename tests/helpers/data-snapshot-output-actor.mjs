// One writer process for tests/data-snapshot-output.test.mjs: it stages a snapshot of its own and publishes (or accepts) it through scripts/data-snapshot-output.mjs, released by a
// barrier file so that the writers really collide. Modes may kill the process with SIGKILL at a chosen point (a crash holding or not yet holding the lock).
//   node data-snapshot-output-actor.mjs <mode> <out> <label> <startFile> [<tail>]    mode: publish | crash-staging | crash-locked | crash-before-rename | accept (out = destination, label = source folder)
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {publish,accept,newStaging,writeDurable} from '../../scripts/data-snapshot-output.mjs';

const [mode,out,label,startFile,tail='v9.9.9-aaaaaaa']=process.argv.slice(2);
const kill=()=>process.kill(process.pid,'SIGKILL');
const payload=label=>({label,filler:'x'.repeat(200000)});
const waitStart=async()=>{console.log('ready');for(let i=0;i<4000&&!existsSync(startFile);i++)await sleep(5);};
const report=r=>console.log(JSON.stringify(r));
try{
  if(mode==='accept'){
    await waitStart();
    try{report({ok:true,...await accept({from:label,into:out})});}catch(e){report({ok:false,code:e.code,message:e.message});}
  }else{
    const staging=newStaging(out);
    writeDurable(join(staging,'meta.json'),JSON.stringify({format:'plc-data-snapshot/1',label})+'\n');
    if(mode==='crash-staging'){writeDurable(join(staging,'plain.json'),JSON.stringify(payload(label)).slice(0,100000));await waitStart();kill();}   // half a file, then death
    writeDurable(join(staging,'plain.json'),JSON.stringify(payload(label))+'\n');
    writeDurable(join(staging,'vault.json'),JSON.stringify(payload(label+':vault'))+'\n');
    await waitStart();
    const hooks=mode==='crash-locked'?{afterLock:kill}:mode==='crash-before-rename'?{beforeRename:kill}:{};
    try{report({ok:true,label,...await publish({staging,out,tail,hooks,waitMs:20000})});}
    catch(e){report({ok:false,label,code:e.code,message:e.message});}
  }
}catch(e){report({ok:false,fatal:true,message:String(e&&e.stack||e)});process.exitCode=1;}
