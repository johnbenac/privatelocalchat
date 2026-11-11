// The files a person saves outside the browser, and what a build does with a file from another version (docs/FILE-COMPATIBILITY.md).
//
// Every file this app writes names its format as `name/N` and the build that wrote it. A build reads every format any earlier build wrote, for good, and refuses a file from a
// newer format whole, with a plain message and nothing changed.
//
//   plc-history/1            the chat history file (chat-history.json): { format, exportedAt, app, threads }. Before this it was a bare list; both are read.
//   plc-backup/1             a full backup: chats, projects, memory, presets, preferences, optionally documents. It travels inside the encrypted backup.
//   plc-encrypted-backup/1   a passphrase-encrypted envelope around a plc-backup (chat/crypto.mjs)
//   plc-settings-transfer/2  the provider settings file or link (chat/transfer/settings-transfer.mjs)
//
// `first` is the lowest number that was ever written (1 when not given). Raise `current` only together with a reader for the old number, a fixture saved by the build that wrote it (scripts/file-snapshot.mjs), and the rule in the docs.
export const FILE_FORMATS = Object.freeze({
  "plc-history": Object.freeze({ current: 1, label: "chat history file" }),
  "plc-backup": Object.freeze({ current: 1, label: "backup" }),
  "plc-encrypted-backup": Object.freeze({ current: 1, label: "encrypted backup" }),
  "plc-settings-transfer": Object.freeze({ current: 2, first: 2, label: "settings file or link" }) // /1 was never written: earlier links and files are the legacy forms the reader also takes
});

const NAME = /^(plc-[a-z-]+)\/(\d+)$/;

/** "plc-backup/1" -> { name: "plc-backup", n: 1 }, or null when it is not a format name of this app. */
export function parseFormat(text) {
  const m = typeof text === "string" ? NAME.exec(text) : null;
  return m ? { name: m[1], n: Number(m[2]) } : null;
}

/**
 * What a parsed file says about its own format.
 *   none     it names no format (a bare list, a foreign export, an old settings file): the caller's own checks decide
 *   current  the number this build writes
 *   older    an earlier number of a known format: a reader for it must exist
 *   newer    a number this build does not know: refuse the file whole
 *   unknown  a format name this build has never had
 */
export function checkFormat(data) {
  const f = data && typeof data === "object" && !Array.isArray(data) ? parseFormat(data.format) : null;
  if (!f) return { state: "none" };
  const known = FILE_FORMATS[f.name];
  if (!known) return { state: "unknown", ...f };
  return { state: f.n === known.current ? "current" : f.n < known.current ? "older" : "newer", ...f, label: known.label };
}

/** The same sentence for every kind of file: what happened, that nothing changed, and what to do. */
export const newerMessage = (label) =>
  `This ${label} was made by a newer version of Private Local Chat than this one, so it cannot be read here. Nothing was changed. Update the app (reload the page, or upgrade your copy) and try again.`;

/** Throws the plain message when the file comes from a newer format. Call it before any other judgement of the file. */
export function refuseIfNewer(data) {
  const c = checkFormat(data);
  if (c.state === "newer") throw Object.assign(new Error(newerMessage(c.label)), { code: "newer-format", format: c.name, version: c.n });
  return c;
}

/** The chat history file as written today. Builds before it read `{ threads }`, so they still read a file made by this one. */
export function buildHistoryFile(threads, { app = null, now = Date.now() } = {}) {
  return { format: `plc-history/${FILE_FORMATS["plc-history"].current}`, exportedAt: now, app: { version: app?.version ?? null, commit: app?.commit ?? null }, threads };
}
