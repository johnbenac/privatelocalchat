// Whether the app can reach the internet right now, as the person should be told it. Pure: the browser is passed in.
//
// host:
//   isOnline()              the browser's own hint (navigator.onLine). A hint only: it is true behind a dead Wi-Fi and a captive portal.
//   listen(name, fn)        add a listener for 'online' / 'offline' on the window; returns a function that removes it.
//   setTimer(fn, ms) / clearTimer(id)   timers (fake ones in tests).
//   onChange(info)          called with { state, previous, reason, since } on every change of state.
//   settleMs (1500)         how long the browser must keep saying "offline" before we believe it (a flicker is not news).
//   backMs (4000)           how long "back" (just reconnected) is shown before it becomes plain "online".
//   failuresToOffline (2)   network failures in a row, with no success between, that mean "offline" even when the browser says online.
//
// States: 'online' | 'offline' | 'back'. `reason` is 'browser' (the device says so) or 'unreachable' (requests keep failing).
// The page reports what it sees with reportFailure() / reportSuccess() (a fetch that failed for network reasons, one that worked), which is
// how a dead connection is noticed when the browser still says online.

export function createConnection(host) {
  const settleMs = host.settleMs ?? 1500, backMs = host.backMs ?? 4000, failuresToOffline = host.failuresToOffline ?? 2;
  let state = host.isOnline() ? 'online' : 'offline', reason = state === 'offline' ? 'browser' : null, since = Date.now?.() ?? 0;
  let failures = 0, settleTimer = null, backTimer = null;

  function set(next, why) {
    if (next === state && why === reason) return;
    const previous = state;
    state = next; reason = next === 'offline' ? why : null; since = Date.now?.() ?? since;
    host.onChange?.({ state, previous, reason, since });
  }
  const clear = id => { if (id != null) host.clearTimer(id); return null; };

  const offHandlers = [
    host.listen('offline', () => {
      settleTimer = clear(settleTimer);
      settleTimer = host.setTimer(() => { settleTimer = null; if (!host.isOnline()) { backTimer = clear(backTimer); set('offline', 'browser'); } }, settleMs);
    }),
    host.listen('online', () => {
      settleTimer = clear(settleTimer);
      failures = 0;
      if (state === 'offline') goBack(); // the browser says it is back: show "back online", and let the next request confirm it
    }),
  ];

  function goBack() {
    set('back');
    backTimer = clear(backTimer);
    backTimer = host.setTimer(() => { backTimer = null; if (state === 'back') set('online'); }, backMs);
  }

  return {
    get state() { return state; },
    get reason() { return reason; },
    get since() { return since; },
    get online() { return state !== 'offline'; },
    /** A request failed because the network did (not because the server said no). `definitive`: a direct check of reachability, believed at once. */
    reportFailure({ definitive = false } = {}) {
      failures += 1;
      if (state !== 'offline' && (definitive || failures >= failuresToOffline || !host.isOnline())) { backTimer = clear(backTimer); set('offline', host.isOnline() ? 'unreachable' : 'browser'); }
    },
    /** A request reached its server. */
    reportSuccess() {
      failures = 0;
      if (state === 'offline' && host.isOnline()) goBack();
    },
    dispose() { for (const off of offHandlers) off?.(); settleTimer = clear(settleTimer); backTimer = clear(backTimer); },
  };
}

// The one sentence for something that needs the internet, so every control says the same thing. `what` is a short noun phrase.
const REASONS = {
  download: 'Downloading needs a connection. It will carry on when you are back online.',
  'voice-download': 'Downloading a voice needs a connection. Your current voice still works.',
  provider: 'This provider needs a connection. Your on-device model still works offline.',
  refresh: 'Refreshing the model list needs a connection.',
  matching: 'The matching model is downloaded once and needs a connection the first time.',
  'provider-device': 'Your provider runs on this device, so it can still answer offline.',
  'provider-network': 'Your provider is on your own network. It answers offline only while that network is up.',
  unreachable: 'Could not reach the provider. Check its address and your connection, then retry.',
};
export function offlineReason(kind) { return REASONS[kind] || 'This needs a connection.'; }
export const OFFLINE_REASON_KINDS = Object.keys(REASONS);

/** Where a connected provider's address points: 'device' (this computer: localhost, 127.x, ::1), 'network' (a private or .local address) or 'internet'. */
export function providerPlace(endpoint) {
  let host;
  try { host = new URL(String(endpoint || '')).hostname.toLowerCase().replace(/^\[|\]$/g, ''); } catch { return 'internet'; }
  if (!host) return 'internet';
  if (host === 'localhost' || host.endsWith('.localhost') || host === '::1' || /^127\./.test(host)) return 'device';
  if (host.endsWith('.local') || /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || /^(fc|fd)[0-9a-f]{2}:/.test(host) || /^169\.254\./.test(host)) return 'network';
  return 'internet';
}
