#!/usr/bin/env node
// Keep the release folders of earlier builds on the site, so a tab that started on an earlier build can keep loading its own files (docs/UPGRADE-BEHAVIOUR.md).
//
// A deploy replaces the whole site. Before it, this copies the folders of the builds the live site still holds (the current one and those it kept) into the new build's output,
// checking every file against the checksum its release.json recorded, and writes releases/index.json to say which ones are held. Nothing about the new build changes.
// A folder that cannot be fetched or does not match its checksums is left out and said so; the deploy still goes ahead, as it did before this existed.
//
//   node scripts/retain-releases.mjs --site https://privatelocal.chat [--out dist] [--keep 4]
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

export const DEFAULT_KEEP=4; // builds on the site at once: the new one and the three before it

async function getJson(fetchImpl,url){
  const response=await fetchImpl(url,{cache:'no-store'});
  if(!response.ok)throw new Error(url+' answered '+response.status);
  return response.json();
}

/** Copy one earlier release folder from the live site into `out`, verified file by file. Returns the number of files, or throws and leaves nothing half-written for the caller to use. */
async function copyRelease({fetchImpl,site,out,commit}){
  const manifest=await getJson(fetchImpl,`${site}/releases/${commit}/release.json`);
  if(manifest.commit!==commit||!Array.isArray(manifest.files)||!manifest.files.length)throw new Error('the manifest of '+commit+' is not for that build');
  const base=path.join(out,'releases',commit);
  const queue=[...manifest.files];
  await Promise.all(Array.from({length:8},async()=>{
    while(queue.length){
      const file=queue.shift();
      if(typeof file.path!=='string'||file.path.startsWith('/')||file.path.split('/').includes('..'))throw new Error('unsafe path in the manifest of '+commit);
      const response=await fetchImpl(`${site}/releases/${commit}/${file.path.split('/').map(encodeURIComponent).join('/')}`,{cache:'no-store'});
      if(!response.ok)throw new Error(`${file.path} answered ${response.status}`);
      const bytes=Buffer.from(await response.arrayBuffer());
      if(bytes.length!==file.bytes||createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw new Error(`${file.path} does not match its checksum`);
      const target=path.join(base,file.path);
      await mkdir(path.dirname(target),{recursive:true});
      await writeFile(target,bytes);
    }
  }));
  await writeFile(path.join(base,'release.json'),JSON.stringify(manifest,null,1)+'\n');
  return manifest.files.length+1;
}

/** @returns {Promise<{current:string,retained:string[],skipped:{commit:string,reason:string}[]}>} */
export async function retainReleases({site,out,keep=DEFAULT_KEEP,fetchImpl=fetch,log=()=>{}}){
  const own=JSON.parse(await readFile(path.join(out,'releases','index.json'),'utf8'));
  const current=own.current;
  const retained=[],skipped=[];
  let live=null;
  try{live=await getJson(fetchImpl,`${site}/releases/index.json?t=${Date.now()}`);}
  catch(error){log('No list of earlier releases on '+site+' ('+error.message+'): nothing to keep.');}
  // newest first: the build now live, then the ones it kept
  const candidates=live&&typeof live.current==='string'?[live.current,...(Array.isArray(live.retained)?live.retained:[])]:[];
  for(const commit of candidates){
    if(retained.length>=keep-1)break;
    if(commit===current||retained.includes(commit))continue;
    if(!/^[0-9a-f]{40}$/.test(commit)){skipped.push({commit:String(commit),reason:'not a commit'});continue;}
    try{const count=await copyRelease({fetchImpl,site,out,commit});retained.push(commit);log(`Kept ${commit.slice(0,7)} (${count} files).`);}
    catch(error){skipped.push({commit,reason:error.message});log(`Could not keep ${commit.slice(0,7)}: ${error.message}`);}
  }
  await writeFile(path.join(out,'releases','index.json'),JSON.stringify({current,retained})+'\n');
  return {current,retained,skipped};
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);
  const opt=name=>{const i=args.indexOf('--'+name);return i>=0?args[i+1]:null;};
  const site=opt('site');
  if(!site){console.error('Usage: retain-releases.mjs --site https://example [--out dist] [--keep 4]');process.exit(2);}
  const result=await retainReleases({site:site.replace(/\/$/,''),out:path.resolve(opt('out')||'dist'),keep:Number(opt('keep')||DEFAULT_KEEP),log:line=>console.log(line)});
  console.log(`Releases held after this deploy: ${[result.current,...result.retained].map(c=>c.slice(0,7)).join(', ')}`);
}
