import {Worker} from 'node:worker_threads';

// Exercise browser worker modules in Node without replacing the checksum implementation.
export class BrowserWorker {
 constructor(url){
  this.native=new Worker(`const {parentPort}=require('node:worker_threads');
   globalThis.self={postMessage:data=>parentPort.postMessage(data)};
   import(${JSON.stringify(url.href)}).then(()=>parentPort.on('message',data=>self.onmessage({data})));`,{eval:true});
  this.native.on('message',data=>this.onmessage?.({data}));
  this.native.on('error',error=>this.onerror?.({message:error.message}));
 }
 postMessage(data){this.native.postMessage(data);}
 terminate(){return this.native.terminate();}
}
