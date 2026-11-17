// This bootstrap is emitted only for dev builds; other hosts never load the journal module.
if(location.hostname==='dev.privatelocal.chat'){
 const {startDiagnostics}=await import('./ui.mjs');
 await startDiagnostics();
}
