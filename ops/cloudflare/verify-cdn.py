#!/usr/bin/env python3
"""Verify public HTTPS model hashes, browser CORS, byte ranges and CDN cache."""
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parent
manifest = json.loads((ROOT / 'model-cdn-manifest.json').read_text())
origin = 'https://privatelocal.chat'

def request(url, byte_range=None, request_origin=origin):
    with tempfile.TemporaryDirectory(prefix='privatelocalchat-cdn-check-') as temporary:
        directory = Path(temporary)
        command = ['curl', '--fail', '--silent', '--show-error', '--max-time', '90',
                   '--header', 'Origin: ' + request_origin, '--dump-header', str(directory / 'headers'),
                   '--output', str(directory / 'body')]
        if byte_range is not None:
            command += ['--range', byte_range]
        subprocess.run(command + [url], check=True)
        headers_raw = (directory / 'headers').read_text()
        blocks = headers_raw.strip().split('\n\n')
        block = blocks[-1]
        headers = {}
        for line in block.splitlines()[1:]:
            if ':' in line:
                key, value = line.split(':', 1)
                headers[key.lower()] = value.strip()
        return int(block.splitlines()[0].split()[1]), headers, (directory / 'body').read_bytes()

checks = []
samples = [file for file in manifest['files'] if file['path'] in ['mlc-chat-config.json'] or file['path'].endswith('.wasm')]
for file in samples:
    status, headers, body = request(file['url'])
    assert status == 200
    assert headers.get('access-control-allow-origin') == '*'
    assert 'immutable' in headers.get('cache-control', '')
    assert len(body) == file['bytes'] and hashlib.sha256(body).hexdigest() == file['sha256']
    if file['path'].endswith('.wasm'):
        assert headers.get('content-type', '').startswith('application/wasm')
    checks.append({'url': file['url'], 'status': status, 'sha256Matches': True, 'cors': True,
                   'contentType': headers.get('content-type'), 'cacheStatus': headers.get('cf-cache-status')})

for key in ['params_shard_0.bin', '-00001-of-00013.gguf']:
    file = next(file for file in manifest['files'] if file['path'].endswith(key))
    for attempt in range(5):
        status, headers, body = request(file['url'], '0-63')
        if headers.get('cf-cache-status') == 'HIT':
            break
        time.sleep(1)
    assert status == 206 and len(body) == 64
    assert headers.get('cache-control') == 'no-store'
    assert headers.get('cf-cache-status') == 'HIT', headers
    assert headers.get('content-range') == 'bytes 0-63/' + str(file['bytes'])
    assert headers.get('access-control-allow-origin') == '*'
    assert 'Content-Range' in headers.get('access-control-expose-headers', '')
    checks.append({'url': file['url'], 'status': status, 'range': headers['content-range'],
                   'cors': True, 'cacheControl': headers['cache-control'], 'cacheStatus': 'HIT'})

cached = samples[0]['url']
for attempt in range(5):
    status, headers, body = request(cached)
    if headers.get('cf-cache-status') == 'HIT':
        break
    time.sleep(1)
assert headers.get('cf-cache-status') == 'HIT', headers
checks.append({'url': cached, 'cacheStatus': 'HIT'})
catalog_url = manifest['cdnOrigin'] + '/models/catalog.json'
status, headers, body = request(catalog_url, request_origin='https://dev.privatelocal.chat')
assert status == 200 and body == (ROOT / 'model-cdn-manifest.json').read_bytes()
assert headers.get('access-control-allow-origin') == '*'
assert headers.get('cache-control') == 'public, max-age=3600'
checks.append({'url': catalog_url, 'status': status, 'catalogMatches': True,
               'requestOrigin': 'https://dev.privatelocal.chat', 'cors': True,
               'cacheControl': headers['cache-control']})
proof = {'verifiedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'requestOrigin': origin,
         'allChecksPassed': True, 'checks': checks}
(ROOT / 'public-cdn-verification.json').write_text(json.dumps(proof, indent=2) + '\n')
print(json.dumps(proof, indent=2))
