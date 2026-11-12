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

// ---- the release carries its files (docs/RELEASING.md) --------------------------------------------------------------------------------------------------------
// The release is made by semantic-release from .releaserc.cjs; what it attaches and how the files are vouched for is pinned here, because a workflow cannot be run in a test.
import {createRequire} from 'node:module';
const releaseConfig=createRequire(import.meta.url)('../.releaserc.cjs');
const releaseYml=readFileSync(new URL('../.github/workflows/release.yml',import.meta.url),'utf8');
const pluginName=p=>Array.isArray(p)?p[0]:p;
const plugin=name=>releaseConfig.plugins.find(p=>pluginName(p)===name);

test('the release notes generator comes before exec, which comes before the GitHub release, so the Upgrading section is appended and the assets exist when they are attached',()=>{
  const names=releaseConfig.plugins.map(pluginName);
  assert.ok(names.indexOf('@semantic-release/commit-analyzer')<names.indexOf('@semantic-release/release-notes-generator'));
  assert.ok(names.indexOf('@semantic-release/release-notes-generator')<names.indexOf('@semantic-release/exec'));
  assert.ok(names.indexOf('@semantic-release/exec')<names.indexOf('@semantic-release/github'));
});

test('exec packs the assets and writes the notes through scripts/release-hooks.mjs, with the version and the commit being released',()=>{
  const {generateNotesCmd,prepareCmd}=plugin('@semantic-release/exec')[1];
  assert.match(prepareCmd,/^node scripts\/release-hooks\.mjs prepare --version \$\{nextRelease\.version\} --commit \$\{nextRelease\.gitHead\} --out release-assets$/);
  assert.match(generateNotesCmd,/^node scripts\/release-hooks\.mjs notes --version \$\{nextRelease\.version\} --commit \$\{nextRelease\.gitHead\} --last-tag \$\{lastRelease\.gitTag\}$/);
  for(const cmd of [prepareCmd,generateNotesCmd])for(const m of cmd.matchAll(/\$\{([^}]+)\}/g))assert.ok(['nextRelease.version','nextRelease.gitHead','lastRelease.gitTag'].includes(m[1]),'unknown placeholder '+m[1]);
});

