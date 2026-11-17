// Numeric construction checkpoints from the retained runtime's optional 1 MiB ring.
// Never contains conversation text. Invalid or partially written records are ignored.
const RECORD=256,MAGIC=0x53504652;
const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xEDB88320^(n>>>1):n>>>1;return n>>>0;});
export function crc32(bytes){let c=0xFFFFFFFF;for(const byte of bytes)c=crcTable[(c^byte)&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0;}
export function parseCheckpoints(buffer){
 const bytes=new Uint8Array(buffer),records=[];
 for(let offset=0;offset+RECORD<=bytes.length;offset+=RECORD){
  const v=new DataView(buffer,offset,RECORD);
  if(v.getUint32(0,true)!==MAGIC||v.getUint16(4,true)!==1||v.getUint16(6,true)!==RECORD||v.getUint32(252,true)!==crc32(bytes.subarray(offset,offset+252)))continue;
  const u64=at=>v.getUint32(at,true)+v.getUint32(at+4,true)*4294967296;
  records.push({sequence:u64(8),runIdWords:[16,20,24,28].map(at=>v.getUint32(at,true)),wallClockMs:u64(40),phase:v.getUint16(48,true),operation:v.getUint16(50,true),edge:v.getUint8(52),operationSerial:v.getUint32(56,true),readOrdinal:v.getUint32(60,true),fileOrdinal:v.getUint32(64,true),tensorId:v.getUint32(68,true),wasmCapacityBytes:u64(72),sbrkBytes:u64(80),mallocLiveBytes:u64(88),mallocFreeBytes:u64(96),sourceLogicalBytes:u64(104),sourceTouchedUpperBytes:u64(112),sourceReadInFlightBytes:u64(120),gpuWeightsBytes:u64(136),gpuContextBytes:u64(144),gpuComputeBytes:u64(152),uploadedBytes:u64(160),uploadPendingBytes:u64(168),slot176:u64(176),slot184:u64(184),slot192:u64(192),slot200:u64(200),queueEpoch:v.getUint32(208,true),completedEpoch:v.getUint32(212,true),flushUs:v.getUint32(216,true),error:v.getUint32(220,true)});
 }
 return records.sort((a,b)=>a.sequence-b.sequence);
}
export async function readCheckpoints({storage=globalThis.navigator?.storage,pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),attempts=5}={}){
 for(let attempt=0;attempt<attempts;attempt++){
  try{
   const root=await storage.getDirectory();
   const dir=await root.getDirectoryHandle('speechtest-flight');
   const handle=await dir.getFileHandle('construction-flight-v1.bin');
   const file=await handle.getFile();
   if(file.size>RECORD*4096)throw new Error('Native journal exceeds its fixed bound');
   return parseCheckpoints(await file.arrayBuffer());
  }catch(error){
   if(error.name==='NotFoundError')return [];
   if(!['NoModificationAllowedError','InvalidStateError'].includes(error.name)||attempt+1===attempts)throw error;
   await pause(100*2**attempt);
  }
 }
 return [];
}
