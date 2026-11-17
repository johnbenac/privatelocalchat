// Decode private operator-session exports. Keep output under ignored work/.
import {readFile,writeFile} from 'node:fs/promises';
import {decodeObjects} from './conversation-capture.mjs';
const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('Usage: node dev-tools/decode-conversations.mjs input.json output.json');
const data=JSON.parse(await readFile(input,'utf8')),objects=await decodeObjects(data.events||[]);
await writeFile(output,JSON.stringify({objects},null,2)+'\n');
console.log(JSON.stringify({objects:objects.length,complete:objects.filter(o=>o.object!==undefined).length,incomplete:objects.filter(o=>o.missingParts.length).length,kinds:[...new Set(objects.map(o=>o.kind))]}));
