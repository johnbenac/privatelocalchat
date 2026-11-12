// What the vault does with each browser storage key. This table is the code twin of docs/evidence/encryption/storage-inventory.json (tests/storage-inventory.test.mjs
// fails if they differ). user, setting and transient keys are kept in the vault when it is on; plain, test and device keys stay in the browser's own storage.
// `format` is the highest format of that key's value this version reads and writes (docs/DATA-COMPATIBILITY.md). A key named ...vN has format N.

export const KEY_CLASSES = Object.freeze({
  "chatThreads": { store: "local", class: "user", format: 1 },
  "plc.activeThread.v1": { store: "local", class: "user", format: 1 },
  "plc.drafts.v1": { store: "local", class: "user", format: 1 },
  "plc.prefs.v1": { store: "local", class: "setting", format: 1 },
  "plc.folders.v1": { store: "local", class: "user", format: 1 },
  "plc.presets.v1": { store: "local", class: "user", format: 1 },
  "plc.memory.v1": { store: "local", class: "user", format: 1 },
  "plc.modelMemory.v1": { store: "local", class: "setting", format: 1 },
  "plc.voice.v2": { store: "local", class: "setting", format: 2 },
  "plc.voice.v1": { store: "local", class: "setting", format: 1 },
  "plc.inferenceMode.v1": { store: "local", class: "setting", format: 1 },
  "plc.models.v1": { store: "local", class: "setting", format: 1 },
  "plc.shell.pins.v1": { store: "local", class: "user", format: 1 },
  "plc.shell.collapsed": { store: "local", class: "plain", format: 1 },
  "plc.downloadIntent.v1": { store: "local", class: "plain", format: 1 },
  "plc.offlineHint.v1": { store: "local", class: "plain", format: 1 },
  "plc.lockSplash.v1": { store: "local", class: "plain", format: 1 },
  "plc.modelSourceNotice.v1": { store: "local", class: "plain", format: 1 },
  "plc.lock.v1": { store: "local", class: "plain", format: 1 },
  "plc.speechInputUnusable": { store: "local", class: "plain", format: 1 },
  "plc.test.voice": { store: "local", class: "test", format: 1 },
  "chatConfig": { store: "session", class: "user", format: 1 },
  "chatModels": { store: "session", class: "setting", format: 1 },
  "chatEndpointTokens": { store: "session", class: "user", format: 1 },
  "plc.draft": { store: "session", class: "transient", format: 1 },
  "plc.pendingToken.v1": { store: "session", class: "transient", format: 1 },
  "plc.update.tried": { store: "session", class: "plain", format: 1 },
  "promoDismissed": { store: "session", class: "plain", format: 1 },
  "plc.vault.v1": { store: "local", class: "plain", format: 1 },
  "plc.theme.v1": { store: "local", class: "plain", format: 1 },
  "plc.formats.v1": { store: "local", class: "plain", format: 1 },
});

export const VAULTED_CLASSES = Object.freeze(["user", "setting", "transient"]);
export const classOf = (key) => KEY_CLASSES[key]?.class || "unknown";
export const isVaulted = (key) => VAULTED_CLASSES.includes(classOf(key));
export const vaultedKeys = (store) => Object.entries(KEY_CLASSES).filter(([, v]) => v.store === store && VAULTED_CLASSES.includes(v.class)).map(([k]) => k);
