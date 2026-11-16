// The lock side of the preset crash test: a tiny Web Locks stand-in. One lock, one holder at a time, the rest wait in order, and the lock is
// freed when the holder's connection closes. That last rule is the part being modelled: a browser frees a tab's Web Locks when the tab
// (or the process holding it) dies, and the kernel closes a dead process's sockets, so a SIGKILLed actor releases it without saying anything.
// leakOnDisconnect (control only) is the broken alternative, a lock that only an explicit release frees, like a "lock file exists" check.
import net from 'node:net';

export function startBroker(socketPath, { leakOnDisconnect = false } = {}) {
  const queue = []; let holder = null; const events = [];
  const log = (kind, entry, extra = {}) => events.push({ kind, pid: entry?.pid ?? null, ...extra });
  function pump() {
    if (holder || !queue.length) return;
    holder = queue.shift(); log('grant', holder, { queuedBehind: queue.length });
    holder.socket.write('g\n');
  }
  function free(entry, cause) { if (holder !== entry) return; holder = null; log('free', entry, { cause }); pump(); }
  const server = net.createServer(socket => {
    const entry = { socket, pid: null, buffer: '' };
    socket.on('error', () => {});
    socket.on('data', chunk => {
      entry.buffer += chunk;
      let at; while ((at = entry.buffer.indexOf('\n')) >= 0) {
        const line = entry.buffer.slice(0, at); entry.buffer = entry.buffer.slice(at + 1);
        let message; try { message = JSON.parse(line); } catch { continue; }
        if (message.t === 'req') { entry.pid = message.pid; queue.push(entry); log('request', entry); pump(); }
        else if (message.t === 'rel') { entry.released = true; free(entry, 'release'); }
      }
    });
    socket.on('close', () => {
      const waiting = queue.indexOf(entry); if (waiting >= 0) queue.splice(waiting, 1);
      if (holder !== entry) return;
      if (leakOnDisconnect && !entry.released) { log('leaked', entry); return; } // never freed: the next requester waits for ever
      free(entry, entry.released ? 'release' : 'disconnect');
    });
  });
  return new Promise(resolve => server.listen(socketPath, () => resolve({
    events,
    queued: () => queue.length,
    holderPid: () => holder?.pid ?? null,
    close: () => new Promise(done => { for (const e of [holder, ...queue]) e?.socket.destroy(); server.close(() => done()); }),
  })));
}
