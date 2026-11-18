#!/usr/bin/env python3
"""Verify PLC's model files on the shared CDN (https://cdn.aiofourown.com) against the pins in model-cdn-manifest.json.

Read-only: HEAD, GET and Range requests only; nothing is uploaded or deleted. The old host (assets.privatelocal.chat) is retired
and redirects (T674, T677); its last record stays in public-cdn-verification.json and is NOT rewritten by this script.

    python3 ops/cloudflare/verify-cdn.py                      # every file: HEAD (size, CORS, CORP, cache rule); a sample read whole and hashed;
                                                              # Range 206 on the largest weights; the catalogue; each version's MANIFEST.json
    python3 ops/cloudflare/verify-cdn.py --sample 40          # read 40 of the smallest files whole
    python3 ops/cloudflare/verify-cdn.py --full               # read EVERY file whole and hash it (about 14 GB: only when asked)
    python3 ops/cloudflare/verify-cdn.py --host URL --origin URL --write-proof FILE

Files that end in .wasm are skipped: the shared CDN is data-only, the two WebLLM libraries are served by the app.
Exit 0 only when every check passed; 1 when any failed; 2 for a bad option.
"""
import argparse
import concurrent.futures
import hashlib
import json
from pathlib import Path
import sys
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parent
UA = 'curl/8'  # Cloudflare answers 403 to the default Python client name


def fetch(url, method='GET', headers=None, timeout=120):
    request = urllib.request.Request(url, method=method, headers={'User-Agent': UA, **(headers or {})})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = b'' if method == 'HEAD' else response.read()
            return response.status, {k.lower(): v for k, v in response.headers.items()}, body
    except urllib.error.HTTPError as error:
        return error.code, {k.lower(): v for k, v in error.headers.items()}, b''


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--host', default='https://cdn.aiofourown.com')
    parser.add_argument('--origin', default='https://privatelocal.chat', help='the page origin to send as Origin (CORS)')
    parser.add_argument('--sample', type=int, default=24, help='how many of the smallest files to read whole and hash (default 24)')
    parser.add_argument('--full', action='store_true', help='read every file whole and hash it (about 14 GB)')
    parser.add_argument('--write-proof', metavar='FILE', help='write the result as JSON (nothing is written by default)')
    args = parser.parse_args(argv)
    host = args.host.rstrip('/')
    manifest = json.loads((ROOT / 'model-cdn-manifest.json').read_text())
    files = [f for f in manifest['files'] if not f['path'].endswith('.wasm')]
    for f in files:
        f['cdnUrl'] = host + '/' + f['key']
    failures = []
    checks = {'files': len(files), 'headChecked': 0, 'read': 0, 'ranges': 0}
    origin_header = {'Origin': args.origin}

    def head(f):
        status, headers, _ = fetch(f['cdnUrl'], 'HEAD', origin_header)
        problems = []
        if status != 200: problems.append('status %s' % status)
        if headers.get('content-length') != str(f['bytes']): problems.append('content-length %s, pinned %s' % (headers.get('content-length'), f['bytes']))
        if headers.get('access-control-allow-origin') != '*': problems.append('no CORS allow-origin *')
        if headers.get('cross-origin-resource-policy') != 'cross-origin': problems.append('no CORP cross-origin')
        cache = headers.get('cache-control', '')
        if f['path'].endswith(('.gguf', '.bin')):
            if cache != 'no-store': problems.append('weights should be no-store, got %r' % cache)
        elif 'immutable' not in cache:
            problems.append('should be immutable, got %r' % cache)
        return f['key'], problems

    with concurrent.futures.ThreadPoolExecutor(12) as pool:
        for key, problems in pool.map(head, files):
            checks['headChecked'] += 1
            for p in problems: failures.append('HEAD %s: %s' % (key, p))

    to_read = files if args.full else sorted(files, key=lambda f: f['bytes'])[:max(0, args.sample)]

    def read(f):
        status, headers, body = fetch(f['cdnUrl'], 'GET', origin_header, timeout=600)
        problems = []
        if status != 200: problems.append('status %s' % status)
        elif len(body) != f['bytes'] or hashlib.sha256(body).hexdigest() != f['sha256']: problems.append('bytes or SHA-256 differ from the pin')
        return f['key'], problems

    with concurrent.futures.ThreadPoolExecutor(4 if args.full else 8) as pool:
        for key, problems in pool.map(read, to_read):
            checks['read'] += 1
            for p in problems: failures.append('READ %s: %s' % (key, p))

    for suffix in ('.bin', '.gguf'):
        candidates = [f for f in files if f['path'].endswith(suffix)]
        if not candidates: continue
        f = max(candidates, key=lambda x: x['bytes'])
        status, headers, body = fetch(f['cdnUrl'], 'GET', {**origin_header, 'Range': 'bytes=0-63'})
        checks['ranges'] += 1
        if status != 206 or len(body) != 64: failures.append('RANGE %s: status %s, %d bytes' % (f['key'], status, len(body)))
        if headers.get('content-range') != 'bytes 0-63/%d' % f['bytes']: failures.append('RANGE %s: content-range %r' % (f['key'], headers.get('content-range')))
        if 'content-range' not in headers.get('access-control-expose-headers', '').lower(): failures.append('RANGE %s: Content-Range is not exposed to pages' % f['key'])

    status, headers, body = fetch(host + '/catalog.json', 'GET', origin_header)
    if status != 200 or headers.get('access-control-allow-origin') != '*':
        failures.append('CATALOG %s/catalog.json: status %s' % (host, status))
    else:
        listed = {x.get('manifest'): x for x in json.loads(body).get('families', [])}  # the catalogue names a family by its manifest path
        for key in sorted({f['key'][:-len(f['path'])] + 'MANIFEST.json' for f in files}):
            if key not in listed: failures.append('CATALOG: %s is not listed' % key)
            elif listed[key].get('owner') != 'plc': failures.append('CATALOG: %s is owned by %r, not plc' % (key, listed[key].get('owner')))
        checks['catalogFamilies'] = len(listed)

    versions = {}
    for f in files:
        versions.setdefault(f['key'][:-len(f['path'])], []).append(f)
    checks['versions'] = len(versions)
    for prefix, group in versions.items():
        status, headers, body = fetch(host + '/' + prefix + 'MANIFEST.json', 'GET', origin_header)
        if status != 200:
            failures.append('MANIFEST %s: status %s' % (prefix, status)); continue
        listed = {x['path']: x for x in json.loads(body).get('files', [])}
        for f in group:
            x = listed.get(f['path'])
            if not x or x.get('sha256') != f['sha256'] or x.get('bytes') != f['bytes']:
                failures.append('MANIFEST %s: %s differs from the pin' % (prefix, f['path']))

    proof = {'verifiedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'host': host, 'requestOrigin': args.origin,
             'full': args.full, 'allChecksPassed': not failures, 'checks': checks, 'failures': failures}
    if args.write_proof:
        Path(args.write_proof).write_text(json.dumps(proof, indent=2) + '\n')
    print(json.dumps(proof, indent=2))
    return 0 if not failures else 1


if __name__ == '__main__':
    sys.exit(main())
