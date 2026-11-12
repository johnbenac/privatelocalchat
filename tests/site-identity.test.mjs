// The identity of the site that serves a copy (the `site` block of the site manifest) is the only place the app learns its public address, the picture shown when it is shared, and whether its host
// counts page loads. Without it a copy names no site (docs/SITE-LINKS.md, docs/APP-CONFIG.md).
import './helpers/install-app-config.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {checkSiteJson,normalizedSiteLinks,siteLinks,SITE_FORMAT} from '../chat/site/site-links.mjs';
import {NODES} from '../chat/roberta/ivr-content.mjs';
import {PRODUCT,mountProductShare,shareProduct} from '../chat/transfer/product-share.mjs';

const OURS=JSON.parse(readFileSync(new URL('../site.json',import.meta.url),'utf8'));
const withSite=site=>({format:SITE_FORMAT,pages:{help:'/help/'},...(site?{site}:{})});
const useSite=raw=>{globalThis.SITE_LINKS=raw===undefined?undefined:normalizedSiteLinks(raw);};
const TRACKING="There's no Private Local Chat account, and the app itself has no analytics or tracking scripts. At privatelocal.chat, the host counts page loads without cookies, and never sees what you type or say.";

test('the site block is checked: an address that is exactly an origin, an image path, a true or false', () => {
  assert.deepEqual(checkSiteJson(OURS),[]);
  const bad=site=>checkSiteJson({...OURS,site}).join(' | ');
  assert.match(bad('x'),/site must be an object/);
  assert.match(bad({}),/site.url must be/);
  assert.match(bad({url:'http://privatelocal.chat/'}),/site.url must be/);
  assert.match(bad({url:'https://privatelocal.chat/path'}),/site.url must be/);
  assert.match(bad({url:'https://x.example/"><script>'}),/site.url must be/);
  assert.match(bad({url:'https://x.example/',socialImage:'../card.png'}),/socialImage must be/);
  assert.match(bad({url:'https://x.example/',socialImage:'/a b.png'}),/socialImage must be/);
  assert.match(bad({url:'https://x.example/',countsPageLoads:'yes'}),/countsPageLoads must be/);
  assert.match(bad({url:'https://x.example/',colour:'red'}),/"colour" is not a setting/);
  assert.equal(siteLinks(normalizedSiteLinks(withSite({url:'https://x.example/'}))).site.host,'x.example');
  assert.equal(siteLinks(normalizedSiteLinks(withSite({url:'http://bad/'}))).site,null,'a broken site block says nothing');
});

test('what the assistant says about tracking is our site\'s own statement, and only when the manifest makes it', () => {
  const say=()=>NODES['privacy.account'].say({}).join(' ');
  useSite(OURS);assert.ok(say().startsWith(TRACKING),'our site: the sentence is exactly what it was');
  useSite(withSite({url:'https://copy.example/',countsPageLoads:true}));assert.match(say(),/At copy\.example, the host counts page loads/);
  useSite(withSite({url:'https://copy.example/'}));assert.ok(!/counts page loads/.test(say())&&/no analytics or tracking scripts\./.test(say()));
  useSite(undefined);assert.ok(!/counts page loads|privatelocal\.chat/.test(say()),'no site, no sentence about a host');
});

test('the share answer and the share panel need a site address', async () => {
  const say=()=>NODES.share.say({}).join(' ');
  useSite(OURS);assert.match(say(),/Here's the share sheet/);assert.equal(PRODUCT.url,'https://privatelocal.chat/');
  useSite(undefined);assert.match(say(),/no public address to share/);assert.equal(PRODUCT.url,null);
  const mounted=mountProductShare({},{doc:{},nav:{}});assert.equal(mounted.element,null,'the panel is not drawn');assert.doesNotThrow(()=>mounted.destroy());
  assert.equal(await shareProduct({share:async()=>{throw new Error('must not be called');},canShare:()=>true}),'unavailable','nothing is handed to the device without an address');
  useSite(withSite({url:'https://copy.example/'}));assert.equal(PRODUCT.url,'https://copy.example/');
});

// ---- the page head -------------------------------------------------------------------------------------------------------------------------------------------------------
const root=path.resolve(import.meta.dirname,'..');
function head(siteJson){
  const dir=mkdtempSync(path.join(root,'.tmp-head-'));
  try{
    const manifest=path.join(dir,'site.json');writeFileSync(manifest,JSON.stringify(siteJson));
    execFileSync('node',['scripts/build.mjs'],{stdio:'pipe',env:{...process.env,BUILD_OUT_DIR:path.join(dir,'out'),SITE_JSON_PATH:siteJson?manifest:'',GITHUB_SHA:'a'.repeat(40),DEPLOY_BRANCH:'local',SOURCE_DATE_EPOCH:'1'}});
    // the shipped default model source (window.APP_CONFIG) names the project's content delivery network by design, so it is not part of what is checked here
    return readFileSync(path.join(dir,'out','index.html'),'utf8').split('</head>')[0].replace(/<script>window\.APP_CONFIG=[^]*?<\/script>/,'');
  }finally{rmSync(dir,{recursive:true,force:true});}
}
const IMAGE='https://privatelocal.chat/brand/social-card-1200x630.png';

test('with our manifest the page head names the site exactly as it always did', () => {
  const h=head(OURS);
  for(const line of ['<link rel="canonical" href="https://privatelocal.chat/" />','<meta property="og:url" content="https://privatelocal.chat/" />',`<meta property="og:image" content="${IMAGE}" />`,`<meta property="og:image:secure_url" content="${IMAGE}" />`,`<meta name="twitter:image" content="${IMAGE}" />`,'"url":"https://privatelocal.chat/"'])assert.ok(h.includes(line),line);
  assert.ok(h.includes('<meta property="og:image:width" content="1200" />')&&h.includes('<meta name="twitter:image:alt"'));
  assert.ok(!/site-head|\{\{SITE_/.test(h),'no marker or placeholder is left');
});

test('without a site block the head names no site: no canonical, no address, no picture, no structured data', () => {
  for(const h of [head(null),head({format:SITE_FORMAT,pages:OURS.pages})]){
    assert.ok(!/privatelocal\.chat|rel="canonical"|og:url|og:image|twitter:image|ld\+json|site-head|\{\{SITE_/.test(h),'a tag that names the site is left in the head');
    assert.ok(h.includes('<meta property="og:title" content="Private Local Chat" />')&&h.includes('<title>'),'the generic tags stay');
  }
});

test('a site with an address but no picture gets the address tags and no picture tags; its values are escaped', () => {
  const h=head(withSite({url:'https://copy.example:8443/',countsPageLoads:false}));
  assert.ok(h.includes('<link rel="canonical" href="https://copy.example:8443/" />')&&h.includes('og:url'));
  assert.ok(!/og:image|twitter:image/.test(h));
  assert.ok(h.includes('"url":"https://copy.example:8443/"'));
});
