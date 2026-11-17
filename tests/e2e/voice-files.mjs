// Finds (or fetches) the real voice model files for the voice e2e tests, so they run anywhere with network access.
//
//   const dir = await voiceFilesDir('kitten');   // flat: kitten_tts_nano_v0_8.onnx, voices.npz, config.json
//   const dir = await voiceFilesDir('kokoro');   // the layout of the hosted set: onnx/model_quantized.onnx, voices/af_heart.bin, ...
//
// Order: the directory named by VOICE_FILES_DIR (Kitten) or VOICE_KOKORO_DIR (Kokoro) when every pinned file is in it with the pinned size and
// SHA-256; otherwise the files are downloaded from the hosted CDN (the base URLs in the manifests) into a temp directory
// ($TMPDIR/plc-voice-e2e/<engine>), re-using files already there that still match. Every file is verified against the manifest; a mismatch is an
// error, never a silent skip. If the download is impossible (no network), this throws, unless VOICE_E2E_ALLOW_SKIP=1, in which case it returns null
// and the caller skips visibly.
import '../helpers/install-app-config.mjs'; // the model sources the build writes into the page (docs/APP-CONFIG.md)
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync,renameSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {KITTEN_NANO_MANIFEST,KITTEN_NANO_BASE_URL} from '../../chat/voice/voice-manifest.mjs';
import {KOKORO_Q8_MANIFEST,KOKORO_Q8_BASE_URL} from '../../chat/voice/voice-manifest-kokoro.mjs';

const KINDS={
 kitten:{manifest:KITTEN_NANO_MANIFEST,base:KITTEN_NANO_BASE_URL,env:'VOICE_FILES_DIR'},
 kokoro:{manifest:KOKORO_Q8_MANIFEST,base:KOKORO_Q8_BASE_URL,env:'VOICE_KOKORO_DIR'},
};
const rel=f=>f.path||f.name;
const matches=(file,f)=>{
 if(!existsSync(file))return false;
 const data=readFileSync(file);
 return data.length===f.bytes&&createHash('sha256').update(data).digest('hex')===f.sha256;
};
const complete=(dir,manifest)=>manifest.files.every(f=>matches(path.join(dir,rel(f)),f));

export async function voiceFilesDir(kind){
 const k=KINDS[kind];
 if(!k)throw new Error('unknown voice kind '+kind);
 const given=process.env[k.env];
 if(given&&complete(given,k.manifest))return given;
 if(given)console.log(`${k.env}=${given} does not hold the complete pinned file set; fetching it from the CDN instead`);
 const dir=path.join(os.tmpdir(),'plc-voice-e2e',kind);
 for(const f of k.manifest.files){
  const target=path.join(dir,rel(f));
  if(matches(target,f))continue;
  mkdirSync(path.dirname(target),{recursive:true});
  let response;
  try{response=await fetch(k.base+rel(f));}catch(e){
   if(process.env.VOICE_E2E_ALLOW_SKIP==='1')return null;
   throw new Error(`cannot fetch ${rel(f)} from the CDN (${e.message}); set ${k.env} to a directory that holds the files, or VOICE_E2E_ALLOW_SKIP=1 to skip`);
  }
  if(!response.ok)throw new Error(`CDN answered ${response.status} for ${rel(f)}`);
  const data=Buffer.from(await response.arrayBuffer());
  const digest=createHash('sha256').update(data).digest('hex');
  if(data.length!==f.bytes||digest!==f.sha256)throw new Error(`${rel(f)} from the CDN does not match the pinned manifest (got ${data.length} bytes, SHA-256 ${digest.slice(0,12)})`);
  writeFileSync(target+'.part',data);
  renameSync(target+'.part',target);
 }
 return dir;
}