test('the GitHub release attaches both zips, compat.json and SHA256SUMS, and nothing from the site build',()=>{
  const assets=plugin('@semantic-release/github')[1].assets.map(a=>a.path??a);
  assert.deepEqual(assets,['release-assets/*.zip','release-assets/compat.json','release-assets/SHA256SUMS']);
  assert.ok(!/_site|dist\//.test(assets.join()));
});

test('the release job installs the dependencies before the release, names the exec plugin, and gives the notes the token gh needs',()=>{
  assert.ok(releaseYml.indexOf('npm ci')>0&&releaseYml.indexOf('npm ci')<releaseYml.indexOf('cycjimmy/semantic-release-action'));
  assert.match(releaseYml,/extra_plugins: \|[\s\S]*@semantic-release\/exec/);
  assert.match(releaseYml,/GH_TOKEN: \$\{\{ secrets\.GITHUB_TOKEN \}\}/);
  assert.ok(releaseYml.indexOf('A release needs the data upgrade suite green')<releaseYml.indexOf('npm ci'),'the data upgrade gate stays first');
});

test('the files are attested after the release, as a step whose failure does not undo it',()=>{
  const step=releaseYml.slice(releaseYml.indexOf('- name: Attest the release files'));
  assert.match(step,/if: steps\.release\.outputs\.new_release_published == 'true'/);
  assert.match(step,/continue-on-error: true/);
  assert.match(step,/uses: actions\/attest-build-provenance@v2/);
  assert.match(step,/subject-path: release-assets\/\*/);
  assert.match(releaseYml,/id: release\n\s+uses: cycjimmy\/semantic-release-action@v4/);
  assert.match(releaseYml,/permissions:[\s\S]*id-token: write[\s\S]*attestations: write/);
});

test('the release job never touches the site layer or its key',()=>{
  assert.ok(!/SITE_DEPLOY_KEY|SITE_DIR|privatelocalchat-site|TARGET=site/.test(releaseYml));
});

// ---- the deploy never falls back to the neutral pages (docs/SITE-LAYER.md) -----------------------------------------------------------------------------------
test('the deploy builds through scripts/ci-build.mjs with REQUIRE_SITE=1, and nothing else builds the site',()=>{
  const deploy=readFileSync(new URL('../.github/workflows/deploy.yml',import.meta.url),'utf8');
  const step=deploy.slice(deploy.indexOf('- name: Build exact commit'),deploy.indexOf('- name: Check branch has not advanced'));
  assert.match(step,/run: node scripts\/ci-build\.mjs\n/);
  assert.match(step,/REQUIRE_SITE: '1'/);
  assert.match(step,/SITE_DIR: site-layer/);
  assert.ok(!/npm run build|TARGET:/.test(step),'the deploy does not build around the selection script');
  assert.ok(deploy.indexOf('Fetch the site layer')<deploy.indexOf('Build exact commit'),'fetched before the build');
});

test('no other workflow builds the site target or reads the site layer, and the release builds only app and runkit',()=>{
  for(const [file,text] of workflows()){
    if(file==='deploy.yml')continue;
    assert.ok(!/TARGET:\s*site|SITE_DIR:/.test(text),`${file} builds the site target`);
  }
});

// ---- the operator tools' browser proof (docs/RUN-IT.md) -----------------------------------------------------------------------------------------------------------
// What this workflow may and may not do, as a list of what is wrong with a text of it; the second test feeds it a bad one.
const operatorWorkflowProblems=text=>{
  const problems=[];
  if(!/^name: Operator tools$/m.test(text))problems.push('not named Operator tools');
  if(!/^\s+run: node tests\/e2e\/operator\.e2e\.mjs$/m.test(text))problems.push('does not run the browser proof');
  if(!/^on:\n  pull_request:\n  push:\n    branches: \[main, dev\]/m.test(text))problems.push('does not run on pull requests and pushes to main');
  if(!/^permissions:\n  contents: read\n(?=\S)/m.test(text))problems.push('permissions are not contents: read alone');
  if(/secrets\./.test(text))problems.push('uses a secret');
  if(/SITE_DIR|SITE_DEPLOY_KEY|privatelocalchat-site/.test(text))problems.push('touches the site layer');
  if(/upload-artifact/.test(text))problems.push('keeps an artifact');
  if(/pull_request_target/.test(text))problems.push('uses pull_request_target');
  return problems;
};

test('the Operator tools workflow exists, runs the browser proof, reads the repository only and is not a gate of the release',()=>{
  const text=readFileSync(new URL('../.github/workflows/operator-tools.yml',import.meta.url),'utf8');
  assert.deepEqual(operatorWorkflowProblems(text),[]);
  assert.ok(!/Operator tools/.test(readFileSync(new URL('../.github/workflows/release.yml',import.meta.url),'utf8')),'the release does not wait for it');
});

test('the Operator tools checks refuse a workflow that takes a secret, writes, touches the site layer or keeps an artifact',()=>{
  const bad='name: Operator tools\non:\n  pull_request_target:\npermissions:\n  contents: write\njobs:\n  x:\n    steps:\n      - run: echo ${{ secrets.TOKEN }}\n        env:\n          SITE_DIR: site-layer\n      - uses: actions/upload-artifact@v4\n';
  const found=operatorWorkflowProblems(bad);
  for(const part of ['does not run the browser proof','does not run on pull requests','permissions are not','uses a secret','touches the site layer','keeps an artifact','pull_request_target'])assert.ok(found.some(f=>f.includes(part)),'not caught: '+part+' in '+found.join('; '));
});
