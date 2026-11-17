import {hashBlobChunks} from './hash-blob-chunks.mjs';
self.onmessage=async({data})=>{
 try{
  const digest=await hashBlobChunks(data.blob,{onProgress:bytes=>self.postMessage({bytes})});
  self.postMessage({digest});
 }catch(error){self.postMessage({error:{name:error.name,message:error.message}});}
};
