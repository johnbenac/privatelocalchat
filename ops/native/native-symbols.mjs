// Replace the SDK's compatibility map with symbols from the exact native link.
import {gzipSync} from 'node:zlib';
export function refreshCompatSymbols(wrapper,symbolText){
 const rows=new Map();
 for(const line of symbolText.trim().split('\n')){const match=/^(\d+):(.*)$/.exec(line);if(!match)throw Error('Invalid native symbol record');const id=Number(match[1]);if(rows.has(id))throw Error('Duplicate native symbol index');let name=match[2];while(Buffer.byteLength(name)>255)name=name.slice(0,-1);rows.set(id,name);}
 const first=Math.min(...rows.keys()),last=Math.max(...rows.keys());if(!rows.size||last-first>100000)throw Error('Invalid native symbol range');
 const names=[],indices=new Map(),table=Buffer.alloc((last-first+1)*2,255);
 for(const[id,name]of rows){if(!indices.has(name)){if(names.length>=65535)throw Error('Too many native symbol names');indices.set(name,names.length);names.push(Buffer.from(name));}table.writeUInt16LE(indices.get(name),(id-first)*2);}
 const header=Buffer.alloc(12);header.writeUInt32LE(first,0);header.writeUInt32LE(last-first+1,4);header.writeUInt32LE(names.length,8);
 const encoded=gzipSync(Buffer.concat([header,...names.flatMap(n=>[Buffer.from([n.length]),n]),table])).toString('base64');
 const pattern=/var WASM_SOURCE_MAP = (\{[\s\S]*?\n\});/;const match=wrapper.match(pattern);if(!match)throw Error('Native symbol-map anchor changed');const maps=JSON.parse(match[1]);if(typeof maps.compat!=='string')throw Error('Missing compatibility map');maps.compat=encoded;
 return wrapper.replace(match[0],'var WASM_SOURCE_MAP = '+JSON.stringify(maps,null,2)+';');
}
