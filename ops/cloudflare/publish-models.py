#!/usr/bin/env python3
"""Server-side R2 copy, with full destination verification on the Europe host."""
import hashlib
import json
from pathlib import Path
import subprocess
import urllib.request

from importlib.util import spec_from_file_location, module_from_spec

ROOT = Path(__file__).resolve().parent
spec = spec_from_file_location('cdn_provision', ROOT / 'provision-cdn.py')
provision = module_from_spec(spec)
spec.loader.exec_module(provision)

state = json.loads((ROOT / 'cdn-state.json').read_text())
catalog = json.loads((ROOT / 'pinned-model-catalog.json').read_text())
files = []
models = []
extras = {}
for variant in ['q4f16_1', 'q4f32_1']:
    model = catalog['webllmQwen35_9b'][variant]
    prefix = 'models/Qwen3.5-9B-' + variant + '-MLC/resolve/' + model['commit'] + '/'
    for entry in model['files'] + [model['lib']]:
        files.append({**entry, 'key': prefix + entry['path'], 'url': 'https://' + state['domain'] + '/' + prefix + entry['path']})
    models.append({'modelId': 'Qwen3.5-9B-' + variant + '-MLC', 'runtime': 'web-llm/0.2.86',
                   'revision': model['commit'], 'baseUrl': 'https://' + state['domain'] + '/' + prefix,
                   'modelLibUrl': 'https://' + state['domain'] + '/' + prefix + model['lib']['path'],
                   'bytes': sum(entry['bytes'] for entry in model['files'] + [model['lib']]), 'license': 'Apache-2.0'})
    license_url = 'https://huggingface.co/Qwen/Qwen3.5-9B/resolve/main/LICENSE'
    with urllib.request.urlopen(urllib.request.Request(license_url, headers={'User-Agent': 'Private Local Chat publisher'}), timeout=30) as response:
        extras[prefix + 'LICENSE'] = response.read().decode()
model = catalog['wllamaQwen35_2b']
prefix = 'models/Qwen3.5-2B/' + model['sourceRevision'] + '/'
for entry in model['files']:
    files.append({**entry, 'key': prefix + entry['path'], 'url': 'https://' + state['domain'] + '/' + prefix + entry['path']})
models.append({'modelId': 'Qwen3.5-2B-Q4_0', 'runtime': 'wllama retained-v1q-chat-stable-slim-20260901',
               'revision': model['sourceRevision'], 'baseUrl': 'https://' + state['domain'] + '/' + prefix,
               'firstShardUrl': 'https://' + state['domain'] + '/' + prefix + model['files'][0]['path'],
               'bytes': sum(entry['bytes'] for entry in model['files']), 'license': 'Apache-2.0'})
with urllib.request.urlopen(urllib.request.Request('https://huggingface.co/Qwen/Qwen3.5-2B/resolve/main/LICENSE', headers={'User-Agent': 'Private Local Chat publisher'}), timeout=30) as response:
    extras[prefix + 'LICENSE'] = response.read().decode()
manifest = {'schemaVersion': 1, 'project': 'Private Local Chat', 'cdnOrigin': 'https://' + state['domain'],
            'provenance': 'Pinned upstream Qwen model revisions and SHA-256 values; unchanged quantized artifacts, including matching model libraries.',
            'models': models, 'files': files}
(ROOT / 'model-cdn-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
extras['models/catalog.json'] = json.dumps(manifest, indent=2) + '\n'
extras['models/README.txt'] = 'Private Local Chat model CDN. Base models Qwen/Qwen3.5-9B and Qwen/Qwen3.5-2B, Apache-2.0. Pinned artifacts, including both WebLLM quantizations and the custom text-only GGUF shards. MLC WebLLM model libraries from mlc-ai/binary-mlc-llm-libs (Apache-2.0). Model revisions, bytes and SHA-256 values are recorded in models/catalog.json. Versioned objects are immutable.\n'
verified = provision.api('user/tokens/verify')
source = json.loads(Path('/root/.config/privatelocalchat/cdn-source.json').read_text())
checkpoint = ROOT / 'model-verification-checkpoint.json'
verified_keys = json.loads(checkpoint.read_text())['verifiedKeys'] if checkpoint.is_file() else []
payload = {'state': state, 'manifest': manifest, 'extras': extras, 'sourceBucket': source['bucket'],
           'verifiedKeys': verified_keys,
           'accessKeyId': verified['id'],
           'secretAccessKey': hashlib.sha256(provision.TOKEN_FILE.read_text().strip().encode()).hexdigest()}
helper = '/cosmoshot/infra/europe/bin/europe-ssh'
subprocess.run([helper, '1', 'mkdir -p /var/tmp/privatelocalchat-transfer && chmod 700 /var/tmp/privatelocalchat-transfer && cat > /var/tmp/privatelocalchat-transfer/publish-models.py'],
               input=(ROOT / 'publish-models-remote.py').read_bytes(), check=True)
subprocess.run([helper, '1', 'python3 -u /var/tmp/privatelocalchat-transfer/publish-models.py'],
               input=json.dumps(payload).encode(), check=True)
