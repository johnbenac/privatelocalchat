// The page's event list: the named points where one feature lets the others take part. A feature adds a listener with events.on(name, fn); the chat core (and any
// feature) fires an event by name. Asking for a name that is not in the list below is an error, so a typo fails at once instead of doing nothing.
//
//   name              how it fires    arguments             what it is for
//   thread:selected   emit            (thread)              a conversation was shown: stop speech, close the canvas, refresh the presets
//   send:before       emit            ()                    a message is being sent, before the composer is read and cleared (dictation stops here)
//   send:intercept    intercept       (text, thread)        answer a message without the model; a listener returns true when it handled it (slash commands)
//   prompt:ready      emitAwait       (message)             a user message before it is kept or edited: tools rewrite it, the voice call marks it
//   context:collect   collect         (thread, view)        add to what the model is told: each returns { preamble?, attachmentText?, sources? }
//   reply:start       emit            (thread, message)     a reply began
//   reply:text        emit            (thread, fullText)    the reply so far (the voice call speaks it while it is written)
//   reply:end         emit            (thread, message)     the reply finished, stopped or failed
//   vault:unlocked    emit            (info)                the encrypted vault was turned on or opened: { fresh }
//   vault:locked      emit            (info)                the vault was locked or turned off: { off? }
//   vault:write-failed emit           (info)                a change could not be stored in the vault: { message }
//   connection:changed emit           (info)                the app went offline, came back, or is online again: { state: online|offline|back, previous, reason, since }
//
// emit: runs every listener in order and never lets one listener's error stop the others (it is logged). emitAwait / collect / intercept wait for each listener in turn
// and let errors through, because the caller depends on their answers.

export const EVENT_NAMES = Object.freeze(["thread:selected", "send:before", "send:intercept", "prompt:ready", "context:collect", "reply:start", "reply:text", "reply:end", "connection:changed", "vault:unlocked", "vault:locked", "vault:write-failed"]);

export function createEvents(names = EVENT_NAMES) {
  const listeners = new Map(names.map((n) => [n, []]));
  const known = (name) => { if (!listeners.has(name)) throw new Error("unknown event: " + name + " (events: " + [...listeners.keys()].join(", ") + ")"); return listeners.get(name); };
  return {
    names: [...listeners.keys()],
    /** Listen to an event. Returns a function that stops listening. */
    on(name, fn) {
      const list = known(name); list.push(fn);
      return () => { const i = list.indexOf(fn); if (i >= 0) list.splice(i, 1); };
    },
    emit(name, ...args) {
      for (const fn of [...known(name)]) { try { fn(...args); } catch (error) { console.error("event " + name + ": a listener failed", error); } }
    },
    async emitAwait(name, ...args) { for (const fn of [...known(name)]) await fn(...args); },
    /** Every listener's answer, in order. */
    async collect(name, ...args) { const out = []; for (const fn of [...known(name)]) out.push(await fn(...args)); return out; },
    /** True as soon as one listener says it handled the thing (later listeners are not asked). */
    async intercept(name, ...args) { for (const fn of [...known(name)]) { if (await fn(...args)) return true; } return false; }
  };
}
