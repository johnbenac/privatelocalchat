import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// A browser with JavaScript off (or blocking the app's scripts) used to show a dead page: static emoji icons, a menu that does nothing and no
// message, because every message the app can show is itself JavaScript. The only way to say so is <noscript>.
test('index.html explains what to do when JavaScript is off', async () => {
 const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
 const body = html.slice(html.indexOf('<body>'));
 const notice = /<noscript>([\s\S]*?)<\/noscript>/.exec(body)?.[1] || '';
 assert.match(notice, /id="noScriptNotice"/);
 assert.match(notice, /JavaScript is turned off/);
 assert.match(notice, /Settings[^<]*Safari[^<]*Advanced[^<]*JavaScript/);
 assert.ok(html.indexOf('<noscript>') > html.indexOf('<body>'), 'the notice must be inside <body>');
});
