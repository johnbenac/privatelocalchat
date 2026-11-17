#!/usr/bin/env python3
"""Publish any immutable set of files (speech models, and so on) to the project CDN, assets.privatelocal.chat.

    python3 ops/cloudflare/publish-files.py --list
    python3 ops/cloudflare/publish-files.py kitten_nano_int8 --dry-run   # download, verify every size and SHA-256; writes nothing remote
    python3 ops/cloudflare/publish-files.py kitten_nano_int8             # upload to R2, then verify every object over its public URL

The sets are described in ops/cloudflare/voice-models.json (or another file given with --manifest): destination prefix, source base URL, licence
file, and per-file path, size and SHA-256. Every file is downloaded to a fresh temporary directory and checked against the pinned size and SHA-256
before anything is uploaded. Same safety properties as publish-gguf.py: an identical existing object is kept, a different one is refused, objects
carry Cache-Control immutable and a sha256 metadata value, manifest.json and LICENSE.txt are written beside the files, and every object is read
back over its public URL with the app's Origin and checked for bytes, CORS and content type. Needs boto3 and the operator's Cloudflare token
(never printed) only when not --dry-run.
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
CACHE = 'public, max-age=31536000, immutable'
TYPES = {'.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.wasm': 'application/wasm', '.mjs': 'text/javascript',
         '.js': 'text/javascript'}


def content_type(path):
    return TYPES.get(Path(path).suffix.lower(), 'application/octet-stream')


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


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b''):
            digest.update(chunk)
    return digest.hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('key', nargs='?')
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--list', action='store_true')
    parser.add_argument('--manifest', default=str(ROOT / 'voice-models.json'))
    parser.add_argument('--source', help='read the files from here instead of the manifest source host')
    parser.add_argument('--token-file', default='/root/.config/privatelocalchat/cloudflare-api-token')
    args = parser.parse_args()
    sets = json.loads(Path(args.manifest).read_text())
    if args.list or not args.key:
        for key, m in sets.items():
            print(key, sum(f['bytes'] for f in m['files']), 'bytes,', len(m['files']), 'files ->', m['prefix'])
        return
    m = sets[args.key]
    prefix = m['prefix']
    source = (args.source or m['sourceBase']).rstrip('/') + '/'
    work = Path(tempfile.mkdtemp(prefix='plc-files-'))
    print('working in', work)
    for f in m['files']:
        dest = work / f['path']
        dest.parent.mkdir(parents=True, exist_ok=True)  # nested paths such as onnx/model_quantized.onnx
        size, sha = download(source + f['path'], dest)
        if size != f['bytes'] or sha != f['sha256']:
            sys.exit('MISMATCH %s: %d bytes, sha256 %s' % (f['path'], size, sha))
        print('verified', f['path'], size, 'bytes')
    manifest = {'format': 'file-set/1', 'key': args.key, 'model': m.get('model'), 'license': m['licenseName'], 'files': m['files'], 'note': m['note']}
    (work / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    license_path = Path(m['licenseFile'])
    if not license_path.is_absolute():
        license_path = ROOT / license_path
    (work / 'LICENSE.txt').write_text(license_path.read_text())
    types = {f['path']: content_type(f['path']) for f in m['files']}
    types['manifest.json'] = 'application/json'
    types['LICENSE.txt'] = 'text/plain; charset=utf-8'
    state = json.loads((ROOT / 'cdn-state.json').read_text())
    host = 'https://' + state['domain'] + '/'
    print('\n%d objects -> %s%s' % (len(types), host, prefix))
    if args.dry_run:
        print('dry run: nothing uploaded; files kept in', work)
        return

    import boto3
    from boto3.s3.transfer import TransferConfig
    from botocore.config import Config
    token = os.environ.get('CLOUDFLARE_API_TOKEN', '').strip() or Path(args.token_file).read_text().strip()
    key_id = None
    for endpoint in ('user/tokens/verify', 'accounts/' + state['account'] + '/tokens/verify'):
        try:
            request = urllib.request.Request('https://api.cloudflare.com/client/v4/' + endpoint, headers={'Authorization': 'Bearer ' + token})
            with urllib.request.urlopen(request, timeout=45) as response:
                key_id = json.load(response)['result']['id']
            break
        except Exception as error:
            print('token check failed at', endpoint, '-', type(error).__name__, getattr(error, 'code', ''))
    if not key_id:
        sys.exit('Could not verify the Cloudflare token')
    client = boto3.client('s3', endpoint_url='https://' + state['account'] + '.r2.cloudflarestorage.com', region_name='auto',
                          aws_access_key_id=key_id, aws_secret_access_key=hashlib.sha256(token.encode()).hexdigest(),
                          config=Config(max_pool_connections=8))
    transfer = TransferConfig(multipart_threshold=64 << 20, multipart_chunksize=32 << 20)
    digests = {}
    for path, ctype in types.items():
        key = prefix + path
        data_path = work / path
        size = data_path.stat().st_size
        digest = digests[path] = sha256_file(data_path)
        try:
            current = client.head_object(Bucket=state['bucket'], Key=key)
            if current['ContentLength'] == size and current.get('Metadata', {}).get('sha256') == digest:
                print('kept', key)
                continue
            sys.exit('Refusing to replace a different immutable object: ' + key)
        except client.exceptions.ClientError as error:
            if error.response['Error']['Code'] not in ('404', 'NoSuchKey', 'NotFound'):
                raise
        client.upload_file(str(data_path), state['bucket'], key, ExtraArgs={'ContentType': ctype, 'CacheControl': CACHE, 'Metadata': {'sha256': digest}}, Config=transfer)
        print('uploaded', key, size)

    print('\nverifying over the public URL, with the origin the app uses')
    failures = 0
    for path, ctype in types.items():
        request = urllib.request.Request(host + prefix + path, headers={'Origin': state['canonicalOrigin'], 'User-Agent': 'Private Local Chat publisher'})
        digest = hashlib.sha256()
        with urllib.request.urlopen(request, timeout=300) as response:
            headers = {k.lower(): v for k, v in response.headers.items()}
            while True:
                chunk = response.read(1 << 20)
                if not chunk:
                    break
                digest.update(chunk)
        problems = []
        if digest.hexdigest() != digests[path]:
            problems.append('bytes differ')
        if headers.get('access-control-allow-origin') not in ('*', state['canonicalOrigin']):
            problems.append('no CORS for ' + state['canonicalOrigin'])
        if not headers.get('content-type', '').startswith(ctype.split(';')[0]):
            problems.append('content-type ' + headers.get('content-type', '?'))
        print(('OK   ' if not problems else 'FAIL ') + path, '; '.join(problems), '| CORP:', headers.get('cross-origin-resource-policy', '(none)'), '| cache:', headers.get('cache-control', '?'))
        failures += bool(problems)
    sys.exit(1 if failures else 0)


if __name__ == '__main__':
    main()
