import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';

// docs/OFFLINE-PLAN.md is a living plan. A step that is ticked ([x]) and names a file must name one that exists, so the plan cannot claim work that
// is not there (the same protection tests/architecture-doc.test.mjs gives the architecture page). Steps still open ([ ]) or in progress ([~]) may name files to come.
const plan=await readFile(new URL('../docs/OFFLINE-PLAN.md',import.meta.url),'utf8');
const FILE=/`((?:tests|chat|runtime|docs|scripts|dev-tools|\.github)\/[A-Za-z0-9_./-]+\.(?:mjs|js|json|md|yml|png|py|css|html))`/g;
const exists=async p=>{try{await access(new URL('../'+p,import.meta.url));return true;}catch{return false;}};

test('every file named by a ticked step of the offline plan exists',async()=>{
  const missing=[];
  for(const line of plan.split('\n')){
    if(!/^- \[x\]/.test(line))continue;
    for(const m of line.matchAll(FILE))if(!(await exists(m[1])))missing.push(m[1]);
  }
  assert.deepEqual(missing,[],'ticked steps name files that do not exist');
});

test('the plan lists its phases and says where it stands',()=>{
  for(const h of ['### Phase 0','### Phase 1','### Phase 2','### Phase 3','### Phase 4','### Phase 5','## Log'])assert.ok(plan.includes(h),h);
  assert.match(plan,/Status:/);
});

test('every test file the plan promises under Automation exists once its phase is done',async()=>{
  const auto=plan.slice(plan.indexOf('## Automation'),plan.indexOf('## Open questions'));
  const named=[...auto.matchAll(FILE)].map(m=>m[1]).filter(p=>p.startsWith('tests/'));
  const missing=[];for(const p of named)if(!(await exists(p)))missing.push(p);
  assert.deepEqual(missing,[],'the Automation section names tests that do not exist');
});
