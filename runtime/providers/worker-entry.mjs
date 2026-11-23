// The Worker entry as a function, so a consumer that registers its own engines needs no copy of it:
//
//   // my-host.worker.mjs
//   import { createEngineRegistry, defaultRegistry } from "./registry.mjs";
//   import { startHostWorker } from "./worker-entry.mjs";
//   startHostWorker(defaultRegistry().register("my-engine", {...}));
//
// It keeps what host.worker.mjs has always done: it takes an exclusive Web Lock on a random name for the Worker's whole life (every
// client requests the same name, and the browser releases a dead Worker's lock, which is how a crash that raises no event is detected),
// it buffers messages that arrive before the lock is held and replays them, and it handles `connect-port` so each mind worker gets its own port.
import { createHost } from "./host-core.mjs";

// providerId and lockPrefix default to the values the package's own Worker entry has always used (kept so that entry is unchanged); a consumer passes its own.
export function startHostWorker(registry, { providerId = "cfp-model-host", lockPrefix = "cfp-model-host-", scope = globalThis, hooks = {}, diagnostics } = {}) {
  const { adapters, storage } = registry.hostOptions();
  const randomName = typeof scope.crypto?.randomUUID === "function" ? scope.crypto.randomUUID() : `${Math.random().toString(36).slice(2)}${Date.now()}`;
  const lockName = `${lockPrefix}${randomName}`;
  const hasLocks = typeof scope.navigator !== "undefined" && !!scope.navigator?.locks?.request;
  const host = createHost({ providerId, livenessLock: hasLocks ? lockName : null, adapters, storage, hooks, ...(diagnostics === undefined ? {} : { diagnostics }) });

  // Messages that arrive before the lock is held are buffered, then replayed, so a client that talks early is never dropped.
  let attached = false; const early = [];
  const route = (e) => {
    if (e.data?.op === "connect-port" && e.ports?.[0]) { host.attach(e.ports[0]); return; }
    scope.__directHandler(e);
  };
  scope.onmessage = (e) => { if (!attached) early.push(e); else route(e); };
  const start = () => {
    host.attach(scope);                       // sets onmessage to the direct handler and announces `ready`
    scope.__directHandler = scope.onmessage;
    scope.onmessage = route;
    attached = true;
    for (const e of early.splice(0)) route(e);
  };
  if (hasLocks) {
    // Granted at once (nobody else uses this random name); the callback's promise never settles, so the lock lives as long as the Worker.
    scope.navigator.locks.request(lockName, { mode: "exclusive" }, () => { start(); return new Promise(() => {}); });
  } else {
    start();
  }
  return host;
}
