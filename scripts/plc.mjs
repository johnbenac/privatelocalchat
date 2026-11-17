// launcher-format: 2
// The launcher of an operator folder (docs/RUN-IT.md): the one file the operator runs. It hands over to the installed release's serve.mjs, so the
// release that is live decides what the options mean:   node plc.mjs [--upgrade ... | --rollback | --check | --prune | --port N ...]
// An upgrade replaces this file only when a release carries a newer launcher-format.
import {spawn} from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const fail = (message) => { console.error(message); process.exit(1); };

// The launcher cannot install anything itself when it cannot find the live release: the release's own serve.mjs does that.
const damaged = (why) => `${path.join(root, 'current.json')} ${why}. Install a release again to recover: unpack a release and run "node serve.mjs --upgrade . --root ${root}" from it (docs/RUN-IT.md). The damaged file is moved aside, not deleted.`;

let release = null;
try { release = JSON.parse(readFileSync(path.join(root, 'current.json'), 'utf8')).release; }
catch (error) {
  if (error.code !== 'ENOENT') fail(damaged(`cannot be read (${error.message})`));
}
if (release === null) {
  fail(`No release is installed in ${root}. Unpack a release zip, then from the unpacked folder run:\n  node serve.mjs --upgrade . --root ${root}`);
}
if (typeof release !== 'string' || !/^\d[0-9A-Za-z.+-]*$/.test(release)) fail(damaged('does not name a release'));
if (process.argv.slice(2).includes('--root')) fail(`plc.mjs always works on its own folder, ${root}: leave out --root.`);

const serve = path.join(root, 'releases', release, 'serve.mjs');
if (!existsSync(serve)) fail(damaged(`names ${release}, but releases/${release}/serve.mjs is not there`));
const child = spawn(process.execPath, [serve, ...process.argv.slice(2), '--root', root], {stdio: 'inherit'});
child.on('error', (error) => fail(`Could not run ${serve} (${error.message}). Check that the release ${release} is installed: node serve.mjs --check --root ${root}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => process.exit(code ?? 1));
