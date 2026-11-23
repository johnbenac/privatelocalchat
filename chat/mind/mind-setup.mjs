// SPDX-License-Identifier: AGPL-3.0-only
// Setting up a conversation with a mind on this computer, in one of the app's own dialogs (window.plcDialogs.open): where the host is, who the person is to it, and a Check that asks the host once.
// The same dialog is "Connection" in the thread. Nothing is sent to the host that the person did not ask for: Check asks about a message id nobody sent (a status query), which carries no words.
//
//   checkHost({ address, timeoutMs, fetch }) -> { kind, sentence }     kind: available | unavailable | unreachable | not-admitted | refused | invalid
//   validateConfig(fields) -> { ok, config, problems }
//   openSetup({ dialogs, initial, check?, checkRelayFn?, loopbackOk?, savedToken? }) -> Promise<config | null>
//   describeRelayCheck(result, address) -> { kind, sentence }     what Check says after looking at a relay
// Two ways to reach a mind: on this computer (the loopback address of the host) or through a relay (an address, a channel and an access token; docs/MIND-CONVERSATION.md). The access token is
// returned in the config as `token` and is NOT part of what the chat keeps: the caller puts it in session storage (relay-token.mjs). An empty token means "keep the one already saved".
import { createHttpTransport } from '../channel/http-transport.mjs';
import { checkRelay, relayUrl } from '../channel/relay-transport.mjs';
import { COPY, DEFAULT_NAME, RELAY_COPY, RELAY_DEFAULT_NAME, RELAY_REACH_NOTE, REACH_ONLY, blockedByBrowser, handoffUrl } from './mind-model.mjs';

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

/** What Check says after it looked at a relay. Nothing was sent: the access token is only presented, the way the relay asks for it. */
export function describeRelayCheck(result, address) {
  const host = (() => { try { return new URL(address).host; } catch { return address; } })();
  switch (result?.kind) {
    case 'available': return { kind: 'available', sentence: 'The relay answered and the mind is connected to it. Nothing was sent.' };
    case 'unavailable': return { kind: 'unavailable', sentence: 'The relay answered, but the mind is not connected to it right now. Nothing was sent.' };
    case 'insecure': return { kind: 'insecure', sentence: RELAY_COPY.insecure() + ' ' + RELAY_COPY.insecureDetail() };
    case 'revoked': return { kind: 'revoked', sentence: 'You are not allowed to use this connection any more. Nothing was sent.' };
    case 'superseded': return { kind: 'superseded', sentence: 'This conversation was opened in another tab while checking. Nothing was sent.' };
    case 'no-token': return { kind: 'no-token', sentence: 'Add your access token first. Nothing was sent.' };
    default: return { kind: 'unreachable', sentence: RELAY_COPY.unreachable(host) };
  }
}

const FIELDS = [
  { key: 'name', label: 'Name of the mind', hint: 'How she is called here. Only a label.', placeholder: DEFAULT_NAME },
  { key: 'address', label: 'Host address', hint: 'Where the host listens on this computer, for example the address and port it printed when it started.', placeholder: 'http://', via: 'computer' },
  { key: 'relayAddress', label: 'Relay address', hint: 'The address of the relay, given to you by whoever runs it.', placeholder: 'https://relay.example', via: 'relay' },
  { key: 'channel', label: 'Channel', hint: 'The name of the channel on the relay that the mind uses.', via: 'relay' },
  { key: 'token', label: 'Access token', hint: 'What lets you onto the channel. It is kept in this tab only and is gone when the tab closes. Leave it empty to keep the one already saved.', type: 'password', via: 'relay' },
  { key: 'resident', label: 'Mind id', hint: 'The id the host gives her.' },
  { key: 'encounter', label: 'Conversation id', hint: 'The conversation the host admits you to.' },
  { key: 'participant', label: 'Your participant id', hint: 'The id the host knows you by.' },
  { key: 'timeoutSeconds', label: 'Seconds to wait for the host', hint: 'How long to wait for an answer before saying there is none (3 to 60).', type: 'number' }
];

