import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';

// docs/ENCRYPTION-AT-REST-PLAN.md is a living plan. A ticked step that names a file must name one that exists, so the plan cannot claim work that is not
// there (the same protection tests/offline-plan.test.mjs and tests/architecture-doc.test.mjs give their pages). Steps still open may name files to come.
const plan=await readFile(new URL('../docs/ENCRYPTION-AT-REST-PLAN.md',import.meta.url),'utf8');
const FILE=/`((?:tests|chat|runtime|docs|scripts|dev-tools|\.github)\/[A-Za-z0-9_./-]+\.(?:mjs|js|json|md|yml|png|py|css|html))`/g;
const exists=async p=>{try{await access(new URL('../'+p,import.meta.url));return true;}catch{return false;}};

test('every file named by a ticked step of the encryption plan exists',async()=>{
  const missing=[];
  for(const line of plan.split('\n')){
    if(!/^- \[x\]/.test(line))continue;
    for(const m of line.matchAll(FILE))if(!(await exists(m[1])))missing.push(m[1]);
  }
  assert.deepEqual(missing,[],'ticked steps name files that do not exist');
});

test('the plan lists its phases, says where it stands and keeps a log',()=>{
  for(const h of ['### Phase 0','### Phase 1','### Phase 2','### Phase 3','### Phase 4','### Phase 5','### Phase 6','## Automation','## Open questions','## Log','## What this does not protect against'])assert.ok(plan.includes(h),h);
  assert.match(plan,/\*\*Status:/);
});

test('the checks listed as existing under Automation exist; those promised for a phase are only allowed while that phase has an open step',async()=>{
  const auto=plan.slice(plan.indexOf('## Automation'),plan.indexOf('## Open questions'));
  const missing=[];
  for(const line of auto.split('\n')){
    if(!line.startsWith('- '))continue;
    if(/Created with (?:their|phase)|Runs on every push once it exists|phase 2\)|phase 4\)|phases 1 and 2\)/.test(line))continue; // promised, not built yet
    for(const m of line.matchAll(FILE))if(m[1].startsWith('tests/')&&!(await exists(m[1])))missing.push(m[1]);
  }
  assert.deepEqual(missing,[],'the Automation section names tests that do not exist');
});

test('the plan names its inventory, and the inventory parses and is classified',async()=>{
  assert.ok(plan.includes('docs/evidence/encryption/storage-inventory.json'));
  const inv=JSON.parse(await readFile(new URL('../docs/evidence/encryption/storage-inventory.json',import.meta.url),'utf8'));
  assert.ok(inv.keys.length>20&&Object.keys(inv.classes).length>=5);
});

test('the plan keeps every open question answered with a recommendation, and every phase has at least one step',()=>{
  const q=plan.slice(plan.indexOf('## Open questions'),plan.indexOf('## Log'));
  const items=q.split('\n').filter(l=>/^\d+\. /.test(l));
  assert.ok(items.length>=5);
  for(const l of items)assert.match(l,/\[[^\]]{8,}\]/,'a recommended answer in brackets: '+l.slice(0,60));
  for(const n of [0,1,2,3,4,5,6]){
    const from=plan.indexOf('### Phase '+n),to=plan.indexOf('\n### ',from+5)>0?plan.indexOf('\n### ',from+5):plan.indexOf('\n## ',from+5);
    assert.match(plan.slice(from,to),/^- \[[ x~]\]/m,'phase '+n+' has steps');
  }
});
