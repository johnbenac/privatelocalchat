#!/usr/bin/env node
// What the release job does for a release, called by @semantic-release/exec from .releaserc.cjs (docs/RELEASING.md).
//
//   node scripts/release-hooks.mjs notes   --version X.Y.Z --commit SHA [--last-tag vA.B.C]
//       prints the "Upgrading" section of the notes (and nothing else) on standard output
//   node scripts/release-hooks.mjs prepare --version X.Y.Z --commit SHA [--out release-assets] [--neutrality-config FILE]
//       writes the release assets into --out: the two zips, compat.json and SHA256SUMS, and refuses to finish unless the zips pass the zip test and carry nothing of ours
//
// Anything it says about its work goes to standard error: the notes command's standard output is the text that becomes part of the release notes.
import {execFileSync, spawnSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {TARGETS, packageRelease, writeSums, folderName, zipName, REPOSITORY} from './package-release.mjs';
import {buildCompat, toJson} from './compat.mjs';
import {upgradingSection} from './release-notes-upgrading.mjs';
import {loadConfig, inventoryHosts, scanDirectory, evaluate} from './neutrality.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const say = (text) => process.stderr.write(text + '\n');
const REPO_SLUG = REPOSITORY.replace('https://github.com/', '');

/** The previous release's compat.json, or null (the first release with one, or a release that has none). Never throws. */
export function previousCompat(lastTag, {gh = 'gh', cwd = root} = {}) {
  if (!lastTag) return null;
  const dir = mkdtempSync(path.join(tmpdir(), 'plc-prev-'));
  try {
    const run = spawnSync(gh, ['release', 'download', lastTag, '--repo', REPO_SLUG, '--pattern', 'compat.json', '--dir', dir], {cwd, encoding: 'utf8'});
    const file = path.join(dir, 'compat.json');
    if (run.status !== 0 || !existsSync(file)) { say(`No compat.json for ${lastTag} (${(run.stderr || run.error?.message || 'not found').trim().split('\n')[0]}): the notes say this is the first.`); return null; }
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    return parsed.format === 'plc-compat/1' ? parsed : null;
  } catch (error) { say('The previous compat.json could not be read: ' + error.message); return null; }
  finally { rmSync(dir, {recursive: true, force: true}); }
}

export async function notes({version, commit, lastTag, gh}) {
  const current = await buildCompat({version, commit});
  return upgradingSection(current, previousCompat(lastTag, {gh}));
}

/** Unpacks each zip and scans it with the neutrality rules. Returns the problems, empty when the zips are clean. */
export async function checkZips({out, version, neutralityConfig}) {
  const config = await loadConfig(neutralityConfig);
  const known = await inventoryHosts(path.join(root, config.inventory));
  const holder = mkdtempSync(path.join(tmpdir(), 'plc-zipcheck-'));
  try {
    const results = [], problems = [];
    for (const target of TARGETS) {
      const zip = path.join(out, zipName(version, target));
      const test = spawnSync('unzip', ['-tq', zip], {encoding: 'utf8'});
      if (test.status !== 0) problems.push(`${path.basename(zip)} does not pass unzip -t: ${(test.stdout + test.stderr).trim()}`);
      const dir = path.join(holder, target);
      mkdirSync(dir);
      execFileSync('unzip', ['-q', zip, '-d', dir]);
      const folder = path.join(dir, folderName(version, target));
      results.push(await scanDirectory(path.join(folder, 'app'), config, known));
      results.push(await scanDirectory(folder, {...config, skipPaths: [...(config.skipPaths || []), 'app/**']}, known));
    }
    // an allow entry that only a neighbouring file uses is a problem of the config, not of the zips; only what was found in the zips counts here
    problems.push(...evaluate(results, config).filter((line) => !/is not used by anything scanned/.test(line)));
    return problems;
  } finally { rmSync(holder, {recursive: true, force: true}); }
}

export async function prepare({version, commit, out, neutralityConfig}) {
  rmSync(out, {recursive: true, force: true});
  for (const target of TARGETS) say('Packed ' + (await packageRelease({target, version, commit, outDir: out})));
  writeFileSync(path.join(out, 'compat.json'), toJson(await buildCompat({version, commit})));
  const problems = await checkZips({out, version, neutralityConfig});
  if (problems.length) throw new Error('The release zips are not fit to publish:\n' + problems.join('\n'));
  for (const line of await writeSums(out)) say(line);
  say(`Release assets for v${version} are in ${out}: ${readdirSync(out).sort().join(', ')}`);
}

async function cli(args) {
  const [command, ...rest] = args;
  const opt = (name) => { const i = rest.indexOf('--' + name); return i >= 0 ? rest[i + 1] : undefined; };
  const version = opt('version'), commit = opt('commit');
  if (!['notes', 'prepare'].includes(command) || !version || !commit) { console.error('Usage: release-hooks.mjs notes|prepare --version X.Y.Z --commit SHA [...]'); return 2; }
  if (command === 'notes') { process.stdout.write(await notes({version, commit, lastTag: opt('last-tag'), gh: process.env.RELEASE_GH || 'gh'})); return 0; }
  await prepare({version, commit, out: path.resolve(opt('out') || 'release-assets'), neutralityConfig: path.resolve(opt('neutrality-config') || path.join(root, 'tests/neutrality.config.json'))});
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  cli(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (error) => { console.error(error.message); process.exitCode = 1; });
}
