#!/usr/bin/env python3
"""Publish the small search-model set (Roberta's semantic matching) to the project CDN, assets.privatelocal.chat.

    python3 ops/cloudflare/publish-embedding.py --dry-run     # download, verify every SHA-256, show the plan; writes nothing
    python3 ops/cloudflare/publish-embedding.py               # upload to R2, then verify every object over its public URL

Needs only the operator's Cloudflare token file (default /root/.config/privatelocalchat/cloudflare-api-token) and boto3. R2's S3
credentials are derived from the token the same way publish-models.py does: access key id = the token's id, secret = SHA-256 of the token.
Objects are immutable: an existing object with the same bytes is kept, a different one is refused. The same version string and layout as
the source host are used on purpose (models/memory/<version>/...), so the bytes are provably the ones docs/EMBEDDINGS.md lists.
After it succeeds, follow docs/CDN-POPULATION.md step 3 (point the app at the new host).
"""
import argparse
import hashlib
import json
import os
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
VERSION = '79cbff1e617b319a'
STATE = json.loads((ROOT / 'cdn-state.json').read_text())
HOST = 'https://' + STATE['domain'] + '/'
PREFIX = 'models/memory/' + VERSION + '/'
SOURCE = HOST + PREFIX  # default: check the project's own copy; pass --source to publish from somewhere else
# What the app fetches (chat/embedding/embedding-config.mjs, chat/vendor/embedding/worker.js). The reranker in the source set is not used and is not copied.
FILES = [
    ('embed/config.json', 829, '258407cfa27c7e1e502a9c312abebb4f5241bf226972ffc366287f370a3567f1', 'application/json'),
    ('embed/tokenizer.json', 711661, 'da0e79933b9ed51798a3ae27893d3c5fa4a201126cef75586296df9b4d2c62a0', 'application/json'),
    ('embed/tokenizer_config.json', 1529, '46ac231e9b955a8af80fc7f23a0ecc65b524f1df84a02c2c82cbca354fb207b4', 'application/json'),
    ('embed/special_tokens_map.json', 732, '5aa43c2f985a25296d5a5ce621c2f77376ca8091a47993c492fd5460b895b140', 'application/json'),
    ('embed/onnx/model_quantized.onnx', 220597, '8c08cb4ecc00bad721b117a85738c537ceb9b85b3eedc52d9c6906fddaa55718', 'application/octet-stream'),
    ('embed/onnx/model_quantized.onnx_data', 22954752, 'e77ea96a124230e23e5bac8e26c3ffe5410154973d8635673fa0220b06c13f8b', 'application/octet-stream'),
    ('runtime/ort-wasm-simd-threaded.wasm', 12942611, 'f4f290847a4df02d0b93cdbf39b4b0e71acefbe80573e7e6b9342a7abd7b290a', 'application/wasm'),
    ('runtime/ort-wasm-simd-threaded.mjs', None, '5f2cd914554830762579c372d0211614c1e3f40ab3f6c0cfcf0900343229071d', 'text/javascript'),
]
LICENSE_TEXT = (
    'Small search model for Private Local Chat (Roberta\'s topic matching). embed/: MongoDB/mdbr-leaf-ir, revision '
    '4262131b32c3182bd06e67e92ae69d7bd66e0c5c, Apache-2.0, int8 ONNX unchanged. runtime/: ONNX Runtime Web '
    '1.26.0-dev.20260416-b7804b056c, MIT, unchanged. Files are immutable; a changed byte is a new version path.\n')
CACHE = 'public, max-age=31536000, immutable'


