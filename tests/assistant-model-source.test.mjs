// The assistant's answer about downloads names the model source this copy is configured with (docs/APP-CONFIG.md), the same words as the Settings row, never a host fixed in the text.
import './helpers/install-app-config.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildAppConfig,appConfig} from '../runtime/config/app-config.mjs';
import {sourceLabelAndHost} from '../chat/models/source-notice.mjs';
import {NODES} from '../chat/roberta/ivr-content.mjs';

const DEFAULTS=JSON.parse(readFileSync(new URL('../app-config.json',import.meta.url),'utf8'));
const SHIPPED_HOST=new URL(DEFAULTS.modelSources[0].base).host;
const install=override=>{globalThis.APP_CONFIG=buildAppConfig(DEFAULTS,override);};
const src=base=>({format:'plc-app-config/1',modelSources:[{id:'mine',label:'Lab mirror',base}]});
const say=()=>NODES['privacy.cloud'].say({mode:'local'}).join(' ');
// the old way: a host written into the text
const hardCoded=()=>`The app comes from the address you opened it from, and the model files are downloaded once, from Private Local Chat project CDN (${SHIPPED_HOST}).`;

test('shipped source: the sentence names its label and host as the Settings row does', () => {
  install(null);
  const where=sourceLabelAndHost(appConfig());
  assert.equal(where,`${DEFAULTS.modelSources[0].label} (${SHIPPED_HOST})`);
  assert.ok(say().includes(`The app comes from the address you opened it from, and the model files are downloaded once, from ${where}.`));
});

test('an operator https source: the sentence names it and not the shipped host', () => {
  install(src('https://models.lab.example/files/'));
  assert.ok(say().includes('from Lab mirror (models.lab.example).'));
  assert.ok(!say().includes(SHIPPED_HOST));
  assert.ok(!say().includes(hardCoded()),'a sentence that hard-codes the project host is not what is said');
  assert.ok(hardCoded().includes(SHIPPED_HOST),'the control does contain the shipped host, so the check above can fail');
});

test('a path source on this host: the sentence says what the Settings row says', () => {
  install(src('/models/'));
  assert.equal(sourceLabelAndHost(appConfig()),'Lab mirror (this host)');
  assert.ok(say().includes('from Lab mirror (this host).'));
  assert.ok(!say().includes(SHIPPED_HOST));
});

test('no configured source: a plain sentence, no host', () => {
  globalThis.APP_CONFIG=undefined;
  assert.match(say(),/from the source set for this copy\./);
});

test('outside-provider answer and the Settings row text are untouched', () => {
  install(null);
  assert.match(NODES['privacy.cloud'].say({mode:'api'}).join(' '),/outside provider, so the messages/);
  const page=readFileSync(new URL('../chat/shell/models-page.mjs',import.meta.url),'utf8');
  assert.ok(page.includes('row("Model files come from", sourceLabelAndHost(cfg) + (cfg.isDefaultSource() ? "" : ", set by whoever runs this copy"), null)'));
});