export function validateConfig(f, { hasToken = false } = {}) {
  const problems = [];
  const text = (v) => String(v ?? '').trim();
  const relay = f.via === 'relay';
  const config = { name: text(f.name) || (relay ? RELAY_DEFAULT_NAME : DEFAULT_NAME), address: text(relay ? f.relayAddress ?? f.address : f.address), resident: text(f.resident), encounter: text(f.encounter), participant: text(f.participant),
    timeoutSeconds: Math.min(60, Math.max(3, Math.round(Number(f.timeoutSeconds) || 15))) };
  if (relay) {
    config.via = 'relay'; config.channel = text(f.channel); config.token = String(f.token ?? '').trim();
    if (!relayUrl({ address: config.address, channel: 'channel-id-placeholder' })) problems.push('relayAddress');
    else if (!relayUrl({ address: config.address, channel: config.channel })) problems.push('channel');
    if (!config.token && !hasToken) problems.push('token');
  } else if (!handoffUrl(config.address)) problems.push('address');
  for (const k of ['resident', 'encounter', 'participant']) if (!config[k]) problems.push(k);
  for (const k of ['name', 'resident', 'encounter', 'participant']) if (config[k].length > 200) problems.push(k);
  return { ok: problems.length === 0, config, problems };
}

/** Open the dialog. Resolves with the saved configuration, or null when the person closed it. `dialogs.open` is the page's own dialog.
 * `loopbackOk`: false where this device cannot reach a mind on itself (a phone): "On this computer" is then shown with its sentence and cannot be chosen. `savedToken()`: the access token already kept for this chat, if any (never shown). */
