// Every address the app can request for a model, a voice or the memory embedding set, with its size and SHA-256 pin (docs/PLAN, stage 4).
// Shared by scripts/model-urls-snapshot.mjs (records the baseline) and tests/model-urls.test.mjs (compares a build's addresses with it).
import '../helpers/install-app-config.mjs'; // the model sources the build writes into the page (docs/APP-CONFIG.md)
import {fileURLToPath} from 'node:url';
export const BASELINE=fileURLToPath(new URL('../../docs/evidence/split/model-urls-baseline.json',import.meta.url));

/**
 * { tiers: { tier: { variant|"-": [{url, bytes, sha256}] } }, voices: { id: [..] }, embedding: { modelBase, wasmBase } }, sorted so two runs compare as text.
 * `effectiveSources` is the catalog's sources as the app uses them. `fresh` is a query string that loads new copies of the modules, so a test can change window.APP_CONFIG and read the result.
 */
export async function collectModelUrls({effectiveSources,fresh=''}={}){
  const catalog=await import('../../runtime/providers/catalog.mjs'+fresh);
  const {KITTEN_NANO_MANIFEST,KITTEN_NANO_BASE_URL}=await import('../../chat/voice/voice-manifest.mjs'+fresh);
  const {KOKORO_Q8_MANIFEST,KOKORO_Q8_BASE_URL}=await import('../../chat/voice/voice-manifest-kokoro.mjs'+fresh);
  const embedding=await import('../../chat/embedding/embedding-config.mjs'+fresh);
  const sources=effectiveSources;
  const pin=f=>({url:f.url,bytes:f.bytes,sha256:f.sha256});
  const byUrl=(a,b)=>a.url<b.url?-1:a.url>b.url?1:0;
  const tiers={};
  for(const tier of catalog.TIER_ORDER){
    if(tier==='default'){tiers[tier]={};for(const v of catalog.WEBLLM_VARIANTS)tiers[tier][v]=catalog.tierFiles(tier,sources,v).map(pin).sort(byUrl);}
    else tiers[tier]={'-':catalog.tierFiles(tier,sources).map(pin).sort(byUrl)};
  }
  const voices={
    'kitten-tts-nano-0.8-int8':KITTEN_NANO_MANIFEST.files.map(f=>({url:KITTEN_NANO_BASE_URL+f.name,bytes:f.bytes,sha256:f.sha256})).sort(byUrl),
    'kokoro-82m-v1.0-q8':KOKORO_Q8_MANIFEST.files.map(f=>({url:KOKORO_Q8_BASE_URL+f.path,bytes:f.bytes,sha256:f.sha256})).sort(byUrl)
  };
  return {tiers,voices,embedding:{modelBase:embedding.EMBEDDING_MODEL_BASE,wasmBase:embedding.EMBEDDING_WASM_BASE}};
}
