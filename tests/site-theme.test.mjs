// SPDX-License-Identifier: AGPL-3.0-only
// A site directory may carry a static/ folder: the build serves it from the root (static/site-theme.css as /site-theme.css), and a page that links it passes the asset check; a site without the file builds as before,
// and a page that links a theme the site does not have is refused.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, access, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildPublicSite, EMPTY_CONFIG } from '../scripts/public-site.mjs';

async function site(withTheme, linkTheme) {
  const dir = await mkdtemp(path.join(tmpdir(), 'plc-site-'));
  const out = await mkdtemp(path.join(tmpdir(), 'plc-out-'));
  await cp(new URL('./fixtures/site/', import.meta.url), dir, { recursive: true });
  if (withTheme) { await mkdir(path.join(dir, 'static'), { recursive: true }); await writeFile(path.join(dir, 'static/site-theme.css'), ':root{--plc-background:#F4ECDF}\n'); }
  const file = path.join(dir, 'pages/help/index.html');
  let html = await readFile(file, 'utf8');
  html = html.replace(/<link rel="stylesheet" href="\/chat\/public-pages\.css">/, (m) => m + (linkTheme ? '\n<link rel="stylesheet" href="/site-theme.css">' : ''));
  await writeFile(file, html);
  // every other file the page names exists (the test is about the theme only)
  for (const [, ref] of html.matchAll(/\b(?:href|src)="(\/[^"#?]*\.(?:css|mjs|js|png|svg|ico|xml|webmanifest|json))"/g)) {
    if (ref === '/site-theme.css') continue;
    for (const f of [ref, ref.replace(/^\/(chat|runtime)\//, '/releases/test/$1/')]) { await mkdir(path.dirname(path.join(out, f)), { recursive: true }); await writeFile(path.join(out, f), '/* x */'); }
  }
  return { dir, out };
}
const run = (s) => buildPublicSite({ siteDir: s.dir, outDir: s.out, releasePath: 'releases/test', config: EMPTY_CONFIG, rootLastmod: '2026-11-23' });

test('a site theme is copied and a page may link it', async () => {
  const s = await site(true, true);
  try { await run(s); assert.equal(await readFile(path.join(s.out, 'site-theme.css'), 'utf8'), ':root{--plc-background:#F4ECDF}\n'); assert.match(await readFile(path.join(s.out, 'help/index.html'), 'utf8'), /site-theme\.css/); }
  finally { await rm(s.dir, { recursive: true }); await rm(s.out, { recursive: true }); }
});
test('a site without a theme builds and writes none', async () => {
  const s = await site(false, false);
  try { await run(s); await assert.rejects(access(path.join(s.out, 'site-theme.css'))); }
  finally { await rm(s.dir, { recursive: true }); await rm(s.out, { recursive: true }); }
});
test('a page that links a theme the site does not have is refused', async () => {
  const s = await site(false, true);
  try { await assert.rejects(run(s), /site-theme\.css, which is not in the build output/); }
  finally { await rm(s.dir, { recursive: true }); await rm(s.out, { recursive: true }); }
});

test('a static file never replaces a file the build already wrote', async () => {
  const s = await site(true, true);
  try {
    await mkdir(path.join(s.dir, 'static/chat'), { recursive: true });
    await writeFile(path.join(s.dir, 'static/chat/public-pages.css'), 'a:hover{color:red}');
    await assert.rejects(run(s), /would replace/);
  } finally { await rm(s.dir, { recursive: true }); await rm(s.out, { recursive: true }); }
});
test('nested static folders are copied whole', async () => {
  const s = await site(true, true);
  try {
    await mkdir(path.join(s.dir, 'static/brand/x/fonts'), { recursive: true });
    await writeFile(path.join(s.dir, 'static/brand/x/fonts/a.woff2'), 'f');
    await run(s);
    assert.equal(await readFile(path.join(s.out, 'brand/x/fonts/a.woff2'), 'utf8'), 'f');
  } finally { await rm(s.dir, { recursive: true }); await rm(s.out, { recursive: true }); }
});

test('a site may bring its own 404 page, rewritten to the release paths', async () => {
  const s = await site(true, true);
  try {
    await writeFile(path.join(s.dir, '404.html'), '<!doctype html><html lang="en"><head><title>x</title><link rel="stylesheet" href="/chat/public-pages.css"></head><body><main><h1>Gone</h1></main></body></html>');
    await run(s);
    const html = await readFile(path.join(s.out, '404.html'), 'utf8');
    assert.match(html, /<html lang="en">/); assert.match(html, /href="\/releases\/test\/chat\/public-pages\.css"/);
  } finally { await rm(s.dir, { recursive: true }); await rm(s.out, { recursive: true }); }
});