export function openSetup({ dialogs, initial = {}, check = checkHost, checkRelayFn = checkRelay, loopbackOk = true, savedToken = null, doc = document } = {}) {
  const hasToken = Boolean(savedToken?.());
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v) => { if (!settled) { settled = true; resolve(v); } };
    const form = doc.createElement('div'); form.className = 'mind-setup';
    let via = initial.via === 'relay' || !loopbackOk ? 'relay' : 'computer';
    // ---- where the mind is: on this computer, or through a relay ----
    const how = doc.createElement('fieldset'); how.className = 'mind-how';
    const legend = doc.createElement('legend'); legend.textContent = 'How do you reach the mind?'; how.append(legend);
    const radios = {};
    for (const [value, label] of [['computer', 'On this computer'], ['relay', 'Through a relay']]) {
      const row = doc.createElement('label'); row.className = 'mind-how-row';
      const r = doc.createElement('input'); r.type = 'radio'; r.name = 'mind-how'; r.value = value; r.id = 'mind-setup-via-' + value; r.checked = via === value;
      if (value === 'computer' && !loopbackOk) r.disabled = true;
      row.append(r, doc.createTextNode(' ' + label)); how.append(row); radios[value] = r;
    }
    if (!loopbackOk) { const why = doc.createElement('p'); why.className = 'mind-hint'; why.id = 'mindHowNote'; why.textContent = REACH_ONLY; how.append(why); }   // said where "On this computer" cannot be chosen
    const intro = doc.createElement('p'); intro.className = 'mind-setup-intro'; intro.id = 'mindSetupIntro';
    form.append(how, intro);
    const inputs = {}, wraps = {};
    for (const f of FIELDS) {
      const wrap = doc.createElement('div'); wrap.className = 'mind-field';
      const id = 'mind-setup-' + f.key;
      const label = doc.createElement('label'); label.htmlFor = id; label.textContent = f.label;
      const input = doc.createElement('input'); input.id = id; input.type = f.type || 'text'; input.autocomplete = 'off'; input.spellcheck = false;
      if (f.placeholder) input.placeholder = f.placeholder;
      if (f.type === 'number') { input.min = '3'; input.max = '60'; input.inputMode = 'numeric'; }
      input.value = f.key === 'relayAddress' ? (initial.via === 'relay' ? initial.address ?? '' : '') : f.key === 'address' ? (initial.via === 'relay' ? '' : initial.address ?? '')
        : f.key === 'token' ? '' : initial[f.key] ?? (f.key === 'timeoutSeconds' ? '15' : '');
      const hint = doc.createElement('p'); hint.className = 'mind-hint'; hint.id = id + '-hint'; hint.textContent = f.hint; input.setAttribute('aria-describedby', hint.id);
      wrap.append(label, input, hint); form.append(wrap); inputs[f.key] = input; wraps[f.key] = { wrap, via: f.via || null };
    }
    const result = doc.createElement('p'); result.className = 'mind-check-result'; result.id = 'mindCheckResult'; result.setAttribute('role', 'status'); result.setAttribute('aria-live', 'polite');
    const alertEl = doc.createElement('p'); alertEl.className = 'mind-check-result'; alertEl.id = 'mindCheckAlert'; alertEl.setAttribute('role', 'alert'); alertEl.setAttribute('aria-live', 'assertive');
    // Check sits with its answer, in the part of the dialog that scrolls: the answer is right under the button and is scrolled into view
    const checkBtn = doc.createElement('button'); checkBtn.type = 'button'; checkBtn.className = 'secondary mind-check-btn'; checkBtn.textContent = 'Check'; checkBtn.id = 'mindCheck';
    const checkNote = doc.createElement('p'); checkNote.className = 'mind-hint'; checkNote.id = 'mindCheckNote';
    form.append(checkBtn, checkNote, result, alertEl);
    const apply = () => {
      via = radios.relay.checked ? 'relay' : 'computer';
      intro.textContent = via === 'relay' ? RELAY_REACH_NOTE : REACH_ONLY;
      for (const w of Object.values(wraps)) w.wrap.hidden = w.via !== null && w.via !== via;
      checkNote.textContent = via === 'relay' ? 'Check connects to the relay for a moment and sends nothing. If this conversation is open in another tab, that tab stops.' : '';
      checkNote.hidden = !checkNote.textContent;
    };
    for (const r of Object.values(radios)) r.addEventListener('change', apply);
    apply();
    const say = (text, bad) => { (bad ? alertEl : result).textContent = text; (bad ? result : alertEl).textContent = ''; (bad ? alertEl : result).scrollIntoView?.({ block: 'nearest' }); };
    const values = () => ({ ...Object.fromEntries(Object.entries(inputs).map(([k, el]) => [k, el.value])), via });
    const flag = (problems) => { for (const [k, el] of Object.entries(inputs)) el.setAttribute('aria-invalid', problems.includes(k) ? 'true' : 'false'); };
    const labelOf = (key) => FIELDS.find((f) => f.key === key)?.label || key;
    checkBtn.addEventListener('click', async () => {
      const v = validateConfig(values(), { hasToken }); const first = via === 'relay' ? ['relayAddress', 'channel', 'token'] : ['address'];
      const bad = v.problems.filter((p) => first.includes(p));
      flag(bad);
      if (via === 'relay') {
        if (bad.length) { say(bad.includes('token') && !bad.includes('relayAddress') && !bad.includes('channel') ? 'Add your access token first. Nothing was sent.' : 'Fill in the fields marked invalid: ' + bad.map(labelOf).join(', ') + '.', true); inputs[bad[0]].focus(); return; }
        checkBtn.setAttribute('aria-busy', 'true'); say('Connecting to the relay. Nothing is sent.', false);
        try {
          const typed = v.config.token;
          const r = describeRelayCheck(await checkRelayFn({ url: relayUrl({ address: v.config.address, channel: v.config.channel }), token: typed || savedToken?.() || '', timeoutMs: v.config.timeoutSeconds * 1000 }), v.config.address);
          say(r.sentence, r.kind !== 'available');
        } finally { checkBtn.removeAttribute('aria-busy'); }
        return;
      }
      if (v.problems.includes('address')) { say(await Promise.resolve(check({ address: v.config.address })).then((r) => r.sentence), true); inputs.address.focus(); return; }
      checkBtn.setAttribute('aria-busy', 'true'); say('Asking the host. Nothing is sent but the question.', false);
      try { const r = await check({ address: v.config.address, timeoutMs: v.config.timeoutSeconds * 1000 }); say(r.sentence, r.kind !== 'available'); }
      finally { checkBtn.removeAttribute('aria-busy'); }
    });
    const dlg = dialogs.open({ title: 'A mind', content: form, actions: [
      { label: 'Cancel', run: () => finish(null) },
      { label: initial.encounter ? 'Save' : 'Open the conversation', primary: true, close: false, run: (handle) => {
        const v = validateConfig(values(), { hasToken }); flag(v.problems);
        if (!v.ok) { say('Fill in the fields marked invalid: ' + v.problems.map(labelOf).join(', ') + '.', true); inputs[v.problems[0]]?.focus(); return; }
        finish(v.config); handle.close();
      } }
    ] });
    dlg.onClose = () => finish(null);
  });
}
