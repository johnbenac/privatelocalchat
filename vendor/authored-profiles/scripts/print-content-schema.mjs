/** Deterministic build input: print the runtime module, without writing shared files. */
import {readFile} from 'node:fs/promises';

const schema = JSON.parse(await readFile(new URL('../content/content.schema.json', import.meta.url), 'utf8'));
process.stdout.write(`/** Generated from content/content.schema.json by scripts/print-content-schema.mjs. */
function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
export const CONTENT_SCHEMA = freeze(${JSON.stringify(schema)});
`);
