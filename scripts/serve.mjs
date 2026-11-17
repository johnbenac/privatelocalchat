#!/usr/bin/env node
// Serves a build of the app, with the headers the build declares (docs/RUN-IT.md).
//
//   node scripts/serve.mjs [--dir DIR] [--host H] [--port N]       (PORT, HOST and SERVE_DIR in the environment work too)
//   node serve.mjs --root R [--host H] [--port N]                  serves the live release of an operator folder
//   node serve.mjs --root R --upgrade SRC [--sha256 HEX] [--force] | --rollback [VERSION] | --check [--deep] [--online] | --prune [--keep N]
//   node serve.mjs --help                                          lists every option
//
// DIR is a folder that holds a build: `./app` if it exists (the release layout), else `./dist`. It must hold the build's `_headers`, which is applied to every response, so what this
// server sends is what the build declared (scripts/headers.mjs). It listens on 127.0.0.1 unless told otherwise. It logs nothing about requests.
//
// Files are streamed, so a multi-gigabyte model file costs no memory; HEAD, Range and If-None-Match are supported. A directory request is resolved the way Cloudflare Pages does
// it: /help/ serves help/index.html and /help is sent to /help/. Like Pages it asks browsers to revalidate everything that a rule does not say otherwise about.
import {createServer} from 'node:http';
import {createReadStream,statSync} from 'node:fs';
import {stat,readFile,realpath as fsRealpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parsePagesHeaders,headersFor} from './headers.mjs';

const TYPES = {'.html':'text/html; charset=utf-8','.js':'application/javascript','.mjs':'application/javascript','.wasm':'application/wasm','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.txt':'text/plain; charset=utf-8','.xml':'application/xml','.md':'text/markdown; charset=utf-8','.gguf':'application/octet-stream','.bin':'application/octet-stream','.onnx':'application/octet-stream','.npz':'application/octet-stream'};
const typeOf = (file, root) => file === path.join(root, 'updates', 'rss.xml') ? 'application/rss+xml' : path.basename(file) === 'LICENSE' ? 'text/plain; charset=utf-8' : TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';

/** The part of a Range header this server answers: one byte range. null means "send everything" (no header, or a form it does not take); 'bad' means unsatisfiable. */
export function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header || '').trim());
  if (!m || (m[1] === '' && m[2] === '')) return null;
  let start, end;
  if (m[1] === '') { const n = Number(m[2]); if (n === 0) return 'bad'; start = Math.max(0, size - n); end = size - 1; }
  else { start = Number(m[1]); end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1); }
  if (start >= size || start > end) return 'bad';
  return {start, end};
}

/**
 * Starts the server. Resolves { server, port, root }. `dir` serves one build folder. `root` serves an operator folder: each request is answered from its live release, with the operator's
 * settings, pages and models laid over it (overlay.mjs). `warn` takes the lines the operator's files cause while it runs; the default is standard error.
 */
