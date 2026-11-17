// Pure helpers for a provider endpoint: the models URL, the chat completions / responses / messages URLs, and the model ids in a models response.
// `base` is what a relative endpoint resolves against (the page address).

function toUrl(endpoint, base) {
  try { return new URL(endpoint); } catch { return new URL(endpoint, base); }
}

/** The URL that lists models: .../v1 -> .../v1/models. An endpoint already ending in /models is kept. Query and hash are dropped. */
export function deriveModelsUrl(endpoint, base = 'http://localhost/') {
  const url = toUrl(endpoint, base);
  const segments = url.pathname.split('/').filter(Boolean);
  url.search = ''; url.hash = '';
  if (segments[segments.length - 1] === 'models') return url.toString();
  let versionIndex = -1;
  for (let i = segments.length - 1; i >= 0; i--) if (/^v\d+$/i.test(segments[i])) { versionIndex = i; break; }
  const baseSegments = versionIndex !== -1 ? segments.slice(0, versionIndex + 1) : segments;
  url.pathname = '/' + [...baseSegments, 'models'].join('/');
  return url.toString();
}

/** The chat completions URL: one /chat/completions segment at the end, other segments kept, query and hash dropped. */
export function deriveChatCompletionsUrl(endpoint, base = 'http://localhost/') {
  const url = toUrl(endpoint, base);
  const segments = url.pathname.split('/').filter(Boolean);
  url.search = ''; url.hash = '';
  if (['responses', 'messages'].includes(segments[segments.length - 1])) segments.pop(); // an address copied from another format's docs
  if (segments.length >= 2 && segments[segments.length - 2] === 'chat' && segments[segments.length - 1] === 'completions') return url.toString();
  const cleaned = [];
  for (let i = 0; i < segments.length; i += 1) {
    if (segments[i] === 'chat' && segments[i + 1] === 'completions') { i += 1; continue; }
    cleaned.push(segments[i]);
  }
  cleaned.push('chat', 'completions');
  url.pathname = '/' + cleaned.join('/');
  return url.toString();
}

const ACTIONS = [['chat', 'completions'], ['responses'], ['messages'], ['models']];
/** The URL of one API action ("responses", "messages"...) under an endpoint: whatever action the endpoint already ends with is replaced, other segments are kept, query and hash dropped. */
export function deriveActionUrl(endpoint, action, base = 'http://localhost/') {
  const url = toUrl(endpoint, base);
  let segments = url.pathname.split('/').filter(Boolean);
  url.search = ''; url.hash = '';
  for (const a of ACTIONS) {
    const tail = segments.slice(-a.length);
    if (tail.length === a.length && tail.every((v, i) => v === a[i])) { segments = segments.slice(0, -a.length); break; }
  }
  url.pathname = '/' + [...segments, ...action.split('/')].join('/');
  return url.toString();
}
/** The Responses API URL: .../v1 -> .../v1/responses */
export const deriveResponsesUrl = (endpoint, base) => deriveActionUrl(endpoint, 'responses', base);
/** The Anthropic Messages URL: .../v1 -> .../v1/messages */
export const deriveMessagesUrl = (endpoint, base) => deriveActionUrl(endpoint, 'messages', base);

/** The model ids in a models response ({ data: [...] }, { models: [...] }, strings or objects with id / name). */
export function parseModelIds(data, { stripPrefix = '' } = {}) {
  const raw = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : [];
  return raw
    .map(item => {
      if (typeof item === 'string') return item.trim();
      if (item && typeof item.id === 'string') return item.id.trim();
      if (item && typeof item.name === 'string') return item.name.trim();
      return '';
    })
    .map(id => (stripPrefix && id.startsWith(stripPrefix) ? id.slice(stripPrefix.length) : id))
    .filter(id => id.length > 0);
}
