// What serve.mjs adds when it serves an operator folder (docs/RUN-IT.md): the live release, found again on every request, with the operator's own files laid over it.
//
//   current.json                    which release is live; read again when it changes, so --upgrade and --rollback take effect on the next request
//   <release>/app/_headers          the rules that apply to every answer, read again when the release or the file changes
//   config/app-config.json          replaces the window.APP_CONFIG script of the page, checked with the release's own validator
//   config/site.json                replaces the window.SITE_LINKS script of the page, checked the same way
//   pages/<name>/...                served at /<name>/..., before the release's own file
//   models/...                      served at /models/...
//
// Nothing is written to disk: the page is rewritten in memory, so the release keeps its checksums and there is no second copy to drift.
// Needs only Node.js and the files beside it (headers.mjs, operator.mjs).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {parsePagesHeaders} from './headers.mjs';
import {readCurrent} from './operator.mjs';

/** The names of the project's own pages: an operator's pages/<name> may replace these although the release holds a folder of that name. */
export const PROJECT_PAGES = Object.freeze(['help', 'about', 'privacy', 'updates']);
const PAGE_NAME = /^[a-z0-9][a-z0-9-]*$/;
const APP_SCRIPT = /<script>window\.APP_CONFIG=([\s\S]*?);<\/script>/;
const SITE_SCRIPT = /<script>window\.SITE_LINKS=([\s\S]*?);<\/script>/;
const APP_FORMAT = 'plc-app-config/1';

// What each operator file is checked with and where it goes in the page. The modules are the release's own, so a file is judged by the build that will use it.
const KINDS = [
  {name: 'app', file: ['config', 'app-config.json'], module: 'runtime/config/app-config.mjs', script: APP_SCRIPT, global: 'window.APP_CONFIG'},
  {name: 'site', file: ['config', 'site.json'], module: 'chat/site/site-links.mjs', script: SITE_SCRIPT, global: 'window.SITE_LINKS'}
];

const keyOf = (file) => { try { const s = fs.statSync(file); return `${s.size}:${s.mtimeMs}:${s.ino}`; } catch { return null; } };
const inScript = (value) => JSON.stringify(value).replace(/</g, '\\u003c'); // as scripts/build.mjs writes it

