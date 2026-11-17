"""The publisher must never replace a different object that already exists under an immutable key (ops/cloudflare/publish-files.py).

The module is imported by path, boto3 is replaced by a small fake (so no network, no credentials and no real bucket are involved), the source
files are read from a local directory through file:// URLs, and the Cloudflare token check is answered by a stub.
"""
import contextlib
import hashlib
import importlib.util
import io
import json
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest import mock

SCRIPT = Path(__file__).resolve().parents[2] / 'ops' / 'cloudflare' / 'publish-files.py'
CONTENT = b'immutable model bytes'
DIGEST = hashlib.sha256(CONTENT).hexdigest()


class FakeClientError(Exception):
    def __init__(self, code):
        super().__init__(code)
        self.response = {'Error': {'Code': code}}


class FakeClient:
    """Only what the publisher calls. `existing` maps a key to (ContentLength, sha256 metadata); a missing key answers 404."""

    def __init__(self, existing):
        self.existing = existing
        self.uploads = []
        self.heads = []
        self.exceptions = types.SimpleNamespace(ClientError=FakeClientError)

    def head_object(self, Bucket, Key):
        self.heads.append(Key)
        if Key not in self.existing:
            raise FakeClientError('404')
        length, sha = self.existing[Key]
        return {'ContentLength': length, 'Metadata': {'sha256': sha}}

    def upload_file(self, filename, bucket, key, **kwargs):
        self.uploads.append(key)


def load_module():
    spec = importlib.util.spec_from_file_location('publish_files_under_test', SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def run_publisher(existing):
    """Runs main() for a one-file set, with `existing` as the bucket's current contents. Returns (client, exit message, stdout)."""
    client = FakeClient(existing)
    boto3 = types.ModuleType('boto3')
    boto3.client = lambda *a, **k: client
    s3 = types.ModuleType('boto3.s3')
    transfer = types.ModuleType('boto3.s3.transfer')
    transfer.TransferConfig = lambda **k: object()
    botocore = types.ModuleType('botocore')
    botocore_config = types.ModuleType('botocore.config')
    botocore_config.Config = lambda **k: object()
    fakes = {'boto3': boto3, 'boto3.s3': s3, 'boto3.s3.transfer': transfer, 'botocore': botocore, 'botocore.config': botocore_config}

    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        source = tmp / 'source'
        source.mkdir()
        (source / 'model.bin').write_bytes(CONTENT)
        (tmp / 'LICENSE.txt').write_text('test licence')
        manifest = tmp / 'sets.json'
        manifest.write_text(json.dumps({'demo': {
            'prefix': 'models/Demo/' + 'a' * 40 + '/', 'sourceBase': source.as_uri(), 'licenseName': 'Apache-2.0', 'licenseFile': str(tmp / 'LICENSE.txt'),
            'note': 'test', 'model': {'name': 'demo'}, 'files': [{'path': 'model.bin', 'bytes': len(CONTENT), 'sha256': DIGEST}],
        }}))
        module = load_module()
        real_urlopen = module.urllib.request.urlopen

        def urlopen(request, *a, **k):
            url = request.full_url if hasattr(request, 'full_url') else request
            if url.startswith('https://api.cloudflare.com/'):
                return io.BytesIO(json.dumps({'result': {'id': 'test-key-id'}}).encode())
            if url.startswith('file:'):
                return real_urlopen(request, *a, **k)
            raise AssertionError('unexpected network access: ' + url)

        out = io.StringIO()
        message = None
        argv = ['publish-files.py', 'demo', '--manifest', str(manifest), '--source', source.as_uri(), '--token-file', str(tmp / 'token')]
        (tmp / 'token').write_text('not-a-real-token')
        with mock.patch.dict(sys.modules, fakes), mock.patch.object(sys, 'argv', argv), mock.patch.object(module.urllib.request, 'urlopen', urlopen), \
                contextlib.redirect_stdout(out):
            try:
                module.main()
            except SystemExit as exit_:
                message = exit_.code
            except AssertionError as error:  # the public-URL verification stage is out of scope here: it needs the real host
                message = 'reached network verification: ' + str(error)
        return client, message, out.getvalue()


class RefuseToReplaceTests(unittest.TestCase):
    def test_a_different_existing_object_is_refused_and_nothing_is_uploaded(self):
        key = 'models/Demo/' + 'a' * 40 + '/model.bin'
        for label, current in (('other size', (len(CONTENT) + 1, DIGEST)), ('other hash', (len(CONTENT), 'f' * 64)), ('no hash metadata', (len(CONTENT), None))):
            with self.subTest(label):
                client, message, _ = run_publisher({key: current})
                self.assertIsInstance(message, str)
                self.assertTrue(message.startswith('Refusing to replace a different immutable object'), message)
                self.assertTrue(message.endswith(key))
                self.assertEqual(client.uploads, [], 'a refused publish must not upload anything')

    def test_an_identical_existing_object_is_kept_not_replaced(self):
        key = 'models/Demo/' + 'a' * 40 + '/model.bin'
        existing = {key: (len(CONTENT), DIGEST)}
        # the other two objects (manifest.json, LICENSE.txt) are written by the publisher itself, so they are new and are uploaded
        client, message, out = run_publisher(existing)
        self.assertIn('kept ' + key, out)
        self.assertNotIn(key, client.uploads)
        self.assertEqual(sorted(client.uploads), sorted(['models/Demo/' + 'a' * 40 + '/manifest.json', 'models/Demo/' + 'a' * 40 + '/LICENSE.txt']))
        # past the upload stage the publisher reads every object back over the public host; that stage is out of scope here
        self.assertTrue(str(message).startswith('reached network verification'), message)


if __name__ == '__main__':
    unittest.main()
