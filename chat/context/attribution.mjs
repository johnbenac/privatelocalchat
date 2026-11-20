// How a REPORTED attribution handle (an evidence entry's individual, run, participant, source, occurrence, and its audience members) is judged when this app admits or shows it.
// Pure: no DOM, no storage, no clock. The producer's schema only says "a bounded non-empty string", so a handle of spaces passes it (T415 follow-up, docs/CONTEXT-COMPOSER.md).
//
//   handleState(value)        -> 'absent' | 'invalid' | 'blank' | 'named'
//   attributionLabel(value)   -> the handle EXACTLY as supplied, or '(unnamed)' for a blank one
//   reportAttribution(claim)  -> { fields, blank, usable, audience, authenticated: false }
//
// Rules: a named handle is NEVER trimmed, case-folded or rewritten (it is a portable identifier: what a lossless transport carries stays what the person sees and what is compared);
// whitespace is only used to JUDGE it, never to change it. A blank handle names nobody: it is shown as unnamed, can never be matched to a participant, and a report whose audience has
// only blank members is not scoped to anyone. Nothing here, named or not, is authenticated provenance: `authenticated` is always false.
const BLANK = /^[\p{White_Space}\p{Cf}\p{Cc}]*$/u;
export const ATTRIBUTION_FIELDS = Object.freeze(['individual', 'run', 'participant', 'source', 'occurrence']);

export function handleState(value) {
  if (value === undefined || value === null) return 'absent';
  if (typeof value !== 'string') return 'invalid';
  return BLANK.test(value) ? 'blank' : 'named';
}
export const attributionLabel = (value) => (handleState(value) === 'named' ? value : '(unnamed)');

/** What this app may say about the attribution of one evidence entry / unverified source claim. Never changes the claim. */
export function reportAttribution(claim) {
  const fields = {};
  const blank = [];
  for (const f of ATTRIBUTION_FIELDS) {
    const state = handleState(claim?.[f]);
    fields[f] = { state, value: state === 'named' ? claim[f] : null };
    if (state === 'blank' || state === 'invalid') blank.push(f);
  }
  const members = Array.isArray(claim?.audience) ? claim.audience : [];
  const states = members.map(handleState);
  const named = members.filter((_, i) => states[i] === 'named');
  const audienceBlank = states.filter((s) => s !== 'named').length;
  if (audienceBlank) blank.push('audience');
  return {
    fields, blank,
    audience: { named, blank: audienceBlank, total: members.length },
    // usable as a SCOPED report: nothing it names is blank and it names at least one audience member
    usable: blank.length === 0 && named.length > 0,
    authenticated: false,
  };
}
