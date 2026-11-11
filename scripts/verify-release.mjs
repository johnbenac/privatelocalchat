const origin=process.env.DEPLOY_SITE_URL;
const commit=process.env.GITHUB_SHA;
const branch=process.env.GITHUB_REF_NAME;
if(!origin||!commit||!['main','dev'].includes(branch))throw Error('Release verification needs the site, commit and release branch');
let last;
for(let attempt=0;attempt<20;attempt++){
 try{
  const r=await fetch(origin+'/version.json?verify='+commit,{cache:'no-store'});
  if(!r.ok)throw Error('Version HTTP '+r.status);
  const build=await r.json();
  if(build.commit!==commit||build.branch!==branch)throw Error('Published build does not match the requested commit/branch');
  const page=await fetch(origin+'/',{cache:'no-store'});
  if(!page.ok)throw Error('App HTTP '+page.status);
  if(page.headers.get('cross-origin-opener-policy')!=='same-origin'||page.headers.get('cross-origin-embedder-policy')!=='require-corp')throw Error('Browser isolation headers missing');
  const html=await page.text();
  if(html.includes('migration-warning-banner')||!html.includes('/releases/'+commit+'/local-models.js'))throw Error('Unexpected app shell');
  if(!html.includes('issues/new/choose')||!html.includes('View source'))throw Error('Code or feedback link missing');
  if(!html.includes('"@type":"WebApplication"')||!html.includes('<link rel="canonical" href="https://privatelocal.chat/"'))throw Error('Search metadata missing from the app page');
  // the public pages, feed and crawl files are part of the release
  for(const [path,mustHave] of [['/help/','id="what-is-private-local-chat"'],['/about/','Private Local Chat is a free place to use AI in your browser.'],['/privacy/','Last reviewed'],['/updates/','rss.xml'],['/updates/rss.xml','<rss'],['/sitemap.xml','https://privatelocal.chat/help/'],['/robots.txt','Sitemap: https://privatelocal.chat/sitemap.xml']]){
   const r=await fetch(origin+path+'?verify='+commit,{cache:'no-store'});
   if(!r.ok)throw Error(path+' HTTP '+r.status);
   const body=await r.text();
   if(!body.includes(mustHave))throw Error(path+' does not look like the published page');
   if(path.endsWith('/')&&path!=='/'&&(body.includes('window.APP_BUILD')||body.includes('Preparing offline app')))throw Error(path+' served the app instead of its page');
  }
  // the earlier builds this deploy kept are still served (scripts/retain-releases.mjs)
  const held=await (await fetch(origin+'/releases/index.json?verify='+commit,{cache:'no-store'})).json();
  if(held.current!==commit)throw Error('releases/index.json does not name this build');
  for(const earlier of held.retained){const r=await fetch(origin+'/releases/'+earlier+'/release.json?verify='+commit,{cache:'no-store'});if(!r.ok)throw Error('The kept release '+earlier+' is not served (HTTP '+r.status+')');}
  console.log('Verified '+origin+' at '+commit+' ('+branch+')');process.exit(0);
 }catch(e){last=e;await new Promise(resolve=>setTimeout(resolve,3000));}
}
throw last;
