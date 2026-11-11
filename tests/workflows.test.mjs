// A workflow file that is not valid YAML does not fail loudly: GitHub lists it as a run named after the file and the checks it should have made simply never happen.
// The release waits for the Data upgrade workflow, so a broken one would open the gate by silence. This catches the usual cause: a ": " inside an unquoted name.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';

test('no workflow step or job name holds a ": " outside quotes', () => {
  const dir=new URL('../.github/workflows/',import.meta.url);
  for(const file of readdirSync(dir).filter(f=>/\.ya?ml$/.test(f))){
    readFileSync(new URL(file,dir),'utf8').split('\n').forEach((line,i)=>{
      const m=/^\s*(?:-\s+)?name:\s+(.*)$/.exec(line);
      if(!m)return;
      const value=m[1].trim();
      if(/^["']/.test(value))return;
      assert.ok(!/:(\s|$)/.test(value),`${file}:${i+1}: the name holds ": " and is not quoted: ${value}`);
    });
  }
});

test('the workflows the release depends on exist and are named as it expects', () => {
  const read=f=>readFileSync(new URL('../.github/workflows/'+f,import.meta.url),'utf8');
  assert.match(read('data-upgrade.yml'),/^name: Data upgrade$/m);
  assert.match(read('release.yml'),/Data upgrade/);
});
