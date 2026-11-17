// The saved-file fixtures in tests/fixtures/files: files a release wrote outside the browser (docs/FILE-COMPATIBILITY.md). Shared by scripts/file-snapshot.mjs and the tests.
import {readdirSync,readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

export const FILE_FIXTURES=fileURLToPath(new URL('../fixtures/files/',import.meta.url));

/** The fixture folders, oldest first (their names start with a sequence number). */
export const listFileFixtures=(dir=FILE_FIXTURES)=>existsSync(dir)?readdirSync(dir,{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>e.name).sort():[];
export const readFileFixture=(name,dir=FILE_FIXTURES)=>({
  name,dir:path.join(dir,name),
  meta:JSON.parse(readFileSync(path.join(dir,name,'meta.json'),'utf8')),
  text:file=>readFileSync(path.join(dir,name,file),'utf8')
});
