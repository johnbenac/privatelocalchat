// A scripted FAKE HOST for the message handoff over HTTP (the own-computer binding of tests/fixtures/message-handoff/CONTRACT.md): ONE route, POST /message-handoff, one JSON object in, newline-delimited
// JSON out, CORS for the page's origin and Cross-Origin-Resource-Policy: cross-origin (the page is cross-origin isolated). It answers only what a script tells it to; it is not Sonalon's host and has no mind:
// every word it ever sends is one a test put there (`say`, `unasked`).
//
//   const host = await startFakeHost({ origin })     host.url (the route), host.address (what a person types), host.log (every frame received), host.received (messages only)
//   host.setMode(name)   ok | not-admitted | unavailable | silent | blackhole-after-receive | status-refuses-not-admitted
//   host.say(messageId, text, { occId })   a reply to that message, returned on EVERY later poll (the client must show it once)
//   host.unasked(text, { occId })          a reply caused by a message nobody here sent, returned on every poll
//   host.stop() / host.start()             the port closes (connection refused) and opens again on the same port
//   host.close()
import http from 'node:http';

const STATES = ['accepted', 'delivered', 'exposed', 'interpreted', 'persisted'];
const lines = (records) => records.map((r) => JSON.stringify(r)).join('\n') + '\n';

export async function startFakeHost({ origin, port = 0, encounterOf = null } = {}) {
  const host = { mode: 'ok', log: [], received: [], known: new Map(), replies: new Map(), unaskedReplies: [], held: new Set(), sockets: new Set(), server: null, port: 0 };
  const cors = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Max-Age': '60', 'Cross-Origin-Resource-Policy': 'cross-origin', Vary: 'Origin' };
  const reply = (r, causes) => ({ kind: 'reply', id: 'reply-' + r.occId, encounter: r.encounter || 'enc:fake', causes, speaker: { individualId: 'individual:fake-1' }, occ: { source: 'host:fake', id: r.occId, digest: 'sha256:' + '0'.repeat(64) },
    audience: { kind: 'encounter' }, expression: 'said', delivered: r.text, units: [{ text: r.text }], status: 'completed' });
  function handler(req, res) {
    host.sockets.add(req.socket); req.socket.on('close', () => host.sockets.delete(req.socket));
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
    if (req.method !== 'POST' || !req.url.endsWith('/message-handoff')) { res.writeHead(404, cors); return res.end(); }
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      let frame; try { frame = JSON.parse(body); } catch { frame = null; }
      host.log.push(frame);
      const send = (status, records) => { res.writeHead(status, { ...cors, 'Content-Type': 'application/x-ndjson' }); res.end(lines(records)); };
      if (host.mode === 'silent') { host.held.add(res); return; }                     // never answers: the page waits until its own timeout
      if (host.mode === 'unavailable') return send(503, [{ kind: 'refusal', class: 'unavailable', messageId: frame?.id || frame?.messageId || null, reason: 'no resident is running' }]);
      if (frame?.kind === 'message') {
        if (host.mode === 'not-admitted') return send(403, [{ kind: 'refusal', class: 'not-admitted', messageId: frame.id, reason: 'participant not admitted' }]);
        if (!host.known.has(frame.id)) { host.known.set(frame.id, { states: [...STATES], encounter: frame.encounter }); host.received.push(frame); }
        if (host.mode === 'blackhole-after-receive') { req.socket.destroy(); return; }   // the host HAS the message; the page never hears
        return send(200, STATES.map((state, i) => ({ kind: 'receipt', state, messageId: frame.id, encounter: frame.encounter, ...(state === 'delivered' ? { worldSeq: host.received.length } : {}), ...(i < 0 ? {} : {}) })));
      }
      if (frame?.kind === 'status-query') {
        if (host.mode === 'blackhole-after-receive') { req.socket.destroy(); return; }
        if (host.mode === 'status-refuses-not-admitted') return send(403, [{ kind: 'refusal', class: 'not-admitted', messageId: frame.messageId, reason: 'participant not admitted' }]);
        const k = host.known.get(frame.messageId);
        const records = [{ kind: 'status', messageId: frame.messageId, known: Boolean(k), states: k ? k.states : [] }];
        if (k) for (const r of host.replies.get(frame.messageId) || []) records.push(reply({ ...r, encounter: k.encounter }, [frame.messageId]));
        if (k || frame.messageId) for (const r of host.unaskedReplies) records.push(reply({ ...r, encounter: encounterOf || k?.encounter || 'enc:fake' }, ['00000000-0000-4000-8000-00000000ffff']));
        return send(200, records);
      }
      return send(400, [{ kind: 'refusal', class: 'malformed', messageId: null, reason: 'unknown kind' }]);
    });
  }
  const listen = () => new Promise((resolve, reject) => { const s = http.createServer(handler); s.once('error', reject); s.listen(host.port || port, '127.0.0.1', () => { host.port = s.address().port; host.server = s; resolve(); }); });
  await listen();
  Object.defineProperty(host, 'url', { get: () => `http://127.0.0.1:${host.port}/message-handoff` });
  Object.defineProperty(host, 'address', { get: () => `http://127.0.0.1:${host.port}` });
  host.setMode = (m) => { host.mode = m; if (m !== 'silent') { for (const r of host.held) { try { r.destroy(); } catch { /* gone */ } } host.held.clear(); } };
  host.say = (messageId, text, { occId = 'occ-' + Math.random().toString(16).slice(2, 10) } = {}) => { const list = host.replies.get(messageId) || []; list.push({ text, occId }); host.replies.set(messageId, list); return occId; };
  host.unasked = (text, { occId = 'unasked-' + Math.random().toString(16).slice(2, 10) } = {}) => { host.unaskedReplies.push({ text, occId }); return occId; };
  host.stop = () => new Promise((resolve) => { const s = host.server; host.server = null; for (const sock of host.sockets) sock.destroy(); s.close(() => resolve()); });
  host.start = () => listen();
  host.close = async () => { if (host.server) await host.stop(); };
  host.lastMessageId = () => host.received.at(-1)?.id;
  return host;
}
