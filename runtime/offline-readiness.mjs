// "Is this device ready to be used with no connection?", as a checklist a person can read. Pure: it only turns facts the app already has
// into items; the page and Settings decide how they look. (Offline plan 2.2.)
//
// facts (anything missing or null means "not known"):
//   app:       'current' (the saved copy is this version) | 'stale' (an update is saved, reload to use it) | 'none' (nothing saved yet)
//              | 'unsupported' (this browser cannot save the app)
//   runtime:   { saved, expected } number of model runtime files saved / expected, or null when the chat model is not an on-device one
//   mode:      'local' | 'api'
//   model:     { name, downloaded, loaded } the chosen on-device chat model, or null
//   voice:     { name, system, downloaded } the voice reading answers aloud
//   matching:  { needed, downloaded } the small matching model for search and Roberta; needed=false when nothing will ask for it
//   storage:   { free } bytes this browser will still let the site save, or null when not known; model.bytes is what the chosen model still has to download
//   private:   { state: 'likely' | 'possible' | 'no' } a guess whether this window is private or restricted (chat/connection/private-mode.mjs)
//   opfs:      false when the browser would not open its file storage (a model may not be kept), true or null otherwise
//   persisted: true | false | null  whether the browser promised not to delete the saved data
//   standalone: true when opened from the home screen
//
// Each item: { id, label, state: 'ready' | 'partial' | 'missing' | 'unknown' | 'na', detail, fix } where fix is the action that would
// make it ready ('reload' | 'save-runtime' | 'download-model' | 'download-voice' | 'download-matching' | 'persist') or null.
// The summary is 'ready' | 'almost' | 'not-ready' | 'api' and `text` is the one line shown above the list.

/** The names of the lines, one place, so the Help page can be checked against them. */
export const ITEM_LABELS = Object.freeze({ window: 'This window', app: 'The app', model: 'Chat model', runtime: 'What runs the model', voice: 'Voice', matching: 'Matching model', storage: 'Keeping it' });
const item = (id, label, state, detail, fix = null) => ({ id, label, state, detail, fix });

