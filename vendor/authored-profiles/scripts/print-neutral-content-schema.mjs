/** Deterministic build input for the neutral entry: print the runtime schema module without the `$schema`
 * annotation, which carries a web address. Everything else is exactly content/content.schema.json (its `$id` is
 * a urn). Without writing shared files:
 *   node scripts/print-neutral-content-schema.mjs > src/core/content-schema.neutral.mjs
 * Nothing reads `$schema`: validateSchema lists it as a known annotation and never dereferences it. */
import {readFile} from 'node:fs/promises';

const {$schema, ...schema} = JSON.parse(await readFile(new URL('../content/content.schema.json', import.meta.url), 'utf8'));
process.stdout.write(`/** Generated from content/content.schema.json by scripts/print-neutral-content-schema.mjs. */
function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
export const CONTENT_SCHEMA = freeze(${JSON.stringify(schema)});
`);
