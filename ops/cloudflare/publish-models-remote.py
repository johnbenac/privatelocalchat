#!/usr/bin/env python3
"""Read credentials from stdin, copy pinned models in R2, verify hashes."""
import concurrent.futures
import hashlib
import json
import sys
import time

import boto3
from botocore.config import Config

payload = json.load(sys.stdin)
state = payload['state']
client = boto3.client('s3', endpoint_url='https://' + state['account'] + '.r2.cloudflarestorage.com',
                      region_name='auto', aws_access_key_id=payload['accessKeyId'],
                      aws_secret_access_key=payload['secretAccessKey'],
                      config=Config(max_pool_connections=16))
source = payload['sourceBucket']
destination = state['bucket']
jobs = payload['manifest']['files']

def copy_one(job):
    key = job['key']
    original = client.head_object(Bucket=source, Key=key)
    if original['ContentLength'] != job['bytes'] or original.get('Metadata', {}).get('sha256') != job['sha256']:
        raise ValueError('Source metadata mismatch: ' + key)
    try:
        current = client.head_object(Bucket=destination, Key=key)
        if current['ContentLength'] == job['bytes'] and current.get('Metadata', {}).get('sha256') == job['sha256']:
            return 'kept ' + key
        raise ValueError('Refusing to replace different immutable object: ' + key)
    except client.exceptions.ClientError as error:
        if error.response['Error']['Code'] not in ['404', 'NoSuchKey', 'NotFound']:
            raise
    client.copy_object(Bucket=destination, Key=key, CopySource={'Bucket': source, 'Key': key},
                       MetadataDirective='COPY')
    return 'copied ' + key

def verify_one(job):
    digest = hashlib.sha256()
    count = 0
    response = client.get_object(Bucket=destination, Key=job['key'])
    for part in response['Body'].iter_chunks(chunk_size=1024 * 1024):
        digest.update(part)
        count += len(part)
    actual = digest.hexdigest()
    if count != job['bytes'] or actual != job['sha256']:
        raise ValueError('Destination bytes/hash mismatch: ' + job['key'])
    return {'key': job['key'], 'bytes': count, 'sha256': actual, 'verified': True}

prior = set(payload.get('verifiedKeys', []))
for stage, fn, workers in [('copy', copy_one, 8), ('verify', verify_one, 5)]:
    results = [{'key': job['key'], 'bytes': job['bytes'], 'sha256': job['sha256'], 'verified': True}
               for job in jobs if stage == 'verify' and job['key'] in prior]
    pending = [job for job in jobs if stage != 'verify' or job['key'] not in prior]
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(fn, job): job for job in pending}
        for index, future in enumerate(concurrent.futures.as_completed(futures), len(results) + 1):
            result = future.result()
            results.append(result)
            print(stage + ' ' + str(index) + '/' + str(len(jobs)) + ' ' + (result if isinstance(result, str) else result['key']), flush=True)
    if stage == 'verify':
        proof = {'verifiedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                 'bucket': destination, 'objects': len(results), 'bytes': sum(item['bytes'] for item in results),
                 'allSha256VerifiedFromDestination': True, 'files': sorted(results, key=lambda item: item['key'])}
        print('VERIFICATION_JSON=' + json.dumps(proof), flush=True)

for key, body in payload['extras'].items():
    raw = body.encode()
    digest = hashlib.sha256(raw).hexdigest()
    client.put_object(Bucket=destination, Key=key, Body=raw,
                      ContentType='application/json' if key.endswith('.json') else 'text/plain; charset=utf-8',
                      CacheControl='public, max-age=3600' if key.endswith('catalog.json') else 'public, max-age=31536000, immutable',
                      Metadata={'sha256': digest})
    print('extra ' + key, flush=True)
print('DONE', flush=True)
