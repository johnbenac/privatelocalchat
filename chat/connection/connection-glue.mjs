// Connection and offline readiness for the page: creates the connection state (chat/connection/connection.mjs), gathers the facts for the offline
// checklist and offers the fixes it lists. The shell and Settings read it through window.plcApp.offline; nothing here draws anything.
//
// createConnectionGlue(host) needs from the page:
//   events        the event list (connection:changed is fired here)
//   models()      window.localModels
//   voice()       the voice picker snapshot (or a promise of it), or null
//   toast(text)   the page's toast
//   loadMatching() starts the download of the small matching model (the shared embedder)
//   endpoint()    the connected provider's address (where an on-device provider can still answer offline)
//   probeUrl      the address of a small file on the app's own origin used to check reachability (default /version.json)
// Returns { connection, readiness(), subscribe(fn) -> off, fix(action), reason(kind), isNetworkError(err), noteRequest(ok, err) }.
import { createConnection, offlineReason, providerPlace } from './connection.mjs';
import { createOfflineFacts } from './offline-facts.mjs';
import { guessPrivate } from './private-mode.mjs';
import { embeddingSaved } from '../embedding/embedding-saved.mjs';
import { offlineReadiness, offlineHint, installHint, updateHint } from '../../runtime/offline-readiness.mjs';

// The words browsers use when a request could not leave the device or got no answer. A server that answered "no" is not one of these.
const NETWORK_MESSAGE = /failed to fetch|load failed|networkerror|network request failed|network error|internet connection appears to be offline|err_internet_disconnected|err_network/i;
export function isNetworkError(err) {
  if (!err) return false;
  if (err.name === 'AbortError') return false;
  if (typeof err.status === 'number' || typeof err.statusCode === 'number') return false;
  return err.name === 'TypeError' ? NETWORK_MESSAGE.test(String(err.message || '')) || !err.message : NETWORK_MESSAGE.test(String(err.message || err));
}

