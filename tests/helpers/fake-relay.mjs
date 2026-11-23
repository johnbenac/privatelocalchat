// A scripted FAKE RELAY for browser tests of the relay transport (chat/channel/relay-transport.mjs): a real WebSocket server on 127.0.0.1 with the relay's wire (docs/CHANNEL-CLIENT.md): the path
// /channel/<id>?as=surface, the subprotocols `relay.v1` and `bearer.<token>`, text messages of a routing line, a newline and one contract frame, and the control lines. It also plays the host:
// it answers only what a script tells it to, and every word it sends is one a test put there (`say`). It is not the platform's relay and has no mind. No dependency: RFC 6455 by hand.
//
//   const relay = await startFakeRelay({ token, channel })     relay.address (what a person types), relay.channel, relay.handshakes (path and protocols of every connection, for "the token is not in the address")
//   relay.setHost(true|false)       the host is (not) connected: host-present / host-absent to every surface; a message sent meanwhile is refused no-host
//   relay.stateCount = 3            how many of the five receipts the host reaches for a message
//   relay.say(messageId, text, { occId, replyId })   a reply, pushed to every surface now; relay.sayAgain(...) pushes the same one again (a retry, a host restart)
//   relay.received                  every contract frame a surface sent (parsed), relay.routing every routing line
//   relay.supersede() / relay.revoke()   close the open surface connections with 4000 / 4001; relay.dropLinks() closes them abruptly (1006); relay.refuseNext()  the next upgrade is answered 401
//   relay.close()
import http from 'node:http';
import { createHash } from 'node:crypto';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const STATES = ['accepted', 'delivered', 'exposed', 'interpreted', 'persisted'];

function encode(opcode, payload) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const n = body.length;
  const head = n < 126 ? Buffer.from([0x80 | opcode, n]) : n < 65536 ? Buffer.from([0x80 | opcode, 126, n >> 8, n & 255]) : (() => { const b = Buffer.alloc(10); b[0] = 0x80 | opcode; b[1] = 127; b.writeBigUInt64BE(BigInt(n), 2); return b; })();
  return Buffer.concat([head, body]);
}
function decoder(onFrame) {   // client frames: masked, possibly several to a chunk or split across chunks
  let buf = Buffer.alloc(0);
  return (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      if (buf.length < 2) return;
      const opcode = buf[0] & 15; let n = buf[1] & 127, at = 2;
      if (n === 126) { if (buf.length < 4) return; n = buf.readUInt16BE(2); at = 4; } else if (n === 127) { if (buf.length < 10) return; n = Number(buf.readBigUInt64BE(2)); at = 10; }
      const masked = Boolean(buf[1] & 128); if (buf.length < at + (masked ? 4 : 0) + n) return;
      const mask = masked ? buf.subarray(at, at + 4) : null; at += masked ? 4 : 0;
      const data = Buffer.from(buf.subarray(at, at + n)); if (mask) for (let i = 0; i < n; i += 1) data[i] ^= mask[i & 3];
      buf = buf.subarray(at + n);
      onFrame(opcode, data);
    }
  };
}

