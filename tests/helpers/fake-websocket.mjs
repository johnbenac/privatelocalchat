// A scripted WebSocket for tests of the relay transport: the test plays the relay. Every socket the code under test creates is kept in `FakeWebSocket.all`; the test opens it, delivers text,
// closes it with a code, or fails it, exactly as a browser would report it (an `error` then a `close` with 1006 for a connection that never opened).
export function createFakeWebSocket() {
  class FakeWebSocket {
    constructor(url, protocols) { this.url = url; this.protocols = [].concat(protocols || []); this.readyState = 0; this.sent = []; this.closedWith = null; FakeWebSocket.all.push(this); }
    send(text) { if (this.readyState !== 1) throw new Error('not open'); this.sent.push(text); }
    close(code = 1000) { if (this.readyState >= 2) return; this.closedWith = code; this.readyState = 3; }
    // ---- the test's side (the relay) ----
    open() { this.readyState = 1; this.onopen?.({}); return this; }
    say(routing, body) { this.onmessage?.({ data: JSON.stringify(routing) + (body === undefined ? '' : '\n' + (typeof body === 'string' ? body : JSON.stringify(body))) }); return this; }
    frame(body) { return this.say({ t: 'msg', from: 'host' }, body); }
    ctl(code, extra = {}) { return this.say({ t: 'ctl', code, ...extra }); }
    shut(code = 1006) { this.readyState = 3; this.onclose?.({ code }); return this; }
    fail() { this.onerror?.({}); return this.shut(1006); }   // a connection that never opened: the browser says nothing more than this
    get frames() { return this.sent.map((t) => ({ routing: JSON.parse(t.slice(0, t.indexOf('\n'))), body: JSON.parse(t.slice(t.indexOf('\n') + 1)) })); }
  }
  FakeWebSocket.all = [];
  FakeWebSocket.last = () => FakeWebSocket.all.at(-1);
  return FakeWebSocket;
}

/** A clock the test turns: set() / clear() like the browser's, `tick(ms)` runs what is due, in order. */
export function createFakeTimers() {
  let t = 0, next = 1; const jobs = new Map();
  return {
    set: (fn, ms) => { const id = next++; jobs.set(id, { at: t + ms, fn }); return id; },
    clear: (id) => { jobs.delete(id); },
    tick(ms) { const end = t + ms; for (;;) { const due = [...jobs].filter(([, j]) => j.at <= end).sort((a, b) => a[1].at - b[1].at)[0]; if (!due) break; jobs.delete(due[0]); t = Math.max(t, due[1].at); due[1].fn(); } t = end; },
    now: () => t, pending: () => jobs.size
  };
}