export async function startServer({dir, root: operatorRoot, host = '127.0.0.1', port = 0, quiet = false, warn} = {}) {
  let contextOf, shown;
  if (operatorRoot !== undefined) {
    if (dir !== undefined) throw new Error('Give either dir (one build) or root (an operator folder), not both.');
    const view = (await import('./overlay.mjs')).openRoot(operatorRoot, warn ? {warn} : {});
    await view.init();
    contextOf = () => view.context();
    shown = view.root;
  } else {
    const root = path.resolve(dir);
    let rules;
    try { rules = parsePagesHeaders(await readFile(path.join(root, '_headers'), 'utf8')); }
    catch (error) { throw new Error(`${root} is not a build: it has no _headers file (${error.code || error.message}). Build first, or point --dir at the folder that holds the build.`); }
    const context = {appDir: root, rules};
    contextOf = async () => context;
    shown = root;
  }
  const send = (res, status, headers, body = '') => { res.writeHead(status, headers); res.end(body); };
  const REVALIDATE = {'Cache-Control': 'public, max-age=0, must-revalidate'};
  const within = (base, file) => file === base || file.startsWith(base + path.sep);
  // What a path names under `base`: { file, info }, { redirect: true } for a directory asked for without its slash, or null. With `contained`, a symlink that leaves `base` is refused.
  const lookup = async (base, segments, pathname, {index = true, contained = false} = {}) => {
    let file = path.resolve(base, ...segments);
    if (!within(base, file)) return null;
    const realBase = contained ? await fsRealpath(base).catch(() => null) : null;
    const inside = async (f) => { if (!contained) return true; const real = realBase && await fsRealpath(f).catch(() => null); return Boolean(real) && within(realBase, real); };
    let info = await stat(file).catch(() => null);
    if (info && !(await inside(file))) return null;
    if (info?.isDirectory()) {
      if (!pathname.endsWith('/')) return {redirect: true};
      if (!index) return null;
      file = path.join(file, 'index.html');
      info = await stat(file).catch(() => null);
      if (info && !(await inside(file))) return null;
    }
    return info?.isFile() ? {file, info} : null;
  };

  const server = createServer(async (req, res) => {
    try {
      const ctx = await contextOf();
      const {appDir, rules} = ctx;
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, {...headersFor(rules, '/'), Allow: 'GET, HEAD'}, 'Method not allowed');
      const search = new URL(req.url, 'http://local').search;
      let pathname;
      try { pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname); } catch { return send(res, 400, headersFor(rules, '/'), 'Bad request'); }
      if (pathname.includes('\0') || pathname.includes('\\')) return send(res, 400, headersFor(rules, '/'), 'Bad request');
      const ruleHeaders = {...REVALIDATE, ...headersFor(rules, pathname)};
      // the file the request names, kept inside its folder: normalised first, then checked
      const norm = path.posix.normalize('/' + pathname);
      const segments = norm.split('/').slice(1);
      if (ctx.page && (norm === '/' || norm === '/index.html')) {
        const rewritten = await ctx.page();
        if (rewritten) {
          const headers = {'Content-Type': 'text/html; charset=utf-8', ETag: rewritten.etag, ...ruleHeaders};
          if (req.headers['if-none-match'] === rewritten.etag) return send(res, 304, headers);
          res.writeHead(200, {...headers, 'Content-Length': rewritten.body.length});
          return res.end(req.method === 'HEAD' ? undefined : rewritten.body);
        }
      }
      let hit = null;
      if (ctx.modelsDir && segments[0] === 'models') hit = await lookup(ctx.modelsDir, segments.slice(1), pathname, {index: false, contained: true});
      else if (ctx.pagesDir && ctx.pageOk(segments[0])) hit = await lookup(ctx.pagesDir, segments, pathname, {contained: true});
      if (!hit && !(ctx.modelsDir && segments[0] === 'models')) hit = await lookup(appDir, segments, pathname);
      if (hit?.redirect) return send(res, 308, {...ruleHeaders, Location: pathname + '/' + search});
      if (!hit) {
        const body = await readFile(path.join(appDir, '404.html')).catch(() => Buffer.from('Not found'));
        return send(res, 404, {...ruleHeaders, 'Content-Type': 'text/html; charset=utf-8'}, req.method === 'HEAD' ? '' : body);
      }
      const {file, info} = hit;
      const etag = `W/"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;
      const headers = {'Content-Type': typeOf(file, appDir), 'Last-Modified': info.mtime.toUTCString(), ETag: etag, 'Accept-Ranges': 'bytes', ...ruleHeaders};
      if (req.headers['if-none-match'] === etag) return send(res, 304, headers);
      const range = parseRange(req.headers.range, info.size);
      if (range === 'bad') return send(res, 416, {...headers, 'Content-Range': `bytes */${info.size}`});
      const start = range ? range.start : 0, end = range ? range.end : info.size - 1;
      headers['Content-Length'] = info.size === 0 ? 0 : end - start + 1;
      if (range) headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`;
      res.writeHead(range ? 206 : 200, headers);
      if (req.method === 'HEAD' || info.size === 0) return res.end();
      createReadStream(file, {start, end}).on('error', () => res.destroy()).pipe(res);
    } catch { try { send(res, 500, {}, 'Server error'); } catch { /* the connection is gone */ } }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
  if (!quiet) console.log(`Serving ${shown} at http://${host}:${server.address().port}`);
  return {server, port: server.address().port, root: shown};
}

const isFolder = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };

// The options of an operator folder (docs/RUN-IT.md) are read by operator.mjs; without them the server behaves as it always did.
const OPERATOR_OPTIONS = ['--root', '--upgrade', '--sha256', '--force', '--rollback', '--check', '--deep', '--online', '--prune', '--keep'];

const USAGE = `Usage:
  node serve.mjs [--dir DIR] [--host H] [--port N]     serve one build (default ./app, else ./dist) on 127.0.0.1:18171
  node serve.mjs --root R [--host H] [--port N]        serve the live release of an operator folder, with its settings, pages and models
  node serve.mjs --root R --upgrade SRC [--sha256 HEX] [--force]
                                                       install a release (a zip with its SHA256SUMS, or an unpacked folder) and make it live
  node serve.mjs --root R --rollback [VERSION]         go back to the release before, or to a named installed one
  node serve.mjs --root R --check [--deep] [--online]  check the folder; --deep also hashes model files, --online asks for the newest release
  node serve.mjs --root R --prune [--keep N]           remove the oldest installed releases (default keep 3; never the live one or the one before it)

In an operator folder, node plc.mjs takes the same options without --root.
PORT, HOST and SERVE_DIR in the environment work too. The server logs nothing about requests. See docs/RUN-IT.md.`;

function cli(argv) {
  if (argv.includes('--help') || argv.includes('-h')) { console.log(USAGE); return; }
  if (argv.some((a) => OPERATOR_OPTIONS.includes(a))) {
    import('./operator.mjs').then((m) => m.runCli(argv, {startServer})).then((code) => { if (code !== null) process.exitCode = code; });
    return;
  }
  const opt = (name) => { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : null; };
  const host = opt('host') || process.env.HOST || '127.0.0.1';
  const port = Number(opt('port') || process.env.PORT || 18171);
  const dir = opt('dir') || process.env.SERVE_DIR || (isFolder('app') ? 'app' : 'dist');
  startServer({dir, host, port}).then(() => {
    if (!['127.0.0.1', 'localhost', '::1'].includes(host)) console.log(`This copy is reachable from the network at ${host}. Browsers only allow the app's features on localhost or over https, so put https in front of it for other devices (docs/RUN-IT.md).`);
  }).catch((error) => { console.error(error.message); process.exit(1); });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) cli(process.argv.slice(2));
