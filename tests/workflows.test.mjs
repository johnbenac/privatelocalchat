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

// ---- the site layer is private (docs/SITE-LAYER.md) ---------------------------------------------------------------------------------------------------------------
// The built site holds the site layer, which is served but never published as files. Forks must receive no secrets, the key must never be printed, and the built site must never be kept.
const workflows=()=>readdirSync(new URL('../.github/workflows/',import.meta.url)).filter(f=>/\.ya?ml$/.test(f)).map(f=>[f,readFileSync(new URL('../.github/workflows/'+f,import.meta.url),'utf8')]);

test('no workflow runs code from a pull request with the repository\'s secrets', () => {
  for(const [file,text] of workflows())assert.ok(!/^\s*pull_request_target\s*:/m.test(text),`${file} uses pull_request_target, which gives a pull request the repository's secrets`);
});

test('no workflow keeps the built site: no artifact of dist, no release asset from it', () => {
  for(const [file,text] of workflows()){
    const uploads=[...text.matchAll(/uses:\s*actions\/upload-artifact[^\n]*\n((?:\s+[^\n]*\n)*?)(?=\s*-\s|\s*$)/g)];
    for(const u of uploads)assert.ok(!/path:\s*['"]?(\.\/)?dist\b/.test(u[1]),`${file} uploads the built site as an artifact`);
    assert.ok(!/gh release (upload|create)[^\n]*\bdist\b/.test(text),`${file} attaches the built site to a release`);
  }
});

test('the site layer is fetched with the deploy key only, kept out of the git config, and the key is never printed', () => {
  const deploy=readFileSync(new URL('../.github/workflows/deploy.yml',import.meta.url),'utf8');
  assert.match(deploy,/repository:\s*johnbenac\/privatelocalchat-site/);
  assert.match(deploy,/ssh-key:\s*\$\{\{\s*secrets\.SITE_DEPLOY_KEY\s*\}\}/);
  assert.match(deploy,/persist-credentials:\s*false/);
  assert.match(deploy,/ref:\s*\$\{\{\s*github\.ref_name\s*\}\}/,'the matching branch');
  for(const [file,text] of workflows()){
    assert.ok(!/(echo|printf|cat)[^\n]*SITE_DEPLOY_KEY/.test(text),`${file} prints the deploy key`);
    assert.ok(!/SITE_DEPLOY_KEY/.test(text)||file==='deploy.yml',`${file} uses the deploy key; only the deploy workflow may`);
  }
});

test('a deploy builds with the fetched site layer and runs its tests', () => {
  const deploy=readFileSync(new URL('../.github/workflows/deploy.yml',import.meta.url),'utf8');
  assert.match(deploy,/SITE_DIR:\s*site-layer/);
  assert.match(deploy,/node --test site-layer\/tests\/\*\.test\.mjs/);
  assert.ok(deploy.indexOf('Fetch the site layer')<deploy.indexOf('Build exact commit'),'fetched before the build');
});
