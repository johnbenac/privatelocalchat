// Plain words for what a reviewed or saved character contains. Pure: no DOM. The review and the saved-character details draw only these strings and the
// package's own text (as text, never as markup). Nothing here names an internal task or owner, and nothing claims a feature works in chat that does not.

const CAPABILITIES = [
  ['lore', 'Background and lore', 'Authored background the character was written with.'],
  ['guidance', 'Writing guidance', 'Guidance and labelled examples about how the character speaks.'],
  ['prepared', 'Prepared interactions', 'Prepared states and offered replies.'],
  ['presentation', 'Appearance and presentation', 'How the author wants the character to look and be shown.'],
  ['media', 'Pictures, sound and media', 'Pictures, sound or other media the character comes with.'],
  ['evidence', 'Authored history and notes', 'Seeds and reports the author labelled by source.'],
  ['other', 'Other authored parts', 'Parts this version of the app does not know how to read.'],
];

/** One row per kind of authored content: saved or not in this package, and always whether chat can use it yet. */
export function describeCapabilities(capabilities) {
  const rows = [{ key: 'text', label: 'Name and instructions', present: true, state: 'ready', text: 'Ready to use: the name and the exact instructions shown below.' }];
  for (const [key, label, what] of CAPABILITIES) {
    const c = capabilities?.[key];
    if (!c?.present) { rows.push({ key, label, present: false, state: 'absent', text: 'Not in this package.' }); continue; }
    rows.push({ key, label, present: true, state: key === 'other' ? 'kept-unread' : 'saved', text: (key === 'other' ? 'Kept exactly as received; this version does not read it.' : 'Saved with the character and kept as received. Chat does not use it yet.') + ' ' + what, count: c.aspects?.length || 0 });
  }
  return rows;
}

const REASONS = [
  [/optional profile/i, 'an optional kind of character data, kept but not used'],
  [/optional aspect/i, 'an optional part, kept but not used'],
  [/bytes unavailable/i, 'its file was not supplied with the package'],
  [/dependency subject/i, 'something the character refers to, kept but not turned into a character'],
];
export function describeOmissions(omissions) {
  return (omissions || []).map((o) => ({ id: String(o.id), text: (REASONS.find(([re]) => re.test(String(o.reason)))?.[1]) || 'kept but not used' }));
}

const humanSize = (n) => (n >= 1024 ? (n / 1024).toFixed(1) + ' KB' : n + ' bytes');
const KIND = (type) => (type === 'text/plain' ? 'text' : type === 'image/png' ? 'picture (PNG)' : type === 'audio/wav' ? 'sound (WAV)' : String(type || 'unknown type'));
const STATUS = {
  'verified-inline': 'Came inside the package and was checked.',
  'verified-external': 'Came from a file you chose and was checked against the package.',
  missing: 'Not supplied.',
};

export function describeResource(resource) {
  const required = resource.required === true;
  const status = STATUS[resource.status] || 'Not available.';
  return {
    id: String(resource.id), kind: KIND(resource.mediaType), size: humanSize(resource.size), required,
    available: Boolean(resource.retained), status,
    line: String(resource.id) + ' · ' + KIND(resource.mediaType) + ' · ' + humanSize(resource.size) + ' · ' + (required ? 'needed' : 'optional') + ' · ' + status,
  };
}

import { reportAttribution, ATTRIBUTION_FIELDS } from '../context/attribution.mjs';
/** The author's claims about the design: shown as unverified source statements, never as who this local character is. */
export function describeSourceClaims(candidateLike) {
  const d = candidateLike.design || {}; const s = candidateLike.subject || {};
  const rows = [];
  if (s.label) rows.push(['Character in the package', s.label + (s.id ? ' (' + s.id + ')' : '')]);
  if (d.designId) rows.push(['Design named by the author', d.designId + (d.revision ? ' revision ' + d.revision : '')]);
  if (d.author) rows.push(['Author’s credit', d.author]);
  // Reported attribution: the handles exactly as supplied (never trimmed or rewritten); a blank one is shown as unnamed. None of it is verified (chat/context/attribution.mjs).
  for (const c of candidateLike.unverifiedSourceClaims || []) {
    const a = reportAttribution(c);
    const parts = ATTRIBUTION_FIELDS.filter((f) => a.fields[f].state !== 'absent').map((f) => f + ' ' + (a.fields[f].state === 'named' ? '“' + a.fields[f].value + '”' : '(unnamed)'));
    if (!parts.length && !a.audience.total) continue;
    if (a.audience.total) parts.push('for ' + (a.audience.named.length ? a.audience.named.map((h) => '“' + h + '”').join(', ') : 'nobody named') + (a.audience.blank ? ' and ' + a.audience.blank + ' unnamed' : ''));
    rows.push(['Report ' + c.entry, parts.join(' · ') + (a.usable ? '' : ' · not usable as a scoped report') + ' · as supplied, not verified']);
  }
  return rows;
}

/** What to tell a person about keeping the original files. Shown wherever saved characters are offered. */
export const BACKUP_LIMIT = 'Saved characters and their pictures, sounds and files are not included in protected backups yet. Keep the original package file and any resource files you were given.';
export const KEEP_PRIVATE = 'Nothing is applied to a chat, no model is started and nothing is sent anywhere.';
