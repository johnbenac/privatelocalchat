#!/usr/bin/env node
// The build a CI job runs: it picks the target from what is on disk, so the choice is code that can be run and tested, not YAML (docs/SITE-LAYER.md, docs/RELEASING.md).
//
//   SITE_DIR=<folder> [REQUIRE_SITE=1] node scripts/ci-build.mjs
//
// - SITE_DIR names a folder that holds a site.json: the site layer is there, and it builds TARGET=site (the pages of that folder).
// - Otherwise it builds the neutral `runkit` target, so a clone or a fork builds a complete app with no setup.
// - REQUIRE_SITE=1 turns the second case into a failure: a deploy of privatelocal.chat must never fall back to the neutral pages, so a missing site layer stops it and the live site stays as it is.
// Everything else in the environment (DEPLOY_BRANCH, BUILD_OUT_DIR, SOURCE_DATE_EPOCH, ...) goes to scripts/build.mjs unchanged. TARGET is not accepted: this script is what chooses it.
import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

/**
 * Decides the build. Returns { target, env } where env is the environment for scripts/build.mjs, or throws a message that says what to change.
 * `cwd` is what a relative SITE_DIR is relative to.
 */
export function chooseBuild(env = process.env, cwd = process.cwd()) {
  if (env.TARGET) throw new Error(`TARGET is set (${env.TARGET}), but this script chooses the target from the site layer: unset TARGET, or run scripts/build.mjs directly`);
  const required = env.REQUIRE_SITE === '1';
  const siteDir = env.SITE_DIR || '';
  const present = siteDir !== '' && existsSync(path.join(path.resolve(cwd, siteDir), 'site.json'));
  const out = {...env};
  delete out.REQUIRE_SITE;
  if (present) return {target: 'site', env: {...out, TARGET: 'site', SITE_DIR: siteDir}};
  if (required) {
    throw new Error(siteDir
      ? `REQUIRE_SITE=1, but ${siteDir} holds no site.json: the site layer was not fetched. Nothing is built, so the live site stays as it is.`
      : 'REQUIRE_SITE=1, but SITE_DIR is not set: there is no site layer to build. Nothing is built, so the live site stays as it is.');
  }
  delete out.SITE_DIR;
  return {target: 'runkit', env: {...out, TARGET: 'runkit'}};
}

function cli() {
  let choice;
  try { choice = chooseBuild(); } catch (error) { console.error(error.message); return 1; }
  console.log(`Building the ${choice.target} target${choice.target === 'site' ? ` from ${choice.env.SITE_DIR}` : ' (no site layer here)'}.`);
  return spawnSync('node', ['scripts/build.mjs'], {stdio: 'inherit', env: choice.env}).status ?? 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) process.exitCode = cli();
