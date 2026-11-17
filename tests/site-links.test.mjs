// The links to our pages come from the site manifest and nowhere else (docs/PLAN, stage 3).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import path from 'node:path';
import {SITE_FORMAT,PAGES,validTarget,readSiteLinks,checkSiteJson,normalizedSiteLinks,siteLinks} from '../chat/site/site-links.mjs';

const OURS={format:SITE_FORMAT,pages:{help:'/help/',about:'/about/',privacy:'/privacy/',updates:'/updates/'}};

test('a target is a same-host path or an https address, and nothing else', () => {
  for(const good of ['/help/','/a','/help/#faq','https://example.org/help','https://example.org'])assert.ok(validTarget(good),good);
  for(const bad of ['','help/','//evil.example/','http://example.org/','javascript:alert(1)','data:text/html,x','/a b','/a\\b','https://','https:///x',null,undefined,5,{},['/a'],'/'+'x'.repeat(2000)])assert.ok(!validTarget(bad),String(bad));
});

test('our manifest gives every page, with anchors added by the caller', () => {
  const l=siteLinks(OURS);
  for(const page of PAGES)assert.ok(l.has(page),page);
  assert.equal(l.href('help'),'/help/');
  assert.equal(l.href('help','getting-started'),'/help/#getting-started');
  assert.equal(l.href('privacy','x y'),'/privacy/#x%20y');
  assert.equal(siteLinks({pages:{help:'https://ops.example/guide#old'}}).href('help','faq'),'https://ops.example/guide#faq','an anchor replaces one the target already had');
});

test('no manifest, an empty one, a broken one, or one of a newer format says nothing, and never throws', () => {
  for(const raw of [undefined,null,{},[],'text',5,{pages:null},{pages:[]},{pages:'x'},{format:'plc-site/2',pages:OURS.pages},{format:5,pages:OURS.pages}]){
    const l=siteLinks(raw);
    for(const page of PAGES){assert.ok(!l.has(page),page+' for '+JSON.stringify(raw));assert.equal(l.href(page,'a'),null);}
  }
  assert.deepEqual({...siteLinks().pages},{},'with no window, no pages');
});

test('a page that is missing, unknown or invalid is absent while the others stay', () => {
  const l=siteLinks({format:SITE_FORMAT,pages:{help:'/help/',privacy:'javascript:alert(1)',about:'',nonsense:'/x/',updates:'//evil.example/'}});
  assert.ok(l.has('help'));
  for(const page of ['privacy','about','updates'])assert.ok(!l.has(page),page);
  assert.ok(!('nonsense' in l.pages));
  assert.ok(Object.isFrozen(l.pages));
});

test('the build refuses a manifest with a mistake in it, in words', () => {
  assert.deepEqual(checkSiteJson(OURS),[]);
  assert.deepEqual(checkSiteJson({format:SITE_FORMAT,pages:{}}),[]);
  assert.match(checkSiteJson(null)[0],/must be an object/);
  assert.ok(checkSiteJson({pages:{}}).some(p=>/format must be/.test(p)));
  assert.ok(checkSiteJson({format:SITE_FORMAT,pages:{hepl:'/x/'}}).some(p=>/"hepl" is not a page/.test(p)));
  assert.ok(checkSiteJson({format:SITE_FORMAT,pages:{help:'help/'}}).some(p=>/pages\.help must be a path/.test(p)));
  assert.ok(checkSiteJson({format:SITE_FORMAT}).some(p=>/pages must be an object/.test(p)));
});

test('what the build writes into the page is already validated', () => {
  assert.deepEqual(normalizedSiteLinks(OURS),OURS);
  assert.deepEqual(normalizedSiteLinks({format:SITE_FORMAT,pages:{help:'/help/',privacy:'bad'}}),{format:SITE_FORMAT,pages:{help:'/help/'}});
  assert.deepEqual(normalizedSiteLinks(undefined),{format:SITE_FORMAT,pages:{}});
});

// ---- nothing in the app names one of our pages except through the manifest ----------------------------------------------------------------------------------------------
const root=path.resolve(import.meta.dirname,'..');
const APP_DIRS=['chat','runtime'],APP_FILES=['index.html','local-models.js','conversation-messages.mjs'];
const SKIP=new Set(['vendor','node_modules']);
function* files(dir){for(const name of readdirSync(dir)){if(SKIP.has(name))continue;const full=path.join(dir,name);const st=statSync(full);if(st.isDirectory())yield* files(full);else if(/\.(mjs|js|html)$/.test(name))yield full;}}
// a path to one of our pages in a string: "/help/", "/privacy/#x", '/about/', and also '/help/#' + anchor
const PAGE_PATH=/['"`]\/(help|about|privacy|updates)\/?(#[^'"`]*)?['"`]/g;

test('no app file names /help/, /about/, /privacy/ or /updates/ except the manifest module', () => {
  const found=[];
  const all=[...APP_FILES.map(f=>path.join(root,f)),...APP_DIRS.flatMap(d=>[...files(path.join(root,d))])];
  for(const file of all){
    const rel=path.relative(root,file);
    if(rel==='chat/site/site-links.mjs')continue;
    readFileSync(file,'utf8').split('\n').forEach((line,i)=>{if(PAGE_PATH.test(line))found.push(`${rel}:${i+1}: ${line.trim().slice(0,120)}`);PAGE_PATH.lastIndex=0;});
  }
  assert.deepEqual(found,[],'a link to our pages bypasses the site manifest (use siteLinks().href(page, anchor) and draw nothing when it is null):\n'+found.join('\n'));
});
