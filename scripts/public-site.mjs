// The public documents (Help, About, Privacy, Updates): rendering, sitemap, robots.txt and the RSS feed.
// Used by scripts/build.mjs, by tests/public-site.test.mjs and, as a command, to refresh the committed sources:
//   node scripts/public-site.mjs sync     rewrites the generated regions of the source pages with the default (unconfigured) output
//
// The pages are plain HTML files in help/, about/, privacy/ and updates/. Parts that depend on data are wrapped in region markers,
//   <!--plc:name--> ... <!--/plc:name-->
// and the build replaces what is between them. The committed pages hold the unconfigured rendering, so they are complete documents
// as they stand, and a test fails when they drift from updates/entries.json.
import {readFile, writeFile, access, mkdir} from 'node:fs/promises';
import path from 'node:path';

export const SITE_ORIGIN = 'https://privatelocal.chat';
export const REPO_URL = 'https://github.com/johnbenac/privatelocalchat';
export const ISSUES_URL = REPO_URL + '/issues/new/choose';
export const PAGES = Object.freeze([
  {name: 'help', title: 'Help', path: '/help/'},
  {name: 'about', title: 'About', path: '/about/'},
  {name: 'privacy', title: 'Privacy', path: '/privacy/'},
  {name: 'updates', title: 'Updates', path: '/updates/'}
]);
export const CONFIG_KEYS = Object.freeze(['supportEmail', 'supportOwner', 'discussionsUrl', 'discussionsOwner', 'verifiedOn', 'demo', 'hostingLogs']);
export const EMPTY_CONFIG = Object.freeze(Object.fromEntries(CONFIG_KEYS.map(key => [key, null])));

// robots.txt. The policy served by the live site at the edge (and any content-signal rules it carries) could not be read when this was
// written, so this keeps the plain "allow everything" policy and adds the sitemap line. The owner must compare it with the live file.
export const ROBOTS_TXT = 'User-agent: *\nAllow: /\n\nSitemap: ' + SITE_ORIGIN + '/sitemap.xml\n';

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
  return config;
}

/** The part of the configuration the running app may read (window.SITE_CONFIG). */
export const clientConfig = config => ({supportEmail: config.supportEmail, supportOwner: config.supportOwner, discussionsUrl: config.discussionsUrl});
/** A script element carrying it. "<" is escaped so the value can never end the element early. */
export const siteConfigScript = config => '<script>window.SITE_CONFIG=' + JSON.stringify(clientConfig(config)).replace(/</g, '\\u003c') + ';</script>';

