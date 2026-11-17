#!/usr/bin/env node
// Record the links the app draws to our pages, on every surface that draws one (tests/links/surfaces.mjs), from a real build in a real browser.
//   node scripts/links-snapshot.mjs record [--out docs/evidence/split/links-baseline.json]
// Run it on a build that has not been changed for the stage; tests/e2e/site-links.e2e.mjs then compares later builds with the file.
import {writeFileSync} from 'node:fs';
process.env.PLC_E2E_BRANCH??='main';
const {launch}=await import('../tests/e2e/harness.mjs');
const {collectLinks,BASELINE,SEEDED_THREADS}=await import('../tests/links/surfaces.mjs');
const args=process.argv.slice(2);
if(args[0]!=='record'){console.error('Usage: links-snapshot.mjs record [--out FILE]');process.exit(2);}
const out=args.includes('--out')?args[args.indexOf('--out')+1]:BASELINE;
const h=await launch({port:18541,storage:{chatThreads:SEEDED_THREADS}});
try{
  await h.page.waitForFunction(()=>window.__plcBooted===true&&Boolean(window.plcShell),null,{timeout:30000});
  const links=await collectLinks(h.page,h.origin);
  const total=Object.values(links).reduce((n,l)=>n+l.length,0);
  writeFileSync(out,JSON.stringify({format:'plc-links-baseline/1',note:'The links to our pages on every surface, as recorded by scripts/links-snapshot.mjs from a build with our site manifest.',surfaces:links},null,1)+'\n');
  console.log('wrote '+out+' ('+total+' links on '+Object.keys(links).length+' surfaces)');
  for(const [k,v] of Object.entries(links))console.log('  '+k+': '+v.map(l=>l.text+' -> '+l.href).join(' | '));
}catch(error){console.error('record failed: '+(error.stack||error));process.exitCode=1;}
finally{await h.close();}
