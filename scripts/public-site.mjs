// The public documents (Help, About, Privacy, Updates): rendering, sitemap, robots.txt and the RSS feed.
// Used by scripts/build.mjs, by tests/public-site.test.mjs and, as a command, to refresh the committed sources:
//   node scripts/public-site.mjs sync     rewrites the generated regions of the source pages with the default (unconfigured) output
//
// The pages are plain HTML files in <site>/pages/help/, about/, privacy/ and updates/ (the site directory, docs/SITE-LAYER.md): whichever of them exist are built, and no others.
// Parts that depend on data are wrapped in region markers,
//   <!--plc:name--> ... <!--/plc:name-->
// and the build replaces what is between them. The committed pages hold the unconfigured rendering, so they are complete documents
// as they stand, and a test fails when they drift from the data they are generated from (the site's updates/entries.json, and content/known-issues.json).
import {readFile, writeFile, access, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// content/known-issues.json lives beside this script's repository, wherever the build or the sync command is run from
const CONTENT_DIR = fileURLToPath(new URL('../content/', import.meta.url));

export const REPO_URL = 'https://github.com/johnbenac/privatelocalchat';
export const ISSUES_URL = REPO_URL + '/issues/new/choose';
export const PAGES = Object.freeze([
  {name: 'help', title: 'Help', path: '/help/'},
  {name: 'about', title: 'About', path: '/about/'},
  {name: 'privacy', title: 'Privacy', path: '/privacy/'},
  {name: 'updates', title: 'Updates', path: '/updates/'}
]);
export const CONFIG_KEYS = Object.freeze(['supportEmail', 'supportOwner', 'discussionsUrl', 'discussionsOwner', 'verifiedOn', 'demo', 'hostingLogs', 'umbrella']);
export const EMPTY_CONFIG = Object.freeze(Object.fromEntries(CONFIG_KEYS.map(key => [key, null])));

// robots.txt: the plain "allow everything" policy with the sitemap line. A copy that names no address of its own (no `site.url` in its manifest) writes neither robots.txt nor a sitemap.
export const robotsTxt = origin => 'User-agent: *\nAllow: /\n\nSitemap: ' + origin + '/sitemap.xml\n';

export const esc = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
export const xmlEsc = esc;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SHORT_MONTHS = MONTHS.map(m => m.slice(0, 3));
const isoDate = /^\d{4}-\d{2}-\d{2}$/;
export const formatDate = iso => { const [y, m, d] = iso.split('-').map(Number); return d + ' ' + MONTHS[m - 1] + ' ' + y; };
export const rfc822 = iso => { const [y, m, d] = iso.split('-').map(Number); const date = new Date(Date.UTC(y, m - 1, d, 12)); return DAYS[date.getUTCDay()] + ', ' + String(d).padStart(2, '0') + ' ' + SHORT_MONTHS[m - 1] + ' ' + y + ' 12:00:00 GMT'; };

/** Reads and checks the release configuration. Unknown keys and malformed values are errors, never guesses. */
export async function loadSiteConfig(file = 'site-config.json') {
  let raw;
  try { raw = JSON.parse(await readFile(file, 'utf8')); } catch (error) { throw new Error('Cannot read the site configuration ' + file + ': ' + error.message); }
  return checkSiteConfig(raw);
}
export function checkSiteConfig(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('The site configuration must be an object');
  for (const key of Object.keys(raw)) if (!CONFIG_KEYS.includes(key)) throw new Error('Unknown site configuration key: ' + key);
  const config = {...EMPTY_CONFIG, ...raw};
  const text = key => { if (config[key] != null && (typeof config[key] !== 'string' || !config[key].trim() || /[\r\n<>]/.test(config[key]))) throw new Error('Site configuration ' + key + ' must be a single line of plain text or null'); };
  for (const key of ['supportOwner', 'discussionsOwner', 'hostingLogs']) text(key);
  if (config.supportEmail != null && !(typeof config.supportEmail === 'string' && /^[^\s@<>"',;:?&]+@[^\s@<>"',;:?&]+\.[^\s@<>"',;:?&]+$/.test(config.supportEmail))) throw new Error('Site configuration supportEmail is not an email address');
  if (config.discussionsUrl != null) {
    let url; try { url = new URL(config.discussionsUrl); } catch { /* reported below */ }
    if (!url || url.protocol !== 'https:' || url.username || url.password) throw new Error('Site configuration discussionsUrl must be an https address');
  }
  if (config.verifiedOn != null && !(typeof config.verifiedOn === 'string' && isoDate.test(config.verifiedOn))) throw new Error('Site configuration verifiedOn must be a YYYY-MM-DD date');
  if (config.demo != null && typeof config.demo !== 'object') throw new Error('Site configuration demo must be an object or null');
  // the organisation a site says it belongs to, shown as the last line of every page: { name, url }
  if (config.umbrella != null) {
    const u = config.umbrella;
    if (typeof u !== 'object' || Array.isArray(u) || Object.keys(u).some(k => !['name', 'url'].includes(k))) throw new Error('Site configuration umbrella must be { name, url } or null');
    if (typeof u.name !== 'string' || !u.name.trim() || u.name.length > 80 || /[\r\n<>]/.test(u.name)) throw new Error('Site configuration umbrella.name must be a single line of plain text');
    let url; try { url = new URL(u.url); } catch { /* reported below */ }
    if (!url || url.protocol !== 'https:' || url.username || url.password) throw new Error('Site configuration umbrella.url must be an https address');
  }
  return config;
}

/** The part of the configuration the running app may read (window.SITE_CONFIG). */
export const clientConfig = config => ({supportEmail: config.supportEmail, supportOwner: config.supportOwner, discussionsUrl: config.discussionsUrl});
/** A script element carrying it. "<" is escaped so the value can never end the element early. */
export const siteConfigScript = config => '<script>window.SITE_CONFIG=' + JSON.stringify(clientConfig(config)).replace(/</g, '\\u003c') + ';</script>';

// ---- updates and known issues: one source ---------------------------------------------------------------------------------------------
/**
 * The data the pages are generated from: the announcements of the site (<siteDir>/updates/entries.json, none when the site has no such file) and the known issues of the app
 * (content/known-issues.json, which describe the app and belong to everyone).
 */
export async function loadData({siteDir, contentDir = CONTENT_DIR} = {}) {
  let entries = [];
  if (siteDir) { try { entries = JSON.parse(await readFile(path.join(siteDir, 'updates/entries.json'), 'utf8')).entries; } catch (error) { if (error.code !== 'ENOENT') throw error; } }
  const knownIssues = JSON.parse(await readFile(path.join(contentDir, 'known-issues.json'), 'utf8')).knownIssues;
  return checkEntries({entries, knownIssues});
}
export function checkEntries(data) {
  if (!data || !Array.isArray(data.entries) || !Array.isArray(data.knownIssues)) throw new Error('entries.json needs "entries" and "knownIssues" lists');
  const ids = new Set(), issueIds = new Set(data.knownIssues.map(issue => issue.id));
  const links = (where, list) => { if (!Array.isArray(list)) throw new Error(where + ': help must be a list'); for (const link of list) if (!link?.label || !/^\/[a-z-]*\/(#[a-z0-9-]+)?$/.test(link.href || '')) throw new Error(where + ': bad help link ' + JSON.stringify(link)); };
  for (const entry of data.entries) {
    const where = 'update ' + entry.id;
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(entry.id || '') || ids.has(entry.id)) throw new Error('Bad or duplicate update id: ' + entry.id);
    ids.add(entry.id);
    if (!isoDate.test(entry.date || '')) throw new Error(where + ': date must be YYYY-MM-DD');
    if (entry.release !== null && !/^v\d+\.\d+\.\d+$/.test(entry.release || '')) throw new Error(where + ': release must be vX.Y.Z or null');
    for (const key of ['title', 'summary']) if (typeof entry[key] !== 'string' || !entry[key].trim()) throw new Error(where + ': missing ' + key);
    if (!Array.isArray(entry.points)) throw new Error(where + ': points must be a list');
    links(where, entry.help);
    for (const id of entry.issues || []) if (!issueIds.has(id)) throw new Error(where + ': unknown known issue ' + id);
  }
  const seenIssue = new Set();
  for (const issue of data.knownIssues) {
    const where = 'known issue ' + issue.id;
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(issue.id || '') || seenIssue.has(issue.id)) throw new Error('Bad or duplicate known issue id: ' + issue.id);
    seenIssue.add(issue.id);
    for (const key of ['title', 'devices', 'browsers', 'models', 'symptom', 'status', 'workaround']) if (typeof issue[key] !== 'string' || !issue[key].trim()) throw new Error(where + ': missing ' + key);
    if (!isoDate.test(issue.verified || '')) throw new Error(where + ': verified must be YYYY-MM-DD');
    links(where, issue.help);
  }
  const entries = data.entries.map((entry, index) => ({entry, index})).sort((a, b) => b.entry.date.localeCompare(a.entry.date) || a.index - b.index).map(item => item.entry);
  return {entries, knownIssues: data.knownIssues};
}

const helpLinks = links => links.length ? '<p class="update-links">Related help: ' + links.map(l => '<a href="' + esc(l.href) + '">' + esc(l.label) + '</a>').join(', ') + '.</p>' : '';
const releaseText = entry => entry.release ? 'Release ' + entry.release : 'Release: the next published release after v0.12.0';
const releaseHtml = entry => entry.release ? 'Release <a href="' + REPO_URL + '/releases/tag/' + esc(entry.release) + '">' + esc(entry.release) + '</a>' : 'Release: the next published release after <a href="' + REPO_URL + '/releases/tag/v0.12.0">v0.12.0</a>';

export function renderUpdatesList({entries, knownIssues}) {
  const byId = new Map(knownIssues.map(issue => [issue.id, issue]));
  return entries.map(entry => {
    const issues = (entry.issues || []).map(id => byId.get(id));
    return '<article class="update" id="' + esc(entry.id) + '" aria-labelledby="' + esc(entry.id) + '-title">\n'
      + '  <h3 id="' + esc(entry.id) + '-title"><a href="#' + esc(entry.id) + '">' + esc(entry.title) + '</a></h3>\n'
      + '  <p class="update-meta"><time datetime="' + entry.date + '">' + formatDate(entry.date) + '</time> &middot; ' + releaseHtml(entry) + '</p>\n'
      + '  <p>' + esc(entry.summary) + '</p>\n'
      + (entry.points.length ? '  <ul>\n' + entry.points.map(p => '    <li>' + esc(p) + '</li>\n').join('') + '  </ul>\n' : '')
      + (entry.help.length ? '  ' + helpLinks(entry.help) + '\n' : '')
      + (issues.length ? '  <p class="update-links">Known issues: ' + issues.map(i => '<a href="/help/#issue-' + esc(i.id) + '">' + esc(i.title) + '</a>').join(', ') + '.</p>\n' : '')
      + '</article>';
  }).join('\n');
}

export function renderIssueSummary({knownIssues}) {
  return '<ul class="issue-summary">\n' + knownIssues.map(i => '  <li><a href="/help/#issue-' + esc(i.id) + '">' + esc(i.title) + '</a> <span class="badge">' + esc(i.status) + '</span> <span class="muted">Last verified <time datetime="' + i.verified + '">' + i.verified + '</time></span></li>\n').join('') + '</ul>';
}

export function renderKnownIssues({knownIssues}) {
  return knownIssues.map(i => '<article class="issue" id="issue-' + esc(i.id) + '" aria-labelledby="issue-' + esc(i.id) + '-title">\n'
    + '  <h3 id="issue-' + esc(i.id) + '-title">' + esc(i.title) + '</h3>\n'
    + '  <dl class="issue-facts">\n'
    + '    <dt>Affected devices</dt><dd>' + esc(i.devices) + '</dd>\n'
    + '    <dt>Browsers</dt><dd>' + esc(i.browsers) + '</dd>\n'
    + '    <dt>Models</dt><dd>' + esc(i.models) + '</dd>\n'
    + '    <dt>What you see</dt><dd>' + esc(i.symptom) + '</dd>\n'
    + '    <dt>Status</dt><dd><span class="badge">' + esc(i.status) + '</span></dd>\n'
    + '    <dt>Last verified</dt><dd><time datetime="' + i.verified + '">' + formatDate(i.verified) + '</time>' + (i.verifiedNote ? ' <span class="muted">(' + esc(i.verifiedNote) + ')</span>' : '') + '</dd>\n'
    + '    <dt>Workaround</dt><dd>' + esc(i.workaround) + '</dd>\n'
    + '  </dl>\n'
    + (i.help.length ? '  ' + helpLinks(i.help) + '\n' : '')
    + '</article>').join('\n');
}

// ---- RSS ---------------------------------------------------------------------------------------------------------------------------------
export function renderRss({entries}, origin) {
  const newest = entries[0].date;
  const items = entries.map(entry => {
    const text = entry.summary + (entry.points.length ? ' ' + entry.points.join(' ') : '');
    return '    <item>\n'
      + '      <title>' + xmlEsc(entry.title) + '</title>\n'
      + '      <link>' + origin + '/updates/#' + xmlEsc(entry.id) + '</link>\n'
      + '      <guid isPermaLink="true">' + origin + '/updates/#' + xmlEsc(entry.id) + '</guid>\n'
      + '      <pubDate>' + rfc822(entry.date) + '</pubDate>\n'
      + '      <description>' + xmlEsc(releaseText(entry) + '. ' + text) + '</description>\n'
      + '    </item>\n';
  }).join('');
  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n'
    + '  <channel>\n'
    + '    <title>Private Local Chat updates</title>\n'
    + '    <link>' + origin + '/updates/</link>\n'
    + '    <description>Dated, user-readable notes about what changed in Private Local Chat.</description>\n'
    + '    <language>en</language>\n'
    + '    <lastBuildDate>' + rfc822(newest) + '</lastBuildDate>\n'
    + '    <atom:link href="' + origin + '/updates/rss.xml" rel="self" type="application/rss+xml"/>\n'
    + items
    + '  </channel>\n'
    + '</rss>\n';
}

// ---- sitemap ------------------------------------------------------------------------------------------------------------------------------
export function renderSitemap(urls) {
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + urls.map(u => '  <url>\n    <loc>' + xmlEsc(u.loc) + '</loc>\n    <lastmod>' + u.lastmod + '</lastmod>\n  </url>\n').join('')
    + '</urlset>\n';
}
export const pageLastUpdated = (html, fallback) => /class="last-updated" datetime="(\d{4}-\d{2}-\d{2})"/.exec(html)?.[1] || fallback;

// ---- regions ------------------------------------------------------------------------------------------------------------------------------
function navList(page, config, prefix, pages = PAGES) {
  const items = pages.map(p => '<li><a href="' + p.path + '"' + (p.name === page ? ' aria-current="page"' : '') + '>' + p.title + '</a></li>');
  if (config.discussionsUrl) items.push('<li><a href="/help/#community">Community</a></li>');
  return '<ul class="' + prefix + '">\n' + items.map(i => '  ' + i + '\n').join('') + '</ul>';
}

const REGIONS = {
  'site-nav': ({page, config, pages}) => navList(page, config, 'site-nav-list', pages),
  'footer-nav': ({page, config, pages}) => navList(page, config, 'footer-nav-list', pages),
  'toc-community': ({config}) => config.discussionsUrl ? '<li><a href="#community">Community</a></li>' : '',
  'contact-email': ({config}) => {
    if (!config.supportEmail) return '';
    const who = config.supportOwner ? ', monitored by ' + esc(config.supportOwner) : '';
    return '<div class="contact-card">\n'
      + '  <h3>Email the project team</h3>\n'
      + '  <p><a class="button primary" href="mailto:' + esc(config.supportEmail) + '?subject=Private%20Local%20Chat">Email the project team</a></p>\n'
      + '  <p>Your message goes to <strong>' + esc(config.supportEmail) + '</strong>' + who + '. Use it for questions and help you would rather not post publicly. Leave out API keys and private conversations.</p>\n'
      + '</div>';
  },
  community: ({config}) => {
    if (!config.discussionsUrl) return '';
    return '<section id="community" aria-labelledby="community-title">\n'
      + '  <h2 id="community-title">Community</h2>\n'
      + '  <p>Ask questions, share tips and uses, suggest ideas and read announcements in the project\'s discussion space.</p>\n'
      + '  <p><a class="button primary" href="' + esc(config.discussionsUrl) + '" target="_blank" rel="noopener">Open the discussions</a></p>\n'
      + '  <p>Discussions are public. Leave out API keys and private conversations.' + (config.discussionsOwner ? ' Looked after by ' + esc(config.discussionsOwner) + '.' : '') + (config.verifiedOn ? ' Link checked on ' + formatDate(config.verifiedOn) + '.' : '') + '</p>\n'
      + '</section>';
  },
  'about-community': ({config}) => config.discussionsUrl ? '<p>Questions, tips and ideas are welcome in the <a href="/help/#community">project community</a>.</p>' : '',
  // The licence line every page ends with: source, the GPL text and the notices are all served from this site as well as from GitHub.
  // the licence line every page ends with, and, only when the site's configuration names one, the organisation it belongs to
  'footer-source': ({config}) => '<p><a href="/">Open Private Local Chat</a> &middot; <a href="' + REPO_URL + '" target="_blank" rel="noopener">Source on GitHub</a> (GNU General Public License, version 3) &middot; <a href="/LICENSE">Licence</a> &middot; <a href="/THIRD-PARTY-NOTICES.md">Notices</a></p>'
    + (config.umbrella ? '\n<p>Private Local Chat is part of <a href="' + esc(config.umbrella.url) + '">' + esc(config.umbrella.name) + '</a>.</p>' : ''),
  'licence-source': () => '<section id="licence" aria-labelledby="licence-title">\n'
    + '  <h2 id="licence-title">Licence and source</h2>\n'
    + '  <p class="prose">Private Local Chat is released under the <a href="/LICENSE">GNU General Public License, version 3</a> (GPL-3.0). The complete corresponding source is the GitHub repository <a href="' + REPO_URL + '" target="_blank" rel="noopener">johnbenac/privatelocalchat</a>. The optional voice program is bundled from open-source packages and can be rebuilt from the scripts in <code>ops/voice</code> in that repository, as described in <code>docs/VOICE-RUNTIME.md</code>. It contains eSpeak NG, whose source is at <a href="https://github.com/espeak-ng/espeak-ng" target="_blank" rel="noopener">https://github.com/espeak-ng/espeak-ng</a>. The <a href="/THIRD-PARTY-NOTICES.md">third-party notices</a> list every bundled component, its licence and its source.</p>\n'
    + '</section>',
  'hosting-logs': ({config}) => config.hostingLogs ? '<p>Retention noted by the project owner: ' + esc(config.hostingLogs) + '</p>' : '',
  'updates-list': ({data}) => renderUpdatesList(data),
  'known-issues': ({data}) => renderKnownIssues(data),
  'known-issues-summary': ({data}) => renderIssueSummary(data),
  'last-updated': ({data}) => { const date = data.entries[0]?.date ?? data.knownIssues.map(i => i.verified).sort().at(-1); return '<p class="page-meta">Last updated: <time class="last-updated" datetime="' + date + '">' + date + '</time></p>'; }
};
const REGION = /<!--plc:([a-z-]+)-->([\s\S]*?)<!--\/plc:\1-->/g;

/** Fills the regions of one page. Throws on a region nobody renders, so a typo cannot silently leave a page empty. */
export function renderPage(page, source, {config = EMPTY_CONFIG, data, pages = PAGES}) {
  return source.replace(REGION, (_, name) => {
    const render = REGIONS[name];
    if (!render) throw new Error('Unknown region "' + name + '" in the ' + page + ' page');
    const body = render({page, config, data, pages});
    return '<!--plc:' + name + '-->' + (body ? '\n' + body + '\n' : '') + '<!--/plc:' + name + '-->';
  });
}

// ---- references ---------------------------------------------------------------------------------------------------------------------------
export const releaseRewrite = (html, releasePath) => html.replace(/(href|src)="\/(chat|runtime)\//g, '$1="/' + releasePath + '/$2/');
const ASSET = /\b(?:href|src)="(\/[^"#?]*\.(?:css|mjs|js|png|svg|ico|xml|webmanifest|json))"/g;
/** Every stylesheet, script, image and feed a page names must exist in the output. */
export async function assertAssetsExist(html, outDir, label) {
  for (const [, ref] of html.matchAll(ASSET)) {
    try { await access(path.join(outDir, ref)); } catch { throw new Error(label + ' refers to ' + ref + ', which is not in the build output'); }
  }
}

/** The pages of the site directory that exist, in the fixed order. */
export async function pagesPresent(siteDir) {
  const found = [];
  for (const page of PAGES) { try { await access(path.join(siteDir, 'pages', page.name, 'index.html')); found.push(page); } catch { /* this site has no such page */ } }
  return found;
}

/**
 * Everything the build adds for the public site, from a site directory. `origin` is the public address of the site (its manifest's `site.url`, without the trailing slash) or null:
 * without it there is no sitemap, no robots.txt and no feed. Returns the sitemap entries.
 */
export async function buildPublicSite({siteDir, outDir, releasePath, config, rootLastmod, origin = null, contentDir = CONTENT_DIR}) {
  const pages = await pagesPresent(siteDir);
  const data = await loadData({siteDir, contentDir});
  const urls = origin ? [{loc: origin + '/', lastmod: rootLastmod}] : [];
  const written = [];
  for (const page of pages) await mkdir(path.join(outDir, page.name), {recursive: true});
  const hasUpdates = pages.some(p => p.name === 'updates') && data.entries.length > 0;
  if (hasUpdates && origin) { await mkdir(path.join(outDir, 'updates'), {recursive: true}); await writeFile(path.join(outDir, 'updates/rss.xml'), renderRss(data, origin)); }
  for (const page of pages) {
    const source = await readFile(path.join(siteDir, 'pages', page.name, 'index.html'), 'utf8');
    const html = releaseRewrite(renderPage(page.name, source, {config, data, pages}), releasePath);
    await assertAssetsExist(html, outDir, page.path);
    await writeFile(path.join(outDir, page.name, 'index.html'), html);
    written.push(page.name);
    if (origin) urls.push({loc: origin + page.path, lastmod: page.name === 'updates' ? data.entries[0].date : pageLastUpdated(html, rootLastmod)});
  }
  if (origin) { await writeFile(path.join(outDir, 'sitemap.xml'), renderSitemap(urls)); await writeFile(path.join(outDir, 'robots.txt'), robotsTxt(origin)); }
  return {urls, pages: written};
}

// ---- command ------------------------------------------------------------------------------------------------------------------------------
//   node scripts/public-site.mjs sync [site directory]   rewrites the generated regions of that site's pages (default: run-kit) with the site's own configuration
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname) && process.argv[2] === 'sync') {
  const siteDir = path.resolve(process.argv[3] || 'run-kit');
  const pages = await pagesPresent(siteDir);
  const data = await loadData({siteDir});
  // the committed regions hold the rendering with the site's own configuration (none for a site that has no site-config.json, as in run-kit/)
  const config = await access(path.join(siteDir, 'site-config.json')).then(() => loadSiteConfig(path.join(siteDir, 'site-config.json')), () => EMPTY_CONFIG);
  for (const page of pages) {
    const file = path.join(siteDir, 'pages', page.name, 'index.html');
    await writeFile(file, renderPage(page.name, await readFile(file, 'utf8'), {config, data, pages}));
    console.log('synced ' + file);
  }
}
