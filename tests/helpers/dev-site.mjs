// A dev build carries our development tooling, which belongs to the site target (scripts/targets.mjs), so a test that builds for dev builds with a site directory:
// the fixture site, unless the caller chose one. Other branches build the neutral pages as before.
export const devSite=(branch,env=process.env)=>branch==='dev'&&!env.SITE_DIR&&!env.TARGET?{SITE_DIR:'tests/fixtures/site'}:{};
