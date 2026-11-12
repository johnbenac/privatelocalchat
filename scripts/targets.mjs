// What a build is for (docs/SITE-LAYER.md, docs/RUN-IT.md): TARGET = app | runkit | site.
//
//   app      the app and nothing else: no pages, so the app is told about none
//   runkit   the app and run-kit/, the neutral Help and About that ship with it
//   site     the app and the site directory in SITE_DIR (the private site layer for privatelocal.chat)
//
// With TARGET unset, SITE_DIR unset means runkit and SITE_DIR set means site, so everything that already sets SITE_DIR keeps working.
// Our own development tooling (the telemetry receiver, the dev tools, the native runtime overlay) belongs to the site target on the dev branch and nowhere else:
// a build for downloading made on dev is refused, not quietly built without it.
export const TARGETS = Object.freeze(['app', 'runkit', 'site']);

/** @returns {{target:string, siteDir:string|null, branch:string, environment:string, devTooling:boolean}} or throws a message that says what to change. */
export function resolveTarget(env = process.env) {
  const siteDir = env.SITE_DIR || '';
  const given = env.TARGET || '';
  if (given && !TARGETS.includes(given)) throw new Error(`TARGET must be one of ${TARGETS.join(', ')} (it is "${given}")`);
  const target = given || (siteDir ? 'site' : 'runkit');
  if (target === 'site' && !siteDir) throw new Error('TARGET=site needs SITE_DIR, the folder of the site layer (docs/SITE-LAYER.md)');
  if (target !== 'site' && siteDir) throw new Error(`TARGET=${target} builds without a site directory, but SITE_DIR is set (${siteDir}): unset it, or use TARGET=site`);
  const branch = env.DEPLOY_BRANCH || env.GITHUB_REF_NAME || 'local';
  if (branch === 'dev' && target !== 'site') throw new Error(`TARGET=${target} cannot be built on the dev branch: the development tooling belongs to the site target, and a build for downloading must not carry it`);
  // The app shows its environment ("production · 2.0.0 · commit"). A copy built for downloading is never "production" or "development".
  const environment = target === 'site' ? (branch === 'main' ? 'production' : branch === 'dev' ? 'development' : 'local') : (branch === 'main' ? 'release' : 'local');
  return {target, siteDir: target === 'site' ? siteDir : target === 'runkit' ? 'run-kit' : null, branch, environment, devTooling: target === 'site' && branch === 'dev'};
}
