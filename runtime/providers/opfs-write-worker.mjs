// One file and one outstanding operation per worker. The caller always terminates it.
let handle;
self.onmessage=async({data})=>{
 const {id,operation}=data;
 try{
  if(operation==='open'){
   const root=await navigator.storage.getDirectory();
   const cache=await root.getDirectoryHandle(data.directory||'cache',{create:true});
   const file=await cache.getFileHandle(data.key,{create:true});
   handle=await file.createSyncAccessHandle();handle.truncate(0);
  }else if(operation==='write'){
   const chunk=data.chunk;let offset=0;
   while(offset<chunk.byteLength){const written=handle.write(chunk.subarray(offset));if(!written)throw Error('OPFS write made no progress');offset+=written;}
  }else if(operation==='close'){handle.flush();handle.close();handle=null;}
  else throw Error('Unknown OPFS write operation');
  self.postMessage({id,ok:true});
 }catch(error){
  try{handle?.close();}catch{}handle=null;
  self.postMessage({id,error:{name:error.name,message:error.message,operation}});
 }
};
