// The API token for each endpoint, kept in session storage (gone when the tab closes). A token is saved for one exact destination
// (origin + path + query) and is never offered to another: that is the whole point of this module.
// createEndpointTokens({ storage, key, base, onSet }) returns { load, canonicalize, has, get, set, clear, reset }.
//
// storage: a Storage-like (getItem / setItem). key: the storage key. base: what relative endpoints resolve against.
// onSet(endpoint): called before a token is saved, so a pending transfer can notice it.

export function createEndpointTokens({ storage, key, base = 'http://localhost/', onSet = null } = {}) {
  let tokens = {};
  const own = k => Object.prototype.hasOwnProperty.call(tokens, k);

  function load() {
    try { tokens = JSON.parse(storage.getItem(key)) || {}; } catch (err) { console.warn('Failed to load endpoint tokens from storage:', err); tokens = {}; }
    if (typeof tokens !== 'object' || Array.isArray(tokens)) tokens = {};
  }
  function save() {
    try { storage.setItem(key, JSON.stringify(tokens)); } catch (err) { console.warn('Failed to persist endpoint tokens to storage:', err); }
  }

  /** The canonical destination of an endpoint, or '' when it is not a URL. A trailing /chat/completions is not part of it. */
  function canonicalize(value) {
    if (!value) return '';
    let url;
    try { url = new URL(value, base); } catch { return ''; }
    url.hash = '';
    url.pathname = url.pathname.replace(/\/+$/, '');
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length >= 2 && segments[segments.length - 2] === 'chat' && segments[segments.length - 1] === 'completions') {
      url.pathname = '/' + segments.slice(0, -2).join('/');
    }
    url.pathname = url.pathname.replace(/\/+$/, '');
    const path = url.pathname === '/' ? '' : url.pathname;
    return `${url.origin}${path}${url.search}`;
  }

  /** Is a token saved for this endpoint (even an empty one)? */
  const has = endpoint => { const k = canonicalize(endpoint); return Boolean(k) && own(k); };
  /** The token saved for exactly this destination, or ''. */
  const get = endpoint => { const k = canonicalize(endpoint); return k && own(k) ? tokens[k] || '' : ''; };
  function set(endpoint, token) {
    const k = canonicalize(endpoint); if (!k) return;
    if (onSet) onSet(endpoint);
    const t = (token || '').trim();
    if (!t) { if (own(k)) { delete tokens[k]; save(); } return; }
    tokens[k] = t; save();
  }
  function clear(endpoint) {
    const k = canonicalize(endpoint); if (!k) return;
    if (own(k)) { delete tokens[k]; save(); }
  }
  /** Forget every saved token in memory (the stored copy is removed by the caller clearing the storage key). */
  const reset = () => { tokens = {}; };

  return { load, canonicalize, has, get, set, clear, reset };
}