export function offlineReadiness(f = {}) {
  const items = [];

  // Is this window private? Said first: nothing below can be kept for offline use there
  if (f.private?.state === 'likely') items.push(item('window', ITEM_LABELS.window, 'missing', 'This looks like a private window. Nothing is kept for offline use there, and a downloaded model is lost when you close it. Open the site in a normal Safari tab (not Private).'));
  else if (f.private?.state === 'possible') items.push(item('window', ITEM_LABELS.window, 'partial', 'This window may be private or restricted, and then nothing is kept for offline use. If you did not choose that, try a normal tab.'));

  // The app itself
  if (f.app === 'unsupported') items.push(item('app', ITEM_LABELS.app, 'missing', 'This browser window cannot keep the app for offline use. Private Browsing and Lockdown Mode turn that off: open the site in a normal Safari tab (not private), and add it to your Home Screen.'));
  else if (f.app === 'current') items.push(item('app', ITEM_LABELS.app, 'ready', 'Saved on this device.'));
  else if (f.app === 'stale') items.push(item('app', ITEM_LABELS.app, 'partial', 'A newer version is saved. Reload once while online to use it.', 'reload'));
  else if (f.app === 'none') items.push(item('app', ITEM_LABELS.app, 'missing', 'Not saved yet. Keep this page open while online for a moment.', 'reload'));
  else items.push(item('app', ITEM_LABELS.app, 'unknown', 'Checking…'));

  // The chat model and what runs it
  if (f.mode === 'api') {
    items.push(item('model', ITEM_LABELS.model, 'na', 'You are using a connected provider. It needs a connection; an on-device model does not.'));
  } else if (!f.model) {
    items.push(item('model', ITEM_LABELS.model, 'unknown', 'Checking…'));
  } else if (!f.model.downloaded) {
    const need = f.model.bytes, free = f.storage?.free;
    if (need > 0 && free != null && free < need * 1.05) {
      const gb = n => (n / 1e9).toFixed(1) + ' GB';
      items.push(item('model', ITEM_LABELS.model, 'missing', (f.model.name || 'The model') + ' needs ' + gb(need) + ', but this browser will only let this site save about ' + gb(Math.max(0, free)) + ' more. It may not fit on this device: try a smaller model in Settings > Models, or use a connected provider.'));
    } else items.push(item('model', ITEM_LABELS.model, 'missing', (f.model.name || 'The model') + ' is not downloaded yet.', 'download-model'));
  } else {
    items.push(item('model', ITEM_LABELS.model, 'ready', (f.model.name || 'The model') + ' is saved on this device.'));
    if (f.runtime && f.runtime.expected > 0) {
      const { saved, expected } = f.runtime;
      if (saved >= expected) items.push(item('runtime', ITEM_LABELS.runtime, 'ready', 'Saved on this device.'));
      else if (saved > 0) items.push(item('runtime', ITEM_LABELS.runtime, 'partial', 'Some of it is saved (' + saved + ' of ' + expected + ' files).', 'save-runtime'));
      else items.push(item('runtime', ITEM_LABELS.runtime, 'missing', 'Not saved yet. It is saved the first time the model runs, or now.', 'save-runtime'));
    }
  }

  // The voice
  if (f.voice) {
    if (f.voice.system) items.push(item('voice', ITEM_LABELS.voice, 'ready', 'Your device’s own voice works offline.'));
    else if (f.voice.downloaded) items.push(item('voice', ITEM_LABELS.voice, 'ready', (f.voice.name || 'The voice') + ' is saved on this device.'));
    else items.push(item('voice', ITEM_LABELS.voice, 'missing', (f.voice.name || 'The chosen voice') + ' is not downloaded yet.', 'download-voice'));
  }

  // The matching model (search and the phone-menu robot): optional, so it never makes the device "not ready" on its own
  if (f.matching?.needed) {
    items.push(f.matching.downloaded
      ? item('matching', ITEM_LABELS.matching, 'ready', 'Saved. Search by meaning works offline.')
      : item('matching', ITEM_LABELS.matching, 'partial', 'Not downloaded. Search still finds exact words offline.', 'download-matching'));
  }

  // Will the browser keep it
  if (f.opfs === false && f.persisted !== true) items.push(item('storage', ITEM_LABELS.storage, 'partial', 'This browser window would not open its file storage, so a saved model may be lost when you close Safari. A normal tab (not Private Browsing) keeps it.'));
  else if (f.persisted === true) items.push(item('storage', ITEM_LABELS.storage, 'ready', 'The browser has promised to keep this data.'));
  else if (f.persisted === false) items.push(item('storage', ITEM_LABELS.storage, 'partial', 'The browser may delete saved models when it needs space.', 'persist'));

  const needed = items.filter(i => i.id !== 'matching' && i.id !== 'storage' && i.id !== 'window');
  const blocking = needed.filter(i => i.state === 'missing');
  const partial = needed.filter(i => i.state === 'partial');
  const unknown = needed.filter(i => i.state === 'unknown');
  let summary, text;
  if (f.private?.state === 'likely') { summary = 'not-ready'; text = 'This looks like a private window, so nothing is kept for offline use. Open the site in a normal Safari tab (not Private).'; }
  else if (f.mode === 'api') { summary = 'api'; text = 'You are using a connected provider, which needs a connection. Switch to an on-device model to chat offline.'; }
  else if (blocking.length) { summary = 'not-ready'; text = 'Not ready for offline use yet: ' + blocking.map(i => i.label.toLowerCase()).join(' and ') + ' still to save.'; }
  else if (partial.length || unknown.length) { summary = 'almost'; text = unknown.length && !partial.length ? 'Checking whether this device is ready for offline use…' : 'Almost ready: ' + partial.map(i => i.label.toLowerCase()).join(' and ') + ' needs one more step.'; }
  else { summary = 'ready'; text = 'Ready for offline use. Chatting with your downloaded model needs no connection.'; }
  return { summary, text, items };
}

/** The one thing worth saying the first time a model is ready to answer: it works offline, or what is left to do. Null when nothing needs saying. */
export function offlineHint(result) {
  if (!result || result.summary === 'api') return null;
  if (result.items?.some((i) => i.id === 'window' && i.state === 'missing')) return { kind: 'private', text: 'This looks like a private window: nothing is kept for offline use. Open the site in a normal Safari tab (not Private) to use it offline.' };
  if (result.summary === 'ready') return { kind: 'ready', text: 'Your model is ready for offline use. You can chat without a connection.' };
  if (result.summary === 'not-ready' || result.summary === 'almost') return { kind: 'todo', text: 'One more step before this works offline: open Settings, Models, Ready for offline use.' };
  return null;
}

/** Safari on iPhone and iPad may delete a site's saved data when the site is unused for a while, unless the app is on the Home Screen. Said once, only when it matters. */
export function installHint(facts) {
  if (!facts?.ios || facts.standalone || !facts.model?.downloaded) return null;
  return { kind: 'install', text: 'To keep your saved model, add this app to your Home Screen (Share, then Add to Home Screen). Safari can delete saved data from sites that are not on it.' };
}

/** An update was saved while the app was open: say it once; the chats are kept. */
export function updateHint(facts) {
  return facts?.app === 'stale' ? { kind: 'update', text: 'A newer version of the app is ready. Reload when it suits you; your chats are kept.' } : null;
}
