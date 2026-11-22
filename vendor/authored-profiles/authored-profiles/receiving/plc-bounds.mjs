// Private Local Chat's provisional size bounds for a preset (T465-c producer compatibility, not acceptance of the receiving implementation).
import {problem} from '../authored-util.mjs';

export const PLC_PROVISIONAL_LIMITS = Object.freeze({name:120,prompt:8000,id:200,
  fileBytes:32768,fragmentChars:12288,fragmentEnvelopeChars:12544});

export function plcBounds(value, route) {
  if (!value) return [];
  const limits = PLC_PROVISIONAL_LIMITS;
  const serialized = JSON.stringify(value);
  const bytes = new TextEncoder().encode(serialized).length;
  // Unpadded base64url has ceil(4*n/3) ASCII code units. The receiver measures
  // the envelope without '#'; our canonical fragment has only the 'preset=' key.
  const encodedChars = Math.ceil(bytes * 4 / 3);
  return Object.keys(value).some(k => !['id','name','prompt'].includes(k)) ||
    ['id','name','prompt'].some(k => typeof value[k] !== 'string' || value[k].length > limits[k]) ||
    bytes > limits.fileBytes || (route === 'fragment' &&
      (encodedChars > limits.fragmentChars || encodedChars + 'preset='.length > limits.fragmentEnvelopeChars)) ?
    [problem('plc-provisional-bounds', '',
      `Candidate exceeds provisional T465-c ${route} bounds; no truncation.`)] : [];
}

/** The PLC target: projects with the given plain-preset projector and applies the bounds before any receiver callback, so incompatible projections stay atomic. */
export function plcTarget({projectPLCPreset, consumed}) {
  return {
    consumed, routes: ['file', 'fragment'],
    project(view, {subjectId, presetId, validate, route}) {
      const projected = projectPLCPreset(view.document, view.registry, {subjectId, presetId});
      const bounds = plcBounds(projected.value, route);
      if (bounds.length) return {bounds};
      if (validate && projected.value) {
        const checked = projectPLCPreset(view.document, view.registry, {subjectId, presetId, validate});
        projected.value = checked.value; projected.report = checked.report;
      }
      return projected;
    }
  };
}