// ---- updates and known issues: one source ---------------------------------------------------------------------------------------------
export async function loadEntries(file = 'updates/entries.json') { return checkEntries(JSON.parse(await readFile(file, 'utf8'))); }
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
export function renderRss({entries}) {
  const newest = entries[0].date;
  const items = entries.map(entry => {
    const text = entry.summary + (entry.points.length ? ' ' + entry.points.join(' ') : '');
    return '    <item>\n'
      + '      <title>' + xmlEsc(entry.title) + '</title>\n'
      + '      <link>' + SITE_ORIGIN + '/updates/#' + xmlEsc(entry.id) + '</link>\n'
      + '      <guid isPermaLink="true">' + SITE_ORIGIN + '/updates/#' + xmlEsc(entry.id) + '</guid>\n'
      + '      <pubDate>' + rfc822(entry.date) + '</pubDate>\n'
      + '      <description>' + xmlEsc(releaseText(entry) + '. ' + text) + '</description>\n'
      + '    </item>\n';
  }).join('');
  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n'
    + '  <channel>\n'
    + '    <title>Private Local Chat updates</title>\n'
    + '    <link>' + SITE_ORIGIN + '/updates/</link>\n'
    + '    <description>Dated, user-readable notes about what changed in Private Local Chat.</description>\n'
    + '    <language>en</language>\n'
    + '    <lastBuildDate>' + rfc822(newest) + '</lastBuildDate>\n'
    + '    <atom:link href="' + SITE_ORIGIN + '/updates/rss.xml" rel="self" type="application/rss+xml"/>\n'
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
function navList(page, config, prefix) {
  const items = PAGES.map(p => '<li><a href="' + p.path + '"' + (p.name === page ? ' aria-current="page"' : '') + '>' + p.title + '</a></li>');
  if (config.discussionsUrl) items.push('<li><a href="/help/#community">Community</a></li>');
  return '<ul class="' + prefix + '">\n' + items.map(i => '  ' + i + '\n').join('') + '</ul>';
}

const REGIONS = {
  'site-nav': ({page, config}) => navList(page, config, 'site-nav-list'),
  'footer-nav': ({page, config}) => navList(page, config, 'footer-nav-list'),
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
  'footer-source': () => '<p><a href="/">Open Private Local Chat</a> &middot; <a href="' + REPO_URL + '" target="_blank" rel="noopener">Source on GitHub</a> (GNU General Public License, version 3) &middot; <a href="/LICENSE">Licence</a> &middot; <a href="/THIRD-PARTY-NOTICES.md">Notices</a></p>\n<p>Private Local Chat is part of <a href="https://aiofourown.com/">AI of Our Own</a>.</p>',
  'licence-source': () => '<section id="licence" aria-labelledby="licence-title">\n'
    + '  <h2 id="licence-title">Licence and source</h2>\n'
    + '  <p class="prose">Private Local Chat is released under the <a href="/LICENSE">GNU General Public License, version 3</a> (GPL-3.0). The complete corresponding source is the GitHub repository <a href="' + REPO_URL + '" target="_blank" rel="noopener">johnbenac/privatelocalchat</a>. The optional voice program is bundled from open-source packages and can be rebuilt from the scripts in <code>ops/voice</code> in that repository, as described in <code>docs/VOICE-RUNTIME.md</code>. It contains eSpeak NG, whose source is at <a href="https://github.com/espeak-ng/espeak-ng" target="_blank" rel="noopener">https://github.com/espeak-ng/espeak-ng</a>. The <a href="/THIRD-PARTY-NOTICES.md">third-party notices</a> list every bundled component, its licence and its source.</p>\n'
    + '</section>',
  'hosting-logs': ({config}) => config.hostingLogs ? '<p>Retention noted by the project owner: ' + esc(config.hostingLogs) + '</p>' : '',
  'updates-list': ({data}) => renderUpdatesList(data),
  'known-issues': ({data}) => renderKnownIssues(data),
  'known-issues-summary': ({data}) => renderIssueSummary(data),
  'last-updated': ({data}) => '<p class="page-meta">Last updated: <time class="last-updated" datetime="' + data.entries[0].date + '">' + data.entries[0].date + '</time></p>'
};
const REGION = /<!--plc:([a-z-]+)-->([\s\S]*?)<!--\/plc:\1-->/g;

/** Fills the regions of one page. Throws on a region nobody renders, so a typo cannot silently leave a page empty. */
export function renderPage(page, source, {config = EMPTY_CONFIG, data}) {
  return source.replace(REGION, (_, name) => {
    const render = REGIONS[name];
    if (!render) throw new Error('Unknown region "' + name + '" in the ' + page + ' page');
    const body = render({page, config, data});
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

/** Everything the build adds for the public site. Returns the sitemap entries. */
export async function buildPublicSite({root = process.cwd(), outDir, releasePath, config, rootLastmod}) {
  const data = await loadEntries(path.join(root, 'updates/entries.json'));
  const urls = [{loc: SITE_ORIGIN + '/', lastmod: rootLastmod}];
  const written = [];
  for (const page of PAGES) await mkdir(path.join(outDir, page.name), {recursive: true});
  await writeFile(path.join(outDir, 'updates/rss.xml'), renderRss(data));
  for (const page of PAGES) {
    const source = await readFile(path.join(root, page.name, 'index.html'), 'utf8');
    const html = releaseRewrite(renderPage(page.name, source, {config, data}), releasePath);
    await assertAssetsExist(html, outDir, page.path);
    await writeFile(path.join(outDir, page.name, 'index.html'), html);
    written.push(page.name);
    urls.push({loc: SITE_ORIGIN + page.path, lastmod: page.name === 'updates' ? data.entries[0].date : pageLastUpdated(html, rootLastmod)});
  }
  await writeFile(path.join(outDir, 'sitemap.xml'), renderSitemap(urls));
  await writeFile(path.join(outDir, 'robots.txt'), ROBOTS_TXT);
  return {urls, pages: written};
}

// ---- command ------------------------------------------------------------------------------------------------------------------------------
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname) && process.argv[2] === 'sync') {
  const data = await loadEntries();
  for (const page of PAGES) {
    const file = page.name + '/index.html';
    await writeFile(file, renderPage(page.name, await readFile(file, 'utf8'), {config: EMPTY_CONFIG, data}));
    console.log('synced ' + file);
  }
}