def fetch(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'Private Local Chat publisher'})
    with urllib.request.urlopen(request, timeout=120) as response:
        return response.read()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--source', default=SOURCE, help='where to read the set from (default: the current host)')
    parser.add_argument('--token-file', default='/root/.config/privatelocalchat/cloudflare-api-token')
    args = parser.parse_args()
    source = args.source if args.source.endswith('/') else args.source + '/'

    blobs = {}
    for path, size, sha, _ in FILES:
        data = fetch(source + path)
        actual = hashlib.sha256(data).hexdigest()
        if actual != sha or (size is not None and len(data) != size):
            sys.exit('MISMATCH ' + path + ': ' + str(len(data)) + ' bytes, sha256 ' + actual)
        blobs[path] = data
        print('verified', path, len(data), 'bytes')
    manifest = {'format': 'memory-models/1', 'version': VERSION, 'note': 'The files the app uses, with SHA-256 values.',
                'files': [{'path': p, 'bytes': len(blobs[p]), 'sha256': s} for p, _, s, _ in FILES]}
    blobs['manifest.json'] = (json.dumps(manifest, indent=2) + '\n').encode()
    blobs['LICENSE.txt'] = LICENSE_TEXT.encode()
    types = {p: t for p, _, _, t in FILES}
    types['manifest.json'] = 'application/json'
    types['LICENSE.txt'] = 'text/plain; charset=utf-8'
    total = sum(len(b) for b in blobs.values())
    print('\n%d objects, %d bytes -> %s%s' % (len(blobs), total, HOST, PREFIX))
    if args.dry_run:
        print('dry run: nothing uploaded')
        return

    import boto3
    from botocore.config import Config
    token = os.environ.get('CLOUDFLARE_API_TOKEN', '').strip() or Path(args.token_file).read_text().strip()
    key_id = None
    # A user token verifies at user/tokens/verify, an account-owned token at accounts/<id>/tokens/verify.
    for endpoint in ('user/tokens/verify', 'accounts/' + STATE['account'] + '/tokens/verify'):
        try:
            request = urllib.request.Request('https://api.cloudflare.com/client/v4/' + endpoint, headers={'Authorization': 'Bearer ' + token})
            with urllib.request.urlopen(request, timeout=45) as response:
                key_id = json.load(response)['result']['id']
            break
        except Exception as error:  # try the next kind of token
            print('token check failed at', endpoint, '-', type(error).__name__, getattr(error, 'code', ''))
    if not key_id:
        sys.exit('Could not verify the Cloudflare token')
    client = boto3.client('s3', endpoint_url='https://' + STATE['account'] + '.r2.cloudflarestorage.com', region_name='auto',
                          aws_access_key_id=key_id, aws_secret_access_key=hashlib.sha256(token.encode()).hexdigest(),
                          config=Config(max_pool_connections=8))
    for path, data in blobs.items():
        key = PREFIX + path
        digest = hashlib.sha256(data).hexdigest()
        try:
            current = client.head_object(Bucket=STATE['bucket'], Key=key)
            if current['ContentLength'] == len(data) and current.get('Metadata', {}).get('sha256') == digest:
                print('kept', key)
                continue
            sys.exit('Refusing to replace a different immutable object: ' + key)
        except client.exceptions.ClientError as error:
            if error.response['Error']['Code'] not in ('404', 'NoSuchKey', 'NotFound'):
                raise
        client.put_object(Bucket=STATE['bucket'], Key=key, Body=data, ContentType=types[path], CacheControl=CACHE, Metadata={'sha256': digest})
        print('uploaded', key)

    print('\nverifying over the public URL, with the origin the app uses')
    failures = 0
    for path, data in blobs.items():
        url = HOST + PREFIX + path
        req = urllib.request.Request(url, headers={'Origin': STATE['canonicalOrigin'], 'User-Agent': 'Private Local Chat publisher'})
        with urllib.request.urlopen(req, timeout=120) as response:
            body = response.read()
            h = {k.lower(): v for k, v in response.headers.items()}
        problems = []
        if hashlib.sha256(body).hexdigest() != hashlib.sha256(data).hexdigest():
            problems.append('bytes differ')
        if h.get('access-control-allow-origin') not in ('*', STATE['canonicalOrigin']):
            problems.append('no CORS for ' + STATE['canonicalOrigin'])
        if not h.get('content-type', '').startswith(types[path].split(';')[0]):
            problems.append('content-type ' + h.get('content-type', '?'))
        # COEP require-corp: a CORS-mode fetch is enough, but a cross-origin resource policy header makes <script>/<img> style loads safe too.
        print(('OK   ' if not problems else 'FAIL ') + path, '; '.join(problems), '| CORP:', h.get('cross-origin-resource-policy', '(none)'))
        failures += bool(problems)
    sys.exit(1 if failures else 0)


if __name__ == '__main__':
    main()
