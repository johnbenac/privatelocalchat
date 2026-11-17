#!/usr/bin/env node
// The "Upgrading" section of a release's notes (docs/RELEASING.md), written from compat.json.
//
//   node scripts/release-notes-upgrading.mjs --compat compat.json [--previous previous-compat.json] [--out FILE]
//
// It says which formats this release reads and writes, what changed since the previous release (a comparison of the two compat.json files, or that this is the first release
// with one), the oldest release it upgrades directly from, what stepping back does, and how to check a download.
import {readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const REPOSITORY = 'johnbenac/privatelocalchat';
const list = (xs) => xs.map((x) => '`' + x + '`').join(', ');

/** What differs between two compat records, as lines of text. */
export function changesBetween(previous, current) {
  const lines = [];
  const compareMaps = (label, before = {}, after = {}, show = (v) => String(v)) => {
    for (const key of Object.keys(after)) {
      if (!(key in before)) lines.push(`${label} \`${key}\` is new (${show(after[key])}).`);
      else if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) lines.push(`${label} \`${key}\` went from ${show(before[key])} to ${show(after[key])}.`);
    }
    for (const key of Object.keys(before)) if (!(key in after)) lines.push(`${label} \`${key}\` is no longer used.`);
  };
  compareMaps('Stored format', previous.storedFormats, current.storedFormats, (n) => 'format ' + n);
  compareMaps('Database', previous.databases, current.databases, (n) => 'version ' + n);
  compareMaps('File format', previous.fileFormats, current.fileFormats, (f) => `writes ${f.writes}, reads ${f.reads.join(' and ')}`);
  const added = current.snapshots.filter((s) => !previous.snapshots.includes(s)), dropped = previous.snapshots.filter((s) => !current.snapshots.includes(s));
  if (added.length) lines.push(`Tested to open saved data from ${list(added)} as well.`);
  if (dropped.length) lines.push(`No longer tested against saved data from ${list(dropped)}.`);
  if (previous.upgradesFrom?.oldest !== current.upgradesFrom.oldest) lines.push(`The oldest release it upgrades directly from went from ${previous.upgradesFrom?.oldest ?? 'none stated'} to ${current.upgradesFrom.oldest}.`);
  return lines;
}

/** The markdown section. `previous` is the previous release's compat record, or null. */
export function upgradingSection(current, previous = null) {
  const out = ['## Upgrading', ''];
  out.push('**Formats this release reads and writes**', '');
  for (const [name, f] of Object.entries(current.fileFormats)) out.push(`- Saved file \`${name}\`: writes format ${f.writes}, reads ${f.reads.map((n) => '`' + n + '`').join(' and ')}.`);
  out.push(`- Databases: ${Object.entries(current.databases).map(([name, n]) => `\`${name}\` version ${n}`).join(', ')}.`);
  out.push(`- Stored data: ${Object.keys(current.storedFormats).length} keys, listed with their formats in \`compat.json\`.`, '');
  out.push(`**What changed since ${previous ? 'v' + previous.version : 'the previous release'}**`, '');
  if (!previous) out.push('This is the first release with a `compat.json`, so there is nothing to compare it with.');
  else {
    const changes = changesBetween(previous, current);
    if (!changes.length) out.push('No stored or saved format changed.');
    else out.push(...changes.map((c) => '- ' + c));
  }
  out.push('', `**Upgrading from an older release.** Saved data from releases ${list(current.snapshots)} is tested to open in this one. The oldest release it upgrades directly from is ${current.upgradesFrom.oldest}; ${current.upgradesFrom.note}.`);
  out.push('', `**Stepping back.** Going ${current.stepBack}.`);
  out.push('', '**Checking a download.** Put the zip and `SHA256SUMS` in one folder and run `sha256sum -c SHA256SUMS`.',
    `To check that GitHub built the zip from this repository, run \`gh attestation verify <zip> --repo ${REPOSITORY}\`.`,
    'How to run the unpacked folder is in its `README.md` and in `docs/RUN-IT.md`.', '');
  return out.join('\n');
}

async function cli(args) {
  const opt = (name) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : undefined; };
  if (!opt('compat')) { console.error('Usage: release-notes-upgrading.mjs --compat FILE [--previous FILE] [--out FILE]'); return 2; }
  const read = (file) => JSON.parse(readFileSync(file, 'utf8'));
  const current = read(opt('compat'));
  const previous = opt('previous') ? read(opt('previous')) : null;
  for (const [what, value] of [['--compat', current], ['--previous', previous]]) if (value && value.format !== 'plc-compat/1') throw new Error(`${what} is not a plc-compat/1 file`);
  const text = upgradingSection(current, previous);
  if (opt('out')) writeFileSync(path.resolve(opt('out')), text); else process.stdout.write(text);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  cli(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (error) => { console.error(error.message); process.exitCode = 1; });
}
