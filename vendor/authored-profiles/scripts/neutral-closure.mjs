/** Prints, one per line and sorted, the files of the neutral entry's import closure (relative to the package
 * root): neutral/index.mjs and every file it imports, transitively, through relative specifiers.
 *   node scripts/neutral-closure.mjs [entry]      (entry defaults to neutral/index.mjs)
 * The closure is the set of files to vendor for a consumer that must carry nothing of other projects.
 * Files other than .mjs modules named by a specifier (JSON) are listed too. */
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SPECIFIER = /(?:^\s*(?:import|export)\b[^;'"]*?\bfrom\s*|^\s*import\s*|\bimport\(\s*)(['"])([^'"]+)\1/gm;

/** The closure of `entry` (a path relative to `base`) as sorted relative paths. */
export async function neutralClosure(entry = 'neutral/index.mjs', base = root) {
  const seen = new Set(), pending = [path.normalize(entry)];
  while (pending.length) {
    const file = pending.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    if (!file.endsWith('.mjs')) continue;
    const text = await readFile(path.join(base, file), 'utf8');
    for (const [, , spec] of text.matchAll(SPECIFIER)) {
      if (spec.startsWith('node:')) continue;
      if (!spec.startsWith('./') && !spec.startsWith('../')) throw new Error(`${file}: non-relative import ${spec}`);
      pending.push(path.normalize(path.join(path.dirname(file), spec)));
    }
  }
  return [...seen].sort();
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  console.log((await neutralClosure(process.argv[2])).join('\n'));
