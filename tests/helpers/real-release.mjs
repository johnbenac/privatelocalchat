// Real releases for the browser proof of the operator tools (tests/e2e/operator.e2e.mjs): the runkit target built from this tree as a chosen version and commit, laid out as the release
// zip is, packed with the project's own zip writer. scripts/package-release.mjs insists that the commit is the checked-out one, which would make two releases the same build; here the
// commit is only the name the build is given, and its folder app/releases/<commit>/ is what differs.
import {mkdirSync, writeFileSync, rmSync, chmodSync} from 'node:fs';
import path from 'node:path';
import {releaseEntries, makeZip, writeSums, folderName, zipName} from '../../scripts/package-release.mjs';

export const FIXED_EPOCH = 1762927272;

/**
 * Builds `version` of `commit` and writes, under `dir`, the folder private-local-chat-<version>-runkit/, its zip and the SHA256SUMS of the zip.
 * `workDir` is where the build runs; it must be inside the repository (the build refuses to write elsewhere), and the default is the current folder.
 * Returns { folder, zip, sums, version, commit, name }.
 */
export async function buildRealRelease({version, commit, dir, workDir = process.cwd(), oldest = '0.0.1'}) {
  if (!/^[0-9a-f]{40}$/.test(commit || '')) throw new Error('buildRealRelease needs a full commit hash of 40 hex digits');
  const target = 'runkit';
  // releaseEntries builds with TARGET=runkit DEPLOY_BRANCH=main GITHUB_SHA=<commit> RELEASE_VERSION=<version> SOURCE_DATE_EPOCH=<epoch> and no SITE_DIR, in a .tmp-release-* folder it removes,
  // then adds RELEASE_TOOLS, models.json, compat.json, README.md, LICENSE, THIRD-PARTY-NOTICES.md and SOURCE.txt: the same list package-release writes.
  const entries = await releaseEntries({target, version, commit, epoch: FIXED_EPOCH, workDir});
  // The real compat.json says the oldest release this one installs over is the oldest data snapshot's (0.56.1), so a 0.0.1 -> 0.0.2 upgrade is rightly refused as a step that is too far.
  // The test's versions are made up, so the line is set to the first of them, as tests/helpers/operator-fixtures.mjs does; nothing else of the file is changed.
  const compat = entries.find((e) => e.name.endsWith('/compat.json'));
  const parsed = JSON.parse(compat.data.toString('utf8'));
  parsed.upgradesFrom.oldest = oldest;
  compat.data = Buffer.from(JSON.stringify(parsed, null, 2) + '\n');
  mkdirSync(dir, {recursive: true});
  for (const entry of entries) {
    const file = path.join(dir, entry.name);
    mkdirSync(path.dirname(file), {recursive: true});
    writeFileSync(file, entry.data);
    chmodSync(file, entry.mode);
  }
  const zip = path.join(dir, zipName(version, target));
  writeFileSync(zip, makeZip(entries, FIXED_EPOCH));
  await writeSums(dir, [zipName(version, target)]);
  return {folder: path.join(dir, folderName(version, target)), zip, sums: path.join(dir, 'SHA256SUMS'), version, commit, name: `${version}-${target}`};
}

export const removeRelease = (dir) => rmSync(dir, {recursive: true, force: true});
