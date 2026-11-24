import './helpers/install-app-config.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { probeModelSource } from '../chat/models/source-probe.mjs';

const source = { id:'mirror', label:'Mirror', base:'https://mirror.example/models/' };
const posture = { mode:'open' };

test('a source probe refuses an unapproved destination before making a request', async () => {
  await assert.rejects(probeModelSource(source, {
    posture:{ mode:'curated', approve:() => false },
    fetcher:() => assert.fail('An unapproved source received a request'),
  }), { code:'source-not-approved' });
});

test('a source probe requires a range response and refuses same-size wrong bytes', async () => {
  await assert.rejects(probeModelSource(source, {
    posture, fetcher:() => new Response('range ignored'),
  }), { code:'source-range' });
  await assert.rejects(probeModelSource(source, {
    posture,
    fetcher(url, { headers, mode, redirect, credentials }) {
      assert.ok(url.startsWith(source.base));
      assert.ok(url.endsWith('/mlc-chat-config.json'));
      assert.deepEqual([mode, redirect, credentials], ['cors', 'error', 'omit']);
      const last = Number(headers.get('range').match(/^bytes=0-(\d+)$/)[1]);
      return new Response(new Uint8Array(last + 1), {
        status:206, headers:{ 'Content-Range':`bytes 0-${last}/${last + 1}` },
      });
    },
  }), { code:'cache-corrupt' });
});
