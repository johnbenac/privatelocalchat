import {sha256} from './vendor/noble-hashes/2.4.0/sha2.js';

// A checksum must not materialize an entire model shard beside the loaded runtime.
export const HASH_CHUNK_BYTES=1024*1024;
export async function hashBlobChunks(blob,{signal,onProgress}={}){
 const hash=sha256.create();
 try{
  for(let offset=0;offset<blob.size;offset+=HASH_CHUNK_BYTES){
   signal?.throwIfAborted();
   const chunk=await blob.slice(offset,Math.min(blob.size,offset+HASH_CHUNK_BYTES)).arrayBuffer();
   signal?.throwIfAborted();
   hash.update(new Uint8Array(chunk));
   onProgress?.(Math.min(blob.size,offset+chunk.byteLength));
  }
  signal?.throwIfAborted();
  return Array.from(hash.digest(),b=>b.toString(16).padStart(2,'0')).join('');
 }finally{hash.destroy();}
}
