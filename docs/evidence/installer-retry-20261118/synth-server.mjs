// A tiny file server for the installer stress test: 131 deterministic files (130 "model" files of 0.2 to 8 MB and one 2,361-byte "config"),
// with a manifest of the same shape as the catalogue's file list (path, bytes, sha256, url, scope). CORS and CORP open, Range not needed.
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
const PORT=Number(process.argv[2]||18591);
const N=131;
const files=[];
for(let i=0;i<N;i++){
  const config=i===0;
  const size=config?2361:200000+((i*37)%40)*200000;
  const buf=Buffer.allocUnsafe(size);
  for(let j=0;j<size;j++)buf[j]=(i*131+j*7+(j>>10))&255;
  files.push({path:config?'mlc-chat-config.json':`params_shard_${i}.bin`,bytes:size,sha256:createHash('sha256').update(buf).digest('hex'),scope:config?'webllm/config':'webllm/model',buf});
}
const total=files.reduce((n,f)=>n+f.bytes,0);
console.log('ready',PORT,N,'files',total,'bytes');
const H={'Access-Control-Allow-Origin':'*','Cross-Origin-Resource-Policy':'cross-origin','Cache-Control':'no-store'};
createServer((req,res)=>{
  const u=new URL(req.url,'http://x');
  if(u.pathname==='/synth/manifest.json'){
    const origin=req.headers['x-forwarded-origin']||('http://127.0.0.1:'+PORT);
    const list=files.map(f=>({path:f.path,bytes:f.bytes,sha256:f.sha256,scope:f.scope,url:origin+'/synth/'+f.path}));
    res.writeHead(200,{...H,'Content-Type':'application/json'});return res.end(JSON.stringify(list));
  }
  const m=/^\/synth\/(.+)$/.exec(u.pathname);
  const f=m&&files.find(x=>x.path===decodeURIComponent(m[1]));
  if(!f){res.writeHead(404,H);return res.end();}
  res.writeHead(200,{...H,'Content-Type':'application/octet-stream','Content-Length':f.bytes});
  res.end(f.buf);
}).listen(PORT,'127.0.0.1');
