// Tests of the site manifest validator, the asset check and the no-address rule (validator/site-manifest.mjs). No network: `node --test validator/tests/`.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {checkSiteManifest, validTarget, validSiteUrl, validImagePath, missingAssets, assertAssetsExist, noAddressWithoutManifest} from '../site-manifest.mjs';

const opts = {format: 'demo-site/1', pages: ['help', 'about', 'privacy', 'updates']};
const good = {format: 'demo-site/1', pages: {help: '/help/', about: 'https://example.org/about'}, site: {url: 'https://example.org/', socialImage: '/brand/card.png', countsPageLoads: false}};
const mk = async (tree) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'validator-test-'));
  for (const [rel, content] of Object.entries(tree)) { await mkdir(path.dirname(path.join(dir, rel)), {recursive: true}); await writeFile(path.join(dir, rel), content); }
  return dir;
};

test('a good manifest has no problems, with or without a site block', () => {
  assert.deepEqual(checkSiteManifest(good, opts), []);
  assert.deepEqual(checkSiteManifest({format: 'demo-site/1', pages: {}}, opts), []);
});

test('every way a manifest can be wrong is named', () => {
  const cases = [
    [null, 'must be an object'], [[], 'must be an object'], [{...good, format: 'other/1'}, 'format must be'], [{format: 'demo-site/1'}, 'pages must be an object'], [{format: 'demo-site/1', pages: []}, 'pages must be an object'],
    [{...good, pages: {nope: '/x/'}}, 'not a page this application knows'], [{...good, pages: {help: 'help/'}}, 'pages.help must be'], [{...good, pages: {help: '//evil.example/'}}, 'pages.help must be'],
    [{...good, pages: {help: 'http://example.org/'}}, 'pages.help must be'], [{...good, pages: {help: '/a b'}}, 'pages.help must be'], [{...good, site: []}, 'site must be an object'],
    [{...good, site: {url: 'https://example.org/path'}}, 'site.url'], [{...good, site: {url: 'http://example.org/'}}, 'site.url'], [{...good, site: {url: 'https://example.org/', extra: 1}}, 'not a setting'],
    [{...good, site: {url: 'https://example.org/', socialImage: '/../x.png'}}, 'site.socialImage'], [{...good, site: {url: 'https://example.org/', socialImage: 'x.png'}}, 'site.socialImage'],
    [{...good, site: {url: 'https://example.org/', countsPageLoads: 'no'}}, 'countsPageLoads']
  ];
  for (const [raw, part] of cases) { const p = checkSiteManifest(raw, opts); assert.ok(p.some((x) => x.includes(part)), `${JSON.stringify(raw)?.slice(0, 80)} -> ${part}: ${p.join('|')}`); }
  assert.throws(() => checkSiteManifest(good, {}), /needs the application/);
});

test('the pieces: targets, site addresses and image paths', () => {
  assert.ok(validTarget('/help/') && validTarget('https://example.org/x') && !validTarget('') && !validTarget('/' + 'a'.repeat(2001)) && !validTarget('//host/x') && !validTarget(5));
  assert.ok(validSiteUrl('https://example.org/') && validSiteUrl('https://example.org:8443/') && !validSiteUrl('https://example.org') && !validSiteUrl('https://exa"mple.org/'));
  assert.ok(validImagePath('/brand/card.png') && !validImagePath('/a b.png') && !validImagePath('/a/../b.png') && !validImagePath('card.png'));
});

test('the asset check: every stylesheet, script and image a page names must exist; throwing and listing forms agree', async () => {
  const dir = await mk({'css/a.css': 'x', 'js/a.mjs': 'x'});
  try {
    const html = '<link href="/css/a.css"><script src="/js/a.mjs"></script><img src="/img/gone.png"><a href="/page/">not an asset</a><script src="/js/other.js"></script>';
    assert.deepEqual(await missingAssets(html, dir), ['/img/gone.png', '/js/other.js']);
    await assert.rejects(assertAssetsExist(html, dir, 'help'), /help refers to \/img\/gone\.png, which is not in the build output/);
    await assertAssetsExist('<link href="/css/a.css">', dir, 'ok');
    assert.deepEqual(await missingAssets('<a href="https://elsewhere.example/x.css">', dir), [], 'only same-host paths are checked');
  } finally { await rm(dir, {recursive: true, force: true}); }
});

test('no layer means no address: a build without a site address carries no sitemap, robots, feed, canonical, Open Graph or structured data', async () => {
  const clean = await mk({'index.html': '<html><head><title>x</title></head></html>', 'help/index.html': '<p>Help</p>'});
  try { assert.deepEqual(await noAddressWithoutManifest(clean), []); } finally { await rm(clean, {recursive: true, force: true}); }
  const dirty = await mk({'index.html': '<link rel="canonical" href="https://x/"><meta property="og:url" content="https://x/"><meta property="og:image" content="/c.png"><script type="application/ld+json">{}</script>',
    'sitemap.xml': '<x/>', 'robots.txt': 'x', 'updates/rss.xml': '<rss/>', 'custom/feed.json': '{}'});
  try {
    const p = await noAddressWithoutManifest(dirty, {extraFiles: ['custom/feed.json']});
    for (const part of ['sitemap.xml', 'robots.txt', 'updates/rss.xml', 'custom/feed.json', 'a canonical link', 'an og:url', 'an og:image', 'structured data']) assert.ok(p.some((x) => x.includes(part)), part + ': ' + p.join('|'));
    assert.deepEqual(await noAddressWithoutManifest(dirty, {hasSiteAddress: true}), [], 'a site build may have them');
  } finally { await rm(dirty, {recursive: true, force: true}); }
});
