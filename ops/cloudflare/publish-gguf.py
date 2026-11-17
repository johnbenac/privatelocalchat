#!/usr/bin/env python3
"""Publish a sharded GGUF language model to the project CDN, assets.privatelocal.chat.

    python3 ops/cloudflare/publish-gguf.py lfm25_2_6b_q3 --dry-run   # download, verify every SHA-256, show the plan; writes nothing
    python3 ops/cloudflare/publish-gguf.py lfm25_2_6b_q3             # upload to R2, then verify every object over its public URL
    python3 ops/cloudflare/publish-gguf.py --list

The models are described in ops/cloudflare/gguf-models.json (file names, sizes, SHA-256, source host, licence file, destination prefix).
Files are downloaded to a temporary directory one at a time and checked against the pinned SHA-256 before anything is uploaded. Needs boto3 and
the operator's Cloudflare token (default /root/.config/privatelocalchat/cloudflare-api-token, never printed). Objects are immutable: an identical
existing object is kept, a different one is refused. Writes manifest.json (sizes and hashes) and LICENSE.txt beside the weights.
"""
import argparse
import hashlib
import json
import os
import sys
import tempfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
STATE = json.loads((ROOT / 'cdn-state.json').read_text())
MODELS = json.loads((ROOT / 'gguf-models.json').read_text())
HOST = 'https://' + STATE['domain'] + '/'
CACHE = 'public, max-age=31536000, immutable'


def download(url, dest):
    digest = hashlib.sha256()
    size = 0
    request = urllib.request.Request(url, headers={'User-Agent': 'Private Local Chat publisher'})
    with urllib.request.urlopen(request, timeout=300) as response, open(dest, 'wb') as out:
        while True:
            chunk = response.read(1 << 20)
            if not chunk:
                break
            digest.update(chunk)
            size += len(chunk)
            out.write(chunk)
    return size, digest.hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('model', nargs='?')
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--list', action='store_true')
    parser.add_argument('--source', help='read the files from here instead of the manifest source host')
    parser.add_argument('--token-file', default='/root/.config/privatelocalchat/cloudflare-api-token')
    args = parser.parse_args()
    if args.list or not args.model:
        for key, m in MODELS.items():
            print(key, m['totalBytes'], 'bytes,', len(m['files']), 'files ->', m['prefix'])
        return
    m = MODELS[args.model]
    prefix = m['prefix']
    source = (args.source or m['sourceBase']).rstrip('/') + '/'
    work = Path(tempfile.mkdtemp(prefix='plc-gguf-'))
    print('working in', work)
    for f in m['files']:
        dest = work / f['path']
        size, sha = download(source + f['path'], dest)
        if size != f['bytes'] or sha != f['sha256']:
            sys.exit('MISMATCH %s: %d bytes, sha256 %s' % (f['path'], size, sha))
        print('verified', f['path'], size, 'bytes')
    manifest = {'format': 'gguf-model/1', 'configurationId': m['configurationId'], 'model': m['languageModel'], 'license': m['licenseName'],
                'context': m['context'], 'files': m['files'], 'note': m['note']}
    (work / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    (work / 'LICENSE.txt').write_text(Path(m['licenseFile']).read_text())
    types = {f['path']: 'application/octet-stream' for f in m['files']}
    types['manifest.json'] = 'application/json'
    types['LICENSE.txt'] = 'text/plain; charset=utf-8'
    print('\n%d objects -> %s%s' % (len(types), HOST, prefix))
    if args.dry_run:
        print('dry run: nothing uploaded; files kept in', work)
        return

    import boto3
    from boto3.s3.transfer import TransferConfig
    from botocore.config import Config
    token = os.environ.get('CLOUDFLARE_API_TOKEN', '').strip() or Path(args.token_file).read_text().strip()
    key_id = None
    for endpoint in ('user/tokens/verify', 'accounts/' + STATE['account'] + '/tokens/verify'):
        try:
            request = urllib.request.Request('https://api.cloudflare.com/client/v4/' + endpoint, headers={'Authorization': 'Bearer ' + token})
            with urllib.request.urlopen(request, timeout=45) as response:
                key_id = json.load(response)['result']['id']
            break
        except Exception as error:
            print('token check failed at', endpoint, '-', type(error).__name__, getattr(error, 'code', ''))
    if not key_id:
        sys.exit('Could not verify the Cloudflare token')
    client = boto3.client('s3', endpoint_url='https://' + STATE['account'] + '.r2.cloudflarestorage.com', region_name='auto',
                          aws_access_key_id=key_id, aws_secret_access_key=hashlib.sha256(token.encode()).hexdigest(),
                          config=Config(max_pool_connections=8))
    transfer = TransferConfig(multipart_threshold=64 << 20, multipart_chunksize=32 << 20)
    for path, ctype in types.items():
        key = prefix + path
        data_path = work / path
        size = data_path.stat().st_size
        digest = hashlib.sha256(data_path.read_bytes()).hexdigest() if size < (64 << 20) else next((f['sha256'] for f in m['files'] if f['path'] == path))
        try:
            current = client.head_object(Bucket=STATE['bucket'], Key=key)
            if current['ContentLength'] == size and current.get('Metadata', {}).get('sha256') == digest:
                print('kept', key)
                continue
            sys.exit('Refusing to replace a different immutable object: ' + key)
        except client.exceptions.ClientError as error:
            if error.response['Error']['Code'] not in ('404', 'NoSuchKey', 'NotFound'):
                raise
        client.upload_file(str(data_path), STATE['bucket'], key, ExtraArgs={'ContentType': ctype, 'CacheControl': CACHE, 'Metadata': {'sha256': digest}}, Config=transfer)
        print('uploaded', key, size)

    print('\nverifying over the public URL, with the origin the app uses')
    failures = 0
    for path, ctype in types.items():
        url = HOST + prefix + path
        request = urllib.request.Request(url, headers={'Origin': STATE['canonicalOrigin'], 'User-Agent': 'Private Local Chat publisher'})
        digest = hashlib.sha256()
        with urllib.request.urlopen(request, timeout=300) as response:
            headers = {k.lower(): v for k, v in response.headers.items()}
            while True:
                chunk = response.read(1 << 20)
                if not chunk:
                    break
                digest.update(chunk)
        local = hashlib.sha256((work / path).read_bytes()).hexdigest() if (work / path).stat().st_size < (200 << 20) else next(f['sha256'] for f in m['files'] if f['path'] == path)
        problems = []
        if digest.hexdigest() != local:
            problems.append('bytes differ')
        if headers.get('access-control-allow-origin') not in ('*', STATE['canonicalOrigin']):
            problems.append('no CORS for ' + STATE['canonicalOrigin'])
        if not headers.get('content-type', '').startswith(ctype.split(';')[0]):
            problems.append('content-type ' + headers.get('content-type', '?'))
        print(('OK   ' if not problems else 'FAIL ') + path, '; '.join(problems), '| CORP:', headers.get('cross-origin-resource-policy', '(none)'), '| cache:', headers.get('cache-control', '?'))
        failures += bool(problems)
    sys.exit(1 if failures else 0)


if __name__ == '__main__':
    main()
