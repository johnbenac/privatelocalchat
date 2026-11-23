// SPDX-License-Identifier: AGPL-3.0-only
// Setting up a conversation with a mind on this computer, in one of the app's own dialogs (window.plcDialogs.open): where the host is, who the person is to it, and a Check that asks the host once.
// The same dialog is "Connection" in the thread. Nothing is sent to the host that the person did not ask for: Check asks about a message id nobody sent (a status query), which carries no words.
//
//   checkHost({ address, timeoutMs, fetch }) -> { kind, sentence }     kind: available | unavailable | unreachable | not-admitted | refused | invalid
//   validateConfig(fields) -> { ok, config, problems }
//   openSetup({ dialogs, initial, check? }) -> Promise<config | null>
import { createHttpTransport } from '../channel/http-transport.mjs';
import { COPY, DEFAULT_NAME, REACH_ONLY, blockedByBrowser, handoffUrl } from './mind-model.mjs';

const randomId = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : '00000000-0000-4000-8000-' + String(Date.now()).padStart(12, '0').slice(-12));

/** Ask the host once. A refusal is an answer (it is running and said no); no answer at all is a different thing. */
export async function checkHost({ address, timeoutMs = 15000, fetch: fetchImpl = globalThis.fetch?.bind(globalThis), page = globalThis.location } = {}) {
  const url = handoffUrl(address);
  if (!url) return { kind: 'invalid', sentence: 'That is not a web address the host could have. It should start with http:// and name the computer and the port.' };
  let records;
  try { records = await createHttpTransport({ url, fetch: fetchImpl, timeoutMs }).request({ kind: 'status-query', messageId: randomId() }); }
  catch (error) {
    if (blockedByBrowser({ pageProtocol: page?.protocol, pageHostname: page?.hostname, address, errorMessage: error?.message })) return { kind: 'blocked', sentence: COPY.blocked() + ' ' + COPY.blockedDetail() };
    return { kind: 'unreachable', sentence: COPY.unreachable(address) };
  }
  const refusal = records.find((r) => r.kind === 'refusal');
  if (refusal?.class === 'unavailable') return { kind: 'unavailable', sentence: COPY.unavailable() };
  if (refusal?.class === 'not-admitted') return { kind: 'not-admitted', sentence: COPY.notAdmitted() };
  if (refusal) return { kind: 'refused', sentence: 'The host answered, but refused the check' + (refusal.reason ? ': ' + String(refusal.reason).slice(0, 120) : '') + '. Nothing was sent.' };
  if (records.some((r) => r.kind === 'status')) return { kind: 'available', sentence: 'The host answered. Whether it knows your participant id is only learned when you send your first message.' };
  return { kind: 'refused', sentence: 'The host answered, but not in a way this app understands. Nothing was sent.' };
}

const isLoopbackHost = (h) => h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h.endsWith('.localhost');
/**
 * When this page is itself served from a plain http address on this computer, the host is most likely the same address: offer it, and when the host describes itself at /host.json
 * ({ messageEndpoint, origin, individualId, name }) use that. Anything else (another origin, no answer, a document that is not that) leaves the fields empty. Nothing is sent but a GET.
 */
export async function discoverHost({ page = globalThis.location, fetch: fetchImpl = globalThis.fetch?.bind(globalThis), timeoutMs = 2000 } = {}) {
  if (!page || page.protocol !== 'http:' || !isLoopbackHost(page.hostname)) return {};
  const found = { address: page.origin };
  try {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetchImpl(page.origin + '/host.json', { cache: 'no-store', credentials: 'omit', signal: controller.signal }).finally(() => clearTimeout(timer));
    if (!response.ok) return found;
    const doc = await response.json();
    if (doc && typeof doc === 'object') {
      if (typeof doc.messageEndpoint === 'string') { try { const u = new URL(doc.messageEndpoint, page.origin); if (u.protocol === 'http:' && isLoopbackHost(u.hostname)) found.address = u.origin; } catch { /* keep the page's own */ } }
      if (typeof doc.individualId === 'string' && doc.individualId.length <= 200) found.resident = doc.individualId;
      if (typeof doc.name === 'string' && doc.name.trim() && doc.name.length <= 200) found.name = doc.name.trim();
    }
  } catch { /* no description: the address alone */ }
  return found;
}

const FIELDS = [
  { key: 'name', label: 'Name of the mind', hint: 'How she is called here. Only a label.', placeholder: DEFAULT_NAME },
  { key: 'address', label: 'Host address', hint: 'Where the host listens on this computer, for example the address and port it printed when it started.', placeholder: 'http://' },
  { key: 'resident', label: 'Mind id', hint: 'The id the host gives her.' },
  { key: 'encounter', label: 'Conversation id', hint: 'The conversation the host admits you to.' },
  { key: 'participant', label: 'Your participant id', hint: 'The id the host knows you by.' },
  { key: 'timeoutSeconds', label: 'Seconds to wait for the host', hint: 'How long to wait for an answer before saying there is none (3 to 60).', type: 'number' }
];