export async function startFakeRelay({ token = 'fake-relay-token', channel = 'chan-fake-0001', port = 0 } = {}) {
  const relay = { channel, hostPresent: true, stateCount: 5, handshakes: [], received: [], routing: [], connections: new Set(), known: new Map(), server: null, port: 0, refusals: 0 };
  let refuseNext = false;
  const line = (routing, body) => JSON.stringify(routing) + (body === undefined ? '' : '\n' + JSON.stringify(body));
  const sendTo = (conn, routing, body) => { if (!conn.socket.destroyed) conn.socket.write(encode(1, line(routing, body))); };
  const toSurfaces = (body) => { for (const c of relay.connections) sendTo(c, { t: 'msg', from: 'host' }, body); };
  const ctl = (code, extra = {}) => { for (const c of relay.connections) sendTo(c, { t: 'ctl', code, ...extra }); };
  const replyFrame = ({ messageId, text, occId, replyId, encounter }) => ({ kind: 'reply', id: replyId, encounter, causes: [messageId], speaker: { individualId: 'individual:fake-1' }, occ: { source: 'host:fake', id: occId, digest: 'sha256:' + '0'.repeat(64) },
    audience: { kind: 'encounter' }, expression: 'said', delivered: text, units: [{ text }], status: 'completed' });

  function onSurfaceText(conn, text) {
    const i = text.indexOf('\n'); let routing; try { routing = JSON.parse(i < 0 ? text : text.slice(0, i)); } catch { return sendTo(conn, { t: 'ctl', code: 'refused', reason: 'bad-routing', for: 'msg' }); }
    relay.routing.push(routing);
    let frame; try { frame = JSON.parse(text.slice(i + 1)); } catch { frame = null; }
    if (!relay.hostPresent) return sendTo(conn, { t: 'ctl', code: 'refused', reason: 'no-host', for: 'msg' });
    relay.received.push(frame);
    if (frame?.kind === 'message') {
      if (!relay.known.has(frame.id)) relay.known.set(frame.id, { states: STATES.slice(0, relay.stateCount), encounter: frame.encounter });
      for (const state of STATES.slice(0, relay.stateCount)) sendTo(conn, { t: 'msg', from: 'host' }, { kind: 'receipt', state, messageId: frame.id, encounter: frame.encounter, ...(state === 'delivered' ? { worldSeq: relay.known.size } : {}) });
    } else if (frame?.kind === 'status-query') {
      const k = relay.known.get(frame.messageId);
      sendTo(conn, { t: 'msg', from: 'host' }, { kind: 'status', messageId: frame.messageId, known: Boolean(k), states: k ? k.states : [] });
    }
  }

  const server = http.createServer((req, res) => { res.writeHead(404); res.end(); });
  server.on('upgrade', (req, socket) => {
    const url = new URL(req.url, 'http://x'); const protocols = String(req.headers['sec-websocket-protocol'] || '').split(',').map((s) => s.trim());
    relay.handshakes.push({ path: req.url, protocols, origin: req.headers.origin || null });
    const ok = url.pathname === '/channel/' + channel && url.searchParams.get('as') === 'surface' && protocols.includes('relay.v1') && protocols.includes('bearer.' + token);
    if (refuseNext || !ok) { refuseNext = false; relay.refusals += 1; socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); socket.destroy(); return; }
    const accept = createHash('sha1').update(String(req.headers['sec-websocket-key']) + GUID).digest('base64');
    socket.write(['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade', 'Sec-WebSocket-Accept: ' + accept, 'Sec-WebSocket-Protocol: relay.v1', '', ''].join('\r\n'));
    const conn = { socket };
    for (const older of relay.connections) { older.closing = true; older.socket.write(encode(8, Buffer.concat([Buffer.from([0x0f, 0xa0]), Buffer.from('superseded')]))); relay.connections.delete(older); }   // the same person again: the newer one stays (4000)
    relay.connections.add(conn);
    sendTo(conn, { t: 'ctl', code: relay.hostPresent ? 'host-present' : 'host-absent' });
    socket.on('data', decoder((opcode, data) => {
      if (opcode === 1) onSurfaceText(conn, data.toString('utf8'));
      else if (opcode === 9) socket.write(encode(10, data));
      else if (opcode === 8) { if (!conn.closing) socket.write(encode(8, data.subarray(0, 2))); socket.end(); }   // answering a close we did not start; one that we started is only completed
    }));
    socket.on('close', () => { relay.connections.delete(conn); });
    socket.on('error', () => {});
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  relay.port = server.address().port; relay.server = server;
  Object.defineProperty(relay, 'address', { get: () => `http://127.0.0.1:${relay.port}` });
  const closeAll = (code, reason) => { const body = Buffer.concat([Buffer.from([code >> 8, code & 255]), Buffer.from(reason)]); for (const c of relay.connections) { c.closing = true; c.socket.write(encode(8, body)); } };
  relay.setHost = (present) => { relay.hostPresent = present; ctl(present ? 'host-present' : 'host-absent'); };
  relay.say = (messageId, text, { occId = 'occ-' + Math.random().toString(16).slice(2, 10), replyId = 'reply-' + occId } = {}) => { const frame = replyFrame({ messageId, text, occId, replyId, encounter: relay.known.get(messageId)?.encounter || 'enc:fake' }); toSurfaces(frame); return { occId, replyId, frame }; };
  relay.sayAgain = (sent) => toSurfaces(sent.frame);
  relay.supersede = () => closeAll(4000, 'superseded');
  relay.revoke = () => closeAll(4001, 'revoked');
  relay.dropLinks = () => { for (const c of relay.connections) c.socket.destroy(); relay.connections.clear(); };
  relay.refuseNext = () => { refuseNext = true; };
  relay.close = () => new Promise((resolve) => { for (const c of relay.connections) c.socket.destroy(); relay.connections.clear(); server.close(() => resolve()); });
  return relay;
}
