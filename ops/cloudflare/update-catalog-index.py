#!/usr/bin/env python3
"""Add the GGUF models in gguf-models.json to the public discovery index (models/catalog.json) and to model-cdn-manifest.json.

    python3 ops/cloudflare/update-catalog-index.py            # merge, write model-cdn-manifest.json, upload catalog.json
    python3 ops/cloudflare/update-catalog-index.py --dry-run  # merge and show the result only

catalog.json is a discovery index with a one-hour cache time, not an immutable object, so it is replaced in place. The model files it points to are
published first with publish-gguf.py; run this only after that succeeded.
"""
import argparse, hashlib, json, os, sys, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
STATE = json.loads((ROOT / 'cdn-state.json').read_text())
GGUF = json.loads((ROOT / 'gguf-models.json').read_text())
MANIFEST = ROOT / 'model-cdn-manifest.json'
HOST = 'https://' + STATE['domain'] + '/'
IDS = {'lfm25_2_6b_q3': ('LFM2.5-2.6B-Q3_K_M', 'LFM Open License v1.0'), 'granite40_h_1b_q4km': ('Granite-4.0-H-1B-Q4_K_M', 'Apache-2.0'),
       'smollm2_135m_q4km': ('SmolLM2-135M-Instruct-Q4_K_M', 'Apache-2.0'), 'granite40_h_350m_q4km': ('Granite-4.0-H-350M-Q4_K_M', 'Apache-2.0')}

parser = argparse.ArgumentParser()
parser.add_argument('--dry-run', action='store_true')
parser.add_argument('--token-file', default='/root/.config/privatelocalchat/cloudflare-api-token')
args = parser.parse_args()
manifest = json.loads(MANIFEST.read_text())
for key, (model_id, licence) in IDS.items():
    m = GGUF[key]
    manifest['models'] = [x for x in manifest['models'] if x['modelId'] != model_id]
    manifest['files'] = [f for f in manifest['files'] if not f['key'].startswith(m['prefix'])]
    first = m['files'][0]['path']
    manifest['models'].append({'modelId': model_id, 'runtime': 'wllama retained-v1q-chat-stable-slim-20260901', 'revision': m['languageModel']['sourceRevision'],
                               'baseUrl': HOST + m['prefix'], 'firstShardUrl': HOST + m['prefix'] + first, 'bytes': m['totalBytes'], 'license': licence})
    for f in m['files']:
        manifest['files'].append({'path': f['path'], 'bytes': f['bytes'], 'sha256': f['sha256'], 'key': m['prefix'] + f['path'], 'url': HOST + m['prefix'] + f['path']})
VOICE_FILE = ROOT / 'voice-models.json'
VOICE = json.loads(VOICE_FILE.read_text()) if VOICE_FILE.exists() else {}
VOICE_IDS = {'kitten_nano_int8': 'Kitten-TTS-Nano-0.8-int8', 'kokoro_q8': 'Kokoro-82M-v1.0-ONNX-q8'}
for key, model_id in VOICE_IDS.items():
    m = VOICE[key]
    manifest['models'] = [x for x in manifest['models'] if x['modelId'] != model_id]
    manifest['files'] = [f for f in manifest['files'] if not f['key'].startswith(m['prefix'])]
    manifest['models'].append({'modelId': model_id, 'runtime': 'onnxruntime-web', 'revision': m['model']['sourceRevision'], 'baseUrl': HOST + m['prefix'],
                               'bytes': m['model']['totalBytes'], 'license': m['licenseName']})
    for f in m['files']:
        manifest['files'].append({'path': f['path'], 'bytes': f['bytes'], 'sha256': f['sha256'], 'key': m['prefix'] + f['path'], 'url': HOST + m['prefix'] + f['path']})
text = json.dumps(manifest, indent=2) + '\n'
print(len(manifest['models']), 'models,', len(manifest['files']), 'files')
if args.dry_run:
    sys.exit(0)
MANIFEST.write_text(text)
import boto3
from botocore.config import Config
token = os.environ.get('CLOUDFLARE_API_TOKEN', '').strip() or Path(args.token_file).read_text().strip()
key_id = None
for endpoint in ('user/tokens/verify', 'accounts/' + STATE['account'] + '/tokens/verify'):
    try:
        with urllib.request.urlopen(urllib.request.Request('https://api.cloudflare.com/client/v4/' + endpoint, headers={'Authorization': 'Bearer ' + token}), timeout=45) as r:
            key_id = json.load(r)['result']['id']
        break
    except Exception as error:
        print('token check failed at', endpoint, type(error).__name__)
if not key_id:
    sys.exit('Could not verify the Cloudflare token')
client = boto3.client('s3', endpoint_url='https://' + STATE['account'] + '.r2.cloudflarestorage.com', region_name='auto', aws_access_key_id=key_id,
                      aws_secret_access_key=hashlib.sha256(token.encode()).hexdigest(), config=Config(max_pool_connections=4))
client.put_object(Bucket=STATE['bucket'], Key='models/catalog.json', Body=text.encode(), ContentType='application/json', CacheControl='public, max-age=3600')
print('uploaded models/catalog.json', len(text), 'bytes')