export function validateConfig(f) {
  const problems = [];
  const text = (v) => String(v ?? '').trim();
  const config = { name: text(f.name) || DEFAULT_NAME, address: text(f.address), resident: text(f.resident), encounter: text(f.encounter), participant: text(f.participant),
    timeoutSeconds: Math.min(60, Math.max(3, Math.round(Number(f.timeoutSeconds) || 15))) };
  if (!handoffUrl(config.address)) problems.push('address');
  for (const k of ['resident', 'encounter', 'participant']) if (!config[k]) problems.push(k);
  for (const k of ['name', 'resident', 'encounter', 'participant']) if (config[k].length > 200) problems.push(k);
  return { ok: problems.length === 0, config, problems };
}

/** Open the dialog. Resolves with the saved configuration, or null when the person closed it. `dialogs.open` is the page's own dialog. */
export function openSetup({ dialogs, initial = {}, check = checkHost, doc = document } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v) => { if (!settled) { settled = true; resolve(v); } };
    const form = doc.createElement('div'); form.className = 'mind-setup';
    const intro = doc.createElement('p'); intro.className = 'mind-setup-intro'; intro.textContent = REACH_ONLY;
    form.append(intro);
    const inputs = {};
    for (const f of FIELDS) {
      const wrap = doc.createElement('div'); wrap.className = 'mind-field';
      const id = 'mind-setup-' + f.key;
      const label = doc.createElement('label'); label.htmlFor = id; label.textContent = f.label;
      const input = doc.createElement('input'); input.id = id; input.type = f.type || 'text'; input.autocomplete = 'off'; input.spellcheck = false;
      if (f.placeholder) input.placeholder = f.placeholder;
      if (f.type === 'number') { input.min = '3'; input.max = '60'; input.inputMode = 'numeric'; }
      input.value = initial[f.key] ?? (f.key === 'timeoutSeconds' ? '15' : '');
      const hint = doc.createElement('p'); hint.className = 'mind-hint'; hint.id = id + '-hint'; hint.textContent = f.hint; input.setAttribute('aria-describedby', hint.id);
      wrap.append(label, input, hint); form.append(wrap); inputs[f.key] = input;
    }
    const result = doc.createElement('p'); result.className = 'mind-check-result'; result.id = 'mindCheckResult'; result.setAttribute('role', 'status'); result.setAttribute('aria-live', 'polite');
    const alertEl = doc.createElement('p'); alertEl.className = 'mind-check-result'; alertEl.id = 'mindCheckAlert'; alertEl.setAttribute('role', 'alert'); alertEl.setAttribute('aria-live', 'assertive');
    form.append(result, alertEl);
    const say = (text, bad) => { (bad ? alertEl : result).textContent = text; (bad ? result : alertEl).textContent = ''; };
    const values = () => Object.fromEntries(Object.entries(inputs).map(([k, el]) => [k, el.value]));
    const flag = (problems) => { for (const [k, el] of Object.entries(inputs)) el.setAttribute('aria-invalid', problems.includes(k) ? 'true' : 'false'); };
    const dlg = dialogs.open({ title: 'A mind on this computer', content: form, actions: [
      { label: 'Cancel', run: () => finish(null) },
      { label: 'Check', close: false, run: async (_h, button) => {
        const v = validateConfig(values()); flag(v.problems.filter((p) => p === 'address'));
        if (v.problems.includes('address')) { say(await Promise.resolve(check({ address: v.config.address })).then((r) => r.sentence), true); inputs.address.focus(); return; }
        button.setAttribute('aria-busy', 'true'); say('Asking the host. Nothing is sent but the question.', false);
        try { const r = await check({ address: v.config.address, timeoutMs: v.config.timeoutSeconds * 1000 }); say(r.sentence, r.kind !== 'available'); }
        finally { button.removeAttribute('aria-busy'); }
      } },
      { label: initial.encounter ? 'Save' : 'Open the conversation', primary: true, close: false, run: (handle) => {
        const v = validateConfig(values()); flag(v.problems);
        if (!v.ok) { say('Fill in the fields marked invalid: ' + v.problems.map((p) => FIELDS.find((f) => f.key === p)?.label || p).join(', ') + '.', true); inputs[v.problems[0]]?.focus(); return; }
        finish(v.config); handle.close();
      } }
    ] });
    dlg.onClose = () => finish(null);
  });
}
