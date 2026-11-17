// How long a toast stays up. Pure. A toast that vanishes before it can be read is worse than none, so the time follows the length of the message (about 70 ms a
// character, after 2.5 s to notice it), never less than the time the caller asked for, and a toast with a button gets a little longer. The page pauses the clock
// while the person touches the toast or the tab is hidden (the timer keeps `remaining`, see page-chrome.mjs).

export const TOAST_MIN_MS = 4000;
export const TOAST_MAX_MS = 25000;

export function toastDuration(message, requested = 0, { hasAction = false } = {}) {
  const chars = String(message ?? '').trim().length;
  const reading = 2500 + chars * 70 + (hasAction ? 2500 : 0);
  return Math.min(TOAST_MAX_MS, Math.max(TOAST_MIN_MS, Number(requested) || 0, reading));
}

/** A clock that can be paused: start(ms, fn), pause(), resume(), stop(). Times are injected so it can be tested. */
export function createPausableTimer({ now = () => Date.now(), setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (id) => clearTimeout(id) } = {}) {
  let id = null, remaining = 0, startedAt = 0, fn = null, paused = false;
  const fire = () => { id = null; const f = fn; fn = null; remaining = 0; f && f(); };
  return {
    start(ms, callback) { this.stop(); fn = callback; remaining = ms; paused = false; startedAt = now(); id = setTimer(fire, ms); },
    pause() { if (id === null || paused) return; clearTimer(id); id = null; remaining = Math.max(0, remaining - (now() - startedAt)); paused = true; },
    resume() { if (!paused || !fn) return; paused = false; startedAt = now(); id = setTimer(fire, remaining); },
    stop() { if (id !== null) clearTimer(id); id = null; fn = null; remaining = 0; paused = false; },
    get remaining() { return paused || id === null ? remaining : Math.max(0, remaining - (now() - startedAt)); },
    get active() { return fn !== null; },
  };
}
