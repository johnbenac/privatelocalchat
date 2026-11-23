// The resource budget (T1068): a MECHANISM, not a policy. It keeps the account of what is loaded on one page, refuses a load that would go over the page's limit, and says what a consumer's own policy could
// unload to make room. Nothing here unloads anything, ever: the person's own setting ("one model at a time") is the only policy, and a consumer that wants least-recently-used unloading builds it from
// `candidates` and turns it on from a person's setting. There is no automatic or predictive mode.
//
// A load REFUSES only against a MEASURED limit (basis "measured", or a consumer's own number stated with `measured: true`). Against a stated, observed or unmeasured limit the load is allowed and the answer carries an
// ADVISORY ({overLimit: true, numbers, basis}) that the consumer's own policy may show: a number nobody measured must not block an engine that is known to run on the very device it would refuse.
//
// The limit comes from PROFILES, which are data {id, match, limitBytes, basis, evidence}: a profile says what was MEASURED or only OBSERVED and where the numbers are written down. A device no profile matches gets a
// conservative default that says `measured: false`. Every Worker and engine counts: ask `reserve` for each one.

/** match: {os?, browser?, minMemoryGB?, maxMemoryGB?}; every stated field must hold; an unstated field matches anything. env: {os, browser, deviceMemoryGB} (any may be missing: a stated field then does not match). */
export function matchProfile(profile, env = {}) {
  const m = profile.match ?? {};
  if (m.os !== undefined && m.os !== env.os) return false;
  if (m.browser !== undefined && m.browser !== env.browser) return false;
  if (m.minMemoryGB !== undefined && !(Number(env.deviceMemoryGB) >= m.minMemoryGB)) return false;
  if (m.maxMemoryGB !== undefined && !(Number(env.deviceMemoryGB) <= m.maxMemoryGB)) return false;
  return true;
}

/** The conservative limit of a device nobody measured: a quarter of the memory it reports (capped at 1.5 GB), or 512 MB when it reports nothing. Always `measured: false`. */
export function unmeasuredLimit(env = {}) {
  const mem = Number(env.deviceMemoryGB);
  const limitBytes = Number.isFinite(mem) && mem > 0 ? Math.min(Math.round(mem * 1e9 * 0.25), 1.5e9) : 512e6;
  return { id: "unmeasured-default", limitBytes, measured: false, basis: "no measurement exists for this device class; a quarter of the reported memory (at most 1.5 GB), or 512 MB when none is reported", evidence: null };
}

export function chooseProfile(profiles, env) {
  const hit = (profiles ?? []).find((p) => matchProfile(p, env));
  return hit ? { id: hit.id, limitBytes: hit.limitBytes, measured: hit.basis === "measured", basis: hit.basis, evidence: hit.evidence ?? null, measuredOn: hit.measuredOn ?? null } : unmeasuredLimit(env);
}

/**
 * options: {profiles, env} or {limitBytes} (a consumer's own number, `measured: false` unless it says `measured: true`).
 * reserve(id, {steadyBytes, peakBytes?, group?}) -> {ok: true, usedBytes, limitBytes, advisory?} | {ok: false, reason: "memory-over-budget", numbers, candidates}
 *   `advisory` ({overLimit: true, numbers, basis, candidates}) appears when the load is over a limit that is NOT measured: it is allowed and recorded.
 *   the check is: what the OTHERS hold in steady state + this one's PEAK (the transient while it loads) must fit; what is recorded afterwards is this one's steady figure.
 */
export function createBudget({ profiles = [], env = {}, limitBytes = null, measured = false } = {}) {
  const chosen = limitBytes !== null ? { id: "consumer", limitBytes, measured, basis: measured ? "measured" : "stated by the consumer", evidence: null } : chooseProfile(profiles, env);
  const held = new Map();   // id -> {steadyBytes, group}
  const used = (except = null) => [...held].reduce((n, [id, h]) => n + (id === except ? 0 : h.steadyBytes), 0);
  return {
    limit: () => ({ ...chosen }),
    reserve(id, { steadyBytes, peakBytes = steadyBytes, group = "default" } = {}) {
      if (!Number.isFinite(steadyBytes) || steadyBytes < 0) throw new TypeError(`reserve ${id}: steadyBytes must be a number of bytes (declare the engine's need, 0 is a statement too)`);
      const others = used(id); const need = others + Math.max(peakBytes, steadyBytes);
      if (need > chosen.limitBytes) {
        const candidates = [...held].filter(([k]) => k !== id).map(([k, h]) => ({ engineId: k, steadyBytes: h.steadyBytes, group: h.group })).sort((a, b) => b.steadyBytes - a.steadyBytes);
        const numbers = { requestedSteadyBytes: steadyBytes, requestedPeakBytes: Math.max(peakBytes, steadyBytes), heldBytes: others, limitBytes: chosen.limitBytes, overByBytes: need - chosen.limitBytes, limitMeasured: chosen.measured, profile: chosen.id };
        if (chosen.measured) return { ok: false, reason: "memory-over-budget", numbers, candidates };
        held.set(id, { steadyBytes, group });
        return { ok: true, usedBytes: used(), limitBytes: chosen.limitBytes, advisory: { overLimit: true, numbers, basis: chosen.basis, candidates } };
      }
      held.set(id, { steadyBytes, group });
      return { ok: true, usedBytes: used(), limitBytes: chosen.limitBytes };
    },
    release(id) { return held.delete(id); },
    snapshot: () => ({ limit: { ...chosen }, usedBytes: used(), engines: [...held].map(([id, h]) => ({ engineId: id, ...h })).sort((a, b) => (a.engineId < b.engineId ? -1 : 1)) })
  };
}
