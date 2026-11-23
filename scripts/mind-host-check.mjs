// OPTIONAL, not part of npm test: drive the conversation screen against a REAL Sonalon host started as child processes (a scripted model, no network), in Chromium.
//   node scripts/mind-host-check.mjs [<sonalon checkout>]      default /var/lib/cosmoshot/stt-exec/t952/sonalon (node 20.19.6; the checkout's own node_modules)
// It writes a run configuration (a copy of the checkout's tests/support/host-node-run-config.mjs with its imports made absolute and the page's origin set) into a temporary folder, starts the host and its
// body process the way that checkout's own runner does, serves this app on a loopback port, and walks: setup, Check, send, the five receipts, whatever she says. It reports exactly what happened.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { launch } from '../tests/e2e/harness.mjs';

const repo = path.resolve(process.argv[2] || '/var/lib/cosmoshot/stt-exec/t952/sonalon');
const PORT = 18461;
const origin = `http://127.0.0.1:${PORT}`;
const dir = mkdtempSync(path.join(tmpdir(), 'mind-host-check-'));
const fixture = { resident: 'individual:room-1-resident', encounter: 'enc:plc:real-1', admitted: ['p:plc:tester-1'], limit: 2000 };
const url = (p) => 'file://' + path.join(repo, p);
let cfg = readFileSync(path.join(repo, 'tests/support/host-node-run-config.mjs'), 'utf8')
  .replace('"../../fabric/tests/integration/rig.mjs"', JSON.stringify(url('fabric/tests/integration/rig.mjs')))
  .replace('"./test-scenes.mjs"', JSON.stringify(url('tests/support/test-scenes.mjs')))
  .replace('"../../fabric/mind/provider/mock.mjs"', JSON.stringify(url('fabric/mind/provider/mock.mjs')))
  .replace('"../../fabric/mind/provider/openai-compatible.mjs"', JSON.stringify(url('fabric/mind/provider/openai-compatible.mjs')))
  .replace('origin: "https://plc.example"', 'origin: ' + JSON.stringify(origin));
const cfgPath = path.join(dir, 'run-config.mjs'); writeFileSync(cfgPath, cfg);
const children = [], notes = [];
const note = (m) => { notes.push(m); console.log(m); };
function launchChild(file, args, env) {
  const child = spawn(process.execPath, [path.join(repo, file), ...args], { cwd: repo, env: { PATH: '/usr/bin:/bin', HOME: dir, TMPDIR: dir, DIR: dir, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  const lines = [], errs = []; children.push(child);
  child.stderr.on('data', (d) => errs.push(String(d)));
  createInterface({ input: child.stdout }).on('line', (l) => { try { lines.push(JSON.parse(l)); } catch { /* not a milestone */ } });
  return { child, lines, errs, wait: async (ev, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { const f = lines.find((x) => x.ev === ev); if (f) return f; if (child.exitCode !== null) throw new Error(file + ' exited before ' + ev + ': ' + errs.join('').slice(0, 800)); await sleep(100); } throw new Error('timed out waiting for ' + ev + ' ' + errs.join('').slice(0, 500)); } };
}
let t, failed = null;
try {
  const token = randomUUID();
  const h = launchChild('fabric/host-node/main.mjs', [cfgPath], { CONTROL: path.join(dir, 'ctl.sock'), MODEL: 'script', PORT: '0', TOKEN: token, MESSAGE_FIXTURE: JSON.stringify(fixture) });
  const ready = await h.wait('ready');
  const endpoint = new URL(ready.messageEndpoint);
  note('host ready: message endpoint ' + endpoint.origin + endpoint.pathname + ' (page origin allowed: ' + origin + ')');
  const body = launchChild('tests/support/host-node-body-process.mjs', [], { TOKEN: token, URL: 'ws://127.0.0.1:' + ready.port + '/', ISSUER_KEY: ready.lookup.key, SPEECH_REPORTS: '[]' });
  await h.wait('started'); note('body process started');
  t = await launch({ port: PORT });
  const { page } = t;
  await page.click('#shellPlus');
  await page.locator('.shell-pop-row', { hasText: 'Talk with a mind on this computer' }).click();
  const set = { name: 'Real host', address: endpoint.origin, resident: fixture.resident, encounter: fixture.encounter, participant: fixture.admitted[0], timeoutSeconds: 10 };
  for (const [k, v] of Object.entries(set)) await page.fill('#mind-setup-' + k, String(v));
  await page.click('.app-dialog button:has-text("Check")');
  await page.waitForFunction(() => document.getElementById('mindCheckResult').textContent || document.getElementById('mindCheckAlert').textContent);
  note('Check said: ' + await page.evaluate(() => document.getElementById('mindCheckResult').textContent + document.getElementById('mindCheckAlert').textContent));
  await page.click('.app-dialog button:has-text("Open the conversation")');
  await page.waitForSelector('#mindScreen:not([hidden])');
  const statusText = () => page.evaluate(() => [...document.querySelectorAll('#mindStatus .mind-live-text')].map((n) => n.textContent).join('').trim());
  await page.waitForFunction(() => /^Connected to /.test([...document.querySelectorAll('#mindStatus .mind-live-text')].map((n) => n.textContent).join('')), null, { timeout: 15000 });
  note('status: ' + await statusText());
  await page.fill('#mindInput', 'Hello, can you hear me?'); await page.click('#mindSend');
  await page.waitForFunction(() => document.querySelectorAll('#mindLog .mind-msg.person .mind-meter i[data-on="1"]').length === 5, null, { timeout: 30000 }).catch(() => {});
  note('receipt line: ' + await page.locator('#mindLog .mind-msg.person .mind-receipt-word').innerText() + ' (' + await page.locator('#mindLog .mind-msg.person .mind-meter i[data-on="1"]').count() + ' of 5 dots)');
  const spoke = await page.waitForSelector('#mindLog .mind-msg.mind, #mindLog .mind-msg.unasked', { timeout: 30000 }).then(() => true).catch(() => false);
  note(spoke ? 'her words: ' + JSON.stringify(await page.locator('#mindLog .mind-msg.mind .mind-text, #mindLog .mind-msg.unasked .mind-text').allInnerTexts()) : 'she said nothing within 30 s (a reply is optional)');
  note('final status: ' + await statusText());
  note('page errors: ' + (t.errors.length ? t.errors.join(' | ') : 'none'));
} catch (error) { failed = error; note('FAILED: ' + error.message); }
finally {
  await t?.close().catch(() => {});
  for (const c of children) { if (c.exitCode === null) c.kill('SIGTERM'); }
  await sleep(1500); for (const c of children) if (c.exitCode === null) c.kill('SIGKILL');
}
process.exit(failed ? 1 : 0);
