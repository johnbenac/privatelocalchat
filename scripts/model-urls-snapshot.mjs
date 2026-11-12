#!/usr/bin/env node
// Record every address the app can request for a model, a voice or the embedding set, with its pin (tests/links/model-urls.mjs).
//   node scripts/model-urls-snapshot.mjs record [--out docs/evidence/split/model-urls-baseline.json]
// Run it on a build that has not been changed for the stage; tests/model-urls.test.mjs then compares later builds with the file.
import '../tests/helpers/install-app-config.mjs'; // the model sources the build writes into the page (docs/APP-CONFIG.md)
import {writeFileSync} from 'node:fs';
const {collectModelUrls,BASELINE}=await import('../tests/links/model-urls.mjs');
const args=process.argv.slice(2);
if(args[0]!=='record'){console.error('Usage: model-urls-snapshot.mjs record [--out FILE]');process.exit(2);}
const out=args.includes('--out')?args[args.indexOf('--out')+1]:BASELINE;
// The sources exactly as local-models.js builds them today (before the configuration exists): the project's CDN for the 9B builds and the Qwen 2B shards.
const {resolveSources}=await import('../runtime/providers/catalog.mjs');
const base='https://assets.privatelocal.chat/models/';
const variants={q4f16_1:'c7c5d3f5a81e37b8facbb72970940a1b131314a8',q4f32_1:'f8f042bfb68cb88573af4c8e0ef9b1a26bef4ad0'};
const webllm=Object.fromEntries(Object.entries(variants).map(([v,r])=>[v,base+'Qwen3.5-9B-'+v+'-MLC/resolve/'+r+'/']));
const {sources}=resolveSources({webllmModelBase:webllm,webllmLibBase:webllm,wllamaModelBase:base+'Qwen3.5-2B/15852e8c16360a2fea060d615a32b45270f8a8fc/'});
const urls=await collectModelUrls({effectiveSources:sources});
const count=Object.values(urls.tiers).flatMap(t=>Object.values(t)).flat().length+Object.values(urls.voices).flat().length;
writeFileSync(out,JSON.stringify({format:'plc-model-urls-baseline/1',note:'Every address the app requests for a model, a voice or the embedding set, with its pin, as recorded by scripts/model-urls-snapshot.mjs before the configuration existed.',...urls},null,1)+'\n');
console.log('wrote '+out+' ('+count+' addresses; tiers: '+Object.keys(urls.tiers).join(', ')+')');
const hosts=new Set();for(const f of [...Object.values(urls.tiers).flatMap(t=>Object.values(t)).flat(),...Object.values(urls.voices).flat()])hosts.add(new URL(f.url).origin);
console.log('hosts: '+[...hosts].join(', ')+'; embedding: '+urls.embedding.modelBase);
