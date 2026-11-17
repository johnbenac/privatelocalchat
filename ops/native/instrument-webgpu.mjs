// Connect the existing content-free worker counters to Emdawn's actual creation sites.
// Keep this transformation exclusive to the development runtime.
export function instrumentWebGpu(source) {
  const replacements = [
    ['buffer=device.createBuffer(desc)', 'buffer=device.createBuffer(desc);globalThis.__flightGpuBufferCreated?.(desc.size)'],
    ['device.createComputePipeline(desc)', '((pipeline)=>{globalThis.__flightGpuPipelineCreated?.();return pipeline;})(device.createComputePipeline(desc))']
  ];
  for (const [before, after] of replacements) {
    if (source.split(before).length !== 2) throw new Error('WebGPU instrumentation site changed: '+before);
    source = source.replace(before, after);
  }
  return instrumentWebGpuErrors(source);
}

export function instrumentWebGpuErrors(source){
 const before='device.onuncapturederror=ev=>{var type=5;';
 if(source.split(before).length!==2)throw Error('WebGPU error instrumentation site changed');
 const after=`device.onuncapturederror=ev=>{try{if((globalThis.__plcGpuErrorCount||0)<8){globalThis.__plcGpuErrorCount=(globalThis.__plcGpuErrorCount||0)+1;globalThis.postMessage({verb:'console.error',args:[{plcDeviceError:{name:String(ev.error?.name||ev.error?.constructor?.name||'GPUError').slice(0,80),message:String(ev.error?.message||'Unknown GPU error').slice(0,8192)}}]});}}catch{}var type=5;`;
 return source.replace(before,after);
}