export function createConnectionGlue(host) {
  const connection = createConnection({
    isOnline: () => navigator.onLine !== false,
    listen: (name, fn) => { window.addEventListener(name, fn); return () => window.removeEventListener(name, fn); },
    setTimer: (fn, ms) => setTimeout(fn, ms), clearTimer: id => clearTimeout(id),
    onChange: info => { host.events.emit('connection:changed', info); window.dispatchEvent(new Event('connection-changed')); notify(); },
  });
  // Is this window private? Asked of what it refuses (chat/connection/private-mode.mjs). IndexedDB blob storage is probed once, with a throw-away database.
  let idbBlobProbe = null;
  const probeIdbBlob = () => (idbBlobProbe ||= new Promise(resolve => {
    try {
      const name = 'plc-probe-' + Math.random().toString(36).slice(2);
      const open = indexedDB.open(name, 1);
      open.onupgradeneeded = () => open.result.createObjectStore('f');
      open.onerror = () => resolve(false);
      open.onsuccess = () => {
        const db = open.result; let result = false;
        try {
          const tx = db.transaction('f', 'readwrite'); tx.objectStore('f').put(new Blob([new Uint8Array(1024)]), 'k');
          tx.oncomplete = () => { result = true; finish(); }; tx.onerror = () => { result = false; finish(); }; tx.onabort = () => { result = false; finish(); };
        } catch { finish(); }
        function finish() { try { db.close(); indexedDB.deleteDatabase(name); } catch { /* it was throw-away */ } resolve(result); }
      };
    } catch { resolve(null); }
    setTimeout(() => resolve(null), 4000);
  }));
  const serviceWorkerState = () => { const o = host.models?.()?.offlineApp; if (!('serviceWorker' in navigator)) return 'missing'; if (o?.checked && o.supported === false) return 'failed'; return o?.checked ? 'ok' : null; };
  const privateGuess = async () => {
    const L = host.models?.();
    const est = await (navigator.storage?.estimate?.() ?? Promise.resolve(null)).catch(() => null);
    return guessPrivate({ userAgent: navigator.userAgent, opfs: L?.state?.device ? L.state.device.opfs : null, idbBlob: await probeIdbBlob(), serviceWorker: serviceWorkerState(), quotaBytes: est?.quota ?? null });
  };
  const facts = createOfflineFacts({
    privateGuess,
    models: () => host.models?.(), app: () => host.models?.()?.offlineApp,
    voice: () => host.voice?.(), storage: () => navigator.storage?.estimate?.() ?? Promise.resolve(null), matching: () => embeddingSaved(),
    persisted: () => navigator.storage?.persisted?.() ?? Promise.resolve(null),
    standalone: () => navigator.standalone === true || matchMedia?.('(display-mode: standalone)').matches,
    ios: () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
  });
  // Is the app's own origin reachable? The browser's online flag stays true behind a dead Wi-Fi, so this asks directly. It talks only to the origin that
  // served the app, only when the page comes back to the front, when the browser reports a change, and slowly while it is open (faster while offline,
  // to notice the return). The query string makes it skip the saved copy, so it tests the network and not the cache.
  let probing = false;
  async function probe(force = false) {
    if (probing || (!force && document.visibilityState === 'hidden')) return; // a page in the background does not ask, except the one check at start-up
    probing = true;
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 6000);
    try {
      const response = await fetch((host.probeUrl || '/version.json') + '?probe=' + Date.now(), { cache: 'no-store', signal: controller.signal });
      if (response) connection.reportSuccess();
    } catch (error) { connection.reportFailure({ definitive: true }); }
    finally { clearTimeout(timeout); probing = false; }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') probe(); });
  window.addEventListener('focus', () => probe());
  window.addEventListener('online', () => setTimeout(() => probe(), 300));
  setTimeout(() => probe(true), 2500); // once at start-up, so a page opened on a dead connection says so
  setInterval(() => { if (connection.state === 'offline') probe(); }, 15000);
  setInterval(() => probe(), 300000);
  const listeners = new Set();
  let timer = null;
  function notify() { clearTimeout(timer); timer = setTimeout(async () => { const r = await readiness(); for (const fn of [...listeners]) { try { fn(r, connection); } catch (e) { console.error(e); } } }, 50); }
  async function readiness() { return offlineReadiness(await facts.read()); }
  for (const name of ['offline-status', 'local-model-state']) window.addEventListener(name, notify);

  // The first time a model is ready to answer: one quiet line about offline use (each kind of line is shown once, ever).
  const HINT_KEY = 'plc.offlineHint.v1';
  let hintArmed = true;
  window.addEventListener('local-model-state', () => {
    const L = host.models?.();
    if (!hintArmed || !L || L.mode !== 'local' || L.state?.load?.state !== 'ready') return;
    hintArmed = false;
    setTimeout(async () => {
      try {
        const seen = JSON.parse(localStorage.getItem(HINT_KEY) || '{}');
        const hint = offlineHint(await readiness());
        if (!hint || hint.kind === 'private' || seen[hint.kind]) return; // a private window is said at start-up, not again here
        seen[hint.kind] = true; localStorage.setItem(HINT_KEY, JSON.stringify(seen));
        host.toast?.(hint.text);
      } catch { /* a hint is never worth an error */ }
    }, 2500);
  });
  // The two other moments, each said once: add to the Home Screen (iPhone/iPad, once a model is saved), and an update that was saved while the app was open.
  const sayOnce = (hint) => { try { const seen = JSON.parse(localStorage.getItem(HINT_KEY) || '{}'); if (!hint || seen[hint.kind]) return false; seen[hint.kind] = true; localStorage.setItem(HINT_KEY, JSON.stringify(seen)); host.toast?.(hint.text); return true; } catch { return false; } };
  let updateSaid = false;
  window.addEventListener('offline-status', async () => {
    const f = await facts.read();
    if (!updateSaid && updateHint(f)) { updateSaid = true; host.toast?.(updateHint(f).text); }
    else if (installHint(f)) setTimeout(() => sayOnce(installHint(f)), 6000);
  });

  // A window that looks private: say so early, once per page load, because the person finds out otherwise only after a download that will not be kept.
  setTimeout(async () => {
    try {
      const r = await readiness(); const hint = offlineHint(r);
      if (hint?.kind === 'private') host.toast?.(hint.text, 14000);
    } catch { /* a hint is never worth an error */ }
  }, 6000);

  async function fix(action) {
    const L = host.models?.();
    if (action === 'reload') { location.reload(); return true; }
    if (action === 'save-runtime') { await L?.saveRuntime?.(); notify(); return true; }
    if (action === 'download-model') { if (!connection.online) { host.toast?.(offlineReason('download')); return false; } L?.download?.(); return true; }
    if (action === 'download-matching') { if (!connection.online) { host.toast?.(offlineReason('matching')); return false; } try { await host.loadMatching?.(); } catch { /* the embedder explains its own failure */ } notify(); return true; }
    if (action === 'persist') { await L?.requestPersist?.(); notify(); return true; }
    return false;
  }

  // A control that needs the connection: disabled with the reason while offline (when `applies()` says it matters), as it was before otherwise.
  function gate(el, kind, applies = () => true) {
    if (!el) return;
    const original = { title: el.getAttribute('title') };
    const apply = () => {
      const block = connection.state === 'offline' && applies();
      if (block) { if (!el.dataset.offlineBlocked) { el.dataset.offlineBlocked = '1'; el.dataset.wasDisabled = el.disabled ? '1' : ''; } el.disabled = true; el.setAttribute('aria-disabled', 'true'); el.title = offlineReason(kind); }
      else if (el.dataset.offlineBlocked) { delete el.dataset.offlineBlocked; el.disabled = el.dataset.wasDisabled === '1'; delete el.dataset.wasDisabled; el.removeAttribute('aria-disabled'); if (original.title == null) el.removeAttribute('title'); else el.title = original.title; }
    };
    host.events.on('connection:changed', apply); apply();
  }

  return {
    connection, readiness, fix, gate, isNetworkError, probe,
    reason: offlineReason,
    /** 'device' | 'network' | 'internet': where the connected provider is, so a provider on this device is not called a problem offline. */
    providerPlace: () => providerPlace(host.endpoint?.()),
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    /** The page saw a request finish (ok) or fail (err): a network failure counts toward "offline", a reply from a server counts toward "online". */
    noteRequest(ok, err) { if (ok) connection.reportSuccess(); else if (isNetworkError(err)) connection.reportFailure(); },
  };
}