/** Opens an operator folder for serving. `init()` refuses a folder that cannot be served; `context()` is what one request is answered from. */
export function openRoot(root, {warn = (line) => process.stderr.write(line + '\n')} = {}) {
  root = path.resolve(root);
  const currentFile = path.join(root, 'current.json');
  const configDir = path.join(root, 'config');
  let seenCurrent, current = null, rel = null, chain = Promise.resolve();
  const files = Object.fromEntries(KINDS.map((k) => [k.name, {key: undefined, raw: null, text: null}]));
  let pageCache = null;
  const told = new Set();
  const noteOnce = (text) => { if (!told.has(text)) { told.add(text); warn(text); } };

  const validators = (r) => r.validators ??= (async () => {
    const out = {};
    for (const kind of KINDS) {
      const file = path.join(r.appDir, 'releases', r.commit, ...kind.module.split('/'));
      try { out[kind.name] = await import(pathToFileURL(file).href); } catch { out[kind.name] = null; }
    }
    return out;
  })();

  function refreshCurrent() {
    const key = keyOf(currentFile);
    if (key === seenCurrent && current) return false;
    seenCurrent = key;
    let next;
    try { next = readCurrent(root); } catch (error) { if (!current) throw error; warn(error.message); return false; }
    if (!next) { if (!current) throw missing(); warn(`${currentFile} has gone, so the release that was live is still served. Install a release again with --upgrade (docs/RUN-IT.md).`); return false; }
    current = next;
    if (rel && rel.releaseDir === next.releaseDir && rel.commit === next.commit) return false;
    rel = {releaseDir: next.releaseDir, appDir: next.appDir, commit: next.commit, release: next.release, rules: null, rulesKey: null, entries: null, validators: null, page: null};
    for (const f of Object.values(files)) f.key = undefined; // the files are judged again by this release's validators
    pageCache = null;
    return true;
  }
  const missing = () => new Error(`Nothing is installed in ${root}. Make the first install from an unpacked release: node serve.mjs --upgrade . --root ${root}`);

  function refreshRules() {
    const file = path.join(rel.appDir, '_headers');
    const key = keyOf(file);
    if (key !== null && key === rel.rulesKey) return;
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch (error) { throw new Error(`${rel.release} is not a build: it has no _headers file (${error.code || error.message}). Install it again with --upgrade ... --force.`); }
    rel.rules = parsePagesHeaders(text);
    rel.rulesKey = key;
  }

  async function refreshFiles(strict) {
    const mods = await validators(rel);
    for (const kind of KINDS) {
      const state = files[kind.name];
      const file = path.join(configDir, ...kind.file.slice(1));
      const key = keyOf(file);
      if (key === state.key) continue;
      state.key = key;
      if (key === null) { state.raw = null; state.text = null; continue; }
      const label = `config/${kind.file[1]}`;
      const refuse = (why) => {
        if (strict) throw new Error(`${file} cannot be used: ${why}\nFix it or remove it, then start again (docs/APP-CONFIG.md, docs/SITE-LINKS.md).`);
        warn(`${label} was changed but cannot be used, so the last good one stays in use: ${why}`);
      };
      let raw;
      try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) { refuse(`it is not valid JSON (${error.message}).`); continue; }
      const mod = mods[kind.name];
      if (!mod) { noteOnce(`${rel.release} has no ${kind.module} to check ${label} with, so that file is not applied.`); state.raw = null; state.text = null; continue; }
      const problems = (kind.name === 'app' ? mod.checkAppConfig : mod.checkSiteJson)(raw);
      if (problems.length) { refuse('\n - ' + problems.join('\n - ')); continue; }
      state.raw = raw;
      state.text = JSON.stringify(raw);
    }
  }

  /** The release's page with the operator's settings in it, or null when there is nothing to change (then the file is served as it is). */
  async function page() {
    if (!KINDS.some((k) => files[k.name].raw !== null)) return null;
    const pageFile = path.join(rel.appDir, 'index.html');
    const key = [rel.releaseDir, keyOf(pageFile), ...KINDS.map((k) => files[k.name].text)].join('|');
    if (pageCache?.key === key) return pageCache.value;
    const mods = await validators(rel);
    let html = fs.readFileSync(pageFile, 'utf8');
    let changed = false;
    for (const kind of KINDS) {
      const raw = files[kind.name].raw;
      if (raw === null) continue;
      const found = kind.script.exec(html);
      if (!found) { noteOnce(`${rel.release}'s page has no ${kind.global} script to put ${`config/${kind.file[1]}`} in, so that file is not applied. This is a different build than this server expects.`); continue; }
      let result;
      if (kind.name === 'app') {
        let shipped;
        try { shipped = JSON.parse(found[1]); } catch { shipped = null; }
        result = mods.app.buildAppConfig({format: APP_FORMAT, modelSources: shipped?.modelSources}, raw);
      } else result = mods.site.normalizedSiteLinks(raw);
      const element = `<script>${kind.global}=${inScript(result)};</script>`;
      html = html.slice(0, found.index) + element + html.slice(found.index + found[0].length);
      changed = true;
    }
    let value = null;
    if (changed) {
      const body = Buffer.from(html);
      value = {body, etag: `W/"${crypto.createHash('sha256').update(body).digest('hex').slice(0, 24)}"`};
    }
    pageCache = {key, value};
    return value;
  }

  const refresh = async (strict) => {
    refreshCurrent();
    refreshRules();
    await refreshFiles(strict);
    rel.entries ??= new Set(fs.readdirSync(rel.appDir));
    return {
      appDir: rel.appDir, rules: rel.rules, commit: rel.commit, release: rel.release,
      pagesDir: path.join(root, 'pages'), modelsDir: path.join(root, 'models'),
      // a name the operator may use for a page: not one of the release's own top-level entries, except the project's page names
      pageOk: (name) => PAGE_NAME.test(name) && name !== 'models' && (!rel.entries.has(name) || PROJECT_PAGES.includes(name)),
      page
    };
  };
  const serial = (strict) => { const run = chain.then(() => refresh(strict)); chain = run.catch(() => {}); return run; };
  return {root, init: () => serial(true), context: () => serial(false)};
}
