import test from 'node:test';
import assert from 'node:assert/strict';
import './helpers/install-app-config.mjs';
import { updatedByHostLineApplies, UPDATED_BY_HOST_LINE } from '../chat/shell/models-page.mjs';
import { noticeApplies } from '../chat/models/source-notice.mjs';

const SITE = { url: 'https://example.org/' };

test('the line has the exact words', () => {
  assert.equal(UPDATED_BY_HOST_LINE, 'This copy is updated by whoever hosts it.');
});
test('no site identity: shown', () => {
  assert.equal(updatedByHostLineApplies({ format: 'plc-site/1', pages: {} }), true);
});
test('a site block: not shown', () => {
  assert.equal(updatedByHostLineApplies({ format: 'plc-site/1', pages: {}, site: SITE }), false);
});
test('a missing or broken manifest means no identity: shown', () => {
  for (const raw of [undefined, null, 'x', 42, [], { site: 'no' }, { site: { url: 'not a url' } }]) assert.equal(updatedByHostLineApplies(raw), true, JSON.stringify(raw));
});
test('other pages but no site: shown', () => {
  assert.equal(updatedByHostLineApplies({ format: 'plc-site/1', pages: { help: '/help/', about: '/about/' } }), true);
});
test('negative control: an operator source with no site still gets the line, unlike the notice', () => {
  const operator = { isDefaultSource: () => false };
  assert.equal(noticeApplies({ config: operator, site: null }), false);
  assert.equal(updatedByHostLineApplies({ pages: {} }), true);
});
